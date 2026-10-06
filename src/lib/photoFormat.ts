/* Picture preparation for template pages: background removal (mask post-processing, corner-colour flood fill) and the
 * "built-in photo" format (trim, scale, 5 % padding, optional glow), ported from scripts/device-photos/cutout.py so user
 * pictures look like the built-in device photos. Pure functions on RGBA pixel buffers: they run in the browser and in Node
 * (scripts/unit.ts, scripts/bg-removal.ts). The browser side (decoding, canvas scaling, encoding, the model) is photoPrep.ts. */

export interface Px { width: number; height: number; data: Uint8ClampedArray }
export interface Box { x: number; y: number; w: number; h: number }
export type Rgb = [number, number, number];

/** the built-in photos: the product's longest side is at most 1300 px (small ones are upscaled to 900, at most 1.7x), with a
 * 5 % margin on every side for the glow */
export const PRODUCT_MAX_SIDE = 1300;
export const PRODUCT_MIN_SIDE = 900;
export const MAX_UPSCALE = 1.7;
export const PAD_FRAC = 0.05;
/** alpha (0-255) below which a pixel counts as transparent when trimming */
export const ALPHA_TRIM = 8;
/** u2netp input size */
export const MODEL_SIDE = 320;

export const makePx = (width: number, height: number, data?: Uint8ClampedArray): Px => ({ width, height, data: data ?? new Uint8ClampedArray(width * height * 4) });
const clamp = (v: number, lo = 0, hi = 1) => (v < lo ? lo : v > hi ? hi : v);

/** more than 1 % of the picture is (mostly) transparent: it is a cut-out already */
export function hasTransparency(px: Px): boolean {
  const d = px.data, n = px.width * px.height;
  let t = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] < 128) t++;
  return t > n * 0.01;
}

/** median colour of the 4 px border (the studio background of a product photo) */
export function borderColor(px: Px, band = 4): Rgb {
  const { width: w, height: h, data: d } = px;
  const ch: number[][] = [[], [], []];
  const b = Math.max(1, Math.min(band, Math.floor(Math.min(w, h) / 2)));
  const add = (x: number, y: number) => { const i = (y * w + x) * 4; ch[0].push(d[i]); ch[1].push(d[i + 1]); ch[2].push(d[i + 2]); };
  for (let y = 0; y < h; y++) {
    if (y < b || y >= h - b) for (let x = 0; x < w; x++) add(x, y);
    else for (let k = 0; k < b; k++) { add(k, y); add(w - 1 - k, y); }
  }
  const med = (a: number[]) => { a.sort((p, q) => p - q); return a[a.length >> 1] ?? 0; };
  return [med(ch[0]), med(ch[1]), med(ch[2])];
}

