import React from "react";
import { Router, Runtime } from "fuickjs";
import HomePage from "./pages/home";

export function initApp() {
  try {
    // 绑定引擎侧渲染入口（globalThis.fuickjs.render/...）并配置运行时。
    // 缺了 bindGlobals 时 Flutter 无法调用 render 发起页面渲染，会整页空白且无报错。
    Runtime.configure({ prewarm: false, prewarmMs: 50 });
    Runtime.bindGlobals();

    // 注册根路由
    Router.register("/", () => React.createElement(HomePage));

    console.log("Fly App Initialized");
  } catch (e) {
    console.error("initApp error:", e);
  }
}
