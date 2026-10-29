"""Cuts the recorded sound effects (ElevenLabs, 2026-10-29) into the app's m4a files.

    python3 scripts/cut-sfx.py <folder with the .mp3 files>    # ffmpeg must be on PATH

Each source is trimmed to the one hit or phrase the game needs, faded out, made mono
and peak-normalised to -3 dBFS, with its mean level capped at -16 dB so a long bed does
not drown the short hits. The chain works in float, so the stereo-to-mono downmix has
the same gain when measuring and when encoding. Play volume is then set per sound in src/audio/sounds.ts.
To replace a sound, generate a new file with the same name and run this again.
"""

import os
import re
import subprocess
import sys

OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'audio')

# name: (start s, length s, fade-out s), measured from the waveforms of the sources.
CUTS = {
    'count_tick': (0.0, 0.25, 0.08),
    'star_pop_1': (0.0, 0.9, 0.4),
    'star_pop_2': (0.40, 0.8, 0.4),
    'star_pop_3': (0.0, 1.1, 0.5),
    'badge_shine': (0.0, 1.6, 0.5),
    'record_fanfare': (0.0, 2.2, 0.5),
    'card_pop': (0.05, 0.3, 0.1),
    'sling_pull': (1.95, 0.95, 0.2),
    'can_hit': (0.10, 1.1, 0.4),
    'glass_crack': (0.55, 0.85, 0.4),
    'wall_thud': (0.40, 0.45, 0.15),
    'lane_whoosh': (0.07, 0.58, 0.2),
    'crate_bump': (1.98, 0.67, 0.2),
    'shop_bell': (0.36, 1.24, 0.4),
    'stair_step': (0.93, 0.22, 0.08),
    'out_of_breath': (1.0, 1.3, 0.3),
    'ball_steal': (0.14, 0.6, 0.15),
    'dribble_past': (1.15, 0.85, 0.3),
    'phone_ping': (0.0, 1.2, 0.2),
    'energy_charge': (0.0, 1.3, 0.4),
    'coin_count': (0.54, 1.36, 0.35),
    'gem_sparkle': (0.0, 1.3, 0.5),
}

PEAK_DB = -3.0
MEAN_CAP_DB = -16.0


def levels(src: str, chain: str) -> tuple[float, float]:
    """(mean, max) volume in dB of `src` after the filter chain."""
    r = subprocess.run(['ffmpeg', '-hide_banner', '-i', src, '-af', f'{chain},volumedetect', '-f', 'null', '-'],
                       capture_output=True, text=True, check=True)
    mean = float(re.search(r'mean_volume: (-?[\d.]+) dB', r.stderr).group(1))
    peak = float(re.search(r'max_volume: (-?[\d.]+) dB', r.stderr).group(1))
    return mean, peak


for name, (start, length, fade) in CUTS.items():
    src = os.path.join(sys.argv[1], f'{name}.mp3')
    chain = (f'atrim={start}:{start + length},asetpts=PTS-STARTPTS,aformat=sample_fmts=flt:channel_layouts=mono,'
             f'afade=t=in:d=0.005,afade=t=out:st={length - fade}:d={fade}')
    mean, peak = levels(src, chain)
    gain = min(PEAK_DB - peak, MEAN_CAP_DB - mean)
    dst = os.path.join(OUT, f'{name}.m4a')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', src, '-af', f'{chain},volume={gain:.2f}dB',
                    '-ar', '44100', '-c:a', 'aac', '-b:a', '96k', dst], check=True)
    print(f'{name}: {length:.2f} s, {gain:+.1f} dB')
