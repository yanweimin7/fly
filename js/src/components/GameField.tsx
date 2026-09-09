import React from "react";
import { Stack, Positioned, Image } from "fuickjs";
import type { Entity, GameState } from "../store/game";

const MARGIN = 80;

/** 所有等级的3D星球图片素材（zip 内 assets/images/，框架自动解析为
 * file://<root>/assets/...）。行星贴图已离线抠成透明圆形，无需裁剪即可圆形显示。
 * 每个等级分配多张，按实体 id 稳定选择，确保同一实体始终同一张（不闪烁）。 */
const PLANET_IMGS: Record<number, string[]> = {
  1: [
    // 陨石
    "images/planet01.png",
    "images/planet02.png",
  ],
  2: [
    // 小行星
    "images/planet03.png",
    "images/planet04.png",
  ],
  3: [
    // 矮星
    "images/planet05.png",
    "images/planet06.png",
  ],
  4: [
    // 岩石行星
    "images/planet07.png",
    "images/planet08.png",
  ],
  5: [
    // 气态行星
    "images/planet09.png",
    "images/planet10.png",
  ],
  6: [
    // 矮恒星
    "images/planet11.png",
    "images/planet12.png",
  ],
  7: [
    // 恒星
    "images/planet13.png",
    "images/planet01.png",
  ],
  8: [
    // 超巨星
    "images/planet02.png",
    "images/planet03.png",
  ],
  9: [
    // 中子星
    "images/planet04.png",
    "images/planet05.png",
  ],
  10: [
    // 黑洞
    "images/planet06.png",
    "images/planet07.png",
  ],
  11: [
    // 宇宙
    "images/planet08.png",
    "images/planet09.png",
  ],
};

/** 按实体 id 稳定取一张行星图：同一实体始终同一张（不闪烁），多实体自然随机分布。 */
const planetImg = (power: number, id: number): string => {
  const pool = PLANET_IMGS[power] ?? PLANET_IMGS[1];
  return pool[((id % pool.length) + pool.length) % pool.length];
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

    // 所有等级都使用3D星球图片
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
