## Purpose

定义星空的渲染方式：以 fuickjs 的 Stack/Positioned 布局逐帧呈现玩家、自由天体与被捕获的环绕卫星，并随玩家进化改变视觉表现，性能可控。

## ADDED Requirements

### Requirement: 星空 Stack 布局
系统 SHALL 使用 Stack 容器作为游戏场地，所有实体以 Positioned（基于中心点偏移）绝对定位渲染；实体尺寸按 radius 缩放，玩家默认居中、世界随玩家滚动（相机跟随）。

#### Scenario: 玩家居中相机跟随
- **WHEN** 玩家在世界中移动
- **THEN** 玩家节点始终位于屏幕中心，自由天体按相对玩家的世界坐标偏移渲染

#### Scenario: 实体按半径缩放
- **WHEN** 两个实体 radius 不同
- **THEN** 渲染尺寸与该半径成正比

### Requirement: 环绕卫星轨道动画
系统 SHALL 将被捕获的环绕卫星渲染为围绕玩家做圆周运动的节点，每帧依据其轨道角度更新 Positioned 坐标，呈现环绕效果。

#### Scenario: 卫星绕玩家旋转
- **WHEN** 玩家拥有一颗环绕卫星
- **THEN** 该卫星每帧沿圆形轨道移动，始终围绕玩家中心

### Requirement: 按等级视觉区分
系统 SHALL 依据实体 tier 使用不同颜色 / 形状区分（如陨石为灰石色、恒星为发光黄、黑洞为黑色吸积盘等），玩家与自由天体可被清晰辨认。

#### Scenario: 黑洞视觉可辨
- **WHEN** 玩家进化为黑洞
- **THEN** 玩家节点以黑色 / 吸积盘样式渲染，区别于其它天体

#### Scenario: 微小陨石保留绘制
- **WHEN** 某个陨石(L1) 实体半径 < 阈值
- **THEN** 该实体继续以现有渐变圆方案绘制，不加载图片素材

### Requirement: 离屏裁剪与数量控制
系统 SHALL 仅渲染处于可视范围（含边距）内的实体，对超出范围的实体跳过渲染，以控制单帧 DSL 规模与 Flutter 绘制开销。

#### Scenario: 裁剪不可见实体
- **WHEN** 某自由天体位于可视范围外
- **THEN** 该帧不生成其 Positioned 节点

### Requirement: 逐帧重渲染产出 DSL
系统 SHALL 在游戏循环每帧将当前实体状态转换为 React 树并由 fuickjs Reconciler 产出 JSON DSL 交由 Flutter 绘制。

#### Scenario: 每帧更新布局
- **WHEN** 游戏循环推进一帧
- **THEN** Stack 内实体节点位置 / 集合反映最新状态
