import { useMemo, useState } from 'react';
import { isModifier, keyLabel, normalizeCombo, tokens } from '../lib/inputs';
import type { Binding, Row } from '../lib/types';

type K = { k: string; w?: number; label?: string } | { gap: number };
const g = (n: number): K => ({ gap: n });
const keys = (s: string) => s.split(' ').map((k) => ({ k }));

const MAIN: K[][] = [
  [{ k: 'escape' }, g(1), ...keys('f1 f2 f3 f4'), g(0.5), ...keys('f5 f6 f7 f8'), g(0.5), ...keys('f9 f10 f11 f12')],
  [{ k: 'grave' }, ...keys('1 2 3 4 5 6 7 8 9 0'), { k: 'minus' }, { k: 'equals' }, { k: 'backspace', w: 2 }],
  [{ k: 'tab', w: 1.5 }, ...keys('q w e r t y u i o p'), { k: 'lbracket' }, { k: 'rbracket' }, { k: 'backslash', w: 1.5 }],
  [{ k: 'capslock', w: 1.75 }, ...keys('a s d f g h j k l'), { k: 'semicolon' }, { k: 'apostrophe' }, { k: 'enter', w: 2.25 }],
  [{ k: 'lshift', w: 2.25 }, ...keys('z x c v b n m'), { k: 'comma' }, { k: 'period' }, { k: 'slash' }, { k: 'rshift', w: 2.75 }],
  [{ k: 'lctrl', w: 1.25 }, { k: 'lwin', w: 1.25, label: 'Win' }, { k: 'lalt', w: 1.25 }, { k: 'space', w: 6.25 }, { k: 'ralt', w: 1.25 }, { k: 'rwin', w: 1.25, label: 'Win' }, { k: 'apps', w: 1.25, label: 'Menu' }, { k: 'rctrl', w: 1.25 }],
];
const NAV: K[][] = [
  keys('print scrolllock pause'),
  keys('insert home pgup'),
  keys('delete end pgdn'),
  [g(3)],
  [g(1), { k: 'up' }, g(1)],
  keys('left down right'),
];
// numpad as grid placements [key, col, row, colSpan, rowSpan]
const NUMPAD: [string, number, number, number, number][] = [
  ['numlock', 1, 3, 1, 1], ['np_divide', 2, 3, 1, 1], ['np_multiply', 3, 3, 1, 1], ['np_subtract', 4, 3, 1, 1],
  ['np_7', 1, 4, 1, 1], ['np_8', 2, 4, 1, 1], ['np_9', 3, 4, 1, 1], ['np_add', 4, 4, 1, 2],
  ['np_4', 1, 5, 1, 1], ['np_5', 2, 5, 1, 1], ['np_6', 3, 5, 1, 1],
  ['np_1', 1, 6, 1, 1], ['np_2', 2, 6, 1, 1], ['np_3', 3, 6, 1, 1], ['np_enter', 4, 6, 1, 2],
  ['np_0', 1, 7, 2, 1], ['np_period', 3, 7, 1, 1],
];
const MOUSE = ['mouse1', 'mouse3', 'mouse2', 'mwheel_up', 'mwheel_down', 'mouse4', 'mouse5'];
const MODS = ['', 'lalt', 'ralt', 'lctrl', 'rctrl', 'lshift', 'rshift'];

interface Hit { row: Row; b: Binding }
interface Props {
  rows: Row[];
  conflictRows: Map<string, Set<string>>;
  onPick: (combo: string) => void;
}

const U = 40; // px per key unit

