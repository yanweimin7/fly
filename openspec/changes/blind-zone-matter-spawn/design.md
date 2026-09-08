# 盲区定时生成：设计

## Context

动机见 `proposal.md`，需求见 `specs/cosmic-evolution/game-core/spec.md`。当前实现：`step()` 每帧在物理结算后执行 `while (entities.length < TARGET_ENTITIES) spawnEntity(state)`（engine.ts:312-315），把被吞噬 / 回收的天体当帧在玩家屏幕边缘（间隙 24~70px）补回，即「吃掉立刻复活」。

几何前提：相机以玩家居中，视口 360×640（CENTER=180,320），屏幕最远可见半径 = hypot(180,320) ≈ 367px；`DESPAWN_DIST=430` 是回收半径。因此**盲区** = 半径 [380, 430] 的环形区域——任意角度都在屏幕外、又不越回收线。

## Goals / Non-Goals

- 目标：吞噬 / 回收的天体不再当帧复活；玩家**独自开局**、初始天体铺设在屏幕外；改为每秒在盲区生成 1 颗陨石或星球并让它向内漂移入屏；同屏数量维持**稀疏**目标（12 颗，少于现状 18），驱动玩家移动探索寻找。
- 非目标：不改进化链保底（`forceSpawnNext`，仍就近生成下一等级引导天体）；不动框架层。

## Decisions

### D1：以 GameState 内生成计时器驱动，而非关卡/事件
`GameState` 新增 `nextSpawnAt`（绝对游戏时间秒）。`step()` 中按间隔生成 1 颗（受上限约束）：
```
if (state.time >= state.nextSpawnAt) {
  if (state.entities.length < TARGET_ENTITIES) {
    spawnEntity(state, 'blind');
  }
  state.nextSpawnAt = state.time + SPAWN_INTERVAL;
}
```
- **稀疏参数**：`TARGET_ENTITIES` 由 18 下调为 12（视口 360×640 下画面空旷，须探索寻找）；`SPAWN_INTERVAL = 1s`、每间隔 1 颗；`createGame` 初始 `nextSpawnAt = SPAWN_INTERVAL` 实现**零陨石开局**（首颗 1 秒后才在盲区出现），吞噬后不会当帧补满，制造「饥饿→寻猎」节奏。
- 备选：帧计数 `%` 取模。缺点是把帧率耦合进逻辑；绝对时间对 tickRate 配置无关。
- 备选：与吞噬事件关联（吃掉后 1s 在盲区补 1 颗）。破坏「数量由时间统一补充」的简单模型，故不用。

### D2：`spawnEntity` 增加放置形态参数 `placement: 'near' | 'blind'`
保留现有等级分布（small/mid/big + 大天体限速）与 `matterValue` 折算，仅替换「距离 + 初速度」：
- `near`（现状）：`d = p.radius + r + rand(SPAWN_GAP_MIN, SPAWN_GAP_MAX)`，随机方向漂移。
- `blind`（新增）：`d = rand(BLIND_ZONE_MIN, BLIND_ZONE_MAX)`（=380..430），初速度方向**指向玩家**、速率 `rand(8,20)`。
- 备选：单独写 `spawnInBlindZone()` 复制等级分布逻辑。重复代码且后续要同步演进，故合并。

### D3：盲区环带取 [380, 430] 而非「按角度计算屏幕边缘距离」
- 备选：按生成角度精确计算该方向屏幕边缘距离，紧贴边缘生成。更精准但引入三角函数与视口几何耦合，且「紧贴边缘」视觉上反而无层次。
- 统一环带实现简单、全部离屏；配合内向速度保证 1~2s 内入屏。`BLIND_ZONE_MIN` 用常量而非 `DESPAWN_DIST` 的比例，避免依赖魔法系数。

### D4：零陨石开局，进化链保底保留
- `createGame` 不再铺设任何初始天体（`entities = []`）；`nextSpawnAt` 初始化为 `SPAWN_INTERVAL`，使首颗陨石在开局 1 秒后才于盲区出现，玩家独自进入空荡世界，随后逐颗补充至 `TARGET_ENTITIES`(12)。
- `forceSpawnNext` 保持就近生成：它是「保证可进化」的引导目标，属另一条规则；不因本变更而改为盲区生成（见 Trade-offs / Open Questions）。

## Risks / Trade-offs

- 【风险】开局零陨石 + 慢补充（1 颗/秒）下，前十几秒场上会明显空旷、玩家可能「挨饿」→ 缓解：`SPAWN_INTERVAL` 为配置项可调（如 0.5s）；内向漂移保证天体最终会入屏抵达，实际可吞噬存量随稳态（~12 颗）恢复。
- 【风险】开局全部铺设在外，若玩家朝一个方向猛冲可能长时间不见陨石 → 缓解：盲区环带包围玩家四周，内向漂移 + 环形分布任何方向前进都会遇到；真遇极端可调 `BLIND_ZONE_MIN` 收紧。
- 【风险】盲区生成的天体被限速判定为 big 后降级为 small，长期偏「小」→ 与现状一致的既有平衡逻辑，不引入新偏差；后续平衡可在 `BIG_PER_MINUTE` 上调。
- 【风险】`forceSpawnNext` 仍即时就近生成下一等级，与「不即时复活」的直觉存在局部不一致 → 属刻意保留的进化引导，可在后续单独变更中一并移入盲区。

## Migration Plan

纯业务层改动，无数据/协议迁移。回滚：恢复 `step()` 中的 `while` 即时补位循环即可，`spawnEntity` 的 `placement` 参数默认保持 `near`，向后兼容。

## Open Questions

- `forceSpawnNext` 是否也应改为盲区生成？不影响本变更的规格与实现（规格只约束「被吃/被回收的天体」），可后续决定。