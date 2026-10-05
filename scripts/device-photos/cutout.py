#!/usr/bin/env python3
"""Device photos for the built-in device templates (offline tool, not part of the app build).

For every view in views.json: cut the product out of its white studio background (rembg / IS-Net mask, or the photo's own alpha),
clean the matte (largest parts only, sharpened edge, white spill removed), then blend it for the dark UI (soft haze behind it,
faint cyan outer glow and rim, blacks lifted a little) and write public/device-photos/<device>-<view>.webp plus
src/lib/devicePhotoSizes.ts (pixel size of every picture, used to place the callouts).

  pip install rembg pillow numpy scipy        (the IS-Net model downloads on first use, ~180 MB)
  python3 scripts/device-photos/cutout.py [--src <photo folder>] [device-view ...] [--preview <dir>]

Photo folder default: /workspace/uploads/sc-templates/templates (vendor product photos, not in the repository).
"""
import json, os, sys
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
args = sys.argv[1:]
def opt(name, default=None):
    if name in args:
        i = args.index(name); v = args[i + 1]; del args[i:i + 2]; return v
    return default
SRC = opt('--src', '/workspace/uploads/sc-templates/templates')
PREVIEW = opt('--preview')
CACHE = opt('--cache', os.path.join(ROOT, '.tmp', 'photo-masks'))
OUT = os.path.join(ROOT, 'public', 'device-photos')
only = set(args)
os.makedirs(OUT, exist_ok=True); os.makedirs(CACHE, exist_ok=True)
if PREVIEW: os.makedirs(PREVIEW, exist_ok=True)

MAX_SIDE = 1300          # longest side of the product itself (the glow padding comes on top)
MIN_SIDE = 900           # small sources are upscaled (Lanczos, at most 1.7x) so they are not blurry next to the others
_session = None
def model_mask(img: Image.Image, key: str) -> np.ndarray:
    p = os.path.join(CACHE, key + '.png')
    if os.path.exists(p):
        m = Image.open(p).convert('L')
        if m.size == img.size: return np.asarray(m, np.float32) / 255
    global _session
    from rembg import new_session, remove
    if _session is None: _session = new_session('isnet-general-use')
    m = remove(img.convert('RGB'), session=_session, only_mask=True).convert('L').resize(img.size, Image.LANCZOS)
    m.save(p)
    return np.asarray(m, np.float32) / 255

