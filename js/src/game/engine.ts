/**
 * 游戏核心引擎：实体生成、固定步长推进、移动、圆形碰撞结算（吞噬 / 受伤）、
 * 进化切换、捕获与环绕卫星。所有函数就地修改传入的 GameState。
 *
 * 世界坐标 1 单位 = 屏幕 1 像素：玩家居中（相机），实体以绝对坐标存储，
 * 半径 r 既是绘制半径也是碰撞半径。绘制与碰撞天然一致，无「缩放 / 视觉半径」折算。
 */

import type { Entity, GameState, InputState } from "../store/game";
import {
  STAGES,
  FINAL_MATTER,
  TRANSFORM_TOTAL,
  DT,
  PLAYER_SPEED,
  SPAWN_GAP_MIN,
  SPAWN_GAP_MAX,
  despawnDist,
  SPAWN_INTERVAL,
  blindZoneMin,
  blindZoneMax,
  BLIND_ZONE_SPEED_MIN,
  BLIND_ZONE_SPEED_MAX,
  CAPTURE_RANGE,
  TARGET_ENTITIES,
  DAMAGE,
  MAX_HEALTH,
  HIT_FLASH_FRAMES,
  EXPLOSION_METEORS,
  DEBRIS_SPEED_MIN,
  DEBRIS_SPEED_MAX,
  EFFECT_LIFE,
  BIG_PER_MINUTE,
  BIG_WINDOW,
  MATTER_FLOOR,
  MATTER_CAP,
  GROWTH,
  GROWTH_CAP,
  ORBIT_SPEED,
  getScreenW,
  getScreenH,
} from "./config";

const rand = (min: number, max: number): number =>
  min + Math.random() * (max - min);

function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

/** 在 (x, y) 添加一个扩散圆环特效（多特效时丢弃最旧的，防堆积）。 */
function addExplosion(
  state: GameState,
  x: number,
  y: number,
  radius: number,
  color: string,
): void {
  state.effects.push({
    id: state.nextEntityId++,
    x,
    y,
    age: 0,
    life: EFFECT_LIFE,
    maxR: Math.max(30, radius * 1.9),
    color,
  });
  if (state.effects.length > 24) {
    state.effects.splice(0, state.effects.length - 24);
  }
}

/** 撞击毁伤的天体：爆炸特效 + 崩解成 10 颗陨石沿径向飞溅。
 * 玩家「自己撞大的」同样调用此函数，效果一致。 */
function shatter(
  state: GameState,
  x: number,
  y: number,
  radius: number,
  color: string,
): void {
  addExplosion(state, x, y, radius, color);
  for (let i = 0; i < EXPLOSION_METEORS; i++) {
    const a = (i / EXPLOSION_METEORS) * Math.PI * 2 + Math.random() * 0.6;
    const spd = rand(DEBRIS_SPEED_MIN, DEBRIS_SPEED_MAX);
    state.entities.push({
      id: state.nextEntityId++,
      x: x + Math.cos(a) * radius * 0.5,
      y: y + Math.sin(a) * radius * 0.5,
      vx: Math.cos(a) * spd,
      vy: Math.sin(a) * spd,
      radius: STAGES[0].r * rand(0.5, 0.8),
      power: 0,
      matterValue: Math.max(MATTER_FLOOR, Math.round(radius * 0.3)),
      isSatellite: false,
    });
  }
}

/** 创建新游戏状态：零陨石开局（玩家独自，场上无自由天体；
 * 首颗陨石在 SPAWN_INTERVAL 后经盲区生成，须主动寻找）。 */
