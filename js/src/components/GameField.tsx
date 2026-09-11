import React from "react";
import { Stack, Positioned, Container } from "fuickjs";
import type { Entity, GameState } from "../store/game";
import Planet from "./Planet";

const MARGIN = 80;

/** 6 位 hex 追加 alpha(0..1) 转 8 位。 */
function alphaColor(hex: string, opacity: number): string {
  const s = hex.replace("#", "");
  const a = Math.round(Math.max(0, Math.min(1, opacity)) * 255)
    .toString(16)
    .padStart(2, "0");
  return `#${s.slice(0, 6)}${a}`;
}

interface GameFieldProps {
  state: GameState;
  screenW: number;
  screenH: number;
}

/** 星空场地：实体以屏幕坐标直接渲染，玩家在屏幕上自由移动。 */
export default function GameField({ state, screenW, screenH }: GameFieldProps) {
  const p = state.player;

  const renderBody = (sx: number, sy: number, body: Entity) => {
    const r = body.radius;
    const d = r * 2;

    // 实体全部程序化生成（渐变 / 裁剪绘制），不再使用图片素材
    return (
      <Positioned left={sx - r} top={sy - r} width={d} height={d}>
        <Planet radius={r} power={body.power} id={body.id} time={state.time} />
      </Positioned>
    );
  };

  const bodies: React.ReactNode[] = [];
  for (const e of state.entities) {
    const sx = e.x;
    const sy = e.y;
    if (
      sx < -MARGIN ||
      sx > screenW + MARGIN ||
      sy < -MARGIN ||
      sy > screenH + MARGIN
    )
      continue;
    bodies.push(
      <React.Fragment key={`e${e.id}`}>{renderBody(sx, sy, e)}</React.Fragment>,
    );
  }

  const sats: React.ReactNode[] = [];
  for (const s of state.satellites) {
    const a = s.angle ?? 0;
    const sx = p.x + Math.cos(a) * (s.orbitRadius ?? 0);
    const sy = p.y + Math.sin(a) * (s.orbitRadius ?? 0);
    sats.push(
      <React.Fragment key={`s${s.id}`}>{renderBody(sx, sy, s)}</React.Fragment>,
    );
  }

  // 撞击爆炸特效：随时间扩散、淡出的圆环。
  const fxNodes: React.ReactNode[] = [];
  for (const fx of state.effects) {
    const x = Math.min(1, fx.age / fx.life);
    const r = fx.maxR * (0.2 + 0.8 * (1 - Math.pow(1 - x, 3)));
    const a = 1 - x * x;
    const bw = Math.max(1, r * 0.12);
    fxNodes.push(
      <Positioned
        key={`fx${fx.id}`}
        left={fx.x - r}
        top={fx.y - r}
        width={r * 2}
        height={r * 2}
      >
        <Container
          width={r * 2}
          height={r * 2}
          decoration={{
            color: alphaColor(fx.color, a * 0.18),
            borderRadius: r,
            border: {
              width: bw,
              color: alphaColor(fx.color, a * 0.85),
            },
            boxShadow: {
              color: alphaColor(fx.color, a * 0.5),
              blurRadius: r * 0.5,
            },
          }}
        />
      </Positioned>,
    );
    if (x < 0.4) {
      const cr = r * (1 - x * 2.2);
      fxNodes.push(
        <Positioned
          key={`fxc${fx.id}`}
          left={fx.x - cr}
          top={fx.y - cr}
          width={cr * 2}
          height={cr * 2}
        >
          <Container
            width={cr * 2}
            height={cr * 2}
            decoration={{
              color: alphaColor("#ffffff", 0.9 * (1 - x * 2.4)),
              borderRadius: cr,
            }}
          />
        </Positioned>,
      );
    }
  }

  return (
    <Stack width={screenW} height={screenH}>
      {/* 背景（黑色宇宙 + 亮星）由页面层的 StarField 铺满全屏，这里只绘游戏实体 */}
      {bodies}
      {sats}
      <React.Fragment key="player">{renderBody(p.x, p.y, p)}</React.Fragment>
      {fxNodes}
    </Stack>
  );
}
