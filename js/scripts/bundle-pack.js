#!/usr/bin/env node
/**
 * fly 项目打包：将 dist/bundle.js + assets/ 签名打包为 zip，
 * 并复制到 fuickjs_demo/app/assets/js/game.zip。
 *
 *   node scripts/bundle-pack.js [--version 1.0.0] [--copy]
 *
 * 不带 --copy 时只生成 fly/dist/game-<version>.zip；
 * 带 --copy 时额外复制到 demo 工程并重新生成 bundles.json。
 */
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const os = require("node:os");

/* ── 路径 ─────────────────────────────────────────────────────────── */
const FLY_JS = path.resolve(__dirname, "..");
const FLY_DIST = path.join(FLY_JS, "dist");
const FLY_ASSETS = path.join(FLY_JS, "assets");
const DEMO_ROOT = path.resolve(FLY_JS, "..", "..", "fuickjs_demo");
const DEMO_APP_JS = path.join(DEMO_ROOT, "app", "assets", "js");
const DEMO_KEY = path.join(
  DEMO_ROOT,
  "js",
  "tools",
  "bundle",
  "bundle_signing_key.pem",
);

const BUNDLE_NAME = "game"; // 与 pack-all.js BUNDLES 数组对齐
const DEFAULT_VERSION = "1.0.0";

/* ── 工具函数 ─────────────────────────────────────────────────────── */
function sha256File(file) {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(file))
    .digest("hex");
}

function copyDirSync(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dest, e.name);
    if (e.isDirectory()) copyDirSync(s, d);
    else if (e.isFile()) fs.copyFileSync(s, d);
  }
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
    console.error("找不到签名密钥:", DEMO_KEY);
    process.exit(1);
  }

  const staging = fs.mkdtempSync(path.join(os.tmpdir(), "fly-pack-"));
  try {
    // 1. 复制代码（zip 内统一为 bundle.js）
    fs.copyFileSync(bundleJs, path.join(staging, "bundle.js"));

    // 2. 复制资源（assets/ → zip 内 assets/）
    if (fs.existsSync(FLY_ASSETS)) {
      copyDirSync(FLY_ASSETS, path.join(staging, "assets"));
    }

    // 3. manifest（只声明代码）
    const manifest = {
      name: BUNDLE_NAME,
      version,
      keyId: "demo-key",
      minAppVersion: "1.0.0",
      entry: "bundle.js",
      codeForm: "js",
      files: [
        {
          path: "bundle.js",
          sha256: sha256File(path.join(staging, "bundle.js")),
        },
      ],
    };
    const manifestStr = JSON.stringify(manifest, null, 2);
    fs.writeFileSync(path.join(staging, "manifest.json"), manifestStr);

    // 4. 签名
    const privPem = fs.readFileSync(path.resolve(DEMO_KEY), "utf8");
    const privateKey = crypto.createPrivateKey(privPem);
    const sig = crypto.sign(null, Buffer.from(manifestStr), privateKey);
    fs.writeFileSync(
      path.join(staging, "manifest.sig"),
      sig.toString("base64"),
    );

    // 5. 打 zip
    const zipName = `${BUNDLE_NAME}-${version}.zip`;
    const zipPath = path.join(FLY_DIST, zipName);
    if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
    execFileSync("zip", ["-r", "-X", "-q", zipPath, ".", "-x", "*.DS_Store"], {
      cwd: staging,
    });

    const zipSha256 = sha256File(zipPath);
    console.log(`打包完成: ${zipPath}`);
    console.log(`  version   : ${version}`);
    console.log(`  codeForm  : js`);
    console.log(`  sha256    : ${zipSha256}`);

    // 6. 复制到 demo 工程
    if (copy) {
      const demoZip = path.join(DEMO_APP_JS, `${BUNDLE_NAME}.zip`);
      fs.copyFileSync(zipPath, demoZip);
      console.log(`已复制到  : ${demoZip}`);

      // 更新 bundles.json（只更新 game 条目，保留其余）
      const bundlesJsonPath = path.join(DEMO_APP_JS, "bundles.json");
      let existing = { packages: [] };
      if (fs.existsSync(bundlesJsonPath)) {
        try {
          existing = JSON.parse(fs.readFileSync(bundlesJsonPath, "utf8"));
        } catch {
          /* ignore */
        }
      }
      const idx = (existing.packages || []).findIndex(
        (p) => p.name === BUNDLE_NAME,
      );
      const entry = {
        name: BUNDLE_NAME,
        version,
        sha256: zipSha256,
        minAppVersion: "1.0.0",
        label: "宇宙进化",
        initialRoute: "/",
      };
      if (idx >= 0) existing.packages[idx] = entry;
      else existing.packages.push(entry);
      fs.writeFileSync(
        bundlesJsonPath,
        JSON.stringify(existing, null, 2) + "\n",
      );
      console.log(`已更新 bundles.json`);
    }
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

main();
