import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { coveredInputs, type DeviceTemplate } from '../lib/templates';
import { inputViews, pressedView, scrollDelta, type Box } from '../lib/viewFocus';

/** presses within this window are coalesced into one focus move (the view most of them are on, else the newest) */
const COALESCE_MS = 90;
/** after the user scrolled the panel themselves, presses don't move it for this long */
const USER_SCROLL_HOLD_MS = 1500;
/** how long the "this view" rim pulse lasts */
const PULSE_MS = 1300;

export interface ViewPulse { view: string; n: number }

const scrollable = (el: HTMLElement) => {
  const oy = getComputedStyle(el).overflowY;
  return (oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight + 1;
};
/** nearest ancestor that actually scrolls vertically (the Devices panel / main area), else the page */
function scrollParent(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) if (scrollable(p)) return p;
  return null;
}
const box = (r: DOMRect): Box => ({ top: r.top, bottom: r.bottom });

/**
 * Live Devices view of a multi-view photo template: when an input whose callout sits on some view becomes active (button down,
 * hat direction, axis past the live deadzone), scroll that view into the middle of the scroll area (only when it isn't already in
 * sight) and return a short pulse marker for it. Off while `enabled` is false (template editor open) and for a moment after the
 * user scrolled the panel themselves. `scroll` false (Settings → Scroll to it off): the pulse only, the panel stays put.
 */
export function useFocusPressedView(t: DeviceTemplate, active: ReadonlySet<string>, rootRef: RefObject<HTMLElement | null>, enabled: boolean, scroll = true): ViewPulse | null {
  const views = useMemo(() => inputViews(t), [t]);
  const calloutOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of t.callouts) for (const i of coveredInputs(c)) if (!m.has(i)) m.set(i, c.id);
    return m;
  }, [t]);
  const prev = useRef<ReadonlySet<string>>(new Set());
  const pending = useRef<{ view: string; input: string } | null>(null);
  const timer = useRef(0);
  const userAt = useRef(-Infinity);
  const last = useRef<string | null>(null);
  const [pulse, setPulse] = useState<ViewPulse | null>(null);

  // the user scrolling (wheel, touch, keys, scrollbar drag) holds automatic moves back for a moment
  useEffect(() => {
    const mark = () => { userAt.current = performance.now(); };
    const key = (e: KeyboardEvent) => { if (['PageUp', 'PageDown', 'Home', 'End', 'ArrowUp', 'ArrowDown', ' '].includes(e.key)) mark(); };
    const down = (e: PointerEvent) => { const el = e.target as HTMLElement | null; if (el && el.scrollHeight > el.clientHeight && e.offsetX > el.clientWidth) mark(); }; // scrollbar grab
    window.addEventListener('wheel', mark, { passive: true });
    window.addEventListener('touchmove', mark, { passive: true });
    window.addEventListener('keydown', key);
    window.addEventListener('pointerdown', down);
    return () => { window.removeEventListener('wheel', mark); window.removeEventListener('touchmove', mark); window.removeEventListener('keydown', key); window.removeEventListener('pointerdown', down); };
  }, []);

  useEffect(() => {
    const p = pressedView(prev.current, active, views);
    prev.current = active;
    if (!p || !enabled) return;
    pending.current = p;
    if (timer.current) return; // coalescing: the newest press inside the window wins
    timer.current = window.setTimeout(() => {
      timer.current = 0;
      const target = pending.current;
      pending.current = null;
      const root = rootRef.current;
      if (!target || !root) return;
      const el = root.querySelector<HTMLElement>(`[data-testid="device-canvas-view"][data-view="${CSS.escape(target.view)}"]`);
      if (!el) return;
      const cid = calloutOf.get(target.input);
      const mk = cid ? el.querySelector<Element>(`[data-marker="${CSS.escape(cid)}"], [data-region="${CSS.escape(cid)}"]`) : null;
      const sp = scrollParent(el);
      const port: Box = sp ? box(sp.getBoundingClientRect()) : { top: 0, bottom: window.innerHeight };
      // the sticky slot bar / Groups line cover the top of the scroll area: a view under them isn't in sight
      (sp ?? document).querySelectorAll<HTMLElement>('[data-sticky-head]').forEach((h) => {
        const r = h.getBoundingClientRect();
        if (r.bottom > port.top && r.top <= port.top + 1 + r.height) port.top = Math.max(port.top, r.bottom);
      });
      const d = !scroll || performance.now() - userAt.current < USER_SCROLL_HOLD_MS ? 0 : scrollDelta(box(el.getBoundingClientRect()), port, mk ? box(mk.getBoundingClientRect()) : null);
      if (d) {
        const behavior: ScrollBehavior = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
        (sp ?? window).scrollBy({ top: d, behavior });
      }
      // pulse when the view moved into sight or the focus went to another view (not on every press on the same photo)
      if (d || last.current !== target.view) setPulse((x) => ({ view: target.view, n: (x?.n ?? 0) + 1 }));
      last.current = target.view;
    }, COALESCE_MS);
  }, [active, views, enabled, scroll, rootRef, calloutOf]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  useEffect(() => { last.current = null; }, [t]);
  useEffect(() => {
    if (!pulse) return;
    const id = window.setTimeout(() => setPulse((x) => (x === pulse ? null : x)), PULSE_MS);
    return () => clearTimeout(id);
  }, [pulse]);
  return pulse;
}
