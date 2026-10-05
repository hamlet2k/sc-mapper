import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { isHatRest, snapshot } from '../lib/capture';
import { getPads, type PadInfo } from '../lib/devices';
import { BUILTIN_PHOTO_RE, calloutTitle, coveredInputs, imageSrc, inputRole, liveInputs, shortInput, viewTemplate, type Callout, type DeviceTemplate, type Pt } from '../lib/templates';
import type { Binding, Row } from '../lib/types';

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
}
/** photo views: height (px) a view keeps before the views wrap under each other, and the largest one when stacked. High on
 * purpose: in a usual window two views do not fit side by side at that height, so they stack and each photo gets the full width
 * (the device is the hero, the labels sit around it); very wide windows show them side by side. */
const VIEW_MIN_H = 440, VIEW_MAX_H = 720;
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
  return (
    <div data-testid="device-canvas" data-views={shown.length} className="flex w-full flex-wrap items-start justify-center gap-3" style={{ minWidth: Math.min(minWidth, 420) }}>
      {shown.map((v) => {
        const a = v.width / v.height;
        return (
          <div key={v.id} className="min-w-0" style={{ flex: `${a} 1 ${Math.round(a * VIEW_MIN_H)}px`, maxWidth: Math.round(a * VIEW_MAX_H) }}>
            <ViewCanvas {...props} template={viewTemplate(t, v.id)} photo caption={t.views!.length > 1 ? v.label : undefined} viewId={v.id} minWidth={0} />
          </div>
        );
      })}
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
  // view mode: label boxes grow with their bindings, so push overlapping boxes apart (vertically) to keep every label readable
  const [nudge, setNudge] = useState<Record<string, number>>({});
  const relayout = useRef<() => void>(() => {});
  relayout.current = () => {
    const root = ref.current;
    if (!root || editable) { if (Object.keys(nudge).length) setNudge({}); return; }
    const W = root.clientWidth, H = root.clientHeight;
    if (!W || !H) return;
    const items = t.callouts.flatMap((c) => {
      const el = root.querySelector<HTMLElement>(`[data-callout="${CSS.escape(c.id)}"]`);
      if (!el) return [];
      const w = el.offsetWidth, h = el.offsetHeight;
      // keep the box inside the canvas horizontally (wide labels in a narrow label gutter would be cut off at the edge)
      const x0 = c.box.x * W - w / 2, dx = x0 < 2 ? Math.min(2 - x0, W - 2 - (x0 + w)) : x0 + w > W - 2 ? Math.max(W - 2 - (x0 + w), 2 - x0) : 0;
      return [{ id: c.id, x0: x0 + dx, x1: x0 + w + dx, dx, y: c.box.y * H, h }];
    }).sort((a, b) => a.y - b.y);
    const gap = 3, placed: typeof items = [];
    for (const it of items) { // top-down: below any earlier box it overlaps horizontally
      it.y = Math.max(it.y, it.h / 2 + 2); // not above the canvas top
      for (const p of placed) if (it.x0 < p.x1 - 1 && p.x0 < it.x1 - 1 && it.y - it.h / 2 < p.y + p.h / 2 + gap) it.y = p.y + p.h / 2 + gap + it.h / 2;
      placed.push(it);
    }
    for (let i = placed.length - 1; i >= 0; i--) { // bottom-up: keep boxes inside the canvas
      const it = placed[i];
      it.y = Math.min(it.y, H - it.h / 2 - 2);
      for (let j = i + 1; j < placed.length; j++) { const p = placed[j]; if (it.x0 < p.x1 - 1 && p.x0 < it.x1 - 1 && it.y + it.h / 2 > p.y - p.h / 2 - gap) it.y = p.y - p.h / 2 - gap - it.h / 2; }
    }
    const next: Record<string, number> = {};
    for (const it of placed) { const c = t.callouts.find((x) => x.id === it.id)!; const d = it.y / H - c.box.y; if (Math.abs(d) > 0.0005) next[it.id] = d; if (Math.abs(it.dx) > 0.5) next[`x:${it.id}`] = it.dx / W; }
    const same = Object.keys(next).length === Object.keys(nudge).length && Object.entries(next).every(([k, v]) => Math.abs((nudge[k] ?? 99) - v) < 0.001);
    if (!same) setNudge(next);
  };
  useLayoutEffect(() => { relayout.current(); });
  useEffect(() => {
    const root = ref.current;
    if (!root || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => relayout.current());
    ro.observe(root);
    return () => ro.disconnect();
  }, []);
  const by = (c: { id: string; box: Pt }) => c.box.y + (editable ? 0 : nudge[c.id] ?? 0);
  const bx = (c: { id: string; box: Pt }) => c.box.x + (editable ? 0 : nudge[`x:${c.id}`] ?? 0);
  const focused = !!viewId && pulse?.view === viewId;
  return (
    <div ref={ref} data-testid={viewId ? 'device-canvas-view' : 'device-canvas'} data-view={viewId} data-photo={photo ? '1' : undefined} data-focused={focused ? '1' : undefined}
      className={`relative w-full select-none overflow-hidden rounded-lg border border-edge/70 ${photo ? '' : t.image ? 'bg-black/30' : 'bg-[length:24px_24px] bg-[linear-gradient(rgba(79,216,255,.06)_1px,transparent_1px),linear-gradient(90deg,rgba(79,216,255,.06)_1px,transparent_1px)]'} ${editable ? 'cursor-crosshair' : ''}`}
      style={{ aspectRatio: String(t.aspect), minWidth, ...(photo ? { backgroundImage: PHOTO_BG } : {}) }}
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
          <div key={c.id} data-callout={c.id} data-active={s.active ? '1' : undefined} data-tone={s.tone}
            onPointerDown={start(c.id, 'box')} onClick={(e) => e.stopPropagation()}
            className={`absolute z-20 -translate-x-1/2 -translate-y-1/2 ${editable ? 'cursor-move' : 'cursor-pointer'} ${s.dim ? 'opacity-30' : ''}`}
            style={{ left: `${bx(c) * 100}%`, top: `${by(c) * 100}%` }}>
            <div className={`rounded-md border bg-panel/95 px-1.5 py-1 text-[10px] leading-tight shadow-lg transition ${TONE_CLS[s.tone]} ${s.active ? '!border-hud bg-[#0d3550] shadow-[0_0_14px_rgba(79,216,255,.55)]' : ''} ${selected === c.id ? 'ring-2 ring-mod/70' : ''}`}>
              {renderLabel(c, s)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ActionLine({ e, role }: { e: Entry; role?: string }) {
  return (
    <div className={`max-w-[180px] truncate ${e.conflict ? 'text-alert' : e.b.custom ? 'text-mod' : 'text-slate-300'}`} title={`${e.row.label} · ${e.row.mapLabel}${e.prefix ? ` · with ${e.prefix}` : ''}${e.b.mode ? ` · ${e.b.mode}` : ''}${e.conflict ? ' · conflict' : ''}`}>
      {role && <span className="mr-1 font-mono text-slate-500">{role}</span>}
      {e.prefix && <span className="mr-0.5 font-mono text-[9px] text-hud/70">{e.prefix}+</span>}
      {e.conflict && '⚠ '}{e.row.label}
    </div>
  );
}

/** body of a callout label: title, then per kind the bound actions (hat as a 5-way cross, axis with its live value) */
export function CalloutBody({ c, s, entriesFor, live }: { c: Callout; s: CalloutState; entriesFor: (input: string) => Entry[]; live: Live }) {
  const head = (
    <div className="flex items-baseline gap-1 whitespace-nowrap">
      <b className={`font-mono ${s.active ? 'text-white' : 'text-hud2'}`}>{calloutTitle(c)}</b>
      {c.label && <span className="font-mono text-[9px] text-slate-500">{c.inputs.every((i) => !i) ? 'no number yet' : c.inputs.length > 4 ? '' : c.inputs.map(shortInput).join(' ')}</span>}
    </div>
  );
  const none = <div className="text-slate-600">unbound</div>;
  if (c.kind === 'hat') {
    const cell = (k: number) => {
      const i = c.inputs[k];
      if (!i) return k < c.inputs.length ? <span className="text-center font-mono text-slate-600" data-unassigned="1" title="no button number yet">{inputRole(c, k)}?</span> : <span />;
      const e = entriesFor(i)[0];
      const on = live.active.has(i);
      return (
        <span data-dir={i} data-active={on ? '1' : undefined} className={`flex min-w-0 items-center justify-center gap-0.5 truncate rounded px-0.5 ${on ? 'bg-hud text-black' : e ? (e.conflict ? 'text-alert' : e.b.custom ? 'text-mod' : 'text-slate-300') : 'text-slate-600'}`} title={i + (e ? ` · ${entriesFor(i).map((x) => x.row.label).join(', ')}` : '')}>
          <span className="font-mono">{inputRole(c, k)}{/^button\d+$/.test(i) ? shortInput(i) : ''}</span><span className="truncate">{e ? e.row.label : ''}</span>
        </span>
      );
    };
    return (
      <div className="w-[210px]">
        {head}
        <div className="mt-0.5 grid grid-cols-3 gap-0.5 text-[9px]">
          <span />{cell(0)}<span />
          {cell(3)}{c.inputs[4] ? cell(4) : <span className="text-center text-slate-600">●</span>}{cell(1)}
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
          return (
            <div key={i} className="mt-0.5">
              <div className="flex items-center gap-1">
                {c.inputs.length > 1 && <span className="w-5 font-mono text-[9px] text-slate-500">{shortInput(i)}</span>}
                <span className="relative h-1.5 w-24 rounded bg-black/60" data-axis-live={i} data-value={v === undefined ? undefined : v.toFixed(2)}>
                  <span className="absolute top-0 h-1.5 w-px bg-slate-500" style={{ left: '50%' }} />
                  {v !== undefined && <span className="absolute top-[-2px] h-2.5 w-1 rounded bg-hud" style={{ left: `calc(${((v + 1) / 2) * 100}% - 2px)` }} />}
                </span>
              </div>
              {es.slice(0, 2).map((e, k) => <ActionLine key={k} e={e} />)}
              {es.length > 2 && <div className="text-slate-500">+{es.length - 2} more</div>}
            </div>
          );
        })}
        {!c.inputs.some((i) => entriesFor(i).length) && none}
      </div>
    );
  }
  const multi = c.kind === 'encoder' || c.kind === 'switch' || c.kind === 'buttons';
  const all = c.inputs.flatMap((i, k) => coveredInputs({ inputs: [i] }).flatMap(entriesFor).map((e) => ({ e, role: multi ? inputRole(c, k) : undefined, i })));
  return (
    <div className="min-w-[90px]">
      {head}
      {multi && <div className="flex max-w-[150px] flex-wrap gap-0.5">{c.inputs.map((i, k) => <span key={k} data-dir={i || undefined} data-active={live.active.has(i) ? '1' : undefined} className={`rounded px-1 font-mono text-[9px] ${live.active.has(i) ? 'bg-hud text-black' : 'bg-black/40 text-slate-400'}`}>{inputRole(c, k)} {shortInput(i)}</span>)}</div>}
      {all.slice(0, 3).map(({ e, role }, k) => <ActionLine key={k} e={e} role={role} />)}
      {all.length > 3 && <div className="text-slate-500">+{all.length - 3} more</div>}
      {!all.length && none}
    </div>
  );
}

