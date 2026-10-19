#!/usr/bin/env python3
"""生成 fly 游戏的音效 WAV（纯合成，无外部素材/版权问题）。

用法：python3 tools/gen_sfx.py
输出：js/assets/audio/*.wav（16-bit PCM 单声道 44.1kHz）

设计原则：短促、低延迟、频谱干净——游戏里每秒可能触发多次，
所以每个音效控制在 0.1~1.2s，并且做了软包络避免爆音。
"""

import math
import os
import struct
import wave

SR = 44100
OUT = os.path.join(os.path.dirname(__file__), "..", "assets", "audio")


def env(n, total, attack=0.005, release=0.35):
    """软起音 + 指数衰减包络（秒为单位）。"""
    a = int(SR * attack)
    t = n / SR
    dur = total
    if n < a:
        return n / max(1, a)
    left = dur - t
    if left <= 0:
        return 0.0
    return math.exp(-left / release)


def write_wav(name, samples, gain=0.6):
    peak = max(1e-9, max(abs(s) for s in samples))
    scale = gain / peak
    frames = bytearray()
    for s in samples:
        v = int(max(-1.0, min(1.0, s * scale)) * 32767)
        frames += struct.pack("<h", v)
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, name)
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(bytes(frames))
    print(f"  {name:<14} {len(samples)/SR:.2f}s  {os.path.getsize(path)/1024:.1f}KB")


def sine(f, t):
    return math.sin(2 * math.pi * f * t)


def saw(f, t):
    p = (f * t) % 1.0
    return 2 * p - 1


def square(f, t, duty=0.5):
    return 1.0 if (f * t) % 1.0 < duty else -1.0


def noise(seed=12345):
    """确定性伪随机噪声（保证每次生成的 WAV 完全一致）。"""
    x = seed
    while True:
        x = (1103515245 * x + 12345) & 0x7FFFFFFF
        yield (x / 0x3FFFFFFF) - 1.0


# —— 各音效 ——————————————————————————————————————————————

def sfx_eat():
    """吞噬陨石：短促上滑三角波 'blip'，清脆轻快。"""
    dur = 0.12
    n = int(SR * dur)
    out = []
    for i in range(n):
        t = i / SR
        f = 520 + 900 * (i / n)          # 520 → 1420 Hz 上滑
        out.append(saw(f, t) * env(i, dur, 0.004, 0.05))
    return out


def sfx_explode():
    """撞击爆炸：白噪声爆裂 + 低频下坠，短促有力。"""
    dur = 0.45
    n = int(SR * dur)
    g = noise(99)
    out = []
    for i in range(n):
        t = i / SR
        nse = next(g)
        boom = sine(120 - 70 * (i / n), t)
        out.append((nse * 0.8 + boom * 0.6) * env(i, dur, 0.002, 0.13))
    return out


def sfx_damage():
    """受伤：低频方波下滑 + 一点噪声毛刺，沉重不祥。"""
    dur = 0.35
    n = int(SR * dur)
    g = noise(7)
    out = []
    for i in range(n):
        t = i / SR
        f = 300 - 170 * (i / n)          # 300 → 130 Hz
        out.append((square(f, t, 0.35) * 0.7 + next(g) * 0.25) * env(i, dur, 0.004, 0.12))
    return out


def sfx_suck():
    """被黑洞吸入：持续下坠的长音，螺旋感（颤音）营造失重。"""
    dur = 1.1
    n = int(SR * dur)
    out = []
    for i in range(n):
        t = i / SR
        p = i / n
        f = 700 * (1 - 0.72 * p)                     # 700 → 196 Hz
        vib = 1 + 0.06 * math.sin(2 * math.pi * (6 + 8 * p) * t)
        out.append((sine(f * vib, t) * 0.8 + saw(f * 0.5 * vib, t) * 0.25) * env(i, dur, 0.08, 0.55))
    return out


def sfx_evolve():
    """进化：四音上行琶音，明亮，标志「新等级达成」。"""
    dur = 0.62
    n = int(SR * dur)
    notes = [523.25, 659.25, 783.99, 1046.50]        # C5 E5 G5 C6
    seg = n // len(notes)
    out = []
    for i in range(n):
        t = i / SR
        k = min(len(notes) - 1, i // seg)
        local = (i - k * seg) / SR
        f = notes[k]
        # 叠一个五度让音色更亮
        v = sine(f, t) * 0.7 + sine(f * 1.5, t) * 0.3
        # 每段自己的衰减，接缝处不爆音
        e = math.exp(-local / 0.18) if i % seg < seg else 0.0
        out.append(v * e * min(1.0, t / 0.01))
    return out


def sfx_win():
    """胜利：大三和弦上行 + 明亮泛音，长尾。"""
    dur = 1.2
    n = int(SR * dur)
    out = []
    chord = [523.25, 659.25, 783.99, 1046.50, 1318.51]
    for i in range(n):
        t = i / SR
        p = i / n
        # 逐个加入和弦音（琶音式铺开）
        active = min(len(chord), int(p * 8) + 1)
        v = sum(sine(chord[k], t) for k in range(active)) / max(1, active)
        v += 0.25 * sine(chord[-1] * 2, t) * p
        out.append(v * env(i, dur, 0.06, 0.5))
    return out


def sfx_gameover():
    """死亡：下行大三度转小调，沉闷收尾。"""
    dur = 0.9
    n = int(SR * dur)
    notes = [392.00, 349.23, 293.66, 220.00]        # G4 F4 D4 A3
    seg = n // len(notes)
    out = []
    for i in range(n):
        t = i / SR
        k = min(len(notes) - 1, i // seg)
        local = (i - k * seg) / SR
        v = saw(notes[k], t) * 0.45 + sine(notes[k] * 0.5, t) * 0.55
        out.append(v * math.exp(-local / 0.22) * min(1.0, t / 0.01))
    return out


def sfx_tap():
    """UI 点击：极短的高频 tick。"""
    dur = 0.06
    n = int(SR * dur)
    out = []
    for i in range(n):
        t = i / SR
        out.append(sine(1400, t) * env(i, dur, 0.001, 0.018))
    return out


SOUNDS = {
    "eat.wav": (sfx_eat, 0.55),
    "explode.wav": (sfx_explode, 0.7),
    "damage.wav": (sfx_damage, 0.7),
    "suck.wav": (sfx_suck, 0.65),
    "evolve.wav": (sfx_evolve, 0.7),
    "win.wav": (sfx_win, 0.7),
    "gameover.wav": (sfx_gameover, 0.7),
    "tap.wav": (sfx_tap, 0.5),
}

if __name__ == "__main__":
    print(f"生成音效 → {os.path.normpath(OUT)}")
    for name, (fn, gain) in SOUNDS.items():
        write_wav(name, fn(), gain)
    print("完成")