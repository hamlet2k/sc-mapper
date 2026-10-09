import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { isHatRest, snapshot } from '../lib/capture';
import { getPads, type PadInfo } from '../lib/devices';
import { firingRows, liveFirst } from '../lib/liveRows';
import { chooseLayoutWidth, layoutCallouts, type LayoutBox } from '../lib/calloutLayout';
import { BUILTIN_PHOTO_RE, calloutTitle, coveredInputs, imageSrc, inputRole, liveInputs, shortInput, splitCombo, viewTemplate, type Callout, type DeviceTemplate, type Pt } from '../lib/templates';
import type { Binding, Row } from '../lib/types';
import { Ico } from './icons';

export interface Entry { row: Row; b: Binding; prefix: string; conflict: boolean }

export type Tone = 'conflict' | 'custom' | 'bound' | 'unbound';
export const TONE_STROKE: Record<Tone, string> = { conflict: '#ff4d6d', custom: '#ffb547', bound: '#4f8fb0', unbound: '#35506a' };
export const TONE_CLS: Record<Tone, string> = {
  conflict: 'border-alert/80 text-slate-100',
  custom: 'border-mod/80 text-slate-100',
  bound: 'border-edge2 text-slate-200',
  unbound: 'border-edge/70 text-slate-500',
};

export interface Live { active: Set<string>; values: Record<string, number> }
const EMPTY: Live = { active: new Set(), values: {} };

