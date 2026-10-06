import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  comboFrom, gamepadInput, GP_BUTTONS, joystickInput, MOUSE_AXES, PadTracker, parseManual, RESERVED_KEYS,
  scKeyFromCode, scMouseButton, scWheel, snapshot, type Candidate,
} from '../lib/capture';
import { getPads, type PadInfo, type PadKind, type PadLike } from '../lib/devices';
import { conflictsFor, type CaptureConflict } from '../lib/edit';
import { formatInput, GROUP_LABEL, isModifier, keyLabel, normalizeCombo, prettyMode, tokens } from '../lib/inputs';
import type { Group, ProfileDevice, Rebind, Row, Slot } from '../lib/types';
import { ChromiumBanner } from './ChromiumBanner';
import { DeviceList } from './ControllersPanel';
import { InputTester } from './InputTester';
import { Ico } from './icons';
import { useEscape } from './useEscape';

export const ACTIVATION_MODES = [
  'press', 'tap', 'hold', 'double_tap', 'double_tap_nonblocking', 'delayed_press', 'delayed_press_medium', 'delayed_press_long',
  'hold_toggle', 'smart_toggle', 'all', 'hold_no_retrigger', 'delayed_hold', 'delayed_hold_long', 'tap_quicker', 'press_quicker',
];

export interface CaptureRequest { row: Row; group: Group; replace?: Rebind; focus?: 'keyboard' | 'mouse' }
interface Props extends CaptureRequest {
  rows: Row[];
  pads: PadInfo[];
  /** describes raw Gamepad API devices (kind + instance) using the current assignments; called every frame */
  describe: (list: readonly PadLike[]) => PadInfo[];
  profileDevices?: readonly ProfileDevice[];
  onAssign: (key: string, v: { kind?: PadKind; instance?: number }) => void;
  onCommit: (r: Rebind, removeFrom: CaptureConflict[]) => void;
  onClear?: () => void;
  onCancel: () => void;
  /** the profile's keyboard / mouse slots (kb1, kb2… / mo1, mo2…): with several, the capture lets you pick which one */
  kmSlots?: { kb: number[]; mo: number[] };
  /** the slot picked by default (the one the Keyboard view shows) */
  kmDefault?: { kb: number; mo: number };
}

interface Pending { rebind: Rebind; alt?: Candidate['alt']; warning?: string }

