/**
 * 宇宙进化游戏 —— 可调参数与等级配置（游戏模型数据层）。
 * 仅依赖 fuickjs 现有导出能力，不修改框架层。
 *
 * 设计要点（与早期版本的「相机缩放 + 视觉半径 hack」彻底不同）：
 * 世界坐标 1 单位 = 屏幕 1 像素。每个天体的「屏幕半径」直接由所属等级决定
 * （见 STAGES[].r），因此绘制尺寸与碰撞尺寸天然一致 —— 你看到多大，碰撞就是多大，
 * 不会再出现「看着很远却被判定撞死」或「同级天体大小乱序」的问题。
 */

/** 单帧步长（秒）。TICK_RATE 帧/秒驱动固定步长游戏循环。 */
export const TICK_RATE = 30;
export const DT = 1 / TICK_RATE;

/** 默认虚拟视口尺寸（竖屏）—— 仅在 useMediaQuery 未就绪时回退使用。 */
export const VW = 360;
export const VH = 640;

/** 运行时真实屏幕尺寸（由 game.tsx 在 useMediaQuery 就绪后写入）。 */
let _screenW = VW;
let _screenH = VH;
export const setScreenSize = (w: number, h: number) => {
  _screenW = w;
  _screenH = h;
};
export const getScreenW = () => _screenW;
export const getScreenH = () => _screenH;

/** 玩家移动速度（px/s），为屏幕上恒定速度，与等级无关。 */
export const PLAYER_SPEED = 95;

/** 虚拟摇杆最大半径（像素），决定强度归一化。 */
export const JOY_MAX_R = 50;

/** 环绕卫星轨道角速度（rad/s）。 */
export const ORBIT_SPEED = 0.7;

/** 生成时，天体中心与玩家中心之间的最小 / 最大「间隙」（像素，叠加在两者半径之外）。 */
export const SPAWN_GAP_MIN = 24;
export const SPAWN_GAP_MAX = 70;

/** 超出该距离（像素）的天体回收并重生（按屏幕对角线动态计算，保证离开视野后再回收）。 */
export const despawnDist = (): number =>
  Math.ceil(Math.sqrt(_screenW * _screenW + _screenH * _screenH) * 0.6);

/** 宇宙圆融边界半径（像素）：世界是一个以出生点（原点）为圆心的圆形宇宙。
 * 玩家与相机均被夹在该圆环内——靠近边缘时玩家会偏离屏幕中心，且可见到圆环边界。 */
export const WORLD_RADIUS = 1800;

/** 盲区生成间隔（秒）：零陨石开局后，每隔该间隔在盲区生成 1 颗自由天体。 */
export const SPAWN_INTERVAL = 1;

/** 盲区环带：天体生成半径范围（玩家中心到生成点的像素距离）。
 * 使用屏幕对角线的一半，保证天体在屏幕外生成且各方向入屏距离均匀。 */
export const blindZoneMin = (): number =>
  Math.ceil(Math.sqrt(_screenW * _screenW + _screenH * _screenH) * 0.52);
export const blindZoneMax = (): number => despawnDist();

/** 盲区天体向内漂移速度范围（px/s）：中度偏缓，保证开局后数秒内入屏，
 * 又不至于太快（避免陨石飞掠难追）。玩家速度（PLAYER_SPEED=95）明显更快，追得上。 */
export const BLIND_ZONE_SPEED_MIN = 20;
export const BLIND_ZONE_SPEED_MAX = 40;

/** 捕获半径：玩家半径之外多少像素内的行星可被捕获为卫星。 */
export const CAPTURE_RANGE = 26;

/** 同屏自由天体目标数量（稀疏场，须探索寻找）。 */
export const TARGET_ENTITIES = 12;

/** 单次受击（无卫星抵挡时）扣血。 */
export const DAMAGE = 25;
export const MAX_HEALTH = 100;
/** 受击闪烁持续帧数。 */
export const HIT_FLASH_FRAMES = 12;

/** 撞击爆炸：被撞毁的天体崩解出的陨石数量。 */
export const EXPLOSION_METEORS = 10;
/** 撞击爆炸：崩解陨石的径向飞溅速度范围（px/s）。 */
export const DEBRIS_SPEED_MIN = 70;
export const DEBRIS_SPEED_MAX = 210;
/** 撞击爆炸：扩散圆环特效的寿命（秒）。 */
export const EFFECT_LIFE = 0.6;

/** 「明显大于玩家」天体每分钟最多生成个数（避免被围死无法逃脱）。 */
export const BIG_PER_MINUTE = 2;
export const BIG_WINDOW = 60;

/** 单次吞噬获得的物质下限 / 上限（按半径折算后 clamp）。 */
export const MATTER_FLOOR = 2;
export const MATTER_CAP = 2000;
/** 吞噬后玩家半径的增量（像素）与单等级内增长上限系数。 */
export const GROWTH = 0.6;
export const GROWTH_CAP = 1.2;

