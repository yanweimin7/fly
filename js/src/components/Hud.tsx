import React from "react";
import { Column, Container, Text, SizedBox } from "fuickjs";
import type { GameState } from "../store/game";
import { STAGES, FINAL_MATTER, VW } from "../game/config";

interface HudProps {
  state: GameState;
}

const BAR_W = VW - 20;

/** 顶部状态 HUD：等级名、物质、升级进度、生命值。 */
export default function Hud({ state }: HudProps) {
  const cur = STAGES[state.stageIndex];
  let pct: number;
  let nextName: string;
  if (state.stageIndex < STAGES.length - 1) {
    const next = STAGES[state.stageIndex + 1];
    pct =
      (state.matter - cur.reachMatter) / (next.reachMatter - cur.reachMatter);
    nextName = next.name;
  } else {
    pct = state.matter / FINAL_MATTER;
    nextName = "另一个宇宙";
  }
  pct = Math.max(0, Math.min(1, pct));
  const hp = Math.max(0, Math.min(1, state.health / state.maxHealth));

  return (
    <Container width={VW} padding={10} color="rgba(0,0,0,0.35)">
      <Column crossAxisAlignment="start">
        <Text
          text={`${cur.name}　物质 ${Math.floor(state.matter)}`}
          color="#ffffff"
          fontSize={16}
          fontWeight="bold"
        />
        <SizedBox height={6} />
        <Container width={BAR_W} height={10} color="rgba(255,255,255,0.20)">
          <Container width={BAR_W * pct} height={10} color="#4fc3f7" />
        </Container>
        <SizedBox height={4} />
        <Text
          text={`距「${nextName}」还需 ${Math.max(0, Math.ceil((state.stageIndex < STAGES.length - 1 ? STAGES[state.stageIndex + 1].reachMatter : FINAL_MATTER) - state.matter))}`}
          color="#cfd8dc"
          fontSize={12}
        />
        <SizedBox height={6} />
        <Container width={BAR_W} height={8} color="rgba(255,255,255,0.20)">
          <Container width={BAR_W * hp} height={8} color="#ef5350" />
        </Container>
      </Column>
    </Container>
  );
}
