import React from "react";
import { Stack, Positioned, Container, ClipPath } from "fuickjs";

interface PlanetProps {
  radius: number;
  /** 进化等级 0 基索引（STAGES 数组下标）。 */
  power: number;
  /** 实体 id：用于稳定随机出表面细节，同一实体保持不变。 */
  id: number;
  /** 游戏时间（秒），用于动画。 */
  time: number;
}

/* —— 颜色 / 随机工具 —— */

function rgb(h: string): [number, number, number] {
  const s = h.replace("#", "").padEnd(6, "0");
  return [
    parseInt(s.slice(0, 2), 16),
    parseInt(s.slice(2, 4), 16),
    parseInt(s.slice(4, 6), 16),
  ];
}

function fromRgb(r: number, g: number, b: number): string {
  const c = (v: number) =>
    Math.round(Math.max(0, Math.min(1, v)) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** t>0 提亮、t<0 压暗（t ∈ [-1,1]）。 */
function shade(h: string, t: number): string {
  const [r, g, b] = rgb(h);
  const f = (v: number) => (t > 0 ? v + (255 - v) * t : v * (1 + t));
  return fromRgb(f(r), f(g), f(b));
}

/** 6 位 hex 转 8 位 RRGGBBAA。 */
function alphaOf(h: string, a: number): string {
  const s = h.replace("#", "").padEnd(6, "0");
  const aa = Math.round(Math.max(0, Math.min(1, a)) * 255)
    .toString(16)
    .padStart(2, "0");
  return `#${s}${aa}`;
}

function srand(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

/* —— 光源方向（球体明暗） —— */

const LIGHTS = [
  { begin: "topLeft", end: "bottomRight" },
  { begin: "topRight", end: "bottomLeft" },
  { begin: "topCenter", end: "bottomCenter" },
  { begin: "centerLeft", end: "centerRight" },
];

interface Dir {
  begin: string;
  end: string;
}

/* —— 通用结构件 —— */

/** 把子节点裁成圆形（球的表面）。 */
function sphere(d: number, children: React.ReactNode[]): React.ReactNode {
  return (
    <ClipPath path="circle(50%)">
      <Stack width={d} height={d}>
        {children}
      </Stack>
    </ClipPath>
  );
}

/** 顶部受光高光 + 背光面阴影，两枚叠加出立体球感。 */
function limbOverlays(d: number, dir: Dir, key: string): React.ReactNode[] {
  return [
    <Positioned key={`${key}-hl`} left={0} top={0} width={d} height={d}>
      <Container
        width={d}
        height={d}
        decoration={{
          gradient: {
            type: "linear",
            begin: dir.begin,
            end: dir.end,
            colors: [
              alphaOf("#ffffff", 0.14),
              alphaOf("#ffffff", 0),
              alphaOf("#ffffff", 0),
            ],
            stops: [0, 0.32, 1],
          },
        }}
      />
    </Positioned>,
    <Positioned key={`${key}-sh`} left={0} top={0} width={d} height={d}>
      <Container
        width={d}
        height={d}
        decoration={{
          gradient: {
            type: "linear",
            begin: dir.end,
            end: dir.begin,
            colors: [
              alphaOf("#000000", 0.5),
              alphaOf("#000000", 0.14),
              alphaOf("#000000", 0),
            ],
            stops: [0, 0.55, 1],
          },
        }}
      />
    </Positioned>,
  ];
}

/** 圆形球体：基础线性明暗渐变。 */
function ballGradient(
  d: number,
  dir: Dir,
  colors: string[],
  stops: number[],
  key: string,
): React.ReactNode {
  return (
    <Positioned key={key} left={0} top={0} width={d} height={d}>
      <Container
        width={d}
        height={d}
        decoration={{
          gradient: {
            type: "linear",
            begin: dir.begin,
            end: dir.end,
            colors,
            stops,
          },
        }}
      />
    </Positioned>
  );
}

/** 全幅径向渐变（光晕 / 核心辉光）。 */
function radialGlow(
  d: number,
  colors: string[],
  stops: number[],
  key: string,
): React.ReactNode {
  return (
    <Positioned key={key} left={0} top={0} width={d} height={d}>
      <Container
        width={d}
        height={d}
        decoration={{
          gradient: { type: "radial", colors, stops },
        }}
      />
    </Positioned>
  );
}

/** 陨石坑：暗色圆斑 + 微弱阴影。 */
function craters(
  d: number,
  C: number,
  seed: number,
  color: string,
  n: number,
): React.ReactNode[] {
  const arr: React.ReactNode[] = [];
  for (let i = 0; i < n; i++) {
    const r = d * (0.09 + srand(seed + i * 3) * 0.09);
    const dx = (srand(seed + i * 5 + 1) - 0.5) * d * 0.5;
    const dy = (srand(seed + i * 7 + 2) - 0.5) * d * 0.5;
    arr.push(
      <Positioned
        key={`c${i}`}
        left={C - r + dx}
        top={C - r + dy}
        width={r * 2}
        height={r * 2}
      >
        <Container
          width={r * 2}
          height={r * 2}
          decoration={{
            color: alphaOf(color, 0.85),
            borderRadius: r,
            boxShadow: {
              color: alphaOf("#000000", 0.4),
              blurRadius: r * 0.6,
              offset: { dx: r * 0.2, dy: r * 0.3 },
            },
          }}
        />
      </Positioned>,
    );
  }
  return arr;
}

/** 横向条纹（行星带 / 极冠）。 */
function band(
  d: number,
  y: number,
  h: number,
  color: string,
  a: number,
  key: string,
): React.ReactNode {
  return (
    <Positioned key={key} left={-d * 0.06} top={y} width={d * 1.12} height={h}>
      <Container
        width={d * 1.12}
        height={h}
        decoration={{ color: alphaOf(color, a) }}
      />
    </Positioned>
  );
}

/** 行星环：狭长椭圆（画在星球后面）。 */
function ring(
  d: number,
  C: number,
  color: string,
  a: number,
  key: string,
): React.ReactNode {
  const w = d * 1.5;
  const h = Math.max(3, d * 0.26);
  return (
    <Positioned key={key} left={C - w / 2} top={C - h / 2} width={w} height={h}>
      <Container
        width={w}
        height={h}
        decoration={{
          borderRadius: h / 2,
          gradient: {
            type: "linear",
            begin: "centerLeft",
            end: "centerRight",
            colors: [
              alphaOf(color, 0),
              alphaOf(color, a),
              alphaOf(color, a),
              alphaOf(color, 0),
            ],
            stops: [0, 0.3, 0.7, 1],
          },
          boxShadow: { color: alphaOf(color, a * 0.5), blurRadius: d * 0.08 },
        }}
      />
    </Positioned>
  );
}

/** 8 条衍射芒的固定方向（角 → 渐变起止，与矩形包围盒主轴对齐）。 */
const SPIKE_DIRS: Array<{
  a: number;
  begin: string;
  end: string;
}> = [
  { a: 0, begin: "centerLeft", end: "centerRight" },
  { a: Math.PI / 4, begin: "topLeft", end: "bottomRight" },
  { a: Math.PI / 2, begin: "topCenter", end: "bottomCenter" },
  { a: (3 * Math.PI) / 4, begin: "topRight", end: "bottomLeft" },
  { a: Math.PI, begin: "centerRight", end: "centerLeft" },
  { a: (5 * Math.PI) / 4, begin: "bottomRight", end: "topLeft" },
  { a: (3 * Math.PI) / 2, begin: "bottomCenter", end: "topCenter" },
  { a: (7 * Math.PI) / 4, begin: "bottomLeft", end: "topRight" },
];

/** 多芒衍射光：8条细长渐变条，长度/透明度各自正弦脉动，闪耀更快更饱满。 */
function multiSpikes(
  d: number,
  C: number,
  color: string,
  a: number,
  time: number,
  speed: number,
  key: string,
): React.ReactNode[] {
  const rays: React.ReactNode[] = [];
  const baseLen = d * 0.44;
  const w = Math.max(0.6, d * 0.025);
  const tip = alphaOf(color, 0);

  for (let i = 0; i < SPIKE_DIRS.length; i++) {
    const { a: angle, begin, end } = SPIKE_DIRS[i];
    // 每条芒的长度带脉冲（正弦波），相位错开让各芒交替闪烁
    const pulse = Math.sin(time * speed * 3 + i * 1.2) * 0.3 + 0.7;
    const L = baseLen * pulse;
    const opacity = a * (0.6 + 0.4 * Math.sin(time * speed * 2.5 + i * 0.8));
    if (opacity <= 0) continue;
    const mid = alphaOf(color, opacity);

    const cos = Math.abs(Math.cos(angle));
    const sin = Math.abs(Math.sin(angle));
    const bw = L * 2 * cos + w * 2;
    const bh = L * 2 * sin + w * 2;

    rays.push(
      <Positioned
        key={`${key}-${i}`}
        left={C - bw / 2}
        top={C - bh / 2}
        width={bw}
        height={bh}
      >
        <Container
          width={bw}
          height={bh}
          decoration={{
            gradient: {
              type: "linear",
              begin,
              end,
              colors: [tip, mid, tip],
              stops: [0, 0.5, 1],
            },
            borderRadius: w,
            boxShadow: {
              color: alphaOf(color, opacity * 0.35),
              blurRadius: w * 2,
            },
          }}
        />
      </Positioned>,
    );
  }
  return rays;
}

/* —— 各等级渲染 —— */

function rockyPlanet(
  d: number,
  C: number,
  id: number,
  pal: string[],
  craterCount: number,
): React.ReactNode[] {
  const dir = LIGHTS[id % LIGHTS.length];
  const jb = (srand(id * 7) - 0.5) * 0.18;
  const base = shade(pal[0], jb);
  const nodes: React.ReactNode[] = [
    sphere(d, [
      ballGradient(
        d,
        dir,
        [shade(base, 0.34), base, shade(base, -0.22), shade(base, -0.45)],
        [0, 0.38, 0.72, 1],
        "body",
      ),
      ...craters(d, C, id * 3 + 1, pal[2] ?? shade(base, -0.35), craterCount),
      ...limbOverlays(d, dir, "limb"),
    ]),
  ];
  return nodes;
}

function dwarfPlanet(d: number, C: number, id: number): React.ReactNode[] {
  const dir = LIGHTS[id % LIGHTS.length];
  const jb = (srand(id * 7) - 0.5) * 0.18;
  const base = shade("#9aa8b8", jb);
  const nodes: React.ReactNode[] = [
    sphere(d, [
      ballGradient(
        d,
        dir,
        [shade(base, 0.3), base, shade(base, -0.2), shade(base, -0.42)],
        [0, 0.35, 0.7, 1],
        "body",
      ),
      band(d, d * 0.02, d * 0.14, "#ffffff", 0.55, "cap-n"),
      band(d, d * 0.84, d * 0.14, "#ffffff", 0.55, "cap-s"),
      band(d, d * 0.42, d * 0.16, shade(base, -0.12), 0.5, "mid-band"),
      ...limbOverlays(d, dir, "limb"),
    ]),
  ];
  return nodes;
}

function gasPlanet(d: number, C: number, id: number): React.ReactNode[] {
  const dir = LIGHTS[id % LIGHTS.length];
  const bandColors = ["#f2dcb2", "#e2b06f", "#bd7940", "#dcc9a0", "#f0e3c6"];
  const rows = [
    { top: 0.06, h: 0.2, ci: 1 },
    { top: 0.24, h: 0.15, ci: 2 },
    { top: 0.38, h: 0.18, ci: 3 },
    { top: 0.56, h: 0.14, ci: 1 },
    { top: 0.7, h: 0.2, ci: 2 },
  ];
  const bandNodes: React.ReactNode[] = rows.map((row, i) =>
    band(
      d,
      d * row.top + (srand(id * 11 + i) - 0.5) * d * 0.03,
      d * row.h,
      bandColors[(row.ci + id) % bandColors.length],
      0.9,
      `band${i}`,
    ),
  );
  const nodes: React.ReactNode[] = [
    ring(d, C, "#e8d9b5", 0.7, "ring"),
    sphere(d, [
      ballGradient(
        d,
        dir,
        [
          shade("#f7ecd2", 0.3),
          "#f2dcb2",
          shade("#e2c49a", -0.15),
          shade("#d8ac7a", -0.35),
        ],
        [0, 0.4, 0.75, 1],
        "body",
      ),
      ...bandNodes,
      ...limbOverlays(d, dir, "limb"),
    ]),
  ];
  return nodes;
}

function glowingStar(
  d: number,
  C: number,
  id: number,
  kind: "dwarf" | "star" | "supergiant" | "neutron",
  time: number,
): React.ReactNode[] {
  const node: React.ReactNode[] = [];
  const jb = (srand(id * 7) - 0.5) * 0.1;
  if (kind === "star" || kind === "neutron") {
    node.push(
      ...multiSpikes(
        d,
        C,
        shade("#ffffff", jb),
        kind === "neutron" ? 0.8 : 0.55,
        time,
        kind === "neutron" ? 8 : 5,
        "spike",
      ),
    );
  }
  if (kind === "dwarf") {
    node.push(
      radialGlow(
        d,
        [
          alphaOf(shade("#ffd27a", jb), 0.6),
          alphaOf("#ffd27a", 0.18),
          alphaOf("#ffd27a", 0),
        ],
        [0, 0.45, 1],
        "halo",
      ),
    );
    node.push(
      ...multiSpikes(d, C, shade("#ffd27a", jb), 0.3, time, 5.5, "spike"),
    );
    node.push(
      sphere(d, [
        ballGradient(
          d,
          LIGHTS[id % LIGHTS.length],
          [shade("#fff4d0", 0.4), shade("#ffd27a", jb), shade("#ff9d3c", -0.1)],
          [0, 0.45, 1],
          "core",
        ),
      ]),
    );
  } else if (kind === "star") {
    node.push(
      radialGlow(
        d,
        [
          alphaOf("#fff7dc", 0.85),
          alphaOf("#fff7dc", 0.3),
          alphaOf("#fff7dc", 0),
        ],
        [0, 0.4, 1],
        "halo",
      ),
    );
    node.push(
      sphere(d, [
        radialGlow(
          d,
          [
            alphaOf("#ffffff", 1),
            alphaOf("#ffe9ad", 0.85),
            alphaOf("#ffe9ad", 0.25),
          ],
          [0, 0.45, 1],
          "core",
        ),
      ]),
    );
  } else if (kind === "supergiant") {
    node.push(
      radialGlow(
        d,
        [
          alphaOf(shade("#ff6a44", jb), 0.75),
          alphaOf("#ff8a5c", 0.28),
          alphaOf("#ff8a5c", 0),
        ],
        [0, 0.42, 1],
        "halo",
      ),
    );
    node.push(multiSpikes(d, C, shade("#ffd0b0", jb), 0.4, time, 6, "spike"));
    node.push(
      sphere(d, [
        radialGlow(
          d,
          [
            alphaOf("#fff0d8", 1),
            alphaOf(shade("#ff8a5c", jb), 0.9),
            alphaOf("#ff6a44", 0.4),
          ],
          [0, 0.5, 1],
          "core",
        ),
      ]),
    );
  } else {
    node.push(
      radialGlow(
        d,
        [
          alphaOf("#cfe4ff", 0.9),
          alphaOf("#6aa0ff", 0.35),
          alphaOf("#6aa0ff", 0),
        ],
        [0, 0.4, 1],
        "halo",
      ),
    );
    node.push(
      sphere(d, [
        radialGlow(
          d,
          [
            alphaOf("#ffffff", 1),
            alphaOf("#d7e6ff", 0.9),
            alphaOf("#9cc4ff", 0.4),
          ],
          [0, 0.4, 1],
          "core",
        ),
      ]),
    );
  }
  return node;
}

function blackhole(d: number, C: number, id: number): React.ReactNode[] {
  const jb = (srand(id * 7) - 0.5) * 0.1;
  const s = d * 0.36; // 事件视界半径：纯黑「洞」本体，占主体
  const ph = Math.max(1.2, d * 0.016); // 光子环宽度
  return [
    // 外围极淡的引力透镜余晖（不喧宾夺主）
    radialGlow(
      d,
      [
        alphaOf(shade("#5b2a8a", jb), 0.16),
        alphaOf("#2a1650", 0.06),
        alphaOf("#2a1650", 0),
      ],
      [0, 0.5, 1],
      "halo",
    ),
    // 吸积盘：环绕视界外缘的亮环（白热→橙→渐隐），盘面清晰可见
    radialGlow(
      d,
      [
        alphaOf("#ff7a33", 0),
        alphaOf("#fff2cc", 0),
        alphaOf("#fff2cc", 0),
        alphaOf("#fff7e0", 0.95),
        alphaOf("#ffc890", 0.55),
        alphaOf("#ff8a3c", 0.18),
        alphaOf("#ff5a22", 0),
      ],
      [0, 0.4, 0.68, 0.78, 0.88, 0.96, 1],
      "disk",
    ),
    // 纯黑事件视界：洞内（含中心）为不透明深黑，压在吸积盘之上
    <Positioned
      key="shadow"
      left={C - s}
      top={C - s}
      width={s * 2}
      height={s * 2}
    >
      <Container
        width={s * 2}
        height={s * 2}
        decoration={{
          color: alphaOf("#000000", 1),
          borderRadius: s,
        }}
      />
    </Positioned>,
    // 光子球环：仅留一条白热细环标明黑洞边界，保证黑体在夜幕中仍可见
    <Positioned
      key="photon"
      left={C - s}
      top={C - s}
      width={s * 2}
      height={s * 2}
    >
      <Container
        width={s * 2}
        height={s * 2}
        decoration={{
          borderRadius: s,
          border: {
            width: ph,
            color: alphaOf("#fff7e0", 0.7),
          },
          boxShadow: {
            color: alphaOf("#ffd9a0", 0.3),
            blurRadius: d * 0.02,
            spreadRadius: 0,
          },
        }}
      />
    </Positioned>,
  ];
}

function nebula(d: number): React.ReactNode[] {
  const blobs: React.ReactNode[] = [
    { x: 0.12, y: 0.1, s: 0.75, c: "#7a5cff" },
    { x: 0.34, y: 0.3, s: 0.6, c: "#c24ee8" },
    { x: 0.55, y: 0.5, s: 0.55, c: "#ff8ad4" },
    { x: 0.08, y: 0.6, s: 0.7, c: "#4a86ff" },
  ];
  const nodes: React.ReactNode[] = blobs.map((b, i) => {
    const size = d * b.s;
    return (
      <Positioned
        key={`blob${i}`}
        left={d * b.x}
        top={d * b.y}
        width={size}
        height={size}
      >
        <Container
          width={size}
          height={size}
          decoration={{
            gradient: {
              type: "radial",
              colors: [alphaOf(b.c, 0.55), alphaOf(b.c, 0.15), alphaOf(b.c, 0)],
              stops: [0, 0.45, 1],
            },
          }}
        />
      </Positioned>
    );
  });
  nodes.push(
    radialGlow(
      d,
      [
        alphaOf("#171033", 0.9),
        alphaOf("#171033", 0.55),
        alphaOf("#171033", 0.2),
      ],
      [0, 0.55, 1],
      "core",
    ),
  );
  for (let i = 0; i < 6; i++) {
    const r = d * (0.008 + srand(i * 13 + 5) * 0.02);
    nodes.push(
      <Positioned
        key={`spark${i}`}
        left={d * (0.1 + srand(i * 17 + 1) * 0.8) - r}
        top={d * (0.1 + srand(i * 19 + 2) * 0.8) - r}
        width={r * 2}
        height={r * 2}
      >
        <Container
          width={r * 2}
          height={r * 2}
          decoration={{ color: alphaOf("#ffffff", 0.7), borderRadius: r }}
        />
      </Positioned>,
    );
  }
  return nodes;
}

/* —— 入口 —— */

export default function Planet({ radius, power, id, time }: PlanetProps) {
  const d = Math.max(6, radius * 2);
  const C = d / 2;
  let nodes: React.ReactNode[];
  switch (power) {
    case 0:
      nodes = rockyPlanet(d, C, id, ["#8d8578", "#6b6357", "#4c463d"], 2);
      break;
    case 1:
      nodes = rockyPlanet(d, C, id, ["#9aa1a7", "#767d85", "#535a62"], 4);
      break;
    case 2:
      nodes = dwarfPlanet(d, C, id);
      break;
    case 3:
      nodes = rockyPlanet(d, C, id, ["#d2a377", "#a96f45", "#7a4a26"], 3);
      break;
    case 4:
      nodes = gasPlanet(d, C, id);
      break;
    case 5:
      nodes = glowingStar(d, C, id, "dwarf", time);
      break;
    case 6:
      nodes = glowingStar(d, C, id, "star", time);
      break;
    case 7:
      nodes = glowingStar(d, C, id, "supergiant", time);
      break;
    case 8:
      nodes = glowingStar(d, C, id, "neutron", time);
      break;
    case 9:
      nodes = blackhole(d, C, id);
      break;
    default:
      nodes = nebula(d);
      break;
  }
  return (
    <Stack width={d} height={d} overflow="visible">
      {nodes}
    </Stack>
  );
}
