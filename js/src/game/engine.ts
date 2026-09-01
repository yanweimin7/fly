/**
 * 游戏核心引擎：实体生成、固定步长推进、移动、圆形碰撞结算（吞噬 / 受伤）、
 * 进化切换、捕获与环绕卫星。所有函数就地修改传入的 GameState。
 */

import type { Entity, GameState, InputState, Party } from "../store/game";
import {
  STAGES,
  TARGET_ENTITIES,
  INITIAL_ENTITIES,
  SPAWN_INTERVAL,
  INITIAL_DIST_MIN,
  INITIAL_DIST_MAX,
  SPAWN_DIST_MIN,
  SPAWN_DIST_MAX,
  DESPAWN_DIST,
  DAMAGE,
  MAX_HEALTH,
  HIT_FLASH_FRAMES,
  ORBIT_SPEED,
  CAPTURE_RANGE,
  DT,
  PLAYER_SPEED_BASE,
  ENDING_CONVERGE_S,
  ENDING_BLUE_S,
  ENDING_BANG_S,
  BANG_PARTICLES,
} from "./config";

const rand = (min: number, max: number): number =>
  min + Math.random() * (max - min);

function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

/** 三次缓入缓出（用于动画插值）。 */
function easeIO(x: number): number {
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

/** 生成一颗爆炸扩散粒子。 */
function makeParty(): Party {
  return {
    angle: Math.random() * Math.PI * 2,
    speed: rand(120, 360),
    radius: rand(2, 5),
    color: Math.random() < 0.7 ? "#40c4ff" : "#b3e5fc",
  };
}

/** 推进宇宙创生结局动画（status === "win" 且正在播放）。 */
function advanceEnding(state: GameState, dt: number): void {
  const e = state.ending!;
  e.t += dt / durationOf(e.phase);
  if (e.t > 1) e.t = 1;

  switch (e.phase) {
    case "converge": {
      // 所有天体 / 卫星向玩家中心（原点）聚拢并缩小，玩家随之膨胀。
      const k = easeIO(e.t);
      const mergeAll: Entity[] = [...state.entities, ...state.satellites];
      const base = STAGES[state.stageIndex].radius;
      state.player.radius = base * (1 + 0.4 * k);
      for (const b of mergeAll) {
        b.x *= 1 - k;
        b.y *= 1 - k;
        b.radius *= 1 - k;
      }
      if (e.t >= 1) {
        state.entities = [];
        state.satellites = [];
        state.player.radius = 10;
        state.ending = { phase: "blue", t: 0 };
      }
      break;
    }
    case "blue": {
      state.player.radius = 10;
      if (e.t >= 1) {
        const particles: Party[] = [];
        for (let i = 0; i < BANG_PARTICLES; i++) particles.push(makeParty());
        state.ending = { phase: "bang", t: 0, particles };
      }
      break;
    }
    case "bang": {
      // 粒子随 t 向外扩散（位置在渲染层依据 t 计算），半径渐隐。
      if (e.t >= 1) {
        state.ending = { phase: "done", t: 1 };
      }
      break;
    }
    case "done":
      break;
  }
}

function durationOf(phase: string): number {
  switch (phase) {
    case "converge":
      return ENDING_CONVERGE_S;
    case "blue":
      return ENDING_BLUE_S;
    case "bang":
      return ENDING_BANG_S;
    default:
      return 1;
  }
}

/** 创建一个新游戏状态（玩家为陨石，生成初始天体）。 */
export function createGame(): GameState {
  const state: GameState = {
    status: "playing",
    player: {
      id: 0,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      radius: STAGES[0].radius,
      power: 0,
      matterValue: 0,
      isSatellite: false,
    },
    entities: [],
    satellites: [],
    matter: 0,
    stageIndex: 0,
    health: MAX_HEALTH,
    maxHealth: MAX_HEALTH,
    time: 0,
    nextEntityId: 1,
    hitFlash: 0,
    blockFlash: 0,
    spawnTimer: 0,
  };
  while (state.entities.length < INITIAL_ENTITIES) {
    spawnEntity(state, true);
  }
  return state;
}

/** 生成一颗自由天体。initial=true 时用于开局场（同样落在可视范围之外）。天体静止悬停。 */
export function spawnEntity(state: GameState, initial = false): void {
  const p = state.stageIndex;
  const r = Math.random();
  let power: number;
  if (r < 0.6) {
    power = Math.max(0, Math.floor(Math.random() * p));
  } else if (r < 0.85) {
    power = p;
  } else {
    power = Math.min(STAGES.length - 1, p + 1 + Math.floor(Math.random() * 2));
  }

  const baseR = STAGES[power].radius;
  let radius: number;
  if (power < p) {
    radius = baseR * (0.5 + Math.random() * 0.8);
  } else if (power === p) {
    radius = baseR * (0.8 + Math.random() * 1.4);
  } else {
    radius = baseR * (1.0 + Math.random() * 1.0);
  }
  radius = Math.max(6, radius);

  const matterValue = Math.max(1, Math.round(radius * 0.6));

  // 生成位置采样：开局与补位天体都落在可视范围之外——玩家开局只身一人，
  // 世界是一张固定的散布星图，靠探索去发现，不会在身边/视野里"冒出来"。
  const samplePos = (): [number, number] => {
    const ang = Math.random() * Math.PI * 2;
    const a = initial ? INITIAL_DIST_MIN : SPAWN_DIST_MIN;
    const b = initial ? INITIAL_DIST_MAX : SPAWN_DIST_MAX;
    const d = rand(a, b);
    return [
      state.player.x + Math.cos(ang) * d,
      state.player.y + Math.sin(ang) * d,
    ];
  };

  // 重复采样直到不与其他天体 / 玩家重叠（带少量间距），保证星体真正离散。
  let [x, y] = samplePos();
  for (let g = 0; g < 24; g++) {
    let overlap = false;
    if (
      dist(x, y, state.player.x, state.player.y) <
      radius + state.player.radius + 12
    ) {
      overlap = true;
    } else {
      for (const other of state.entities) {
        if (dist(x, y, other.x, other.y) < radius + other.radius + 10) {
          overlap = true;
          break;
        }
      }
    }
    if (!overlap) break;
    [x, y] = samplePos();
  }

  const e: Entity = {
    id: state.nextEntityId++,
    x,
    y,
    vx: 0,
    vy: 0,
    radius,
    power,
    matterValue,
    isSatellite: false,
  };
  state.entities.push(e);
}

/** 吞噬：更小天体被移除，累加物质，玩家尺寸微增。 */
function absorb(state: GameState, e: Entity): void {
  let gain = e.matterValue;
  // 中子星(L10, index 9) / 黑洞(L11, index 10) 吸收恒星及以下获得额外能量。
  if (state.stageIndex >= 9 && e.power <= 6) {
    gain += Math.round(e.matterValue * 0.5);
  }
  state.matter += gain;
  const base = STAGES[state.stageIndex].radius;
  state.player.radius = Math.min(state.player.radius + 0.04, base * 1.25);
  e.removed = true;
}

/** 受伤：更大天体撞击。L4+ 且有卫星时以卫星抵挡（碎裂），否则扣血。 */
function impact(state: GameState, e: Entity): void {
  const canShield = state.stageIndex >= 3 && state.satellites.length > 0;
  if (canShield) {
    const shatter = Math.min(
      state.satellites.length,
      1 + (e.power - state.stageIndex),
    );
    // 碎裂最靠近撞击方向的卫星。
    const px = state.player.x;
    const py = state.player.y;
    state.satellites.sort((a, b) => {
      const ax = px + Math.cos(a.angle ?? 0) * (a.orbitRadius ?? 0);
      const ay = py + Math.sin(a.angle ?? 0) * (a.orbitRadius ?? 0);
      const bx = px + Math.cos(b.angle ?? 0) * (b.orbitRadius ?? 0);
      const by = py + Math.sin(b.angle ?? 0) * (b.orbitRadius ?? 0);
      return dist(ax, ay, e.x, e.y) - dist(bx, by, e.x, e.y);
    });
    state.satellites.splice(0, shatter);
    state.blockFlash = HIT_FLASH_FRAMES;
  } else {
    state.health -= DAMAGE;
    state.hitFlash = HIT_FLASH_FRAMES;
    if (state.health <= 0) {
      state.health = 0;
      state.status = "gameover";
    }
  }
  e.removed = true;
}

/** 玩家与某天体的碰撞结算。 */
function resolveCollision(state: GameState, e: Entity): void {
  const p = state.player;
  if (dist(p.x, p.y, e.x, e.y) >= p.radius + e.radius) return;

  const pr = state.stageIndex;
  if (e.power < pr) {
    absorb(state, e);
    return;
  }
  if (e.power > pr) {
    impact(state, e);
    return;
  }
  // 同等级：按半径细分。
  if (e.radius < p.radius * 0.95) {
    absorb(state, e);
  } else if (e.radius > p.radius * 1.05) {
    impact(state, e);
  }
}

/** 捕获：将捕获半径内最近的行星变为环绕卫星。仅 L4+ 可用。 */
export function tryCapture(state: GameState): void {
  if (!STAGES[state.stageIndex].canCapture) return;
  const p = state.player;
  let bestIdx = -1;
  let bestD = Infinity;
  for (let i = 0; i < state.entities.length; i++) {
    const e = state.entities[i];
    const d = dist(p.x, p.y, e.x, e.y);
    if (d <= p.radius + CAPTURE_RANGE && d < bestD) {
      bestD = d;
      bestIdx = i;
    }
  }
  if (bestIdx < 0) return;
  const e = state.entities[bestIdx];
  state.entities.splice(bestIdx, 1);
  e.isSatellite = true;
  e.angle = Math.random() * Math.PI * 2;
  e.orbitRadius = p.radius + 26 + state.satellites.length * 16;
  state.satellites.push(e);
}

/** 推进一帧。input 为当前摇杆输入，dt 为步长（秒）。 */
export function step(
  state: GameState,
  input: InputState,
  dt: number = DT,
): void {
  // 结局动画进行中：只推进动画，不再处理输入 / 战斗。
  if (state.ending) {
    advanceEnding(state, dt);
    return;
  }
  if (state.status !== "playing") return;
  state.time += dt;
  if (state.hitFlash > 0) state.hitFlash--;
  if (state.blockFlash > 0) state.blockFlash--;

  // 玩家移动：摇杆向量 × 强度 → 速度。
  const speed = PLAYER_SPEED_BASE * (1 - 0.03 * state.stageIndex);
  const mag = Math.hypot(input.dx, input.dy);
  if (mag > 1 && input.intensity > 0) {
    const vx = (input.dx / mag) * speed * input.intensity;
    const vy = (input.dy / mag) * speed * input.intensity;
    state.player.x += vx * dt;
    state.player.y += vy * dt;
  }

  // 自由天体漂移。
  for (const e of state.entities) {
    e.x += e.vx * dt;
    e.y += e.vy * dt;
  }

  // 环绕卫星更新轨道角。
  for (const s of state.satellites) {
    s.angle = (s.angle ?? 0) + ORBIT_SPEED * dt;
  }

  // 碰撞结算。
  for (const e of state.entities) {
    if (e.removed) continue;
    resolveCollision(state, e);
  }

  // 移除被吞噬 / 撞击消耗的天体。
  state.entities = state.entities.filter((e) => !e.removed);

  // 回收过远天体。
  state.entities = state.entities.filter(
    (e) => dist(state.player.x, state.player.y, e.x, e.y) <= DESPAWN_DIST,
  );

  // 渐进补足：按 SPAWN_INTERVAL 每间隔生成一颗，直到目标数量——补给连续但不一次性铺满。
  state.spawnTimer += dt;
  while (
    state.spawnTimer >= SPAWN_INTERVAL &&
    state.entities.length < TARGET_ENTITIES
  ) {
    spawnEntity(state, false);
    state.spawnTimer -= SPAWN_INTERVAL;
  }

  // 进化切换：累计物质跨越阈值则升级，半径重置为等级基础值。
  while (
    state.stageIndex < STAGES.length - 1 &&
    state.matter >= STAGES[state.stageIndex + 1].reachMatter
  ) {
    state.stageIndex++;
    state.player.radius = STAGES[state.stageIndex].radius;
  }

  // 结局：进化成最终阶段「宇宙」(L12, index 11) 即触发宇宙创生动画（团聚→蓝点→
  // 爆炸成新宇宙），播毕后展示「另一个宇宙」。此即进化的终点。
  if (state.stageIndex === STAGES.length - 1) {
    state.status = "win";
    state.player.x = 0;
    state.player.y = 0;
    state.ending = { phase: "converge", t: 0 };
  }
}
