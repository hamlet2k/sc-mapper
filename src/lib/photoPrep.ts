/* Browser side of the picture preparation (PhotoPrep dialog): decode an uploaded file into pixels, run the background removal
 * (lazy-loaded model, corner-colour flood fill as fallback) and the built-in photo format, encode the result for the template. */
import { applyMask, floodFillMask, formatPhoto, framePhoto, makePx, resizeMask, type FormatResult, type FramePlan, type Framing, type Px } from './photoFormat';
import { MAX_IMAGE_BYTES, MAX_IMAGE_SIDE, dataUrlBytes, fitWithin } from './templates';
import type { ModelProgress } from './bgModel';

/** pictures are worked on at most this size (the formatted product is at most 1300 px anyway) */
export const WORK_SIDE = 2000;

/** the picture's pixels (at most WORK_SIDE px) and its own size */
export async function decodeImage(file: Blob): Promise<{ px: Px; w0: number; h0: number }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('The browser could not decode this image')); i.src = url; });
    const { w, h } = fitWithin(img.naturalWidth || 1000, img.naturalHeight || 625, WORK_SIDE);
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true })!;
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, 0, 0, w, h);
    const d = g.getImageData(0, 0, w, h);
    return { px: makePx(w, h, d.data), w0: img.naturalWidth, h0: img.naturalHeight };
  } finally { URL.revokeObjectURL(url); }
}

export function pxToCanvas(px: Px): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = px.width; c.height = px.height;
  c.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(px.data), px.width, px.height), 0, 0);
  return c;
}

/** scale with the browser's (high quality) canvas resampling */
export function canvasResize(px: Px, w: number, h: number): Px {
  let src = pxToCanvas(px);
  // big reductions in halving steps (one-step drawImage aliases)
  while (src.width / 2 >= w && src.height / 2 >= h) {
    const c = document.createElement('canvas');
    c.width = Math.round(src.width / 2); c.height = Math.round(src.height / 2);
    const g = c.getContext('2d')!; g.imageSmoothingQuality = 'high'; g.drawImage(src, 0, 0, c.width, c.height);
    src = c;
  }
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.imageSmoothingQuality = 'high';
  g.drawImage(src, 0, 0, w, h);
  return makePx(w, h, g.getImageData(0, 0, w, h).data);
}

/** encode for storing in the template: WebP (alpha kept), shrunk until it fits MAX_IMAGE_BYTES */
export function encodePx(px: Px): { dataUrl: string; w: number; h: number } {
  let side = Math.min(MAX_IMAGE_SIDE, Math.max(px.width, px.height));
  for (let attempt = 0; attempt < 6; attempt++) {
    const { w, h } = fitWithin(px.width, px.height, side);
    const c = pxToCanvas(w === px.width && h === px.height ? px : canvasResize(px, w, h));
    let url = c.toDataURL('image/webp', 0.85);
    if (!url.startsWith('data:image/webp')) url = c.toDataURL('image/png');
    if (dataUrlBytes(url) <= MAX_IMAGE_BYTES) return { dataUrl: url, w, h };
    side = Math.round(side * 0.75);
  }
  throw new Error('This image is too large even after shrinking it');
}

export type PrepProgress = ModelProgress | { phase: 'refine' };
export type BgEngine = 'model' | 'flood';
const tick = () => new Promise((r) => setTimeout(r, 0));

/** cut the product out of its background: the in-browser model when it loads, else the corner-colour flood fill */
export async function removeBackground(px: Px, onProgress: (p: PrepProgress) => void, engine: BgEngine = 'model'): Promise<{ px: Px; engine: BgEngine; note?: string }> {
  let note: string | undefined;
  if (engine === 'model') {
    try {
      const m = await import('./bgModel');
      const { mask, side } = await m.modelMask(px, onProgress);
      onProgress({ phase: 'refine' }); await tick();
      return { px: applyMask(px, resizeMask(mask, side, side, px.width, px.height), { crisp: true }), engine: 'model' };
    } catch (e) {
      note = `The background model could not load (${(e as Error).message || 'unknown error'}); used the simple corner-colour removal instead.`;
    }
  }
  onProgress({ phase: 'refine' }); await tick();
  return { px: applyMask(px, floodFillMask(px), { crisp: false }), engine: 'flood', ...(note ? { note } : {}) };
}

/** built-in photo format, scaled with the canvas */
export const formatForTemplate = (px: Px, look: boolean, aspect?: number): FormatResult => formatPhoto(px, { look, aspect, resize: canvasResize });
/** render a framing of the picture (framing tool), scaled with the canvas */
export const frameForTemplate = (px: Px, plan: FramePlan, fr: Framing, look: boolean): Px => framePhoto(px, plan, fr, { look, resize: canvasResize });
/** object URL of a pixel buffer (PNG), for showing a cut-out */
export const pxUrl = (px: Px): Promise<string> => new Promise((res, rej) => pxToCanvas(px).toBlob((b) => (b ? res(URL.createObjectURL(b)) : rej(new Error('Could not show the cut-out'))), 'image/png'));
