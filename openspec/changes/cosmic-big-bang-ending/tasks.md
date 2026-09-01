## 1. 状态模型与配置

- [x] 1.1 在 `store/game.ts` 新增 `EndingPhase` 类型（`converge | blue | bang | done`）与 `EndingState { phase, t }`，为 `GameState` 增加可选的 `ending` 字段；验证 `npm run lint` 通过。
- [x] 1.2 在 `config.ts` 新增结局阶段时长常量（`ENDING_CONVERGE_S=2.5`、`ENDING_BLUE_S=1`、`ENDING_BANG_S=2`）与爆炸粒子数量常量（如 `BANG_PARTICLES=32`）；验证 `npm run lint` 通过。

## 2. 引擎结局推进

- [x] 2.1 在 `engine.ts` 新增 `advanceEnding(state)`：按 `ending.phase` 与 `t` 推进团聚收敛（实体坐标缓动到玩家中心并缩小、归一后清空实体/卫星）、蓝点（青白小球 + 增强 `boxShadow` + 正弦闪烁）、爆炸（生成并扩散受限粒子、淡出）；`step()` 开头在存在 `ending` 时改走 `advanceEnding` 而非返回；验证 `npm run build` 无类型错误。
- [x] 2.2 在 `step()` 结局判定处：命中「黑洞且物质 5000」时初始化 `ending`（`phase:"converge"`、`t:0`）并置 `status="win"`；各阶段 `t` 走满后切换下一阶段，最后 `phase:"done"`；验证 `npm run build` 无类型错误。

## 3. 渲染层

- [x] 3.1 新增 `components/CinematicEnd.tsx`：依据 `state.ending` 渲染团聚收敛（复用收敛后的实体槽位）、蓝点（青白小球 + 增强 `boxShadow` + 正弦闪烁）、爆炸扩散（有限 `Positioned` 粒子 + 全屏光环/渐亮层，最后淡入既有星空底色）；验证 `npm run build` 无类型错误。
- [x] 3.2 改 `pages/game.tsx`：`status==="win"` 且 `ending.phase!=="done"` 时渲染 `CinematicEnd`（替代 GameField/HUD），`phase==="done"` 才渲染既有 `Overlay`；验证 `npm run build` 无类型错误。

## 4. 集成验证

- [x] 4.1 运行 `npm run build` 与 `npm run lint`，确认全部通过、无类型/告警错误。
- [ ] 4.2 通过 `npm run start` 连接 Flutter 热重载，将黑洞物质调到 5000 触发结局，肉眼确认依次播放「团聚 → 蓝点 → 爆炸 → 另一个宇宙界面」且动画期间输入被屏蔽、重启正常。
