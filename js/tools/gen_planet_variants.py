#!/usr/bin/env python3
"""为每种天体的 GLB 生成多个贴图变体，避免同屏同类天体千篇一律。

做法：读取基础 GLB（单球体 + 内嵌 512² PNG），在它的风格/配色基础上做：
  1. 经度随机旋转（equirect 横向环绕，无缝）；
  2. 纵向缩放（气态行星的带数/带宽因此不同）；
  3. 多尺度、严格水平周期的正弦域扭曲；
  4. HSV 分通道调色（色相/饱和/明度小幅偏移）；
  5. 气态行星随机叠加风暴椭圆；岩质行星叠加陨石坑。
球体网格与材质参数原样保留，只替换 texture，重新打包 GLB。

输出：planet_XX_b.glb / planet_XX_c.glb（基础 planet_XX.glb 保留为变体 a）。
用法：python3 tools/gen_planet_variants.py [--variants 2] [--dir assets/models]
"""
from __future__ import annotations

import argparse
import io
import json
import math
import random
import struct
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

W = H = 512

# 各阶段的基础贴图风格（与 STAGES 对应）。
GAS_STAGES = {"planet_05"}
ROCK_STAGES = {"planet_01", "planet_02", "planet_03", "planet_04"}


def read_glb(path: Path):
    data = path.read_bytes()
    if data[:4] != b"glTF":
        raise ValueError(f"{path} 不是 GLB")
    json_len = struct.unpack_from("<I", data, 12)[0]
    doc = json.loads(data[20 : 20 + json_len])
    bin_len, bin_type = struct.unpack_from("<II", data, 20 + json_len)
    assert bin_type == 0x004E4942, "BIN chunk 类型异常"
    bin_data = data[20 + json_len + 8 : 20 + json_len + 8 + bin_len]
    return doc, bin_data


def extract_image(doc, bin_data: bytes) -> Image.Image:
    image = doc["images"][0]
    view = doc["bufferViews"][image["bufferView"]]
    off = view.get("byteOffset", 0)
    blob = bin_data[off : off + view["byteLength"]]
    return Image.open(io.BytesIO(blob)).convert("RGB")


def write_glb(path: Path, doc: dict, bin_data: bytes) -> None:
    json_bytes = json.dumps(doc, separators=(",", ":"), ensure_ascii=False).encode()
    json_bytes += b" " * ((4 - len(json_bytes) % 4) % 4)
    bin_bytes = bin_data + b"\x00" * ((4 - len(bin_data) % 4) % 4)
    total = 12 + 8 + len(json_bytes) + 8 + len(bin_bytes)
    with path.open("wb") as f:
        f.write(struct.pack("<4sII", b"glTF", 2, total))
        f.write(struct.pack("<II", len(json_bytes), 0x4E4F534A))
        f.write(json_bytes)
        f.write(struct.pack("<II", len(bin_bytes), 0x004E4942))
        f.write(bin_bytes)


def replace_image(doc: dict, bin_data: bytes, png: bytes) -> tuple[dict, bytes]:
    doc = json.loads(json.dumps(doc))
    image = doc["images"][0]
    index = image["bufferView"]
    view = doc["bufferViews"][index]
    off = view.get("byteOffset", 0)
    assert index == len(doc["bufferViews"]) - 1, "贴图不是最后一个 bufferView"
    new_bin = bin_data[:off] + png
    view["byteLength"] = len(png)
    doc["buffers"][0]["byteLength"] = len(new_bin)
    return doc, new_bin


def palette_of(image: Image.Image, n: int = 5) -> list[tuple[int, int, int]]:
    q = image.quantize(colors=n, method=Image.Quantize.MEDIANCUT).convert("RGB")
    counts = q.getcolors(W * H)
    counts.sort(key=lambda c: -c[0])
    return [c for _, c in counts]


def wave_field(rng: random.Random):
    """fx/fy/mod 三个 512² 场；x 方向频率取整数，保证左右接缝无痕。"""
    n = W * H
    fields = []
    for freq_max in (3, 3, 2):
        field = [0.0] * n
        for _ in range(3):
            kx = rng.randint(1, freq_max)
            ky = rng.randint(1, 3)
            px = rng.random() * 2 * math.pi
            py = rng.random() * 2 * math.pi
            a = (0.5 + 0.5 * rng.random()) / 1.6
            sx = [math.sin(2 * math.pi * kx * x / W + px) for x in range(W)]
            env = [
                0.55 + 0.45 * math.sin(math.pi * ky * y / H + py) for y in range(H)
            ]
            for y in range(H):
                e = a * env[y]
                row = y * W
                for x in range(W):
                    field[row + x] += sx[x] * e
        fields.append(field)
    return fields[0], fields[1], fields[2]


def roll_x(image: Image.Image, dx: int) -> Image.Image:
    dx %= W
    if dx == 0:
        return image
    out = Image.new("RGB", (W, H))
    out.paste(image.crop((dx, 0, W, H)), (0, 0))
    out.paste(image.crop((0, 0, dx, H)), (W - dx, 0))
    return out


def tone(image: Image.Image, hue: int, sat: float, val: float) -> Image.Image:
    h, s, v = image.convert("HSV").split()
    h = h.point(lambda i: (i + hue) % 256)
    s = s.point(lambda i: max(0, min(255, round(i * sat))))
    v = v.point(lambda i: max(0, min(255, round(i * val))))
    return Image.merge("HSV", (h, s, v)).convert("RGB")


