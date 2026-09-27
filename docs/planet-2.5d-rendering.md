# 星球 2.5D 球面光照渲染技术方案

> 方案二（球面光照 2.5D）：用 JS 端球面几何数学 + `CustomPaint` 矢量指令，把每颗
> 行星渲染成「真正旋转、带光照」的球，产生真 3D 的观感而不引入 3D 引擎。
> 本文为实施依据；先拿一颗岩石行星做原型，观感通过后推广到全部冷行星。

## 1. 背景与目标

当前 `Planet.tsx` 用「线性/径向渐变 Container + `ClipPath(circle(50%)` + boxShadow」
拼出扁平球感：明暗方向按 `id` 随机（`LIGHTS[id%4]`），表面特征贴在平面圆上，
不自转，且不可遮挡、无镜面高光——"3D 感"弱。

本方案目标：
- 所有**冷行星**（岩石 L0/L1/L3、矮行星 L2、气态行星 L4）渲染成球面光照球体；
- 具备 5 个 3D 信号：**明暗项圈（terminator）**、**镜面高光（glint）**、
  **表面特征的球面透视缩短（foreshortening）**、**行星环深度排序**、**自转动画**；
- 每帧绘制指令控制在几十条/行星，随增量 UPDATE 下发，不拖累上一轮性能优化；
- 渲染层不需要再动框架：渐变 / 裁剪 / 模糊已由框架侧补齐
  （`fuickjs/src/widgets/CustomPaint.tsx` + `custom_paint_parser.dart`）。
  本变更仅改 `fly/js/src` 业务层；框架改动按交付约定单独 commit & push。

发光天体（矮星 L5/L6/L8、恒星、中子星）、黑洞 L9、宇宙 L11 是**光源本身**，
保持现有发光渲染不动。

## 2. 框架能力盘点（已核实）

`fuickjs` 已导出 `CustomPaint` / `CustomPainter` / `Path`
（`fuickjs/src/widgets/CustomPaint.tsx`，经 `widgets/index.ts` 全量导出），
Flutter 侧 `custom_paint_parser.dart` 已注册 `CustomPaint` 解析器，且内部自带
`RepaintBoundary`——正好延续上一轮「每颗天体一层隔离重绘」的方向。

可用的绘制指令（parser 逐条翻译）：

| 指令 | 能力 |
|---|---|
| `save` / `restore` / `translate` / `rotate` / `scale` | 画布状态 |
| `clipRect(rect, {clipOp, doAntiAlias})` / `clipRRect(...)` / `clipPath(path)` | 裁剪（`clipRect` 支持 `difference`，`clipRRect/clipPath` 仅 `intersect`） |
| `drawCircle` / `drawOval` / `drawRect` / `drawRRect` | 几何填充 |
| `drawArc(rect, start, sweep, useCenter)` | 圆弧/扇形（可 stroke） |
| `drawLine` / `drawPath` | 线段与路径 |
| `Path.moveTo/lineTo/quadraticBezierTo/cubicTo/arcTo/addOval/addRRect/close` | 路径构造 |

`Paint` 支持：
- 纯色 `#RRGGBB` / `#RRGGBBAA`（8 位 hex alpha，已确认）、`style: fill/stroke`、
  `strokeWidth`、`strokeCap`、`strokeJoin`、`isAntiAlias`；
- **`gradient`**：线性/径向渐变，格式与 Container decoration 完全一致
  （`type/colors/stops/begin/end`），额外支持 `rect` 指定作用矩形；
- **`blur`/`blurStyle`**：高斯模糊 sigma（`MaskFilter.blur`），用于柔和高光/阴影。

`CustomPainter` 是命令缓冲对象：`commands[]` + `repaint(builder?)` 按键重绘
（`onRepaint` → 仅该 `CustomPaint` 组件 forceUpdate），是「随增量 UPDATE 下发」的关键。

## 3. 坐标与光照模型

### 3.1 球体参数化（行星局部系，未倾斜）

每颗行星一个单位球，采用**纬经度**参数：
```
N(φ, μ) = (cosφ·cosμ,  sinφ,  cosφ·sinμ)      // φ 纬度 [-π/2,π/2]，μ 经度
```
- φ=+π/2 为北极，φ=0 为赤道；
- **自转 = 纹理经度偏移**：μ = μ0 + ω·t（μ0 按 id 播种，ω 按类型/半径取值）。

