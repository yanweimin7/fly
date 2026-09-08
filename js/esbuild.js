const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const watch = process.argv.includes("--watch");

// qjsc 编译器路径（可选，不存在时跳过字节码编译）
const QJSC_PATH = path.resolve(
  __dirname,
  "../../fuickjs_engine/src/main/jni/quickjs/build_macos/qjsc",
);

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

  const src = path.resolve(__dirname, "dist/bundle.js");
  const destBin = path.resolve(__dirname, "dist/bundle.qjc");

  if (fs.existsSync(QJSC_PATH)) {
    console.log("Compiling bundle to QuickJS bytecode...");
    execSync(`${QJSC_PATH} -b -o ${destBin} ${src}`);
    console.log(`Compiled to ${destBin}`);
  }

  console.log("Build complete.");
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
