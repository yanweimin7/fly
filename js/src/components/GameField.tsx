import React from "react";
import { Stack, Positioned, Container } from "fuickjs";
import type { Entity, GameState } from "../store/game";
import { STAGES, VW, VH, CENTER_X, CENTER_Y } from "../game/config";
import StarField from "./StarField";

const MARGIN = 60;

interface GameFieldProps {
  state: GameState;
}

/** 星空场地：相机跟随玩家居中，实体以 Positioned 绝对定位渲染，离屏裁剪。 */
export default function GameField({ state }: GameFieldProps) {
  const p = state.player;

  const renderBody = (
    sx: number,
    sy: number,
    body: Entity,
    isPlayer: boolean,
  ) => {
    const r = body.radius;
    const stage = STAGES[body.power] ?? STAGES[0];
    const glow = stage.glow || isPlayer;
    const shadowColor = body.power === 10 ? "#7c4dff" : stage.color;
    return (
      <Positioned left={sx - r} top={sy - r} width={r * 2} height={r * 2}>
        <Container
          width={r * 2}
          height={r * 2}
          decoration={{
            color: stage.color,
            borderRadius: r,
            border: isPlayer ? { color: "#ffffff", width: 2 } : undefined,
            boxShadow: glow
              ? { color: shadowColor, blurRadius: 20 }
              : undefined,
          }}
        />
      </Positioned>
    );
  };

  const bodies: React.ReactNode[] = [];
  for (const e of state.entities) {
    const sx = CENTER_X + (e.x - p.x);
    const sy = CENTER_Y + (e.y - p.y);
    if (sx < -MARGIN || sx > VW + MARGIN || sy < -MARGIN || sy > VH + MARGIN)
      continue;
    bodies.push(
      <React.Fragment key={`e${e.id}`}>
        {renderBody(sx, sy, e, false)}
      </React.Fragment>,
    );
  }

  const sats: React.ReactNode[] = [];
  for (const s of state.satellites) {
    const a = s.angle ?? 0;
    const ox = Math.cos(a) * (s.orbitRadius ?? 0);
    const oy = Math.sin(a) * (s.orbitRadius ?? 0);
    const sx = CENTER_X + ox;
    const sy = CENTER_Y + oy;
    sats.push(
      <React.Fragment key={`s${s.id}`}>
        {renderBody(sx, sy, s, false)}
      </React.Fragment>,
    );
  }

  return (
    <Stack>
      <StarField backgroundColor="#05060f" playerX={p.x} playerY={p.y} />
      {bodies}
      {sats}
      {renderBody(CENTER_X, CENTER_Y, p, true)}
    </Stack>
  );
}
