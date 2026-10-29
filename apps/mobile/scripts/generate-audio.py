#!/usr/bin/env python3
"""Synthesizes every StreetBorn sound effect and music loop from code.

Nothing is sampled, so there is no license to track. The output is a first
pass that can be swapped file by file for recorded sounds later (keep the ids
in src/audio/sounds.ts).

    pip install numpy scipy      # ffmpeg must be on PATH
    python3 apps/mobile/scripts/generate-audio.py
"""
import os
import subprocess
import tempfile
import wave

import numpy as np
from scipy import signal

SR = 44100
OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'audio')
rng = np.random.default_rng(7)  # fixed seed: reruns produce identical files


# ---------- building blocks ----------

def t(dur):
    return np.arange(int(SR * dur)) / SR


def env(n, attack=0.005, release=None, curve=6.0):
    """Fast attack, exponential decay over n samples."""
    a = max(1, int(SR * attack))
    e = np.exp(-curve * np.linspace(0, 1, n))
    e[:a] *= np.linspace(0, 1, a)
    if release:
        r = min(n, int(SR * release))
        e[-r:] *= np.linspace(1, 0, r)
    return e


def sine(f, dur, phase=0.0):
    f = np.broadcast_to(f, t(dur).shape) if np.ndim(f) else np.full(t(dur).shape, f)
    return np.sin(2 * np.pi * np.cumsum(f) / SR + phase)


def tri(f, dur):
    ph = np.cumsum(np.full(t(dur).shape, f) if not np.ndim(f) else f) / SR
    return 2 * np.abs(2 * (ph % 1) - 1) - 1


def soft_square(f, dur, k=4):
    """Band-limited-ish square: first k odd harmonics."""
    x = np.zeros(int(SR * dur))
    for h in range(1, 2 * k, 2):
        x += sine(np.asarray(f) * h, dur) / h
    return x * 0.8


def noise(dur):
    return rng.standard_normal(int(SR * dur))


def bp(x, lo, hi, order=2):
    sos = signal.butter(order, [lo, hi], btype='band', fs=SR, output='sos')
    return signal.sosfilt(sos, x)


def lp(x, f, order=2):
    return signal.sosfilt(signal.butter(order, f, btype='low', fs=SR, output='sos'), x)


def hp(x, f, order=2):
    return signal.sosfilt(signal.butter(order, f, btype='high', fs=SR, output='sos'), x)


def pad(x, dur):
    out = np.zeros(int(SR * dur))
    out[:len(x)] = x[:len(out)]
    return out


def mix(total, *parts):
    """parts: (start_seconds, signal)"""
    out = np.zeros(int(SR * total))
    for start, x in parts:
        i = int(SR * start)
        n = min(len(x), len(out) - i)
        out[i:i + n] += x[:n]
    return out


def norm(x, peak=0.7):
    m = np.max(np.abs(x)) or 1.0
    return x / m * peak


def write(name, x, stereo=False, kbps=96):
    x = np.clip(x, -1, 1)
    if stereo and x.ndim == 1:
        x = np.stack([x, x], axis=1)
    ch = 2 if stereo else 1
    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as f:
        path = f.name
    with wave.open(path, 'wb') as w:
        w.setnchannels(ch)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((x * 32767).astype('<i2').tobytes())
    dst = os.path.join(OUT, f'{name}.m4a')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', path, '-c:a', 'aac', '-b:a', f'{kbps}k', dst], check=True)
    os.unlink(path)
    print(f'{name:16s} {os.path.getsize(dst) / 1024:6.1f} KB')


# ---------- UI ----------

def ui_sounds():
    d = 0.07
    write('tap', norm(sine(1500, d) * env(int(SR * d), 0.002, curve=9) + 0.3 * sine(3000, d) * env(int(SR * d), 0.001, curve=14), 0.35))

    d = 0.11
    f = np.linspace(700, 1050, int(SR * d))
    write('tab', norm(tri(f, d) * env(int(SR * d), 0.003, curve=7), 0.35))

    d = 0.1
    f = np.linspace(900, 560, int(SR * d))
    write('back', norm(tri(f, d) * env(int(SR * d), 0.003, curve=7), 0.32))

    a = soft_square(330, 0.09) * env(int(SR * 0.09), 0.002, curve=3)
    b = soft_square(247, 0.16) * env(int(SR * 0.16), 0.002, curve=4)
    write('error', norm(lp(mix(0.26, (0, a), (0.1, b)), 2500), 0.4))

    # Classic two-note coin: B5 then E6.
    a = soft_square(988, 0.07, k=3) * env(int(SR * 0.07), 0.001, curve=1)
    b = soft_square(1319, 0.32, k=3) * env(int(SR * 0.32), 0.001, curve=5)
    write('coin', norm(lp(mix(0.4, (0, a), (0.07, b)), 6000), 0.45))

    d = 0.6
    x = np.zeros(int(SR * d))
    for i, k in enumerate([0, 4, 7, 12, 16]):
        f = 523.25 * 2 ** (k / 12)
        n = tri(f, 0.32) * env(int(SR * 0.32), 0.002, curve=5) + 0.25 * sine(2 * f, 0.32) * env(int(SR * 0.32), 0.002, curve=8)
        x = mix(d, (0, x), (i * 0.06, n))
    write('levelup', norm(x, 0.5))

    # Unlock / reward shimmer: bright detuned partials with a slow swell.
    d = 0.9
    x = sum(sine(f * (1 + 0.004 * j), d) / (j + 1) for j, f in enumerate([1046.5, 1568, 2093, 2637]))
    e = np.minimum(1, t(d) / 0.08) * np.exp(-4 * t(d))
    write('unlock', norm(x * e, 0.4))


