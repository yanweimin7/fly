/**
 * 行星静态形状数据层：颜色工具 + 按 id 播种的常驻形状缓存。
 *
 * 每颗行星的形状（轴倾角 τ、自转速度 ω、调色板、坑/云带/极冠特征表、环倾角）
 * 只跟实体 id 相关、不随时间变化，在这里按 id 缓存一次，渲染侧每帧只重算
 * 「特征随 ω·t 自转后的几何」，绝不重新播种随机。
 */

import { PLANET_GFX } from "./config";

/* —— 颜色 / 数值工具 —— */

export function rgbColor(h: string): [number, number, number] {
  const s = h.replace("#", "").padEnd(6, "0");
  return [
    parseInt(s.slice(0, 2), 16),
    parseInt(s.slice(2, 4), 16),
    parseInt(s.slice(4, 6), 16),
  ];
}

export function fromRgb(r: number, g: number, b: number): string {
  const c = (v: number) =>
    Math.round(Math.max(0, Math.min(1, v)) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** t>0 提亮、t<0 压暗（t ∈ [-1,1]）。 */
export function shade(h: string, t: number): string {
  const [r, g, b] = rgbColor(h);
  const f = (v: number) => (t > 0 ? v + (255 - v) * t : v * (1 + t));
  return fromRgb(f(r), f(g), f(b));
}

/** 6 位 hex 转 8 位 RRGGBBAA。 */
export function alphaOf(h: string, a: number): string {
  const s = h.replace("#", "").padEnd(6, "0");
  const aa = Math.round(Math.max(0, Math.min(1, a)) * 255)
    .toString(16)
    .padStart(2, "0");
  return `#${s}${aa}`;
}

/** HSL（h 角度 0~360、s/l 0~1）→ 6 位 hex。用于岩石行星按 id 播种的差异化配色。 */
export function hsl(hDeg: number, s: number, l: number): string {
  const h = ((hDeg % 360) + 360) % 360;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const col = l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
    return Math.round(col * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

export function srand(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

export const clamp = (v: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, v));

export const lerp = (a: number, b: number, t: number): number =>
  a + (b - a) * t;

export const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

/** 屏幕方向（dx, dy，y 向下）→ 最近的 8/9 向 Alignment 字符串。 */
export function alignFromDir(dx: number, dy: number): string {
  const xa = dx > 0.45 ? "right" : dx < -0.45 ? "left" : "center";
  const ya = dy > 0.45 ? "bottom" : dy < -0.45 ? "top" : "center";
  if (ya === "center") {
    if (xa === "center") return "center";
    return xa === "right" ? "centerRight" : "centerLeft";
  }
  if (xa === "center") return ya === "top" ? "topCenter" : "bottomCenter";
  const xn = xa === "right" ? "Right" : "Left";
  return ya + xn; // 'topLeft' / 'topRight' / 'bottomLeft' / 'bottomRight'
}

/* —— 形状定义 —— */

export type PlanetKind = "rock" | "dwarf" | "gas";

/** 陨石坑 / 表面圆斑：体坐标（纬度 φ、经度 μ0）+ 角半径 δ。 */
export interface CraterDef {
  phi: number;
  mu0: number;
  /** 角半径（弧度），屏幕半径 ≈ R×δ。 */
  delta: number;
  alpha: number;
}

/** 表面斑驳补丁（terrain mottle）：柔和明/暗大块，径向渐变软边。 */
export interface PatchDef {
  phi: number;
  mu0: number;
  /** 角半径（弧度），屏幕半径 ≈ R×δ。 */
  delta: number;
  /** true 提亮、false 压暗（幅度见 config.mottle.shade）。 */
  lighter: boolean;
  alpha: number;
}

/** 纬度带 / 极冠中心线。 */
export interface BandDef {
  /** 中心纬度（弧度）。 */
  phi: number;
  /** 半角宽（弧度）。 */
  halfWidth: number;
  color: string;
  alpha: number;
  /**
   * 描边宽系数：strokeWidth = r×widthFactor（像素）。
   * 缺省按 2·hw·r·cosφ 估算；极冠这类「覆盖到极」的带直接给系数。
   */
  widthFactor?: number;
  /** 流动正弦（模拟木星）：phi += amp·sin(k·mu + phase)。 */
  wave?: { amp: number; k: number; phase: number };
}

/** 行星环（气态行星）：环面倾角 i、内外半径（×R）。 */
export interface RingDef {
  i: number;
  rIn: number;
  rOut: number;
  color: string;
}

export interface PlanetShape {
  power: number;
  kind: PlanetKind;
  /** 轴倾角 τ。 */
  tilt: number;
  /** 自转速度（rad/s）。 */
  omega: number;
  base: string;
  palette: string[];
  craterColor: string;
  craters: CraterDef[];
  /** 表面斑驳补丁（仅岩石行星）。 */
  patches: PatchDef[];
  bands: BandDef[];
  /** 镜面高光光斑（纬 φg、初始经 μg0，随 omega·t 自转）。 */
  glint: { phi: number; mu0: number };
  /** 气态行星风暴（大红斑一类）：体坐标 + 角半径。 */
  storm?: { phi: number; mu0: number; delta: number };
  /** 每颗行星独立的「质感」参数：光影强弱 / 纹理密度都从这里差异化。 */
  feel: SurfaceFeel;
  ring?: RingDef;
}

/** 每颗行星按 id 播种的质感档位，让纹理密度与光影风格在星球间各不相同。 */
export interface SurfaceFeel {
  /** 整体曝光（>1 更亮，0.88~1.12）。 */
  exposure: number;
  /** 昼夜对比（>1 更陡，0.75~1.3）。 */
  contrast: number;
  /** 大气羽化（>1 更柔和/弥散，0.5~1.6 岩石；气态行星更高）。 */
  haze: number;
  /** 陨石坑密度系数（0.55~1.5）。 */
  craterDensity: number;
  /** 陨石坑深浅系数（0.6~1.25）。 */
  craterDepth: number;
  /** 表面地形起伏系数（0.6~1.45）。 */
  mottle: number;
  /** 镜面高光强度（0 哑光 → ~1 亮面，按平方分布多数偏哑）。 */
  glint: number;
}

function buildFeel(id: number): SurfaceFeel {
  return {
    exposure: lerp(0.88, 1.12, srand(id * 101 + 1)),
    contrast: lerp(0.75, 1.3, srand(id * 103 + 2)),
    haze: lerp(0.5, 1.6, srand(id * 107 + 3)),
    craterDensity: lerp(0.55, 1.5, srand(id * 109 + 4)),
    craterDepth: lerp(0.6, 1.25, srand(id * 113 + 5)),
    mottle: lerp(0.6, 1.45, srand(id * 127 + 6)),
    glint: Math.pow(srand(id * 131 + 7), 2) * 0.95,
  };
}

/** 气态行星云带：沿用旧 art 的行位置（top/h 为直径分数），换算成纬度+角宽。 */
const GAS_ROWS: Array<{ top: number; h: number; ci: number }> = [
  { top: 0.06, h: 0.2, ci: 1 },
  { top: 0.24, h: 0.15, ci: 2 },
  { top: 0.38, h: 0.18, ci: 3 },
  { top: 0.56, h: 0.14, ci: 1 },
  { top: 0.7, h: 0.2, ci: 2 },
  { top: 0.9, h: 0.16, ci: 0 },
];
const GAS_BAND_COLORS = ["#d5c9bc", "#bba68e", "#9e8570", "#c8b7a4", "#dcd3c8"];

/** 纬度带：从「屏幕 top 分数」换算中心纬度（y = C − R·sinφ）。 */
const topToPhi = (top: number): number => Math.asin(1 - 2 * top);

/** 岩石行星色相锚点（度）：铁锈/赭石、暖棕、沙色、橄榄、冷灰蓝、蓝灰、灰绿。
 * 每颗行星按 id 从里取一个并抖动 ±20°，饱和度取低段、明度中段——星球间颜色
 * 天然各不相同，且都收敛在低饱和大地色系，不再按 power 共用一套灰白调色板。 */
const ROCK_HUE_ANCHORS = [18, 32, 48, 72, 208, 222, 268];

function buildRockShape(power: number, id: number): PlanetShape {
  const R = PLANET_GFX;
  const tilt = lerp(R.tilt.min, R.tilt.max, srand(id * 31 + 7));
  const omega = lerp(R.spin.rock.min, R.spin.rock.max, srand(id * 17 + 3));

  // 程序化配色：三个岩石档位各走一套参数，让「陨石 / 小行星 / 岩石行星」的观感
  // 与它们的名字一一对应——陨石黑沉粗糙、小行星中性大地色、岩石行星更亮更彩。
  let hueAnchors: number[];
  let hueJit: number;
  let sat: number;
  let lig: number;
  let craterMul: number;
  let mottleMul: number;
  if (power === 0) {
    // L1 陨石：低反照率铁锈棕/焦灰，坑田密、几乎无地形起伏——像被烧过的实心石块。
    hueAnchors = [14, 38];
    hueJit = 22;
    sat = 0.09 + srand(id * 11 + 3) * 0.14;
    lig = 0.32 + srand(id * 13 + 4) * 0.11;
    craterMul = lerp(1.2, 1.55, srand(id * 109 + 21));
    mottleMul = lerp(0.45, 0.75, srand(id * 127 + 31));
  } else if (power === 3) {
    // L4 岩石行星：更亮的陆块感、色彩更明确（这是「有过地质活动」的大行星）。
    hueAnchors = [32, 48, 72, 208];
    hueJit = 34;
    sat = 0.24 + srand(id * 11 + 3) * 0.16;
    lig = 0.46 + srand(id * 13 + 4) * 0.12;
    craterMul = lerp(0.7, 1.1, srand(id * 109 + 21));
    mottleMul = lerp(1.05, 1.45, srand(id * 127 + 31));
  } else {
    // L2 小行星：中性大地色系，坑田与地形都居中。
    hueAnchors = ROCK_HUE_ANCHORS;
    hueJit = 40;
    sat = 0.2 + srand(id * 11 + 3) * 0.2;
    lig = 0.42 + srand(id * 13 + 4) * 0.13;
    craterMul = lerp(0.85, 1.2, srand(id * 109 + 21));
    mottleMul = lerp(0.8, 1.2, srand(id * 127 + 31));
  }
  const hue =
    hueAnchors[
      Math.floor(srand(id * 5 + 1) * hueAnchors.length) % hueAnchors.length
    ] +
    (srand(id * 7 + 2) - 0.5) * hueJit;
  const base = hsl(hue, sat, lig);
  const palette = [base, shade(base, -0.16), shade(base, -0.33)];

  // 陨石坑：幂律尺寸分布（大量小坑 + 少量大坑，1.8 次幂向小端聚集），
  // 表面特征才像真实的轰击疤痕场。渲染端再按半径取子集。
  const craters: CraterDef[] = [];
  for (let i = 0; i < R.crater.maxCount; i++) {
    const p = srand(id * 13 + i * 5 + 1);
    craters.push({
      phi: (srand(id * 19 + i * 7 + 2) - 0.5) * 1.9,
      mu0: srand(id * 23 + i * 11 + 3) * Math.PI * 2,
      delta:
        R.crater.sizeMin +
        Math.pow(p, 1.8) * (R.crater.sizeMax - R.crater.sizeMin),
      alpha: clamp(
        lerp(0.5, 0.85, srand(id * 29 + i * 13 + 4)) * craterMul,
        0.05,
        0.95,
      ),
    });
  }

  // 表面斑驳：大块明/暗补丁（软边 radial 渐变），给陨石坑底下垫一层地形起伏。
  const patches: PatchDef[] = [];
  for (let i = 0; i < R.mottle.count; i++) {
    patches.push({
      phi: (srand(id * 61 + i * 29 + 1) - 0.5) * 1.9,
      mu0: srand(id * 67 + i * 31 + 2) * Math.PI * 2,
      delta: lerp(
        R.mottle.sizeMin,
        R.mottle.sizeMax,
        srand(id * 73 + i * 37 + 3),
      ),
      lighter: srand(id * 79 + i * 41 + 4) > 0.5,
      alpha: clamp(
        lerp(
          R.mottle.alphaMin,
          R.mottle.alphaMax,
          srand(id * 83 + i * 43 + 5),
        ) * mottleMul,
        0.02,
        0.22,
      ),
    });
  }
  // 最大的一块固定为暗色「月海」盆地，给地形一个稳定的暗锚点。
  {
    let mi = 0;
    for (let i = 1; i < patches.length; i++)
      if (patches[i].delta > patches[mi].delta) mi = i;
    patches[mi].lighter = false;
    patches[mi].alpha = Math.max(patches[mi].alpha, R.mottle.alphaMax);
  }

  return {
    power,
    kind: "rock",
    tilt,
    omega,
    base,
    palette,
    craterColor: shade(base, -0.38),
    craters,
    patches,
    bands: [],
    glint: { phi: R.glint.phi, mu0: (srand(id * 37 + 9) - 0.5) * 1.8 },
    feel: buildFeel(id),
  };
}

function buildDwarfShape(power: number, id: number): PlanetShape {
  const R = PLANET_GFX;
  const tilt = lerp(R.tilt.min, R.tilt.max, srand(id * 31 + 7));
  const omega = lerp(R.spin.dwarf.min, R.spin.dwarf.max, srand(id * 17 + 3));
  const jb = (srand(id * 7) - 0.5) * 0.18;
  const base = shade("#9aa8b8", jb);

  // 极冠：覆盖「近极 → 极」的纬度带，strokeWidth = r×(1−|sinφc|)。
  const capN = 0.753;
  const capS = -0.748;
  const poleCap = (phiEdge: number, color: string): BandDef => {
    const sign = phiEdge > 0 ? 1 : -1;
    const mid = (sign * (Math.abs(phiEdge) + Math.PI / 2)) / 2;
    const hw = (Math.PI / 2 - Math.abs(phiEdge)) / 2;
    return {
      phi: sign * mid,
      halfWidth: hw,
      color,
      alpha: 0.55,
      widthFactor: 1 - Math.abs(Math.sin(phiEdge)),
    };
  };

  // 冰矮行星：少量低对比环形山（暗坑 + 冰白亮边，Painter 统一画）。
  const craters: CraterDef[] = [];
  for (let i = 0; i < 3; i++) {
    craters.push({
      phi: (srand(id * 131 + i * 5 + 1) - 0.5) * 1.9,
      mu0: srand(id * 137 + i * 7 + 2) * Math.PI * 2,
      delta: lerp(0.09, 0.18, srand(id * 139 + i * 3 + 3)),
      alpha: lerp(0.3, 0.5, srand(id * 149 + i * 11 + 4)),
    });
  }

  return {
    power,
    kind: "dwarf",
    tilt,
    omega,
    base,
    palette: ["#9aa8b8", "#7a8798", "#5c6877"],
    craterColor: "#414a56",
    craters,
    patches: [],
    bands: [
      poleCap(capN, "#ffffff"),
      poleCap(capS, "#ffffff"),
      {
        phi: topToPhi(0.42),
        halfWidth: 0.1,
        color: shade(base, -0.12),
        alpha: 0.5,
        wave: { amp: 0.03, k: 1, phase: srand(id * 41 + 5) * Math.PI * 2 },
      },
    ],
    glint: { phi: R.glint.phi, mu0: (srand(id * 37 + 9) - 0.5) * 1.8 },
    feel: buildFeel(id),
  };
}

function buildGasShape(power: number, id: number): PlanetShape {
  const R = PLANET_GFX;
  const tilt = lerp(R.tilt.min, R.tilt.max, srand(id * 31 + 7));
  const omega = lerp(R.spin.gas.min, R.spin.gas.max, srand(id * 17 + 3));
  const jb = (srand(id * 7) - 0.5) * 0.1;
  const base = shade("#f2dcb2", jb);
  // 气态行星的阴影走大气路线：晨昏线更弥散、对比更低。
  const feel = buildFeel(id);
  feel.haze = Math.max(0.85, feel.haze);
  feel.contrast = lerp(0.75, 1.05, srand(id * 173 + 3));

  const bands: BandDef[] = GAS_ROWS.map((row, i) => {
    const top = row.top + (srand(id * 11 + i) - 0.5) * 0.03;
    const phi = topToPhi(top);
    const cos = Math.abs(Math.cos(phi));
    const halfWidth = clamp(row.h / Math.max(0.15, cos), 0.02, 0.7);
    return {
      phi,
      halfWidth,
      color: GAS_BAND_COLORS[(row.ci + id) % GAS_BAND_COLORS.length],
      alpha: 0.72,
      wave: {
        amp: lerp(0.015, 0.04, srand(id * 43 + i * 3)),
        k: 2,
        phase: srand(id * 47 + i * 5) * Math.PI * 2,
      },
    };
  });

  return {
    power,
    kind: "gas",
    tilt,
    omega,
    base,
    palette: GAS_BAND_COLORS,
    craterColor: "#000000",
    craters: [],
    patches: [],
    bands,
    glint: { phi: R.glint.phi, mu0: (srand(id * 37 + 9) - 0.5) * 1.8 },
    feel,
    storm: {
      phi: lerp(-0.55, 0.55, srand(id * 163 + 7)),
      mu0: srand(id * 167 + 11) * Math.PI * 2,
      delta: R.storm.size,
    },
    ring: {
      i: lerp(R.ring.tiltMin, R.ring.tiltMax, srand(id * 53 + 11)),
      rIn: R.ring.rIn,
      rOut: R.ring.rIn + R.ring.width,
      color: "#e8d9b5",
    },
  };
}

/* —— 按 id 播种的缓存 —— */

const shapeCache = new Map<number, PlanetShape>();

/** 取某行星 id 的静态形状（首次播种并缓存，之后恒等返回）。 */
export function getShape(power: number, id: number): PlanetShape {
  const cached = shapeCache.get(id);
  if (cached) return cached;
  const shape =
    power === 2
      ? buildDwarfShape(power, id)
      : power === 4
        ? buildGasShape(power, id)
        : buildRockShape(power, id);
  shapeCache.set(id, shape);
  return shape;
}
