/**
 * 行星 2.5D 球面光照渲染的指令生成器。
 *
 * 把方案（docs/planet-2.5d-rendering.md）§9 的绘制顺序落成 CustomPaint 指令：
 * 环-后 → clip 圆盘 → 底 → 云带/极冠 → 陨石坑 → 夜帽 → restore → 轮廓 →
 * 半球暗边 → glint → 环-前。纯函数式：同一次调用重新输出全部指令，
 * 由 Planet.tsx 在 render 时重建，随 React 30fps tick 重绘。
 */

import { CustomPainter, Path } from "fuickjs";
import type { Vec3 } from "../game/sphere";
import {
  bandSegments,
  dot,
  normalize,
  project,
  shadowCap,
  viewNormal,
} from "../game/sphere";
import {
  alphaOf,
  alignFromDir,
  clamp,
  getShape,
  shade,
  smoothstep,
} from "../game/planetShape";
import type {
  BandDef,
  CraterDef,
  PlanetShape,
  SurfaceFeel,
} from "../game/planetShape";
import { PLANET_GFX } from "../game/config";

type Lod = "simple" | "medium" | "full";

const DISK_RECT = (r: number) => ({
  left: 0,
  top: 0,
  width: r * 2,
  height: r * 2,
});

/** 由实体属性生成整组绘制指令（先 clear 再调用本函数）。 */
export function drawPlanet(
  p: CustomPainter,
  power: number,
  radius: number,
  id: number,
  time: number,
): void {
  const shape = getShape(power, id);
  const r = Math.max(1, radius);
  const C = r;
  const light = normalize(PLANET_GFX.light);
  const feel = shape.feel;

  const d = r * 2;
  const lod: Lod =
    d < PLANET_GFX.lod.simple
      ? "simple"
      : d < PLANET_GFX.lod.full
        ? "medium"
        : "full";

  if (shape.ring) {
    const ring = shape.ring;
    drawRingHalf(p, ring.rIn, ring.rOut, ring.color, ring.i, r, C, false);
  }
  p.save();
  const disk = new Path();
  disk.addOval({ left: 0, top: 0, width: d, height: d });
  p.clipPath(disk);

  drawBodyBase(p, shape.base, r, C, light, feel);
  drawPatches(p, shape, r, C, time);
  if (shape.kind === "dwarf" || shape.kind === "gas") {
    drawBands(p, shape.omega, shape.tilt, shape.bands, r, time);
  }
  if (lod === "full" && shape.storm) {
    drawStorm(p, shape.tilt, shape.omega, shape.storm, r, time);
  }
  if (shape.craters.length > 0) {
    drawCraters(p, shape, r, C, time, light, lod);
  }
  drawNightCap(p, r, C, light, feel);

  p.restore();

  drawRims(p, r, C, light);
  drawLimb(p, r, C);
  if (lod === "full") {
    drawGlint(p, shape.tilt, shape.omega, shape.glint, r, time, light, feel);
  }
  if (shape.ring) {
    const ring = shape.ring;
    drawRingHalf(p, ring.rIn, ring.rOut, ring.color, ring.i, r, C, true);
  }
}

/* —— 底：受光侧亮 → 背光侧暗 —— */

function drawBodyBase(
  p: CustomPainter,
  base: string,
  r: number,
  C: number,
  light: Vec3,
  feel: SurfaceFeel,
) {
  // 屏幕方向朝光 = (lx, −ly)；亮端对准光源。
  const bright = alignFromDir(light.x, -light.y);
  const dark = alignFromDir(-light.x, light.y);
  // feel：exposure 整体提亮/压暗，contrast 拉开或收拢明暗对比——每颗星球阴影深浅不同。
  const e = feel.exposure;
  const c = feel.contrast;
  // 小体积天体（陨石/小行星）压低顶部高光、暗侧更陡：避免整个小球被提白而显得灰白无色，
  // 只保留明显的日/夜面让颜色和立体感同时立住。
  const small = r < 10;
  const sc = small ? c * 1.35 : c;
  const dark2 = clamp(-0.45 * sc, -0.85, -0.18);
  p.drawCircle({ dx: C, dy: C }, r, {
    gradient: {
      type: "linear",
      colors: [
        shade(base, small ? 0.18 + e * 0.05 : 0.34 + e * 0.05),
        shade(base, (e - 1) * 0.8),
        shade(base, -0.2 * sc + (e - 1) * 0.4),
        shade(base, dark2 + (e - 1) * 0.3),
      ],
      stops: small ? [0, 0.42, 0.74, 1] : [0, 0.38, 0.72, 1],
      begin: bright,
      end: dark,
    },
  });
}

