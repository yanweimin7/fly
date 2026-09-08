## 1. 配置与状态模型

- [ ] 1.1 `js/src/game/config.ts`：新增 `SPAWN_INTERVAL`（默认 1 秒）与盲区环带 `BLIND_ZONE_MIN`（380）/ `BLIND_ZONE_MAX`（= `DESPAWN_DIST`）；`TARGET_ENTITIES` 下调为稀疏值 12，`npm run build` 通过。
- [ ] 1.2 `js/src/store/game.ts` 的 `GameState` 新增 `nextSpawnAt: number`（绝对游戏时间，秒）并补全类型注释，`npm run build` 通过。

## 2. 生成逻辑改造

- [ ] 2.1 `js/src/game/engine.ts` 的 `spawnEntity` 增加 `placement: 'near' | 'blind'`（默认 `near`）参数：`blind` 时距离取 `rand(BLIND_ZONE_MIN, BLIND_ZONE_MAX)`、初速度方向指向玩家（速率沿用 `rand(8,20)`），等级分布 / 大天体限速 / matterValue 折算逻辑不变；`createGame` **零陨石开局**（`entities = []`，移除初始铺场循环，`nextSpawnAt = SPAWN_INTERVAL`），`npm run build` 通过。
- [ ] 2.2 `step()` 移除即时补位循环 `while (state.entities.length < TARGET_ENTITIES) spawnEntity(state)`，改为时间闸门：`state.time >= state.nextSpawnAt` 且数量低于 `TARGET_ENTITIES` 时 `spawnEntity(state, 'blind')`，随后 `nextSpawnAt += SPAWN_INTERVAL`，`npm run build` 通过。
- [ ] 2.3 确认吞噬 / 回收移除逻辑保持不变（`filter!removed` 与 `DESPAWN_DIST` 回收仍只减不补），`npm run build` 通过。

## 3. 验证

- [ ] 3.1 `npm run lint` 与 `npm run build` 均通过。
- [ ] 3.2 运行验证（`npm run start` + WebSocket 热重载或 `fuickjs_demo` `flutter run`）：开局自由天体数为 0、玩家完全独自；首颗陨石约 1 秒后从屏幕外出现；被吞噬的天体不再当帧在玩家近旁复活，仅每秒经盲区补 1 颗；同屏自由天体数不超过 12、不会快速补满，玩家需移动探索寻找。