/** 进化等级定义。reachMatter = 累计物质达到该值即进化到该等级；r = 屏幕/世界半径(px)。 */
export interface StageDef {
  /** 1 基的等级序号（与进化顺序一致）。 */
  id: number;
  name: string;
  /** 进化到该等级所需的累计物质。 */
  reachMatter: number;
  /** 该等级天体的屏幕半径（像素）。严格单调递增以保证「等级越高越大」。 */
  r: number;
  color: string;
  /** 是否解锁捕获能力（岩石行星 L4 起）。 */
  canCapture: boolean;
  /** 是否发光（恒星及以上用于视觉区分）。 */
  glow: boolean;
}

/**
 * 进化顺序（用户指定，且为严格尺寸顺序）：
 * 陨石 < 小行星 < 矮星 < 岩石行星 < 气态行星 < 矮恒星 < 恒星 < 超巨星 < 中子星 < 黑洞 < 宇宙。
 * r 严格递增即保证屏幕上「等级越高画得越大」。
 */
export const STAGES: StageDef[] = [
  {
    id: 1,
    name: "陨石",
    reachMatter: 0,
    r: 6,
    color: "#9e9e9e",
    canCapture: false,
    glow: false,
  },
  {
    id: 2,
    name: "小行星",
    reachMatter: 100,
    r: 11,
    color: "#a1887f",
    canCapture: false,
    glow: false,
  },
  {
    id: 3,
    name: "矮星",
    reachMatter: 300,
    r: 18,
    color: "#ffcc80",
    canCapture: false,
    glow: false,
  },
  {
    id: 4,
    name: "岩石行星",
    reachMatter: 800,
    r: 25,
    color: "#8d6e63",
    canCapture: true,
    glow: false,
  },
  {
    id: 5,
    name: "气态行星",
    reachMatter: 1000,
    r: 34,
    color: "#ffb74d",
    canCapture: true,
    glow: false,
  },
  {
    id: 6,
    name: "矮恒星",
    reachMatter: 1500,
    r: 44,
    color: "#fff176",
    canCapture: true,
    glow: true,
  },
  {
    id: 7,
    name: "恒星",
    reachMatter: 2000,
    r: 56,
    color: "#ffd54f",
    canCapture: true,
    glow: true,
  },
  {
    id: 8,
    name: "超巨星",
    reachMatter: 3000,
    r: 71,
    color: "#ff7043",
    canCapture: true,
    glow: true,
  },
  {
    id: 9,
    name: "中子星",
    reachMatter: 3500,
    r: 18,
    color: "#b39ddb",
    canCapture: true,
    glow: true,
  },
  {
    id: 10,
    name: "黑洞",
    reachMatter: 4000,
    r: 105,
    color: "#000000",
    canCapture: true,
    glow: true,
  },
  {
    id: 11,
    name: "宇宙",
    reachMatter: 5000,
    r: 125,
    color: "#ffffff",
    canCapture: true,
    glow: true,
  },
];

/** 黑洞达成后，累计物质达到该值进入「另一个宇宙」结局。 */
export const FINAL_MATTER = 5000;

/** 黑洞引力范围系数：引力半径 = 玩家半径 × 该系数（L10 黑洞 r=105 → 约 273px）。 */
export const BLACKHOLE_GRAVITY_RATIO = 2.6;
/** 黑洞引力加速度（px/s²）：范围内可吞噬天体被加速拉向黑洞中心，越近越强。 */
export const BLACKHOLE_GRAVITY_PULL = 120;
/** 黑洞吸入坠向中心的移动速度（px/s）。 */
export const BLACKHOLE_FALL_SPEED = 320;
/** 黑洞吸入时天体半径的比例收缩速率（1/s）：半径逐帧 ×(1 − 速率×dt)，到中心时趋于不可见。 */
export const BLACKHOLE_FALL_SHRINK = 2.5;

/** 黑洞吸入特效：颗粒从被吞处螺旋收束吸入洞内的总寿命（秒）。 */
export const SUCK_EFFECT_LIFE = 0.7;

/** 宇宙结局转场四阶段时长（秒）：
 * 0~SUCK：场上所有物质吸入黑洞体内；SUCK~COLLAPSE：黑洞坍缩成一个小蓝点；
 * COLLAPSE~EXPLODE：蓝点大爆炸；EXPLODE~TOTAL：星海扩散铺满，一个宇宙形成。 */
export const TRANSFORM_SUCK = 0.9;
export const TRANSFORM_COLLAPSE = 1.4;
export const TRANSFORM_EXPLODE = 2.6;
export const TRANSFORM_TOTAL = 3.2;

/** 结局吸入：物质坠向洞心的速度（px/s），须保证盲区边缘的物质在吸入阶段内到达。 */
export const TRANSFORM_SUCK_SPEED = 900;
/** 结局吸入：物质半径的比例收缩速率（1/s）。 */
export const TRANSFORM_SUCK_SHRINK = 5;

