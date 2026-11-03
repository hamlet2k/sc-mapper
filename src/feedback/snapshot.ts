import type { Annotations } from './annotations';

export const preloadSnapshot = () => import('modern-screenshot');
export async function withTimeout<T>(promise: Promise<T>, ms = 6000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([promise, new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Screenshot timed out')), ms);
    })]);
  } finally { clearTimeout(timer); }
}

// Leave disabled until the unculled StarCommand path is measured above 2.5s.
const USE_CULL = true;
const protectedTags = new Set(['HTML', 'BODY', 'HEAD', 'STYLE', 'LINK']);
type Clip = { left: number; top: number; right: number; bottom: number };
function offscreenElements(root: Element, w: number, h: number) {
  const offscreen = new WeakSet<Element>();
  const visit = (el: Element, clip: Clip): boolean => {
    if (el.hasAttribute('data-feedback-ui')) return false;
    const box = el.getBoundingClientRect(), css = getComputedStyle(el);
    let visible = clip.right > clip.left && clip.bottom > clip.top && box.width > 0 && box.height > 0 && box.right > clip.left && box.left < clip.right && box.bottom > clip.top && box.top < clip.bottom;
    const clips = (overflow: string) => /^(auto|scroll|hidden|clip|overlay)$/.test(overflow);
    const childClip = { ...clip };
    if (clips(css.overflowX)) { childClip.left = Math.max(clip.left, box.left + el.clientLeft); childClip.right = Math.min(clip.right, box.left + el.clientLeft + el.clientWidth); }
    if (clips(css.overflowY)) { childClip.top = Math.max(clip.top, box.top + el.clientTop); childClip.bottom = Math.min(clip.bottom, box.top + el.clientTop + el.clientHeight); }
    // Keep visible SVGs intact, including zero-sized definitions referenced by paths.
    if (!(el instanceof SVGElement) && css.display !== 'none') {
      for (const child of el.children) if (visit(child, childClip)) visible = true;
    }
    if (protectedTags.has(el.tagName)) visible = true;
    if (!visible) offscreen.add(el);
    return visible;
  };
  visit(root, { left: 0, top: 0, right: w, bottom: h });
  return offscreen;
}

export function captureHeight(scrollHeight: number, scrollY: number, viewportH: number) {
  return Math.max(viewportH, Math.min(scrollHeight, Math.ceil(scrollY + viewportH)));
}

function createsFixedContainingBlock(style: CSSStyleDeclaration) {
  return [style.transform, style.translate, style.rotate, style.scale, style.perspective, style.filter, style.backdropFilter]
    .some((value) => Boolean(value && value !== 'none'))
    || /\b(layout|paint|strict|content)\b/.test(style.contain)
    || /\b(transform|perspective|filter)\b/.test(style.willChange);
}

/** Ported from StarCommand: anchor viewport-fixed boxes inside the document crop.
 * Preserve boxes with local containing blocks and never write to the live DOM. */
export function stabilizeClonedViewport(clone: Element, scroll: { x: number; y: number }) {
  for (const node of clone.querySelectorAll<HTMLElement>('[style]')) {
    const style = node.style;
    if (style.position !== 'fixed') continue;
    let local = false;
    for (let parent = node.parentElement; parent; parent = parent.parentElement) {
      if (createsFixedContainingBlock(parent.style) || (parent.style.position && parent.style.position !== 'static')) {
        local = true; break;
      }
    }
    if (local || !/^-?[\d.]+px$/.test(style.top) || !/^-?[\d.]+px$/.test(style.left)) continue;
    style.setProperty('position', 'absolute', 'important');
    style.setProperty('top', `${parseFloat(style.top) + scroll.y}px`, 'important');
    style.setProperty('left', `${parseFloat(style.left) + scroll.x}px`, 'important');
    style.setProperty('right', 'auto', 'important');
    style.setProperty('bottom', 'auto', 'important');
  }
}
export function blankSnapshot(w = innerWidth, h = innerHeight) {
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (ctx) { ctx.fillStyle = '#08111e'; ctx.fillRect(0, 0, w, h); }
  return canvas;
}
export async function captureViewport() {
  const stub = (window as typeof window & { __feedbackCaptureStub?: () => Promise<HTMLCanvasElement> }).__feedbackCaptureStub;
  if (stub) return stub();
  const { domToCanvas } = await preloadSnapshot();
  // Match the live page's font metrics, and let modern-screenshot embed the fonts.
  if (document.fonts?.ready) await document.fonts.ready.catch(() => undefined);
  const w = innerWidth, h = innerHeight, scroll = { x: scrollX, y: scrollY };
  const scale = Math.min(devicePixelRatio || 1, 1.5);
  const root = document.documentElement, width = root.clientWidth;
  const offscreen = USE_CULL ? offscreenElements(root, w, h) : null;
  const full = await domToCanvas(root, {
    scale, width, height: captureHeight(root.scrollHeight, scroll.y, h),
    style: { width: `${width}px` },
    backgroundColor: getComputedStyle(document.body).backgroundColor || '#08111e',
    timeout: 1500,
    // Avoid the library's quadratic Gecko/Safari redraw delays for CSS gradients.
    features: { fixSvgXmlDecode: false },
    fetch: { placeholderImage: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=' },
    filter: (node) => !(node instanceof Element && (node.hasAttribute('data-feedback-ui')
      || node instanceof HTMLIFrameElement && node.id.startsWith('__SANDBOX__') || offscreen?.has(node))),
    onCloneNode: (clone) => { if (clone instanceof Element) stabilizeClonedViewport(clone, scroll); },
  });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale); canvas.height = Math.round(h * scale);
  canvas.getContext('2d')!.drawImage(full, Math.round(scroll.x * scale), Math.round(scroll.y * scale),
    canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
  return canvas;
}
const encode = (canvas: HTMLCanvasElement, type: string, quality?: number) => withTimeout(new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality)), 1500);
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
  // Prefer PNG on Gecko, where WebP canvas encoding varies across versions.
  let type = /Firefox\//.test(navigator.userAgent) ? 'image/png' : 'image/webp';
  for (let attempt = 0; attempt < 12; attempt++) {
    let blob: Blob | null;
    try { blob = await encode(canvas, type, Math.max(0.35, 0.85 - attempt * 0.15)); }
    catch (error) { if (type === 'image/png') throw error; blob = null; }
    if (type === 'image/webp' && (!blob || blob.type !== 'image/webp')) {
      type = 'image/png';
      if (blob?.type !== type) blob = await encode(canvas, type);
    }
    if (!blob) throw new Error('Screenshot could not be encoded. Turn off Include screenshot to send text only.');
    if (blob.size <= 3.5 * 1024 * 1024) return blob;
    const next = document.createElement('canvas');
    next.width = Math.max(1, Math.round(canvas.width * 0.75)); next.height = Math.max(1, Math.round(canvas.height * 0.75));
    next.getContext('2d')!.drawImage(canvas, 0, 0, next.width, next.height); canvas = next;
  }
  throw new Error('Screenshot could not be encoded. Turn off Include screenshot to send text only.');
}
