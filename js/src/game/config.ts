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

/** 黑洞吸入特效：颗粒从被吞处螺旋收束吸入洞内的总寿命（秒）。 */
export const SUCK_EFFECT_LIFE = 0.7;

/** 宇宙结局转场三阶段时长（秒）：
 * 0~COLLAPSE：所有物质团聚成一个蓝点；COLLAPSE~EXPLODE：蓝点爆炸成宇宙；
 * EXPLODE~TOTAL：星海扩散铺满，随后进入结局界面。 */
export const TRANSFORM_COLLAPSE = 1.2;
export const TRANSFORM_EXPLODE = 2.4;
export const TRANSFORM_TOTAL = 3.0;

/** 取某等级的 0 基索引（用于数组访问）。 */
export const stageIndexFromId = (id: number): number => id - 1;

/** 黑洞（L10）所在的 STAGES 索引：达到该等级后吞噬改为「吸入洞内」特效。
 * 须在 stageIndexFromId 之后定义（其引用该函数）。 */
export const BLACK_HOLE_STAGE = stageIndexFromId(10);
