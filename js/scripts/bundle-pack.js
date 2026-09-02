#!/usr/bin/env node
/**
 * fly 项目打包：将 dist/bundle.js + assets/ 打包为签名 zip，
 * 并复制到 fuickjs_demo/app/assets/js/game.zip。
 *
 *   node scripts/bundle-pack.js [--version 1.0.0] [--copy]
 *
 * 打包本身委托给 demo 的标准打包命令 pack-bundle.js（与 pack-all.js 一致），
 * 保证 manifest 结构、assets 收录与签名逻辑和 demo 其它 bundle 完全相同。
 *
 * 不带 --copy 时只生成 fly/dist/game-<version>.zip；
 * 带 --copy 时额外复制到 demo 工程并重新生成 bundles.json。
 */
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { execFileSync } = require("node:child_process");

/* ── 路径 ─────────────────────────────────────────────────────────── */
const FLY_JS = path.resolve(__dirname, "..");
const FLY_DIST = path.join(FLY_JS, "dist");
const FLY_ASSETS = path.join(FLY_JS, "assets");
const DEMO_ROOT = path.resolve(FLY_JS, "..", "..", "fuickjs_demo");
const DEMO_JS = path.join(DEMO_ROOT, "js");
const DEMO_APP_JS = path.join(DEMO_ROOT, "app", "assets", "js");
const DEMO_KEY = path.join(
  DEMO_JS,
  "tools",
  "bundle",
  "bundle_signing_key.pem",
);
const PACK_BUNDLE = path.join(DEMO_JS, "tools", "bundle", "pack-bundle.js");

const BUNDLE_NAME = "game"; // 与 pack-all.js BUNDLES 数组对齐
const DEFAULT_VERSION = "1.0.0";

/* ── 工具函数 ─────────────────────────────────────────────────────── */
function sha256File(file) {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(file))
    .digest("hex");
}

function parseArgs() {
  const args = { version: DEFAULT_VERSION, copy: false };
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a === "--version") args.version = process.argv[++i];
    else if (a === "--copy") args.copy = true;
  }
  return args;
}

/* ── 主流程 ───────────────────────────────────────────────────────── */
function main() {
  const { version, copy } = parseArgs();
  const bundleJs = path.join(FLY_DIST, "bundle.js");
  if (!fs.existsSync(bundleJs)) {
    console.error("找不到 dist/bundle.js，请先 npm run build");
    process.exit(1);
  }
  if (!fs.existsSync(DEMO_KEY)) {
    console.error(
      "找不到签名密钥:",
      DEMO_KEY,
      "（请先 cd fuickjs_demo/js && npm run bundle:keys）",
    );
    process.exit(1);
  }
  if (!fs.existsSync(PACK_BUNDLE)) {
    console.error("找不到 demo 打包命令 pack-bundle.js:", PACK_BUNDLE);
    process.exit(1);
  }

  const tmpOut = fs.mkdtempSync(path.join(os.tmpdir(), "fly-pack-"));

  // 1. 调用 demo 标准打包命令，打包 dist/bundle.js + assets → zip
  const packArgs = [
    PACK_BUNDLE,
    "--name",
    BUNDLE_NAME,
    "--version",
    version,
    "--key",
    DEMO_KEY,
    "--keyId",
    "demo-key",
    "--minAppVersion",
    "1.0.0",
    "--js",
    bundleJs,
    "--out",
    tmpOut,
  ];
  if (fs.existsSync(FLY_ASSETS)) {
    packArgs.push("--assets", FLY_ASSETS);
  }
  execFileSync(process.execPath, packArgs, { stdio: "inherit" });

  // 2. 将 zip 落到 fly/dist
  const zipName = `${BUNDLE_NAME}-${version}.zip`;
  const zipTmp = path.join(tmpOut, zipName);
  fs.mkdirSync(FLY_DIST, { recursive: true });
  const zipPath = path.join(FLY_DIST, zipName);
  fs.copyFileSync(zipTmp, zipPath);
  const zipSha256 = sha256File(zipPath);
  console.log(`结果: ${zipPath}`);
  console.log(`  version   : ${version}`);
  console.log(`  sha256    : ${zipSha256}`);

  // 3. 复制到 demo 工程并更新 bundles.json
  if (copy) {
    const demoZip = path.join(DEMO_APP_JS, `${BUNDLE_NAME}.zip`);
    fs.copyFileSync(zipPath, demoZip);
    console.log(`已复制到  : ${demoZip}`);

    const bundlesJsonPath = path.join(DEMO_APP_JS, "bundles.json");
    let existing = { packages: [] };
    if (fs.existsSync(bundlesJsonPath)) {
      try {
        existing = JSON.parse(fs.readFileSync(bundlesJsonPath, "utf8"));
      } catch {
        /* ignore */
      }
    }
    const entry = {
      name: BUNDLE_NAME,
      version,
      sha256: zipSha256,
      minAppVersion: "1.0.0",
      label: "宇宙进化",
      initialRoute: "/",
    };
    const idx = (existing.packages || []).findIndex(
      (p) => p.name === BUNDLE_NAME,
    );
    if (idx >= 0) existing.packages[idx] = entry;
    else existing.packages.push(entry);
    fs.writeFileSync(
      bundlesJsonPath,
      JSON.stringify(existing, null, 2) + "\n",
    );
    console.log(`已更新 bundles.json`);
  }

  fs.rmSync(tmpOut, { recursive: true, force: true });
}

main();