### 3.2 轴倾角（静止，按 id 播种）

绕屏幕 x 轴倾斜 τ（0.15~0.6 rad，每颗行星不同）：
```
X' = X
Y' = Y·cosτ − Z·sinτ
Z' = Y·sinτ + Z·cosτ              // Z' 朝观察者，Z' > 0 可见
```

### 3.3 屏幕投影

数学系 y 向上；DSL 坐标系 y 向下。中心 C = d/2，输出：
```
drawX = C + R·X'
drawY = C − R·Y'
depth = Z'                         // > 0 才可见/绘制
```

### 3.4 光源（场景级固定，取代 LIGHTS[id%4]）

现有代码每颗星球随机光源方向 → 场景光照互相矛盾。改为**全场景单一光源**
（常量向量，观察者系，y 向上），并旋转到每颗行星的倾斜系：
```
L_frame = Rotate(−τ)·L_view           // 倾斜系下的单位光向量
```
逐点亮度 `Λ = max(0, N·L_frame)`。

**关键推论：** 倾斜系是静止的 → **明暗项圈/阴影形状对每颗行星是常量**（只随 id
播种的 τ 变化，可预计算缓存）；**自转只让表面纹理（云带/坑/高光点）绕固定明暗
边界转动**——这就是"旋转的 3D 球"最强信号来源。

## 4. 明暗项圈：夜半球帽（terminator cap）

`N·L = c`（c∈[0,1]）平面族切割球面，c=0 即晨昏线。交线是位于平面 `⊥L`、
圆心 `c·L`、半径 `√(1−c²)` 的圆。构造正交基 `{u, v}` ⊥ L：
```
u = normalize(L × ẑ)          （L ∥ ẑ 时退化为 x̂）
v = L × u
P(α) = c·L + √(1−c²)·(u·cosα + v·sinα)
```
对 α 采样（24 点），投影出屏幕坐标，保留 `Z'>0` 的前半球弧段，**闭合成夜侧帽**：

```
Path p
p.moveTo(A)                 // 晨昏线前端弧的起点（Z'=0 穿越点）
p.arcTo(diskRect, angleA, sweepNight, false)   // 沿轮廓线走头段到 B
… 用 quadraticBezierTo 沿晨昏线采样点 从 B 反走回 A …
p.close()
fillPaint = '#00000055~AA'
```

边界情形：
- 交线投影无前半球点（光在正后方）→ 整盘涂夜色，可再叠一条朝光轮廓的细亮边；
- 晨昏线整体在盘外（光在正前方）→ 夜侧帽为空，跳过。

## 5. 夜帽渐变填充（Lambert 光感）

`Paint` 现已支持 `gradient` + `blur`，不再需要「多层条带」堆叠。夜帽路径做好后：

- **夜帽填充**：给 cap 填**线性渐变**——从「夜侧轮廓」的深色向「晨昏线」透明，
  用 `gradient.rect` 指向整盘（坐标相对画布原点），`begin/end` 用
  `bottomRight`→`topLeft` 之类的 Alignment。渐变用**非线性停靠**
  （`dark→dark×0.5→透明`，stops `[0,0.5,1]`）让明暗在晨昏线前更早收敛，避免
  沿曲线边界的残留 alpha 造成生硬接缝；再叠加小 sigma `blur`（`nightCap.blur`，
  默认开）羽化这条边界——生硬的晨昏线主要就靠它消掉。
- **受光轮廓高光**：`drawArc`（stroke 细白）沿朝光方向的轮廓线，配小 sigma `blur`，
  是球体「鼓」起来的强信号；
- **暗部轮廓压暗**：`drawArc`（stroke 细黑）沿对侧轮廓线。

（backup 到框架此前无渐变时的做法：4 层递减 alpha 夜帽叠出阶梯渐变——现已被
渐变填充取代，不再需要。）

## 6. 镜面高光（glint）：随自转移动、越过晨昏线消失

严格物理上，均匀朗伯球的镜面高光点位置固定（不再随自转变化），但按需求做**风格化**
版本：把高光绑在**表面一个固定经纬度光斑**上，随自转绕球移动——这是自转动感最强、
也最"像球在转"的信号：

