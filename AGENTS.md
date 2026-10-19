# AGENTS.md

`fly/` 是 `fuickjs` 框架的**独立 JS 开发沙盒**：一个把 React 协调器输出成
JSON DSL、并在 QuickJS 隔离环境中分发给 Flutter 的 Playground。它用于在功能
正式进入 demo（`fuickjs_demo`）之前做迭代。架构与约定以本文档与 `docs/` 为准。

## 当前状态（2026-10）

- 游戏已是完整可玩形态：11 级进化（STAGES）、摇杆移动 + 卫星捕获、黑洞引力
  与吸入、2.5D 球面光照行星渲染（方案见 `docs/planet-2.5d-rendering.md`）、
  结局四阶段转场、音效系统、开始菜单闸门。
- 工作树有**未提交**改动：音效链路（`src/game/sound.ts`、`assets/audio/`、
  `tools/gen_sfx.py`）、`src/components/StartMenu.tsx` 及 engine/GameField/
  Planet/config 等；`js/probe*.tsx|.cjs` 是一次性探针（见下文），**不要提交**。
- `dist/game-1.0.0.zip` 是最近一次 `bundle:pack` 产物。

## 目录结构

- 整个应用都位于 `fly/js/` 下，**没有根 `package.json`**——所有命令都从
  `fly/js/` 运行。
- 入口链：`js/src/index.ts`（把 `initApp` 挂到 `globalThis` 并立即调用）→
  `js/src/app.tsx` 的 `initApp()`（`Runtime.configure` + `Runtime.bindGlobals`
  + `Router.register("/")`）→ `pages/home.tsx`（直接渲染 GamePage）→
  `pages/game.tsx`（游戏主页面）。
- `src/` 分层（改代码前先想清楚落在哪层）：
  - `store/game.ts` —— **纯数据层**：`GameState`/`Entity` 模型 + 订阅/重渲染
    桥接，不写游戏逻辑。
  - `game/config.ts` —— **全部可调参数集中地**：`TICK_RATE`/`DT`、`STAGES`
    （11 级进化表）、`PLANET_GFX`（2.5D 渲染参数）、黑洞/盲区生成/结局常量。
  - `game/engine.ts` —— **纯逻辑层**：`createGame`/`step`/`tryCapture` 等，
    固定步长（30Hz）就地修改传入的 `GameState`，不依赖 React。
  - `components/` —— 表现层：`Planet.tsx` + `PlanetPainter.ts` +
    `planetShape.ts`/`sphere.ts`（2.5D 球面光照）、`StarField`、`GameField`、
    `Hud`、`Joystick`、`CaptureButton`、`Overlay`、`StartMenu`、
    `TransformEffect`。
  - `pages/game.tsx` —— 组合层：屏幕尺寸探测、`setInterval(1000/TICK_RATE)`
    游戏循环、`started` 闸门（未点开始不推进游戏）、音效预加载。
- 世界模型：**世界坐标 1 单位 = 屏幕 1 像素**，半径即绘制半径即碰撞半径；
  圆形宇宙（`WORLD_RADIUS`）夹住玩家与相机；天体在屏幕外盲区生成后漂移入屏。
- `js/assets/{images,audio,videos}` —— 静态资源，随签名 zip 一并下发
  （调试时由 debug server 通过 WebSocket 推送）。`audio/` 下的 wav 由
  `tools/gen_sfx.py` 纯合成，**不要引入外部素材**。
- `js/dist/` 是构建产物（已 gitignore）。
- 关键脚本：`esbuild.js`（构建）、`debug_server.js`（热重载服务器）、
  `scripts/bundle-pack.js`（签名打包/发布 demo）、`tools/gen_sfx.py`（音效生成）。
- `docs/planet-2.5d-rendering.md` —— 2.5D 球面光照渲染技术方案（实施依据）。

## 命令（在 `fly/js/` 下运行）

- `npm run build` —— esbuild 把 `src/index.ts` 构建成 `dist/bundle.js`。
- `npm run dev` —— `esbuild --watch`（不含调试服务器）。
- `npm run start` —— 运行 **`debug_server.js`**：以 `SOURCEMAP=true` 构建，
  然后通过 `ws://localhost:8080` 热重载已连接的 Flutter 客户端。按键：
  `r` 重新构建+重载，`a` 重新同步资源，`q` 退出。注意：每次重载都会重新
  收集 assets（内容未变时有 md5 缓存），新增图片不必手动按 `a`。
