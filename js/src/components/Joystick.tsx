import React, { useRef, useState } from "react";
import {
  GestureDetector,
  Container,
  Positioned,
  Stack,
  DragArgs,
} from "fuickjs";
import type { InputState } from "../store/game";
import { JOY_MAX_R } from "../game/config";

interface JoystickProps {
  inputRef: React.MutableRefObject<InputState>;
  /** 摇杆直径（像素，默认 120）。 */
  size?: number;
}

/** 虚拟摇杆：拖动输出方向向量与强度，松开归零。 */
export default function Joystick({ inputRef, size = 120 }: JoystickProps) {
  // Flutter 的 onPanUpdate 只给「增量 delta」(details.delta)，需累加成
  // 相对起点的累计位移，才能得到稳定的方向与强度（框架 DragArgs 语义）。
  const accumRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const knob = Math.round(size * 0.38);
  const center = size / 2;
  const maxR = JOY_MAX_R * (size / 120);
  const inner = knob + 6;
  const [pos, setPos] = useState<{ x: number; y: number }>({
    x: center,
    y: center,
  });

  const onPanStart = () => {
    accumRef.current = { x: 0, y: 0 };
    setPos({ x: center, y: center });
  };

  const onPanUpdate = (e: DragArgs) => {
    let ax = accumRef.current.x + e.dx;
    let ay = accumRef.current.y + e.dy;
    const len = Math.hypot(ax, ay);
    if (len > maxR) {
      ax = (ax / len) * maxR;
      ay = (ay / len) * maxR;
    }
    accumRef.current = { x: ax, y: ay };
    const intensity = Math.min(Math.hypot(ax, ay) / maxR, 1);
    inputRef.current = { dx: ax, dy: ay, intensity };
    setPos({ x: center + ax, y: center + ay });
  };

  const onPanEnd = () => {
    accumRef.current = { x: 0, y: 0 };
    inputRef.current = { dx: 0, dy: 0, intensity: 0 };
    setPos({ x: center, y: center });
  };

  return (
    <GestureDetector
      onPanStart={onPanStart}
      onPanUpdate={onPanUpdate}
      onPanEnd={onPanEnd}
    >
      <Stack>
        <Container
          width={size}
          height={size}
          decoration={{
            color: "rgba(255,255,255,0.10)",
            borderRadius: size / 2,
          }}
        />
        <Positioned
          left={center - inner / 2}
          top={center - inner / 2}
          width={inner}
          height={inner}
        >
          <Container
            width={inner}
            height={inner}
            decoration={{
              color: "rgba(255,255,255,0.18)",
              borderRadius: inner / 2,
            }}
          />
        </Positioned>
        <Positioned
          left={pos.x - knob / 2}
          top={pos.y - knob / 2}
          width={knob}
          height={knob}
        >
          <Container
            width={knob}
            height={knob}
            decoration={{ color: "#4fc3f7", borderRadius: knob / 2 }}
          />
        </Positioned>
      </Stack>
    </GestureDetector>
  );
}
