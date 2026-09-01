/**
 * 宇宙进化游戏 —— 可调参数与等级配置（游戏模型数据层）。
 * 仅依赖 fuickjs 现有导出能力，不修改框架层。
 */

/** 单帧步长（秒）。TICK_RATE 帧/秒驱动固定步长游戏循环。 */
export const TICK_RATE = 30;
export const DT = 1 / TICK_RATE;

/** 虚拟视口尺寸（竖屏）。游戏场地以 SizedBox 固定尺寸居中，避免依赖设备真实尺寸。 */
export const VW = 360;
export const VH = 640;
/** 玩家在场地中的屏幕中心坐标。 */
export const CENTER_X = VW / 2;
export const CENTER_Y = VH / 2;

/** 玩家基础移动速度（px/s），随等级略降。 */
export const PLAYER_SPEED_BASE = 150;

/** 虚拟摇杆最大半径（像素），决定强度归一化。 */
export const JOY_MAX_R = 50;

/** 环绕卫星轨道角速度（rad/s）。 */
export const ORBIT_SPEED = 1.4;

/** 捕获半径：玩家半径之外的可捕获距离。 */
export const CAPTURE_RANGE = 150;

/** 同屏自由天体目标数量（离屏裁剪 + 数量控制以保性能）。 */
export const TARGET_ENTITIES = 40;
/** 开局初始天体数量（全都落在可视范围之外，玩家开局只身一人；密度恒定不随等级增加）。 */
export const INITIAL_ENTITIES = 36;
/** 天体生成间隔（秒）：每分钟只生成一颗，作为稀缺补给缓慢补充。 */
export const SPAWN_INTERVAL = 60;
/** 开局天体散布距离区间：全部在可视范围之外（>449px），保证开局只有玩家自己。 */
export const INITIAL_DIST_MIN = 460;
export const INITIAL_DIST_MAX = 1000;
/** 游戏进行中补位天体的生成距离区间：更远的深空，只有探索过去才会发现。 */
export const SPAWN_DIST_MIN = 1100;
export const SPAWN_DIST_MAX = 1700;
/** 超出该距离的天体回收并重生（远大于生成范围，让世界以静态散布延续）。 */
export const DESPAWN_DIST = 2000;

/** 单次受击（无卫星抵挡时）扣血。 */
export const DAMAGE = 25;
export const MAX_HEALTH = 100;
/** 受击闪烁持续帧数。 */
export const HIT_FLASH_FRAMES = 12;

/** 进化等级定义。reachMatter = 累计物质达到该值即进化到该等级。 */
export interface StageDef {
  /** 1 基的等级序号（与进化顺序一致）。 */
  id: number;
  name: string;
  /** 进化到该等级所需的累计物质。 */
  reachMatter: number;
  /** 该等级玩家基础半径。 */
  radius: number;
  color: string;
  /** 是否解锁捕获能力（岩石行星 L4 起）。 */
  canCapture: boolean;
  /** 是否发光（恒星及以上用于视觉区分）。 */
  glow: boolean;
}

export const STAGES: StageDef[] = [
  {
    id: 1,
    name: "陨石",
    reachMatter: 0,
    radius: 14,
    color: "#9e9e9e",
    canCapture: false,
    glow: false,
  },
  {
    id: 2,
    name: "小行星",
    reachMatter: 100,
    radius: 20,
    color: "#a1887f",
    canCapture: false,
    glow: false,
  },
  {
    id: 3,
    name: "矮星",
    reachMatter: 300,
    radius: 28,
    color: "#ffcc80",
    canCapture: false,
    glow: false,
  },
  {
    id: 4,
    name: "岩石行星",
    reachMatter: 800,
    radius: 38,
    color: "#8d6e63",
    canCapture: true,
    glow: false,
  },
  {
    id: 5,
    name: "气态行星",
    reachMatter: 1000,
    radius: 50,
    color: "#ffb74d",
    canCapture: true,
    glow: false,
  },
  {
    id: 6,
    name: "矮恒星",
    reachMatter: 1500,
    radius: 64,
    color: "#fff176",
    canCapture: true,
    glow: true,
  },
  {
    id: 7,
    name: "恒星",
    reachMatter: 2000,
    radius: 80,
    color: "#ffd54f",
    canCapture: true,
    glow: true,
  },
  {
    id: 8,
    name: "巨星",
    reachMatter: 2500,
    radius: 100,
    color: "#ff8a65",
    canCapture: true,
    glow: true,
  },
  {
    id: 9,
    name: "超巨星",
    reachMatter: 3000,
    radius: 120,
    color: "#ff7043",
    canCapture: true,
    glow: true,
  },
  {
    id: 10,
    name: "中子星",
    reachMatter: 3500,
    radius: 70,
    color: "#b39ddb",
    canCapture: true,
    glow: true,
  },
  {
    id: 11,
    name: "黑洞",
    reachMatter: 4000,
    radius: 90,
    color: "#000000",
    canCapture: true,
    glow: true,
  },
  {
    id: 12,
    name: "宇宙",
    reachMatter: 5000,
    radius: 110,
    color: "#283593",
    canCapture: true,
    glow: true,
  },
];

/** 进化成最终阶段「宇宙」所需累计物质（即 FINAL_MATTER）。 */
export const FINAL_MATTER = 5000;

/* —— 宇宙创生结局动画 —— */

/** 团圆阶段时长（秒）：所有天体向玩家聚拢收缩。 */
export const ENDING_CONVERGE_S = 2.5;
/** 蓝点阶段时长（秒）：玩家收缩为发亮的小蓝点。 */
export const ENDING_BLUE_S = 1;
/** 爆炸阶段时长（秒）：蓝点向外扩散成星空。 */
export const ENDING_BANG_S = 2;
/** 爆炸扩散粒子数量。 */
export const BANG_PARTICLES = 32;

/** 取某等级的 0 基索引（用于数组访问）。 */
export const stageIndexFromId = (id: number): number => id - 1;
