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

## 发布到 demo

要把 fly 的功能正式上线到 demo：把源码拷贝到 `fuickjs_demo/js/src`，
注册路由，然后跑完整 demo 链（`cd fuickjs_demo/js && npm run build &&
npm run bundle:keys && npm run bundle:pack:all`，再 `flutter run` 重新
烘焙资源）。demo **不支持**热重载，资源烘焙发生在 Flutter 构建期。

## OpenSpec 工作流

`fly/openspec` 使用 spec 驱动工作流（命令/skill 在 `.opencode/` 下）。
`openspec/config.yaml` 规定 **所有产物均用中文**（保留结构标题与
SHALL/MUST 英文关键字）。当前活跃变更：`cosmic-evolution-game`（未归档）。
使用 `openspec-*` skill 做 propose/apply/archive；处于 "update" 模式时
不要修改业务代码。