def process(v):
    key = f"{v['device']}-{v['view']}"
    src = Image.open(os.path.join(SRC, v['src']))
    if 'crop' in v: src = src.crop(tuple(v['crop']))
    rgba = src.convert('RGBA')
    own = np.asarray(rgba, np.float32)[..., 3] / 255
    rgb = np.asarray(rgba.convert('RGB'), np.float32)
    if (own < 0.5).mean() > 0.05:      # the photo already has a transparent background
        a = own; bg = np.array([255, 255, 255], np.float32); have_alpha = True
    else:
        a = model_mask(rgba, key); have_alpha = False
        border = np.concatenate([rgb[:4].reshape(-1, 3), rgb[-4:].reshape(-1, 3), rgb[:, :4].reshape(-1, 3), rgb[:, -4:].reshape(-1, 3)])
        bg = np.median(border, axis=0)
    # largest parts only (drops logos, stray specks); keep every part at least 3 % of the biggest one
    lab, n = ndimage.label(a > 0.35)
    if n > 1:
        sizes = ndimage.sum(np.ones_like(a), lab, range(1, n + 1))
        keep = np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s >= 0.03 * sizes.max()])
        keep = ndimage.binary_dilation(keep, iterations=6)
        a = a * keep
    if not have_alpha:
        a = np.clip((a - 0.1) / 0.8, 0, 1)                 # crisper edge: the mask is upsampled from 1024 px
        # white spill: un-mix the background from the semi-transparent edge pixels
        aa = np.maximum(a, 0.04)[..., None]
        fg = (rgb - (1 - aa) * bg) / aa
        edge = (a < 0.98)[..., None]
        rgb = np.where(edge, np.clip(fg, 0, 255), rgb)
        # the outermost edge pixels are still a little light: pull them to the darker of their colour and the eroded interior colour
        inner = ndimage.grey_erosion(rgb, size=(5, 5, 1))
        rgb = np.where((a < 0.6)[..., None], np.minimum(rgb, inner + 25), rgb)
    else:
        aa = np.maximum(a, 0.04)[..., None]
    a[a < 0.03] = 0
    ys, xs = np.nonzero(a > 0.03)
    y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    rgb, a = rgb[y0:y1, x0:x1], a[y0:y1, x0:x1]
    h, w = a.shape
    k = min(MAX_SIDE / max(w, h), max(1.0, min(1.7, MIN_SIDE / max(w, h))))
    prod = Image.fromarray(np.dstack([np.clip(rgb, 0, 255), a * 255]).astype(np.uint8), 'RGBA')
    if abs(k - 1) > 0.01: prod = prod.resize((round(w * k), round(h * k)), Image.LANCZOS)
    w, h = prod.size
    P = round(0.05 * max(w, h))                                     # room for the glow
    W, H = w + 2 * P, h + 2 * P
    canvas = np.zeros((H, W, 4), np.float32)
    pa = np.zeros((H, W), np.float32); pa[P:P + h, P:P + w] = np.asarray(prod, np.float32)[..., 3] / 255
    prgb = np.zeros((H, W, 3), np.float32); prgb[P:P + h, P:P + w] = np.asarray(prod, np.float32)[..., :3]
    # 1) haze: a soft blue-cyan pool of light behind the product, fading out well inside the picture
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    r2 = ((xx - W / 2) / (W / 2)) ** 2 + ((yy - H * 0.55) / (H / 2)) ** 2
    haze = np.clip(np.exp(-r2 / (2 * 0.33 ** 2)) - 0.02, 0, 1) * 0.15
    # 2) outer glow: blurred silhouette
    blur = np.asarray(Image.fromarray((pa * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(max(3, 0.012 * max(w, h)))), np.float32) / 255
    glow = np.clip(blur * 1.4, 0, 1) * 0.30
    under_a = np.clip(haze + glow - haze * glow, 0, 1)
    under_rgb = (np.array([38, 110, 150], np.float32) * haze[..., None] + np.array([79, 216, 255], np.float32) * glow[..., None]) / np.maximum(haze + glow, 1e-4)[..., None]
    # 3) the product: blacks lifted slightly, faint cyan rim along the silhouette edge (inside)
    er = ndimage.grey_erosion(pa, size=(5, 5))
    rim = np.clip(pa - np.asarray(Image.fromarray((er * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.5)), np.float32) / 255, 0, 1) * 0.22
    lifted = prgb * 0.93 + 12
    lifted = lifted + (np.array([120, 225, 255], np.float32) - lifted) * rim[..., None]
    out_a = pa + under_a * (1 - pa)
    out_rgb = (lifted * pa[..., None] + under_rgb * (under_a * (1 - pa))[..., None]) / np.maximum(out_a, 1e-4)[..., None]
    img = Image.fromarray(np.dstack([np.clip(out_rgb, 0, 255), np.clip(out_a * 255, 0, 255)]).astype(np.uint8), 'RGBA')
    path = os.path.join(OUT, key + '.webp')
    img.save(path, 'WEBP', quality=84, method=6, alpha_quality=90)
    if PREVIEW:   # on the app background, for checking edges
        bgimg = Image.new('RGBA', img.size, (6, 11, 19, 255)); Image.alpha_composite(bgimg, img).convert('RGB').save(os.path.join(PREVIEW, key + '.png'))
        Image.fromarray(np.dstack([np.clip(prgb, 0, 255), pa * 255]).astype(np.uint8), 'RGBA').save(os.path.join(PREVIEW, key + '-cut.png'))
    print(f'[photos] {key}: {W}x{H}, {os.path.getsize(path) // 1024} KB{" (own alpha)" if have_alpha else ""}', flush=True)
    # product box inside the picture (fractions): the callout spots are given relative to the product
    return key, [W, H, P / W, P / H, w / W, h / H]

views = json.load(open(os.path.join(HERE, 'views.json')))['views']
sizes_path = os.path.join(ROOT, 'src', 'lib', 'devicePhotoSizes.ts')
sizes = {}
if os.path.exists(sizes_path):
    txt = open(sizes_path).read(); sizes = json.loads(txt[txt.index('{'):txt.rindex('}') + 1])
for v in views:
    key = f"{v['device']}-{v['view']}"
    if only and key not in only and v['device'] not in only: continue
    k, s = process(v); sizes[k] = [round(x, 5) for x in s]
with open(sizes_path, 'w') as f:
    f.write('// Generated by scripts/device-photos/cutout.py: do not edit. Per device photo (public/device-photos/<key>.webp):\n'
            '// [width, height, product box x, y, w, h] (box = the product without its glow padding, fractions of the picture).\n'
            'export const DEVICE_PHOTO_SIZES: Record<string, [number, number, number, number, number, number]> = ' + json.dumps(dict(sorted(sizes.items())), indent=0).replace('\n', ' ') + ';\n')
