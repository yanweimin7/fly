import React, { useEffect, useState } from "react";
import { Column, Container, Text, SizedBox, GestureDetector } from "fuickjs";

interface OverlayProps {
  win: boolean;
  stageName: string;
  matter: number;
  onRestart: () => void;
  screenW: number;
  screenH: number;
}

/** 游戏结束 / 「另一个宇宙」结局界面。背景黑幕淡入，让撞击爆炸先露出来。 */
export default function Overlay({
  win,
  stageName,
  matter,
  onRestart,
  screenW,
  screenH,
}: OverlayProps) {
  const [alpha, setAlpha] = useState(0);

  useEffect(() => {
    let a = 0;
    const id = setInterval(() => {
      a = Math.min(1, a + 0.06);
      setAlpha(a);
      if (a >= 1) clearInterval(id);
    }, 50);
    return () => clearInterval(id);
  }, []);

  const bg = `rgba(0,0,0,${(0.72 * alpha).toFixed(3)})`;

  return (
    <Container width={screenW} height={screenH} color={bg} alignment="center">
      <Column crossAxisAlignment="center" mainAxisAlignment="center">
        <Text
          text={win ? "另一个宇宙" : "游戏结束"}
          color={win ? "#7c4dff" : "#ef5350"}
          fontSize={30}
          fontWeight="bold"
        />
        <SizedBox height={12} />
        <Text text={`等级：${stageName}`} color="#ffffff" fontSize={16} />
        <Text
          text={`物质：${Math.floor(matter)}`}
          color="#cfd8dc"
          fontSize={16}
        />
        <SizedBox height={24} />
        <GestureDetector onTap={onRestart}>
          <Container
            width={160}
            height={48}
            alignment="center"
            decoration={{ color: "#4fc3f7", borderRadius: 24 }}
          >
            <Text
              text="重新开始"
              color="#000000"
              fontSize={18}
              fontWeight="bold"
            />
          </Container>
        </GestureDetector>
      </Column>
    </Container>
  );
}