/** bounding box of the pixels with alpha > thr (null when everything is transparent) */
export function alphaBox(px: Px, thr = ALPHA_TRIM): Box | null {
  const { width: w, height: h, data: d } = px;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (d[(y * w + x) * 4 + 3] > thr) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** bounding box of the pixels that differ from the background colour by more than tol (opaque pictures) */
export function colorBox(px: Px, bg: Rgb, tol = 24): Box | null {
  const { width: w, height: h, data: d } = px;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4;
    if (Math.max(Math.abs(d[i] - bg[0]), Math.abs(d[i + 1] - bg[1]), Math.abs(d[i + 2] - bg[2])) > tol) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** canvas shapes offered for the formatted picture (width / height), measured on the built-in photos (devicePhotoSizes.ts):
 * stick / grip photos are a little taller than wide (MOZA MTQ grips 990 x 1064, VKB grips ~914 x 990), throttle photos a
 * little wider than tall (X56 990 x 846, MOZA MTP 990 x 842, URSA 1430 x 1243, Virpil VMAX 1062 x 929: median ~1.17) */
export const ASPECT_PRESETS = [
  { id: 'auto', label: 'Auto', hint: 'fits the product + margin' },
  { id: 'stick', label: 'Stick', hint: 'portrait, like the grip photos (990 × 1064)', w: 990, h: 1064 },
  { id: 'throttle', label: 'Throttle', hint: 'wide, like the throttle photos (990 × 846)', w: 990, h: 846 },
  { id: 'square', label: 'Square', hint: '1 : 1', w: 1, h: 1 },
  { id: 'custom', label: 'Custom', hint: 'your own width : height' },
] as const;
export type AspectId = (typeof ASPECT_PRESETS)[number]['id'];
export interface AspectChoice { id: AspectId; w?: number; h?: number }
/** width / height of a choice (undefined = auto: product + margin); custom ratios are kept within 1:5 .. 5:1 */
export function aspectOf(c: AspectChoice): number | undefined {
  const p = ASPECT_PRESETS.find((x) => x.id === c.id);
  const [w, h] = c.id === 'custom' ? [Number(c.w), Number(c.h)] : p && 'w' in p ? [p.w, p.h] : [NaN, NaN];
  if (!(w > 0 && h > 0)) return undefined;
  return Math.min(5, Math.max(0.2, w / h));
}

/** size of the formatted picture for a product of w x h px: scale factor, product size, margin, picture size. With an
 * `aspect` (width / height) the canvas grows on one axis to that shape; the product stays centred */
export function formatSize(w: number, h: number, aspect?: number): { k: number; w: number; h: number; pad: number; padX: number; padY: number; W: number; H: number } {
  const m = Math.max(w, h, 1);
  const k = Math.min(PRODUCT_MAX_SIDE / m, Math.max(1, Math.min(MAX_UPSCALE, PRODUCT_MIN_SIDE / m)));
  const pw = Math.max(1, Math.round(w * k)), ph = Math.max(1, Math.round(h * k));
  const pad = Math.round(PAD_FRAC * Math.max(pw, ph));
  let W = pw + 2 * pad, H = ph + 2 * pad;
  if (aspect && aspect > 0) { if (W / H < aspect) W = Math.round(H * aspect); else H = Math.round(W / aspect); }
  return { k, w: pw, h: ph, pad, padX: Math.floor((W - pw) / 2), padY: Math.floor((H - ph) / 2), W, H };
}

export function cropPx(px: Px, b: Box): Px {
  const out = makePx(b.w, b.h);
  for (let y = 0; y < b.h; y++) out.data.set(px.data.subarray(((b.y + y) * px.width + b.x) * 4, ((b.y + y) * px.width + b.x + b.w) * 4), y * b.w * 4);
  return out;
}

/** the picture placed at (left, top) on a W x H canvas filled with rgba `fill` (W, H default to a uniform `left` margin) */
export function padPx(px: Px, left: number, fill: [number, number, number, number] = [0, 0, 0, 0], top = left, W = px.width + 2 * left, H = px.height + 2 * top): Px {
  const out = makePx(W, H);
  if (fill.some((v) => v)) for (let i = 0; i < out.data.length; i += 4) { out.data[i] = fill[0]; out.data[i + 1] = fill[1]; out.data[i + 2] = fill[2]; out.data[i + 3] = fill[3]; }
  for (let y = 0; y < px.height; y++) out.data.set(px.data.subarray(y * px.width * 4, (y + 1) * px.width * 4), ((y + top) * W + left) * 4);
  return out;
}

/** bilinear resize (premultiplied, so transparent pixels do not bleed their colour); for Node and small pictures, the
 * browser scales with a canvas */
export function resizePx(px: Px, W: number, H: number): Px {
  const { width: w, height: h, data: d } = px;
  const out = makePx(W, H);
  // area-average first when shrinking a lot, so the bilinear step does not alias
  if (w >= 2 * W && h >= 2 * H) return resizePx(halve(px), W, H);
  const sx = w / W, sy = h / H;
  for (let y = 0; y < H; y++) {
    const fy = clamp((y + 0.5) * sy - 0.5, 0, h - 1), y0 = Math.floor(fy), y1 = Math.min(h - 1, y0 + 1), ty = fy - y0;
    for (let x = 0; x < W; x++) {
      const fx = clamp((x + 0.5) * sx - 0.5, 0, w - 1), x0 = Math.floor(fx), x1 = Math.min(w - 1, x0 + 1), tx = fx - x0;
      let r = 0, g = 0, b = 0, a = 0;
      for (const [xx, yy, wt] of [[x0, y0, (1 - tx) * (1 - ty)], [x1, y0, tx * (1 - ty)], [x0, y1, (1 - tx) * ty], [x1, y1, tx * ty]] as const) {
        const i = (yy * w + xx) * 4, al = d[i + 3] * wt;
        r += d[i] * al; g += d[i + 1] * al; b += d[i + 2] * al; a += al;
      }
      const o = (y * W + x) * 4;
      if (a > 0) { out.data[o] = r / a; out.data[o + 1] = g / a; out.data[o + 2] = b / a; }
      out.data[o + 3] = a;
    }
  }
  return out;
}
function halve(px: Px): Px {
  const W = px.width >> 1, H = px.height >> 1, out = makePx(W, H), d = px.data, w = px.width;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { const i = ((2 * y + dy) * w + 2 * x + dx) * 4, al = d[i + 3]; r += d[i] * al; g += d[i + 1] * al; b += d[i + 2] * al; a += al; }
    const o = (y * W + x) * 4;
    if (a > 0) { out.data[o] = r / a; out.data[o + 1] = g / a; out.data[o + 2] = b / a; }
    out.data[o + 3] = a / 4;
  }
  return out;
}

/* ------------------------------------------------------------- mask helpers (Float32Array, 0..1, row-major) */
/** bilinear resize of a mask */
export function resizeMask(m: Float32Array, mw: number, mh: number, W: number, H: number): Float32Array {
  const out = new Float32Array(W * H), sx = mw / W, sy = mh / H;
  for (let y = 0; y < H; y++) {
    const fy = clamp((y + 0.5) * sy - 0.5, 0, mh - 1), y0 = Math.floor(fy), y1 = Math.min(mh - 1, y0 + 1), ty = fy - y0;
    for (let x = 0; x < W; x++) {
      const fx = clamp((x + 0.5) * sx - 0.5, 0, mw - 1), x0 = Math.floor(fx), x1 = Math.min(mw - 1, x0 + 1), tx = fx - x0;
      out[y * W + x] = (m[y0 * mw + x0] * (1 - tx) + m[y0 * mw + x1] * tx) * (1 - ty) + (m[y1 * mw + x0] * (1 - tx) + m[y1 * mw + x1] * tx) * ty;
    }
  }
  return out;
}
/** stretch to 0..1 */
export function normalizeMask(m: Float32Array): Float32Array {
  let lo = Infinity, hi = -Infinity;
  for (const v of m) { if (v < lo) lo = v; if (v > hi) hi = v; }
  const out = new Float32Array(m.length), s = hi > lo ? 1 / (hi - lo) : 0;
  for (let i = 0; i < m.length; i++) out[i] = (m[i] - lo) * s;
  return out;
}
/** separable min (erode) / max (dilate) filter with a (2r+1) square window */
export function rankFilter(a: Float32Array, w: number, h: number, r: number, max: boolean): Float32Array {
  const tmp = new Float32Array(a.length), out = new Float32Array(a.length);
  const pick = max ? Math.max : Math.min;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = a[y * w + x];
    for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r); k++) v = pick(v, a[y * w + k]);
    tmp[y * w + x] = v;
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = tmp[y * w + x];
    for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r); k++) v = pick(v, tmp[k * w + x]);
    out[y * w + x] = v;
  }
  return out;
}
/** gaussian blur approximated by three box blurs (as PIL's GaussianBlur) */
export function gaussBlur(a: Float32Array, w: number, h: number, sigma: number): Float32Array {
  const n = 3, wIdeal = Math.sqrt((12 * sigma * sigma) / n + 1);
  let wl = Math.floor(wIdeal); if (wl % 2 === 0) wl--;
  const m = Math.round((12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4));
  let cur = a;
  for (let i = 0; i < n; i++) { const r = ((i < m ? wl : wl + 2) - 1) / 2; cur = boxBlur(cur, w, h, r); }
  return cur;
}
function boxBlur(a: Float32Array, w: number, h: number, r: number): Float32Array {
  if (r < 1) return a;
  const tmp = new Float32Array(a.length), out = new Float32Array(a.length), k = 1 / (2 * r + 1);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let acc = 0;
    for (let x = -r; x <= r; x++) acc += a[row + clamp(x, 0, w - 1)];
    for (let x = 0; x < w; x++) { tmp[row + x] = acc * k; acc += a[row + Math.min(w - 1, x + r + 1)] - a[row + Math.max(0, x - r)]; }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += tmp[clamp(y, 0, h - 1) * w + x];
    for (let y = 0; y < h; y++) { out[y * w + x] = acc * k; acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x]; }
  }
  return out;
}
/** keep the largest parts of a mask only (drops logos and specks): every part at least `minFrac` of the biggest one, grown by
 * `grow` px so soft edges stay */
