const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const watch = process.argv.includes("--watch");

// 注意：这里不生成 bundle.qjc。
// 字节码由运行时的 BundleCompiler（lib/core/engine/bundle_compiler.dart）
// 经 FFI qjs_compile_to_bytecode_out 在设备上首次加载时生成并落盘——编译器就在
// libquickjs_ffi.dylib 内，与引擎同版本，结构上不可能出现 BC_VERSION 漂移。
// 构建期用外部 qjsc 生成则要求它与引擎严格同版本，一旦失配就是
// "invalid version (NN expected=MM)"，且加载失败等于页面永远打不开。
// 代价是首屏走一次源码解析，之后命中本地 .qjc 缓存。

// 可选：通过环境变量 FLY_OUTPUT_DIR 指定额外拷贝目录（如某个 Flutter 工程的 assets/js）
const EXTRA_OUTPUT_DIR = process.env.FLY_OUTPUT_DIR
  ? path.resolve(process.env.FLY_OUTPUT_DIR)
  : null;

async function build() {
  const isProd = !watch;
  // React 19 dropped the .min suffix from cjs filenames
  const reactPath = isProd
    ? "node_modules/react/cjs/react.production.js"
    : "node_modules/react/cjs/react.development.js";
  const reconcilerPath = isProd
    ? "node_modules/react-reconciler/cjs/react-reconciler.production.js"
    : "node_modules/react-reconciler/cjs/react-reconciler.development.js";
  const schedulerPath = isProd
    ? "node_modules/scheduler/cjs/scheduler.production.js"
    : "node_modules/scheduler/cjs/scheduler.development.js";

  const commonOptions = {
    bundle: true,
    platform: "neutral",
    format: "esm",
    target: "es2020",
    minify: false,
    sourcemap: !isProd || process.env.SOURCEMAP === "true",
    loader: {
      ".ts": "ts",
      ".tsx": "tsx",
    },
    mainFields: ["module", "main"],
    define: {
      "process.env.NODE_ENV": isProd ? '"production"' : '"development"',
      global: "globalThis",
    },
    banner: {
      js: `var process=process||{env:{NODE_ENV:\"${isProd ? "production" : "development"}\"}};if(typeof console===\"undefined\"){globalThis.console={log:function(){if(typeof print==='function')print([].slice.call(arguments).join(' '));},error:function(){if(typeof print==='function')print('[ERROR] '+[].slice.call(arguments).join(' '));},warn:function(){if(typeof print==='function')print('[WARN] '+[].slice.call(arguments).join(' '));},debug:function(){if(typeof print==='function')print('[DEBUG] '+[].slice.call(arguments).join(' '));}};}`,
    },
  };

  console.log("Building bundle...");

  const buildOptions = {
    ...commonOptions,
    entryPoints: ["src/index.ts"],
    outfile: "dist/bundle.js",
    alias: {
      react: path.resolve(__dirname, reactPath),
      "react-reconciler": path.resolve(__dirname, reconcilerPath),
      scheduler: path.resolve(__dirname, schedulerPath),
      fuickjs: path.resolve(
        __dirname,
        "../../fuickjs_framework/fuickjs/dist/index.js",
      ),
      "@fuickjs-community/video_player": path.resolve(
        __dirname,
        "../../fuickjs_community/video_player/dist/index.js",
      ),
    },
  };

  if (watch) {
    const ctx = await esbuild.context(buildOptions);
    await ctx.watch();
    console.log("Watching...");
    return;
  }

  await esbuild.build(buildOptions);
  console.log("Built dist/bundle.js");

  if (EXTRA_OUTPUT_DIR) {
    if (!fs.existsSync(EXTRA_OUTPUT_DIR)) {
      fs.mkdirSync(EXTRA_OUTPUT_DIR, { recursive: true });
    }
    fs.copyFileSync(
      path.resolve(__dirname, "dist/bundle.js"),
      path.join(EXTRA_OUTPUT_DIR, "bundle.js"),
    );
    console.log(`Copied bundle to ${EXTRA_OUTPUT_DIR}`);
  }

  // 清掉历史构建留下的 .qjc：现在字节码由运行时生成，构建产物里带上旧的
  // 只会让加载方先撞一次 BC_VERSION 不匹配再被隔离成 .stale。
  const destBin = path.resolve(__dirname, "dist/bundle.qjc");
  if (fs.existsSync(destBin)) {
    fs.unlinkSync(destBin);
    console.log(`Removed stale bytecode ${destBin}`);
  }

  console.log("Build complete.");
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
