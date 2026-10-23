"""Builds the jersey colour variants of the two hero renders (assets/meshy/hero-<hero>-<colour>.webp).

Only the lime kit pixels (hue 42-115 degrees, saturated) are recoloured, so skin, hair and shorts stay.
Run: python3 scripts/recolor-heroes.py   (needs Pillow and numpy)
"""
import colorsys, os
import numpy as np
from PIL import Image

HERE = os.path.dirname(__file__)
OUT = os.path.join(HERE, '..', 'assets', 'meshy')
# target hue in degrees; None = white kit
COLOURS = {'red': 5, 'blue': 215, 'orange': 28, 'purple': 265, 'white': None}

def recolour(src, hue):
    im = Image.open(src).convert('RGBA')
    a = np.asarray(im).astype(np.float32) / 255.0
    rgb = a[..., :3]
    mx, mn = rgb.max(-1), rgb.min(-1)
    d = mx - mn + 1e-6
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    h = np.where(mx == r, ((g - b) / d) % 6, np.where(mx == g, (b - r) / d + 2, (r - g) / d + 4)) * 60
    s = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    mask = (h >= 42) & (h <= 115) & (s > 0.18) & (a[..., 3] > 0.05)
    out = a.copy()
    ys, xs = np.nonzero(mask)
    for y, x in zip(ys, xs):
        _, sat, val = colorsys.rgb_to_hsv(*rgb[y, x])
        if hue is None:
            v = min(1.0, val * 1.05)
            out[y, x, :3] = (v * 0.95, v * 0.95, v * 0.97)
        else:
            out[y, x, :3] = colorsys.hsv_to_rgb(hue / 360, min(1.0, max(sat, 0.2) * 1.7), val)
    return Image.fromarray((out * 255).astype(np.uint8), 'RGBA')

for hero in ('street', 'pro'):
    src = os.path.join(OUT, f'hero-{hero}.webp')
    for name, hue in COLOURS.items():
        recolour(src, hue).save(os.path.join(OUT, f'hero-{hero}-{name}.webp'), 'WEBP', quality=82)
