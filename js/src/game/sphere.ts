/**
 * 球面数学层：单位球参数化、轴倾斜、正交投影、晨昏线（terminator）采样与
 * 夜帽路径 / 轮廓弧段的几何结果。所有函数无副作用，只输出几何数据，
 * 由 PlanetPainter 据此发 CustomPaint 指令。
 *
 * 坐标系约定：
 *  - 体坐标：纬 φ（赤道 0，北极为正）、经 μ（0 基轴），法线 = (cosφ·cosμ, sinφ, cosφ·sinμ)；
 *  - 视角系：x 向右、y 向上、z 朝观察者；绕屏幕 x 轴倾角 τ，把北极倾向观察者；
 *  - 屏幕坐标：中心 (cx, cy)，半径 R，y 向下（x'=x、y'=−y）；
 *  - Flutter 角：0 在 3 点钟，顺时针（屏幕 y 向下）为正。
 *
 * 明暗项圈（terminator）几何：
 *  晨昏线 = 单位球与平面 ⊥ light 的交大圆（中心 0、半径 1）。用 ⊥ light 的正交基
 *  {u, v} 参数化：P(α) = u·cosα + v·sinα。前半球（朝向观察者，z'>0）的那段弧连到
 *  轮廓线的两个穿越点（α = β ± π/2，β = atan2(v.z, u.z) 使 P.z = cos(α−β)·‖xy‖），
 *  连同夜侧轮廓弧一起构成夜帽边界。
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface ScreenPt {
  x: number;
  y: number;
  depth: number;
}

export const normalize = (v: Vec3): Vec3 => {
  const n = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / n, y: v.y / n, z: v.z / n };
};

export const dot = (a: Vec3, b: Vec3): number =>
  a.x * b.x + a.y * b.y + a.z * b.z;

export const cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});

/** 绕屏幕 x 轴倾斜 τ（北极倾向观察者）。 */
export const rotX = (t: number, v: Vec3): Vec3 => {
  const c = Math.cos(t);
  const s = Math.sin(t);
  return { x: v.x, y: v.y * c - v.z * s, z: v.y * s + v.z * c };
};

/** 体坐标法线。 */
export const bodyNormal = (phi: number, mu: number): Vec3 => ({
  x: Math.cos(phi) * Math.cos(mu),
  y: Math.sin(phi),
  z: Math.cos(phi) * Math.sin(mu),
});

/** 倾斜后的视角系法线。 */
export const viewNormal = (phi: number, mu: number, tilt: number): Vec3 =>
  rotX(tilt, bodyNormal(phi, mu));

/** 正交投影到屏幕像素（y 向下）。 */
export const project = (
  n: Vec3,
  cx: number,
  cy: number,
  r: number,
): ScreenPt => ({
  x: cx + n.x * r,
  y: cy - n.y * r,
  depth: n.z,
});

/** 视角系圆盘上某 Flutter 角 θ 对应的轮廓点（屏幕 px）。 */
export const rimPoint = (theta: number, cx: number, cy: number, r: number) => ({
  x: cx + Math.cos(theta) * r,
  y: cy + Math.sin(theta) * r,
});

/** 晨昏线 / 夜帽构造所需的一整套几何。 */
export interface RimArcs {
  /** 受光侧轮廓弧：Flutter 角（0=3点钟，正=屏显顺时针）。 */
  dayStart: number;
  daySweep: number;
  /** 夜侧轮廓弧（自 dayStart 起按绝对值互补的另一侧）。 */
  nightStart: number;
  nightSweep: number;
}

export interface ShadowCap {
  kind: "none" | "full" | "cap";
  /** cap 时：晨昏线前半球采样点（屏幕 px，首点=进入侧穿越点、末点=离开侧穿越点）。 */
  pts: { x: number; y: number }[];
  /** cap 时：晨昏线与轮廓的两个穿越点（屏幕 px）。 */
  crossA: { x: number; y: number };
  crossB: { x: number; y: number };
  /** cap 时：轮廓弧段（供 arcTo / drawArc 使用）。 */
  rim?: RimArcs;
}

