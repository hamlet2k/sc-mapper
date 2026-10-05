// Multi-view photo templates: when a control is pressed, bring the photo view that has its marker into sight.
// Pure helpers (unit-tested); the DOM / timing side lives in DeviceView (useFocusPressedView).
import { calloutView, coveredInputs, type DeviceTemplate } from './templates';

export interface Box { top: number; bottom: number }

/** input name -> id of the view its callout is on (multi-view templates only; empty map otherwise) */
export function inputViews(t: Pick<DeviceTemplate, 'views' | 'image' | 'aspect' | 'callouts'>): Map<string, string> {
  const m = new Map<string, string>();
  if ((t.views?.length ?? 0) < 2) return m;
  for (const c of t.callouts) {
    const v = calloutView(t, c);
    for (const i of coveredInputs(c)) if (i && !m.has(i)) m.set(i, v);
  }
  return m;
}

/**
 * the view to focus for the inputs that just became active (in `next`, not in `prev`), or null. Several at once (a chord, a
 * diagonal hat): the view holding most of them; a tie goes to the newest one (last in `next`'s insertion order).
 */
export function pressedView(prev: ReadonlySet<string>, next: ReadonlySet<string>, views: ReadonlyMap<string, string>): { view: string; input: string } | null {
  const fresh = [...next].filter((i) => !prev.has(i) && views.has(i));
  if (!fresh.length) return null;
  const n = new Map<string, number>();
  for (const i of fresh) n.set(views.get(i)!, (n.get(views.get(i)!) ?? 0) + 1);
  let best: { view: string; input: string } | null = null, bestN = 0;
  for (const i of fresh) { const v = views.get(i)!, k = n.get(v)!; if (k >= bestN) { best = { view: v, input: i }; bestN = k; } }
  return best;
}

const overlap = (a: Box, b: Box) => Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));

/** a view counts as already in sight when its marker is inside the scroll area (with a margin) and most of the view shows */
export function viewInSight(view: Box, port: Box, marker?: Box | null, minFrac = 0.6, margin = 24): boolean {
  const h = view.bottom - view.top, ph = port.bottom - port.top;
  if (h <= 0 || ph <= 0) return true;
  if (marker && (marker.top < port.top + margin || marker.bottom > port.bottom - margin)) return false;
  return overlap(view, port) >= Math.min(h, ph) * minFrac;
}

/**
 * scroll offset change (px, + = down) that centres the view in the scroll area; a view taller than the area is placed so the
 * marker sits in the middle instead (clamped so the view still covers the area). 0 when it already shows (viewInSight).
 */
export function scrollDelta(view: Box, port: Box, marker?: Box | null): number {
  if (viewInSight(view, port, marker)) return 0;
  const h = view.bottom - view.top, ph = port.bottom - port.top;
  const mid = (b: Box) => (b.top + b.bottom) / 2, pm = mid(port);
  if (h <= ph || !marker) return Math.round(mid(view) - pm);
  const d = mid(marker) - pm;
  return Math.round(Math.min(Math.max(d, view.top - port.top), view.bottom - port.bottom));
}
