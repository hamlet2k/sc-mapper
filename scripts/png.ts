// Minimal PNG decoder for test fixtures (8-bit grey / RGB / RGBA / grey+alpha, non-interlaced): enough for the pictures in
// scripts/fixtures/photos, so the Node tests need no image library.
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import type { Px } from '../src/lib/photoFormat';

export function readPng(path: string): Px {
  const b = readFileSync(path);
  if (b.readUInt32BE(0) !== 0x89504e47) throw new Error(`${path}: not a PNG`);
  let o = 8, w = 0, h = 0, type = 0, depth = 0, interlace = 0;
  const idat: Buffer[] = [];
  let pal: Buffer | null = null, trns: Buffer | null = null;
  while (o < b.length) {
    const len = b.readUInt32BE(o), kind = b.toString('ascii', o + 4, o + 8), data = b.subarray(o + 8, o + 8 + len);
    if (kind === 'IHDR') { w = data.readUInt32BE(0); h = data.readUInt32BE(4); depth = data[8]; type = data[9]; interlace = data[12]; }
    else if (kind === 'PLTE') pal = data;
    else if (kind === 'tRNS') trns = data;
    else if (kind === 'IDAT') idat.push(data);
    else if (kind === 'IEND') break;
    o += 12 + len;
  }
  if (depth !== 8 || interlace) throw new Error(`${path}: only 8-bit non-interlaced PNGs`);
  const ch = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>)[type];
  if (!ch) throw new Error(`${path}: colour type ${type}`);
  const raw = inflateSync(Buffer.concat(idat)), stride = w * ch, img = new Uint8Array(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= ch ? img[y * stride + x - ch] : 0, up = y ? img[(y - 1) * stride + x] : 0, c = y && x >= ch ? img[(y - 1) * stride + x - ch] : 0;
      let v = line[x];
      if (f === 1) v += a; else if (f === 2) v += up; else if (f === 3) v += (a + up) >> 1;
      else if (f === 4) { const p = a + up - c, pa = Math.abs(p - a), pb = Math.abs(p - up), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? up : c; }
      img[y * stride + x] = v & 255;
    }
  }
  const out = new Uint8ClampedArray(w * h * 4);
  for (let p = 0; p < w * h; p++) {
    const s = img.subarray(p * ch, p * ch + ch);
    if (type === 0) out.set([s[0], s[0], s[0], 255], p * 4);
    else if (type === 2) out.set([s[0], s[1], s[2], 255], p * 4);
    else if (type === 4) out.set([s[0], s[0], s[0], s[1]], p * 4);
    else if (type === 6) out.set(s, p * 4);
    else { const i = s[0]; out.set([pal![i * 3], pal![i * 3 + 1], pal![i * 3 + 2], trns && i < trns.length ? trns[i] : 255], p * 4); }
  }
  return { width: w, height: h, data: out };
}