export function keepMainParts(a: Float32Array, w: number, h: number, thr = 0.35, minFrac = 0.03, grow = 6): Float32Array {
  const lab = new Int32Array(a.length), sizes: number[] = [0];
  const stack: number[] = [];
  for (let s = 0; s < a.length; s++) {
    if (lab[s] || a[s] <= thr) continue;
    const id = sizes.length; let n = 0;
    lab[s] = id; stack.push(s);
    while (stack.length) {
      const p = stack.pop()!; n++;
      const x = p % w, y = (p - x) / w;
      if (x > 0 && !lab[p - 1] && a[p - 1] > thr) { lab[p - 1] = id; stack.push(p - 1); }
      if (x < w - 1 && !lab[p + 1] && a[p + 1] > thr) { lab[p + 1] = id; stack.push(p + 1); }
      if (y > 0 && !lab[p - w] && a[p - w] > thr) { lab[p - w] = id; stack.push(p - w); }
      if (y < h - 1 && !lab[p + w] && a[p + w] > thr) { lab[p + w] = id; stack.push(p + w); }
    }
    sizes.push(n);
  }
  if (sizes.length <= 2) return a;
  const big = Math.max(...sizes);
  const keepId = sizes.map((s) => s >= minFrac * big);
  const keep = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) keep[i] = lab[i] && keepId[lab[i]] ? 1 : 0;
  const grown = grow > 0 ? rankFilter(keep, w, h, grow, true) : keep;
  const out = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] * grown[i];
  return out;
}

