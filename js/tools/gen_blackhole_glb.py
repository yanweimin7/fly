#!/usr/bin/env python3
"""生成黑洞 3D 模型 assets/models/blackhole.glb（纯程序化，无外部素材）。

结构（全部是真实 3D 几何，由 Scene3D 的 GLB 管线渲染）：
- EventHorizon：纯黑球体（无光照材质），即事件视界；
- PhotonRing：正对相机的细亮环（光子环），无光照 + 顶点色；
- AccretionDisk：绕 X 轴倾斜的吸积盘（内缘白热 → 外缘暗橙），顶点色渐变。

约定与其它天体模型一致：模型以原点为中心，屏幕可视外半径 1（Scene3D 按
size/2 缩放）。吸积盘外半径 1.0、内半径 0.50；事件视界半径 0.68。

运行：python3 tools/gen_blackhole_glb.py
"""

import json
import math
import os
import struct

OUT = os.path.join(os.path.dirname(__file__), "..", "assets", "models", "blackhole.glb")
TAU = math.pi * 2

# 吸积盘：内半径 / 外半径 / 绕 X 轴倾角（弧度）。
DISK_INNER = 0.50
DISK_OUTER = 1.00
DISK_TILT_X = 0.62
# 事件视界半径。
HORIZON_R = 0.68
# 光子环半径与朝向相机的 z 位置。
RING_R = (0.684, 0.712, 0.742)
RING_Z = 0.02

# 吸积盘径向色带（t=0 内缘，t=1 外缘）。
DISK_RAMP = [
    (0.00, (1.20, 1.00, 0.78)),
    (0.04, (1.15, 0.90, 0.55)),
    (0.10, (1.00, 0.74, 0.34)),
    (0.20, (0.92, 0.52, 0.16)),
    (0.34, (0.78, 0.30, 0.06)),
    (0.52, (0.55, 0.15, 0.02)),
    (0.72, (0.30, 0.065, 0.008)),
    (0.88, (0.12, 0.022, 0.002)),
    (1.00, (0.02, 0.004, 0.0)),
]


def lerp(a, b, t):
    return a + (b - a) * t


def ramp_color(t):
    for i in range(len(DISK_RAMP) - 1):
        t0, c0 = DISK_RAMP[i]
        t1, c1 = DISK_RAMP[i + 1]
        if t <= t1:
            k = 0.0 if t1 <= t0 else (t - t0) / (t1 - t0)
            return [lerp(c0[j], c1[j], k) for j in range(3)]
    return list(DISK_RAMP[-1][1])


def ang_wrap(a):
    """把角度差归一化到 [-pi, pi]。"""
    return (a + math.pi) % TAU - math.pi


def disk_color(t, a):
    """径向渐变 + 角向冷热不均（静态细节，让盘面不像纯色圆环）。"""
    c = ramp_color(t)
    m = 0.88 + 0.24 * (0.5 + 0.5 * math.sin(3 * a - 0.7))
    m += 0.10 * math.exp(-(ang_wrap(a - 0.8) ** 2) / 0.12)
    return [c[0] * m, c[1] * m, c[2] * m, 1.0]


def add_vertex(pos, col, positions, colors):
    positions.extend(pos)
    colors.extend(col)


def sphere(radius, lon_seg=64, lat_seg=32):
    """UV 球：返回 (positions, indices)。无顶点色（材质为纯黑）。"""
    positions = []
    indices = []
    for iy in range(lat_seg + 1):
        v = iy / lat_seg
        lat = -math.pi / 2 + v * math.pi
        cl = math.cos(lat)
        sl = math.sin(lat)
        for ix in range(lon_seg + 1):
            u = ix / lon_seg
            lon = u * TAU
            positions.extend(
                [radius * cl * math.cos(lon), radius * sl, radius * cl * math.sin(lon)]
            )
    stride = lon_seg + 1
    for iy in range(lat_seg):
        for ix in range(lon_seg):
            a = iy * stride + ix
            b = a + 1
            c = a + stride
            d = c + 1
            indices.extend([a, c, b, b, c, d])
    return positions, indices


