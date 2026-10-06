/* Template pages (views): add, rename, delete and reorder the pictures of a template. Pure functions, unit-tested
 * (scripts/unit.ts). A classic single-picture template has one implicit page (templateViews); the first page operation turns
 * it into an explicit `views` list, keeping its picture, shape and callouts, so nothing moves. */
import { BLANK_ASPECT, MAIN_VIEW, MAX_VIEWS, calloutView, type DeviceTemplate, type TemplateView } from './templates';

/** most pages a template can have (cleanTemplate keeps at most this many when importing) */
export const MAX_PAGES = MAX_VIEWS;
export const PAGE_LABEL_MAX = 40;
/** canvas of a new blank page (16:10) */
export const BLANK_PAGE = { width: 1000 * BLANK_ASPECT, height: 1000 } as const;

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

/** set (or clear) the picture of a page; the canvas gets room for the label columns on both sides, as the built-in photos */
export function setPageImage(t0: DeviceTemplate, id: string, img: { dataUrl: string; w: number; h: number } | null): DeviceTemplate {
  const t = ensurePages(t0);
  const views = t.views!.map((v) => (v.id !== id ? v : img
    ? { ...v, image: img.dataUrl, width: Math.round(img.w + 0.68 * img.h), height: img.h }
    : (({ image: _i, ...rest }) => ({ ...rest, ...BLANK_PAGE }))(v)));
  return { ...t, views, aspect: views[0].width / views[0].height };
}
