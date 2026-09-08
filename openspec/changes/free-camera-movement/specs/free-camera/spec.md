## Purpose

实现自由视角系统，允许玩家行星在屏幕上自由移动，提供更直观的操控体验。

## ADDED Requirements

### Requirement: 玩家行星自由移动
系统 SHALL 允许玩家行星根据摇杆输入在屏幕上自由移动，不再固定在屏幕中央。

#### Scenario: 玩家移动摇杆
- **WHEN** 玩家拖动虚拟摇杆
- **THEN** 玩家行星 SHALL 根据摇杆方向和强度在屏幕上移动
- **AND** 行星位置变化 SHALL 直接可见

### Requirement: 玩家位置直接渲染
系统 SHALL 根据玩家的世界坐标直接渲染行星位置，不再使用相机偏移。

#### Scenario: 渲染玩家行星
- **WHEN** 游戏需要渲染玩家行星
- **THEN** 行星 SHALL 在世界坐标 (player.x, player.y) 处渲染
- **AND** 不再应用相机偏移 (ox, oy)

### Requirement: 卫星轨道位置更新
系统 SHALL 根据玩家世界坐标计算卫星轨道位置，保持卫星围绕玩家旋转。

#### Scenario: 卫星轨道渲染
- **WHEN** 玩家拥有环绕卫星
- **THEN** 卫星位置 SHALL 基于玩家世界坐标计算
- **AND** 轨道半径和角度保持不变

### Requirement: 离屏裁剪保留
系统 SHALL 保留离屏裁剪逻辑，避免渲染屏幕外的实体。

#### Scenario: 实体离屏裁剪
- **WHEN** 实体屏幕坐标超出可视区域
- **THEN** 该实体 SHALL 不被渲染
- **AND** 裁剪边距 SHALL 保持不变