def annulus(radii, color_fn, tilt_x=0.0, z0=0.0, seg=128, plane="xz"):
    """环形盘面。radii 为半径列表（由内到外）；color_fn(radius_index, angle)
    返回 RGBA。plane="xz" 是水平盘面（吸积盘，可用 tilt_x 绕 X 轴倾斜出
    透视椭圆）；plane="xy" 是正对相机的盘面（光子环）。"""
    positions = []
    colors = []
    indices = []
    n = len(radii)
    for ri, r in enumerate(radii):
        for j in range(seg):
            a = (j / seg) * TAU
            x = r * math.cos(a)
            if plane == "xy":
                y = r * math.sin(a)
                z = 0.0
            else:
                y = 0.0
                z = r * math.sin(a)
            if tilt_x != 0.0:
                cy = y * math.cos(tilt_x) - z * math.sin(tilt_x)
                cz = y * math.sin(tilt_x) + z * math.cos(tilt_x)
                y, z = cy, cz
            positions.extend([x, y, z + z0])
            colors.extend(color_fn(ri, a))
    for ri in range(n - 1):
        for j in range(seg):
            j2 = (j + 1) % seg
            a = ri * seg + j
            b = ri * seg + j2
            c = (ri + 1) * seg + j
            d = (ri + 1) * seg + j2
            indices.extend([a, c, b, b, c, d])
    return positions, colors, indices