def warp(
    image: Image.Image, rng: random.Random, amp: float, y_scale: float
) -> Image.Image:
    src = image.load()
    fx, fy, mod = wave_field(rng)
    out = Image.new("RGB", (W, H))
    dst = out.load()
    for y in range(H):
        row = y * W
        sy = (y + 0.5) * y_scale + fy[row] * amp * 0.7
        y0 = max(0, min(H - 1, int(sy)))
        y1 = min(H - 1, y0 + 1)
        wy = sy - int(sy)
        for x in range(W):
            sx = (x + fx[row + x] * amp) % W
            x0 = int(sx)
            x1 = (x0 + 1) % W
            wx = sx - x0
            c00 = src[x0, y0]
            c10 = src[x1, y0]
            c01 = src[x0, y1]
            c11 = src[x1, y1]
            m = 1.0 + mod[row + x] * 0.12
            dst[x, y] = (
                max(0, min(255, round(((c00[0] * (1 - wx) + c10[0] * wx) * (1 - wy) +
                                       (c01[0] * (1 - wx) + c11[0] * wx) * wy) * m))),
                max(0, min(255, round(((c00[1] * (1 - wx) + c10[1] * wx) * (1 - wy) +
                                       (c01[1] * (1 - wx) + c11[1] * wx) * wy) * m))),
                max(0, min(255, round(((c00[2] * (1 - wx) + c10[2] * wx) * (1 - wy) +
                                       (c01[2] * (1 - wx) + c11[2] * wx) * wy) * m))),
            )
    return out


def add_storms(image: Image.Image, rng: random.Random, colors) -> Image.Image:
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    for _ in range(rng.randint(2, 4)):
        cx = rng.uniform(0, W)
        cy = rng.uniform(H * 0.18, H * 0.82)
        rx = rng.uniform(14, 46)
        ry = rx * rng.uniform(0.35, 0.7)
        color = rng.choice(colors)
        draw.ellipse(
            (cx - rx, cy - ry, cx + rx, cy + ry),
            fill=(color[0], color[1], color[2], 150),
        )
    layer = layer.filter(ImageFilter.GaussianBlur(6))
    return Image.alpha_composite(image.convert("RGBA"), layer).convert("RGB")


def add_craters(image: Image.Image, rng: random.Random) -> Image.Image:
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    for _ in range(rng.randint(4, 8)):
        cx = rng.uniform(0, W)
        cy = rng.uniform(H * 0.12, H * 0.88)
        r = rng.uniform(6, 20)
        ry = r * rng.uniform(0.6, 1.0)
        draw.ellipse(
            (cx - r, cy - ry, cx + r, cy + ry),
            fill=(35, 30, 28, 110),
        )
        draw.arc(
            (cx - r, cy - ry, cx + r, cy + ry),
            start=200,
            end=340,
            fill=(255, 245, 230, 70),
            width=2,
        )
    layer = layer.filter(ImageFilter.GaussianBlur(2))
    return Image.alpha_composite(image.convert("RGBA"), layer).convert("RGB")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--variants", type=int, default=2, help="每个基础模型额外生成几份")
    ap.add_argument("--dir", default="assets/models")
    ap.add_argument("--seed", type=int, default=20261021)
    args = ap.parse_args()
    base_dir = Path(args.dir)
    if not base_dir.is_dir():
        print(f"目录不存在: {base_dir}", file=sys.stderr)
        return 1
    suffixes = "bcdefgh"[: args.variants]
    for path in sorted(base_dir.glob("planet_*.glb")):
        stem = path.stem
        if stem[-2:] in (f"_{s}" for s in "bcdefgh"):
            continue
        doc, bin_data = read_glb(path)
        texture = extract_image(doc, bin_data)
        palette = palette_of(texture)
        is_gas = stem in GAS_STAGES
        is_rock = stem in ROCK_STAGES
        for i, suffix in enumerate(suffixes):
            rng = random.Random(f"{args.seed}:{stem}:{suffix}")
            tilt = 1.0 if i == 0 else -1.0  # b/c 两组风格方向相反
            v = roll_x(texture, rng.randint(0, W - 1))
            hue = int(rng.uniform(6, 16) * tilt) if is_rock else int(rng.uniform(1, 4) * tilt)
            sat = 1.0 + rng.uniform(0.06, 0.16) * tilt
            val = 1.0 + rng.uniform(0.04, 0.12) * -tilt
            v = tone(v, hue, sat, val)
            y_scale = rng.uniform(0.82, 1.18)
            amp = 26.0 + 12.0 * i + rng.uniform(0, 8)
            v = warp(v, rng, amp, y_scale)
            if is_gas:
                v = add_storms(v, rng, palette[1:4])
            elif is_rock:
                v = add_craters(v, rng)
            buf = io.BytesIO()
            v.save(buf, format="PNG", optimize=True)
            vdoc, vbin = replace_image(doc, bin_data, buf.getvalue())
            out = path.with_name(f"{stem}_{suffix}.glb")
            write_glb(out, vdoc, vbin)
            print(f"{out.name}  {out.stat().st_size / 1024:.0f} KB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
