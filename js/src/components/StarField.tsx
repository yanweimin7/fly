import React, { useState, useEffect, useRef } from "react";
import {
  Stack,
  Image,
  Positioned,
  Container,
  resolveBundleAssetPath,
} from "fuickjs";

interface StarFieldProps {
  /** 屏幕宽度（由宿主页解析真实尺寸后传入）。 */
  width: number;
  /** 屏幕高度（由宿主页解析真实尺寸后传入）。 */
  height: number;
}

const NUM_STARS = 70;

/** 用固定 seed 的简单伪随机生成可复现的星星参数。 */
function seededRandom(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

type StarKind = "cross" | "glow" | "pin";

interface Star {
  x: number;
  y: number;
  kind: StarKind;
  /** 核心半径（行星大小）。 */
  core: number;
  /** 光芒半长，== core * 比例，星星越大芒越长。 */
  ray: number;
  phase: number;
  /** 多层闪烁频率。 */
  a: number;
  b: number;
  c: number;
  base: number;
  amp: number;
  color: string;
}

function generateStars(w: number, h: number): Star[] {
  const stars: Star[] = [];
  for (let i = 0; i < NUM_STARS; i++) {
    const r = seededRandom(i * 13);
    const kind: StarKind = r < 0.08 ? "cross" : r < 0.5 ? "glow" : "pin";
    const cr = seededRandom(i * 17);
    const color = cr < 0.1 ? "#cfe4ff" : cr < 0.18 ? "#ffe9c4" : "#ffffff";
    const core =
      kind === "cross"
        ? 2.2 + seededRandom(i * 5) * 1.6
        : kind === "glow"
          ? 1.4 + seededRandom(i * 5) * 1.1
          : 0.7 + seededRandom(i * 5) * 0.7;
    const rayRatio = kind === "cross" ? 6.5 : kind === "glow" ? 3.6 : 2.2;
    stars.push({
      x: seededRandom(i * 3 + 1) * w,
      y: seededRandom(i * 3 + 2) * h,
      kind,
      core,
      ray: core * rayRatio,
      phase: seededRandom(i * 7) * Math.PI * 2,
      a: 0.4 + seededRandom(i * 11) * 0.9,
      b: 1.1 + seededRandom(i * 19) * 1.4,
      c: 0.6 + seededRandom(i * 23) * 2.0,
      base: kind === "pin" ? 0.22 : 0.32,
      amp: kind === "pin" ? 0.5 : 0.66,
      color,
    });
  }
  return stars;
}

/** 6 位 hex 追加 alpha(0..1) 转 8 位。 */
function alphaColor(hex6: string, opacity: number): string {
  const a = Math.max(
    0,
    Math.min(255, Math.round(Math.max(0, Math.min(1, opacity)) * 255)),
  )
    .toString(16)
    .padStart(2, "0");
  return `${hex6}${a}`;
}

/** 不规则闪烁亮度（0..1）：多层正弦叠加，模拟真实星光的明暗起伏。 */
function twinkle(t: number, s: Star): number {
  const v =
    0.55 * Math.sin(t * s.a * 2 + s.phase) +
    0.3 * Math.sin(t * s.b * 2 + s.phase * 1.7 + 1.2) +
    0.15 * Math.sin(t * s.c * 2 + s.phase * 0.4);
  const n = (v / 0.9 + 1) / 2; // 归一化到 0..1
  return s.base + s.amp * n;
}

/** 星体：模拟真实星星照片——
 * 1) 炽白星核：径向渐变，中心过曝发白、向外迅速衰减；
 * 2) 柔和氛围光晕：更大半径的径向渐变，淡且范围广；
 * 3) 衍射芒：细、淡、长的十字条纹（亮度远低于星核），越大的星芒越长。 */
function StarShape({ star, opacity }: { star: Star; opacity: number }) {
  const r = star.core;
  const haloR = r * (star.kind === "pin" ? 1.8 : 3.0);
  const spikeW = Math.max(0.5, r * 0.36);
  const c = Math.max(star.ray * 2, haloR * 2) / 2;
  const outer = c * 2;
  const spikePeak =
    opacity *
    (star.kind === "cross" ? 0.55 : star.kind === "glow" ? 0.35 : 0.22);

  const tip = alphaColor(star.color, 0);
  const mid = alphaColor(star.color, Math.min(1, spikePeak));
  const halo = (a: number) => alphaColor(star.color, a);
  const core = (a: number) => alphaColor("#ffffff", a);

  return (
    <Stack width={outer} height={outer}>
      {/* 氛围光晕 */}
      <Positioned
        left={c - haloR}
        top={c - haloR}
        width={haloR * 2}
        height={haloR * 2}
      >
        <Container
          width={haloR * 2}
          height={haloR * 2}
          decoration={{
            gradient: {
              type: "radial",
              colors: [
                halo(Math.min(1, opacity * 0.3)),
                halo(opacity * 0.1),
                halo(0),
              ],
              stops: [0.12, 0.5, 1],
            },
            borderRadius: haloR,
          }}
        />
      </Positioned>
      {/* 水平衍射芒 */}
      <Positioned left={0} top={c - spikeW / 2} width={outer} height={spikeW}>
        <Container
          width={outer}
          height={spikeW}
          decoration={{
            gradient: {
              type: "linear",
              begin: "centerLeft",
              end: "centerRight",
              colors: [tip, mid, tip],
              stops: [0, 0.5, 1],
            },
            borderRadius: spikeW / 2,
          }}
        />
      </Positioned>
      {/* 竖直衍射芒 */}
      <Positioned left={c - spikeW / 2} top={0} width={spikeW} height={outer}>
        <Container
          width={spikeW}
          height={outer}
          decoration={{
            gradient: {
              type: "linear",
              begin: "topCenter",
              end: "bottomCenter",
              colors: [tip, mid, tip],
              stops: [0, 0.5, 1],
            },
            borderRadius: spikeW / 2,
          }}
        />
      </Positioned>
      {/* 炽白星核：过曝中心 + 快速衰减 */}
      <Positioned left={c - r} top={c - r} width={r * 2} height={r * 2}>
        <Container
          width={r * 2}
          height={r * 2}
          decoration={{
            gradient: {
              type: "radial",
              colors: [
                core(Math.min(1, 0.4 + opacity * 0.6)),
                core(opacity * 0.55),
                core(0),
              ],
              stops: [0, 0.32, 1],
            },
            borderRadius: r,
          }}
        />
      </Positioned>
    </Stack>
  );
}

/** 全屏背景：静态星空图片铺满屏幕 + 近似真实的闪烁星空（每颗星带十字光芒）。 */
export default function StarField({ width, height }: StarFieldProps) {
  const imagePath = resolveBundleAssetPath("images/space_bg.png") as string;

  const dimsRef = useRef<string>("");
  const starsRef = useRef<Star[]>([]);
  const dims = `${width}x${height}`;
  if (starsRef.current.length === 0 || dimsRef.current !== dims) {
    dimsRef.current = dims;
    starsRef.current = generateStars(width, height);
  }

  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 80);
    return () => clearInterval(id);
  }, []);

  const t = tick * 0.12; // 近似秒，驱动闪烁频率

  return (
    <Stack fit="expand">
      <Image src={imagePath} width={width} height={height} fit="cover" />
      {starsRef.current.map((star, i) => {
        const opacity = twinkle(t, star);
        const key = `star-${i}`;
        const left = star.x - star.ray;
        const top = star.y - star.ray;
        const box = star.ray * 2;
        return (
          <Positioned key={key} left={left} top={top} width={box} height={box}>
            <StarShape star={star} opacity={opacity} />
          </Positioned>
        );
      })}
    </Stack>
  );
}
