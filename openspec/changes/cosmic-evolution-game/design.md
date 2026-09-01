## Context

`fly` 当前是一个空的 fuickjs 业务工程（`js/src/pages/home.tsx` 仅为占位首页，`js/src/store/global.ts` 为简单全局状态）。fuickjs 的渲染链路是 React Reconciler → `FuickNode` 树 → JSON DSL → QuickJS Isolate → Flutter `WidgetFactory`（`fuickjs_framework` 仓库）。本游戏需要实时循环、逐帧重渲染、虚拟摇杆与捕获按钮——这些均可用 fuickjs **现有导出能力**承载，已核实：`GestureDetector` 提供 `onPanStart/onPanUpdate/onPanEnd`（DragArgs 含相对起点累计 `dx/dy`）、`Stack`/`Positioned`/`AnimatedPositioned`、`Container`、`CustomPaint`、`Timer` 服务等。**本次仅修改 `fly` 业务层，不改动框架层。**

## Goals / Non-Goals

**Goals:**
- 用 fuickjs（React + QuickJS + Flutter）实现一个可玩的 11 级宇宙进化游戏。
- 游戏循环、碰撞、进化、输入、渲染、HUD 职责清晰分层，符合 CLAUDE.md 的文档同步要求。
- 性能可控（固定帧率 + 离屏裁剪），在中低端设备也能运行。

**Non-Goals:**
- 不做联机 / 排行榜 / 账号系统。
- 不引入第三方游戏引擎（如 Flame）；坚持使用 fuickjs 原语。
- 不实现音效资源（仅预留受击反馈占位）。

## Decisions

### 决策 1：渲染采用 Stack + Positioned 逐帧重渲染（已与用户确认）
- **选择**：每帧由 JS 游戏状态生成 `Stack` 内 N 个 `Positioned` 节点，经 fuickjs Reconciler 产出 DSL 给 Flutter 绘制。
- **理由**：直接用现有原语（`Stack`/`Positioned`/`Container` 均已导出），无需新增 Flutter Canvas Widget，最快落地；实体为数十个量级时 DSL 体积可控。用户已确认不采用框架层 Canvas 方案。
- **约束**：仅使用现有框架能力，不新增/修改框架 Widget 或服务。

### 决策 2：游戏循环用 fuickjs 的 Timer 服务驱动
- **选择**：通过 `dartCallNative`（`Timer.*` 在 worker isolate 同步白名单内）或 `dartCallNativeAsync` 以固定 tickRate（默认 30fps）回调 JS，每 tick 推进状态并触发 React 重渲染。
- **理由**：符合 CLAUDE.md 通信规范；同步 Timer 在 worker isolate 可用，延迟低。
- **替代**：依赖 `requestAnimationFrame` polyfill——若 `ex/` 未提供稳定 rAF，则退化为 Timer。

### 决策 3：碰撞与进化采用「连续尺寸 + 等级表」双模型
- **选择**：实体以连续 `radius` 参与碰撞（更小=可吞噬，更大=受伤）；等级（tier 1..11）由累计 `matter` 对照阈值表推进，仅决定玩家基础半径、解锁捕获、以及黑洞/中子星等特殊豁免。
- **理由**：用尺寸统一表达「比自己小/大」，规则简单可测；等级表集中配置，便于平衡调整。
- **替代**：纯 tier 比较——无法表达同阶陨石间的大中小差异（L1 全是陨石却要分大小），故不可行。

### 决策 4：相机跟随，玩家居中，世界坐标换算屏幕坐标
- **选择**：维护世界坐标系，渲染时以玩家坐标为视口中心，减去玩家坐标得到每个实体的屏幕偏移；超出视口的实体裁剪不渲染。
- **理由**：星空应比屏幕大，玩家自由探索；中心化让摇杆手感稳定。

### 决策 5：状态管理用独立 game store（不污染现有 global store）
- **选择**：新增 `js/src/store/game.ts` 持有 `GameState`（玩家、实体列表、satellites、matter、stage、health、status），用 React `useState`/`useReducer` + 订阅模式驱动重渲染。
- **理由**：与现有 `global.ts` 解耦，避免无关重渲染。

## Risks / Trade-offs

- **[性能]** 每帧全量重渲染 DSL 可能在大实体数时卡顿 → 缓解：固定 30fps、离屏裁剪、限制同屏实体上限（如 60）、只对变化节点 diff（Reconciler 已做）。
- **[输入延迟]** 摇杆拖拽事件经 Flutter→JS 链路有开销 → 缓解：事件以状态注入循环，不阻塞 tick；摇杆用 `onPanUpdate` 节流。
- **[数值平衡]** 阈值 100~5000 与伤害/速度未经试玩 → 缓解：数值集中配置，便于后续调参。

## Migration Plan

- 本变更为新建工程内容，不影响现有首页；可保留 `home.tsx` 作为入口跳转到游戏页，或改造为首屏即游戏。
- 回滚：删除 `js/src/game/*`、`js/src/components/*`、`js/src/pages/game.tsx` 并还原 `home.tsx` 即可。
- 由于不改动框架层，**无需同步 `fuickjs_framework/docs/`**。

## Open Questions

- 是否需要音效 / 震动反馈（当前仅做视觉占位）。
- 同屏实体上限与可视半径的具体数值待试玩后确定（先用保守默认值）。
- 摇杆「死区」与最大半径（像素）的具体手感参数待试玩后微调。