/** what a connected device is doing right now (held buttons, pushed hats, moved axes, axis values), polled ~25x per second */
export function useLiveInputs(pad?: PadInfo): Live {
  const [st, setSt] = useState<Live>(EMPTY);
  const index = pad?.index, kind = pad?.kind;
  useEffect(() => {
    if (index === undefined || !kind) { setSt(EMPTY); return; }
    let raf = 0, last = 0, prev = '', seenAt = 0;
    let rest: number[] | null = null;
    const loop = (now: number) => {
      if (now - last > 40) {
        last = now;
        const g = getPads().find((p) => p.index === index);
        if (g) {
          const s = snapshot(g);
          if (!rest) { rest = [...s.axes]; seenAt = now; }
          else s.axes.forEach((v, i) => {
            if (now - seenAt < 300 || rest![i] === undefined) rest![i] = v;
            else if (!isHatRest(rest![i]) && isHatRest(v)) rest![i] = v;
          });
          const r = liveInputs(kind, s, rest);
          const k = `${[...r.active].sort().join(',')}|${Object.values(r.values).map((v) => v.toFixed(2)).join(',')}`;
          if (k !== prev) { prev = k; setSt(r); }
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [index, kind]);
  return st;
}

/** inputActive: per input (same order as callout.inputs), for callouts with one outline per input */
export interface CalloutState { tone: Tone; active: boolean; dim?: boolean; inputActive?: boolean[] }
interface Props {
  template: DeviceTemplate;
  stateOf: (c: Callout) => CalloutState;
  renderLabel: (c: Callout, s: CalloutState) => ReactNode;
  selected?: string | null;
  onSelect?: (id: string) => void;
  /** editor: drag anchors and labels, click on empty canvas */
  editable?: boolean;
  onMove?: (id: string, part: 'anchor' | 'box', p: Pt) => void;
  onDragStart?: () => void;
  onCanvasClick?: (p: Pt) => void;
  minWidth?: number;
  /** multi-view templates: show only this view (the editor's view tabs); default: every view side by side */
  view?: string;
  /** multi-view templates: briefly emphasize this view (it was just brought into sight by a press); n restarts the pulse */
  pulse?: { view: string; n: number } | null;
  /** multi-page templates: page headings stick while their page scrolls (needs no horizontally scrolling ancestor, see
   * DeviceView); otherwise each page keeps its caption on the picture */
  stickyHeadings?: boolean;
}
/** photo views: height (px) a view keeps before the views wrap under each other, and the largest one when stacked. High on
 * purpose: in a usual window two views do not fit side by side at that height, so they stack and each photo gets the full width
 * (the device is the hero, the labels sit around it); very wide windows show them side by side. A page is laid out at the column
 * width, but never shorter than VIEW_MIN_H, and it grows toward VIEW_MAX_H only when the callout boxes do not fit. */
const VIEW_MIN_H = 440, VIEW_MAX_H = 720;
/** uploaded raster pictures on a classic single-picture canvas: never drawn taller than the built-in photos (VIEW_MAX_H), so a
 * portrait picture does not fill the column width and run off the screen. Same rule in the Devices view and the editor (the
 * editor also reuses the width the Devices view showed), so label boxes sit in the same place. Built-in drawings (SVG) and
 * blank canvases keep filling the width. */
const UPLOADED_RASTER_RE = /^data:image\/(png|jpeg|webp|gif)[;,]/;
export const cappedWidth = (t: Pick<DeviceTemplate, 'image' | 'aspect' | 'builtin' | 'views'>): number | undefined =>
  !t.views?.length && !t.builtin && t.image && UPLOADED_RASTER_RE.test(t.image) ? Math.round(t.aspect * VIEW_MAX_H) : undefined;
/** narrowest a multi-view canvas gets (narrower containers scroll it horizontally) */
export const MULTI_VIEW_MIN_W = 420;
/** label-box layout, the same in the Devices view and the template editor (so a box sits exactly where it will be shown) */
export { CALLOUT_EDGE_PX, CALLOUT_GAP_PX } from '../lib/calloutLayout';
/** single-picture canvases: label boxes have a fixed size in px, so the editor draws the picture at the width the Devices
 * view last showed (same aspect; a copy keeps it). */
const shownWidth = new Map<string, number>();
/** multi-view pages: the layout width (px, before any scale) the Devices view chose for that page. Set only by the
 * non-editable Devices view. The editor draws the page at this exact width, so both measure the same boxes. */
const shownLayout = new Map<string, number>();
const widthKey = (t: { aspect: number }, viewId?: string) => `${viewId ?? '-'}:${t.aspect.toFixed(4)}`;
/** soft blend of a cut-out product photo into the dark UI: faint cyan rim, cyan glow and a drop shadow */
const PHOTO_FILTER = 'drop-shadow(0 0 1px rgba(139,233,255,.45)) drop-shadow(0 0 18px rgba(79,216,255,.16)) drop-shadow(0 14px 22px rgba(0,0,0,.75))';
const PHOTO_BG = 'radial-gradient(ellipse 60% 55% at 50% 48%, rgba(79,216,255,.09), rgba(79,216,255,.025) 55%, rgba(0,0,0,0) 75%), linear-gradient(180deg, #070d16, #04070c)';
const VIGNETTE = 'radial-gradient(ellipse 75% 70% at 50% 50%, rgba(0,0,0,0) 55%, rgba(0,0,0,.55) 100%)';

/** device picture(s) with callouts: classic templates one canvas; multi-view (photo) templates every view side by side (stacked when narrow) */
export function DeviceCanvas(props: Props) {
  const { template: t, view, minWidth = 860 } = props;
  if (!t.views?.length) return <ViewCanvas {...props} />;
  const views = view ? t.views.filter((v) => v.id === view).slice(0, 1) : t.views;
  const shown = views.length ? views : t.views.slice(0, 1);
  // Devices view, several pages shown: each page's heading sticks under the sticky lines while its page scrolls by
  const sticky = !!props.stickyHeadings && !props.editable && shown.length > 1;
  return (
    <div data-testid="device-canvas" data-views={shown.length} className="flex w-full flex-wrap items-start justify-center gap-3" style={{ minWidth: Math.min(minWidth, MULTI_VIEW_MIN_W) }}>
      {shown.map((v) => {
        const a = v.width / v.height;
        const page = viewTemplate(t, v.id);
        // the editor column is the layout width the Devices view recorded for this page (capped to the pane)
        const locked = props.editable ? shownLayout.get(widthKey(page, v.id)) : undefined;
        return (
          <div key={v.id} className="min-w-0" style={locked
            ? { flex: 'none', width: locked, maxWidth: '100%' }
            : { flex: `${a} 1 ${Math.round(a * VIEW_MIN_H)}px`, maxWidth: Math.round(a * VIEW_MAX_H) }}>
            {sticky && <PageHeading label={v.label} viewId={v.id} focused={props.pulse?.view === v.id} />}
            <ViewCanvas {...props} template={page} photo caption={!sticky && t.views!.length > 1 ? v.label : undefined} viewId={v.id} minWidth={0} />
          </div>
        );
      })}
    </div>
  );
}

/** heading of one page of a multi-page template in the Devices view: its own row above the canvas, so even labels at the
 * canvas's top edge have room. It sticks under the slot bar + Groups line while a page scrolls by, bounded by that page.
 * Above callouts (z-20) and the view pulse (z-30), below the sticky lines (z-40). */
export const PAGE_HEADING_H = 22;
function PageHeading({ label, viewId, focused }: { label: string; viewId: string; focused: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const el = ref.current, page = el?.parentElement;
    if (!el || !page) return;
    let raf = 0;
    // stuck = pushed down from where it sits at rest (the top of its page)
    const check = () => { raf = 0; setStuck(el.getBoundingClientRect().top - page.getBoundingClientRect().top > 0.5); };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(check); };
    check();
    window.addEventListener('scroll', onScroll, { capture: true, passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => { window.removeEventListener('scroll', onScroll, { capture: true }); window.removeEventListener('resize', onScroll); if (raf) cancelAnimationFrame(raf); };
  }, []);
  return (
    <div ref={ref} data-page-heading={viewId} data-stuck={stuck ? '1' : undefined}
      className={`pointer-events-none sticky z-[35] flex items-center px-2 transition-[background-color,box-shadow] duration-150 print:static ${stuck ? 'rounded-b border-b border-edge/60 bg-void shadow-[0_8px_10px_-8px_rgba(0,0,0,.8)]' : ''}`}
      style={{ top: 'var(--sticky-page-top, 0px)', height: PAGE_HEADING_H }}>
      <span className={`truncate font-display text-[10px] font-bold uppercase tracking-[0.2em] transition-colors duration-500 ${focused ? 'glow-text text-hud2' : stuck ? 'text-hud2/90' : 'text-hud/60'}`} data-view-caption={viewId}>{label}</span>
    </div>
  );
}

/** one device image with callout anchors, leader lines and label boxes (positions are fractions of the canvas) */
function ViewCanvas({ template: t, stateOf, renderLabel, selected, onSelect, editable, onMove, onDragStart, onCanvasClick, minWidth = 860, photo: photoProp, caption, viewId, pulse }: Props & { photo?: boolean; caption?: string; viewId?: string }) {
  // product photos (built-in photo templates, multi-view templates): drawn aspect kept, blended into the UI, a marker per control
  const photo = !!t.image && (photoProp || BUILTIN_PHOTO_RE.test(t.image));
  const ref = useRef<HTMLDivElement>(null);
  const glowId = `dc-glow-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const stop = useRef<(() => void) | null>(null);
  const VH = 1000 / t.aspect;
  const at = (e: { clientX: number; clientY: number }): Pt => {
    const r = ref.current!.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };
  const start = (id: string, part: 'anchor' | 'box') => (e: React.PointerEvent) => {
    onSelect?.(id);
    if (!editable) return;
    e.stopPropagation();
    e.preventDefault();
    stop.current?.();
    let moved = false;
    const move = (ev: PointerEvent) => {
      if (!moved) { moved = true; onDragStart?.(); }
      onMove?.(id, part, at(ev));
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); stop.current = null; };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    stop.current = up;
  };
  useEffect(() => () => stop.current?.(), []);
  // label boxes grow with their bindings: keep them inside the canvas and push overlapping boxes apart (vertically) so every
  // label stays readable. Done in the editor too, so the editor shows the boxes exactly where the Devices view will.
  const [nudge, setNudge] = useState<Record<string, number>>({});
  const frameRef = useRef<HTMLDivElement>(null);
  const recorded0 = viewId && editable ? shownLayout.get(widthKey(t, viewId)) : undefined;
  const [fit, setFit] = useState({ layoutW: recorded0 || (viewId ? Math.round(t.aspect * VIEW_MIN_H) : 0), scale: 1, frameH: 0 });
  const relayout = useRef<() => void>(() => {});
  relayout.current = () => {
    const root = ref.current;
    if (!root) return;
    const W = root.clientWidth, H = root.clientHeight;
    if (!W || !H) return;
    if (!editable && !viewId) shownWidth.set(widthKey(t, viewId), root.offsetWidth);
    const boxes: LayoutBox[] = t.callouts.flatMap((c) => {
      const el = root.querySelector<HTMLElement>(`[data-callout="${CSS.escape(c.id)}"]`);
      if (!el) return [];
      return [{ id: c.id, x: c.box.x, y: c.box.y, w: el.offsetWidth, h: el.offsetHeight }];
    });
    if (viewId) {
      const frame = frameRef.current;
      const frameW = frame?.clientWidth ?? 0;
      if (!frameW) return;
      const key = widthKey(t, viewId);
      const borderX = root.offsetWidth - W, borderY = root.offsetHeight - H;
      // fit is decided on the content box (the border stays 1 px whatever width we try)
      const fits = (w: number, h: number) => w - borderX >= 32 && h - borderY >= 32 && layoutCallouts(w - borderX, h - borderY, boxes).fits;
      const recorded = editable ? shownLayout.get(key) : undefined;
      // no record yet: the Devices column this page would get (the canvas wrap), else this column
      let column = frameW;
      if (editable && recorded === undefined) {
        const wrap = document.querySelector<HTMLElement>('[data-testid=device-canvas-wrap]');
        if (wrap && wrap.clientWidth > 0) column = wrap.clientWidth;
      }
      const layoutW = chooseLayoutWidth(recorded ?? column, t.aspect, fits, VIEW_MIN_H, VIEW_MAX_H);
      if (!editable) shownLayout.set(key, layoutW);
      // scale down only when the column is narrower than the layout width; scale 1 draws with no transform
      const scale = frameW + 0.5 < layoutW ? frameW / layoutW : 1;
      const frameH = scale === 1 ? 0 : Math.ceil(Math.round(layoutW / t.aspect) * scale);
      if (root.offsetWidth !== layoutW || Math.abs(fit.scale - scale) > 0.0005 || (scale !== 1 && Math.abs(fit.frameH - frameH) > 0.5)) {
        setFit({ layoutW, scale, frameH });
        return;
      }
    }
    const next = layoutCallouts(W, H, boxes).nudges;
    const same = Object.keys(next).length === Object.keys(nudge).length && Object.entries(next).every(([k, v]) => Math.abs((nudge[k] ?? 99) - v) < 0.001);
    if (!same) setNudge(next);
  };
  useLayoutEffect(() => { relayout.current(); });
  useEffect(() => {
    const root = ref.current, frame = frameRef.current;
    if (!root || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => relayout.current());
    ro.observe(root);
    if (frame) ro.observe(frame);
    return () => ro.disconnect();
  }, [viewId]);
  const by = (c: { id: string; box: Pt }) => c.box.y + (nudge[c.id] ?? 0);
  const bx = (c: { id: string; box: Pt }) => c.box.x + (nudge[`x:${c.id}`] ?? 0);
  const focused = !!viewId && pulse?.view === viewId;
  // Multi-view: lay out at the column width (never under aspect × VIEW_MIN_H). Grow toward aspect × VIEW_MAX_H by at
  // most LAYOUT_GROW per step, stopping at the smallest width in the step where the boxes stay inside. Scale the page
  // down to the column; at scale 1 there is no transform. The editor reuses the width the Devices view recorded.
  const layoutW = viewId ? fit.layoutW : 0;
  const layoutH = layoutW ? Math.round(layoutW / t.aspect) : 0;
  const scaled = !!layoutW && fit.scale < 0.9995;
  const capW = viewId ? undefined : cappedWidth(t);
  // scrollIntoView centers in the scrollport, which includes the space covered by sticky controls. Extend the target's
  // scroll area above it by their measured height so a whole page (or a picked card) lands in the usable room below them.
  const scrollStyle = editable ? {} : { scrollMarginTop: 'var(--device-scroll-top, 0px)', scrollMarginBottom: 8 };
  const canvas = (
    <div ref={ref} data-testid={viewId ? 'device-canvas-view' : 'device-canvas'} data-view={viewId} data-photo={photo ? '1' : undefined} data-focused={focused ? '1' : undefined} data-layout-scale={viewId ? (scaled ? String(fit.scale) : '1') : undefined}
      className={`relative select-none overflow-hidden rounded-lg border border-edge/70 ${layoutW ? '' : 'w-full'} ${photo ? '' : t.image ? 'bg-black/30' : 'bg-[length:24px_24px] bg-[linear-gradient(rgba(79,216,255,.06)_1px,transparent_1px),linear-gradient(90deg,rgba(79,216,255,.06)_1px,transparent_1px)]'} ${editable ? 'cursor-crosshair' : ''}`}
      style={{ ...scrollStyle, ...(layoutW
        ? { width: layoutW, height: layoutH, aspectRatio: String(t.aspect), ...(photo ? { backgroundImage: PHOTO_BG } : {}) }
        : { aspectRatio: String(t.aspect), minWidth, ...(capW ? { maxWidth: capW, minWidth: Math.min(minWidth, capW), marginInline: 'auto' } : {}), ...(editable && !viewId && shownWidth.get(widthKey(t)) ? { width: shownWidth.get(widthKey(t)), minWidth: 0 } : {}), ...(photo ? { backgroundImage: PHOTO_BG } : {}) }) }}
      onClick={(e) => {
        if (!editable || !onCanvasClick) return;
        if (e.target === e.currentTarget || (e.target as Element).getAttribute?.('data-bg') === '1') onCanvasClick(at(e));
      }}>
      {t.image && !photo && <img src={imageSrc(t.image)} alt="" data-bg="1" draggable={false} className="absolute inset-0 h-full w-full object-fill" />}
      {t.image && photo && <img src={imageSrc(t.image)} alt={caption ?? ''} data-bg="1" draggable={false} loading="lazy" decoding="async" className="absolute inset-0 h-full w-full object-contain" style={{ filter: PHOTO_FILTER }} />}
      {photo && <div aria-hidden className="pointer-events-none absolute inset-0" style={{ backgroundImage: VIGNETTE }} />}
      {focused && <div key={pulse!.n} aria-hidden data-view-pulse={viewId} className="view-pulse pointer-events-none absolute inset-0 z-30 rounded-lg" />}
      {caption && <span className={`pointer-events-none absolute left-2 top-1.5 z-10 font-display text-[10px] font-bold uppercase tracking-[0.2em] transition-colors duration-500 ${focused ? 'glow-text text-hud2' : 'text-hud/60'}`} data-view-caption={viewId}>{caption}</span>}
      <svg viewBox={`0 0 1000 ${VH}`} preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full">
        <defs>
          <filter id={glowId} x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
        </defs>
        {t.callouts.map((c) => {
          // the control itself on the picture: its outline glows when used, a faint tint marks customized / conflicting ones
          const s = stateOf(c);
          const at = `translate(${c.anchor.x * 1000} ${c.anchor.y * VH})`;
          if (c.inputRegions?.some(Boolean)) {
            // one outline per input (e.g. each key of a keypad): only the pressed ones glow; the whole-control outline carries tint / selection
            const tint = s.tone === 'conflict' || s.tone === 'custom' ? TONE_STROKE[s.tone] : null;
            return (
              <g key={`r-${c.id}`} opacity={s.dim ? 0.3 : 1}>
                {c.region && !s.active && (tint || selected === c.id) && <path d={c.region} transform={at} fill={tint ?? 'none'} fillOpacity={0.12}
                  stroke={selected === c.id ? '#ffb547' : tint!} strokeOpacity={selected === c.id ? 1 : 0.55} strokeWidth={1.2} />}
                {c.inputRegions.map((d, k) => d && k < c.inputs.length && (s.inputActive?.[k] || (!c.region && (tint || selected === c.id))) ? (
                  <path key={k} data-region={c.id} data-input={c.inputs[k]} data-active={s.inputActive?.[k] ? '1' : undefined} d={d} transform={at}
                    fill={s.inputActive?.[k] ? 'rgba(79,216,255,.32)' : tint ?? 'none'} fillOpacity={s.inputActive?.[k] ? 1 : 0.12}
                    stroke={s.inputActive?.[k] ? '#c9f7ff' : selected === c.id ? '#ffb547' : tint ?? 'none'} strokeWidth={s.inputActive?.[k] ? 2.2 : 1.2}
                    filter={s.inputActive?.[k] ? `url(#${glowId})` : undefined} />
                ) : null)}
              </g>
            );
          }
          if (photo && !c.region) return null; // photos: the marker below lights up
          if (!c.region) return s.active ? <circle key={`r-${c.id}`} data-glow={c.id} cx={c.anchor.x * 1000} cy={c.anchor.y * VH} r={16} fill="rgba(79,216,255,.35)" filter={`url(#${glowId})`} /> : null;
          const tint = s.tone === 'conflict' || s.tone === 'custom' ? TONE_STROKE[s.tone] : null;
          if (!s.active && !tint && selected !== c.id) return null;
          return (
            <path key={`r-${c.id}`} data-region={c.id} data-active={s.active ? '1' : undefined} d={c.region} transform={at} fillRule="nonzero"
              fill={s.active ? 'rgba(79,216,255,.32)' : tint ? tint : 'none'} fillOpacity={s.active ? 1 : 0.12}
              stroke={s.active ? '#c9f7ff' : selected === c.id ? '#ffb547' : tint ?? 'none'} strokeOpacity={s.active || selected === c.id ? 1 : 0.55}
              strokeWidth={s.active ? 2.2 : 1.2} filter={s.active ? `url(#${glowId})` : undefined} opacity={s.dim ? 0.3 : 1} />
          );
        })}
        {t.callouts.map((c) => {
          const s = stateOf(c);
          const col = s.active ? '#4fd8ff' : TONE_STROKE[s.tone];
          return (
            <g key={c.id} opacity={s.dim ? 0.25 : 1}>
              <line x1={c.anchor.x * 1000} y1={c.anchor.y * VH} x2={bx(c) * 1000} y2={by(c) * VH} stroke={col} strokeWidth={s.active || selected === c.id ? 2.5 : 1.4} />
              {photo ? (
                // glowing ring on the control; it lights up while the control is used
                <g data-marker={c.id} data-active={s.active ? '1' : undefined} filter={`url(#${glowId})`}>
                  <circle cx={c.anchor.x * 1000} cy={c.anchor.y * VH} r={s.active ? 17 : 11} fill={s.active ? 'rgba(79,216,255,.38)' : 'rgba(4,7,12,.35)'}
                    stroke={s.active ? '#c9f7ff' : selected === c.id ? '#ffb547' : col} strokeWidth={s.active ? 3 : 2} />
                  <circle cx={c.anchor.x * 1000} cy={c.anchor.y * VH} r={s.active ? 6 : 3.5} fill={s.active ? '#e6fbff' : col} />
                </g>
              ) : <circle cx={c.anchor.x * 1000} cy={c.anchor.y * VH} r={s.active ? 9 : 5} fill={s.active ? '#4fd8ff' : col} stroke="#04070c" strokeWidth={1.5} />}
            </g>
          );
        })}
      </svg>
      {editable && t.callouts.map((c) => (
        <span key={`a-${c.id}`} data-anchor={c.id} onPointerDown={start(c.id, 'anchor')} title="Drag the anchor point"
          className={`absolute z-10 h-4 w-4 -translate-x-1/2 -translate-y-1/2 cursor-move rounded-full border-2 ${selected === c.id ? 'border-mod bg-mod/40' : 'border-hud bg-hud/20'}`}
          style={{ left: `${c.anchor.x * 100}%`, top: `${c.anchor.y * 100}%` }} />
      ))}
      {t.callouts.map((c) => {
        const s = stateOf(c);
        return (
          <div key={c.id} data-callout={c.id} data-active={s.active ? '1' : undefined} data-dim={s.dim ? '1' : undefined} data-tone={s.tone} data-selected={selected === c.id ? '1' : undefined}
            onPointerDown={start(c.id, 'box')} onClick={(e) => e.stopPropagation()}
            className={`absolute z-20 -translate-x-1/2 -translate-y-1/2 ${editable ? 'cursor-move' : 'cursor-pointer'} ${s.dim ? 'opacity-30' : ''}`}
            style={{ ...scrollStyle, left: `${bx(c) * 100}%`, top: `${by(c) * 100}%` }}>
            <div className={`rounded-md border bg-panel/95 px-1.5 py-1 text-[10px] leading-tight shadow-lg transition ${TONE_CLS[s.tone]} ${s.active ? '!border-hud bg-[#0d3550] shadow-[0_0_14px_rgba(79,216,255,.55)]' : ''} ${selected === c.id ? 'ring-2 ring-mod/70' : ''}`}>
              {renderLabel(c, s)}
            </div>
          </div>
        );
      })}
    </div>
  );
  if (!layoutW) return canvas;
  // The canvas is out of flow either way, so its layout width cannot widen the column: the frame's width is the column.
  // scale 1 draws at that width with no transform. scale < 1 shrinks the layout width down to the column.
  return (
    <div ref={frameRef} data-testid="device-canvas-frame" className="relative w-full min-w-0 overflow-hidden" style={{ height: scaled ? fit.frameH : layoutH }}>
      {scaled ? (
        <div className="absolute left-0 top-0" style={{ width: layoutW, height: layoutH, transform: `scale(${fit.scale})`, transformOrigin: 'top left' }}>
          {canvas}
        </div>
      ) : (
        <div className="absolute left-0 top-0" style={{ width: layoutW, height: layoutH }}>
          {canvas}
        </div>
      )}
    </div>
  );
}

