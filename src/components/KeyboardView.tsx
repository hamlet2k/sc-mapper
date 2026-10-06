import { useEffect, useMemo, useState } from 'react';
import { isModifier, keyLabel, normalizeCombo, searchSpec, tokens } from '../lib/inputs';
import type { Binding, Device, Row } from '../lib/types';
import { BindingChip } from './BindingChip';

type K = { k: string; w?: number; label?: string } | { gap: number };
const g = (n: number): K => ({ gap: n });
const keys = (s: string) => s.split(' ').map((k) => ({ k }));

const MAIN: K[][] = [
  [{ k: 'escape' }, g(1), ...keys('f1 f2 f3 f4'), g(0.5), ...keys('f5 f6 f7 f8'), g(0.5), ...keys('f9 f10 f11 f12')],
  [{ k: 'tilde' }, ...keys('1 2 3 4 5 6 7 8 9 0'), { k: 'minus' }, { k: 'equals' }, { k: 'backspace', w: 2 }],
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
  flash?: { combo: string; at: number } | null;
  kb?: number;
  mo?: number;
  /** Edit toggle: off = inspect only (click a key stays on this view); on = rebind / unbind / bind an action */
  editMode?: boolean;
  onEdit?: (row: Row) => void;
  onRemove?: (row: Row, b: Binding) => void;
  onBind?: (row: Row, slot: 'kb' | 'mo', instance: number, input: string) => void;
  onCapture?: (row: Row, device: Device, replace?: Binding) => void;
  onShowInList?: (spec: string) => void;
}

const U = 40;

