#!/usr/bin/env python3
"""Render anchor checks from the actual built-ins (Pillow and node/tsx required).

python3 scripts/device-photos/check.py builtin-id [builtin-id ...]
Writes chk-panel-<id>-<view>.png in the current repository directory.
Photo placement matches DeviceCanvas's object-contain geometry, including both
horizontal and vertical padding. Red dots and labels are diagnostic overlays.
"""
import json
from pathlib import Path
import subprocess
import sys
import textwrap
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
source = """
import { DEVICE_TEMPLATES } from './src/lib/deviceTemplates.ts';
console.log(JSON.stringify(DEVICE_TEMPLATES.filter(t => process.argv.slice(1).includes(t.id))));
"""
if len(sys.argv) < 2:
    raise SystemExit('Pass at least one built-in template id')
templates = json.loads(subprocess.check_output(
    ['node', '--import', 'tsx', '--input-type=module', '-e', source, *sys.argv[1:]], cwd=ROOT))
if {t['id'] for t in templates} != set(sys.argv[1:]):
    raise SystemExit('Unknown template id')
font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 18)
small = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 14)
for template in templates:
    for view in template['views']:
        W, H = view['width'], view['height']
        photo = Image.open(ROOT / 'public' / view['image'].lstrip('/')).convert('RGBA')
        # CSS object-contain: preserve aspect, centre the entire photo in the view.
        scale = min(W / photo.width, H / photo.height)
        rw, rh = round(photo.width * scale), round(photo.height * scale)
        canvas = Image.new('RGBA', (W, H), (6, 11, 19, 255))
        canvas.alpha_composite(photo.resize((rw, rh), Image.Resampling.LANCZOS), ((W-rw)//2, (H-rh)//2))
        draw = ImageDraw.Draw(canvas)
        boxes = []
        for c in [c for c in template['callouts'] if c['view'] == view['id']]:
            ax, ay = c['anchor']['x'] * W, c['anchor']['y'] * H
            bx, by = c['box']['x'] * W, c['box']['y'] * H
            label_w = round(2 * min(bx, W-bx) - 28)
            label = textwrap.wrap(c.get('label', c['id']), width=max(15, label_w//11))
            inputs = textwrap.wrap(c['kind'] + ': ' + ', '.join(c['inputs']), width=max(15, label_w//9))
            label_h = len(label)*24 + len(inputs)*19 + 20
            rect = (round(bx-label_w/2), round(by-label_h/2), round(bx+label_w/2), round(by+label_h/2))
            for name, r in boxes:
                if rect[0] < r[2] and r[0] < rect[2] and rect[1] < r[3] and r[1] < rect[3]:
                    raise RuntimeError(f"Overlapping labels: {template['id']}/{name} and {c['id']}")
            boxes.append((c['id'], rect))
            draw.line((ax, ay, bx, by), fill='#ff5555', width=2)
            draw.ellipse((ax-5, ay-5, ax+5, ay+5), fill='#ff2222', outline='white', width=1)
            draw.rounded_rectangle(rect, radius=6, fill='#07101f', outline='#ff5555', width=1)
            y = rect[1]+9
            for line in label:
                draw.text((rect[0]+9,y), line, font=font, fill='#f4fbff'); y += 24
            for line in inputs:
                draw.text((rect[0]+9,y), line, font=small, fill='#ff9999'); y += 19
        draw.text((12,8), template['name']+' — '+view['label'], font=font, fill='#bfefff')
        output = ROOT / f"chk-panel-{template['id']}-{view['id']}.png"
        canvas.convert('RGB').save(output)
        print(output)