export function CaptureDialog({ row, group, replace, focus, rows, pads, describe, profileDevices, onAssign, onCommit, onClear, onCancel, kmSlots, kmDefault }: Props) {
  const kbList = kmSlots?.kb.length ? kmSlots.kb : [1], moList = kmSlots?.mo.length ? kmSlots.mo : [1];
  const [kbInst, setKbInst] = useState(() => (replace?.slot === 'kb' ? replace.instance : kmDefault?.kb) || 1);
  const [moInst, setMoInst] = useState(() => (replace?.slot === 'mo' ? replace.instance : kmDefault?.mo) || 1);
  useEscape(onCancel);
  const km = useRef({ kb: kbInst, mo: moInst });
  useEffect(() => { km.current = { kb: kbInst, mo: moInst }; }, [kbInst, moInst]);
  const [mode, setMode] = useState<string>(replace?.mode ?? '');
  const [multiTap, setMultiTap] = useState<number>(replace?.multiTap ?? 1);
  const [held, setHeld] = useState<string[]>([]);
  const [pending, setPending] = useState<Pending | null>(null);
  const [manual, setManual] = useState('');
  const [note, setNote] = useState<string | null>(null);
  const [activity, setActivity] = useState<Record<string, number>>({});
  const [showTester, setShowTester] = useState(false);
  const heldRef = useRef<string[]>([]);
  const usedMain = useRef(false);
  const padRef = useRef<HTMLDivElement>(null);
  const listening = !pending;

  const finish = useCallback((rb: Rebind, extra?: Omit<Pending, 'rebind'>) => {
    const r: Rebind = { ...rb, ...(mode ? { mode } : {}), ...(multiTap > 1 ? { multiTap } : {}) };
    if (replace?.defaultInput !== undefined && r.defaultInput === undefined) r.defaultInput = replace.defaultInput;
    const conflicts = conflictsFor(rows, row, r, mode || row.mode);
    if (!conflicts.length && !extra?.alt && !extra?.warning) onCommit(r, []);
    else setPending({ rebind: r, ...extra });
  }, [mode, multiTap, replace, rows, row, onCommit]);

  // ---------------- keyboard + mouse
  useEffect(() => {
    if (group !== 'km' || !listening) return;
    const isField = (e: Event) => ['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName);
    const down = (e: KeyboardEvent) => {
      if (isField(e)) { if (e.key === 'Escape') { e.preventDefault(); onCancel(); } return; }
      e.preventDefault(); e.stopImmediatePropagation();
      if (e.repeat) return;
      const name = scKeyFromCode(e.code);
      if (e.code === 'Escape' && !heldRef.current.length) { onCancel(); return; }
      if (!name) { setNote(`"${e.code || e.key}" has no Star Citizen key name. Use manual entry if you need it.`); return; }
      if (RESERVED_KEYS.has(name)) setNote(`${keyLabel(name, 'kb')} is reserved by the game/OS and may not work.`);
      if (isModifier(name)) {
        // AltGr arrives as LCtrl + RAlt; drop the synthetic LCtrl
        const h = name === 'ralt' ? heldRef.current.filter((m) => m !== 'lctrl') : heldRef.current;
        heldRef.current = h.includes(name) ? h : [...h, name];
        setHeld(heldRef.current);
        return;
      }
      usedMain.current = true;
      finish({ slot: 'kb', instance: km.current.kb, input: comboFrom(heldRef.current, name) });
    };
    const up = (e: KeyboardEvent) => {
      if (isField(e)) return;
      e.preventDefault(); e.stopImmediatePropagation();
      const name = scKeyFromCode(e.code);
      if (name === 'print' && !usedMain.current) { finish({ slot: 'kb', instance: km.current.kb, input: comboFrom(heldRef.current, 'print') }); return; }
      if (name && isModifier(name) && heldRef.current.includes(name)) {
        if (!usedMain.current) { finish({ slot: 'kb', instance: km.current.kb, input: comboFrom(heldRef.current) }); }
        heldRef.current = heldRef.current.filter((m) => m !== name);
        setHeld(heldRef.current);
        if (!heldRef.current.length) usedMain.current = false;
      }
    };
    const blur = () => { heldRef.current = []; setHeld([]); usedMain.current = false; };
    window.addEventListener('keydown', down, true);
    window.addEventListener('keyup', up, true);
    window.addEventListener('blur', blur);
    return () => { window.removeEventListener('keydown', down, true); window.removeEventListener('keyup', up, true); window.removeEventListener('blur', blur); };
  }, [group, listening, finish, onCancel]);

  useEffect(() => {
    const el = padRef.current;
    if (!el || group !== 'km' || !listening) return;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      const n = scWheel(e.deltaY);
      if (n) finish(heldRef.current.length ? { slot: 'kb', instance: km.current.kb, input: comboFrom(heldRef.current, n) } : { slot: 'mo', instance: km.current.mo, input: n });
    };
    const stop = (e: Event) => e.preventDefault();
    el.addEventListener('wheel', wheel, { passive: false });
    el.addEventListener('contextmenu', stop);
    el.addEventListener('auxclick', stop);
    el.addEventListener('mouseup', stop);
    return () => { el.removeEventListener('wheel', wheel); el.removeEventListener('contextmenu', stop); el.removeEventListener('auxclick', stop); el.removeEventListener('mouseup', stop); };
  }, [group, listening, finish]);

  const onPadMouse = (e: React.MouseEvent) => {
    e.preventDefault();
    const n = scMouseButton(e.button);
    if (n) finish(heldRef.current.length ? { slot: 'kb', instance: km.current.kb, input: comboFrom(heldRef.current, n) } : { slot: 'mo', instance: km.current.mo, input: n });
  };

  // ---------------- gamepad / joystick polling
  // The loop reads the latest props through refs so device-list refreshes and parent re-renders never restart it (restarting
  // would reset the resting baseline and lose a press in progress).
  const relevant = useMemo(() => pads.filter((p) => p.kind === group), [pads, group]);
  const finishRef = useRef(finish);
  const describeRef = useRef(describe);
  const cancelRef = useRef(onCancel);
  useEffect(() => { finishRef.current = finish; describeRef.current = describe; cancelRef.current = onCancel; }, [finish, describe, onCancel]);
  useEffect(() => {
    if (group === 'km' || !listening) return;
    const tracker = new PadTracker();
    const gesture: { key?: string; order: number[] } = { order: [] };
    let raf = 0;
    let done = false;
    const loop = (now: number) => {
      if (done) return;
      const list = getPads();
      const infos = describeRef.current(list);
      const states = list.map((p) => snapshot(p));
      const events = tracker.update(infos.map((d, i) => ({ key: d.key, state: states[i] })), now);
      for (let i = 0; i < infos.length && !done; i++) {
        const info = infos[i];
        const s = states[i];
        const evs = events.get(info.key) ?? [];
        if (evs.length) setActivity((a) => (a[info.key] && Date.now() - a[info.key] < 150 ? a : { ...a, [info.key]: Date.now() }));
        if (info.kind !== group) continue;
        const slot: Slot = group;
        const commit = (input: string, c?: Candidate) => {
          done = true;
          finishRef.current({ slot, instance: info.instance, input }, c?.alt || c?.warning ? { alt: c.alt, warning: c.warning } : undefined);
        };
        if (group === 'gp') {
          // buttons commit on release so chords like shoulderl+a work
          for (const e of evs) if (e.kind === 'button' && (!gesture.key || gesture.key === info.key) && !gesture.order.includes(e.index)) { gesture.key = info.key; gesture.order.push(e.index); }
          if (gesture.key === info.key && gesture.order.length) {
            if (gesture.order.some((b) => !s.buttons[b])) {
              if (gesture.order.length === 1) {
                const c = gamepadInput({ kind: 'button', index: gesture.order[0] });
                if (c) commit(c.input, c);
                else setNote(`Button ${gesture.order[0] + 1} isn't part of the standard gamepad layout. If this is a joystick, switch it to "Joystick / HOTAS" below.`);
              if (!done) { gesture.key = undefined; gesture.order = []; }
              } else commit(gesture.order.map((b) => GP_BUTTONS[b] ?? `button${b + 1}`).join('+'));
            }
            continue;
          }
          const ax = evs.find((e) => e.kind === 'axis');
          const c = ax && gamepadInput(ax);
          if (c) commit(c.input, c);
          continue;
        }
        const e = evs.find((x) => x.kind === 'button') ?? evs.find((x) => x.kind === 'hat') ?? evs.find((x) => x.kind === 'axis');
        const c = e && joystickInput(e);
        if (c) commit(c.input, c);
      }
      if (!done) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !['INPUT', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) { e.preventDefault(); cancelRef.current(); }
    };
    window.addEventListener('keydown', esc, true);
    return () => { done = true; cancelAnimationFrame(raf); window.removeEventListener('keydown', esc, true); };
  }, [group, listening]);

  const submitManual = () => {
    const inst = group === 'km' ? kbInst : relevant[0]?.instance ?? 1;
    const res = parseManual(manual, group, inst);
    // a bare mouse input typed while several mice exist goes to the picked mouse slot
    if (group === 'km' && res.rebind?.slot === 'mo' && !/^mo\d/i.test(manual.trim())) res.rebind = { ...res.rebind, instance: moInst };
    if (res.error || !res.rebind) { setNote(res.error ?? 'Invalid input'); return; }
    finish(res.rebind, res.warning ? { warning: res.warning } : undefined);
  };

  const current = pending?.rebind;
  const conflicts = useMemo(() => (current ? conflictsFor(rows, row, current, current.mode || row.mode) : []), [current, rows, row]);
  const deviceTag = (r: Rebind) => (r.slot === 'js' ? `JS${r.instance}` : r.slot === 'gp' ? `GP${r.instance}` : r.slot === 'mo' ? `MOUSE${r.instance > 1 ? ` ${r.instance}` : ''}` : `KB${r.instance > 1 ? r.instance : ''}`);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-void/75 p-4 backdrop-blur-[2px]" data-testid="capture-dialog">
      <div className="hud-panel hud-corners flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl">
        <div className="flex items-start gap-3 border-b border-edge px-5 py-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 font-display text-xs font-semibold uppercase tracking-[0.25em] text-hud/70">
              {listening ? <span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-mod opacity-75" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-mod" /></span> : <span className="h-2.5 w-2.5 rounded-full bg-hud" />}
              {listening ? 'Listening' : 'Confirm binding'} · {GROUP_LABEL[group]} {replace ? '· replacing' : '· new binding'}
            </div>
            <h2 className="mt-1 truncate font-display text-2xl font-bold uppercase tracking-wider text-hud2">{row.label}</h2>
            <div className="font-mono text-[10px] text-slate-500">{row.mapLabel} · {row.action}{replace ? ` · was ${formatInput(replace.slot, replace.instance, replace.input)}` : ''}</div>
          </div>
          <button type="button" onClick={onCancel} className="rounded border border-edge px-2 py-1 text-xs text-slate-400 hover:border-hud/60 hover:text-hud2" title="Cancel (Esc)"><span className="flex items-center gap-1"><Ico name="close" className="h-3 w-3" /> Esc</span></button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 scrollbar-thin">
          {listening && group === 'km' && (kbList.length > 1 || moList.length > 1) && (
            <div className="mb-3 flex flex-wrap items-center gap-3 rounded border border-hud/30 bg-hud/5 px-3 py-2 text-xs text-slate-300" data-testid="capture-km-slot">
              <span className="font-display text-[10px] font-semibold uppercase tracking-[0.25em] text-slate-500">Capture to</span>
              {([['kb', kbList, kbInst, setKbInst], ['mo', moList, moInst, setMoInst]] as const).map(([slot, list, val, set]) => list.length > 1 && (
                <span key={slot} className="flex items-center gap-0.5 rounded-md border border-edge p-0.5">
                  <Ico name={slot === 'kb' ? 'keyboard' : 'mouse'} className="mx-1 h-4 w-4 text-slate-500" />
                  {list.map((n) => (
                    <button key={n} type="button" onClick={() => set(n)} aria-pressed={val === n} data-capture-slot={`${slot}${n}`}
                      className={`rounded px-1.5 py-0.5 font-mono text-[11px] ${val === n ? 'bg-hud/15 text-hud2' : 'text-slate-500 hover:text-slate-200'}`}>{slot}{n}</button>
                  ))}
                </span>
              ))}
              <span className="text-[11px] text-slate-500">which keyboard / mouse slot of the game this binding goes to</span>
            </div>
          )}
          {listening && group === 'km' && (
            <div className="grid gap-3 md:grid-cols-2">
              <div className={`rounded-lg border-2 border-dashed p-4 text-center ${focus !== 'mouse' ? 'border-mod/60 bg-mod/5' : 'border-edge'}`}>
                <div className="font-display text-sm font-semibold uppercase tracking-widest text-mod flex items-center justify-center gap-2"><Ico name="keyboard" className="h-4 w-4" /> Press a key{kbList.length > 1 ? ` · kb${kbInst}` : ''}</div>
                <p className="mt-1 text-xs text-slate-400">Hold modifiers first (L/R Alt, Ctrl, Shift) for combos. Release a modifier on its own to bind just the modifier. <b>Esc</b> cancels.</p>
                <div className="mt-3 flex min-h-[2.5rem] flex-wrap items-center justify-center gap-1" data-testid="held-keys">
                  {held.length ? held.map((m, i) => <span key={m} className="flex items-center gap-1">{i > 0 && <span className="text-slate-500">+</span>}<kbd className="keycap !text-base">{keyLabel(m, 'kb')}</kbd></span>) : <span className="font-mono text-xs text-slate-600">waiting for input…</span>}
                  {held.length > 0 && <span className="text-slate-500">+ …</span>}
                </div>
              </div>
              <div ref={padRef} onMouseDown={onPadMouse} data-testid="mouse-pad"
                className={`cursor-crosshair select-none rounded-lg border-2 border-dashed p-4 text-center ${focus === 'mouse' ? 'border-mod/60 bg-mod/5' : 'border-edge hover:border-hud/50'}`}>
                <div className="font-display text-sm font-semibold uppercase tracking-widest text-hud2 flex items-center justify-center gap-2"><Ico name="mouse" className="h-4 w-4" /> Click or scroll here{moList.length > 1 ? ` · mo${moInst}` : ''}</div>
                <p className="mt-1 text-xs text-slate-400">Any mouse button (1–5) or the wheel. Hold a keyboard modifier for combos like R-Alt + RMB.</p>
                <div className="mt-3 flex flex-wrap justify-center gap-1" onMouseDown={(e) => e.stopPropagation()}>
                  {MOUSE_AXES.map((a) => (
                    <button key={a.input} type="button" onClick={() => finish({ slot: 'mo', instance: moInst, input: a.input })}
                      className="rounded border border-edge px-2 py-0.5 font-mono text-[10px] text-slate-400 hover:border-hud/60 hover:text-hud2">{a.label}</button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {listening && group !== 'km' && (
            <div className="rounded-lg border-2 border-dashed border-mod/60 bg-mod/5 p-4 text-center">
              <div className="flex items-center justify-center gap-2 font-display text-sm font-semibold uppercase tracking-widest text-mod">
                <Ico name={group === 'gp' ? 'gamepad' : 'joystick'} className="h-4 w-4" />
                {group === 'gp' ? 'Press a button, pull a trigger or move a stick' : 'Press a button, push a hat or move an axis'}
              </div>
              <p className="mt-1 text-xs text-slate-400">
                {group === 'gp' ? 'Hold one button and press another for a combo (e.g. LB + A). ' : 'Axes are detected when they move well away from where they rest, so throttles parked at one end work. '}
                <b>Esc</b> cancels.
              </p>
              {!relevant.length && (
                <p className="mt-2 text-xs text-mod">No {group === 'gp' ? 'gamepad' : 'joystick'} detected yet. Browsers hide controllers until you press one of their buttons. Press any button now{pads.length ? ', or switch a detected device to this type below' : ''}.</p>
              )}
            </div>
          )}

          {listening && group !== 'km' && (
            <>
              <div className="mt-3"><ChromiumBanner detected={pads.length} compact /></div>
              <DeviceList pads={pads} group={group} activity={activity} onAssign={onAssign} profileDevices={profileDevices} compact />
              <div className="mt-3">
                <button type="button" onClick={() => setShowTester((v) => !v)} data-testid="toggle-tester"
                  className="rounded border border-edge px-2 py-1 font-mono text-[11px] text-slate-300 hover:border-hud/60 hover:text-hud2">
                  <span className="flex items-center gap-1"><Ico name={showTester ? 'chevronDown' : 'chevronRight'} className="h-3 w-3" /> {showTester ? 'Hide' : 'Show'} live input tester</span>
                </button>
                {showTester && <div className="mt-2"><InputTester describe={describe} compact /></div>}
              </div>
            </>
          )}

          {pending && current && (
            <div className="space-y-3" data-testid="capture-review">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[10px] font-bold tracking-wider text-hud/70">{deviceTag(current)}</span>
                {tokens(normalizeCombo(current.input)).map((t, i) => <span key={i} className="flex items-center gap-1">{i > 0 && <span className="text-slate-500">+</span>}<kbd className="keycap !text-lg">{keyLabel(t, current.slot)}</kbd></span>)}
                <code className="ml-2 rounded bg-black/40 px-2 py-0.5 font-mono text-xs text-hud/90">{formatInput(current.slot, current.instance, current.input)}</code>
                {current.mode && <span className="rounded border border-edge px-1.5 font-mono text-[10px] uppercase text-slate-400">{prettyMode(current.mode)}</span>}
              </div>
              {pending.alt && (
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                  <span>Bind as:</span>
                  {pending.alt.map((a) => (
                    <button key={a.input} type="button" onClick={() => setPending({ ...pending, rebind: { ...current, input: a.input } })}
                      className={`rounded border px-2 py-1 font-mono text-[11px] ${current.input === a.input ? 'border-hud bg-hud/15 text-hud2' : 'border-edge text-slate-400 hover:border-hud/60'}`}>
                      {a.label} <span className="text-slate-500">{a.input}</span>
                    </button>
                  ))}
                </div>
              )}
              {pending.warning && <p className="rounded border border-mod/40 bg-mod/5 px-3 py-2 text-xs flex items-start gap-1.5 text-mod"><Ico name="alert" className="mt-0.5 h-3.5 w-3.5" /> {pending.warning}</p>}
              {conflicts.length > 0 ? (
                <div className="rounded-lg border border-alert/60 bg-alert/5 p-3" data-testid="capture-conflict">
                  <div className="font-display text-sm font-semibold uppercase tracking-widest text-alert flex items-center gap-1.5"><Ico name="alert" className="h-4 w-4" /> Already in use in an overlapping context</div>
                  <ul className="mt-2 space-y-1 text-sm">
                    {conflicts.map((c, i) => (
                      <li key={i} className="flex items-baseline gap-2"><span className="h-1.5 w-1.5 shrink-0 rounded-full bg-alert" /><span className="text-slate-100">{c.row.label}</span><span className="font-mono text-[10px] text-slate-500">{c.row.mapLabel}{c.binding.mode ? ` · ${prettyMode(c.binding.mode)}` : ''}</span></li>
                    ))}
                  </ul>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" onClick={() => onCommit(current, conflicts)} className="rounded border border-alert/70 bg-alert/15 px-3 py-1.5 font-display text-sm font-semibold uppercase tracking-wider text-alert hover:bg-alert/25">Replace: unbind from {conflicts.length === 1 ? 'that action' : `those ${conflicts.length}`}</button>
                    <button type="button" onClick={() => onCommit(current, [])} className="rounded border border-edge px-3 py-1.5 font-display text-sm font-semibold uppercase tracking-wider text-slate-200 hover:border-hud/60">Keep both</button>
                    <button type="button" onClick={() => setPending(null)} className="rounded border border-edge px-3 py-1.5 font-display text-sm font-semibold uppercase tracking-wider text-slate-400 hover:text-slate-200">Listen again</button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => onCommit(current, [])} className="rounded border border-hud/60 bg-hud/15 px-3 py-1.5 font-display text-sm font-semibold uppercase tracking-wider text-hud2 hover:bg-hud/25">Apply</button>
                  <button type="button" onClick={() => setPending(null)} className="rounded border border-edge px-3 py-1.5 font-display text-sm font-semibold uppercase tracking-wider text-slate-400 hover:text-slate-200">Listen again</button>
                </div>
              )}
            </div>
          )}

          {note && <p className="mt-3 rounded border border-mod/40 bg-mod/5 px-3 py-2 text-xs text-mod" data-testid="capture-note">{note}</p>}
        </div>

        <div className="space-y-3 border-t border-edge bg-black/20 px-5 py-3">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-[10px] uppercase tracking-widest text-slate-500">
              Activation
              <select value={mode} onChange={(e) => { setMode(e.target.value); if (pending) setPending({ ...pending, rebind: { ...pending.rebind, mode: e.target.value || undefined } }); }}
                className="rounded border border-edge bg-panel2 px-2 py-1 font-mono text-xs normal-case tracking-normal text-slate-200 outline-none focus:border-hud">
                <option value="">Action default{row.mode ? ` (${prettyMode(row.mode)})` : ''}</option>
                {ACTIVATION_MODES.map((m) => <option key={m} value={m}>{prettyMode(m)} · {m}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[10px] uppercase tracking-widest text-slate-500">
              Taps
              <select value={multiTap} onChange={(e) => { const v = Number(e.target.value); setMultiTap(v); if (pending) setPending({ ...pending, rebind: { ...pending.rebind, multiTap: v > 1 ? v : undefined } }); }}
                className="rounded border border-edge bg-panel2 px-2 py-1 font-mono text-xs normal-case tracking-normal text-slate-200 outline-none focus:border-hud">
                <option value={1}>Single</option><option value={2}>Double (multiTap 2)</option><option value={3}>Triple (multiTap 3)</option>
              </select>
            </label>
            <form className="flex min-w-[240px] flex-1 flex-col gap-1 text-[10px] uppercase tracking-widest text-slate-500" onSubmit={(e) => { e.preventDefault(); submitManual(); }}>
              Manual entry: type or correct an input name
              <span className="flex gap-1">
                <input value={manual} onChange={(e) => setManual(e.target.value)} data-testid="manual-input"
                  placeholder={group === 'km' ? 'lalt+n · mouse4 · np_enter' : group === 'js' ? 'js1_button3 · js2_rotz · js1_hat1_up' : 'gp1_shoulderl+a · thumblx'}
                  className="min-w-0 flex-1 rounded border border-edge bg-black/40 px-2 py-1 font-mono text-xs normal-case tracking-normal text-slate-100 outline-none placeholder:text-slate-600 focus:border-hud" />
                <button type="submit" className="rounded border border-edge px-2 py-1 font-mono text-xs normal-case tracking-normal text-slate-300 hover:border-hud/60 hover:text-hud2">Use</button>
              </span>
            </form>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {onClear && <button type="button" onClick={onClear} className="rounded border border-edge px-3 py-1.5 text-xs text-slate-300 hover:border-alert hover:text-alert"><span className="flex items-center gap-1.5"><Ico name="backspace" className="h-3.5 w-3.5" /> Unbind this input</span></button>}
            <span className="text-[11px] text-slate-500">
              {group === 'km' ? 'Some browser shortcuts (Ctrl+W, Ctrl+T, Ctrl+N…) can\'t be captured. Type those in manual entry.' : 'Button and axis numbers come from the browser and can differ from the game\'s DirectInput order. Check in game, and use manual entry to correct.'}
            </span>
            <button type="button" onClick={onCancel} className="ml-auto rounded border border-edge px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}