export function KeyboardView({ rows, conflictRows, onPick }: Props) {
  const [mod, setMod] = useState('');
  const [focus, setFocus] = useState<string | null>(null);

  // combo -> hits (keyboard & mouse slot bindings)
  const index = useMemo(() => {
    const m = new Map<string, Hit[]>();
    for (const row of rows) {
      for (const b of row.bindings) {
        if (b.slot !== 'kb' && b.slot !== 'mo') continue;
        const c = normalizeCombo(b.input);
        const l = m.get(c) ?? [];
        l.push({ row, b });
        m.set(c, l);
      }
    }
    return m;
  }, [rows]);

  const modCounts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const [combo, hits] of index) {
      const t = tokens(combo);
      const mods = t.filter(isModifier);
      const key = mods.length === 1 && t.length > 1 ? mods[0] : mods.length === 0 ? '' : '_multi';
      out[key] = (out[key] ?? 0) + hits.length;
    }
    return out;
  }, [index]);

  const comboFor = (k: string) => (mod && k !== mod ? normalizeCombo(`${mod}+${k}`) : k);
  const hitsFor = (k: string) => index.get(comboFor(k)) ?? [];
  const otherMods = (k: string) => MODS.filter((m) => m && m !== mod && index.has(normalizeCombo(`${m}+${k}`))).length;

  const focusCombo = focus ? comboFor(focus) : null;
  const focusHits = focus ? hitsFor(focus) : [];

  const renderKey = (k: string, w = 1, label?: string, style?: React.CSSProperties) => {
    const hits = hitsFor(k);
    const n = hits.length;
    const conflict = hits.some((h) => conflictRows.get(h.row.id)?.has(h.b.phys));
    const custom = hits.some((h) => h.b.custom);
    const isActiveMod = mod === k;
    const om = otherMods(k);
    const heat = n === 0 ? '' : n === 1 ? 'bg-hud/15 border-hud/50 text-hud2' : n <= 3 ? 'bg-hud/25 border-hud/70 text-white' : 'bg-hud/40 border-hud text-white';
    return (
      <button
        key={k}
        type="button"
        onMouseEnter={() => setFocus(k)}
        onClick={() => (isModifier(k) ? setMod(mod === k ? '' : k) : onPick(comboFor(k)))}
        title={`${keyLabel(k, 'kb')}${mod && k !== mod ? ` with ${keyLabel(mod, 'kb')}` : ''}: ${n} action${n === 1 ? '' : 's'}`}
        className={`relative flex flex-col items-start justify-between overflow-hidden rounded-md border px-1.5 py-1 text-left transition
          ${heat || 'border-edge/70 bg-panel2/70 text-slate-500'}
          ${conflict ? '!border-alert shadow-[0_0_14px_-4px_var(--color-alert)]' : ''}
          ${isActiveMod ? '!border-mod !bg-mod/20 !text-mod' : ''}
          ${focus === k ? 'ring-1 ring-hud2' : ''}`}
        style={{ width: w * U - 4, height: U - 4, ...style }}
      >
        <span className="font-mono text-[11px] font-semibold leading-none">{label ?? keyLabel(k, 'kb')}</span>
        <span className="flex w-full items-center justify-between">
          {n > 0 ? <span className={`font-mono text-[9px] ${custom ? 'text-mod' : ''}`}>{n}</span> : <span />}
          {om > 0 && <span className="h-1 w-1 rounded-full bg-hud/50" title={`${om} other modifier combo(s)`} />}
        </span>
      </button>
    );
  };

  const renderRow = (row: K[], i: number) => (
    <div key={i} className="flex gap-1" style={{ height: U - 4 }}>
      {row.map((x, j) => ('gap' in x ? <div key={`g${j}`} style={{ width: x.gap * U - 4 }} /> : renderKey(x.k, x.w, x.label)))}
    </div>
  );

  return (
    <div className="flex flex-col gap-4 xl:flex-row">
      <div className="hud-panel hud-corners min-w-0 flex-1 overflow-x-auto rounded-lg p-4 scrollbar-thin">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-hud/70">Modifier</span>
          {MODS.map((m) => (
            <button key={m || 'none'} type="button" onClick={() => setMod(m)}
              className={`rounded border px-2 py-0.5 font-mono text-[11px] transition ${mod === m ? 'border-mod bg-mod/15 text-mod' : 'border-edge text-slate-400 hover:border-hud/60 hover:text-hud2'}`}>
              {m ? keyLabel(m, 'kb') : 'None'} <span className="text-slate-500">{modCounts[m] ?? 0}</span>
            </button>
          ))}
          <span className="ml-auto font-mono text-[10px] text-slate-500">hover a key · click to filter · click a modifier key to hold it</span>
        </div>
        <div className="flex w-max gap-4">
          <div className="flex flex-col gap-1">{MAIN.map((r, i) => <div key={i} className={i === 0 ? 'mb-2' : ''}>{renderRow(r, i)}</div>)}</div>
          <div className="flex flex-col gap-1">{NAV.map((r, i) => <div key={i} className={i === 0 ? 'mb-2' : ''}>{renderRow(r, i)}</div>)}</div>
          <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(4, ${U - 4}px)`, gridTemplateRows: `${U - 4}px 4px repeat(5, ${U - 4}px)` }}>
            {NUMPAD.map(([k, c, r, cs, rs]) =>
              renderKey(k, 1, undefined, { gridColumn: `${c} / span ${cs}`, gridRow: `${r} / span ${rs}`, width: '100%', height: '100%' }))}
          </div>
          <div className="flex flex-col gap-1">
            <div className="mb-2 font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-hud/60" style={{ height: U - 4 }}>Mouse</div>
            {MOUSE.map((k) => <div key={k}>{renderKey(k, 2)}</div>)}
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-4 font-mono text-[10px] text-slate-500">
          <span className="flex items-center gap-1"><span className="h-3 w-3 rounded border border-hud/50 bg-hud/15" /> 1 action</span>
          <span className="flex items-center gap-1"><span className="h-3 w-3 rounded border border-hud bg-hud/40" /> 4+ actions</span>
          <span className="flex items-center gap-1"><span className="h-3 w-3 rounded border border-alert" /> possible conflict</span>
          <span className="flex items-center gap-1"><span className="text-mod">n</span> includes customized</span>
          <span className="flex items-center gap-1"><span className="h-1 w-1 rounded-full bg-hud/50" /> also used with another modifier</span>
        </div>
      </div>
      <aside className="hud-panel w-full shrink-0 rounded-lg p-4 xl:w-80">
        <div className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-hud/70">Input inspector</div>
        {focusCombo ? (
          <>
            <div className="mt-2 flex flex-wrap items-center gap-1">
              {tokens(normalizeCombo(focusCombo)).map((t, i) => <span key={i} className="flex items-center gap-1">{i > 0 && <span className="text-slate-500">+</span>}<kbd className="keycap !text-sm">{keyLabel(t, 'kb')}</kbd></span>)}
              <span className="ml-2 font-mono text-xs text-slate-400">{focusHits.length} action{focusHits.length === 1 ? '' : 's'}</span>
            </div>
            <ul className="mt-3 max-h-[420px] space-y-1 overflow-y-auto pr-1 scrollbar-thin">
              {focusHits.map((h, i) => {
                const c = conflictRows.get(h.row.id)?.has(h.b.phys);
                return (
                  <li key={i} className={`rounded border px-2 py-1.5 ${c ? 'border-alert/60 bg-alert/5' : h.b.custom ? 'border-mod/40 bg-mod/5' : 'border-edge/60 bg-black/20'}`}>
                    <div className="text-sm text-slate-100">{h.row.label}</div>
                    <div className="font-mono text-[10px] text-slate-500">{h.row.mapLabel}{h.b.mode ? ` · ${h.b.mode}` : ''}{c ? ' · ⚠ conflict' : ''}</div>
                  </li>
                );
              })}
              {!focusHits.length && <li className="text-sm text-slate-500">Free — nothing bound here in the current view.</li>}
            </ul>
          </>
        ) : (
          <p className="mt-2 text-sm text-slate-500">Hover a key to see what it does. The keyboard reflects your current search, category and filters.</p>
        )}
      </aside>
    </div>
  );
}
