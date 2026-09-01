import React from "react";
import { Router } from "fuickjs";
import HomePage from "./pages/home";

export function initApp() {
  try {
    // 注册根路由
    Router.register("/", () => React.createElement(HomePage));

    console.log("Fly App Initialized");
  } catch (e) {
    console.error("initApp error:", e);
  }
}
