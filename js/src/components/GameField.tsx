import React from "react";
import { Stack, Positioned, Container, RepaintBoundary } from "fuickjs";
import type { Entity, GameState } from "../store/game";
import {
  WORLD_RADIUS,
  BLACK_HOLE_STAGE,
  BLACKHOLE_GRAVITY_RATIO,
  SCENE3D_GFX,
  STAR_GLOW,
} from "../game/config";
import Planet from "./Planet";
import { stageModel } from "../game/models";
import { Scene3D } from "@fuickjs-community/scene3d";
import type { Scene3DBody } from "@fuickjs-community/scene3d";

const MARGIN = 80;

/** 冷行星（0-4）与恒星（5-8）用 3D 模型渲染；黑洞/宇宙（9+）继续走 2D。 */
const MAX_3D_POWER = 8;
/** 血条高度 / 与天体的间距（像素）。 */
const HP_BAR_H = 3;
const HP_BAR_GAP = 5;

/** 轴倾角（弧度，绕 Z）。 */
const BODY_TILT = 0.35;

/** 自转速度（rad/s），按 id 打散让各天体不同步。 */
function spinSpeed(id: number): number {
  return 0.6 + (id % 7) * 0.08;
}

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

  const bodies3d: Scene3DBody[] = [];
  const renderBody = (sx: number, sy: number, body: Entity) => {
    const r = body.radius;
    const d = r * 2;
    // 冷行星(0-4)现在自转（球面光照渲染），发光天体（5-8）外观脉动，全部依赖 time。
    const t = state.time;

    // 冷行星/恒星交给底部 Scene3D 3D 层（真实 GLB 模型）。
    if (body.power <= MAX_3D_POWER) {
      const glow = STAR_GLOW[body.power];
      bodies3d.push({
        id: body.id,
        src: stageModel(body.power, body.id),
        x: sx,
        y: sy,
        size: d,
        spin: t * spinSpeed(body.id),
        tilt: BODY_TILT,
        // 恒星光线也交给 3D 层：场景内广告牌光晕（随相机/场景一起渲染）。
        glow: glow?.glow,
        glowColor: glow?.color,
        glowAlpha: glow?.alpha,
        glowSpin: glow ? t * glow.spin : undefined,
      });
      return null;
    }

    // 实体全部程序化生成（渐变 / 裁剪绘制），不再使用图片素材。
    // 每颗天体用 RepaintBoundary 隔离重绘：相机/实体移动只改变图层位移（GPU 合成），
    // 不会每帧重绘内部的渐变/BoxShadow/ClipPath；内部动画（如发光芒脉动）也只重绘自身。
    return (
      <Positioned left={sx - r} top={sy - r} width={d} height={d}>
        <RepaintBoundary>
          <Planet radius={r} power={body.power} id={body.id} time={t} />
        </RepaintBoundary>
      </Positioned>
    );
  };

  // 自由天体画在玩家之下；吸入黑洞中的天体画在玩家之上，让物质坠过洞心、缩到消失的
  // 过程不被黑洞黑盘盖住。
  const bodies: React.ReactNode[] = [];
  const falling: React.ReactNode[] = [];
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
    (e.fallingIn ? falling : bodies).push(
      <React.Fragment key={`e${e.id}`}>{renderBody(sx, sy, e)}</React.Fragment>,
    );
  }

  // 天体血条：与自身体型同宽，画在天体正上方（红条 + 暗底），黑洞/恒星等同样显示。
  const bars: React.ReactNode[] = [];
  for (const e of state.entities) {
    if (e.fallingIn) continue;
    const sx = e.x - ox;
    const sy = e.y - oy;
    if (
      sx < -MARGIN ||
      sx > screenW + MARGIN ||
      sy < -MARGIN ||
      sy > screenH + MARGIN
    )
      continue;
    const w = Math.max(6, e.radius * 2);
    const top = sy - e.radius - HP_BAR_GAP - HP_BAR_H;
    const ratio = e.maxHp > 0 ? Math.max(0, Math.min(1, e.hp / e.maxHp)) : 0;
    bars.push(
      <Positioned
        key={`hb${e.id}`}
        left={sx - w / 2}
        top={top}
        width={w}
        height={HP_BAR_H}
      >
        <Container
          width={w}
          height={HP_BAR_H}
          decoration={{
            borderRadius: HP_BAR_H / 2,
            color: alphaColor("#000000", 0.45),
          }}
        />
      </Positioned>,
      <Positioned
        key={`hf${e.id}`}
        left={sx - w / 2}
        top={top}
        width={Math.max(1, w * ratio)}
        height={HP_BAR_H}
      >
        <Container
          width={Math.max(1, w * ratio)}
          height={HP_BAR_H}
          decoration={{
            borderRadius: HP_BAR_H / 2,
            color: "#ff3b30",
          }}
        />
      </Positioned>,
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

  // 黑洞引力范围圈：淡紫径向渐变 + 细边，标出吸力边界。
  // 玩家自身是黑洞时圈画在玩家身上；场上会吸玩家的黑洞也画同样的圈——两者视觉一致。
  const gravityRing = (cx: number, cy: number, r: number, key: string) => {
    const gr = r * BLACKHOLE_GRAVITY_RATIO;
    return (
      <Positioned
        key={key}
        left={cx - gr}
        top={cy - gr}
        width={gr * 2}
        height={gr * 2}
      >
        <Container
          width={gr * 2}
          height={gr * 2}
          decoration={{
            borderRadius: gr,
            gradient: {
              type: "radial",
              colors: [
                alphaColor("#7c4dff", 0.02),
                alphaColor("#7c4dff", 0.12),
                alphaColor("#8b5cf6", 0.3),
              ],
              stops: [0, 0.55, 1],
            },
            border: {
              width: 2,
              color: alphaColor("#b79bff", 0.85),
            },
          }}
        />
      </Positioned>
    );
  };
  const gravityRings: React.ReactNode[] = [];
  if (state.stageIndex >= BLACK_HOLE_STAGE) {
    gravityRings.push(gravityRing(p.x - ox, p.y - oy, p.radius, "gh-self"));
  }
  for (const e of state.entities) {
    if (e.removed || e.power < BLACK_HOLE_STAGE) continue;
    if (e.x - ox < -MARGIN || e.x - ox > screenW + MARGIN) continue;
    if (e.y - oy < -MARGIN || e.y - oy > screenH + MARGIN) continue;
    gravityRings.push(gravityRing(e.x - ox, e.y - oy, e.radius, `gh${e.id}`));
  }

  // 撞击爆炸特效：随时间扩散、淡出的圆环。
  const fxNodes: React.ReactNode[] = [];
  const px = p.x - ox;
  const py = p.y - oy;
  for (const fx of state.effects) {
    if (fx.type === "suck") {
      // 黑洞吸入特效：颗粒从远处螺旋收束飞入洞心，随推进逐步变小并淡入洞内。
      // 洞心取特效自身的 (fx.x, fx.y)——玩家自身黑洞吸入天体、以及玩家被场上黑洞
      // 吸入，走的是同一段渲染，只是洞心不同。
      // 注意：颗粒只用纯色圆形绘制（不用 boxShadow/渐变），黑洞连续吞噬时数量多，
      // 模糊阴影/渐变每帧重绘会造成 Flutter 端卡顿。
      const t = Math.min(1, fx.age / fx.life);
      const ease = 1 - Math.pow(1 - t, 2);
      const cx = fx.x - ox;
      const cy = fx.y - oy;
      const sinkR = Math.max(1, fx.sinkR ?? p.radius * 0.75);
      const motes = 10;
      for (let i = 0; i < motes; i++) {
        const ai = (i / motes) * Math.PI * 2 + ((i * 5) % 7);
        const rf = 0.55 + 0.45 * ((i * 0.6180339) % 1);
        const dd = sinkR + (fx.maxR * rf - sinkR) * (1 - ease);
        const mx = cx + Math.cos(ai - t * 5.2) * dd;
        const my = cy + Math.sin(ai - t * 5.2) * dd;
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

  const playerNode = (
    <React.Fragment key="player">{renderBody(px, py, p)}</React.Fragment>
  );

  return (
    <Stack width={screenW} height={screenH}>
      {" "}
      {/* 背景（黑色宇宙 + 亮星）由页面层的 StarField 铺满全屏，这里只绘游戏实体 */}
      {/* 3D 层：冷行星（power 0-4）真实 GLB 模型，铺在整个 2D 世界之下。 */}
      <Scene3D
        width={screenW}
        height={screenH}
        bodies={bodies3d}
        lightDir={SCENE3D_GFX.lightDir}
        lightIntensity={SCENE3D_GFX.lightIntensity}
        envIntensity={SCENE3D_GFX.envIntensity}
      />
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
      {/* 黑洞引力范围：淡紫圆环标出吸力边界。玩家自身是黑洞时画在玩家身上；
          场上那颗会吸玩家的黑洞也画同样的圈——两者视觉一致，危险可提前识别。 */}
      {gravityRings}
      {bodies}
      {sats}
      {/* 被吸入时把玩家挪到 falling 层之后画：坠向洞心缩小消失的过程不被黑洞黑盘盖住。 */}
      {state.swallow ? null : playerNode}
      {falling}
      {state.swallow ? playerNode : null}
      {bars}
      {fxNodes}
    </Stack>
  );
}
