import type { Annotations } from './annotations';

export const preloadSnapshot = () => import('modern-screenshot');
export function blankSnapshot(w = innerWidth, h = innerHeight) {
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (ctx) { ctx.fillStyle = '#08111e'; ctx.fillRect(0, 0, w, h); }
  return canvas;
}
export async function captureViewport() {
  const w = innerWidth, h = innerHeight, x = scrollX, y = scrollY;
  const scale = Math.min(devicePixelRatio || 1, 1.5);
  const { domToCanvas } = await preloadSnapshot();
  const full = await domToCanvas(document.documentElement, { scale, timeout: 8000,
    filter: (node) => !(node instanceof Element && node.hasAttribute('data-feedback-ui')) });
  const canvas = blankSnapshot(Math.round(w * scale), Math.round(h * scale));
  canvas.getContext('2d')!.drawImage(full, x * scale, y * scale, w * scale, h * scale, 0, 0, canvas.width, canvas.height);
  return canvas;
}
const encode = (canvas: HTMLCanvasElement, type: string, quality?: number) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
/** Destroy redacted pixels before painting strokes and pins, and encode only the flattened copy. */
export async function flatten(snapshot: HTMLCanvasElement, a: Annotations, viewportW: number): Promise<Blob> {
  let canvas = document.createElement('canvas');
  canvas.width = snapshot.width; canvas.height = snapshot.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(snapshot, 0, 0);
  const scale = snapshot.width / viewportW;
  ctx.save(); ctx.scale(scale, scale);
  ctx.fillStyle = '#000';
  for (const r of a.redactions) ctx.fillRect(Math.floor(r.x) - 1, Math.floor(r.y) - 1, Math.ceil(r.w) + 2, Math.ceil(r.h) + 2);
  ctx.strokeStyle = 'rgba(250,204,21,0.95)'; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const stroke of a.strokes) {
    ctx.beginPath(); stroke.points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.stroke();
  }
  for (const pin of a.pins) {
    ctx.beginPath(); ctx.arc(pin.x, pin.y, 13, 0, Math.PI * 2); ctx.fillStyle = '#e11d48'; ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = '#fff';
    ctx.font = 'bold 13px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(pin.n), pin.x, pin.y);
  }
  ctx.restore();
  for (let attempt = 0; attempt < 12; attempt++) {
    let blob = await encode(canvas, 'image/webp', Math.max(0.35, 0.85 - attempt * 0.15));
    if (!blob || blob.type !== 'image/webp') blob = await encode(canvas, 'image/png');
    if (blob && blob.size <= 3.5 * 1024 * 1024) return blob;
    const next = document.createElement('canvas');
    next.width = Math.max(1, Math.round(canvas.width * 0.75)); next.height = Math.max(1, Math.round(canvas.height * 0.75));
    next.getContext('2d')!.drawImage(canvas, 0, 0, next.width, next.height); canvas = next;
  }
  throw new Error('Screenshot could not be encoded. Turn off Include screenshot to send text only.');
}
