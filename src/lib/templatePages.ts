/* Template pages (views): add, rename, delete and reorder the pictures of a template. Pure functions, unit-tested
 * (scripts/unit.ts). A classic single-picture template has one implicit page (templateViews); the first page operation turns
 * it into an explicit `views` list, keeping its picture, shape and callouts, so nothing moves. */
import { BLANK_ASPECT, MAIN_VIEW, MAX_VIEWS, calloutView, type Callout, type DeviceTemplate, type Pt, type TemplateView } from './templates';

/** most pages a template can have (cleanTemplate keeps at most this many when importing) */
export const MAX_PAGES = MAX_VIEWS;
export const PAGE_LABEL_MAX = 40;
/** canvas of a new blank page (16:10) */
export const BLANK_PAGE = { width: 1000 * BLANK_ASPECT, height: 1000 } as const;

/**
 * Label gutter on each side of a photo page, as a fraction of the photo height (room for the label columns).
 * Must match built-in photoViews (`deviceTemplates.PHOTO_GUTTER`): canvas width = photoW + 2 * gutter * photoH.
 * Was briefly hard-coded as 0.68 total (0.34/side) in setPageImage, which disagreed with the built-ins (0.60 total) and
 * shifted callouts whenever a prepared picture replaced a built-in copy or an older page without remapping.
 */
export const PHOTO_LABEL_GUTTER = 0.3;
/** canvas size for a photo of w × h (label columns on both sides, same formula as the built-in photo templates) */
export const pageSizeForPhoto = (w: number, h: number): { width: number; height: number } => ({
  width: Math.round(w + 2 * PHOTO_LABEL_GUTTER * h), height: h,
});

/** label shown for a page (its label, else "Page n") */
export const pageLabel = (v: Pick<TemplateView, 'label'>, idx: number) => v.label.trim() || `Page ${idx + 1}`;

/** the template with an explicit `views` list (a classic template becomes one page with its picture and shape) and every
 * callout pinned to its page (callouts without `view` belong to the first page, which may change when pages move) */
export function ensurePages(t: DeviceTemplate): DeviceTemplate {
  if (t.views?.length) return t.callouts.every((c) => c.view === calloutView(t, c)) ? t : { ...t, callouts: t.callouts.map((c) => ({ ...c, view: calloutView(t, c) })) };
  const aspect = t.aspect > 0.2 && t.aspect < 5 ? t.aspect : BLANK_ASPECT;
  const page: TemplateView = { id: MAIN_VIEW, label: 'Page 1', ...(t.image ? { image: t.image } : {}), width: 1000 * aspect, height: 1000 };
  const { image: _i, ...rest } = t;
  return { ...rest, views: [page], aspect, callouts: t.callouts.map((c) => ({ ...c, view: MAIN_VIEW })) };
}

/** a page id not used by the template yet (p2, p3 ...) */
export function newPageId(t: Pick<DeviceTemplate, 'views'>): string {
  const used = new Set((t.views ?? []).map((v) => v.id));
  let n = (t.views?.length ?? 0) + 1;
  while (used.has(`p${n}`)) n++;
  return `p${n}`;
}

const cleanLabel = (s: string) => s.replace(/\s+/g, ' ').trim().slice(0, PAGE_LABEL_MAX);

/** add a blank page at the end; returns the template and the new page id (null when MAX_PAGES is reached) */
export function addPage(t0: DeviceTemplate, label?: string): { template: DeviceTemplate; id: string | null } {
  const t = ensurePages(t0);
  if (t.views!.length >= MAX_PAGES) return { template: t0, id: null };
  const id = newPageId(t);
  const page: TemplateView = { id, label: cleanLabel(label ?? '') || `Page ${t.views!.length + 1}`, ...BLANK_PAGE };
  return { template: { ...t, views: [...t.views!, page] }, id };
}

/** rename a page (blank names become "Page n") */
export function renamePage(t0: DeviceTemplate, id: string, label: string): DeviceTemplate {
  const t = ensurePages(t0);
  return { ...t, views: t.views!.map((v, i) => (v.id === id ? { ...v, label: cleanLabel(label) || `Page ${i + 1}` } : v)) };
}

/** callouts sitting on a page */
export const pageCallouts = (t: DeviceTemplate, id: string) => t.callouts.filter((c) => calloutView(t, c) === id);

/** delete a page and the callouts on it (their spots are fractions of that picture, so they would be meaningless elsewhere).
 * The last page cannot be deleted. */
export function deletePage(t0: DeviceTemplate, id: string): DeviceTemplate {
  const t = ensurePages(t0);
  if (t.views!.length <= 1 || !t.views!.some((v) => v.id === id)) return t0;
  const views = t.views!.filter((v) => v.id !== id);
  return { ...t, views, aspect: views[0].width / views[0].height, callouts: t.callouts.filter((c) => c.view !== id) };
}

