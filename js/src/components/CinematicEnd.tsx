import React from "react";
import { Stack, Positioned, Container } from "fuickjs";
import type { GameState } from "../store/game";
import { STAGES, VW, VH, CENTER_X, CENTER_Y } from "../game/config";
import StarField from "./StarField";

const MARGIN = 60;

/** 宇宙创生结局动画：团聚 → 蓝点 → 爆炸扩散成星空。 */
export default function CinematicEnd({ state }: { state: GameState }) {
  const e = state.ending;
  if (!e) return null;
  const nodes: React.ReactNode[] = [];

  const bodies: React.ReactNode[] = [];
  for (const b of [...state.entities, ...state.satellites]) {
    const sx = CENTER_X + b.x;
    const sy = CENTER_Y + b.y;
    const r = Math.max(1.5, b.radius);
    if (sx < -MARGIN || sx > VW + MARGIN || sy < -MARGIN || sy > VH + MARGIN)
      continue;
    const stage = STAGES[b.power] ?? STAGES[0];
    bodies.push(
      <React.Fragment key={`cb${b.id}`}>
        <Positioned left={sx - r} top={sy - r} width={r * 2} height={r * 2}>
          <Container
            width={r * 2}
            height={r * 2}
            decoration={{ color: stage.color, borderRadius: r }}
          />
        </Positioned>
      </React.Fragment>,
    );
  }
  nodes.push(...bodies);

  if (e.phase === "converge") {
    // 玩家在团聚阶段随吞噬膨胀，仍居中。
    const r = Math.max(8, state.player.radius);
    nodes.push(
      <React.Fragment key="cb-player">
        <Positioned
          left={CENTER_X - r}
          top={CENTER_Y - r}
          width={r * 2}
          height={r * 2}
        >
          <Container
            width={r * 2}
            height={r * 2}
            decoration={{
              color: STAGES[state.stageIndex].color,
              borderRadius: r,
              boxShadow: { color: "#7c4dff", blurRadius: 20 },
            }}
          />
        </Positioned>
      </React.Fragment>,
    );
  }

  if (e.phase === "blue") {
    // 发亮的小蓝点：青白小球 + 随 t 增强并闪烁的光晕。
    const r = Math.max(6, 10 * (1 - 0.3 * e.t));
    const pulse = 0.6 + 0.6 * Math.abs(Math.sin(e.t * Math.PI * 6));
    const blur = 24 + 26 * pulse;
    nodes.push(
      <React.Fragment key="cb-blue">
        <Positioned
          left={CENTER_X - r}
          top={CENTER_Y - r}
          width={r * 2}
          height={r * 2}
        >
          <Container
            width={r * 2}
            height={r * 2}
            decoration={{
              color: "#40c4ff",
              borderRadius: r,
              boxShadow: {
                color: `rgba(64,196,255,${(0.5 + 0.5 * pulse).toFixed(2)})`,
                blurRadius: blur,
              },
            }}
          />
        </Positioned>
      </React.Fragment>,
    );
  }

  if (e.phase === "bang") {
    // 粒子自中心向外扩散并淡出；同时叠一层全屏扩散光环。
    const t = e.t;
    const fade = 1 - t;
    for (let i = 0; i < (e.particles?.length ?? 0); i++) {
      const p = e.particles![i];
      const d = p.speed * t;
      const sx = CENTER_X + Math.cos(p.angle) * d;
      const sy = CENTER_Y + Math.sin(p.angle) * d;
      const r = p.radius;
      if (sx < -MARGIN || sx > VW + MARGIN || sy < -MARGIN || sy > VH + MARGIN)
        continue;
      nodes.push(
        <React.Fragment key={`cb-party-${i}`}>
          <Positioned left={sx - r} top={sy - r} width={r * 2} height={r * 2}>
            <Container
              width={r * 2}
              height={r * 2}
              decoration={{
                color: `rgba(${hexToRgb(p.color, fade)})`,
                borderRadius: r,
              }}
            />
          </Positioned>
        </React.Fragment>,
      );
    }
    const ring = Math.min((VW / 2) * t * 1.6, VH / 2 - 8);
    nodes.push(
      <React.Fragment key="cb-bang-ring">
        <Positioned
          left={CENTER_X - ring}
          top={CENTER_Y - ring}
          width={ring * 2}
          height={ring * 2}
        >
          <Container
            width={ring * 2}
            height={ring * 2}
            decoration={{
              color: `rgba(64,196,255,${(0.35 * fade).toFixed(2)})`,
              borderRadius: ring,
            }}
          />
        </Positioned>
      </React.Fragment>,
    );
  }

  return (
    <Stack>
      <StarField backgroundColor="#05060f" playerX={0} playerY={0} />
      {nodes}
    </Stack>
  );
}

/** 把 6 位十六进制颜色按 alpha 输出为 rgba 字符串。 */
function hexToRgb(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `${r},${g},${b},${Math.max(0, Math.min(1, alpha)).toFixed(2)}`;
}
