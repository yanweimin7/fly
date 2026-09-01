import React, { useRef, useState } from "react";
import {
  GestureDetector,
  Container,
  Positioned,
  Stack,
  PointArgs,
  DragArgs,
} from "fuickjs";
import type { InputState } from "../store/game";
import { JOY_MAX_R } from "../game/config";

const JOY_SIZE = 120;
const KNOB = 46;
const CENTER = JOY_SIZE / 2;

interface JoystickProps {
  inputRef: React.MutableRefObject<InputState>;
}

/** 左下角虚拟摇杆：拖动输出方向向量与强度，松开归零。 */
export default function Joystick({ inputRef }: JoystickProps) {
  const baseRef = useRef<{ x: number; y: number }>({ x: CENTER, y: CENTER });
  const [knob, setKnob] = useState<{ x: number; y: number }>({
    x: CENTER,
    y: CENTER,
  });

  const onPanStart = (e: PointArgs) => {
    baseRef.current = { x: e.dx, y: e.dy };
    setKnob({ x: e.dx, y: e.dy });
  };

  const onPanUpdate = (e: DragArgs) => {
    const len = Math.hypot(e.dx, e.dy);
    const intensity = Math.min(len / JOY_MAX_R, 1);
    inputRef.current = { dx: e.dx, dy: e.dy, intensity };
    const clx = Math.max(-JOY_MAX_R, Math.min(JOY_MAX_R, e.dx));
    const cly = Math.max(-JOY_MAX_R, Math.min(JOY_MAX_R, e.dy));
    setKnob({ x: baseRef.current.x + clx, y: baseRef.current.y + cly });
  };

  const onPanEnd = () => {
    inputRef.current = { dx: 0, dy: 0, intensity: 0 };
    setKnob({ x: CENTER, y: CENTER });
  };

  return (
    <GestureDetector
      onPanStart={onPanStart}
      onPanUpdate={onPanUpdate}
      onPanEnd={onPanEnd}
    >
      <Stack>
        <Container
          width={JOY_SIZE}
          height={JOY_SIZE}
          decoration={{
            color: "rgba(255,255,255,0.10)",
            borderRadius: JOY_SIZE / 2,
          }}
        />
        <Positioned left={CENTER - 26} top={CENTER - 26} width={52} height={52}>
          <Container
            width={52}
            height={52}
            decoration={{ color: "rgba(255,255,255,0.18)", borderRadius: 26 }}
          />
        </Positioned>
        <Positioned
          left={knob.x - KNOB / 2}
          top={knob.y - KNOB / 2}
          width={KNOB}
          height={KNOB}
        >
          <Container
            width={KNOB}
            height={KNOB}
            decoration={{ color: "#4fc3f7", borderRadius: KNOB / 2 }}
          />
        </Positioned>
      </Stack>
    </GestureDetector>
  );
}