```
光斑：纬度 φg（≈0 赤道）、经度 μg = μg0 + ω·t        // μg0 播种为朝光一侧
每帧：
  n = 倾斜旋转后的表面法线
  投影 drawX/drawY；depth = Z'
  lit = n·L_view
  若 depth ≤ 0 或 lit ≤ 0.12   → 高光消失（"转动到对侧"）
  否则 画 blur 径向渐变圆斑：
      drawCircle(glintPos, R·0.14, { gradient: { type:'radial',
          colors:[white@αg, transparent], stops:[0,1] }, blur: R·0.07 })
      αg ≈ 0.85·smoothstep(0.12, 0.5, lit)
```

blur + 径向渐变让高光呈柔和高亮光斑，观感远好于压缩椭圆。

## 7. 表面特征的球面透视缩短（行星"鼓起来"）

特征定义在球坐标（纬度 φ、经度 μ0、角半径 δ），随 ω·t 连同自转；逐帧投影。

先用 `clipPath(disk)` 把**球体图层**约束在轮廓圆内（绘制顺序见 §9），
任何特征/阴影都不会泄出圆盘——干净且省心。环（要伸出盘外）与轮廓层在 restore 之后画。

**小圆斑（陨石坑、光斑）的投影近似为椭圆**：
- 屏幕中心：(C + R·X', C − R·Y')；
- 压缩方向 = 盘心到投影点的**径向**（深度梯度方向），径向半轴 = δ·R·Z'，
  切向半轴 = δ·R；
- 用旋转画法：
```
p.save(); p.translate(sx, sy); p.rotate(atan2(sy−C, sx−C))
p.drawOval({ left: −δR·Z', top: −δR, width: 2δR·Z', height: 2δR }, fill)
p.restore()
```
- **坑体用 radial 渐变填充**（中心最暗→边缘透明，`rect` 锁到椭圆），
  是软边「凹陷」而非实色贴片，观感柔和得多；
- 接近轮廓线（Z'→0）时被压扁成细线并 `alpha × Z'` 淡出；
  Z'<0（背面）直接跳过——坑不该出现在暗面时保持纯暗（夜帽会统一压暗夜侧）。

- **坑田的复杂度（美化核心）**：陨石坑用**幂律尺寸分布**（`config.crater`，1.8 次幂
  向小端聚集 → 大量小坑 + 少量大坑），每颗行星预生 ~12 个候选，渲染端按半径取子集
  （越大越密）。每个坑画 **两层**：
  1. **亮边环**：略大于坑体、朝光偏移的柔和亮盘（radial 渐变，峰值在坑壁处、外缘回落，
     只露出朝光半边 = 环形山朝向光源的亮壁）；
  2. **暗坑体**：径向渐变（中心最暗→边缘透明）小一圈、朝影偏移——影池收在暗侧，
     亮边环朝光侧自然露出。
  两层偏移量由「局部旋转帧里投影光向量」决定（局部 x=径向、y=切向），光向统一。
- **表面斑驳（terrain mottle，仅岩石行星）**：在底渐变与陨石坑之间画若干块大半径
  柔和明/暗 radial 渐变补丁（`config.mottle`，按半径取子集，软边自带、不开 mask blur），
  **最大一块固定为暗色「月海」盆地**，给地形一个稳定暗锚点；随 `ω·t` 自转流动。
- **风暴（仅气态行星）**：赤道附近的暖色漩涡核 + 一圈晕（`config.storm`，radial 渐变、
  横向略拉长模拟剪切），随自转移动——木星大红斑那类细节。

**纬度带（气态行星云带 / 矮行星极冠）**：把带中心线按经度采样
（每 12° 一点）得到折线，`drawPath` 用 stroke 填充，`strokeWidth ≈ R·Δφ·|cosφ|`（投影后按需微调）。
云带（带 wave 的气态带）分两笔：暗色加宽底带 + 主色带（alpha ~0.72），
模拟带间「槽谷」体积而非整条硬条纹；极冠用固定像素宽的折线带，矮行星再加 2~3 个
低对比冰环山（暗坑 + 冰白亮边，复用坑渲染）。云带会随自转呈现流动感（模拟木星）。

## 8. 行星环深度排序

环平面带给视线倾角 i（按 id 播种 0.35~0.6 rad）→ 屏幕上为横向椭圆，纵向压缩
`sin i`。**环带 = 内外两椭圆之间的环**，用**中线椭圆 stroke** 直接逼近：
```
中线半径 Rm = (Rout + Rin)/2 ，strokeWidth = Rout − Rin
Rm_x = 1.2·R ，Rm_y = Rm_x·sin i            // Rout 可略超画布，与现有 art 一致
```
深度排序：
1. **后环（远的半幅）** → 先画（dim，alpha≈0.35）：`drawArc(midEllipse, 上半幅, stroke)`；
2. 画球体全部图层（clip 到圆盘）；
3. **前环（近的半幅）** → 后画（亮，alpha≈0.8）：`drawArc(midEllipse, 下半幅, stroke)`。

前后环可各配小 sigma `blur` 柔和边缘。环伸出圆盘外是**有意为之**——与现有一致
（当前 `ring()` Container 已依赖外层的 `overflow="visible"`），前提是行星间不重叠。
Rout ≥ R、Rin ≈ 1.02R·(略大于球体)会与球相交处被 body 遮挡，视觉正确。

## 9. 绘制顺序汇总（以岩石行星为例）

```
1  (气态) 环-后
2  save + clipPath(圆盘)                       // 球体图层全部裁在圆盘内
3  底：线性渐变（受光侧亮 → 背光侧暗）填充整盘
4  (气态)dwarf/gas 云带/极冠：stroke 折线 path
5  (岩石) 陨石坑：save/translate/rotate/drawOval/restore × ≤ 6
6  夜帽：cap path 填 linear gradient 深色→透明（晨昏线软过渡，压暗夜侧一切）
7  restore（解除圆盘裁剪）
8  轮廓：受光侧 drawArc 高光(stroke+blur) / 夜侧 drawArc 压暗(stroke+blur——夜侧
   黑环若硬描边会在盘外勒出生硬黑圈，必须同带 blur)