/* —— 云带 / 极冠：前半球折线 stroke，随自转流动 —— */

function drawBands(
  p: CustomPainter,
  omega: number,
  tilt: number,
  bands: BandDef[],
  r: number,
  time: number,
) {
  const delta = omega * time;
  for (const band of bands) {
    const wave = band.wave;
    const wavePhase = wave ? wave.phase - wave.k * delta : 0;
    const segs = bandSegments(band.phi, tilt, r, r, r, {
      steps: 24,
      waveAmp: wave?.amp,
      waveK: wave?.k,
      wavePhase,
    });
    const cos = Math.abs(Math.cos(band.phi));
    const width =
      band.widthFactor != null
        ? Math.max(1, r * band.widthFactor)
        : Math.max(1, 2 * band.halfWidth * r * Math.max(0.15, cos));
    // 云带（有 wave 的气态带）分两层：暗色加宽底带 + 主色带，制造「槽谷」立体感。
    const layered = band.wave != null;
    for (const seg of segs) {
      if (seg.length < 2) continue;
      const path = new Path();
      path.moveTo(seg[0].x, seg[0].y);
      for (let i = 1; i < seg.length; i++) path.lineTo(seg[i].x, seg[i].y);
      const closedRing =
        segs.length === 1 &&
        Math.hypot(
          seg[0].x - seg[seg.length - 1].x,
          seg[0].y - seg[seg.length - 1].y,
        ) < 1e-3;
      if (closedRing) path.close();
      if (layered) {
        p.drawPath(path, {
          color: alphaOf(shade(band.color, -0.28), band.alpha * 0.4),
          style: "stroke",
          strokeWidth: width * 1.5,
          strokeCap: "round",
          isAntiAlias: true,
        });
      }
      p.drawPath(path, {
        color: alphaOf(band.color, layered ? band.alpha * 0.85 : band.alpha),
        style: "stroke",
        strokeWidth: width,
        strokeCap: "round",
        isAntiAlias: true,
      });
    }
  }
}

/* —— 气态行星风暴（大红斑一类）：赤道附近的暖色漩涡，随自转移动 —— */

function drawStorm(
  p: CustomPainter,
  tilt: number,
  omega: number,
  storm: NonNullable<PlanetShape["storm"]>,
  r: number,
  time: number,
) {
  const S = PLANET_GFX.storm;
  const mu = storm.mu0 + omega * time;
  const n = viewNormal(storm.phi, mu, tilt);
  const sp = project(n, r, r, r);
  if (sp.depth <= 0) return;
  const ry = storm.delta * r * 1.15; // 风暴横向略拉长，模拟剪切漩涡
  const rxx = Math.max(0.5, ry * Math.max(0.4, sp.depth)); // 球面透视缩短
  // 深色漩涡核 + 一圈暖色晕，中心略偏光一侧更像风暴。
  p.save();
  p.translate(sp.x, sp.y);
  p.rotate(Math.atan2(sp.y - r, sp.x - r));
  p.drawOval(
    { left: -rxx, top: -ry, width: rxx * 2, height: ry * 2 },
    {
      gradient: {
        type: "radial",
        colors: [
          alphaOf("#7a2512", S.alpha * 0.85),
          alphaOf(S.color, S.alpha * 0.55),
          alphaOf(S.color, 0),
        ],
        stops: [0, 0.45, 1],
        rect: { left: -rxx, top: -ry, width: rxx * 2, height: ry * 2 },
      },
      isAntiAlias: true,
    },
  );
  p.restore();
}

/* —— 表面斑驳：大块柔和明/暗 radial 渐变补丁，随自转流动 —— */

