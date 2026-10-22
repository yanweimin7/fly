#!/usr/bin/env python3
"""生成太阳系行星 3D 模型（GLB）。

岩石行星：地球 / 金星 / 火星；气态行星：土星（含 3D 环）/ 木星 / 天王星 / 海王星。
球体几何取自既有 GLB 模板，贴图为程序化生成（无外部素材）；土星环是真正的环面网格。
用法：
    python3 tools/gen_solar_planets.py                # 写入 assets/models
    python3 tools/gen_solar_planets.py --preview DIR  # 只输出贴图预览
"""

import json
import math
import os
import random
import struct
import sys
from PIL import Image, ImageDraw, ImageChops, ImageEnhance

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ASSETS = os.path.join(ROOT, "assets", "models")
TEMPLATE = os.path.join(ASSETS, "planet_05.glb")

W, H = 1024, 512


def clamp01(v):
    return 0.0 if v < 0.0 else (1.0 if v > 1.0 else v)


def smooth(t):
    t = clamp01(t)
    return t * t * (3.0 - 2.0 * t)


def mix(c1, c2, t):
    t = clamp01(t)
    return (
        c1[0] + (c2[0] - c1[0]) * t,
        c1[1] + (c2[1] - c1[1]) * t,
        c1[2] + (c2[2] - c1[2]) * t,
    )


def shade(c, k):
    return (clamp01(c[0] * k), clamp01(c[1] * k), clamp01(c[2] * k))


def palette(lut, t):
    """lut: [(pos, (r,g,b)), ...] 升序，分量 0..1。"""
    t = clamp01(t)
    for i in range(len(lut) - 1):
        p0, c0 = lut[i]
        p1, c1 = lut[i + 1]
        if t <= p1:
            k = 0.0 if p1 == p0 else smooth((t - p0) / (p1 - p0))
            return mix(c0, c1, k)
    return lut[-1][1]


def _field_image(rng, gw, gh):
    small = Image.new("L", (gw + 1, gh))
    small.putdata([rng.randrange(256) for _ in range((gw + 1) * gh)])
    big = small.resize((W + 1, H), Image.BICUBIC)
    return big.crop((0, 0, W, H))


def fbm(rng, scales, contrast=1.0):
    ims = [_field_image(rng, gw, gh) for gw, gh in scales]
    acc = ims[0].copy()
    total = 1.0
    for i, im in enumerate(ims[1:], start=1):
        w = 0.5 ** i
        total += w
        acc = Image.blend(acc, im, w / total)
    if contrast != 1.0:
        acc = acc.point(lambda v: int(clamp01(0.5 + (v / 255.0 - 0.5) * contrast) * 255))
    return acc.tobytes()


def lat_of(y):
    return (0.5 - (y + 0.5) / H) * math.pi


def lon_of(x):
    return (x + 0.5) / W * 2.0 * math.pi


# ---------------------------------------------------------------- 行星贴图


