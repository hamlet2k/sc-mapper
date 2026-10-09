// Label-box layout shared by the Devices view and the template editor. Positions are fractions of the canvas; box sizes are px.
// The bottom-up pass keeps boxes inside and un-overlapped. If that would push a box above the canvas top, the boxes do not
// fit: the caller grows the canvas, and if it still does not fit, boxes stack from the top and the lowest ones overlap.

export const CALLOUT_EDGE_PX = 2, CALLOUT_GAP_PX = 3;
/** each grow step while a multi-view page's boxes do not fit (deterministic: same start, same boxes, same result) */
export const LAYOUT_GROW = 1.15;

export interface LayoutBox { id: string; x: number; y: number; w: number; h: number }

interface Item { id: string; x0: number; x1: number; dx: number; y: number; h: number; w: number }

function itemsAt(W: number, H: number, boxes: LayoutBox[]): Item[] {
  const E = CALLOUT_EDGE_PX;
  return boxes.map((c) => {
    const x0 = c.x * W - c.w / 2;
    // slide a box that hangs off the left or right edge back inside, as far as the canvas allows
    const dx = x0 < E ? Math.min(E - x0, W - E - (x0 + c.w)) : x0 + c.w > W - E ? Math.max(W - E - (x0 + c.w), E - x0) : 0;
    return { id: c.id, x0: x0 + dx, x1: x0 + c.w + dx, dx, y: c.y * H, h: c.h, w: c.w };
  }).sort((a, b) => a.y - b.y);
}

/** top-down: not above the canvas, and below any earlier box it overlaps horizontally */
function spreadDown(items: Item[]): Item[] {
  const gap = CALLOUT_GAP_PX, E = CALLOUT_EDGE_PX, placed: Item[] = [];
  for (const src of items) {
    const it = { ...src };
    it.y = Math.max(it.y, it.h / 2 + E);
    for (const p of placed) if (it.x0 < p.x1 - 1 && p.x0 < it.x1 - 1 && it.y - it.h / 2 < p.y + p.h / 2 + gap) it.y = p.y + p.h / 2 + gap + it.h / 2;
    placed.push(it);
  }
  return placed;
}

/** bottom-up: not below the canvas, and above any later box it overlaps. This can push a box above the top. */
function pushUp(placed: Item[], H: number): Item[] {
  const gap = CALLOUT_GAP_PX, E = CALLOUT_EDGE_PX;
  const out = placed.map((it) => ({ ...it }));
  for (let i = out.length - 1; i >= 0; i--) {
    const it = out[i];
    it.y = Math.min(it.y, H - it.h / 2 - E);
    for (let j = i + 1; j < out.length; j++) {
      const p = out[j];
      if (it.x0 < p.x1 - 1 && p.x0 < it.x1 - 1 && it.y + it.h / 2 > p.y - p.h / 2 - gap) it.y = p.y - p.h / 2 - gap - it.h / 2;
    }
  }
  return out;
}

const aboveTop = (it: Item) => it.y - it.h / 2 < -0.5;

/** top-down stack, then pull any box that hangs below the canvas back inside. Nothing ends above the top; the lowest may overlap. */
function stackFromTop(down: Item[], H: number): Item[] {
  const E = CALLOUT_EDGE_PX;
  return down.map((it) => {
    let y = Math.max(it.y, it.h / 2 + E);
    const maxY = H - it.h / 2 - E;
    if (maxY >= it.h / 2 + E) y = Math.min(y, maxY);
    return { ...it, y };
  });
}

function nudgesOf(placed: Item[], H: number, boxes: LayoutBox[], W: number): Record<string, number> {
  const next: Record<string, number> = {};
  for (const it of placed) {
    const c = boxes.find((b) => b.id === it.id)!;
    const d = it.y / H - c.y;
    if (Math.abs(d) > 0.0005) next[it.id] = d;
    if (Math.abs(it.dx) > 0.5) next[`x:${it.id}`] = it.dx / W;
  }
  return next;
}

/** Nudge fractions at this canvas size. `fits` is false when a box is wider than the canvas or the bottom-up pass would push
 * one above the top. In that case the boxes stack from the top and the lowest overlap, so none is left above the canvas. */
export function layoutCallouts(W: number, H: number, boxes: LayoutBox[]): { nudges: Record<string, number>; fits: boolean } {
  const items = itemsAt(W, H, boxes);
  const wide = items.some((it) => it.w > W);
  const down = spreadDown(items);
  const up = pushUp(down, H);
  const pushedOut = up.some(aboveTop);
  const fits = !wide && !pushedOut;
  return { nudges: nudgesOf(pushedOut ? stackFromTop(down, H) : up, H, boxes, W), fits };
}

/** layout width for one multi-view page. Starts at the column width, never under `aspect × minH` and never over `aspect × maxH`.
 * While `fits` is false, grow by at most LAYOUT_GROW and stop at the smallest width in that step that fits, so the page is
 * not scaled more than the boxes need. Same column and same `fits` answers give the same width. */
export function chooseLayoutWidth(column: number, aspect: number, fits: (w: number, h: number) => boolean, minH: number, maxH: number): number {
  const minW = Math.round(aspect * minH);
  const maxW = Math.round(aspect * maxH);
  let lo = Math.min(maxW, Math.max(minW, Math.round(column)));
  if (lo >= maxW || fits(lo, Math.round(lo / aspect))) return lo;
  while (lo < maxW) {
    const hi = Math.min(maxW, Math.round(lo * LAYOUT_GROW));
    if (hi <= lo) return lo;
    if (!fits(hi, Math.round(hi / aspect))) { lo = hi; continue; }
    // smallest width in (lo, hi] that fits. A wider canvas only adds room, so fit is monotonic in width.
    let a = lo + 1, b = hi;
    while (a < b) {
      const mid = Math.floor((a + b) / 2);
      if (fits(mid, Math.round(mid / aspect))) b = mid;
      else a = mid + 1;
    }
    return a;
  }
  return lo;
}
