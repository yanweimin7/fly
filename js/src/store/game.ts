/**
 * 游戏状态模型与可订阅存储（重渲染桥接）。
 * 游戏逻辑（step/spawn/capture）在 ../game/engine 中实现，本文件只持有
 * 数据模型与订阅机制，供 React 组件订阅并触发重渲染。
 */

import type { StageDef } from "../game/config";
import { STAGES, FINAL_MATTER } from "../game/config";
import { createGame } from "../game/engine";

/** 自由天体 / 玩家 / 环绕卫星实体。 */
export interface Entity {
  id: number;
  /** 世界坐标。 */
  x: number;
  y: number;
  /** 漂移速度（px/s）。 */
  vx: number;
  vy: number;
  /** 碰撞半径（决定体型）。 */
  radius: number;
  /** 进化等级 0 基索引，用于碰撞的「战力」比较。 */
  power: number;
  /** 被吞噬时提供的物质。 */
  matterValue: number;
  /** 当前血量 / 上限（天体血条；玩家用 GameState.health，这两项无实际意义）。 */
  hp: number;
  maxHp: number;
  /** 上次被土星环命中的时间（秒，用于环伤害间隔）。 */
  ringHitAt?: number;
  /** 上次作为卫星撞击结算的时间（秒，用于卫星伤害间隔）。 */
  hitAt?: number;
  /** 是否为被捕获的环绕卫星。 */
  isSatellite: boolean;
  /** 环绕轨道角（卫星专用）。 */
  angle?: number;
  /** 环绕轨道半径（卫星专用）。 */
  orbitRadius?: number;
  /** 引擎内部标记：本帧已被吞噬 / 撞击消耗，待移除。 */
  removed?: boolean;
  /** 黑洞吸入中：正坠向黑洞中心并缩小，到达中心后移除（不再参与碰撞）。 */
  fallingIn?: boolean;
}

export type GameStatus = "playing" | "gameover" | "win";

/** 特效类型：ring=扩散圆环（撞击爆炸）；suck=黑洞吸入（颗粒螺旋收束变小、淡入洞内）。 */
export type EffectType = "ring" | "suck" | "text";

/** 特效（GameField 渲染）。ring 为随时间扩散、淡出的圆环；suck 为吸入颗粒。 */
export interface Effect {
  id: number;
  x: number;
  y: number;
  /** 已进行时长（秒）。 */
  age: number;
  /** 总寿命（秒）。 */
  life: number;
  /** 最大扩散半径（像素）。 */
  maxR: number;
  /** 主色（RRGGBB）。 */
  color: string;
  /** 特效类型，缺省为 ring。 */
  type?: EffectType;
  /** suck 专用：颗粒最终收束进去的洞心半径（像素），缺省时回退到玩家半径。 */
  sinkR?: number;
  /** text 专用：浮出的伤害文本（如 "-31%"）。 */
  text?: string;
}

/** 玩家被场上黑洞吸入的过程：记录那颗黑洞（跟随其移动），直到坠入洞心判定死亡。 */
export interface Swallow {
  /** 黑洞实体 id（黑洞自身仍在漂移，每帧回填最新坐标）。 */
  id: number;
  /** 黑洞当前世界坐标（黑洞消失后用它兜底）。 */
  x: number;
  y: number;
}

export interface GameState {
  status: GameStatus;
  player: Entity;
  entities: Entity[];
  satellites: Entity[];
  /** 累计物质总量。 */
  matter: number;
  /** 当前等级 0 基索引。 */
  stageIndex: number;
  health: number;
  maxHealth: number;
  time: number;
  /** 记录「比玩家明显更大」天体的生成时间戳，用于每分钟生成数限速。 */
  bigSpawnTimes: number[];
  /** 下一次盲区生成时刻（绝对游戏时间，秒）。零陨石开局后按间隔生成。 */
  nextSpawnAt: number;
  nextEntityId: number;
  /** 受击闪烁剩余帧。 */
  hitFlash: number;
  /** 卫星抵挡闪烁剩余帧。 */
  blockFlash: number;
  /** 撞击爆炸特效（圆环扩散动画）。 */
  effects: Effect[];
  /** 是否处于「宇宙结局转场」动画（团聚成蓝点 → 爆炸 → 化为宇宙）。 */
  transform: boolean;
  /** 转场已进行时长（秒），驱动各个阶段。 */
  transformT: number;
  /** 正在被场上黑洞吸入（玩家坠向洞心缩小中）；结束后置 status="gameover"。 */
  swallow?: Swallow;
}

/** 摇杆输入：dx/dy 为相对起点的位移（像素），intensity 为 0~1 强度。 */
export interface InputState {
  dx: number;
  dy: number;
  intensity: number;
}

/**
 * 轻量游戏存储：持有 GameState，提供订阅/通知以桥接 React 重渲染。
 * 引擎函数就地修改 state，随后调用 notify() 触发订阅者重渲染。
 */
export class GameStore {
  private state: GameState;
  private listeners = new Set<() => void>();

  constructor(screenW?: number, screenH?: number) {
    this.state = createGame(screenW, screenH);
  }

  getState(): GameState {
    return this.state;
  }

  /** 覆盖整个状态（用于重新开始）。 */
  setState(next: GameState): void {
    this.state = next;
    this.notify();
  }

  /** 引擎就地修改后通知订阅者重渲染。 */
  notify(): void {
    this.listeners.forEach((l) => l());
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** 重新开始一局。 */
  reset(screenW?: number, screenH?: number): void {
    this.setState(createGame(screenW, screenH));
  }
}

export { STAGES, FINAL_MATTER };
export type { StageDef };
