import React from "react";
import { GestureDetector, Container, Text } from "fuickjs";

interface CaptureButtonProps {
  enabled: boolean;
  onCapture: () => void;
  /** 按钮直径（像素，默认 84）。 */
  size?: number;
}

/** 捕获按钮：仅 L4+ 且存在可捕获行星时可用。 */
export default function CaptureButton({
  enabled,
  onCapture,
  size = 84,
}: CaptureButtonProps) {
  return (
    <GestureDetector
      onTap={() => {
        if (enabled) onCapture();
      }}
    >
      <Container
        width={size}
        height={size}
        alignment="center"
        decoration={{
          color: enabled ? "rgba(255,193,7,0.85)" : "rgba(120,120,120,0.35)",
          borderRadius: size / 2,
        }}
      >
        <Text
          text="捕获"
          color={enabled ? "#000000" : "#eeeeee"}
          fontSize={Math.round(size * 0.21)}
          fontWeight="bold"
        />
      </Container>
    </GestureDetector>
  );
}
