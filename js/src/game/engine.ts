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
  TRANSFORM_SUCK,
  TRANSFORM_SUCK_SPEED,
  TRANSFORM_SUCK_SHRINK,
  TRANSFORM_COLLAPSE,
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
  WORLD_RADIUS,
  getScreenW,
  getScreenH,
  BLACK_HOLE_STAGE,
  BLACKHOLE_GRAVITY_RATIO,
  BLACKHOLE_GRAVITY_PULL,
  BLACKHOLE_FALL_SPEED,
  BLACKHOLE_FALL_SHRINK,
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

/** 判定某自由天体是否为「可被黑洞引力吸入 / 吞噬」的目标（与碰撞同一套吞食规则）。 */
function edible(state: GameState, e: Entity): boolean {
  const p = state.player;
  if (e.isDebris) return true;
  if (e.power < state.stageIndex) return true;
  return e.power === state.stageIndex && e.radius < p.radius * 0.95;
}

/** 黑洞吸入开始：物质即时结算，但天体不立即消失——保留身形坠向中心并缩小，到达后移除。
 * 撞毁碎屑同样走此流程，保证黑洞阶段「东西到中心变小直到不见」的统一视觉。 */
function startFallIn(state: GameState, e: Entity): void {
  absorb(state, e, false);
  e.removed = false;
  e.fallingIn = true;
}

/** 撞击毁伤的天体：爆炸特效 + 崩解成 10 颗陨石飞溅。
 * 传入 towardX/towardY（玩家位置）时，碎屑朝该方向成扇形飞溅并被玩家吸入
 * （体现「吞噬掉陨石」）；不传则保持径向均匀飞散（如玩家自身死亡崩解）。 */
