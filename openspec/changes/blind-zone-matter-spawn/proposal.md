## Why

当前引擎在每次吞噬 / 回收天体后，会用 `while (entities.length < TARGET_ENTITIES) spawnEntity()` **立即在玩家屏幕边缘重生**一颗同级天体，导致「吃掉的物质原地立刻复活」，玩家只需原地不动即可持续进食、缺乏探索与等待的节奏；且新天体全部出现在可视区内，没有「从场外孕育而来」的感知。

## What Changes

- 移除吞噬 / 回收后即时补位循环：被吃掉或被回收的天体 SHALL NOT 立刻重生。
- **零陨石开局**：新游戏开始时场上没有任何自由天体，玩家完全独自；首颗陨石在开局 1 秒后才于盲区（屏幕外）生成，此后逐步补充，玩家必须主动寻找。
- **稀疏陨石**：同屏自由天体目标为 12 颗（少于现状 18），按固定间隔（默认每秒 1 颗）在盲区生成陨石 / 星球，吞噬后不会快速补满，驱动玩家主动探索寻找。
- 盲区天体生成后向玩家方向漂移，自然从屏幕边缘进入视野，提供「场外孕育 → 入屏」的生成体验。
- 进化链保底（下一等级天体）保留。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `cosmic-evolution/game-core`: 修改「维持同屏数量」的生成机制要求——从「吞噬/回收后即时补位」改为「按秒在盲区生成」，并新增「零陨石开局 / 稀疏陨石 / 须探索寻找」的生成形态。

## Impact

- `fly/js/src/game/engine.ts`：`step()` 中移除即时补位循环，新增按秒盲区生成逻辑；`spawnEntity` 增加「盲区生成」放置形态；`createGame` 不再铺设初始天体（零陨石开局）。
- `fly/js/src/game/config.ts`：新增盲区定义（`BLIND_ZONE_MIN/MAX`）与生成间隔（`SPAWN_INTERVAL`），同屏目标调低为稀疏值（12，少于现状 18）。
- `fly/js/src/store/game.ts`：`GameState` 新增生成计时字段。
- 不修改 `fuickjs_framework`，不涉及 demo。