#!/usr/bin/env python3
"""生成黑洞 3D 模型 assets/models/blackhole.glb（纯程序化，无外部素材）。

v2 结构（全部是真实 3D 几何，由 Scene3D 的 GLB 管线渲染）：
- EventHorizon：纯黑球体，即事件视界（黑洞阴影）；
- AccretionDisk：厚度实体 + 绕 X 轴近边缘倾斜（≈7.7°）的吸积盘。盘面/内缘
  取自程序化 PNG 纹理（u=角向、v=径向；湍流纤维 + 螺旋亮纹 + 白热内缘 +
  多普勒不对称），顶点色负责 HDR 内缘（让 bloom 点亮）与左右不对称；
- PhotonRing：紧贴视界外缘的极细 HDR 冷白环（光子环）；
- LensingHalo：位于远处的宽弧（上亮下暗），模拟引力透镜把远端盘面折到
  阴影上/下方的像。

坐标约定：Scene3D 正交相机沿 -Z 看向原点，模型 +X 屏幕向右、+Y 屏幕向下。
模型以原点为中心，外半径 1（Scene3D 按 size/2 缩放）。

运行：python3 tools/gen_blackhole_glb.py
"""

import json
import math
import os
import struct
import zlib

OUT = os.path.join(os.path.dirname(__file__), "..", "assets", "models", "blackhole.glb")
TAU = math.pi * 2

# —— 实体比例（模型外半径 1.0）——
HORIZON_R = 0.55  # 事件视界（阴影）半径
# 光子环：紧贴阴影边缘的极细亮环（相机平面内）。
RING_IN = 0.545  # 略小于视界半径：把环塞到阴影轮廓之下，避免接缝
RING_OUT = 0.573
RING_Z = 0.25
# 透镜环（主角）：阴影外围宽厚的光环，代表被引力透镜折上/折下的远端盘面。
# 内缘紧接光子环，顶部最宽（远侧像），底部次之，两侧收细。
LENS_IN = 0.565
LENS_Z = 0.2
LENS_W_BASE = 0.024  # 两侧的基本宽度
LENS_W_UP = 0.175  # 上弧（屏幕上方，模型 -Y 侧）加宽
LENS_W_DOWN = 0.100  # 下弧加宽
# 直盘：近边缘视角的厚盘，主要提供横穿阴影下方的细亮带与两侧「杏仁」弧。
DISK_INNER = 0.62  # 吸积盘内半径
DISK_OUTER = 1.00  # 吸积盘外半径
DISK_HALF_H = 0.026  # 盘半厚度
# 盘面绕 X 轴倾角（弧度）。负值 → 近侧（z>0）投影到屏幕下方，远侧在上方。
DISK_TILT = -0.078

# —— 程序化盘面纹理 ——
TEX_W, TEX_H = 768, 192

# 吸积盘径向色带（t=0 内缘，t=1 外缘），鲜艳度在此收敛。
DISK_RAMP = [
    (0.00, (1.00, 0.97, 0.88)),
    (0.03, (1.00, 0.90, 0.66)),
    (0.08, (1.00, 0.78, 0.42)),
    (0.18, (1.00, 0.60, 0.22)),
    (0.34, (0.90, 0.38, 0.09)),
    (0.52, (0.72, 0.22, 0.035)),
    (0.72, (0.44, 0.11, 0.012)),
    (0.88, (0.20, 0.04, 0.003)),
    (1.00, (0.045, 0.008, 0.0)),
]
# 径向暗环（t, 强度）——让盘面有「纹理感」而不是均匀渐变。
DISK_GAPS = [(0.36, 0.45, 0.035), (0.575, 0.5, 0.045), (0.78, 0.6, 0.05)]


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


# —— 噪声（整数哈希 + 值噪声 + fbm）——


def hash2(i, j):
    n = (i * 374761393 + j * 668265263) & 0xFFFFFFFF
    n = ((n ^ (n >> 13)) * 1274126177) & 0xFFFFFFFF
    return ((n ^ (n >> 16)) & 0xFFFFFF) / 0xFFFFFF


def vnoise(x, y):
    xi = math.floor(x)
    yi = math.floor(y)
    xf = x - xi
    yf = y - yi
    u = xf * xf * (3 - 2 * xf)
    v = yf * yf * (3 - 2 * yf)
    a = hash2(xi, yi)
    b = hash2(xi + 1, yi)
    c = hash2(xi, yi + 1)
    d = hash2(xi + 1, yi + 1)
    return lerp(lerp(a, b, u), lerp(c, d, u), v)