def tex_earth(seed=11):
    rng = random.Random(seed)
    cont = fbm(rng, [(6, 3), (12, 6), (24, 12), (48, 24), (96, 48)], contrast=1.9)
    detail = fbm(rng, [(16, 8), (48, 24), (128, 64)], contrast=1.2)
    cloud = fbm(rng, [(10, 5), (24, 12), (64, 32), (128, 64)], contrast=1.4)
    cloud2 = fbm(rng, [(8, 4), (20, 10), (40, 20)], contrast=1.3)

    ocean_deep = (0.030, 0.11, 0.29)
    ocean_shallow = (0.075, 0.33, 0.55)
    desert = (0.76, 0.63, 0.38)
    green = (0.20, 0.42, 0.19)
    dark_green = (0.12, 0.28, 0.13)
    tundra = (0.36, 0.38, 0.28)
    ice = (0.90, 0.94, 0.98)

    out = []
    for y in range(H):
        lat = lat_of(y)
        abslat = abs(lat)
        t = abslat / (math.pi * 0.5)
        for x in range(W):
            i = y * W + x
            c = cont[i] / 255.0
            d = detail[i] / 255.0
            if c <= 0.555:
                depth = clamp01((c - 0.28) / 0.275)
                col = mix(ocean_deep, ocean_shallow, depth * 0.9 + d * 0.1)
                # 浅海偏绿
                col = mix(col, (0.10, 0.42, 0.46), smooth((depth - 0.75) / 0.25) * 0.35)
            else:
                e = clamp01((c - 0.555) / 0.20)
                # 连续气候带：沙漠 -> 温带绿 -> 苔原
                base = mix(desert, green, smooth((t - 0.04) / 0.22))
                base = mix(base, (0.30, 0.42, 0.22), smooth((t - 0.30) / 0.18) * 0.6)
                base = mix(base, dark_green, smooth((d - 0.35) / 0.5) * 0.7)
                base = mix(base, tundra, smooth((t - 0.45) / 0.22))
                base = mix(base, (0.62, 0.55, 0.40), smooth((0.28 - t) / 0.20) * (1.0 - e) * 0.35)
                col = shade(base, 0.84 + e * 0.32)
                # 海岸线浅色
                col = mix(col, (0.66, 0.62, 0.46), clamp01((0.045 - e) / 0.045) * 0.35)
            # 极冠（边缘不规则）
            edge = 1.22 + 0.10 * (d - 0.5)
            cap = smooth((abslat - edge) / 0.16)
            col = mix(col, ice, cap * 0.95)
            # 云层
            cl = smooth((cloud[i] / 255.0 - 0.545) / 0.18) * 0.66
            cl *= smooth((cloud2[i] / 255.0 - 0.40) / 0.22)
            col = mix(col, (0.96, 0.97, 1.0), clamp01(cl))
            out.append((int(clamp01(col[0]) * 255), int(clamp01(col[1]) * 255), int(clamp01(col[2]) * 255)))
    return _finish(out)


def _finish(pixels):
    im = Image.new("RGB", (W, H))
    im.putdata(pixels)
    return im


def tex_venus(seed=23):
    rng = random.Random(seed)
    swirl = fbm(rng, [(8, 4), (20, 10), (48, 24), (96, 48)], contrast=1.2)
    streak = fbm(rng, [(24, 3), (48, 6), (96, 12), (192, 24)], contrast=1.0)
    fine = fbm(rng, [(32, 16), (128, 64)], contrast=0.9)

    lut = [
        (0.00, (0.72, 0.55, 0.28)),
        (0.18, (0.85, 0.72, 0.45)),
        (0.40, (0.94, 0.85, 0.62)),
        (0.62, (0.90, 0.78, 0.50)),
        (0.82, (0.96, 0.90, 0.70)),
        (1.00, (0.80, 0.65, 0.38)),
    ]
    out = []
    for y in range(H):
        lat = lat_of(y)
        v = y / (H - 1)
        for x in range(W):
            i = y * W + x
            s = swirl[i] / 255.0 - 0.5
            f = streak[i] / 255.0 - 0.5
            band = v + 0.05 * s + 0.012 * f
            t = 0.5 + 0.5 * math.sin(band * math.pi * 5.0 + s * 2.6)
            tt = clamp01(t * 0.65 + v * 0.35 + s * 0.10)
            col = palette(lut, tt)
            col = shade(col, 0.94 + (fine[i] / 255.0 - 0.5) * 0.10 + f * 0.06)
            # 极区略暗
            col = mix(col, (0.62, 0.48, 0.24), smooth((abs(lat) - 1.15) / 0.35) * 0.35)
            out.append((int(clamp01(col[0]) * 255), int(clamp01(col[1]) * 255), int(clamp01(col[2]) * 255)))
    return _finish(out)