function shatter(
  state: GameState,
  x: number,
  y: number,
  radius: number,
  color: string,
  towardX?: number,
  towardY?: number,
): void {
  addExplosion(state, x, y, radius, color);
  const toward = towardX !== undefined && towardY !== undefined;
  const baseAng = toward ? Math.atan2(towardY - y, towardX - x) : 0;
  // 朝向玩家：出生在崩解心连玩家方向的「对侧」，使碎屑有可观的飞行路径被吸入。
  const backX = toward ? -Math.cos(baseAng) * radius * 0.6 : 0;
  const backY = toward ? -Math.sin(baseAng) * radius * 0.6 : 0;
  for (let i = 0; i < EXPLOSION_METEORS; i++) {
    let a: number;
    let spd: number;
    if (toward) {
      a = baseAng + (Math.random() * 2 - 1) * 0.95;
      spd = rand(DEBRIS_SPEED_MIN, DEBRIS_SPEED_MAX) * rand(1.1, 1.5);
    } else {
      a = (i / EXPLOSION_METEORS) * Math.PI * 2 + Math.random() * 0.6;
      spd = rand(DEBRIS_SPEED_MIN, DEBRIS_SPEED_MAX);
    }
    state.entities.push({
      id: state.nextEntityId++,
      x: x + backX + Math.cos(a) * radius * 0.3,
      y: y + backY + Math.sin(a) * radius * 0.3,
      vx: Math.cos(a) * spd,
      vy: Math.sin(a) * spd,
      radius: STAGES[0].r * rand(0.5, 0.8),
      power: 0,
      matterValue: Math.max(MATTER_FLOOR, Math.round(radius * 0.3)),
      isSatellite: false,
      isDebris: true,
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

/** 死亡续玩：保留已累计的物质与进化等级，清空场上天体/碎屑、回满血、重置时间，
 * 让玩家从当前等级重新开始苟存，避免「一死清空、永差一口气」的挫败（进化阈值基数大）。
 * 卫星一并清空（重新捕获）；玩家位置回到原点，半径/战力按当前等级重置。 */
export function revive(state: GameState): void {
  const stage = state.stageIndex;
  const matter = state.matter;
  const fresh = createGame(getScreenW(), getScreenH());
  Object.assign(state, fresh);
  state.stageIndex = stage;
  state.matter = matter;
  state.player.power = stage;
  state.player.radius = STAGES[stage].r;
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
    // 少数：明显大于玩家两阶以上 → 需躲避（碰之即死）。上限为黑洞（末位可游玩阶段），
    // 「宇宙」只属于结局、不会作为场上实体出现。
    power = Math.min(STAGES.length - 2, pr + 2 + Math.floor(Math.random() * 2));
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
  // 圆形宇宙：生成点不得越过世界圆环边界（贴近边缘时环带被截断）。
  const last = state.entities[state.entities.length - 1];
  const dd = Math.hypot(last.x, last.y);
  const maxD = Math.max(1, WORLD_RADIUS - last.radius);
  if (dd > maxD) {
    const s = maxD / dd;
    last.x *= s;
    last.y *= s;
  }
}

/** 保证玩家周围始终存在「下一等级」天体（进化链的直接目标）。不计入大天体限速。
 * 与常规生成一致走盲区放置：从屏幕外漂移入屏，不破坏「开局零陨石/须探索」的体验。
 * 「宇宙」是结局而非可游玩阶段：L10（黑洞）不再保底生成它。 */
export function forceSpawnNext(state: GameState): void {
  const pr = state.stageIndex;
  if (pr >= STAGES.length - 2) return;
  const p = state.player;
  const power = pr + 1;
  const radius = STAGES[power].r;
  const matterValue = Math.max(
    MATTER_FLOOR,
    Math.min(MATTER_CAP, Math.round(radius * 0.6)),
  );
  const ang = Math.random() * Math.PI * 2;
  // 大体积下一级天体（黑洞 / 宇宙）在盲区环带里距屏幕太远、几乎不可见，会被误以为「没出现」。
  // 就近放到视野边缘并指向玩家加速入屏；早期小体积天体维持盲区放置，保留须探索的节奏。
  const d =
    radius >= 80
      ? p.radius + radius + rand(SPAWN_GAP_MIN, SPAWN_GAP_MAX)
      : rand(blindZoneMin(), blindZoneMax());
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
  // 圆形宇宙：生成点不得越过世界圆环边界。
  const last = state.entities[state.entities.length - 1];
  const dd = Math.hypot(last.x, last.y);
  const maxD = Math.max(1, WORLD_RADIUS - last.radius);
  if (dd > maxD) {
    const s = maxD / dd;
    last.x *= s;
    last.y *= s;
  }
}

/** 吞噬：更低等级天体被移除，累加物质并回血，玩家尺寸微增。 */
function absorb(state: GameState, e: Entity, ring: boolean = true): void {
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
  // 黑洞吸入模式下不追加爆炸圆环（由吸积颗粒替代）。
  if (ring) {
    addExplosion(
      state,
      e.x,
      e.y,
      e.radius * 0.9,
      STAGES[e.power].color ?? "#9e9e9e",
    );
  }
  e.removed = true;
}

/** 吞噬结算：更低等级 / 更小的天体被吞入。
 * 黑洞及以后：天体不变立即消失——转为坠向洞心、缩小到不见的吸入动画（startFallIn）；
 * 普通阶段保持爆炸 + 崩解碎屑。 */
function swallow(state: GameState, e: Entity): void {
  const color = STAGES[e.power].color ?? "#9e9e9e";
  const blackHole = state.stageIndex >= BLACK_HOLE_STAGE;
  if (blackHole) {
    startFallIn(state, e);
  } else {
    shatter(state, e.x, e.y, e.radius, color, state.player.x, state.player.y);
    absorb(state, e, true);
  }
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

  // 崩解碎屑：直接吸收为物质，不再二次崩解，防止链式递归爆内存。
  // 黑洞阶段碎屑同样坠入洞心缩小消失（与其他吞噬一致的视觉效果）。
  if (e.isDebris) {
    if (state.stageIndex >= BLACK_HOLE_STAGE) {
      startFallIn(state, e);
    } else {
      absorb(state, e, true);
    }
    return;
  }

  // 更低等级：敌方爆炸成10颗陨石，玩家吸收物质。
  if (e.power < pr) {
    swallow(state, e);
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
    swallow(state, e);
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
  shatter(
    state,
    e.x,
    e.y,
    e.radius,
    STAGES[e.power].color ?? "#9e9e9e",
    p.x,
    p.y,
  );
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
  // 宇宙结局转场：冻结玩法，按叙事推进时间线；结束时置 win（见文末）。
  if (state.transform) {
    state.time += dt;
    state.transformT += dt;
    const p = state.player;
    // 阶段一：场上所有物质被吸入黑洞体内——坠向洞心、缩小至消失。
    if (state.transformT < TRANSFORM_SUCK) {
      for (const e of state.entities) {
        const dx = p.x - e.x;
        const dy = p.y - e.y;
        const d = Math.max(1, Math.hypot(dx, dy));
        e.x += (dx / d) * TRANSFORM_SUCK_SPEED * dt;
        e.y += (dy / d) * TRANSFORM_SUCK_SPEED * dt;
        e.radius = Math.max(0.4, e.radius * (1 - TRANSFORM_SUCK_SHRINK * dt));
        if (d <= 3) e.removed = true;
      }
      state.entities = state.entities.filter((e) => !e.removed);
    } else if (state.transformT < TRANSFORM_COLLAPSE) {
      // 阶段二：物质吸尽，黑洞坍缩成一个小蓝点（渲染层叠加深蓝的蓝点覆盖坍缩过程）。
      state.entities = [];
      const q =
        (state.transformT - TRANSFORM_SUCK) /
        (TRANSFORM_COLLAPSE - TRANSFORM_SUCK);
      p.radius = Math.max(3, p.radius * (1 - q));
    }
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
    state.player.x += vx * dt;
    state.player.y += vy * dt;
    // 圆形宇宙边界：玩家被夹在世界圆环内（大半径玩家也不例外），向圆心方向回退。
    const pd = Math.hypot(state.player.x, state.player.y);
    const maxPd = WORLD_RADIUS - state.player.radius;
    if (pd > maxPd) {
      const s = maxPd / pd;
      state.player.x *= s;
      state.player.y *= s;
    }
  }

  // 黑洞引力范围：视界外、范围内、且可被吞食的天体持续被加速拉向黑洞中心（越近越强）。
  // 直奔致死的大天体不被牵引，避免黑洞把「宇宙」之类拉进来自杀。
  if (state.stageIndex >= BLACK_HOLE_STAGE) {
    const p = state.player;
    const gr = p.radius * BLACKHOLE_GRAVITY_RATIO;
    for (const e of state.entities) {
      if (e.removed || e.fallingIn) continue;
      if (!edible(state, e)) continue;
      const d = dist(p.x, p.y, e.x, e.y);
      if (d <= 0 || d >= gr) continue;
      const pull = BLACKHOLE_GRAVITY_PULL * (1 - d / gr);
      e.vx += ((p.x - e.x) / d) * pull * dt;
      e.vy += ((p.y - e.y) / d) * pull * dt;
    }
  }

  // 自由天体漂移；黑洞吸入中的天体坠向洞心并缩小，到中心后移除。
  for (const e of state.entities) {
    if (e.fallingIn) {
      const p = state.player;
      const dx = p.x - e.x;
      const dy = p.y - e.y;
      const d = Math.max(1, Math.hypot(dx, dy));
      e.x += (dx / d) * BLACKHOLE_FALL_SPEED * dt;
      e.y += (dy / d) * BLACKHOLE_FALL_SPEED * dt;
      e.radius = Math.max(0.4, e.radius * (1 - BLACKHOLE_FALL_SHRINK * dt));
      if (d <= 3 || e.radius <= 0.4) e.removed = true;
      continue;
    }
    e.x += e.vx * dt;
    e.y += e.vy * dt;
  }

  // 环绕卫星更新轨道角。
  for (const s of state.satellites) {
    s.angle = (s.angle ?? 0) + ORBIT_SPEED * dt;
  }

  // 碰撞结算（迭代快照：崩解产生的碎屑在下帧才参与，避免边遍历边扩数组）。
  const snapshot = state.entities.slice();
  for (const e of snapshot) {
    if (e.removed || e.fallingIn) continue;
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
    // 结局叙事以「黑洞」呈现：把玩家定型为黑洞体（吸积洞身），随后的吸入/坍缩动画
    // 都以该形态演出；卫星并入场上物质，一并被吸入黑洞。
    const p = state.player;
    p.power = BLACK_HOLE_STAGE;
    p.radius = STAGES[BLACK_HOLE_STAGE].r;
    for (const s of state.satellites) {
      s.isSatellite = false;
      s.angle = undefined;
      s.orbitRadius = undefined;
      state.entities.push(s);
    }
    state.satellites = [];
  }
}
