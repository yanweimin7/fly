import React from "react";
import { Stack, Positioned, Container } from "fuickjs";
import type { Entity, GameState } from "../store/game";
import { WORLD_RADIUS } from "../game/config";
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

/** 星空场地：世界为圆形宇宙，相机跟随玩家但不会越过世界圆环——靠近边缘时
 * 玩家偏离屏幕中心、圆环边界可见（不锁定在正中）。 */
export default function GameField({ state, screenW, screenH }: GameFieldProps) {
  const p = state.player;
  // 相机偏移：屏幕中心对应玩家世界坐标，其余实体/特效相对玩家平移。
  // 相机被夹在世界圆环内（保留半个屏幕对角线的余量，保证圆环始终在视野内）。
  let ox = p.x - screenW / 2;
  let oy = p.y - screenH / 2;
  const camR = Math.hypot(screenW, screenH) / 2;
  const maxCX = Math.max(1, WORLD_RADIUS - camR);
  const cd = Math.hypot(ox, oy);
  if (cd > maxCX) {
    const s = maxCX / cd;
    ox *= s;
    oy *= s;
  }

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
    const sx = e.x - ox;
    const sy = e.y - oy;
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
    const sx = p.x + Math.cos(a) * (s.orbitRadius ?? 0) - ox;
    const sy = p.y + Math.sin(a) * (s.orbitRadius ?? 0) - oy;
    sats.push(
      <React.Fragment key={`s${s.id}`}>{renderBody(sx, sy, s)}</React.Fragment>,
    );
  }

  // 撞击爆炸特效：随时间扩散、淡出的圆环。
  const fxNodes: React.ReactNode[] = [];
  const px = p.x - ox;
  const py = p.y - oy;
  for (const fx of state.effects) {
    if (fx.type === "suck") {
      // 黑洞吸入特效：颗粒从远处螺旋收束飞入洞心，随推进逐步变小并淡入洞内。
      // 注意：颗粒只用纯色圆形绘制（不用 boxShadow/渐变），黑洞连续吞噬时数量多，
      // 模糊阴影/渐变每帧重绘会造成 Flutter 端卡顿。
      const t = Math.min(1, fx.age / fx.life);
      const ease = 1 - Math.pow(1 - t, 2);
      const sinkR = Math.max(1, p.radius * 0.75);
      const motes = 10;
      for (let i = 0; i < motes; i++) {
        const ai = (i / motes) * Math.PI * 2 + ((i * 5) % 7);
        const rf = 0.55 + 0.45 * ((i * 0.6180339) % 1);
        const dd = sinkR + (fx.maxR * rf - sinkR) * (1 - ease);
        const mx = px + Math.cos(ai - t * 5.2) * dd;
        const my = py + Math.sin(ai - t * 5.2) * dd;
        const size = Math.max(0.8, fx.maxR * 0.05 * (1 - t));
        const oa =
          Math.pow(1 - t, 1.5) *
          (t < 0.82 ? 1 : Math.max(0, 1 - (t - 0.82) / 0.18));
        fxNodes.push(
          <Positioned
            key={`fxs${fx.id}-${i}`}
            left={mx - size}
            top={my - size}
            width={size * 2}
            height={size * 2}
          >
            <Container
              width={size * 2}
              height={size * 2}
              decoration={{
                color: alphaColor(fx.color, oa * 0.95),
                borderRadius: size,
              }}
            />
          </Positioned>,
        );
      }
      continue;
    }
    const x = fx.x - ox;
    const y = fx.y - oy;
    const t = Math.min(1, fx.age / fx.life);
    const r = fx.maxR * (0.2 + 0.8 * (1 - Math.pow(1 - t, 3)));
    const a = 1 - t * t;
    const bw = Math.max(1, r * 0.12);
    fxNodes.push(
      <Positioned
        key={`fx${fx.id}`}
        left={x - r}
        top={y - r}
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
    if (t < 0.4) {
      const cr = r * (1 - t * 2.2);
      fxNodes.push(
        <Positioned
          key={`fxc${fx.id}`}
          left={x - cr}
          top={y - cr}
          width={cr * 2}
          height={cr * 2}
        >
          <Container
            width={cr * 2}
            height={cr * 2}
            decoration={{
              color: alphaColor("#ffffff", 0.9 * (1 - t * 2.4)),
              borderRadius: cr,
            }}
          />
        </Positioned>,
      );
    }
  }

  return (
    <Stack width={screenW} height={screenH}>
      {" "}
      {/* 背景（黑色宇宙 + 亮星）由页面层的 StarField 铺满全屏，这里只绘游戏实体 */}
      {/* 圆形宇宙边界：以出生点（原点）为圆心的世界圆环，靠近时可见。 */}
      <Positioned
        left={-ox - WORLD_RADIUS}
        top={-oy - WORLD_RADIUS}
        width={WORLD_RADIUS * 2}
        height={WORLD_RADIUS * 2}
      >
        <Container
          width={WORLD_RADIUS * 2}
          height={WORLD_RADIUS * 2}
          decoration={{
            borderRadius: WORLD_RADIUS,
            border: {
              width: 2,
              color: alphaColor("#9be8ff", 0.35),
            },
          }}
        />
      </Positioned>
      {bodies}
      {sats}
      <React.Fragment key="player">
        {renderBody(p.x - ox, p.y - oy, p)}
      </React.Fragment>
      {fxNodes}
    </Stack>
  );
}
