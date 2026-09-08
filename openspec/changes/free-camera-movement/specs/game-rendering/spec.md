## MODIFIED Requirements

### Requirement: 游戏实体渲染
系统 SHALL 根据世界坐标渲染所有游戏实体，玩家行星直接在世界坐标渲染，其他实体同样直接使用世界坐标。

#### Scenario: 玩家行星渲染
- **WHEN** 游戏需要渲染玩家行星
- **THEN** 行星 SHALL 在世界坐标 (player.x, player.y) 处渲染
- **AND** 不再应用相机偏移

#### Scenario: 其他实体渲染
- **WHEN** 游戏需要渲染自由天体或卫星
- **THEN** 实体 SHALL 在其世界坐标处渲染
- **AND** 不再应用相机偏移

#### Scenario: 卫星轨道渲染
- **WHEN** 玩家拥有环绕卫星
- **THEN** 卫星位置 SHALL 基于玩家世界坐标计算
- **AND** 轨道半径和角度保持不变