# ---------- match ----------

def match_sounds():
    def kick(strength):
        d = 0.18 + 0.08 * strength
        f = 60 + 140 * np.exp(-t(d) * 30)
        body = sine(f, d) * env(int(SR * d), 0.001, curve=7)
        click = hp(noise(0.02), 2000) * env(int(SR * 0.02), 0.0005, curve=10) * (0.4 + 0.3 * strength)
        leather = bp(noise(d), 300, 1400) * env(int(SR * d), 0.001, curve=14) * 0.5
        return norm(body + pad(click, d) + leather, 0.6 + 0.2 * strength)
    write('kick', kick(0))
    write('kick_power', kick(1))

    # Net ripple: filtered noise swish with a soft tail.
    d = 0.6
    swish = bp(noise(d), 1200, 6000) * (np.minimum(1, t(d) / 0.03) * np.exp(-6 * t(d)))
    thud = sine(90 + 40 * np.exp(-t(d) * 20), d) * env(int(SR * d), 0.002, curve=12) * 0.6
    write('net', norm(swish + thud, 0.55))

    # Post: inharmonic metal partials.
    d = 1.0
    x = sum(sine(f, d) * np.exp(-t(d) * dec) * a for f, dec, a in [(523, 4, 1), (1231, 6, 0.7), (2089, 9, 0.5), (3311, 13, 0.3)])
    x += pad(hp(noise(0.015), 3000) * 0.6, d)
    write('post', norm(x, 0.5))

    # Keeper save: glove slap + body.
    d = 0.3
    slap = bp(noise(d), 500, 3500) * env(int(SR * d), 0.0008, curve=22)
    body = sine(110 + 60 * np.exp(-t(d) * 25), d) * env(int(SR * d), 0.002, curve=10) * 0.7
    write('save', norm(slap + body, 0.6))

    # Pea whistle: ~2.9 kHz tone, warbled by the pea (~28 Hz).
    def whistle(dur):
        tt = t(dur)
        f = 2900 + 120 * np.sin(2 * np.pi * 28 * tt)
        am = 0.7 + 0.3 * np.sin(2 * np.pi * 28 * tt + 1)
        x = sine(f, dur) * am + 0.08 * bp(noise(dur), 2500, 3500)
        e = np.minimum(1, tt / 0.02) * np.minimum(1, (dur - tt) / 0.04)
        return x * e
    write('whistle_start', norm(whistle(0.55), 0.4))
    write('whistle_end', norm(mix(1.6, (0, whistle(0.22)), (0.32, whistle(0.22)), (0.64, whistle(0.85))), 0.4))


def crowd_bed(dur, brightness=1.0):
    """Many voices: band-limited noise layers with independent slow swells."""
    x = np.zeros(int(SR * dur))
    tt = t(dur)
    for lo, hi, gain in [(180, 500, 1.0), (400, 1100, 0.8), (900, 2400, 0.45 * brightness), (2000, 4500, 0.15 * brightness)]:
        layer = bp(noise(dur), lo, hi)
        swell = np.ones_like(tt)
        for _ in range(3):
            rate = rng.uniform(0.15, 0.6)
            swell += 0.25 * np.sin(2 * np.pi * rate * tt + rng.uniform(0, 6.3))
        x += layer * swell * gain
    return x


def crowd_sounds():
    # Seamless 8 s ambience: render longer, then crossfade the tail into the head.
    d, fade = 8.0, 1.0
    raw = crowd_bed(d + fade)
    n, f = int(SR * d), int(SR * fade)
    loop = raw[:n].copy()
    w = np.linspace(0, 1, f)
    loop[:f] = raw[:f] * w + raw[n:n + f] * (1 - w)
    write('crowd_loop', norm(loop, 0.35), stereo=True, kbps=96)

    d = 2.6
    tt = t(d)
    cheer = crowd_bed(d, brightness=2.2)
    e = np.minimum(1, tt / 0.25) ** 0.6 * np.exp(-0.9 * np.maximum(0, tt - 0.6))
    write('crowd_cheer', norm(cheer * e, 0.6), stereo=True)

    # Groan: "oooh" whose formant falls, then fades.
    d = 1.6
    tt = t(d)
    x = noise(d)
    out = np.zeros_like(x)
    seg = int(SR * 0.05)
    for i in range(0, len(x), seg):
        c = 700 - 300 * (i / len(x))
        out[i:i + seg] = bp(x[max(0, i - seg):i + seg], c * 0.6, c * 1.4)[-len(x[i:i + seg]):]
    out = lp(out, 1500)
    e = np.minimum(1, tt / 0.15) * np.exp(-2.2 * np.maximum(0, tt - 0.3))
    write('crowd_groan', norm(out * e, 0.5), stereo=True)