/** a bound action's row firing right now (its input pressed, its modifier layer held): tinted row + bright text and a hud bar on
 *  its left, the same accent as the pressed callout. Same padding either way, so lighting up never shifts the label. */
export const LIVE_ROW = 'bg-hud/25 !text-[#e6fbff] shadow-[inset_2px_0_0_var(--color-hud)]';
/** which of these entries fire right now (see firingRows) */
export const firingEntries = (es: readonly Entry[], live: Live, keyMods?: ReadonlySet<string>) =>
  firingRows(es, (e) => ({ main: splitCombo(e.b.input).main, prefix: e.prefix }), live, keyMods);

function ActionLine({ e, role, on }: { e: Entry; role?: string; on?: boolean }) {
  return (
    <div data-row-live={on ? '1' : undefined} data-row-input={e.b.input} className={`-mx-0.5 max-w-[184px] truncate rounded-sm px-0.5 transition-colors duration-150 ${e.conflict ? 'text-alert' : e.b.custom ? 'text-mod' : 'text-slate-300'} ${on ? LIVE_ROW : ''}`} title={`${e.row.label} · ${e.row.mapLabel}${e.prefix ? ` · with ${e.prefix}` : ''}${e.b.mode ? ` · ${e.b.mode}` : ''}${e.conflict ? ' · conflict' : ''}${on ? ' · firing now' : ''}`}>
      {role && <span className={`mr-1 font-mono ${on ? 'text-hud2' : 'text-slate-500'}`}>{role}</span>}
      {e.prefix && <span className={`mr-0.5 font-mono text-[9px] ${on ? 'text-hud2' : 'text-hud/70'}`}>{e.prefix}+</span>}
      {e.conflict && <Ico name="alert" className="mr-0.5 h-[1em] w-[1em]" />}{e.row.label}
    </div>
  );
}
/** "+N more" under a compact list; names how many of the hidden rows fire right now (when more fire than fit) */
function More({ n, live }: { n: number; live: number }) {
  return <div className={live ? 'text-hud2' : 'text-slate-500'} data-more-live={live || undefined}>+{n} more{live ? ` · ${live} firing` : ''}</div>;
}