export function KeyboardView({ rows, conflictRows, flash, kb = 1, mo = 1, editMode, onEdit, onRemove, onBind, onCapture, onShowInList }: Props) {
  const [mod, setMod] = useState('');
  /** sticky click selection (survives leaving the key); cleared by clicking the same key again or the board background */
  const [selected, setSelected] = useState<string | null>(null);
  /** live hover peek — wins over selected in the inspector while the pointer is over a key */
  const [hover, setHover] = useState<string | null>(null);
  const [q, setQ] = useState('');
  useEffect(() => {
    if (!flash) return;
    const t = tokens(normalizeCombo(flash.combo));
    const mods = t.filter(isModifier);
    const main = t.filter((x) => !isModifier(x));
    setMod(main.length && mods.length === 1 ? mods[0] : '');
    setSelected(main[main.length - 1] ?? mods[mods.length - 1] ?? null);
    setHover(null);
  }, [flash]);
  const focus = hover ?? selected;
  const flashKeys = new Set(flash ? tokens(flash.combo) : []);

  const index = useMemo(() => {
    const m = new Map<string, Hit[]>();
    for (const row of rows) {
      for (const b of row.bindings) {
        if (b.slot !== 'kb' && b.slot !== 'mo') continue;
        if ((b.instance || 1) !== (b.slot === 'kb' ? kb : mo)) continue;
        const c = normalizeCombo(b.input);
        const l = m.get(c) ?? [];
        l.push({ row, b });
        m.set(c, l);
      }
    }
    return m;
  }, [rows, kb, mo]);

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
  const focusSlot: 'kb' | 'mo' = focus && MOUSE.includes(focus) ? 'mo' : 'kb';
  const focusInst = focusSlot === 'mo' ? mo : kb;
  const focusDevice: Device = focusSlot === 'mo' ? 'mouse' : 'keyboard';

  const results = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!editMode || !focusCombo || t.length < 2) return [];
    return rows.filter((r) => !r.hidden && `${r.label} ${r.action} ${r.mapLabel}`.toLowerCase().includes(t)).slice(0, 8);
  }, [q, rows, editMode, focusCombo]);

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
        onMouseEnter={() => setHover(k)}
        onMouseLeave={() => setHover((h) => (h === k ? null : h))}
        onClick={(e) => {
          e.stopPropagation(); // don't clear selection via the board background handler
          // stay on the Keyboard view: modifiers hold a chord; other keys sticky-select (click again to clear)
          if (isModifier(k)) setMod(mod === k ? '' : k);
          else setSelected((s) => (s === k ? null : k));
        }}
        title={`${keyLabel(k, 'kb')}${mod && k !== mod ? ` with ${keyLabel(mod, 'kb')}` : ''}: ${n} action${n === 1 ? '' : 's'}`}
        aria-pressed={selected === k || undefined}
        data-selected={selected === k ? '1' : undefined}
        className={`relative flex flex-col items-start justify-between overflow-hidden rounded-md border px-1.5 py-1 text-left transition
          ${heat || 'border-edge/70 bg-panel2/70 text-slate-500'}
          ${conflict ? '!border-alert shadow-[0_0_14px_-4px_var(--color-alert)]' : ''}
          ${isActiveMod ? '!border-mod !bg-mod/20 !text-mod' : ''}
          ${selected === k ? 'ring-2 ring-hud2 ring-offset-1 ring-offset-void' : hover === k ? 'ring-1 ring-hud/50' : ''}
          ${flashKeys.has(k) ? 'flash-key' : ''}`}
        data-flash={flashKeys.has(k) ? '1' : undefined}
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
    <div className="flex flex-col gap-4 xl:flex-row" data-testid="keyboard-view">
      <div className="hud-panel hud-corners min-w-0 flex-1 overflow-x-auto rounded-lg p-4 scrollbar-thin" data-testid="keyboard-board" onClick={() => setSelected(null)}>
        <div className="mb-4 flex flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>
          {kb > 1 && <span className="rounded border border-hud/40 px-1.5 font-mono text-[11px] text-hud2" data-testid="kb-instance">kb{kb}</span>}
          <span className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-hud/70">Modifier</span>
          {MODS.map((m) => (
            <button key={m || 'none'} type="button" onClick={() => setMod(m)}
              className={`rounded border px-2 py-0.5 font-mono text-[11px] transition ${mod === m ? 'border-mod bg-mod/15 text-mod' : 'border-edge text-slate-400 hover:border-hud/60 hover:text-hud2'}`}>
              {m ? keyLabel(m, 'kb') : 'None'} <span className="text-slate-500">{modCounts[m] ?? 0}</span>
            </button>
          ))}
          <span className="ml-auto font-mono text-[10px] text-slate-500">click to select · hover to peek · empty area clears · modifier holds a chord</span>
        </div>
        <div className="flex w-max gap-4">
          <div className="flex flex-col gap-1">{MAIN.map((r, i) => <div key={i} className={i === 0 ? 'mb-2' : ''}>{renderRow(r, i)}</div>)}</div>
          <div className="flex flex-col gap-1">{NAV.map((r, i) => <div key={i} className={i === 0 ? 'mb-2' : ''}>{renderRow(r, i)}</div>)}</div>
          <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(4, ${U - 4}px)`, gridTemplateRows: `${U - 4}px 4px repeat(5, ${U - 4}px)` }}>
            {NUMPAD.map(([k, c, r, cs, rs]) =>
              renderKey(k, 1, undefined, { gridColumn: `${c} / span ${cs}`, gridRow: `${r} / span ${rs}`, width: '100%', height: '100%' }))}
          </div>
          <div className="flex flex-col gap-1">
            <div className="mb-2 font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-hud/60" style={{ height: U - 4 }}>Mouse{mo > 1 ? ` · mo${mo}` : ''}</div>
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
      <aside className="hud-panel w-full shrink-0 rounded-lg p-4 xl:w-80" data-testid="keyboard-inspector">
        <div className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-hud/70">Input inspector</div>
        {focusCombo ? (
          <>
            <div className="mt-2 flex flex-wrap items-center gap-1">
              {tokens(normalizeCombo(focusCombo)).map((t, i) => <span key={i} className="flex items-center gap-1">{i > 0 && <span className="text-slate-500">+</span>}<kbd className="keycap !text-sm">{keyLabel(t, 'kb')}</kbd></span>)}
              <span className="ml-2 font-mono text-xs text-slate-400">{focusHits.length} action{focusHits.length === 1 ? '' : 's'}</span>
              {onShowInList && (
                <button type="button" onClick={() => onShowInList(searchSpec(focusSlot, focusInst, focusCombo))}
                  className="ml-auto text-[10px] text-hud hover:underline" title="Filter the List to this exact input">show in list</button>
              )}
            </div>
            <ul className="mt-3 max-h-[320px] space-y-1.5 overflow-y-auto pr-1 scrollbar-thin">
              {focusHits.map((h, i) => {
                const c = conflictRows.get(h.row.id)?.has(h.b.phys);
                return (
                  <li key={i} className={`rounded border px-2 py-1.5 ${c ? 'border-alert/60 bg-alert/5' : h.b.custom ? 'border-mod/40 bg-mod/5' : 'border-edge/60 bg-black/20'}`}>
                    <div className="flex items-start gap-1.5">
                      <div className="min-w-0 flex-1">
                        <div className="text-sm text-slate-100">{h.row.label}</div>
                        <div className="font-mono text-[10px] text-slate-500">{h.row.mapLabel}{h.b.mode ? ` · ${h.b.mode}` : ''}{c ? ' · conflict' : ''}</div>
                      </div>
                      {editMode && onEdit && (
                        <button type="button" onClick={() => onEdit(h.row)} className="rounded border border-edge px-1.5 text-[10px] text-slate-300 hover:border-hud/60">Edit</button>
                      )}
                    </div>
                    {editMode && onCapture && onRemove ? (
                      <div className="mt-1.5">
                        <BindingChip b={h.b} conflict={c ? ['conflict'] : undefined}
                          onClick={(b) => onCapture(h.row, focusDevice, b)} onRemove={(b) => onRemove(h.row, b)} />
                      </div>
                    ) : null}
                  </li>
                );
              })}
              {!focusHits.length && <li className="text-sm text-slate-500">Free — nothing bound here in the current view.</li>}
            </ul>
            {editMode && onBind && (
              <div className="mt-3 border-t border-edge/50 pt-2" data-testid="keyboard-bind">
                <div className="text-[11px] text-slate-400">Bind an action to <code className="text-hud/90">{focusCombo}</code></div>
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="search actions…" aria-label="Search actions to bind"
                  className="mt-1 w-full rounded border border-edge bg-panel2 px-2 py-1 text-xs text-slate-200 placeholder:text-slate-600" />
                {results.length > 0 && (
                  <ul className="mt-1 space-y-0.5" data-testid="keyboard-bind-results">
                    {results.map((r) => (
                      <li key={r.id}>
                        <button type="button" onClick={() => { onBind(r, focusSlot, focusInst, focusCombo); setQ(''); }}
                          className="w-full truncate rounded px-1.5 py-1 text-left hover:bg-hud/10">
                          <span className="text-slate-200">{r.label}</span> <span className="text-[10px] text-slate-500">{r.mapLabel}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </>
        ) : (
          <p className="mt-2 text-sm text-slate-500">Click a key to select it{editMode ? ', then bind or unbind from here' : ''}; hover peeks without changing the selection. Click the same key or empty board to clear. The keyboard reflects your current search, category and filters.</p>
        )}
      </aside>
    </div>
  );
}
