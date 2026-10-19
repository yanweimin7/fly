import { AudioService } from "fuickjs";

/**
 * 游戏音效。
 *
 * 音频文件由 `tools/gen_sfx.py` 纯合成生成（无外部素材/版权问题），
 * 放在 `js/assets/audio/`，随 bundle 签名打包下发。
 *
 * 限流策略（引擎侧已有 35ms 的原生限流，这里再加一层「同音效最小间隔」）：
 * 游戏里吞噬/爆炸可能连续触发，原生限流只挡同一瞬间的重复，这里按音效分别
 * 拉开间隔，避免「连吃 5 颗陨石」变成 5 声爆音糊成噪音。
 */

/** 音效名 → bundle 内相对路径。 */
export const SFX = {
  /** 吞噬陨石/天体。 */
  eat: "audio/eat.wav",
  /** 撞击爆炸。 */
  explode: "audio/explode.wav",
  /** 玩家受伤掉血。 */
  damage: "audio/damage.wav",
  /** 被黑洞吸入。 */
  suck: "audio/suck.wav",
  /** 进化到新等级。 */
  evolve: "audio/evolve.wav",
  /** 达成结局。 */
  win: "audio/win.wav",
  /** 死亡。 */
  gameover: "audio/gameover.wav",
  /** UI 点击。 */
  tap: "audio/tap.wav",
} as const;

export type SfxName = keyof typeof SFX;

/** 同一音效的最小重复间隔（毫秒）—— 原生限流之外的游戏侧节奏控制。 */
const MIN_GAP_MS: Partial<Record<SfxName, number>> = {
  eat: 90,
  explode: 70,
  damage: 150,
  suck: 1200,
  evolve: 400,
  win: 2000,
  gameover: 2000,
  tap: 60,
};

const lastPlayed = new Map<SfxName, number>();

/**
 * 播放一个音效。带最小间隔限流；`force=true` 跳过限流
 * （用于进化/胜负这类同一时刻只该响一次、且必须听到的关键音）。
 */
export function sfx(name: SfxName, force = false): void {
  const gap = MIN_GAP_MS[name];
  if (!force && gap !== undefined) {
    const now = Date.now();
    const last = lastPlayed.get(name);
    if (last !== undefined && now - last < gap) return;
    lastPlayed.set(name, now);
  }
  AudioService.play(SFX[name], { volume: 1, throttle: !force });
}

/** 预加载全部音效（进游戏页时调用，消除首次播放的解码延迟）。
 *  顺带做一次诊断探测并打日志：听不见时直接看日志里的 `[AudioService] probe`
 *  —— 能立刻区分「资源没打进包」「解码拿不到时长」还是播放链路本身的问题。 */
export function preloadSfx(): void {
  const all = Object.values(SFX);
  AudioService.preload(all);
  AudioService.probe(all);
}
