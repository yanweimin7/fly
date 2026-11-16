import React, { useEffect, useState } from "react";
import {
  Column,
  Container,
  Padding,
  Text,
  SizedBox,
  GestureDetector,
} from "fuickjs";
import { SCENE3D_GFX } from "../game/config";
import { BLACKHOLE_MODEL } from "../game/models";
import { Scene3D } from "@fuickjs-community/scene3d";

interface StartMenuProps {
  /** 点击「开始游戏 / 重新开始」回调：丢弃存档并开新局。 */
  onStart: () => void;
  /** 是否存在可继续的暂停存档。 */
  hasSave: boolean;
  /** 点击「继续游戏」回调：从存档恢复。 */
  onContinue: () => void;
  /** 存档水合完成前不渲染按钮，避免「开始游戏」闪现后又变成「继续游戏」。 */
  ready: boolean;
  screenW: number;
  screenH: number;
}

/** 进入游戏时的开始菜单：纯星空背景（无全屏遮罩）上叠一个黑洞 + 黑色面板 + 下方「开始游戏」按钮。
 * 游戏本体在 onStart 之前既不推进也不挂载（见 GamePage 的 started 闸门）。
 * 有暂停存档时主按钮变为「继续游戏」，下方追加「重新开始」。 */
export default function StartMenu({
  onStart,
  hasSave,
  onContinue,
  ready,
  screenW,
  screenH,
}: StartMenuProps) {
  const [alpha, setAlpha] = useState(0);

  useEffect(() => {
    let a = 0;
    const id = setInterval(() => {
      a = Math.min(1, a + 0.08);
      setAlpha(a);
      if (a >= 1) clearInterval(id);
    }, 50);
    return () => clearInterval(id);
  }, []);

  // 不加全屏遮罩：背景保持纯星空（由 GamePage 的 StarField 铺满），只有面板与按钮是实的。
  const panel = `rgba(8,10,20,${(0.88 * alpha).toFixed(3)})`;
  const btn = `rgba(79,195,247,${alpha.toFixed(3)})`;

  // 菜单顶部装饰：与游戏内黑洞共用同一个纯 3D 模型（GLB）。
  const holeR = Math.min(84, screenW * 0.22);

  return (
    <Container width={screenW} height={screenH} alignment="center">
      <Column crossAxisAlignment="center" mainAxisAlignment="center">
        {/* 黑洞：阴影 + 光子环 + 透镜弧，不渲染吸积盘实体。 */}
        <Scene3D
          width={holeR * 2}
          height={holeR * 2}
          bodies={[
            {
              id: 99,
              src: BLACKHOLE_MODEL,
              x: holeR,
              y: holeR,
              size: holeR * 2,
              spin: 0,
              tilt: 0,
            },
          ]}
          lightDir={SCENE3D_GFX.lightDir}
          lightIntensity={SCENE3D_GFX.lightIntensity}
          envIntensity={SCENE3D_GFX.envIntensity}
        />

        <SizedBox height={28} />
        <Container
          width={Math.min(300, screenW - 48)}
          alignment="center"
          decoration={{
            color: panel,
            borderRadius: 16,
            border: { width: 1, color: `rgba(155,232,255,${0.35 * alpha})` },
          }}
        >
          <Padding padding={{ top: 22, bottom: 22, left: 18, right: 18 }}>
            <Column crossAxisAlignment="center" mainAxisAlignment="center">
              <Text
                text="宇宙进化"
                color="#9be8ff"
                fontSize={26}
                fontWeight="bold"
              />
              <SizedBox height={10} />
              <Text
                text="吞噬陨石与行星，逐级进化为恒星、黑洞，最终化为另一个宇宙"
                color="#cfd8dc"
                fontSize={13}
              />
            </Column>
          </Padding>
        </Container>

        <SizedBox height={28} />

        {ready && (
          <React.Fragment>
            <GestureDetector onTap={hasSave ? onContinue : onStart}>
              <Container
                width={180}
                height={52}
                alignment="center"
                decoration={{
                  color: btn,
                  borderRadius: 26,
                  border: {
                    width: 1,
                    color: `rgba(255,255,255,${0.7 * alpha})`,
                  },
                }}
              >
                <Text
                  text={hasSave ? "继续游戏" : "开始游戏"}
                  color="#000000"
                  fontSize={18}
                  fontWeight="bold"
                />
              </Container>
            </GestureDetector>

            {hasSave && (
              <React.Fragment>
                <SizedBox height={12} />
                <GestureDetector onTap={onStart}>
                  <Container
                    width={180}
                    height={44}
                    alignment="center"
                    decoration={{
                      borderRadius: 22,
                      border: {
                        width: 1,
                        color: `rgba(144,164,174,${0.6 * alpha})`,
                      },
                    }}
                  >
                    <Text text="重新开始" color="#b0bec5" fontSize={15} />
                  </Container>
                </GestureDetector>
              </React.Fragment>
            )}
          </React.Fragment>
        )}

        <SizedBox height={16} />
        <Text
          text="吞噬陨石与行星，逐级进化，最终化为另一个宇宙"
          color="#90a4ae"
          fontSize={12}
        />
      </Column>
    </Container>
  );
}
