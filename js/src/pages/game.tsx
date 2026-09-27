import React, { useRef, useEffect, useState } from "react";
import {
  Scaffold,
  Stack,
  Positioned,
  Container,
  GestureDetector,
  Text,
  useMediaQuery,
  DeviceInfoService,
} from "fuickjs";
import { GameStore, InputState } from "../store/game";
import { step, tryCapture, forceLevelUp, revive } from "../game/engine";
import {
  STAGES,
  TICK_RATE,
  DT,
  CAPTURE_RANGE,
  setScreenSize,
} from "../game/config";
import GameField from "../components/GameField";
import TransformEffect from "../components/TransformEffect";
import StarField from "../components/StarField";
import Hud from "../components/Hud";
import Joystick from "../components/Joystick";
import CaptureButton from "../components/CaptureButton";
import Overlay from "../components/Overlay";

/** 运行时 bundle 指纹：native 侧在 eval 前注入 __FUICK_BUNDLE__.sha256，
 * 用于快速确认当前跑的是哪个包（旧包 vs 新包）。取末 6 位即可区分。 */
function bundleFingerprint(): string {
  const b = (globalThis as Record<string, any>).__FUICK_BUNDLE__ as
    { sha256?: string } | undefined;
  if (b?.sha256) return b.sha256.slice(-6);
  if (typeof (globalThis as any).FLY_DEV !== "undefined") return "dev";
  return "?";
}

/** 游戏主页面：整合场地、HUD、摇杆、捕获按钮与结局界面。 */
export default function GamePage() {
  const mq = useMediaQuery();
  const [screenSize, setScreenSizeLocal] = useState({ w: 0, h: 0 });

  useEffect(() => {
    if (mq.screenWidth > 0 && mq.screenHeight > 0) {
      setScreenSizeLocal({ w: mq.screenWidth, h: mq.screenHeight });
      return;
    }
    DeviceInfoService.getDeviceInfo()
      .then((info) => {
        if (info.screenWidth > 0 && info.screenHeight > 0) {
          setScreenSizeLocal({ w: info.screenWidth, h: info.screenHeight });
        }
      })
      .catch(() => {});
  }, [mq.screenWidth, mq.screenHeight]);

  const W =
    screenSize.w > 0 ? screenSize.w : mq.screenWidth > 0 ? mq.screenWidth : 360;
  const H =
    screenSize.h > 0
      ? screenSize.h
      : mq.screenHeight > 0
        ? mq.screenHeight
        : 640;

  const storeRef = useRef<GameStore | null>(null);
  if (!storeRef.current) storeRef.current = new GameStore(W, H);
  const store = storeRef.current;

  const inputRef = useRef<InputState>({ dx: 0, dy: 0, intensity: 0 });
  const [, setTick] = useState(0);

  useEffect(() => store.subscribe(() => setTick((t) => t + 1)), [store]);

  // 屏幕尺寸：设备信息可能异步返回且随后不再变化；只在首次拿到有效尺寸时
  // 用真实 W/H 初始化场地（GameStore 首帧可能是 360x640 fallback），
  // 后续再抖动不得触发 reset，避免把 revive 保留的进度抹掉。
  const screenReadyRef = useRef(false);
  useEffect(() => {
    if (W <= 360 || H <= 640) return;
    setScreenSize(W, H);
    if (!screenReadyRef.current) {
      screenReadyRef.current = true;
      store.reset(W, H);
    }
  }, [W, H, store]);

  useEffect(() => {
    const id = setInterval(() => {
      step(store.getState(), inputRef.current, DT);
      store.notify();
    }, 1000 / TICK_RATE);
    return () => clearInterval(id);
  }, [store]);

  const state = store.getState();
  const canCapture = STAGES[state.stageIndex].canCapture;
  const hasCapturable =
    canCapture &&
    state.entities.some(
      (e) =>
        Math.hypot(e.x - state.player.x, e.y - state.player.y) <=
        state.player.radius + CAPTURE_RANGE,
    );
  const stageName = `L${STAGES[state.stageIndex].id} ${STAGES[state.stageIndex].name}`;

  return (
    <Scaffold backgroundColor="#000000">
      <Stack fit="expand">
        <StarField
          playerX={state.player.x}
          playerY={state.player.y}
          width={W}
          height={H}
        />
        <Stack fit="expand">
          <GameField state={state} screenW={W} screenH={H} />
          <TransformEffect state={state} screenW={W} screenH={H} />

          {/* 临时调试读数：末 6 位为 bundle sha256 指纹（__FUICK_BUNDLE__ 由 native 注入）。 */}
          <Positioned left={W - 150} top={90} width={145}>
            <Text
              text={`P(${Math.round(state.player.x)},${Math.round(
                state.player.y,
              )}) n=${state.entities.length} i=${inputRef.current.intensity.toFixed(
                2,
              )} ${bundleFingerprint()}`}
              color="#00ff88"
              fontSize={11}
            />
          </Positioned>

          <Positioned left={0} top={0} width={W}>
            <Hud
              screenW={W}
              stageIndex={state.stageIndex}
              matter={state.matter}
              health={state.health}
              maxHealth={state.maxHealth}
            />
          </Positioned>

          <Positioned left={10} top={120}>
            <GestureDetector
              onTap={() => {
                forceLevelUp(store.getState());
                store.notify();
              }}
            >
              <Container
                width={56}
                height={56}
                alignment="center"
                decoration={{
                  color: "rgba(76,175,80,0.85)",
                  borderRadius: 28,
                  border: { color: "#ffffff", width: 2 },
                }}
              >
                <Text
                  text="升级"
                  color="#ffffff"
                  fontSize={16}
                  fontWeight="bold"
                />
              </Container>
            </GestureDetector>
          </Positioned>

          <Positioned left={18} bottom={28}>
            <Joystick inputRef={inputRef} />
          </Positioned>

          <Positioned right={22} bottom={40}>
            <CaptureButton
              enabled={hasCapturable}
              onCapture={() => {
                tryCapture(store.getState());
                store.notify();
              }}
            />
          </Positioned>

          {state.hitFlash > 0 && (
            <Positioned left={0} top={0} right={0} bottom={0}>
              <Container color="rgba(255,0,0,0.22)" />
            </Positioned>
          )}

          {state.status !== "playing" && (
            <Positioned left={0} top={0} right={0} bottom={0}>
              <Overlay
                win={state.status === "win"}
                stageName={stageName}
                matter={state.matter}
                onRestart={() => {
                  if (state.status === "gameover") {
                    // 死亡续玩：保留已累计物质与等级，清场回满血重来。
                    revive(store.getState());
                    store.notify();
                  } else {
                    store.reset(W, H);
                  }
                }}
                screenW={W}
                screenH={H}
              />
            </Positioned>
          )}
        </Stack>
      </Stack>
    </Scaffold>
  );
}
