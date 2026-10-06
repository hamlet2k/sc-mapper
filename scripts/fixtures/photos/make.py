#!/usr/bin/env python3
"""Fixture pictures for the picture-preparation tests (scripts/bg-removal.ts, scripts/e2e.mjs). Made from our own built-in
device photo (no vendor photo in the repository):
  stick-on-white.png       the product (built-in glow left out) on a light studio background, 420 px: background removal
  stick-on-white-mask.png  its true product mask (for the IoU check)
  cutout-offcentre.png     a transparent picture with a synthetic product off-centre (known box): format only
  python3 scripts/fixtures/photos/make.py
"""
import os
import numpy as np
from PIL import Image, ImageDraw
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
src = Image.open(os.path.join(ROOT, 'public', 'device-photos', 'tm-t16000m-main.webp')).convert('RGBA')
a = np.asarray(src, np.float32)
prod = (a[..., 3] > 0.62 * 255).astype(np.float32)          # the product; the baked haze / glow stays below that
rgb = a[..., :3]
rng = np.random.default_rng(7)
bg = np.full_like(rgb, 244.0) + rng.normal(0, 1.5, rgb.shape)
h, w = prod.shape
yy = np.mgrid[0:h, 0:w][0] / h
bg -= (yy * 14)[..., None]                                     # soft studio gradient
out = rgb * prod[..., None] + bg * (1 - prod[..., None])
k = 420 / max(w, h)
size = (round(w * k), round(h * k))
Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), 'RGB').resize(size, Image.LANCZOS).save(os.path.join(HERE, 'stick-on-white.png'), optimize=True)
Image.fromarray((prod * 255).astype(np.uint8), 'L').resize(size, Image.BILINEAR).save(os.path.join(HERE, 'stick-on-white-mask.png'), optimize=True)
# synthetic cut-out: 800x600 transparent, product box x 470..629, y 140..499 (160 x 360)
im = Image.new('RGBA', (800, 600), (0, 0, 0, 0))
d = ImageDraw.Draw(im)
d.rounded_rectangle([470, 400, 629, 499], radius=18, fill=(40, 46, 56, 255))     # base
d.rounded_rectangle([530, 180, 569, 410], radius=14, fill=(70, 78, 92, 255))     # stick
d.ellipse([505, 140, 594, 229], fill=(200, 60, 40, 255))                          # grip top
im.save(os.path.join(HERE, 'cutout-offcentre.png'), optimize=True)
print('fixtures written', size)