def tex_mars(seed=37):
    rng = random.Random(seed)
    darkf = fbm(rng, [(7, 4), (14, 7), (30, 15), (70, 35)], contrast=1.7)
    detail = fbm(rng, [(20, 10), (60, 30), (150, 75)], contrast=1.3)
    dust = fbm(rng, [(12, 6), (36, 18), (90, 45)], contrast=1.1)

    base = (0.70, 0.29, 0.12)
    dark = (0.34, 0.16, 0.10)
    bright = (0.82, 0.45, 0.22)
    ice = (0.94, 0.90, 0.85)

    out = []
    for y in range(H):
        lat = lat_of(y)
        abslat = abs(lat)
        for x in range(W):
            i = y * W + x
            d = darkf[i] / 255.0
            det = detail[i] / 255.0
            du = dust[i] / 255.0
            col = mix(base, bright, clamp01(du * 0.9 - 0.15))
            col = mix(col, dark, clamp01((d - 0.55) / 0.30) * 0.85)
            col = shade(col, 0.90 + (det - 0.5) * 0.16)
            cap = smooth((abslat - 1.25) / 0.16)
            col = mix(col, ice, cap * 0.95)
            out.append((int(clamp01(col[0]) * 255), int(clamp01(col[1]) * 255), int(clamp01(col[2]) * 255)))

    im = _finish(out)
    # 陨石坑
    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    for _ in range(150):
        cx = rng.randrange(W)
        cy = rng.randrange(int(H * 0.12), int(H * 0.88))
        r = rng.randint(2, 9)
        a = rng.randint(26, 64)
        draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(40, 20, 12, a))
        draw.ellipse([cx - r + 1, cy - r + 1, cx + r - 1, cy + r - 1], outline=(255, 210, 170, a // 2), width=1)
    return Image.alpha_composite(im.convert("RGBA"), overlay).convert("RGB")


def _band_planet(seed, lut, warp_amt, turb_amt, spot=None, spot_color=None, spot_rim=None,
                 lat_shift=0.0, fine_amt=0.10):
    rng = random.Random(seed)
    warp = fbm(rng, [(5, 3), (11, 6), (22, 11), (44, 22)], contrast=1.1)
    turb = fbm(rng, [(30, 4), (60, 8), (120, 16), (240, 32)], contrast=1.0)
    fine = fbm(rng, [(40, 20), (120, 60), (220, 110)], contrast=1.0)
    streak = fbm(rng, [(20, 4), (50, 10), (110, 22)], contrast=1.2)

    out = []
    for y in range(H):
        v = y / (H - 1)
        for x in range(W):
            i = y * W + x
            wv = warp[i] / 255.0 - 0.5
            tv = turb[i] / 255.0 - 0.5
            sv = streak[i] / 255.0 - 0.5
            band = v + warp_amt * wv + turb_amt * tv + 0.008 * sv
            band = clamp01(band + lat_shift)
            col = palette(lut, band)
            k = 0.92 + (fine[i] / 255.0 - 0.5) * fine_amt + sv * 0.05
            col = shade(col, k)
            if spot is not None:
                su, sv2, sw, sh = spot
                u = x / (W - 1)
                du = (u - su)
                if du > 0.5:
                    du -= 1.0
                if du < -0.5:
                    du += 1.0
                dv = v - sv2 - 0.02 * wv
                q = (du / sw) ** 2 + (dv / sh) ** 2
                if q < 1.9:
                    kk = smooth((1.15 - q) / 0.95)
                    rim = smooth((q - 0.30) / 0.45) * smooth((1.7 - q) / 0.5)
                    if spot_rim is not None:
                        col = mix(col, spot_rim, rim * 0.55)
                    col = mix(col, spot_color, kk * 0.92)
            out.append((int(clamp01(col[0]) * 255), int(clamp01(col[1]) * 255), int(clamp01(col[2]) * 255)))
    return _finish(out)


def tex_jupiter(seed=53):
    lut = [
        (0.000, (0.60, 0.50, 0.40)),
        (0.045, (0.83, 0.76, 0.64)),
        (0.090, (0.93, 0.87, 0.74)),
        (0.135, (0.66, 0.45, 0.27)),
        (0.180, (0.90, 0.82, 0.66)),
        (0.230, (0.57, 0.36, 0.21)),
        (0.270, (0.87, 0.78, 0.61)),
        (0.320, (0.95, 0.91, 0.79)),
        (0.360, (0.72, 0.55, 0.35)),
        (0.420, (0.92, 0.86, 0.71)),
        (0.470, (0.85, 0.76, 0.60)),
        (0.520, (0.96, 0.93, 0.83)),
        (0.575, (0.80, 0.69, 0.51)),
        (0.630, (0.90, 0.82, 0.66)),
        (0.680, (0.68, 0.50, 0.33)),
        (0.730, (0.86, 0.77, 0.61)),
        (0.780, (0.58, 0.40, 0.26)),
        (0.830, (0.82, 0.73, 0.58)),
        (0.890, (0.66, 0.55, 0.42)),
        (1.000, (0.50, 0.43, 0.36)),
    ]
    return _band_planet(seed, lut, 0.030, 0.010,
                        spot=(0.72, 0.655, 0.075, 0.032),
                        spot_color=(0.72, 0.28, 0.16), spot_rim=(0.86, 0.62, 0.42))


def tex_saturn(seed=67):
    lut = [
        (0.000, (0.55, 0.50, 0.38)),
        (0.060, (0.86, 0.79, 0.60)),
        (0.140, (0.93, 0.87, 0.68)),
        (0.230, (0.76, 0.67, 0.48)),
        (0.320, (0.95, 0.90, 0.72)),
        (0.400, (0.82, 0.74, 0.55)),
        (0.470, (0.96, 0.91, 0.75)),
        (0.540, (0.84, 0.76, 0.58)),
        (0.610, (0.94, 0.89, 0.72)),
        (0.690, (0.78, 0.70, 0.52)),
        (0.760, (0.93, 0.88, 0.70)),
        (0.840, (0.74, 0.67, 0.50)),
        (0.910, (0.90, 0.85, 0.67)),
        (1.000, (0.60, 0.55, 0.44)),
    ]
    return ImageEnhance.Contrast(_band_planet(seed, lut, 0.035, 0.012, fine_amt=0.07)).enhance(1.28)


def tex_uranus(seed=79):
    lut = [
        (0.00, (0.56, 0.84, 0.86)),
        (0.14, (0.66, 0.90, 0.92)),
        (0.30, (0.74, 0.94, 0.95)),
        (0.46, (0.70, 0.92, 0.94)),
        (0.60, (0.77, 0.95, 0.96)),
        (0.74, (0.72, 0.93, 0.95)),
        (0.88, (0.68, 0.91, 0.93)),
        (1.00, (0.58, 0.86, 0.89)),
    ]
    return _band_planet(seed, lut, 0.012, 0.003, fine_amt=0.04)


def tex_neptune(seed=97):
    lut = [
        (0.00, (0.12, 0.20, 0.50)),
        (0.10, (0.17, 0.28, 0.63)),
        (0.24, (0.21, 0.35, 0.74)),
        (0.38, (0.15, 0.26, 0.60)),
        (0.50, (0.22, 0.36, 0.76)),
        (0.62, (0.17, 0.28, 0.64)),
        (0.74, (0.23, 0.38, 0.78)),
        (0.86, (0.16, 0.25, 0.58)),
        (1.00, (0.10, 0.17, 0.44)),
    ]
    return _band_planet(seed, lut, 0.024, 0.006, fine_amt=0.08,
                        spot=(0.33, 0.62, 0.070, 0.030),
                        spot_color=(0.08, 0.13, 0.36), spot_rim=(0.32, 0.45, 0.80))


def tex_ring_saturn(seed=101):
    rng = random.Random(seed)
    w, h = 1024, 64
    out = []
    for y in range(h):
        t = y / (h - 1)
        for x in range(w):
            fine = 0.5 + 0.5 * math.sin(t * math.pi * 140.0 + 1.7 * math.sin(t * 37.0))
            grain = rng.random() - 0.5
            a = 0.55 + 0.30 * fine + 0.05 * grain
            # 内侧淡入、外侧淡出
            a *= smooth(t / 0.16) * smooth((1.0 - t) / 0.22)
            # 卡西尼缝
            gap = math.exp(-((t - 0.615) / 0.020) ** 2)
            a *= 1.0 - 0.94 * gap
            thin = math.exp(-((t - 0.36) / 0.012) ** 2)
            a *= 1.0 - 0.45 * thin
            a = clamp01(a)
            c = mix((0.86, 0.80, 0.66), (0.70, 0.62, 0.50), t * 0.7 + 0.2 * fine)
            out.append((int(c[0] * 255), int(c[1] * 255), int(c[2] * 255), int(a * 255)))
    im = Image.new("RGBA", (w, h))
    im.putdata(out)
    return im


# ---------------------------------------------------------------- GLB 打包


def _align(data, n=4):
    while len(data) % n:
        data += b"\0"
    return data


def _load_glb(path):
    raw = open(path, "rb").read()
    jlen = struct.unpack("<I", raw[12:16])[0]
    js = json.loads(raw[20:20 + jlen])
    off = 20 + jlen
    blen = struct.unpack("<I", raw[off:off + 4])[0]
    bin_data = raw[off + 8:off + 8 + blen]
    return js, bin_data


def _read_views(js, bin_data):
    views = []
    for bv in js["bufferViews"]:
        o = bv.get("byteOffset", 0)
        views.append(bytearray(bin_data[o:o + bv["byteLength"]]))
    return views


def _assemble(js, views):
    chunks = []
    for v in views:
        chunks.append(_align(bytes(v)))
    blob = b"".join(chunks)
    off = 0
    for bv, c in zip(js["bufferViews"], chunks):
        bv["byteOffset"] = off
        bv["byteLength"] = len(c.rstrip(b"\0")) if False else len(c)
        # 记录真实长度（补零不算）
        off += len(c)
    js["buffers"] = [{"byteLength": len(blob)}]
    bin_padded = _align(blob)
    js_bytes = json.dumps(js, separators=(",", ":")).encode("utf-8")
    while len(js_bytes) % 4:
        js_bytes += b" "
    total = 12 + 8 + len(js_bytes) + 8 + len(bin_padded)
    out = struct.pack("<III", 0x46546C67, 2, total)
    out += struct.pack("<II", len(js_bytes), 0x4E4F534A) + js_bytes
    out += struct.pack("<II", len(bin_padded), 0x004E4942) + bin_padded
    return out


def _png_bytes(im):
    import io
    buf = io.BytesIO()
    im.save(buf, format="PNG", optimize=True)
    return buf.getvalue()


def _ring_geometry():
    seg, rad = 192, 4
    r0, r1 = 1.25, 2.30
    pos, nor, uv, idx = [], [], [], []
    for i in range(seg + 1):
        a = i / seg * 2.0 * math.pi
        ca, sa = math.cos(a), math.sin(a)
        for j in range(rad + 1):
            t = j / rad
            r = r0 + (r1 - r0) * t
            pos += [r * ca, 0.0, r * sa]
            nor += [0.0, 1.0, 0.0]
            uv += [i / seg, t]
    for i in range(seg):
        for j in range(rad):
            a0 = i * (rad + 1) + j
            b0 = (i + 1) * (rad + 1) + j
            idx += [a0, b0, a0 + 1]
            idx += [a0 + 1, b0, b0 + 1]
    return pos, nor, uv, idx


def _f32(vals):
    return struct.pack("<%df" % len(vals), *vals)


def _u16(vals):
    return struct.pack("<%dH" % len(vals), *vals)


def build_glb(texture, out_path, ring_texture=None):
    js, bin_data = _load_glb(TEMPLATE)
    views = _read_views(js, bin_data)
    img_bv = js["images"][0]["bufferView"]
    views[img_bv] = bytearray(_png_bytes(texture))

    if ring_texture is not None:
        pos, nor, uv, idx = _ring_geometry()
        nv = len(pos) // 3
        base_acc = len(js["accessors"])
        base_bv = len(js["bufferViews"])

        views.append(bytearray(_f32(pos)))
        views.append(bytearray(_f32(nor)))
        views.append(bytearray(_f32(uv)))
        views.append(bytearray(_u16(idx)))
        views.append(bytearray(_png_bytes(ring_texture)))

        xz = pos[0::3] + pos[2::3]
        rmax = max(abs(v) for v in xz)
        js["accessors"] += [
            {"bufferView": base_bv, "componentType": 5126, "count": nv, "type": "VEC3",
             "min": [-rmax, 0.0, -rmax], "max": [rmax, 0.0, rmax]},
            {"bufferView": base_bv + 1, "componentType": 5126, "count": nv, "type": "VEC3"},
            {"bufferView": base_bv + 2, "componentType": 5126, "count": nv, "type": "VEC2"},
            {"bufferView": base_bv + 3, "componentType": 5123, "count": len(idx), "type": "SCALAR"},
        ]
        js["bufferViews"] += [
            {"buffer": 0, "byteLength": len(_f32(pos)), "target": 34962},
            {"buffer": 0, "byteLength": len(_f32(nor)), "target": 34962},
            {"buffer": 0, "byteLength": len(_f32(uv)), "target": 34962},
            {"buffer": 0, "byteLength": len(_u16(idx)), "target": 34963},
            {"buffer": 0, "byteLength": len(views[base_bv + 4])},
        ]
        js["textures"].append({"sampler": 0, "source": 1})
        js["images"].append({"bufferView": base_bv + 4, "mimeType": "image/png", "name": "RingTex"})
        js["materials"].append({
            "name": "Ring",
            "doubleSided": True,
            "alphaMode": "BLEND",
            "pbrMetallicRoughness": {
                "baseColorTexture": {"index": 1},
                "metallicFactor": 0.0,
                "roughnessFactor": 0.95,
            },
        })
        js["meshes"].append({
            "name": "RingMesh",
            "primitives": [{
                "attributes": {"POSITION": base_acc, "NORMAL": base_acc + 1, "TEXCOORD_0": base_acc + 2},
                "indices": base_acc + 3,
                "material": 1,
            }],
        })
        js["nodes"] = [
            {"name": "Body", "children": [1, 2]},
            {"name": "Planet", "mesh": 0},
            {"name": "Ring", "mesh": 1},
        ]

    out = _assemble(js, views)
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "wb") as f:
        f.write(out)
    print("wrote %s (%.0f KB)" % (out_path, len(out) / 1024.0))


PLANETS = [
    ("earth", tex_earth),
    ("venus", tex_venus),
    ("mars", tex_mars),
    ("jupiter", tex_jupiter),
    ("saturn", tex_saturn),
    ("uranus", tex_uranus),
    ("neptune", tex_neptune),
]


def main():
    preview_dir = None
    if "--preview" in sys.argv:
        preview_dir = sys.argv[sys.argv.index("--preview") + 1]
        os.makedirs(preview_dir, exist_ok=True)
        for name, fn in PLANETS:
            im = fn()
            im.save(os.path.join(preview_dir, name + ".png"))
        tex_ring_saturn().save(os.path.join(preview_dir, "ring_saturn.png"))
        print("previews in", preview_dir)
        return

    for name, fn in PLANETS:
        tex = fn()
        ring = tex_ring_saturn() if name == "saturn" else None
        build_glb(tex, os.path.join(ASSETS, name + ".glb"), ring)


if __name__ == "__main__":
    main()
