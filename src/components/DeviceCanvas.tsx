import { useEffect, useRef, useState, type ReactNode } from 'react';
import { isHatRest, snapshot } from '../lib/capture';
import { getPads, type PadInfo } from '../lib/devices';
import { calloutTitle, coveredInputs, inputRole, liveInputs, shortInput, type Callout, type DeviceTemplate, type Pt } from '../lib/templates';
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

export interface CalloutState { tone: Tone; active: boolean; dim?: boolean }
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
}

/** device image with callout anchors, leader lines and label boxes (positions are fractions of the canvas) */
export function DeviceCanvas({ template: t, stateOf, renderLabel, selected, onSelect, editable, onMove, onDragStart, onCanvasClick, minWidth = 860 }: Props) {
  const ref = useRef<HTMLDivElement>(null);
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
  return (
    <div ref={ref} data-testid="device-canvas" className={`relative w-full select-none overflow-hidden rounded-lg border border-edge/70 ${t.image ? 'bg-black/30' : 'bg-[length:24px_24px] bg-[linear-gradient(rgba(79,216,255,.06)_1px,transparent_1px),linear-gradient(90deg,rgba(79,216,255,.06)_1px,transparent_1px)]'} ${editable ? 'cursor-crosshair' : ''}`}
      style={{ aspectRatio: String(t.aspect), minWidth }}
      onClick={(e) => {
        if (!editable || !onCanvasClick) return;
        if (e.target === e.currentTarget || (e.target as Element).getAttribute?.('data-bg') === '1') onCanvasClick(at(e));
      }}>
      {t.image && <img src={t.image} alt="" data-bg="1" draggable={false} className="absolute inset-0 h-full w-full object-fill" />}
      <svg viewBox={`0 0 1000 ${VH}`} preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full">
        {t.callouts.map((c) => {
          const s = stateOf(c);
          const col = s.active ? '#4fd8ff' : TONE_STROKE[s.tone];
          return (
            <g key={c.id} opacity={s.dim ? 0.25 : 1}>
              <line x1={c.anchor.x * 1000} y1={c.anchor.y * VH} x2={c.box.x * 1000} y2={c.box.y * VH} stroke={col} strokeWidth={s.active || selected === c.id ? 2.5 : 1.4} />
              <circle cx={c.anchor.x * 1000} cy={c.anchor.y * VH} r={s.active ? 9 : 5} fill={s.active ? '#4fd8ff' : col} stroke="#04070c" strokeWidth={1.5} />
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
            style={{ left: `${c.box.x * 100}%`, top: `${c.box.y * 100}%` }}>
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
      {c.label && <span className="font-mono text-[9px] text-slate-500">{c.inputs.length > 4 ? '' : c.inputs.map(shortInput).join(' ')}</span>}
    </div>
  );
  const none = <div className="text-slate-600">unbound</div>;
  if (c.kind === 'hat') {
    const cell = (k: number) => {
      const i = c.inputs[k];
      if (!i) return <span />;
      const e = entriesFor(i)[0];
      const on = live.active.has(i);
      return (
        <span data-dir={i} data-active={on ? '1' : undefined} className={`flex min-w-0 items-center justify-center gap-0.5 truncate rounded px-0.5 ${on ? 'bg-hud text-black' : e ? (e.conflict ? 'text-alert' : e.b.custom ? 'text-mod' : 'text-slate-300') : 'text-slate-600'}`} title={i + (e ? ` · ${entriesFor(i).map((x) => x.row.label).join(', ')}` : '')}>
          <span className="font-mono">{inputRole(c, k)}</span><span className="truncate">{e ? e.row.label : ''}</span>
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
  const multi = c.kind === 'encoder' || c.kind === 'switch';
  const all = c.inputs.flatMap((i, k) => coveredInputs({ inputs: [i] }).flatMap(entriesFor).map((e) => ({ e, role: multi ? inputRole(c, k) : undefined, i })));
  return (
    <div className="min-w-[90px]">
      {head}
      {multi && <div className="flex gap-0.5">{c.inputs.map((i, k) => <span key={i} data-dir={i} data-active={live.active.has(i) ? '1' : undefined} className={`rounded px-1 font-mono text-[9px] ${live.active.has(i) ? 'bg-hud text-black' : 'bg-black/40 text-slate-400'}`}>{inputRole(c, k)} {shortInput(i)}</span>)}</div>}
      {all.slice(0, 3).map(({ e, role }, k) => <ActionLine key={k} e={e} role={role} />)}
      {all.length > 3 && <div className="text-slate-500">+{all.length - 3} more</div>}
      {!all.length && none}
    </div>
  );
}