- `npm run lint` / `npm run lint:fix` —— 仅对 `src` 做 ESLint。
- `npm run bundle:pack` —— 把 `dist/bundle.js` + `js/assets/` 签名打包成
  `dist/game-<version>.zip`（版本默认 1.0.0，可用
  `node scripts/bundle-pack.js --version X` 覆盖；不含拷贝）。需要 demo 签名密钥
  （`fuickjs_demo/js/tools/bundle/bundle_signing_key.pem`）。
- `npm run bundle:pack:copy` —— **发布到 demo 的标准流程**：同上打成 zip，
  并拷贝到 `fuickjs_demo/app/assets/js/game.zip`，同时更新 `bundles.json`
  中 `game` 条目的 sha256（保留其余包）。

**交付约定（重要）：游戏改动完成后必须执行 `npm run bundle:pack:copy`
发布到 demo**，不能只停在 `npm run dev` / WebSocket 热重载阶段（那只是本地验证）。
除非用户明确说暂不发布，否则每次改动结束都要跑。发布后 JS 在 demo 生效的
唯一途径仍是重新 `flutter run`。

**framework 改动同样要 commit & push**：`fuickjs_framework/`（monorepo，含
fuickjs / fuickjs_dart / fuickjs_flutter）若在本次迭代中有源码改动，也必须
提交并推送（`git -C <repo> add -A && git commit && git push`）。跳过杂项：
已跟踪的 `.DS_Store` 与未跟踪的 `node_modules.zip` 这类产物不要提交。

**空白页坑：fly 的 `initApp` 必须调 `Runtime.bindGlobals()`**（外加
`Runtime.configure({ prewarm: false, prewarmMs: 50 })`）。缺了它
`globalThis.fuickjs.render/...` 不挂载，Flutter 无法发起首次页面渲染 →
加载 bundle 成功（打 "Fly App Initialized"）、但整页空白且**没有任何报错**
（连 `[Perf] page=...` 渲染日志都没有）。与 demo 主 bundle / 旧 game-entry
对齐即可。

验证改动是否生效要用 **WebSocket 热重载**，而不是 `console.log`
（JS 日志会路由到 Flutter 的 logger）。在 `DevFuickAppPage` 打开之前，
调试服务器会提示"没有已连接的 Flutter 设备"。

## 构建坑点（高信号）

- `esbuild.js` 把 `fuickjs` **别名到
  `../../fuickjs_framework/fuickjs/dist/index.js`**。如果该 dist 过期或缺失，
  构建会因无法解析而失败。修改框架后需先构建 `fuickjs`
  （`cd ../../fuickjs_framework/fuickjs && npm run build`）。
- React 19 被 `esbuild.js` 别名到特定的 CJS 构建（production / development），
  不要去"修正"裸的 `react`/`react-reconciler`/`scheduler` 导入——这是有意为之。
- **字节码：构建期不再生成 `bundle.qjc`**（commit 6a148d2 起的既定架构）。
  字节码由运行时 BundleCompiler（`lib/core/engine/bundle_compiler.dart`）经 FFI
  在设备上首次加载时生成并落盘，与引擎同版本，不存在 BC_VERSION 漂移；
  构建期反而会**主动删除 `dist/bundle.qjc`**（旧文件只会让加载方先撞一次版本
  不匹配再被隔离成 `.stale`）。不要改回构建期 qjsc。
- `@fuickjs-community/video_player` 仍在 `package.json` 与 `esbuild.js` 的
  alias 里（视频背景已废弃，src 不再引用）。删依赖前必须先删 alias，
  否则构建解析失败。
- 环境变量 `FLY_OUTPUT_DIR=<dir>` 会让 `build` 把 `bundle.js` 额外拷贝到
  指定目录（例如某个 Flutter 工程的 `assets/js`）。在另一个 app 上迭代时
  用它代替手动拷贝。

## Node probe 工作流（脱离 Flutter 验证逻辑）

`js/` 根目录的 `probe*.tsx` 是一次性探针：mock 原生全局
（`__FUICK_BUNDLE__`、`dartCallNative` / `dartCallNativeAsync`），
import `src/` 里的引擎/音效模块，在 Node 里直接跑成千帧模拟（如 90 秒游玩
统计吞噬/死亡次数、Audio 调用次数与限流效果），输出写到 stdout。

用法：esbuild 单独打包成 `probe*.cjs`（`platform: node`）后 `node probe*.cjs`。
**这些 `.tsx`/`.cjs` 是 scratch 文件，没有 gitignore，不要提交。**

## 音效子系统

- `src/game/sound.ts` 封装 fuickjs `AudioService`：路径是 **bundle 相对路径**
  （`audio/eat.wav`），文件随签名 zip 自动下发。
