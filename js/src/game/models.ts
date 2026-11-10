/**
 * 天体模型映射：进化阶段（power）→ GLB 模型文件。
 *
 * 同一档有多个贴图变体（地球/金星/火星、土星/木星/天王星/海王星……），
 * 按实体 id 稳定选一个，保证同一实体外观不跳变；引擎也用它判断是否带环
 * （土星模型有环，环是伤害区域）。
 *
 * 黑洞没有贴图变体，使用纯程序化生成的 3D 模型（tools/gen_blackhole_glb.py）：
 * 纯黑事件视界球体 + 倾斜吸积盘 + 光子环，全部由 Scene3D 渲染。
 */

import { BLACK_HOLE_STAGE } from "./config";

/** 黑洞 3D 模型（bundle 相对路径）。 */
export const BLACKHOLE_MODEL = "models/blackhole.glb";

export const STAGE_MODELS: string[][] = [
  ["planet_01", "planet_01_b", "planet_01_c"],
  ["planet_02", "planet_02_b", "planet_02_c"],
  ["planet_03", "planet_03_b", "planet_03_c"],
  ["earth", "venus", "mars"],
  ["saturn", "jupiter", "uranus", "neptune"],
  ["planet_06", "planet_06_b", "planet_06_c"],
  ["planet_07", "planet_07_b", "planet_07_c"],
  ["planet_08", "planet_08_b", "planet_08_c"],
  ["planet_09", "planet_09_b", "planet_09_c"],
];

/** 实体 → 变体下标：id 稳定映射，同屏相邻实体尽量取不同变体。 */
export function variantIndex(power: number, id: number): number {
  const variants = STAGE_MODELS[power];
  if (!variants) return 0;
  return ((id * 2654435761) >>> 0) % variants.length;
}

/** 实体 → 模型基名（不含 models/ 前缀与 .glb 后缀）。 */
export function modelBase(power: number, id: number): string {
  return STAGE_MODELS[power]?.[variantIndex(power, id)] ?? STAGE_MODELS[0][0];
}

/** 实体 → 3D 层资源路径。黑洞固定使用程序化 3D 模型。 */
export function stageModel(power: number, id: number): string {
  if (power === BLACK_HOLE_STAGE) return BLACKHOLE_MODEL;
  return `models/${modelBase(power, id)}.glb`;
}

/** 该天体是否带行星环（土星）。环是实体环带伤害区域。 */
export function hasRing(power: number, id: number): boolean {
  return modelBase(power, id) === "saturn";
}