/** move a page one place left (-1) or right (+1) */
export function movePage(t0: DeviceTemplate, id: string, dir: -1 | 1): DeviceTemplate {
  const t = ensurePages(t0);
  const vs = [...t.views!];
  const i = vs.findIndex((v) => v.id === id), j = i + dir;
  if (i < 0 || j < 0 || j >= vs.length) return t0;
  [vs[i], vs[j]] = [vs[j], vs[i]];
  return { ...t, views: vs, aspect: vs[0].width / vs[0].height };
}

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.5);

/** how object-contain places a pw×ph picture inside a viewW×viewH canvas (CSS pixels / same units) */
function containRect(viewW: number, viewH: number, pw: number, ph: number) {
  const scale = Math.min(viewW / Math.max(pw, 1e-6), viewH / Math.max(ph, 1e-6));
  const rw = pw * scale, rh = ph * scale;
  return { ox: (viewW - rw) / 2, oy: (viewH - rh) / 2, rw, rh };
}

/** canvas fraction (0..1 of the view) ↔ fraction of the photo content (object-contain) */
export function canvasToPhoto(p: Pt, viewW: number, viewH: number, pw: number, ph: number): Pt {
  const { ox, oy, rw, rh } = containRect(viewW, viewH, pw, ph);
  return { x: rw > 0 ? (p.x * viewW - ox) / rw : 0.5, y: rh > 0 ? (p.y * viewH - oy) / rh : 0.5 };
}
export function photoToCanvas(p: Pt, viewW: number, viewH: number, pw: number, ph: number): Pt {
  const { ox, oy, rw, rh } = containRect(viewW, viewH, pw, ph);
  return { x: clamp01((ox + p.x * rw) / viewW), y: clamp01((oy + p.y * rh) / viewH) };
}

/**
 * Infer the photo pixel size that a page canvas was built for. Photo pages use height = photoH and
 * width = photoW + 2 * gutter * photoH. Blank pages (no image) treat the whole canvas as the picture.
 * Also recognises the legacy 0.68 total gutter. When both gutters reverse to a valid photo width (they can,
 * for some canvases), prefer the candidate closest to `hintPw` (the replacement picture's width).
 */
export function inferPhotoSize(view: Pick<TemplateView, 'width' | 'height' | 'image'>, hintPw?: number): { pw: number; ph: number } {
  if (!view.image) return { pw: view.width, ph: view.height };
  const ph = view.height, W = Math.round(view.width);
  const candidates: number[] = [];
  for (const total of [2 * PHOTO_LABEL_GUTTER, 0.68]) {
    const pw = Math.round(W - total * ph);
    if (pw > 10 && pw < W - 1 && Math.round(pw + total * ph) === W) candidates.push(pw);
  }
  if (!candidates.length) return { pw: view.width, ph: view.height };
  if (hintPw != null && candidates.length > 1) {
    candidates.sort((a, b) => Math.abs(a - hintPw) - Math.abs(b - hintPw) || b - a);
  }
  return { pw: candidates[0], ph };
}

/** remap callout anchor/box from one page canvas (+ photo) onto another, keeping their place on the picture */
export function remapPageCallouts(callouts: Callout[], pageId: string, from: { viewW: number; viewH: number; pw: number; ph: number }, to: { viewW: number; viewH: number; pw: number; ph: number }): Callout[] {
  if (from.viewW === to.viewW && from.viewH === to.viewH && from.pw === to.pw && from.ph === to.ph) return callouts;
  return callouts.map((c) => {
    if ((c.view ?? pageId) !== pageId) return c;
    const a = photoToCanvas(canvasToPhoto(c.anchor, from.viewW, from.viewH, from.pw, from.ph), to.viewW, to.viewH, to.pw, to.ph);
    const b = photoToCanvas(canvasToPhoto(c.box, from.viewW, from.viewH, from.pw, from.ph), to.viewW, to.viewH, to.pw, to.ph);
    return { ...c, anchor: a, box: b };
  });
}

/** set (or clear) the picture of a page; the canvas gets room for the label columns on both sides, as the built-in photos.
 * Callout anchors/boxes on that page are remapped so they stay on the same spot of the picture when the canvas size changes. */
export function setPageImage(t0: DeviceTemplate, id: string, img: { dataUrl: string; w: number; h: number } | null): DeviceTemplate {
  const t = ensurePages(t0);
  const prev = t.views!.find((v) => v.id === id);
  if (!prev) return t0;
  const fromPhoto = inferPhotoSize(prev, img?.w);
  const nextView: TemplateView = img
    ? { ...prev, image: img.dataUrl, ...pageSizeForPhoto(img.w, img.h) }
    : (({ image: _i, ...rest }) => ({ ...rest, ...BLANK_PAGE }))(prev);
  const toPhoto = img ? { pw: img.w, ph: img.h } : { pw: nextView.width, ph: nextView.height };
  const callouts = remapPageCallouts(
    t.callouts,
    id,
    { viewW: prev.width, viewH: prev.height, ...fromPhoto },
    { viewW: nextView.width, viewH: nextView.height, ...toPhoto },
  );
  const views = t.views!.map((v) => (v.id !== id ? v : nextView));
  return { ...t, views, aspect: views[0].width / views[0].height, callouts };
}
