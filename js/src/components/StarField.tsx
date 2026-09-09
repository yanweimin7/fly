import React from "react";
import {
  Stack,
  Positioned,
  useMediaQuery,
  resolveBundleAssetPath,
} from "fuickjs";
import { VideoPlayer } from "@fuickjs-community/video_player";

interface StarFieldProps {
  playerX?: number;
  playerY?: number;
}

/** 全屏背景：用星空视频铺满整个屏幕，循环播放，跟随摄像机偏移。 */
export default function StarField({ playerX = 0, playerY = 0 }: StarFieldProps) {
  const mq = useMediaQuery();
  const W = mq.screenWidth > 0 ? mq.screenWidth : 360;
  const H = mq.screenHeight > 0 ? mq.screenHeight : 640;

  const videoPath = resolveBundleAssetPath("videos/space_bg.mp4") as string;

  // 背景偏移：让星空跟随玩家移动
  const offsetX = -(playerX % W);
  const offsetY = -(playerY % H);

  return (
    <Stack width={W} height={H}>
      <Positioned left={offsetX} top={offsetY} width={W * 3} height={H * 3}>
        <VideoPlayer
          asset={videoPath}
          autoPlay={true}
          looping={true}
          muted={true}
          fill={true}
        />
      </Positioned>
    </Stack>
  );
}
