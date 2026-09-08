import React from "react";
import {
  Stack,
  Positioned,
  useMediaQuery,
  resolveBundleAssetPath,
} from "fuickjs";
import { VideoPlayer } from "@fuickjs-community/video_player";

/** 全屏背景：用星空视频铺满整个屏幕，循环播放。 */
export default function StarField() {
  const mq = useMediaQuery();
  const W = mq.screenWidth > 0 ? mq.screenWidth : 360;
  const H = mq.screenHeight > 0 ? mq.screenHeight : 640;

  const videoPath = resolveBundleAssetPath("videos/space_bg.mp4") as string;

  return (
    <Stack width={W} height={H}>
      <Positioned left={0} top={0} width={W} height={H}>
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
