import React, { useState, useEffect, useRef } from "react";
import {
  Stack,
  Image,
  Positioned,
  Container,
  resolveBundleAssetPath,
} from "fuickjs";

interface StarFieldProps {
  /** 屏幕宽度（由宿主页解析真实尺寸后传入）。 */
  width: number;
  /** 屏幕高度（由宿主页解析真实尺寸后传入）。 */
  height: number;
}

const NUM_STARS = 80;

/** 用固定 seed 的简单伪随机生成可复现的星星参数。 */
function seededRandom(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

interface Star {
  x: number;
  y: number;
  size: number;
  phase: number;
  speed: number;
}

function generateStars(w: number, h: number): Star[] {
  const stars: Star[] = [];
  for (let i = 0; i < NUM_STARS; i++) {
    stars.push({
      x: seededRandom(i * 3 + 1) * w,
      y: seededRandom(i * 3 + 2) * h,
      size: 1 + seededRandom(i * 3 + 3) * 2.5,
      phase: seededRandom(i * 7) * Math.PI * 2,
      speed: 0.5 + seededRandom(i * 11) * 2,
    });
  }
  return stars;
}

/** 全屏背景：静态星空图片铺满屏幕 + 随机闪烁星星。 */
export default function StarField({ width, height }: StarFieldProps) {
  const imagePath = resolveBundleAssetPath("images/space_bg.png") as string;

  const starsRef = useRef<Star[]>([]);
  if (
    starsRef.current.length === 0 ||
    (starsRef.current as unknown as { _w: number })._w !== width ||
    (starsRef.current as unknown as { _h: number })._h !== height
  ) {
    const stars = generateStars(width, height);
    (stars as unknown as { _w: number })._w = width;
    (stars as unknown as { _h: number })._h = height;
    starsRef.current = stars;
  }

  const [, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 80);
    return () => clearInterval(id);
  }, []);

  const elapsed = Date.now() / 1000;

  return (
    <Stack fit="expand">
      <Image src={imagePath} width={width} height={height} fit="cover" />
      {starsRef.current.map((star, i) => {
        const opacity =
          0.3 + 0.7 * ((Math.sin(elapsed * star.speed + star.phase) + 1) / 2);
        return (
          <Positioned
            key={`star-${i}`}
            left={star.x}
            top={star.y}
            width={star.size}
            height={star.size}
          >
            <Container
              color={`rgba(255,255,255,${opacity.toFixed(2)})`}
              borderRadius={star.size / 2}
            />
          </Positioned>
        );
      })}
    </Stack>
  );
}