/** model input: the picture at 320 x 320, scaled by its brightest value and ImageNet-normalised, CHW (as rembg feeds u2net) */
export function modelInput(px: Px, side = MODEL_SIDE): Float32Array {
  const s = resizePx(flatten(px, [255, 255, 255]), side, side);
  const n = side * side, out = new Float32Array(3 * n);
  let mx = 1e-6;
  for (let i = 0; i < n; i++) mx = Math.max(mx, s.data[i * 4], s.data[i * 4 + 1], s.data[i * 4 + 2]);
  const mean = [0.485, 0.456, 0.406], std = [0.229, 0.224, 0.225];
  for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) out[c * n + i] = (s.data[i * 4 + c] / mx - mean[c]) / std[c];
  return out;
}
/** the picture over a solid colour (opaque) */
export function flatten(px: Px, bg: Rgb): Px {
  const out = makePx(px.width, px.height), d = px.data;
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3] / 255;
    out.data[i] = d[i] * a + bg[0] * (1 - a); out.data[i + 1] = d[i + 1] * a + bg[1] * (1 - a); out.data[i + 2] = d[i + 2] * a + bg[2] * (1 - a); out.data[i + 3] = 255;
  }
  return out;
}

/** corner-colour flood fill: the background is everything connected to the picture border whose colour is within `tol` of the
 * border colour; edges get a 1 px soft step. Fallback when the model cannot run. */
