## Context

现状见 `openspec/changes/cosmic-evolution-game`（尚未归档）。当前结束后端在
`engine.ts:296` `step()` 里判「黑洞且物质 5000」即设 `status = "win"`，随后
`game.tsx:73` 检测 `status !== "playing"` 直接渲染 `Overlay.tsx`（静态「另一个宇宙」）。
游戏循环为 `setInterval` 固定步长 30fps：每帧 `step()` 就地修改状态再 `notify()`
触发 React 重渲染，由 `Stack` + `Positioned` 逐帧产出 DSL 交给 Flutter 绘制。

本改动把「立即弹结局」替换成一段可播放的创生动画（团聚 → 蓝点 → 爆炸 → 结局界面）。
渲染仍复用现有 30fps 循环与 `Stack`/`Positioned` 原语，不引入新框架能力。需求契约见本变更
`specs/cosmic-evolution/cinematic-ending/spec.md`。

## Goals / Non-Goals

**Goals:**
- 把结局改成四个阶段的可感知动画，完整表达「团聚→蓝点→爆炸成宇宙」。
- 全部用 fuickjs 现有导出能力 `Stack` / `Positioned` / `Container` / `boxShadow` 实现。
- 动画期间锁定输入与碰撞，播毕进入既有 Overlay 结局界面。
- 保持与现有 30fps 固定步长循环同构，避免引入新动画时钟。

**Non-Goals:**
- 不修改 `fuickjs_framework` 框架层（不新增 Widget / 服务 / 动画原语）。
- 不做真正的粒子物理引擎——爆炸用有限数目的扩散节点 / 光晕近似。
- 不改变 11 级进化、捕获、伤害等既有玩法规则（仅替换最终结局呈现）。

## Decisions

**D1. 状态模型：复用 `status = "win"`，另加 `ending` 进度对象。**
给 `GameState` 增加 `ending?: EndingState`，其中
`phase: "converge" | "blue" | "bang" | "done"` 与 `t`（当前阶段进度 0..1）。
当 `step()` 命中结局条件时置 `status = "win"` 并初始化 `ending`；完成后
`phase` 置 `"done"`。组件据此决定渲染动画还是 Overlay。
- 备选 A：新增 `status = "cinematic"` 枚举。被否：`win` 已是结局语义，
  加枚举会让 `game.tsx` 的「非 playing 显示结束层」分支变复杂；用独立进度对象更内聚。
- 备选 B：单独模块级动画计时器。被否：会引入第二套时钟，与现有固定步长循环割裂。

**D2. 动画推进放在 `step()` 内（结局分支）。**
在 `step()` 开头 `if (state.status !== "playing") return;` 改为：若 `ending` 存在，
改为推进结局动画（`advanceEnding(state)`），不再返回；非结局仍走原逻辑。
这样复用 30fps 时钟，无需改 `game.tsx` 的循环接线。
- 备选：在组件里用独立 `requestAnimationFrame` 推进。被否：与现有步长不同步，
  且阶段插值依赖 `dt` 的归一在引擎侧更易测。

**D3. 团聚阶段的「吸收」是视觉收敛，非战斗结算。**
进入结局后世界冻结（实体不再漂移 / 碰撞 / 生成），改为依据阶段进度把实体坐标
线性/缓动插值到玩家中心并缩小半径，`t=1` 时清空 `entities`/`satellites`，
进入 `blue`。复用现有实体数据做这场戏，避免新建「粒子」集合。
- 备选：新建独立团聚粒子数组。被否：与既有实体重复、浪费，且收敛行为一致。

**D4. 蓝点阶段：以膨胀光晕近似「发亮的小蓝点」。**
玩家收缩为不小半径（如 8px）的青色小球，`boxShadow` 光晕 `blurRadius` / 颜色随
`t` 增强并做正弦闪烁，营造「发亮」。进入 `bang` 前在队伍中央预置一个高亮核。

**D5. 爆炸阶段：有限扩散节点 + 全屏光晕。**
在 `bang` 开始时生成一批（如 24~40）扩散粒子，随 `t` 从中心径向飞出并淡出；
同时一个全屏扩散光环 / 渐亮层铺满视口，最后转成星空背景色。粒子数量受控以保证
单帧 DSL 规模（沿用 GameField 已有的离屏裁剪思路）。
- 备选：完整粒子系统。被否：非目标，性能与复杂度不成比例。

**D6. 渲染拆一个新组件 `CinematicEnd`，与 `GameField` 平级。**
`game.tsx` 在 `status === "win"` 且 `ending.phase !== "done"` 时渲染
`CinematicEnd`（负责蓝点 / 爆炸 / 团聚收敛层），`phase === "done"` 才渲染既有
`Overlay`。HUD 在动画期间不渲染（见 `hud` 规格）。

**D7. 阶段时长常量集中在 `config.ts`。**
新增 `ENDING_STAGES`（各阶段秒数）供推进与插值使用，便于调参。初始节奏：
**团聚 2.5s → 蓝点 1s → 爆炸 2s**（总约 5.5s），团聚最长以保证「缓缓聚拢」的仪式感、
蓝点最短作为惊鸿一瞥、爆炸约 2s 铺满屏幕；时长可后续在常量上调参。

**D8. 蓝点/爆炸视觉基调（呼应「发亮的小蓝点」「爆炸成宇宙」）。**
- 蓝点：明亮青白「蓝」点（如纯色 `#40c4ff`），`boxShadow` 光晕随 `t` 增强并以正弦闪烁，
  收缩到较小半径（如 ~10px）表现「一点」。
- 爆炸：由蓝点向外扩散的青白色粒子（`Stack`/`Positioned` 径向散射 + 淡出），同时叠一
  个全屏扩散光晕 / 渐亮层铺满视口，粒子数固定上限（24~40），最后淡入既有星空底色与
  「另一个宇宙」结局界面，形成「新宇宙诞生后归于平静」的收束。

## Risks / Trade-offs

- [团聚收敛在多实体下视觉可能杂乱] → 收敛采用统一缓动函数（ease-in-out）并整体缩小，
  视觉上呈「向一点收缩」，复用 `MARGIN=60` 同款裁剪控制开销。
- [爆炸粒子增多导致单帧 DSL 过大] → 粒子数量固定上限（<40）+ 复用离屏裁剪。
- [30fps 步长下动画不够顺滑] → 阶段时长控制在 1~2s 且用连续 `t` 插值，步进感可接受；
  若需更细可在后续调 `TICK_RATE`（不改框架）。
- [动画期间若点重开/意外状态] → 结局分支仅起步于已判 `win` 的状态，重开走
  `store.reset()` 重建，干净退出。
