import React from "react";
import { Stack, Positioned, Container, Image } from "fuickjs";
import type { Entity, GameState } from "../store/game";
import { STAGES } from "../game/config";

const MARGIN = 80;

/** 行星(L4 岩石行星 / L5 气态行星) 图片素材（zip 内 assets/images/，框架自动解析为
 * file://<root>/assets/...）。行星贴图已离线抠成透明圆形，无需裁剪即可圆形显示。
 * 岩石(L4)/气态(L5) 各分配多张，按实体 id 稳定选择。 */
const PLANET_IMGS: Record<number, string[]> = {
  3: [
    "images/planet01.png",
    "images/planet02.png",
    "images/planet07.png",
    "images/planet08.png",
    "images/planet10.png",
    "images/planet12.png",
    "images/planet13.png",
  ],
  4: [
    "images/planet03.png",
    "images/planet04.png",
    "images/planet06.png",
    "images/planet09.png",
    "images/planet11.png",
  ],
};

/** 按实体 id 稳定取一张行星图：同一实体始终同一张（不闪烁），多实体自然随机分布。 */
const planetImg = (power: number, id: number): string => {
  const pool = PLANET_IMGS[power] ?? PLANET_IMGS[3];
  return pool[((id % pool.length) + pool.length) % pool.length];
};

/** 将 6 位 hex 颜色按 amt∈[-1,1] 向白(正)/黑(负)混合。 */
const shade = (hex: string, amt: number): string => {
  const h = hex.replace("#", "");
  const r = parseInt(h.substr(0, 2), 16);
  const g = parseInt(h.substr(2, 2), 16);
  const b = parseInt(h.substr(4, 2), 16);
  const t = amt < 0 ? 0 : 255;
  const p = Math.abs(amt);
  const mix = (c: number) => Math.round((t - c) * p + c);
  const to2 = (n: number) => n.toString(16).padStart(2, "0");
  return "#" + to2(mix(r)) + to2(mix(g)) + to2(mix(b));
};

/** 给 6 位 hex 追加 alpha(0..1) 变成 8 位。 */
const withAlpha = (hex6: string, a: number): string => {
  const al = Math.max(0, Math.min(255, Math.round(a * 255)))
    .toString(16)
    .padStart(2, "0");
  return hex6 + al;
};

interface Vis {
  mid: string;
  light: string;
  dark: string;
  glow: boolean;
  blackhole: boolean;
}

/** 由阶段推导该等级的视觉参数（球面光照渐变 + 发光/黑洞特例）。 */
const visFor = (power: number): Vis => {
  const stage = STAGES[power] ?? STAGES[0];
  const blackhole = stage.color === "#000000";
  const light = stage.glow && !blackhole ? "#ffffff" : shade(stage.color, 0.35);
  const dark = shade(stage.color, -0.45);
  return { mid: stage.color, light, dark, glow: stage.glow, blackhole };
};

interface GameFieldProps {
  state: GameState;
  screenW: number;
  screenH: number;
}

/** 星空场地：自由视角，实体以世界坐标直接渲染，离屏裁剪。 */
export default function GameField({ state, screenW, screenH }: GameFieldProps) {
  const p = state.player;

  const renderBody = (
    sx: number,
    sy: number,
    body: Entity,
    isPlayer: boolean,
  ) => {
    const r = body.radius;
    const d = r * 2;
    const vis = visFor(body.power);
    const shadowColor = body.power === 10 ? "#7c4dff" : vis.mid;

    // 行星阶段：用图片素材替代自绘渐变圆
    const isPlanetStage = body.power === 3 || body.power === 4;
    if (isPlanetStage) {
      const imgSrc = planetImg(body.power, body.id);
      if (isPlayer) {
        return (
          <Positioned left={sx - r} top={sy - r} width={d} height={d}>
            <Image src={imgSrc} width={d} height={d} fit="cover" />
          </Positioned>
        );
      }
      return (
        <Positioned left={sx - r} top={sy - r} width={d} height={d}>
          <Image src={imgSrc} width={d} height={d} fit="cover" />
        </Positioned>
      );
    }

    // 球面径向渐变
    let gradient: { type: string; colors: string[]; stops: number[] };
    if (vis.blackhole) {
      gradient = {
        type: "radial",
        colors: [
          "#050505",
          "#000000",
          "#000000",
          "#ffb300",
          "#fff3e0",
          "#ff7043",
          "#1a0a00",
        ],
        stops: [0, 0.62, 0.74, 0.82, 0.9, 0.96, 1],
      };
    } else if (vis.glow) {
      gradient = {
        type: "radial",
        colors: ["#ffffff", vis.mid, vis.dark],
        stops: [0, 0.4, 1],
      };
    } else {
      gradient = {
        type: "radial",
        colors: [vis.light, vis.mid, vis.dark],
        stops: [0, 0.55, 1],
      };
    }

    // 发光天体：外层半透明光晕（近似固定大小，避免大恒星铺满屏幕）。
    const glowColor = vis.glow ? vis.light : shadowColor;
    const haloR = r + 22;
    const bhR = r + 30;
    const halo =
      vis.glow && !vis.blackhole ? (
        <Positioned
          left={sx - haloR}
          top={sy - haloR}
          width={haloR * 2}
          height={haloR * 2}
        >
          <Container
            width={haloR * 2}
            height={haloR * 2}
            decoration={{
              color: withAlpha(glowColor, 0.25),
              borderRadius: haloR,
              boxShadow: { color: glowColor, blurRadius: 20 },
            }}
          />
        </Positioned>
      ) : vis.blackhole ? (
        <Positioned
          left={sx - bhR}
          top={sy - bhR}
          width={bhR * 2}
          height={bhR * 2}
        >
          <Container
            width={bhR * 2}
            height={bhR * 2}
            decoration={{
              color: withAlpha("#7c4dff", 0.16),
              borderRadius: bhR,
              boxShadow: { color: "#7c4dff", blurRadius: 24 },
            }}
          />
        </Positioned>
      ) : null;

    const core = (
      <Positioned left={sx - r} top={sy - r} width={d} height={d}>
        <Container
          width={d}
          height={d}
          decoration={{
            gradient,
            borderRadius: r,
            border: isPlayer ? { color: "#ffffff", width: 2 } : undefined,
          }}
        />
      </Positioned>
    );

    return (
      <React.Fragment>
        {halo}
        {core}
      </React.Fragment>
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
      <React.Fragment key={`e${e.id}`}>
        {renderBody(sx, sy, e, false)}
      </React.Fragment>,
    );
  }

  const sats: React.ReactNode[] = [];
  for (const s of state.satellites) {
    const a = s.angle ?? 0;
    const sx = p.x + Math.cos(a) * (s.orbitRadius ?? 0);
    const sy = p.y + Math.sin(a) * (s.orbitRadius ?? 0);
    sats.push(
      <React.Fragment key={`s${s.id}`}>
        {renderBody(sx, sy, s, false)}
      </React.Fragment>,
    );
  }

  return (
    <Stack>
      {/* 背景（黑色宇宙 + 亮星）由页面层的 StarField 铺满全屏，这里只绘游戏实体 */}
      {bodies}
      {sats}
      <React.Fragment key="player">
        {renderBody(p.x, p.y, p, true)}
      </React.Fragment>
    </Stack>
  );
}