9  整体半球暗边：radial gradient 透明中心→暗轮廓（球体纵深）
10 glint：blur 径向渐变白斑（随自转，翻过晨昏线消失）
11 (气态) 环-前
```
指令预算：岩石 ≈ 底 1 + 裁剪 2 + 斑驳 6×2 + 坑 ≤12×(save/translate/rotate + 亮边环 + 暗坑体 + restore) + 夜帽 1 + 轮廓 2 + 暗边 1 + 光斑 5 ≈ **120 条/行星**；
气态 ≈ 70~100 条（云带双层 stroke 2×6 条 + 风暴 1×5 + 环前后 2 条）；LOD simple 档砍掉斑驳/坑/轮廓/光斑，中档砍坑环与风暴。

> 注意：`clipRect(rect, {clipOp:'difference'})` 可用来做「月牙式」区域运算（夜帽区域 =
> 整盘 − 受光半盘之类），是备选的第二种夜帽构造方式，原型阶段先走 cap path。

## 10. 自转动画与数据流

每颗行星持有**一个常驻 `CustomPainter`**（`useRef`，created once），
静态形状数据（τ、ω、调色板、特征表、倾角）用模块级 `Map<key, PlanetShape>` 缓存，
**每帧只重算几何**，绝不重新播种随机：

- **方案 A（默认，先落地）**：沿用现有 `state.time` 走 React 渲染链路——
  冷行星(0-4)现在都要自转，`GameField` 给**所有行星**传 `time`（取消按 power 的
  gating）；`Planet` 每次 render 重建指令 → `CustomPaint` 重新 serialize（新数组引用）→
  parser 重绘。改动最小，直接并入现有 30fps tick。
- **方案 B（优化，A 验证后做）**：自转与游戏 tick 解耦——组件内 `Timer/rAF`
  以 60fps 调 `painter.repaint(builder)`，**只 update 该 CustomPaint 节点**，
  不触碰 store / 不 notify 兄弟组件；游戏 30fps 只负责物理。旋转更顺滑且少 React 抖动。

两种都天然被 `GameField` 的外层 `RepaintBoundary` + parser 内层 `RepaintBoundary`
双层隔离：行星平移与旋转各画各的层。发光天体（5-8）仍走原有的 RepaintBoundary 大树。

## 11. 性能预算与 LOD

- 可见行星约 ≤16 + 玩家 + 卫星；按 §9 预算，全屏每帧 ≤ ~1000 条 canvas 指令，
  分摊在 ≈20 个独立图层，30fps 各层只重绘自身。
- **渐变/blur 代价**：渐变 shader 每次绘制创建、每帧仅一次/行星，可接受；`blur`
  逐帧生成 mask 有一定成本——**默认只给 glint、轮廓高光、夜侧压暗与夜帽 fill
  开小 sigma blur**（夜帽那条晨昏线羽化是软阴影的关键，必要保留）；坑/斑驳/暗边
  用渐变不用 blur；帧率不够先从这里删。
- **LOD**（进 `config.ts`，避免调死）：
  - 直径 < 20px：降级为「底 + 单层夜帽 + 轮廓」，最多 2 坑，无光斑；
  - 直径 < 14px：退化为「底 + 单帽」纯圆。
- 全部在 RepaintBoundary 图层内绘制。

## 12. 代码落点

| 文件 | 内容 |
|---|---|
| `js/src/game/sphere.ts`（新） | 纯数学：rotX/投影/晨昏线采样 + 夜帽 cap path 构造，全部无副作用 |
| `js/src/game/planetShape.ts`（新） | 颜色工具（rgb/shade/alphaOf/srand）+ 按 id 播种的静态形状缓存：τ、ω、调色板、坑/云带/极冠特征表、环倾角 |
| `js/src/game/config.ts` | 追加 `PLANET_GFX`：光源向量、夜帽 alpha/blur、glint 参数、转速/倾角范围、LOD 阈值 |
| `js/src/components/PlanetPainter.ts`（新） | 各 power 的指令生成器（rocks/dwarf/gas），输出到常驻 CustomPainter |
| `js/src/components/Planet.tsx` | 冷行星(0-4)切换到 `<CustomPaint painter size/>`；发光天体 5-8 / 黑洞 9 / 宇宙 10 分支不动 |
| `js/src/components/GameField.tsx` | 所有行星都传 `time`；`planetAnimates` gating 移除 |

## 13. 分阶段实施与验证

1. **原型**：`sphere.ts` + `planetShape.ts` + `PlanetPainter.ts`（仅 rocky，power 0/1/3），
   `GameField` 给所有行星注 time。验证晨昏线、夜帽渐变、坑的透视缩短、自转、光斑消失。
2. **调光**：`npm run start` 热重载 + `r` 键，调光源方向、夜帽 alpha/blur、glint
   强度/尺寸。**审美的关卡全在这层参数**。
3. **推广**：dwarf（极冠+云带）→ gas（云带+环前后）。发光/黑洞/宇宙分支不变。
4. **优化**：视帧率决定是否上方案 B（rAF repaint）+ LOD 阈值 + 削减 blur。
5. **发布**：`npm run lint` → `npm run build` → `npm run bundle:pack:copy` →
   demo 重新 `flutter run`。**框架已改动**（CustomPaint gradient/clip/blur），按
   AGENTS.md 约定需 `git -C fuickjs_framework add -A && commit && push`（跳过
   `node_modules.zip`、`macos/Flutter/ephemeral/` 等产物）。

## 14. 风险与开放问题

- **blur 逐帧代价**：glint/轮廓高光的 blur 若帧率不足，先删 blur 保渐变（框架保留能力，参数层开关）。
- **路径拼接缝** → 晨昏线 24 点采样 + `quadraticBezierTo` 平滑、闭合并抗锯齿。
- **环越界** → 环伸出圆盘依赖外层 `overflow visible`（与现实一致）；若行星重叠明显，
  将环半径约束回 `Rout ≤ 1.0·R` 或给 ring 单独加 clipRect。
- **tilt 参考轴**：晨昏线形状/轮廓高光的角度随 τ 播种，原型时确认各行星立场一致。
- **参数**（ω、glintα、夜帽 alpha、LOD 阈值）先给保守默认，热重载试玩后收敛，
  建议最终回填到 `PLANET_GFX` 一处集中管理。
- **`_paintCache` 以尺寸+对象 identity 做 key**：渐变 shader 依赖画布尺寸，行星尺寸
  固定时缓存命中稳定；同一帧内 save/restore 嵌套复用同一 paint 配置。