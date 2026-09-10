import React from "react";
import { Stack, Image, useMediaQuery, resolveBundleAssetPath } from "fuickjs";

interface StarFieldProps {
  /** 保留接口兼容性，背景图不再使用视差。 */
  playerX?: number;
  /** 保留接口兼容性，背景图不再使用视差。 */
  playerY?: number;
}

/** 全屏背景：静态星空图片铺满屏幕。 */
export default function StarField({}: StarFieldProps) {
  const mq = useMediaQuery();
  const W = mq.screenWidth > 0 ? mq.screenWidth : 360;
  const H = mq.screenHeight > 0 ? mq.screenHeight : 640;

  const imagePath = resolveBundleAssetPath("images/space_bg.png") as string;

  return (
    <Stack fit="expand">
      <Image src={imagePath} width={W} height={H} fit="cover" />
    </Stack>
  );
}