def fbm(x, y, octaves=5):
    amp = 0.5
    freq = 1.0
    total = 0.0
    norm = 0.0
    for _ in range(octaves):
        total += amp * vnoise(x * freq, y * freq)
        norm += amp
        amp *= 0.5
        freq *= 2.02
    return total / norm


def disk_texel(t, ang):
    """返回盘面纹理像素 RGB（0..1）。t 径向 0..1，ang 角向弧度。"""
    # 螺旋扭曲：按半径旋转采样域，形成缠绕的螺旋纤维。
    warp = ang + 3.2 * math.log(t + 0.16)
    rad = 1.0 + 5.2 * t
    nx = math.cos(warp) * rad
    ny = math.sin(warp) * rad + 7.3 * t
    f = fbm(nx * 1.35, ny * 1.35, 5)
    # 细亮纹：角向正弦条纹沿对数螺旋走向。
    arm = 0.5 + 0.5 * math.sin(ang * 7.0 + 6.5 * math.log(t + 0.12))
    arm = arm * arm * arm
    # 层叠亮度：基础湍流 + 亮纹 + 一点高频闪烁。
    m = 0.46 + 0.82 * f + 0.42 * arm
    m += 0.13 * (vnoise(nx * 7.5, ny * 7.5) - 0.5)
    # 径向暗环。
    for gt, gk, gw in DISK_GAPS:
        d = abs(t - gt) / gw
        if d < 1.0:
            m *= 1.0 - gk * (1.0 - d * d)
    # 内缘白热增亮 / 外缘收暗。
    m *= 0.55 + 0.75 * math.exp(-t * 1.6)
    base = ramp_color(t)
    return [min(1.0, base[0] * m), min(1.0, base[1] * m), min(1.0, base[2] * m)]


def build_disk_texture_png():
    rows = []
    for py in range(TEX_H):
        t = py / (TEX_H - 1)
        row = bytearray()
        for px in range(TEX_W):
            ang = TAU * px / TEX_W
            r, g, b = disk_texel(t, ang)
            row.extend((int(r * 255 + 0.5), int(g * 255 + 0.5), int(b * 255 + 0.5)))
        rows.append(bytes(row))
    return encode_png(TEX_W, TEX_H, rows)


def encode_png(w, h, rows):
    def chunk(tag, data):
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    raw = b"".join(b"\x00" + r for r in rows)
    ihdr = struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)  # 8-bit RGB
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )


# —— 顶点色 ——


def disk_hdr(t, ang):
    """盘面顶点亮度：内缘接近 bloom 阈值，外缘压暗；左右多普勒不对称（左侧更亮）。"""
    hdr = 0.92 - 0.60 * t
    dop = 1.0 + 0.14 * (-math.cos(ang))
    flick = 0.86 + 0.28 * (0.5 + 0.5 * math.sin(ang * 2.0 + 0.9))
    return hdr * dop * flick


def disk_color4(t, ang):
    m = disk_hdr(t, ang)
    return (m, m, m, 1.0)


# —— 几何 ——


def add_vertex(pos, col, positions, colors, uvs=None, uv=None):
    positions.extend(pos)
    colors.extend(col)
    if uvs is not None and uv is not None:
        uvs.extend(uv)


def grid_indices(rows, cols, base):
    """rows × cols 顶点网格（cols = 每行顶点数），返回索引。"""
    idx = []
    for r in range(rows - 1):
        for c in range(cols - 1):
            a = base + r * cols + c
            b = a + 1
            cc = a + cols
            d = cc + 1
            idx.extend([a, cc, b, b, cc, d])
    return idx


def tilt_point(x, y, z, tilt):
    """绕 X 轴倾斜（模型 +Y 屏幕向下）。"""
    if tilt == 0.0:
        return x, y, z
    ct = math.cos(tilt)
    st = math.sin(tilt)
    return x, y * ct - z * st, y * st + z * ct