/** body of a callout label: title, then per kind the bound actions (hat as a 5-way cross, axis with its live value). keyMods: the
 *  keyboard modifiers held (rows with a keyboard modifier light only while it is held) */
export function CalloutBody({ c, s, entriesFor, live, keyMods }: { c: Callout; s: CalloutState; entriesFor: (input: string) => Entry[]; live: Live; keyMods?: ReadonlySet<string> }) {
  const firing = s.active ? firingEntries(coveredInputs(c).flatMap(entriesFor), live, keyMods) : NO_FIRING;
  const head = (
    <div className="flex items-baseline gap-1 whitespace-nowrap">
      <b className={`font-mono ${s.active ? 'text-white' : 'text-hud2'}`}>{calloutTitle(c)}</b>
      {c.label && <span className="font-mono text-[9px] text-slate-500">{c.inputs.every((i) => !i) ? 'no number yet' : c.inputs.length > 4 ? runOf(c.inputs) : c.inputs.map(shortInput).join(' ')}</span>}
    </div>
  );
  const none = <div className="text-slate-600">unbound</div>;
  if (c.kind === 'hat') {
    const cell = (k: number) => {
      const i = c.inputs[k];
      if (!i) return k < c.inputs.length ? <span className="text-center font-mono text-slate-600" data-unassigned="1" title="no button number yet">{inputRole(c, k)}?</span> : <span />;
      const es = entriesFor(i);
      const on = live.active.has(i);
      // pressed: the action that fires (e.g. the LB layer's while LB is held), else the first one bound
      const e = (on ? es.find((x) => firing.has(x)) : undefined) ?? es[0];
      return (
        <span data-dir={i} data-active={on ? '1' : undefined} className={`flex min-w-0 items-center justify-center gap-0.5 truncate rounded px-0.5 ${on ? 'bg-hud text-black' : e ? (e.conflict ? 'text-alert' : e.b.custom ? 'text-mod' : 'text-slate-300') : 'text-slate-600'}`} data-row-live={on && firing.has(e) ? '1' : undefined} title={i + (e ? ` · ${es.map((x) => `${x.prefix ? `${x.prefix}+` : ''}${x.row.label}`).join(', ')}` : '')}>
          <span className="font-mono">{inputRole(c, k)}{/^button\d+$/.test(i) ? shortInput(i) : ''}</span><span className="truncate">{e ? `${e.prefix ? `${e.prefix}+` : ''}${e.row.label}` : ''}</span>
        </span>
      );
    };
    return (
      <div className="w-[210px]">
        {head}
        <div className="mt-0.5 grid grid-cols-3 gap-0.5 text-[9px]">
          <span />{cell(0)}<span />
          {cell(3)}{c.inputs[4] ? cell(4) : <span className="text-center text-slate-600"><Ico name="dot" className="h-2 w-2" /></span>}{cell(1)}
          <span />{cell(2)}<span />
        </div>
      </div>
    );
  }
  if (c.kind === 'axis') {
    return (
      <div className="min-w-[120px]">
        {head}
        {c.inputs.map((i) => {
          const v = live.values[i];
          const es = [...entriesFor(i), ...coveredInputs({ inputs: [i] }).slice(1).flatMap(entriesFor)];
          const rows = liveFirst(es, (e) => firing.has(e), 2);
          return (
            <div key={i} className="mt-0.5">
              <div className="flex items-center gap-1">
                {c.inputs.length > 1 && <span className="w-5 font-mono text-[9px] text-slate-500">{shortInput(i)}</span>}
                <span className="relative h-1.5 w-24 rounded bg-black/60" data-axis-live={i} data-value={v === undefined ? undefined : v.toFixed(2)}>
                  <span className="absolute top-0 h-1.5 w-px bg-slate-500" style={{ left: '50%' }} />
                  {v !== undefined && <span className="absolute top-[-2px] h-2.5 w-1 rounded bg-hud" style={{ left: `calc(${((v + 1) / 2) * 100}% - 2px)` }} />}
                </span>
              </div>
              {rows.shown.map((e, k) => <ActionLine key={k} e={e} on={firing.has(e)} />)}
              {rows.hidden > 0 && <More n={rows.hidden} live={rows.hiddenLive} />}
            </div>
          );
        })}
        {!c.inputs.some((i) => entriesFor(i).length) && none}
      </div>
    );
  }
  const multi = c.kind === 'encoder' || c.kind === 'switch' || c.kind === 'buttons';
  // buttons: show the real DI numbers only (not invented 1..n row indices — those confuse when inputs are non-consecutive)
  const chipLabel = (i: string, k: number) => c.kind === 'buttons' ? shortInput(i) : `${inputRole(c, k)} ${shortInput(i)}`;
  const all = c.inputs.flatMap((i, k) => coveredInputs({ inputs: [i] }).flatMap(entriesFor).map((e) => ({ e, role: c.kind === 'buttons' ? shortInput(i) : multi ? inputRole(c, k) : undefined, i })));
  const rows = liveFirst(all, ({ e }) => firing.has(e), 3);
  const long = multi && c.inputs.length > 8;
  return (
    <div className="min-w-[90px]">
      {head}
      {/* long rows (keypads, MFD bezels, up to 32): an even 8-wide grid of chips, so 20-32 keys read as tidy lines */}
      {multi && <div className={long ? 'grid w-[184px] grid-cols-8 gap-0.5' : 'flex max-w-[150px] flex-wrap gap-0.5'} data-chips={c.inputs.length}>{c.inputs.map((i, k) => <span key={k} data-dir={i || undefined} data-active={live.active.has(i) ? '1' : undefined} title={long ? `${c.kind === 'switch' ? `Position ${k + 1}` : `Button ${k + 1}`}: ${i || 'not set'}` : undefined} className={`rounded font-mono text-[9px] ${long ? 'px-0.5 text-center' : 'px-1'} ${live.active.has(i) ? 'bg-hud text-black' : 'bg-black/40 text-slate-400'}`}>{chipLabel(i, k)}</span>)}</div>}
      {rows.shown.map(({ e, role }, k) => <ActionLine key={k} e={e} role={role} on={firing.has(e)} />)}
      {rows.hidden > 0 && <More n={rows.hidden} live={rows.hiddenLive} />}
      {!all.length && none}
    </div>
  );
}
const NO_FIRING: ReadonlySet<Entry> = new Set();
/** compact summary of a long row's buttons for the callout head: "1–20" when they are consecutive joystick buttons, else '' */
function runOf(inputs: readonly string[]): string {
  const n = inputs.map((i) => Number(/^button(\d+)$/.exec(i)?.[1] ?? NaN));
  if (n.some((x) => !Number.isFinite(x))) return '';
  const up = n.every((x, k) => !k || x === n[k - 1] + 1), down = n.every((x, k) => !k || x === n[k - 1] - 1);
  return up || down ? `${n[0]}–${n[n.length - 1]}` : '';
}