function drawPatches(
  p: CustomPainter,
  shape: PlanetShape,
  r: number,
  C: number,
  time: number,
) {
  const R = PLANET_GFX.mottle;
  if (shape.patches.length === 0) return;
  const delta = shape.omega * time;
  // 按半径取子集：大行星多些地形块，陨石级的小星体至少留 3 块明暗补丁，
  // 保证最小的球也有可见纹理（而不是一块光滑渐变）。
  const small = r < 10;
  const maxP = clamp(
    Math.round(small ? r / 3 : r / 5),
    3,
    shape.patches.length,
  );
  for (let i = 0; i < maxP; i++) {
    const pt = shape.patches[i];
    const mu = pt.mu0 + delta;
    const n = viewNormal(pt.phi, mu, shape.tilt);
    const sp = project(n, C, C, r);
    if (sp.depth <= 0) continue;
    // 小体积天体纹理会更强（大星球上极淡的斑驳在陨石尺寸下不可见）。
    const boost = small ? 1.8 : 1;
    // feel.mottle 缩放地形起伏幅度：起伏大的星球明暗补丁更明显。
    const shadeT = R.shade * shape.feel.mottle * boost;
    const col = pt.lighter
      ? shade(shape.base, shadeT)
      : shade(shape.base, -shadeT);
    const rx = Math.max(1, pt.delta * r * sp.depth);
    const ry = Math.max(1, pt.delta * r);
    const alpha = pt.alpha * boost;
    // radial 渐变自带宽软边；rect 锁到补丁椭圆，峰值收敛在中心。
    p.drawOval(
      { left: sp.x - rx, top: sp.y - ry, width: rx * 2, height: ry * 2 },
      {
        gradient: {
          type: "radial",
          colors: [alphaOf(col, alpha), alphaOf(col, 0)],
          stops: [0, 1],
          rect: {
            left: sp.x - rx,
            top: sp.y - ry,
            width: rx * 2,
            height: ry * 2,
          },
        },
        isAntiAlias: true,
      },
    );
  }
}

/* —— 陨石坑：球面透视缩短（径向压扁 + 近轮廓淡出） —— */

function drawCraters(
  p: CustomPainter,
  shape: PlanetShape,
  r: number,
  C: number,
  time: number,
  light: Vec3,
  lod: Lod,
) {
  const R = PLANET_GFX.crater;
  // 按半径取子集：星体越大坑田越密。小星体（陨石/小行星）取最大的若干颗坑，
  // 保证哪怕最小体积也有密集可见的轰击疤痕；大行星取生成序前若干颗（幂律先画大坑）。
  const small = r < 10;
  const isFull = lod === "full";
  const n = isFull
    ? clamp(Math.round(r / 2.8), 4, shape.craters.length)
    : clamp(Math.round(r / 1.4), 4, shape.craters.length);
  const craters: CraterDef[] = isFull
    ? shape.craters.slice(0, n)
    : shape.craters
        .map((c, i) => ({ c, i }))
        .sort((a, b) => b.c.delta - a.c.delta)
        .slice(0, n)
        .sort((a, b) => a.i - b.i)
        .map((s) => s.c);
  // 小星体放宽坑尺寸下限 & 把坑画得略大一点，让陨石级球面上坑田密且清晰。
  const minPx = R.minPx * (small ? 0.7 : 1);
  const sizeK = small ? Math.min(1.4, 1 + (10 - r) * 0.05) : 1;
  // 陨石级保底坑角尺寸：种子随机的坑大半是幂律里的小碎茬，直接按原尺寸画在小球上
  // 几乎不可见——这里统一抬到至少 0.15 角弧，任何种子都看得出成片的坑田。
  const minDelta = small ? 0.15 : R.sizeMin;
  const delta = shape.omega * time;
  // 屏幕光向（y 向下），用于坑的亮边/影池朝向。
  const ls = { x: light.x, y: -light.y };
  for (const c of craters) {
    const mu = c.mu0 + delta;
    const nrm = viewNormal(c.phi, mu, shape.tilt);
    const sp = project(nrm, C, C, r);
    if (sp.depth <= 0) continue;
    // 朝暗面更深处省略（小星体放宽，让更多坑转到暗侧仍可见），交给夜帽统一压暗。
    if (dot(nrm, light) < (small ? -0.25 : -0.1)) continue;
    const angle = Math.atan2(sp.y - C, sp.x - C);
    const ry = Math.max(c.delta, minDelta) * r * sizeK;
    if (ry < minPx) continue; // 太小的坑直接跳过，省指令
    const radius = Math.max(0.3, ry * sp.depth);
    const fade = clamp(sp.depth * 4, 0, 1);
    // 小体积天体的坑给更强 alpha，确保陨石尺寸下坑沿清晰可见。
    const a = c.alpha * fade * (small ? 1.45 : 1);
    if (a <= 0.01) continue;
    // feel.craterDepth 缩放坑深（影池浓度）：深的星球坑更黑、浅的更平。
    const depth = clamp(shape.feel.craterDepth, 0.6, 1.25);

    // 旋转帧里把屏幕光向投影到局部轴（x=径向、y=切向），决定朝光/朝影偏移。
    const cs = Math.cos(angle);
    const sn = Math.sin(angle);
    const lRad = ls.x * cs + ls.y * sn;
    const lTan = -ls.x * sn + ls.y * cs;

    p.save();
    p.translate(sp.x, sp.y);
    p.rotate(angle);

    // 1) 亮边环：略大于坑体、朝光偏移的柔和亮盘（亮→暗归一化渐变，只露朝光那半边）。
    //    被坑体盖掉大半，露出的部分 = 环形山朝向光源的亮壁。
    const rimRx = radius * R.rimScale;
    const rimRy = ry * R.rimScale;
    const rimOx = lRad * ry * R.rimOffset;
    const rimOy = lTan * ry * R.rimOffset;
    p.drawOval(
      {
        left: -rimRx + rimOx,
        top: -rimRy + rimOy,
        width: rimRx * 2,
        height: rimRy * 2,
      },
      {
        gradient: {
          type: "radial",
          colors: [
            alphaOf(shade(shape.base, 0.38), 0),
            alphaOf(shade(shape.base, 0.38), a * R.rimAlpha * 0.55),
            alphaOf(shade(shape.base, 0.38), a * R.rimAlpha * 0.4),
          ],
          stops: [0, 0.6, 1],
          rect: {
            left: -rimRx + rimOx,
            top: -rimRy + rimOy,
            width: rimRx * 2,
            height: rimRy * 2,
          },
        },
        isAntiAlias: true,
      },
    );

    // 2) 暗坑体：径向渐变小一圈、朝影偏移——中心最暗，边缘让亮边环透出来。
    const fRx = radius * R.floorScale;
    const fRy = ry * R.floorScale;
    const fOx = -lRad * ry * R.floorOffset;
    const fOy = -lTan * ry * R.floorOffset;
    p.drawOval(
      { left: -fRx + fOx, top: -fRy + fOy, width: fRx * 2, height: fRy * 2 },
      {
        gradient: {
          type: "radial",
          colors: [
            alphaOf(shape.craterColor, a * depth),
            alphaOf(shape.craterColor, a * 0.35 * depth),
            alphaOf(shape.craterColor, 0),
          ],
          stops: [0, 0.65, 1],
          rect: {
            left: -fRx + fOx,
            top: -fRy + fOy,
            width: fRx * 2,
            height: fRy * 2,
          },
        },
        isAntiAlias: true,
      },
    );
    p.restore();
  }
}