/** 取某等级的 0 基索引（用于数组访问）。 */
export const stageIndexFromId = (id: number): number => id - 1;

/** 黑洞（L10）所在的 STAGES 索引：达到该等级后吞噬改为「吸入洞内」特效。
 * 须在 stageIndexFromId 之后定义（其引用该函数）。 */
export const BLACK_HOLE_STAGE = stageIndexFromId(10);

/* —— 2.5D 球面光照渲染参数（方案见 docs/planet-2.5d-rendering.md） —— */

/** 冷行星（L0~L4）球面光照渲染的所有可调参数，集中在一处，热重载试玩后收敛。 */
export const PLANET_GFX = {
  /** 视角系单位光向量（由表面指向光源，y 向上）。全场景单一光源，取代 LIGHTS[id%4]。 */
  light: { x: 0.32, y: 0.78, z: 0.54 },
  /** 轴倾角 τ 范围（弧度，按 id 播种）。 */
  tilt: { min: 0.15, max: 0.6 },
  /** 自转速度范围（rad/s，按类型/半径取值）。 */
  spin: {
    rock: { min: 0.25, max: 0.85 },
    dwarf: { min: 0.15, max: 0.5 },
    gas: { min: 0.08, max: 0.3 },
  },
  /** 夜帽：最大 alpha 与柔和度。blur 给晨昏线衔接处做羽化（遮蔽渐变走向与
   * 曲线晨昏线的夹角在边界残留的 alpha——这是「阴影生硬」的主因之一）。 */
  nightCap: { alpha: 0.34, blur: 0.05 },
  /** 镜面高光（glint）：绑定表面光斑随自转移动，翻过晨昏线消失。 */
  glint: {
    radius: 0.14, // 光斑半径 = R×该系数
    blur: 0.07, // 高斯模糊 sigma = R×该系数
    minLit: 0.12, // lit 低于该值光斑消失
    maxAlpha: 0.85,
    phi: 0, // 光斑纬度（≈赤道）
  },
  /** 轮廓弧：受光侧白边 / 夜侧黑边。黑边同样带 blur，避免夜侧勒一道生硬黑环。 */
  rim: {
    stroke: 0.045, // 描边宽 = R×该系数
    dayAlpha: 0.4,
    nightAlpha: 0.26,
    blur: 0.06, // 小 sigma 模糊 = R×该系数（柔和高光/暗边）
  },
  /** 岩石行星表面斑驳（terrain mottling）：大块柔和明暗补丁，随自转流动，
   * 打破「底+陨石坑」的平面感。用径向渐变自带软边，不开 mask blur。 */
  mottle: {
    count: 6, // 每颗岩石行星的候选补丁数（渲染端按半径取子集）
    shade: 0.14, // 明/暗偏移幅度
    alphaMin: 0.06, // 补丁峰值 alpha 下限
    alphaMax: 0.13,
    sizeMin: 0.45,
    sizeMax: 1.05,
  },
  /** 岩石行星陨石坑：幂律尺寸分布（大量小坑+少量大坑），亮边环 + 暗坑体双层。 */
  crater: {
    maxCount: 16, // 候选坑数（渲染端按半径取子集）
    sizeMin: 0.06, // 角半径下限（×R）
    sizeMax: 0.3,
    rimScale: 1.55, // 亮边环相对坑体大小
    rimOffset: 0.3, // 亮边环朝光偏移（×坑角半径）
    rimAlpha: 0.6, // 亮边环峰值 alpha
    floorScale: 0.92, // 坑体大小
    floorOffset: 0.2, // 坑体朝影偏移（×坑角半径）——亮边环露朝光侧、影池收暗侧
    minPx: 0.9, // 屏幕投影半径低于该像素的坑跳过（省指令）；低一点让陨石级的小星体也有坑田
  },
  /** 气态行星风暴（大红斑一类）：赤道附近的彩色漩涡，随自转移动。 */
  storm: {
    size: 0.42, // 角半径（×R）
    alpha: 0.55,
    color: "#a05a38",
  },
  /** 整体半球暗边（纵深）：径向渐变最外层 alpha。 */
  limb: { alpha: 0.3 },
  /** 行星环（气态行星）。 */
  ring: {
    tiltMin: 0.35,
    tiltMax: 0.6,
    rIn: 1.02, // 环内半径（×R，略大于球体）
    Rm: 1.2, // 中线半径（×R）
    /** 环带宽 = R×该系数（= Rout−Rin）。 */
    width: 0.36,
    backAlpha: 0.35,
    frontAlpha: 0.8,
  },
  /** LOD：直径（px）低于阈值逐级降档（简单→纯圆、中→少坑无光斑）。 */
  lod: { simple: 14, full: 20 },
} as const;