export function createGame(
  screenW: number = 360,
  screenH: number = 640,
): GameState {
  const state: GameState = {
    status: "playing",
    player: {
      id: 0,
      x: screenW / 2,
      y: screenH / 2,
      vx: 0,
      vy: 0,
      radius: STAGES[0].r,
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
    bigSpawnTimes: [],
    nextSpawnAt: SPAWN_INTERVAL,
    nextEntityId: 1,
    hitFlash: 0,
    blockFlash: 0,
    effects: [],
    transform: false,
    transformT: 0,
  };
  // 不再在 createGame 中填充初始天体。
  // 第一批盲区天体将在 SPAWN_INTERVAL 后由 step() 的时间闸门触发，高速漂入。
  return state;
}

/**
 * 在玩家周围随机生成一颗自由天体。
 * 等级分布相对玩家当前等级：约一半明显更低（可吞噬），一小半同级，一小部分明显更高（需躲避）。
 * 同级再分两类：约半数真实半径比玩家小（可吞噬），约半数与玩家相当/更大（不可吞噬，撞击掉血）。
 * 生成距离以「屏幕像素间隙」衡量，避免真实半径巨大的高阶天体被生成在极远处而瞬间回收。
 * @param placement 'near'=屏幕边缘附近（进化引导等用）；'blind'=盲区环带（屏幕外，向内漂移入屏）。
 */
export function spawnEntity(
  state: GameState,
  placement: "near" | "blind" = "near",
): void {
  const pr = state.stageIndex;
  const p = state.player;
  const r = Math.random();

  let category: "small" | "mid" | "big";
  if (r < 0.5) category = "small";
  else if (r < 0.85) category = "mid";
  else category = "big";

  // 限速：滚动窗口内「明显更大」天体已达上限 → 降级为可吞噬的小天体。
  if (category === "big") {
    state.bigSpawnTimes = state.bigSpawnTimes.filter(
      (t) => state.time - t <= BIG_WINDOW,
    );
    if (state.bigSpawnTimes.length >= BIG_PER_MINUTE) {
      category = "small";
    }
  }

  let power: number;
  let radius: number;
  if (category === "small") {
    // 多数：明显低于玩家 → 可被吞噬。
    power = Math.max(0, pr - 1 - Math.floor(Math.random() * 2));
    radius = STAGES[power].r * rand(0.5, 0.85);
  } else if (category === "mid") {
    // 同级：半数比玩家小（可吞噬），半数与玩家相当/更大（不可吞噬）。
    power = pr;
    if (Math.random() < 0.5) {
      radius = p.radius * rand(0.5, 0.85); // < 玩家 → 可吞
    } else {
      radius = p.radius * rand(1.0, 1.25); // >= 玩家 → 不可吞
    }
  } else {
    // 少数：明显大于玩家两阶以上 → 需躲避（碰之即死）。
    power = Math.min(STAGES.length - 1, pr + 2 + Math.floor(Math.random() * 2));
    radius = STAGES[power].r;
    state.bigSpawnTimes.push(state.time);
  }
  radius = Math.max(1, radius);

  const matterValue = Math.max(
    MATTER_FLOOR,
    Math.min(MATTER_CAP, Math.round(radius * 0.6)),
  );
  const ang = Math.random() * Math.PI * 2;
  // 生成距离：near=双方半径+像素间隙（屏幕边缘附近）；blind=盲区环带（屏幕外）。
  const d =
    placement === "blind"
      ? rand(blindZoneMin(), blindZoneMax())
      : p.radius + radius + rand(SPAWN_GAP_MIN, SPAWN_GAP_MAX);
  // 速度：near=缓速随机漂移；blind=较高速向内入屏（否则从屏幕外飘入需 10~20 秒，画面显得死寂）。
  const sp =
    placement === "blind"
      ? rand(BLIND_ZONE_SPEED_MIN, BLIND_ZONE_SPEED_MAX)
      : rand(8, 20);
  // 速度方向：near=随机；blind=指向玩家，自然从屏幕边缘漂移入屏。
  const velAng =
    placement === "blind" ? ang + Math.PI : Math.random() * Math.PI * 2;

  state.entities.push({
    id: state.nextEntityId++,
    x: p.x + Math.cos(ang) * d,
    y: p.y + Math.sin(ang) * d,
    vx: Math.cos(velAng) * sp,
    vy: Math.sin(velAng) * sp,
    radius,
    power,
    matterValue,
    isSatellite: false,
  });
}

/** 保证玩家周围始终存在「下一等级」天体（进化链的直接目标）。不计入大天体限速。
 * 与常规生成一致走盲区放置：从屏幕外漂移入屏，不破坏「开局零陨石/须探索」的体验。 */
export function forceSpawnNext(state: GameState): void {
  const pr = state.stageIndex;
  if (pr >= STAGES.length - 1) return;
  const p = state.player;
  const power = pr + 1;
  const radius = STAGES[power].r;
  const matterValue = Math.max(
    MATTER_FLOOR,
    Math.min(MATTER_CAP, Math.round(radius * 0.6)),
  );
  const ang = Math.random() * Math.PI * 2;
  const d = rand(blindZoneMin(), blindZoneMax());
  // 与盲区常规生成一致，较高速指向玩家，快速入屏。
  const sp = rand(BLIND_ZONE_SPEED_MIN, BLIND_ZONE_SPEED_MAX);
  // 指向玩家，自然入屏。
  const sang = ang + Math.PI;
  state.entities.push({
    id: state.nextEntityId++,
    x: p.x + Math.cos(ang) * d,
    y: p.y + Math.sin(ang) * d,
    vx: Math.cos(sang) * sp,
    vy: Math.sin(sang) * sp,
    radius,
    power,
    matterValue,
    isSatellite: false,
  });
}

/** 吞噬：更低等级天体被移除，累加物质并回血，玩家尺寸微增。 */
function absorb(state: GameState, e: Entity): void {
  let gain = e.matterValue;
  // 中子星(L9) / 黑洞(L10) / 宇宙(L11) 吸收恒星及以下获得额外能量。
  if (state.stageIndex >= 8 && e.power <= 6) {
    gain += Math.round(e.matterValue * 0.5);
  }
  state.matter += gain;
  const base = STAGES[state.stageIndex].r;
  state.player.radius = Math.min(
    state.player.radius + GROWTH,
    base * GROWTH_CAP,
  );
  const heal = Math.min(state.maxHealth - state.health, 1);
  state.health = Math.min(state.maxHealth, state.health + heal);
  addExplosion(
    state,
    e.x,
    e.y,
    e.radius * 0.9,
    STAGES[e.power].color ?? "#9e9e9e",
  );
  e.removed = true;
}

/** 玩家与某天体的碰撞结算。
 * 规则：
 *  - 更高等级 → 玩家变成陨石被吸走（死亡动画）
 *  - 更低等级 → 敌方爆炸成10颗陨石，玩家吸收物质
 *  - 同类中真实半径明显更小者亦视为食物；
 *  - 同类中相当/更大者 → 撞击掉血且敌方死（卫星可抵挡） */
function resolveCollision(state: GameState, e: Entity): void {
  const p = state.player;
  const pr = state.stageIndex;
  const rr = p.radius + e.radius;
  if (dist(p.x, p.y, e.x, e.y) >= rr) return;

  // 更低等级：敌方爆炸成10颗陨石，玩家吸收物质。
  if (e.power < pr) {
    shatter(state, e.x, e.y, e.radius, STAGES[e.power].color ?? "#9e9e9e");
    absorb(state, e);
    return;
  }

  // 更高等级（明显更大的天体）：玩家变成陨石被吸走。
  if (e.power > pr) {
    // 玩家崩解成陨石（死亡效果）
    shatter(state, p.x, p.y, p.radius, STAGES[pr].color ?? "#9e9e9e");
    // 敌方也显示吸收效果
    addExplosion(
      state,
      e.x,
      e.y,
      e.radius * 1.2,
      STAGES[e.power].color ?? "#9e9e9e",
    );
    e.removed = true;
    state.health = 0;
    state.hitFlash = HIT_FLASH_FRAMES;
    state.status = "gameover";
    return;
  }

  // 同类：真实半径比玩家小 → 吞噬；与玩家相当/更大 → 撞击掉血且敌方崩解。
  if (e.radius < p.radius * 0.95) {
    shatter(state, e.x, e.y, e.radius, STAGES[e.power].color ?? "#9e9e9e");
    absorb(state, e);
    return;
  }
  const canShield = state.stageIndex >= 3 && state.satellites.length > 0;
  if (canShield) {
    state.satellites.splice(0, 1);
    state.blockFlash = HIT_FLASH_FRAMES;
  } else {
    state.health -= DAMAGE;
    state.hitFlash = HIT_FLASH_FRAMES;
  }
  shatter(state, e.x, e.y, e.radius, STAGES[e.power].color ?? "#9e9e9e");
  e.removed = true;
  if (state.health <= 0) {
    state.health = 0;
    state.status = "gameover";
    // 玩家被撞毁，自己同样崩解成陨石（效果一致）。
    shatter(state, p.x, p.y, p.radius, STAGES[pr].color ?? "#9e9e9e");
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
    if (d <= p.radius + e.radius + CAPTURE_RANGE && d < bestD) {
      bestD = d;
      bestIdx = i;
    }
  }
  if (bestIdx < 0) return;
  const e = state.entities[bestIdx];
  state.entities.splice(bestIdx, 1);
  e.isSatellite = true;
  e.angle = Math.random() * Math.PI * 2;
  // 轨道半径随玩家半径缩放（低等级用固定内移量），保证卫星始终环绕在玩家外侧。
  e.orbitRadius = p.radius * (1.4 + 0.25 * state.satellites.length);
  state.satellites.push(e);
}

/** 调试：直接提升一个等级（进化到下一阶段），并补满血量，便于快速预览各阶段体型。 */
export function forceLevelUp(state: GameState): void {
  if (state.stageIndex >= STAGES.length - 1) return;
  state.stageIndex++;
  state.player.radius = STAGES[state.stageIndex].r;
  state.player.power = state.stageIndex;
  state.health = state.maxHealth;
  state.matter = STAGES[state.stageIndex].reachMatter;
}

/** 推进一帧。input 为当前摇杆输入，dt 为步长（秒）。 */
export function step(
  state: GameState,
  input: InputState,
  dt: number = DT,
): void {
  // 宇宙结局转场：冻结玩法，仅推进时间线；结束时置 win（见文末）。
  if (state.transform) {
    state.time += dt;
    state.transformT += dt;
    if (state.transformT >= TRANSFORM_TOTAL) {
      state.status = "win";
    }
    return;
  }

  state.time += dt;
  if (state.hitFlash > 0) state.hitFlash--;
  if (state.blockFlash > 0) state.blockFlash--;

  // 爆炸特效老化（任何状态都推进，保证死亡后扩散动画放完）。
  for (const fx of state.effects) fx.age += dt;
  state.effects = state.effects.filter((fx) => fx.age < fx.life);

  // 非进行中（死亡/胜利定格后）：仅让崩解碎屑继续飞散，不结算玩法。
  if (state.status !== "playing") {
    for (const e of state.entities) {
      e.x += e.vx * dt;
      e.y += e.vy * dt;
    }
    for (const s of state.satellites) {
      s.angle = (s.angle ?? 0) + ORBIT_SPEED * dt;
    }
    state.entities = state.entities.filter(
      (e) => dist(state.player.x, state.player.y, e.x, e.y) <= despawnDist(),
    );
    return;
  }

  // 玩家移动：摇杆方向（归一化）× 强度 → 速度（屏幕恒定速度）。
  const speed = PLAYER_SPEED;
  const mag = Math.hypot(input.dx, input.dy);
  if (mag > 1 && input.intensity > 0) {
    const vx = (input.dx / mag) * speed * input.intensity;
    const vy = (input.dy / mag) * speed * input.intensity;
    const nx = state.player.x + vx * dt;
    const ny = state.player.y + vy * dt;
    // 边界限制：星球整体不滑出屏幕，贴近边缘即被边缘「挡住」。
    // 玩家中心限制在 [r, W-r]（半径极大时取对称中点，避免下界超过上界）。
    const r = state.player.radius;
    const W = getScreenW();
    const H = getScreenH();
    const loX = Math.min(r, W - r);
    const hiX = Math.max(r, W - r);
    const loY = Math.min(r, H - r);
    const hiY = Math.max(r, H - r);
    state.player.x = nx < loX ? loX : nx > hiX ? hiX : nx;
    state.player.y = ny < loY ? loY : ny > hiY ? hiY : ny;
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

  // 回收过远天体（只减不补）。
  state.entities = state.entities.filter(
    (e) => dist(state.player.x, state.player.y, e.x, e.y) <= despawnDist(),
  );

  // 盲区定时生成：达到生成间隔时在盲区补 1 颗（上限约束）或开局填充，被吞噬/回收的天体
  // 不即时复活，玩家须移动探索寻找从屏幕外飘入的新陨石。
  // 开局填充：首帧即铺满 TARGET_ENTITIES(12) 颗于盲区，避免「零陨石+纯黑背景」整屏死寂，
  // 同时保持零陨石在玩家身边、须探索的核心体验；随后转为每秒 1 颗补充。
  if (state.time < SPAWN_INTERVAL && state.entities.length === 0) {
    while (state.entities.length < TARGET_ENTITIES) {
      spawnEntity(state, "blind");
    }
  }
  if (state.time >= state.nextSpawnAt) {
    if (state.entities.length < TARGET_ENTITIES) {
      spawnEntity(state, "blind");
    }
    state.nextSpawnAt = state.time + SPAWN_INTERVAL;
  }

  // 进化链保底：周围始终存在「下一等级」天体，确保可一路向上进化。
  if (
    state.stageIndex < STAGES.length - 1 &&
    !state.entities.some((e) => e.power === state.stageIndex + 1)
  ) {
    forceSpawnNext(state);
  }

  // 进化切换：累计物质跨越阈值则升级，半径重置为等级基础值。
  // 每次只进化一阶：进化后将物质重置为本阶阈值，丢弃溢出，避免一次吞噬连跨多阶。
  while (
    state.stageIndex < STAGES.length - 1 &&
    state.matter >= STAGES[state.stageIndex + 1].reachMatter
  ) {
    state.stageIndex++;
    state.player.radius = STAGES[state.stageIndex].r;
    state.player.power = state.stageIndex;
    state.matter = STAGES[state.stageIndex].reachMatter;
  }

  // 结局：宇宙且物质达到 5000 → 进入「团聚成蓝点 → 爆炸 → 化为宇宙」转场。
  // （转场期间由 step 顶部的 transform 冻结分支推进时间线，并在结束时置 win。）
  if (
    !state.transform &&
    state.stageIndex === STAGES.length - 1 &&
    state.matter >= FINAL_MATTER
  ) {
    state.transform = true;
    state.transformT = 0;
    // 转场期间冻结实体，不再结算。
    state.entities = [];
    state.satellites = [];
  }
}
