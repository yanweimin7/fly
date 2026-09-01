import React from "react";
import { Stack, Positioned, Container } from "fuickjs";
import { VW, VH, CENTER_X, CENTER_Y } from "../game/config";

/** 星点按 CELL 大小的格子散布；格子在世界坐标铺开，使星空无穷且确定性。 */
const CELL = 140;
const PER_CELL = 5;
const MARGIN = 20;

/** 星点基底色（RGB），白色 / 蓝白 / 淡黄 / 淡青。 */
const STAR_RGB: ReadonlyArray<readonly [number, number, number]> = [
  [207, 216, 220],
  [176, 190, 197],
  [144, 164, 174],
  [255, 249, 196],
  [179, 229, 252],
];

interface Star {
  sx: number;
  sy: number;
  r: number;
  color: string;
}

/** 基于格子坐标的确定性伪随机（32 位掩码保证任意大坐标下稳定且不溢出）。 */
function cellRand(cx: number, cy: number): () => number {
  let s = ((cx * 374761393 + cy * 668265263) ^ 0x5bf03635) >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 计算当前视口内可见的星点（屏幕坐标）。
 * 星点属于世界：以格子坐标哈希，任何玩家的位置都能确定性地求出其周围的星，
 * 随玩家移动（相机跟随）自然滚动，越界裁剪，单帧星数恒定。
 */
function starsInView(playerX: number, playerY: number): Star[] {
  const worldLeft = playerX - CENTER_X;
  const worldTop = playerY - CENTER_Y;

  const cMinX = Math.floor((worldLeft - MARGIN) / CELL);
  const cMaxX = Math.floor((worldLeft + VW + MARGIN) / CELL);
  const cMinY = Math.floor((worldTop - MARGIN) / CELL);
  const cMaxY = Math.floor((worldTop + VH + MARGIN) / CELL);

  const stars: Star[] = [];
  for (let cx = cMinX; cx <= cMaxX; cx++) {
    for (let cy = cMinY; cy <= cMaxY; cy++) {
      const rand = cellRand(cx, cy);
      for (let i = 0; i < PER_CELL; i++) {
        const wx = cx * CELL + rand() * CELL * 3 - CELL;
        const wy = cy * CELL + rand() * CELL * 3 - CELL;
        const sx = CENTER_X + (wx - playerX);
        const sy = CENTER_Y + (wy - playerY);
        if (
          sx < -MARGIN ||
          sx > VW + MARGIN ||
          sy < -MARGIN ||
          sy > VH + MARGIN
        )
          continue;
        const bright = rand() < 0.18;
        const [r, g, b] = STAR_RGB[Math.floor(rand() * STAR_RGB.length)];
        const rad = bright ? 1.6 + rand() * 1.4 : 0.6 + rand() * 0.9;
        const alpha = bright ? 0.28 + rand() * 0.3 : 0.55 + rand() * 0.35;
        stars.push({
          sx,
          sy,
          r: rad,
          color: `rgba(${r},${g},${b},${alpha.toFixed(2)})`,
        });
      }
    }
  }
  return stars;
}

/**
 * 星空背景层：置于场地下层。星空不该是一片黑暗，也不该是一张贴死的壁纸——
 * 星点属于世界坐标，随玩家相机滚动，探索深空时星野自然移动。
 */
export default function StarField({
  backgroundColor,
  playerX,
  playerY,
}: {
  backgroundColor: string;
  playerX: number;
  playerY: number;
}) {
  const stars = starsInView(playerX, playerY);

  return (
    <Stack>
      <Positioned left={0} top={0} width={VW} height={VH}>
        <Container width={VW} height={VH} color={backgroundColor} />
      </Positioned>
      {stars.map((s, i) => (
        <React.Fragment key={`star-${i}`}>
          <Positioned left={s.sx} top={s.sy} width={s.r * 2} height={s.r * 2}>
            <Container
              width={s.r * 2}
              height={s.r * 2}
              decoration={{ color: s.color, borderRadius: s.r }}
            />
          </Positioned>
        </React.Fragment>
      ))}
    </Stack>
  );
}