- 双层限流：引擎侧原生 35ms 限流 + `MIN_GAP_MS` 同音效最小间隔（避免连吃
  5 颗陨石糊成噪音）；`sfx(name, force=true)` 跳过限流，用于进化/胜负关键音。
- `preloadSfx()` 进游戏页时调用：预加载 + `AudioService.probe` 诊断
  （听不见时看日志里的 `[AudioService] probe`，可区分"没打进包 / 解码失败 /
  播放链路问题"）。
- wav 素材：`python3 tools/gen_sfx.py` 纯合成（16-bit PCM 单声道 44.1kHz）。

## 2.5D 行星渲染

- 方案与框架能力清单见 `docs/planet-2.5d-rendering.md`（唯一实施依据）。
- 代码：`components/PlanetPainter.ts`（生成 CustomPaint 指令）、
  `game/planetShape.ts` + `game/sphere.ts`（球面几何/投影数学）、
  `components/Planet.tsx`（按等级分派：冷行星走 2.5D，发光天体/黑洞/宇宙
  保持原有发光渲染）。
- 可调参数集中在 `config.ts` 的 `PLANET_GFX`（光源向量、轴倾角、自转、
  夜帽、高光、陨石坑、风暴、行星环、LOD 阈值）——调观感只改这里，
  热重载试玩后收敛。

## 风格 / lint

- TypeScript 严格模式。`@typescript-eslint/no-explicit-any` 是 **warn**
  （用于 `globalThis.initApp` 挂载、`__FUICK_BUNDLE__` 指纹等），不是 error；
  `npm run lint` 当前 0 error。
- `react-hooks/rules-of-hooks` 是 **error**。`eslint.config.js` 忽略
  `dist/`、`node_modules/`、`esbuild.js`、`debug_server.js`。
- esbuild 会把 bundle 中所有中文转义为 `\uXXXX`；搜索请用源码文本，
  不要用构建产物。

## 与 demo 的发布关系

`npm run bundle:pack:copy` 是**发布到 demo 的标准流程**（与命令节一致）：把
fly 的 `dist/bundle.js` + `js/assets/` 签名打包成 zip，并**覆盖**
`fuickjs_demo/app/assets/js/game.zip`，同时更新 `bundles.json` 中 `game`
条目的 sha256（保留其余包）。demo 的 `game` 因此由 fly 的产物决定。

- JS 改动在 demo 里生效的唯一途径是**重新 `flutter run`**（demo 不支持
  热重载，assets 在 Flutter 构建期烘焙）。
- 若日后需要完全独立、不随 fly 变动的完整版引擎，可保留一套 demo 自己的
  源码（如 `fuickjs_demo/js/src` 的 `game-entry.tsx`、`game/` 等），走 demo
  链路发布：`cd fuickjs_demo/js && npm run build:game
  && npm run bundle:pack:all`，再重新 `flutter run`。

### fly 自己的打包命令

```
npm run build                 # 生成 dist/bundle.js
npm run bundle:pack           # 打包成 dist/game-<version>.zip（不含拷贝）
npm run bundle:pack:copy      # 发布到 demo：同上打包并覆盖 app/assets/js/game.zip + 更新 bundles.json
```

- 打包/拷贝需 demo 签名密钥（`fuickjs_demo/js/tools/bundle/bundle_signing_key.pem`，
  缺则先 `cd fuickjs_demo/js && npm run bundle:keys`）。
- zip 内已含 `js/assets/`（图片/音频随 zip 下发；新加资源复制进
  `fly/js/assets/` 后无需额外操作）。

## OpenSpec 工作流

`fly/openspec` 使用 spec 驱动工作流（命令/skill 在 `.opencode/` 下，
`opsx-*` 系列）。`openspec/config.yaml` 规定 **所有产物均用中文**（保留结构
标题与 SHALL/MUST 英文关键字）。

当前 `openspec/changes/` 下有 4 个未归档变更（`openspec/specs/` 暂为空，
尚未 archive 过任何产物）：

| 变更 | 状态 |
|---|---|
| `cosmic-evolution-game` | tasks 基本完成（主玩法） |
| `cosmic-big-bang-ending` | tasks 已完成勾选 |
| `blind-zone-matter-spawn` | 代码已落地（盲区生成/稀疏场），tasks 未勾选 |
| `free-camera-movement` | 自由移动已落地（ WORLD_RADIUS 圆形夹取），tasks 未勾选 |

使用 `openspec-*` skill 做 propose/apply/archive；处于 "update" 模式时
不要修改业务代码。
