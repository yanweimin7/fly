/**
 * 游戏存档：暂停时把整局 GameState 序列化进 localStorage，开始菜单据此
 * 提供「继续游戏」。存档带格式版本号与结构校验，损坏 / 旧版本的存档一律
 * 视为不存在，避免恢复出半截状态把引擎打崩。
 *
 * 注意：localStorage 是 fuickjs 注入的内存实现，跨会话读取前必须先
 * `await hydrateStorage()`（见 GamePage 的存档水合 effect）。
 */
import type { GameState } from "../store/game";
import { STAGES } from "./config";

/** 存档 key：带格式版本，日后整体换格式时并存 / 迁移更方便。 */
export const SAVE_KEY = "fly.game.save.v1";
/** 当前存档格式版本。 */
const SAVE_VERSION = 1;

interface SaveFile {
  v: number;
  /** 存档时刻（Date.now()），仅用于诊断。 */
  savedAt: number;
  state: GameState;
}

const isNum = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v);

const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

/** 实体最小校验：位置 / 半径是引擎每帧都要用的数值，缺一个就会出 NaN。 */
function isValidEntity(v: unknown): boolean {
  return (
    isObj(v) &&
    isNum(v.id) &&
    isNum(v.x) &&
    isNum(v.y) &&
    isNum(v.radius) &&
    isNum(v.power)
  );
}

/** GameState 结构校验：只查引擎恢复后立刻会用到的关键字段。 */
function isValidState(v: unknown): v is GameState {
  if (!isObj(v)) return false;
  if (v.status !== "playing" && v.status !== "gameover" && v.status !== "win") {
    return false;
  }
  if (!isValidEntity(v.player)) return false;
  if (
    !isNum(v.stageIndex) ||
    v.stageIndex < 0 ||
    v.stageIndex >= STAGES.length
  ) {
    return false;
  }
  if (!isNum(v.matter) || !isNum(v.health) || !isNum(v.maxHealth)) return false;
  if (!isNum(v.time) || !isNum(v.nextSpawnAt) || !isNum(v.nextEntityId)) {
    return false;
  }
  if (!Array.isArray(v.entities) || !v.entities.every(isValidEntity)) {
    return false;
  }
  if (!Array.isArray(v.satellites) || !v.satellites.every(isValidEntity)) {
    return false;
  }
  if (!Array.isArray(v.effects)) return false;
  return true;
}

/**
 * 存档当前对局。只允许保存进行中的对局（暂停入口已保证），返回是否成功。
 * 写入失败（序列化异常等）时保持原存档不动并返回 false，调用方可留在游戏内。
 */
export function saveGame(state: GameState): boolean {
  if (state.status !== "playing") return false;
  try {
    const file: SaveFile = {
      v: SAVE_VERSION,
      savedAt: Date.now(),
      state,
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(file));
    return true;
  } catch (e) {
    console.warn("[save] 写入存档失败:", e);
    return false;
  }
}

/** 读取存档；不存在 / 版本不符 / 结构损坏 / 不是进行中的对局时返回 null。 */
export function loadGame(): GameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const file = JSON.parse(raw) as unknown;
    if (!isObj(file) || file.v !== SAVE_VERSION) return null;
    if (!isValidState(file.state) || file.state.status !== "playing")
      return null;
    return file.state;
  } catch (e) {
    console.warn("[save] 读取存档失败:", e);
    return null;
  }
}

/** 删除存档（重新开始 / 对局结束）。 */
export function clearSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch (e) {
    console.warn("[save] 删除存档失败:", e);
  }
}