def disk_solid(r_in, r_out, half_h, tilt, seg, n_rad):
    """厚壁吸积盘：顶面 + 底面 + 内缘 + 外缘，带 UV（u 角向、v 径向）。"""
    positions, colors, uvs, indices = [], [], [], []

    def ring(r, y, u_first, u_last, cols, v):
        base = len(positions) // 3
        for c in range(cols):
            a = u_first + (u_last - u_first) * (c / (cols - 1))
            x = r * math.cos(a)
            z = r * math.sin(a)
            px, py, pz = tilt_point(x, y, z, tilt)
            colors4 = disk_color4((r - r_in) / (r_out - r_in), a)
            add_vertex((px, py, pz), colors4, positions, colors, uvs, (c / (cols - 1), v))
        return base

    cols = seg + 1
    radius_rows = n_rad
    radii = [r_in + (r_out - r_in) * (i / (radius_rows - 1)) for i in range(radius_rows)]
    # 顶面（y=+h，从内到外）。
    top_base = len(positions) // 3
    for i, r in enumerate(radii):
        ring(r, half_h, 0.0, TAU, cols, 0.004 + 0.992 * (i / (radius_rows - 1)))
    indices.extend(grid_indices(radius_rows, cols, top_base))
    # 底面（y=-h，从内到外）。
    bot_base = len(positions) // 3
    for i, r in enumerate(radii):
        ring(r, -half_h, 0.0, TAU, cols, 0.004 + 0.992 * (i / (radius_rows - 1)))
    indices.extend(grid_indices(radius_rows, cols, bot_base))
    # 内缘圆柱（v≈0 → 白热）。
    inner_base = len(positions) // 3
    ring(r_in, -half_h, 0.0, TAU, cols, 0.015)
    ring(r_in, half_h, 0.0, TAU, cols, 0.015)
    indices.extend(grid_indices(2, cols, inner_base))
    # 外缘圆柱（v≈1 → 暗）。
    outer_base = len(positions) // 3
    ring(r_out, -half_h, 0.0, TAU, cols, 0.985)
    ring(r_out, half_h, 0.0, TAU, cols, 0.985)
    indices.extend(grid_indices(2, cols, outer_base))
    return positions, colors, uvs, indices


def flat_ring(r_in_fn, r_out_fn, z0, seg, n_rad, color_fn, uv_v=None):
    """相机平面（XY）内的环带：内/外半径随角度变化，行内做径向插值。"""
    positions, colors, uvs, indices = [], [], [], []
    cols = seg + 1
    for i in range(n_rad):
        kv = i / (n_rad - 1)
        for c in range(cols):
            a = TAU * c / seg
            r = lerp(r_in_fn(a), r_out_fn(a), kv)
            x = r * math.cos(a)
            y = r * math.sin(a)
            col = color_fn(a, kv)
            add_vertex(
                (x, y, z0),
                col,
                positions,
                colors,
                uvs,
                (c / seg, uv_v if uv_v is not None else 0.004 + 0.992 * kv),
            )
    indices.extend(grid_indices(n_rad, cols, 0))
    return positions, colors, uvs, indices


def smoothstep(e0, e1, x):
    k = min(1.0, max(0.0, (x - e0) / (e1 - e0)))
    return k * k * (3 - 2 * k)


def lens_width(a):
    """透镜环宽度：上弧（模型 -Y，屏幕上方）最宽、下弧次之、两侧收细。"""
    s = math.sin(a)  # 模型 +Y 屏幕向下
    if s < 0:
        return LENS_W_BASE + LENS_W_UP * (abs(s) ** 1.45)
    return LENS_W_BASE + LENS_W_DOWN * (s**1.45)


def lens_color(a, kv):
    """透镜环顶点色：整体保持在 bloom 阈值以下，靠纹理出细节，避免把阴影糊灰。"""
    dop = 1.0 + 0.30 * (-math.cos(a))  # 左侧更亮
    # 顶部整体略强于底部（远侧像更靠近透镜焦散）。
    vert = 1.0 if math.sin(a) < 0 else 0.62
    flick = 0.9 + 0.2 * (0.5 + 0.5 * math.sin(a * 3.0 + 1.1))
    m = (0.76 - 0.34 * kv) * dop * vert * flick
    return (m, m, m, 1.0)


def photon_ring_color(a, _kv):
    # 暖白、基本压在 bloom 阈值（0.78）以下：细线够亮，且不会把阴影糊成灰雾。
    m = 0.70 + 0.06 * abs(math.sin(a))
    dop = 1.0 + 0.14 * (-math.cos(a))  # 左右多普勒不对称（左侧更亮）
    k = m * dop
    return (1.04 * k, 1.01 * k, 0.97 * k, 1.0)


