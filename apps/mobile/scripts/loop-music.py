"""Cuts a recorded music track (ElevenLabs Music, 2026-10-29) into a seamless app loop.

    python3 scripts/loop-music.py <menu_loop.mp3>    # ffmpeg must be on PATH

The track runs at a steady 112 BPM with the first beat at 0.265 s. The loop is 40 bars
from beat 56, where the bars before the start and before the end sound most alike. Its
last bar is crossfaded into the bar that comes before the start, so the wrap from the end
back to the start is the same music the track itself plays there.
"""

import os
import subprocess
import sys

BPM, FIRST_BEAT = 112, 0.265
START_BEAT, BARS = 56, 40
# The end lands 49 samples (at 22.05 kHz) late; that lines the two bars up best.
NUDGE = 49 / 22050
OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'audio', 'menu_loop.m4a')

beat = 60 / BPM
start = FIRST_BEAT + START_BEAT * beat
end = start + BARS * 4 * beat + NUDGE
fade = 4 * beat
src = sys.argv[1]
subprocess.run([
    'ffmpeg', '-y', '-loglevel', 'error', '-i', src, '-i', src, '-filter_complex',
    f'[0]atrim={start}:{end},asetpts=PTS-STARTPTS[body];'
    f'[1]atrim={start - fade}:{start},asetpts=PTS-STARTPTS[lead];'
    f'[body][lead]acrossfade=d={fade}:c1=qsin:c2=qsin,volume=-2dB',
    '-ar', '44100', '-c:a', 'aac', '-b:a', '128k', OUT,
], check=True)
print(f'menu_loop: {end - start:.2f} s from {start:.2f} s')
