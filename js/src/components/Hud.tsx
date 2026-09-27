import React from "react";
import {
  Column,
  Container,
  Text,
  SizedBox,
  LinearProgressIndicator,
} from "fuickjs";
import { STAGES, FINAL_MATTER } from "../game/config";

/** 注意：GameStore 每帧就地修改同一 state 对象引用，若 HUD 直接接收 `state`
 * 并用 `a.state.matter === b.state.matter` 做 memo 比较，会因引用恒定而永远相等、
 * 导致 HUD 永不更新（看起来进度不保留/停滞）。因此改为接收拆解后的标量 props。 */
interface HudProps {
  screenW: number;
  /** 当前等级 0 基索引。 */
  stageIndex: number;
  /** 累计物质。 */
  matter: number;
  health: number;
  maxHealth: number;
}

/** 顶部状态 HUD：等级名、物质、升级进度、生命值。 */
const Hud = React.memo(
  function Hud({ screenW, stageIndex, matter, health, maxHealth }: HudProps) {
    const cur = STAGES[stageIndex];
    let pct: number;
    let nextName: string;
    if (stageIndex < STAGES.length - 1) {
      const next = STAGES[stageIndex + 1];
      pct = (matter - cur.reachMatter) / (next.reachMatter - cur.reachMatter);
      nextName = next.name;
    } else {
      pct = matter / FINAL_MATTER;
      nextName = "另一个宇宙";
    }
    pct = Math.max(0, Math.min(1, pct));
    const maxH = maxHealth && maxHealth > 0 ? maxHealth : 100;
    const hp = Math.max(0, Math.min(1, health / maxH));

    return (
      <Container width={screenW} padding={10} color="rgba(0,0,0,0.35)">
        <Column crossAxisAlignment="start">
          <Text
            text={`L${cur.id} ${cur.name}　物质 ${Math.floor(matter)}`}
            color="#ffffff"
            fontSize={16}
            fontWeight="bold"
          />
          <SizedBox height={6} />
          <LinearProgressIndicator
            value={pct}
            color="#4fc3f7"
            backgroundColor="rgba(255,255,255,0.20)"
            strokeWidth={10}
            borderRadius={5}
          />
          <SizedBox height={4} />
          <Text
            text={`距「${nextName}」还需 ${Math.max(0, Math.ceil((stageIndex < STAGES.length - 1 ? STAGES[stageIndex + 1].reachMatter : FINAL_MATTER) - matter))}`}
            color="#cfd8dc"
            fontSize={12}
          />
          <SizedBox height={8} />
          <Text
            text={`HP ${Math.ceil(health)} / ${maxH}`}
            color="#ff8a80"
            fontSize={12}
            fontWeight="bold"
          />
          <SizedBox height={3} />
          <LinearProgressIndicator
            value={hp}
            color={hp > 0.5 ? "#66bb6a" : hp > 0.25 ? "#ffa726" : "#ef5350"}
            backgroundColor="rgba(255,255,255,0.18)"
            strokeWidth={12}
            borderRadius={6}
          />
        </Column>
      </Container>
    );
  },
  (a, b) =>
    a.screenW === b.screenW &&
    a.stageIndex === b.stageIndex &&
    a.matter === b.matter &&
    a.health === b.health &&
    a.maxHealth === b.maxHealth,
);

export default Hud;
