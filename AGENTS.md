# AGENTS.md

`fly/` 是 `fuickjs` 框架的**独立 JS 开发沙盒**：一个把 React 协调器输出成
JSON DSL、并在 QuickJS 隔离环境中分发给 Flutter 的 Playground。它用于在功能
正式进入 demo（`fuickjs_demo`）之前做迭代。架构与三层 CSS 规则见上级
`../CLAUDE.md`；本文件只保留 fly 特有的坑。

## 目录结构

- 整个应用都位于 `fly/js/` 下，**没有根 `package.json`**——所有命令都从
  `fly/js/` 运行。
- 入口：`js/src/index.ts` → `initApp()`（挂到 `globalThis` 并立即调用）。
  路由通过 `fuickjs` 的 `Router` 注册；`/` 渲染 `HomePage`（再委托给
  cosmic-evolution 的 `GamePage`）。
- `js/dist/` 是构建产物（已 gitignore）。`js/assets/` 是打包静态资源
  （图片），由调试服务器提供。

## 命令（在 `fly/js/` 下运行）

- `npm run build` —— esbuild 把 `src/index.ts` 构建成 `dist/bundle.js`
  （可选附带 `dist/bundle.qjc` 字节码）。
- `npm run dev` —— `esbuild --watch`（不含调试服务器）。
- `npm run start` —— 运行 **`debug_server.js`**：以 `SOURCEMAP=true` 构建，
  然后通过 `ws://localhost:8080` 热重载已连接的 Flutter 客户端。按键：
  `r` 重新构建+重载，`a` 重新同步资源，`q` 退出。
- `npm run lint` / `npm run lint:fix` —— 仅对 `src` 做 ESLint。
- `npm run bundle:pack` —— 把 `dist/bundle.js` + `js/assets/` 签名打包成
  `dist/game-<version>.zip`（不含拷贝）。需要 demo 签名密钥
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
`Runtime.configure`）。缺了它 `globalThis.fuickjs.render/...` 不挂载，
Flutter 无法发起首次页面渲染 → 加载 bundle 成功（打
"Fly App Initialized"）、但整页空白且**没有任何报错**（连 `[Perf] page=...`
渲染日志都没有）。与 demo 主 bundle / 旧 game-entry 对齐即可。

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
- QuickJS 字节码编译（`dist/bundle.qjc`）在
  `fuickjs_engine/.../build_macos/qjsc` 不存在时会**静默跳过**，缺失是
  正常现象，不是错误。
- 环境变量 `FLY_OUTPUT_DIR=<dir>` 会让 `build` 把 `bundle.js` 额外拷贝到
  指定目录（例如某个 Flutter 工程的 `assets/js`）。在另一个 app 上迭代时
  用它代替手动拷贝。

## 风格 / lint

- TypeScript 严格模式。`@typescript-eslint/no-explicit-any` 是 **warn**
  （用于 `globalThis.initApp` 挂载），不是 error。
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
- zip 内已含 `js/assets/`（图片随 zip 下发；新加图片复制进
  `fly/js/assets/images/` 后无需额外操作）。
- JS 改动在 demo 里生效的唯一途径是重新 `flutter run`（demo 不支持热重载，
  assets 在 Flutter 构建期烘焙）。fly 侧调试用 `npm run start` + WebSocket
  热重载。

## OpenSpec 工作流

`fly/openspec` 使用 spec 驱动工作流（命令/skill 在 `.opencode/` 下）。
`openspec/config.yaml` 规定 **所有产物均用中文**（保留结构标题与
SHALL/MUST 英文关键字）。当前活跃变更：`cosmic-evolution-game`（未归档）。
使用 `openspec-*` skill 做 propose/apply/archive；处于 "update" 模式时
不要修改业务代码。