class GlbBuilder:
    def __init__(self):
        self.bin = bytearray()
        self.views = []
        self.accessors = []
        self.meshes = []
        self.materials = []
        self.images = []
        self.textures = []

    def _view(self, data, target=None):
        while len(self.bin) % 4:
            self.bin.append(0)
        off = len(self.bin)
        self.bin.extend(data)
        view = {"buffer": 0, "byteOffset": off, "byteLength": len(data)}
        if target is not None:
            view["target"] = target
        self.views.append(view)
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

    def add_uvs(self, uvs):
        data = struct.pack("<%df" % len(uvs), *uvs)
        view = self._view(data, 34962)
        return self._accessor(view, 5126, len(uvs) // 2, "VEC2")

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

    def add_image(self, png_bytes):
        view = self._view(png_bytes)
        self.images.append({"bufferView": view, "mimeType": "image/png"})
        return len(self.images) - 1

    def add_texture(self, image):
        self.textures.append({"source": image, "sampler": 0})
        return len(self.textures) - 1

    def add_material(self, name, color, double_sided, texture=None):
        pbr = {
            "baseColorFactor": [color[0], color[1], color[2], color[3]],
            "metallicFactor": 0.0,
            "roughnessFactor": 1.0,
        }
        if texture is not None:
            pbr["baseColorTexture"] = {"index": texture}
        self.materials.append(
            {
                "name": name,
                "doubleSided": double_sided,
                "extensions": {"KHR_materials_unlit": {}},
                "pbrMetallicRoughness": pbr,
            }
        )
        return len(self.materials) - 1

    def add_mesh(self, name, positions, indices, material, colors=None, uvs=None):
        attrs = {"POSITION": self.add_positions(positions)}
        if colors is not None:
            attrs["COLOR_0"] = self.add_colors(colors)
        if uvs is not None:
            attrs["TEXCOORD_0"] = self.add_uvs(uvs)
        prim = {
            "attributes": attrs,
            "indices": self.add_indices(indices),
            "material": material,
        }
        self.meshes.append({"name": name, "primitives": [prim]})
        return len(self.meshes) - 1


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


def build():
    b = GlbBuilder()

    tex_idx = b.add_texture(b.add_image(build_disk_texture_png()))

    mat_black = b.add_material("EventHorizon", (0.0, 0.0, 0.0, 1.0), False)
    mat_ring = b.add_material("PhotonRing", (1.0, 1.0, 1.0, 1.0), True)
    mat_lens = b.add_material("LensedDisk", (1.0, 1.0, 1.0, 1.0), True, tex_idx)
    mat_disk = b.add_material("AccretionDisk", (1.0, 1.0, 1.0, 1.0), True, tex_idx)

    # 1) 事件视界球体。
    sp, si = sphere(HORIZON_R)
    mesh_core = b.add_mesh("EventHorizon", sp, si, mat_black)

    # 2) 吸积盘：厚壁实体 + 近边缘倾斜。
    dp, dc, du, di = disk_solid(
        DISK_INNER, DISK_OUTER, DISK_HALF_H, DISK_TILT, seg=192, n_rad=12
    )
    mesh_disk = b.add_mesh("AccretionDisk", dp, di, mat_disk, dc, du)

    # 3) 光子环：极细 HDR 暖白环。
    rp, rc, ru, ri = flat_ring(
        lambda _a: RING_IN,
        lambda _a: RING_OUT,
        RING_Z,
        seg=192,
        n_rad=3,
        color_fn=photon_ring_color,
    )
    mesh_ring = b.add_mesh("PhotonRing", rp, ri, mat_ring, rc, ru)

    # 4) 透镜环：主角，宽厚、带纹理的光环（上宽下窄）。
    hp, hc, hu, hi = flat_ring(
        lambda _a: LENS_IN,
        lambda a: LENS_IN + lens_width(a),
        LENS_Z,
        seg=192,
        n_rad=26,
        color_fn=lens_color,
    )
    mesh_lens = b.add_mesh("LensedDisk", hp, hi, mat_lens, hc, hu)

    gltf = {
        "asset": {"version": "2.0", "generator": "fly/tools/gen_blackhole_glb.py"},
        "extensionsUsed": ["KHR_materials_unlit"],
        "scene": 0,
        "scenes": [{"name": "BlackHole", "nodes": [0]}],
        "nodes": [
            {"name": "BlackHole", "children": [1, 2, 3, 4]},
            {"name": "EventHorizon", "mesh": mesh_core},
            {"name": "AccretionDisk", "mesh": mesh_disk},
            {"name": "PhotonRing", "mesh": mesh_ring},
            {"name": "LensedDisk", "mesh": mesh_lens},
        ],
        "meshes": b.meshes,
        "materials": b.materials,
        "images": b.images,
        "textures": b.textures,
        "samplers": [
            {"magFilter": 9729, "minFilter": 9987, "wrapS": 10497, "wrapT": 33071}
        ],
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
        "wrote %s (%d bytes): %d materials, %d meshes, %d accessors, %d images"
        % (
            target,
            len(out),
            len(gltf["materials"]),
            len(gltf["meshes"]),
            len(gltf["accessors"]),
            len(gltf["images"]),
        )
    )


if __name__ == "__main__":
    main()
