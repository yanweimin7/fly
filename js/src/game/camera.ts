import { WORLD_RADIUS } from "./config";

export function computeCamera(
  px: number,
  py: number,
  radius: number,
  screenW: number,
  screenH: number,
): { ox: number; oy: number } {
  let ox = px - screenW / 2;
  let oy = py - screenH / 2;

  const camR = Math.hypot(screenW, screenH) / 2;
  const maxCX = Math.max(1, WORLD_RADIUS - camR);
  const cd = Math.hypot(ox, oy);
  if (cd > maxCX) {
    const s = maxCX / cd;
    ox *= s;
    oy *= s;
  }

  const insetX = Math.min(screenW / 2, Math.max(24, radius + 16));
  const insetY = Math.min(screenH / 2, Math.max(24, radius + 16));
  const sx = px - ox;
  const sy = py - oy;
  if (sx < insetX) ox -= insetX - sx;
  else if (sx > screenW - insetX) ox += sx - (screenW - insetX);
  if (sy < insetY) oy -= insetY - sy;
  else if (sy > screenH - insetY) oy += sy - (screenH - insetY);

  return { ox, oy };
}