class GlbBuilder:
    def __init__(self):
        self.bin = bytearray()
        self.views = []
        self.accessors = []
        self.meshes = []
        self.materials = []

    def _view(self, data, target):
        while len(self.bin) % 4:
            self.bin.append(0)
        off = len(self.bin)
        self.bin.extend(data)
        self.views.append(
            {"buffer": 0, "byteOffset": off, "byteLength": len(data), "target": target}
        )
        return len(self.views) - 1

    def _accessor(self, view, comp_type, count, acc_type, minv=None, maxv=None):
        entry = {
            "bufferView": view,
            "componentType": comp_type,
            "count": count,
            "type": acc_type,
        }
        if minv is not None:
            entry["min"] = minv
        if maxv is not None:
            entry["max"] = maxv
        self.accessors.append(entry)
        return len(self.accessors) - 1

    def add_positions(self, positions):
        data = struct.pack("<%df" % len(positions), *positions)
        view = self._view(data, 34962)
        count = len(positions) // 3
        minv = [min(positions[i::3]) for i in range(3)]
        maxv = [max(positions[i::3]) for i in range(3)]
        return self._accessor(view, 5126, count, "VEC3", minv, maxv)

    def add_colors(self, colors):
        data = struct.pack("<%df" % len(colors), *colors)
        view = self._view(data, 34962)
        return self._accessor(view, 5126, len(colors) // 4, "VEC4")

    def add_indices(self, indices):
        use32 = max(indices, default=0) > 0xFFFF
        if use32:
            data = struct.pack("<%dI" % len(indices), *indices)
            comp = 5125
        else:
            data = struct.pack("<%dH" % len(indices), *indices)
            comp = 5123
        view = self._view(data, 34963)
        return self._accessor(view, comp, len(indices), "SCALAR")

    def add_material(self, name, color, double_sided):
        self.materials.append(
            {
                "name": name,
                "doubleSided": double_sided,
                "extensions": {"KHR_materials_unlit": {}},
                "pbrMetallicRoughness": {
                    "baseColorFactor": [color[0], color[1], color[2], color[3]],
                    "metallicFactor": 0.0,
                    "roughnessFactor": 1.0,
                },
            }
        )
        return len(self.materials) - 1

    def add_mesh(self, name, positions, indices, material, colors=None):
        attrs = {"POSITION": self.add_positions(positions)}
        if colors is not None:
            attrs["COLOR_0"] = self.add_colors(colors)
        prim = {
            "attributes": attrs,
            "indices": self.add_indices(indices),
            "material": material,
        }
        self.meshes.append({"name": name, "primitives": [prim]})
        return len(self.meshes) - 1


def build():
    b = GlbBuilder()

    # 材质：事件视界纯黑；光子环/吸积盘用顶点色（基色白）。
    mat_black = b.add_material("EventHorizon", (0.0, 0.0, 0.0, 1.0), False)
    mat_ring = b.add_material("PhotonRing", (1.0, 1.0, 1.0, 1.0), True)
    mat_disk = b.add_material("AccretionDisk", (1.0, 1.0, 1.0, 1.0), True)

    # 1) 事件视界球体。
    sp, si = sphere(HORIZON_R)
    mesh_core = b.add_mesh("EventHorizon", sp, si, mat_black)

    # 2) 光子环：正对相机（XY 平面），由内向外从白热渐隐到暖橙。
    ring_colors = [(1.15, 1.02, 0.86, 1.0), (1.20, 1.02, 0.80, 1.0), (0.60, 0.35, 0.12, 1.0)]

    def ring_color(ri, _a):
        return list(ring_colors[ri])

    rp, rc, ri = annulus(
        list(RING_R), ring_color, tilt_x=0.0, z0=RING_Z, seg=128, plane="xy"
    )
    mesh_ring = b.add_mesh("PhotonRing", rp, ri, mat_ring, rc)

    # 3) 吸积盘：绕 X 轴倾斜，内缘白热、外缘暗橙；径向 18 圈保证渐变平滑。
    disk_radii = [
        DISK_INNER + (DISK_OUTER - DISK_INNER) * (i / 17) for i in range(18)
    ]

    def disk_color_fn(ri, a):
        t = ri / (len(disk_radii) - 1)
        return disk_color(t, a)

    dp, dc, di = annulus(disk_radii, disk_color_fn, tilt_x=DISK_TILT_X, seg=128)
    mesh_disk = b.add_mesh("AccretionDisk", dp, di, mat_disk, dc)

    gltf = {
        "asset": {"version": "2.0", "generator": "fly/tools/gen_blackhole_glb.py"},
        "extensionsUsed": ["KHR_materials_unlit"],
        "scene": 0,
        "scenes": [{"name": "BlackHole", "nodes": [0]}],
        "nodes": [
            {"name": "BlackHole", "children": [1, 2, 3]},
            {"name": "EventHorizon", "mesh": mesh_core},
            {"name": "PhotonRing", "mesh": mesh_ring},
            {"name": "AccretionDisk", "mesh": mesh_disk},
        ],
        "meshes": b.meshes,
        "materials": b.materials,
        "accessors": b.accessors,
        "bufferViews": b.views,
        "buffers": [{"byteLength": len(b.bin)}],
    }
    return gltf, bytes(b.bin)


def main():
    gltf, bin_data = build()
    json_data = json.dumps(gltf, separators=(",", ":"), ensure_ascii=True).encode()
    while len(json_data) % 4:
        json_data += b" "
    while len(bin_data) % 4:
        bin_data += b"\x00"
    total = 12 + 8 + len(json_data) + 8 + len(bin_data)
    out = bytearray()
    out.extend(struct.pack("<III", 0x46546C67, 2, total))
    out.extend(struct.pack("<II", len(json_data), 0x4E4F534A))
    out.extend(json_data)
    out.extend(struct.pack("<II", len(bin_data), 0x004E4942))
    out.extend(bin_data)

    target = os.path.abspath(OUT)
    os.makedirs(os.path.dirname(target), exist_ok=True)
    with open(target, "wb") as f:
        f.write(out)
    print(
        "wrote %s (%d bytes): %d materials, %d meshes, %d accessors"
        % (target, len(out), len(gltf["materials"]), len(gltf["meshes"]), len(gltf["accessors"]))
    )


if __name__ == "__main__":
    main()