/* —— 夜帽：晨昏线 → 夜侧轮廓的月牙，线性渐变压暗 —— */

function drawNightCap(
  p: CustomPainter,
  r: number,
  C: number,
  light: Vec3,
  feel: SurfaceFeel,
) {
  const R = PLANET_GFX.nightCap;
  // feel：haze 越大晨昏线越弥散（blur 大、夜侧更亮的大气散射）；exposure 影响夜帽浓度。
  const hazeSoft = 0.55 + feel.haze * 0.45;
  const alpha =
    R.alpha * (1.25 - hazeSoft * 0.5) * (1 - (feel.exposure - 1) * 0.25);
  if (alpha <= 0) return;
  const dark = "#05070d";
  const fill = {
    gradient: {
      type: "linear" as const,
      // 非线性停靠让明暗过渡更快收敛，避免晨昏线处残留明显 alpha；配合 blur 羽化边界。
      colors: [
        alphaOf(dark, alpha),
        alphaOf(dark, alpha * 0.5),
        alphaOf(dark, 0),
      ],
      stops: [0, 0.5, 1],
      begin: alignFromDir(-light.x, light.y),
      end: alignFromDir(light.x, -light.y),
    },
    blur: R.blur > 0 ? r * R.blur * hazeSoft : undefined,
  };
  const cap = shadowCap(light, C, C, r);
  if (cap.kind === "full") {
    p.drawCircle({ dx: C, dy: C }, r, fill);
    return;
  }
  if (cap.kind !== "cap" || !cap.rim || cap.pts.length < 2) return;

  const path = new Path();
  path.moveTo(cap.pts[0].x, cap.pts[0].y);
  path.arcTo(DISK_RECT(r), cap.rim.nightStart, cap.rim.nightSweep, false);
  const pts = cap.pts;
  const n = pts.length - 1;
  for (let i = n; i >= 1; i--) {
    const c = pts[i];
    const to = {
      x: (pts[i].x + pts[i - 1].x) / 2,
      y: (pts[i].y + pts[i - 1].y) / 2,
    };
    path.quadraticBezierTo(c.x, c.y, to.x, to.y);
  }
  path.close();
  p.drawPath(path, fill);
}