/** 归一化到 [0, 2π)。 */
const mod2p = (a: number): number => {
  const m = a % (Math.PI * 2);
  return m < 0 ? m + Math.PI * 2 : m;
};

/**
 * 计算夜帽几何。
 * - kind 'none'：整盘朝日（晨昏线全在背面），无夜帽；
 * - kind 'full'：整盘入夜（光照来自背后）——夜帽退化为整盘；
 * - kind 'cap'：月牙/亏缺，返回夜帽边界路径所需几何。
 * @param light 视角系单位光向量（由表面指向光源，y 向上）。
 */
export function shadowCap(
  light: Vec3,
  cx: number,
  cy: number,
  r: number,
  samples = 24,
): ShadowCap {
  const l = normalize(light);

  // 正面 / 背面极端：light ∥ ẑ 时晨昏线即轮廓圆（z=0），轴向采样无区分度。
  // 光来自观察者一侧（l.z>0）→ 整盘朝日；来自背后（l.z<0）→ 整盘入夜。
  if (Math.abs(l.z) > 0.999999) {
    return l.z > 0
      ? {
          kind: "none",
          pts: [],
          crossA: { x: 0, y: 0 },
          crossB: { x: 0, y: 0 },
        }
      : {
          kind: "full",
          pts: [],
          crossA: { x: 0, y: 0 },
          crossB: { x: 0, y: 0 },
        };
  }

  // ⊥ light 的正交基 {u, v}。
  const u: Vec3 = normalize(cross({ x: 0, y: 0, z: 1 }, l));
  const v = cross(l, u);

  // 前半球弧：P.z = u.z·cosα + v.z·sinα = ‖(u.z,v.z)‖·cos(α−β)，β = atan2(v.z, u.z)。
  const uz = u.z;
  const vz = v.z;

  const depthAt = (a: number) => uz * Math.cos(a) + vz * Math.sin(a);
  // 前半球为 cos(α−β)>0 的 π 宽区间：进入侧 αA = β−π/2，离开侧 αB = β+π/2。
  const beta = Math.atan2(vz, uz);
  const alphaA = beta - Math.PI / 2;
  const alphaB = beta + Math.PI / 2;

  // 若整段 α∈[0,2π) 都朝日（front 覆盖全圈），晨昏线全在背面 → 无夜帽。
  const step = (Math.PI * 2) / samples;
  let frontCount = 0;
  for (let i = 0; i < samples; i++) {
    if (depthAt(i * step) > 1e-9) frontCount++;
  }
  if (frontCount === 0) {
    return {
      kind: "full",
      pts: [],
      crossA: { x: 0, y: 0 },
      crossB: { x: 0, y: 0 },
    };
  }
  if (frontCount === samples) {
    // 晨昏线整体在背面（光照近乎正对观察者）→ 无夜帽。
    return {
      kind: "none",
      pts: [],
      crossA: { x: 0, y: 0 },
      crossB: { x: 0, y: 0 },
    };
  }

  const ptAt = (a: number): ScreenPt => {
    const p = {
      x: Math.cos(a) * u.x + Math.sin(a) * v.x,
      y: Math.cos(a) * u.y + Math.sin(a) * v.y,
      z: Math.cos(a) * u.z + Math.sin(a) * v.z,
    };
    return { x: cx + p.x * r, y: cy - p.y * r, depth: p.z };
  };

  const crossA = ptAt(alphaA); // 夜帽沿轮廓进入侧穿越点
  const crossB = ptAt(alphaB); // 离开侧穿越点

  const thetaA = Math.atan2(crossA.y - cy, crossA.x - cx);
  const thetaB = Math.atan2(crossB.y - cy, crossB.x - cx);

  // 夜侧轮廓弧：轮廓点外法线（视角系 = (cosθ, −sinθ, 0)）· light < 0。
  const nightAt = (th: number) => l.x * Math.cos(th) - l.y * Math.sin(th) < 0;
  const s0 = mod2p(thetaB - thetaA); // A→B 顺向 sweep ∈ [0, 2π)
  const arcPosMid = thetaA + s0 / 2;
  // 两个候选半圈（s0 / s0−2π），选中点落在夜侧的那个作夜帽轮廓。
  const nightSweep = nightAt(arcPosMid) ? s0 : s0 - Math.PI * 2;
  const daySweep = nightSweep > 0 ? s0 - Math.PI * 2 : s0;

  // 前半球晨昏线采样（含两端穿越点，顺序 αA→αB）。
  const pts: { x: number; y: number }[] = [];
  const nFront = Math.max(8, samples);
  for (let k = 0; k <= nFront; k++) {
    const a = alphaA + ((alphaB - alphaA) * k) / nFront;
    const p = ptAt(a);
    pts.push({ x: p.x, y: p.y });
  }

  return {
    kind: "cap",
    pts,
    crossA: { x: crossA.x, y: crossA.y },
    crossB: { x: crossB.x, y: crossB.y },
    rim: {
      dayStart: thetaA,
      daySweep,
      nightStart: thetaA,
      nightSweep,
    },
  };
}