# ---------- music ----------

BPM = 92
BEAT = 60 / BPM
NOTE = {n: i for i, n in enumerate(['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'])}


def hz(name, octave):
    return 440 * 2 ** ((NOTE[name] + 12 * (octave + 1) - 69) / 12)


def keys(freqs, dur):
    """Soft electric-piano-ish chord."""
    x = np.zeros(int(SR * dur))
    for f in freqs:
        x += sine(f, dur) + 0.35 * sine(2 * f, dur) * np.exp(-t(dur) * 3) + 0.12 * sine(3 * f, dur) * np.exp(-t(dur) * 5)
    e = np.minimum(1, t(dur) / 0.01) * np.exp(-t(dur) * 1.3) * np.minimum(1, (dur - t(dur)) / 0.05)
    return x * e / len(freqs)


def drum_kick():
    d = 0.35
    return sine(45 + 90 * np.exp(-t(d) * 25), d) * env(int(SR * d), 0.001, curve=6)


def drum_snare():
    d = 0.25
    return (bp(noise(d), 1500, 7000) * 0.7 + sine(190, d) * 0.4) * env(int(SR * d), 0.001, curve=12)


def drum_hat(open_=False):
    d = 0.2 if open_ else 0.05
    return hp(noise(d), 7000) * env(int(SR * d), 0.0005, curve=8 if open_ else 18) * 0.35


def song(chords, bars_per_chord, swing, energy):
    bars = len(chords) * bars_per_chord
    total = bars * 4 * BEAT
    music = np.zeros(int(SR * total))
    drums = np.zeros_like(music)
    bass = np.zeros_like(music)
    for bi in range(bars):
        root, quality = chords[bi // bars_per_chord]
        third = 3 if quality == 'm' else 4
        tones = [hz(root, 3) * 2 ** (k / 12) for k in (0, third, 7, 10 if quality == 'm' else 11)]
        bar = bi * 4 * BEAT
        music = mix(total, (0, music), (bar, keys(tones, 2 * BEAT)), (bar + 2 * BEAT, keys(tones, 2 * BEAT) * 0.8))
        b = hz(root, 1)
        for beat, f, length in [(0, b, 1.5), (1.5, b, 0.5), (2, b * 1.5, 1), (3, b * 2 ** (10 / 12), 1)]:
            n = tri(f, length * BEAT) * env(int(SR * length * BEAT), 0.005, curve=2.5)
            bass = mix(total, (0, bass), (bar + beat * BEAT, lp(n, 600)))
        for step in range(8):
            off = step * BEAT / 2 + (swing * BEAT / 2 if step % 2 else 0)
            parts = [(bar + off, drum_hat(open_=(step == 7 and energy > 1)))]
            if step in (0, 5) or (energy > 1 and step == 3):
                parts.append((bar + off, drum_kick()))
            if step in (2, 6):
                parts.append((bar + off, drum_snare()))
            drums = mix(total, (0, drums), *parts)
    music = lp(music, 2200 if energy == 1 else 3500)
    left = 0.55 * music + 0.6 * drums + 0.7 * bass
    # A touch of stereo width: delay the keys slightly on the right.
    delayed = np.concatenate([np.zeros(int(SR * 0.012)), music])[:len(music)]
    right = 0.55 * delayed + 0.6 * drums + 0.7 * bass
    return np.stack([left, right], axis=1)


def music():
    # menu_loop.m4a is a recorded track now, cut by scripts/loop-music.py.
    match = song([('E', 'm'), ('C', 'M'), ('G', 'M'), ('D', 'M')], 1, swing=0.0, energy=2)
    write('match_loop', norm(match, 0.55), stereo=True, kbps=128)

    # Victory: rising major fanfare.
    d = 1.8
    x = np.zeros(int(SR * d))
    for i, (k, length) in enumerate([(0, 0.15), (4, 0.15), (7, 0.15), (12, 1.2)]):
        f = 392 * 2 ** (k / 12)
        n = soft_square(f, length + 0.3, k=5) * env(int(SR * (length + 0.3)), 0.01, curve=3)
        x = mix(d, (0, x), (i * 0.15, lp(n, 3500)))
    x = mix(d, (0, x), (0.45, keys([392, 493.88, 587.33, 783.99], 1.3) * 0.8))
    write('victory_sting', norm(x, 0.55), stereo=True, kbps=128)

    d = 1.8
    x = np.zeros(int(SR * d))
    for i, k in enumerate([7, 3, 0]):
        f = 293.66 * 2 ** (k / 12)
        x = mix(d, (0, x), (i * 0.35, keys([f, f * 1.5], 0.9)))
    write('defeat_sting', norm(lp(x, 1800), 0.45), stereo=True, kbps=128)


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    ui_sounds()
    match_sounds()
    crowd_sounds()
    music()