/* —— 轮廓：受光侧细白边 / 夜侧压暗 —— */

function drawRims(p: CustomPainter, r: number, C: number, light: Vec3) {
  const R = PLANET_GFX.rim;
  const rect = DISK_RECT(r);
  const sw = Math.max(1, r * R.stroke);
  const cap = shadowCap(light, C, C, r);
  if (cap.kind === "full") {
    // 光在正后方：整盘入夜只剩一条朝光轮廓辨方向。
    p.drawArc(rect, 0, Math.PI * 2, false, {
      color: alphaOf("#ffffff", R.dayAlpha * 0.5),
      style: "stroke",
      strokeWidth: sw,
      blur: r * R.blur,
      isAntiAlias: true,
    });
    return;
  }
  if (cap.kind !== "cap" || !cap.rim) return;
  p.drawArc(rect, cap.rim.dayStart, cap.rim.daySweep, false, {
    color: alphaOf("#ffffff", R.dayAlpha),
    style: "stroke",
    strokeWidth: sw,
    blur: r * R.blur,
    isAntiAlias: true,
  });
  p.drawArc(rect, cap.rim.nightStart, cap.rim.nightSweep, false, {
    color: alphaOf("#000000", R.nightAlpha),
    style: "stroke",
    strokeWidth: sw,
    blur: r * R.blur,
    isAntiAlias: true,
  });
}

/* —— 整体半球暗边（纵深）：径向渐变 —— */

function drawLimb(p: CustomPainter, r: number, C: number) {
  const a = PLANET_GFX.limb.alpha;
  if (a <= 0) return;
  p.drawCircle({ dx: C, dy: C }, r, {
    gradient: {
      type: "radial",
      colors: [
        alphaOf("#000000", 0),
        alphaOf("#000000", 0),
        alphaOf("#000000", a),
      ],
      stops: [0, 0.55, 1],
    },
  });
}

/* —— 镜面高光：随自转移动、翻过晨昏线消失 —— */

function drawGlint(
  p: CustomPainter,
  tilt: number,
  omega: number,
  glint: PlanetShape["glint"],
  r: number,
  time: number,
  light: Vec3,
  feel: SurfaceFeel,
) {
  const R = PLANET_GFX.glint;
  const mu = glint.mu0 + omega * time;
  const n = viewNormal(glint.phi, mu, tilt);
  const sp = project(n, r, r, r);
  if (sp.depth <= 0) return;
  const lit = dot(n, light);
  if (lit <= R.minLit) return;
  // feel.glint 0(哑光)→1(亮面)：部分星球基本无镜面高光，部分有光泽点。
  const a =
    Math.min(1.15, feel.glint + 0.25) *
    R.maxAlpha *
    smoothstep(R.minLit, 0.5, lit);
  const gr = r * R.radius;
  p.drawCircle({ dx: sp.x, dy: sp.y }, gr, {
    gradient: {
      type: "radial",
      colors: [alphaOf("#ffffff", a), alphaOf("#ffffff", 0)],
      stops: [0, 1],
      rect: { left: sp.x - gr, top: sp.y - gr, width: gr * 2, height: gr * 2 },
    },
    blur: r * R.blur,
  });
}

/* —— 行星环：深度排序（后环先画、前环后画） —— */

function drawRingHalf(
  p: CustomPainter,
  rIn: number,
  rOut: number,
  color: string,
  tiltI: number,
  r: number,
  C: number,
  front: boolean,
) {
  const R = PLANET_GFX.ring;
  const rx = r * R.Rm;
  const ry = rx * Math.sin(tiltI);
  const rect = { left: C - rx, top: C - ry, width: rx * 2, height: ry * 2 };
  p.drawArc(rect, front ? 0 : Math.PI, Math.PI, false, {
    color: alphaOf(color, front ? R.frontAlpha : R.backAlpha),
    style: "stroke",
    strokeWidth: Math.max(1, r * (rOut - rIn)),
    blur: r * 0.025,
    isAntiAlias: true,
  });
}