export function floodFillMask(px: Px, tol = 30): Float32Array {
  const { width: w, height: h, data: d } = px;
  const bg = borderColor(px);
  const near = (p: number) => { const i = p * 4; return d[i + 3] < 16 || Math.max(Math.abs(d[i] - bg[0]), Math.abs(d[i + 1] - bg[1]), Math.abs(d[i + 2] - bg[2])) <= tol; };
  const isBg = new Uint8Array(w * h), stack: number[] = [];
  const seed = (p: number) => { if (!isBg[p] && near(p)) { isBg[p] = 1; stack.push(p); } };
  for (let x = 0; x < w; x++) { seed(x); seed((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { seed(y * w); seed(y * w + w - 1); }
  while (stack.length) {
    const p = stack.pop()!, x = p % w, y = (p - x) / w;
    if (x > 0) seed(p - 1); if (x < w - 1) seed(p + 1); if (y > 0) seed(p - w); if (y < h - 1) seed(p + w);
  }
  const m = new Float32Array(w * h);
  for (let i = 0; i < m.length; i++) m[i] = isBg[i] ? 0 : 1;
  return boxBlur(m, w, h, 1).map((v, i) => (isBg[i] ? 0 : clamp((v - 0.2) / 0.6)));
}

/** apply a cut-out mask: matte cleaned (main parts, crisper edge for the 320 px model mask), background colour un-mixed from
 * the semi-transparent edge (no white fringe on the dark UI) */
export function applyMask(px: Px, mask: Float32Array, opts: { crisp: boolean }): Px {
  const { width: w, height: h, data: d } = px;
  const bg = borderColor(px);
  let a = keepMainParts(mask, w, h);
  if (opts.crisp) a = a.map((v) => clamp((v - 0.1) / 0.8));
  const n = w * h, rgb = new Float32Array(n * 3);
  for (let p = 0; p < n; p++) {
    const al = Math.max(a[p], 0.04);
    for (let c = 0; c < 3; c++) { const v = d[p * 4 + c]; rgb[p * 3 + c] = a[p] < 0.98 ? clamp((v - (1 - al) * bg[c]) / al, 0, 255) : v; }
  }
  // the outermost edge pixels are still a little light: pull them to the darker of their colour and the eroded interior colour
  const out = makePx(w, h);
  const chan = [0, 1, 2].map((c) => { const ch = new Float32Array(n); for (let p = 0; p < n; p++) ch[p] = rgb[p * 3 + c]; return rankFilter(ch, w, h, 2, false); });
  for (let p = 0; p < n; p++) {
    for (let c = 0; c < 3; c++) out.data[p * 4 + c] = a[p] < 0.6 ? Math.min(rgb[p * 3 + c], chan[c][p] + 25) : rgb[p * 3 + c];
    out.data[p * 4 + 3] = a[p] < 0.03 ? 0 : a[p] * 255;
  }
  return out;
}

/** the built-in look, baked in (cutout.py): soft haze behind the product, faint cyan outer glow and rim, blacks lifted.
 * `px` is the padded picture (product alpha, transparent margin) */
export function bakeLook(px: Px, productSide = Math.max(px.width, px.height) / (1 + 2 * PAD_FRAC)): Px {
  const { width: W, height: H, data: d } = px;
  const n = W * H, pa = new Float32Array(n);
  for (let p = 0; p < n; p++) pa[p] = d[p * 4 + 3] / 255;
  const side = productSide;
  const blur = gaussBlur(pa, W, H, Math.max(3, 0.012 * side));
  const er = gaussBlur(rankFilter(pa, W, H, 2, false), W, H, 1.5);
  const out = makePx(W, H);
  for (let p = 0; p < n; p++) {
    const x = p % W, y = (p - x) / W;
    const r2 = ((x - W / 2) / (W / 2)) ** 2 + ((y - H * 0.55) / (H / 2)) ** 2;
    const haze = clamp(Math.exp(-r2 / (2 * 0.33 ** 2)) - 0.02) * 0.15;
    const glow = clamp(blur[p] * 1.4) * 0.3;
    const ua = clamp(haze + glow - haze * glow), hs = Math.max(haze + glow, 1e-4);
    const rim = clamp(pa[p] - er[p]) * 0.22;
    const oa = pa[p] + ua * (1 - pa[p]), os = Math.max(oa, 1e-4);
    const under = [(38 * haze + 79 * glow) / hs, (110 * haze + 216 * glow) / hs, (150 * haze + 255 * glow) / hs];
    const tint = [120, 225, 255];
    for (let c = 0; c < 3; c++) {
      let lifted = d[p * 4 + c] * 0.93 + 12;
      lifted += (tint[c] - lifted) * rim;
      out.data[p * 4 + c] = (lifted * pa[p] + under[c] * ua * (1 - pa[p])) / os;
    }
    out.data[p * 4 + 3] = oa * 255;
  }
  return out;
}

/** where the product goes on the output canvas (the framing tool): output px = picture px × k + (x, y) */
export interface Framing { k: number; x: number; y: number }
/** what the framing works with: the trimmed product (`box`, in picture px), the output canvas W × H (product + 5 % margin,
 * grown to the chosen aspect), the initial framing (product centred at the built-in scale = "Fit") */
export interface FramePlan { mode: 'alpha' | 'opaque'; bg: Rgb | null; box: Box; W: number; H: number; pad: number; padX: number; padY: number; framing: Framing }
/** framing zoom range, relative to the initial (Fit) scale */
export const FRAME_MIN_REL = 0.25, FRAME_MAX_REL = 4;
export function planFrame(px: Px, aspect?: number): FramePlan {
  const alpha = hasTransparency(px);
  const bg = alpha ? null : borderColor(px);
  const box = (alpha ? alphaBox(px) : colorBox(px, bg!)) ?? { x: 0, y: 0, w: px.width, h: px.height };
  const f = formatSize(box.w, box.h, aspect);
  return { mode: alpha ? 'alpha' : 'opaque', bg, box, W: f.W, H: f.H, pad: f.pad, padX: f.padX, padY: f.padY, framing: { k: f.k, x: f.padX - box.x * f.k, y: f.padY - box.y * f.k } };
}
/** the product's rect on the output canvas for a framing (whole px), and whether part of it is cut off by the canvas edges */
export function productRect(plan: Pick<FramePlan, 'box' | 'W' | 'H'>, fr: Framing): Box & { cropped: boolean } {
  const { box } = plan;
  const x = Math.round(box.x * fr.k + fr.x), y = Math.round(box.y * fr.k + fr.y), w = Math.max(1, Math.round(box.w * fr.k)), h = Math.max(1, Math.round(box.h * fr.k));
  return { x, y, w, h, cropped: x < 0 || y < 0 || x + w > plan.W || y + h > plan.H };
}
/** framing clamped to the zoom range (scale kept around the canvas centre) */
export function clampFraming(plan: Pick<FramePlan, 'framing' | 'W' | 'H'>, fr: Framing): Framing {
  const k = Math.min(plan.framing.k * FRAME_MAX_REL, Math.max(plan.framing.k * FRAME_MIN_REL, fr.k));
  if (k === fr.k) return fr;
  const cx = plan.W / 2, cy = plan.H / 2, r = k / fr.k;
  return { k, x: cx - (cx - fr.x) * r, y: cy - (cy - fr.y) * r };
}
/** zoom the product by `factor` around the output point (ox, oy) (it stays under the cursor) */
export function zoomFraming(plan: Pick<FramePlan, 'framing' | 'W' | 'H'>, fr: Framing, factor: number, ox: number, oy: number): Framing {
  const k = Math.min(plan.framing.k * FRAME_MAX_REL, Math.max(plan.framing.k * FRAME_MIN_REL, fr.k * factor)), r = k / fr.k;
  return { k, x: ox - (ox - fr.x) * r, y: oy - (oy - fr.y) * r };
}
/** render a framing: exactly what lies inside the W × H canvas (the product scaled and placed, cut off at the edges; the rest
 * transparent, or the background colour of an opaque picture), then the built-in glow (cut-outs only) */
export function framePhoto(px: Px, plan: FramePlan, fr: Framing, opts: { look: boolean; resize?: (p: Px, w: number, h: number) => Px }): Px {
  const { box, W, H, bg } = plan;
  const r = productRect(plan, fr);
  const out = padPx(makePx(0, 0), 0, bg ? [bg[0], bg[1], bg[2], 255] : [0, 0, 0, 0], 0, W, H);
  const x0 = Math.max(0, r.x), x1 = Math.min(W, r.x + r.w), y0 = Math.max(0, r.y), y1 = Math.min(H, r.y + r.h);
  if (x1 > x0 && y1 > y0) {
    const prod = cropPx(px, box);
    const scaled = r.w === box.w && r.h === box.h ? prod : (opts.resize ?? resizePx)(prod, r.w, r.h);
    for (let y = y0; y < y1; y++) {
      const sy = y - r.y;
      out.data.set(scaled.data.subarray((sy * r.w + (x0 - r.x)) * 4, (sy * r.w + (x1 - r.x)) * 4), (y * W + x0) * 4);
    }
  }
  return plan.mode === 'alpha' && opts.look ? bakeLook(out, Math.max(r.w, r.h)) : out;
}
export interface FormatResult { px: Px; mode: 'alpha' | 'opaque'; box: Box; k: number; pad: number; padX: number; padY: number; product: { w: number; h: number } }
/** format like the built-in photos: trim (transparent edges, or the plain background of an opaque picture), scale the product
 * (longest side 900-1300 px), add the 5 % margin (transparent, or the background colour), grow the canvas to the chosen
 * `aspect` (product centred) and optionally add the built-in glow (cut-outs only). `resize` scales the trimmed product (a
 * canvas in the browser, resizePx in Node). */
export function formatPhoto(px: Px, opts: { look: boolean; aspect?: number; resize?: (p: Px, w: number, h: number) => Px }): FormatResult {
  const plan = planFrame(px, opts.aspect);
  const r = productRect(plan, plan.framing);
  const out = framePhoto(px, plan, plan.framing, opts);
  return { px: out, mode: plan.mode, box: plan.box, k: plan.framing.k, pad: plan.pad, padX: plan.padX, padY: plan.padY, product: { w: r.w, h: r.h } };
}
