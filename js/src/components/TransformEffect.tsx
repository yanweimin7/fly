import React from "react";
import { Stack, Positioned, Container } from "fuickjs";
import type { GameState } from "../store/game";
import {
  TRANSFORM_COLLAPSE,
  TRANSFORM_EXPLODE,
  TRANSFORM_TOTAL,
} from "../game/config";

/** 线性插值。 */
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** 将 6 位 hex 追加 alpha(0..1) 变成 8 位。 */
const alpha = (hex6: string, a: number): string =>
  hex6 +
  Math.max(0, Math.min(255, Math.round(a * 255)))
    .toString(16)
    .padStart(2, "0");

interface Props {
  state: GameState;
  screenW: number;
  screenH: number;
}

/** 宇宙结局转场动画：所有物质团聚成一个蓝点 → 蓝点爆炸 → 扩散化为宇宙。
 * 覆盖在 GameField 之上，按 state.transformT 在三阶段之间推进。 */
export default function TransformEffect({ state, screenW, screenH }: Props) {
  if (!state.transform) return null;
  const t = state.transformT;
  const C = TRANSFORM_COLLAPSE;
  const E = TRANSFORM_EXPLODE;
  const TOT = TRANSFORM_TOTAL;
  const cx = screenW / 2;
  const cy = screenH / 2;

  const nodes: React.ReactNode[] = [];

  // —— 阶段一：团聚成蓝点 ——
  if (t < C) {
    const p = t / C; // 0→1，物质向中心汇聚
    const r = lerp(56, 5, p);
    nodes.push(
      <Positioned
        key="collapse"
        left={cx - r}
        top={cy - r}
        width={r * 2}
        height={r * 2}
      >
        <Container
          width={r * 2}
          height={r * 2}
          decoration={{
            gradient: {
              type: "radial",
              colors: [alpha("#ffffff", 0.35 + 0.65 * p), "#4d9bff", "#1b4fd0"],
              stops: [0, 0.6, 1],
            },
            borderRadius: r,
            boxShadow: {
              color: alpha("#4d9bff", 0.8),
              blurRadius: 26 - 12 * p,
            },
          }}
        />
      </Positioned>,
    );
  }

  // —— 阶段二：爆炸 ——
  if (t >= C && t < E) {
    const q = (t - C) / (E - C); // 0→1
    const ringR = lerp(6, 220, q);
    const ringW = lerp(8, 2, q);
    const flashR = lerp(4, 150, q);
    nodes.push(
      <Positioned key="core" left={cx - 8} top={cy - 8} width={16} height={16}>
        <Container
          width={16}
          height={16}
          decoration={{
            color: alpha("#ffffff", 0.9 + 0.1 * q),
            borderRadius: 8,
            boxShadow: { color: "#7fb2ff", blurRadius: 40 },
          }}
        />
      </Positioned>,
      <Positioned
        key="ring"
        left={cx - ringR}
        top={cy - ringR}
        width={ringR * 2}
        height={ringR * 2}
      >
        <Container
          width={ringR * 2}
          height={ringR * 2}
          decoration={{
            border: { color: alpha("#8ec5ff", 0.9 - 0.5 * q), width: ringW },
            borderRadius: ringR,
          }}
        />
      </Positioned>,
      <Positioned
        key="flash"
        left={cx - flashR}
        top={cy - flashR}
        width={flashR * 2}
        height={flashR * 2}
      >
        <Container
          width={flashR * 2}
          height={flashR * 2}
          decoration={{
            gradient: {
              type: "radial",
              colors: [
                alpha("#ffffff", 0.85 - 0.45 * q),
                alpha("#5aa8ff", 0.5 - 0.35 * q),
                alpha("#000000", 0),
              ],
              stops: [0, 0.5, 1],
            },
            borderRadius: flashR,
          }}
        />
      </Positioned>,
    );
  }

  // —— 阶段三：扩散化为宇宙 ——
  if (t >= E) {
    const s = Math.min(1, (t - E) / (TOT - E)); // 0→1
    const cov = Math.max(screenW, screenH) * 1.4;
    const R = lerp(1, cov, s);
    // 亮雾向全屏铺开，最终成为一片明亮的宇宙星海（覆盖星空底）。
    nodes.push(
      <Positioned
        key="universe"
        left={cx - R}
        top={cy - R}
        width={R * 2}
        height={R * 2}
      >
        <Container
          width={R * 2}
          height={R * 2}
          decoration={{
            gradient: {
              type: "radial",
              colors: [
                alpha("#ffffff", 0.4 + 0.6 * s),
                alpha("#9cc4ff", 0.5 + 0.5 * s),
                alpha("#14204a", 0.9),
              ],
              stops: [0, 0.45, 1],
            },
            borderRadius: R,
          }}
        />
      </Positioned>,
    );
  }

  return (
    <Stack width={screenW} height={screenH}>
      {nodes}
    </Stack>
  );
}