/** 纬度带/极冠采样参数：每 12° 一点；wave 给带中心线叠加「流动」正弦。 */
export interface BandSampleOpts {
  steps?: number;
  /** 波动幅度（弧度，沿纬度方向偏移）。 */
  waveAmp?: number;
  /** 波动波数（沿经度的整数倍）。 */
  waveK?: number;
  /** 波动相位（弧度）。 */
  wavePhase?: number;
}

/**
 * 沿纬度带/极冠中心线采样投影，分段返回前半球折线段（背部线段被剔除）。
 * 返回数组的每个元素是一条连续可见的折线（屏幕 px）。
 */
export function bandSegments(
  phi0: number,
  tilt: number,
  cx: number,
  cy: number,
  r: number,
  opts: BandSampleOpts = {},
): { x: number; y: number }[][] {
  const k = opts.waveK ?? 0;
  const amp = opts.waveAmp ?? 0;
  const phase = opts.wavePhase ?? 0;
  const steps = opts.steps ?? 24;

  const raw: { x: number; y: number; d: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const mu = (i / steps) * Math.PI * 2;
    const phi = amp !== 0 ? phi0 + amp * Math.sin(k * mu + phase) : phi0;
    const p = project(viewNormal(phi, mu, tilt), cx, cy, r);
    raw.push({ x: p.x, y: p.y, d: p.depth });
  }

  // 把深度>0 的连续游程切出来（含跨 μ=0 环绕段）。
  const segs: { x: number; y: number }[][] = [];
  const n = raw.length - 1;
  let run: { x: number; y: number }[] = [];
  const flush = () => {
    if (run.length > 1) segs.push(run);
    run = [];
  };
  for (let i = 0; i < n; i++) {
    if (raw[i].d > 0) {
      run.push({ x: raw[i].x, y: raw[i].y });
    } else {
      flush();
    }
  }
  flush();
  // 环绕：首尾都被截断但实为同一段时（前半球连续跨 μ=0）。
  if (segs.length >= 2) {
    const first = segs[0];
    const last = segs[segs.length - 1];
    if (first.length > 0 && last.length > 0) {
      // 尾部接首部：若接缝处深度方向一致（首首可拼接）则合并。
      const j =
        (first[0].x - last[last.length - 1].x) ** 2 +
        (first[0].y - last[last.length - 1].y) ** 2;
      if (j < 1e-6) {
        last.pop();
        segs[0] = [...last, ...first];
        segs.pop();
      }
    }
  }
  return segs;
}
