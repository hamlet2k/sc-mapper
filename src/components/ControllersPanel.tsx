import { useEffect, useRef, useState } from 'react';
import type { AssignSource, PadInfo, PadKind, PadLike } from '../lib/devices';
import { getPads, padLabel, parseProfileProduct } from '../lib/devices';
import type { DeviceSettings } from '../lib/devopts';
import {
  SLOT_KIND_LABEL, hardwareOf, isController, isFixed, manualHardware, nextInstance, slotDeviceName, slotId,
  type CopyPlan, type GameSlot, type SlotHardware, type SlotMap,
} from '../lib/slots';
import { AUTO_TEMPLATE, autoSlotTemplate, resolveSlotTemplate } from '../lib/slotTemplates';
import { coveredInputs, maxButton, templateGroups, useTemplates, type DeviceTemplate } from '../lib/templates';
import type { Group, OptionTree, Profile, ProfileDevice, Slot } from '../lib/types';
import { ChromiumBanner } from './ChromiumBanner';
import { DeviceSettingsEditor } from './DeviceSettings';
import { InputTester } from './InputTester';
import { Ico } from './icons';
import { useEscape } from './useEscape';

type OnAssign = (key: string, v: { kind?: PadKind; instance?: number }) => void;
const SOURCE: Record<AssignSource, { text: string; cls: string }> = {
  manual: { text: 'set by you', cls: 'border-mod/50 text-mod' },
  'profile-id': { text: 'matched to profile (USB id)', cls: 'border-ok/50 text-ok' },
  'profile-name': { text: 'matched to profile (name)', cls: 'border-ok/50 text-ok' },
  auto: { text: 'browser order (guess)', cls: 'border-edge text-slate-400' },
};
const devName = (pd: ProfileDevice) => parseProfileProduct(pd.product).name || pd.product.trim();

/** Browser-detected controllers with their joystick/gamepad role and game instance (js1, js2..., gp1) */
export function DeviceList({ pads, group, activity, onAssign, onReset, profileDevices = [], compact }: {
  pads: PadInfo[]; group?: Group; activity?: Record<string, number>; onAssign: OnAssign; onReset?: (key: string) => void;
  profileDevices?: readonly ProfileDevice[]; compact?: boolean;
}) {
  if (!pads.length) return (
    <p className="mt-3 rounded border border-edge/70 bg-black/20 px-3 py-2 text-xs text-slate-500">No controllers visible to the browser yet. Press any button on one to wake it up.</p>
  );
  const maxJs = Math.max(8, ...pads.map((p) => p.instance), ...profileDevices.filter((d) => d.slot === 'js').map((d) => d.instance));
  return (
    <div className={compact ? 'mt-3 space-y-1' : 'space-y-1.5'} data-testid="device-list">
      {compact && <div className="font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-hud/70">Detected controllers</div>}
      {pads.map((p) => {
        const live = activity?.[p.key] && Date.now() - activity[p.key] < 600;
        const src = SOURCE[p.source];
        return (
          <div key={p.key} data-testid="device-row" data-device={p.name} className={`rounded border px-3 py-2 text-xs ${group && p.kind === group ? 'border-hud/50 bg-hud/5' : 'border-edge/70 bg-black/20'}`}>
            <div className="flex flex-wrap items-center gap-2">
              {activity && <span className={`h-2 w-2 rounded-full ${live ? 'bg-ok shadow-[0_0_8px_var(--color-ok)]' : 'bg-slate-600'}`} />}
              <span className="min-w-[10rem] flex-1 font-semibold text-slate-100" title={p.id}>{padLabel(p)}</span>
              <span className="flex flex-wrap items-center gap-2">
              <select value={p.kind} onChange={(e) => onAssign(p.key, { kind: e.target.value as PadKind })} aria-label="Use as"
                className="rounded border border-edge bg-panel2 px-1.5 py-0.5 font-mono text-[11px] text-slate-200">
                <option value="js">Joystick / HOTAS (js)</option><option value="gp">Gamepad (gp)</option>
              </select>
              {p.kind === 'js' ? (
                <select value={p.instance} onChange={(e) => onAssign(p.key, { kind: 'js', instance: Number(e.target.value) })} aria-label="Game instance"
                  className="max-w-[14rem] rounded border border-mod/50 bg-panel2 px-1.5 py-0.5 font-mono text-[11px] text-mod">
                  {Array.from({ length: maxJs }, (_, i) => i + 1).map((n) => {
                    const pd = profileDevices.find((d) => d.slot === 'js' && d.instance === n);
                    const other = pads.find((x) => x !== p && x.kind === 'js' && x.instance === n);
                    return <option key={n} value={n}>js{n}{pd ? ` · ${devName(pd)} (profile)` : ''}{other ? ` · used by ${padLabel(other)}` : ''}</option>;
                  })}
                </select>
              ) : <span className="rounded border border-edge px-1.5 py-0.5 font-mono text-[11px] text-slate-300">gp1</span>}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-[10px] text-slate-500">
              <span>#{p.index} · {p.mapping || 'raw'} mapping · {p.buttons} btn · {p.axes} axes{p.vendor ? ` · USB ${p.vendor}:${p.productId}` : ''}</span>
              <span className={`rounded border px-1 ${src.cls}`} data-testid="device-source">{src.text}{p.matched && p.source !== 'manual' ? `: ${p.matched}` : ''}</span>
              {p.ambiguous && <span className="rounded border border-mod/50 px-1 text-mod" data-testid="device-ambiguous" title="Identical USB ids: the browser can't tell which physical device the game numbers first">identical device: order is a guess, press a button to check</span>}
              {!compact && p.source === 'manual' && onReset && (
                <button type="button" onClick={() => onReset(p.key)} className="rounded border border-edge px-1 text-slate-400 hover:border-hud/60 hover:text-hud2"><Ico name="reset" /> automatic</button>
              )}
            </div>
          </div>
        );
      })}
      {compact && (
        <p className="text-[10px] leading-relaxed text-slate-500">
          The game numbers joysticks in Windows device order (js1, js2…), which may differ from the browser&apos;s. Pick the number the game uses for each stick
          (in game: <code>pp_resortdevices joystick 1 2</code> swaps them). More in <b>Game slots &amp; controllers</b>.
        </p>
      )}
    </div>
  );
}

/** what the Controllers modal can do to the active profile's game slots (App.tsx implements these) */
export interface SlotActions {
  map: SlotMap;
  /** hardware any profile has seen (for "not connected" picks) */
  known: SlotHardware[];
  assign: (gs: GameSlot, hw: SlotHardware | null) => void;
  pickTemplate: (gs: GameSlot, templateId: string | null) => void;
  add: (slot: Slot, hw?: SlotHardware) => void;
  /** remove a slot, dropping the profile's bindings on it */
  remove: (gs: GameSlot) => void;
  /** the profile's own bindings on a slot (what removing it drops) */
  count: (gs: GameSlot) => number;
  plan: (from: GameSlot, to: GameSlot) => CopyPlan;
  copy: (from: GameSlot, to: GameSlot, o: { clash: 'replace' | 'keep'; move: boolean; skip: Set<string> }) => void;
}
type Tab = 'slots' | 'settings' | 'tester';

/** Game slots & controllers: game slots (kb1, mo1, js1…, gp1…) <> the hardware filling each <> its template; axis settings; live tester */
export function ControllersPanel({ profile, pads, describe, slots, onClose, settings, tree, onSettings, initialTab = 'slots' }: {
  profile: Profile | null; pads: PadInfo[]; describe: (l: readonly PadLike[]) => PadInfo[]; slots: SlotActions; onClose: () => void;
  settings?: DeviceSettings; tree?: OptionTree; onSettings?: (label: string, fn: (s: DeviceSettings) => DeviceSettings) => void; initialTab?: Tab;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  useEscape(onClose);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-void/85 p-4 backdrop-blur-sm" onClick={onClose} data-testid="controllers-panel">
      <div className="hud-panel hud-corners my-4 w-full max-w-6xl rounded-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-wrap items-center gap-3 border-b border-edge px-5 py-3">
          <h2 className="flex items-center gap-2 font-display text-xl font-bold uppercase tracking-[0.2em] text-hud2"><Ico name="slots" className="h-5 w-5" /> Game slots &amp; controllers</h2>
          <div className="ml-4 flex rounded-md border border-edge p-0.5" role="tablist">
            {([['slots', 'Game slots'], ['settings', 'Axis settings & curves'], ['tester', 'Input tester']] as const).map(([k, l]) => (
              <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} data-testid={`tab-${k}`}
                className={`rounded px-3 py-1 font-display text-sm font-semibold uppercase tracking-wider ${tab === k ? 'bg-hud/20 text-hud2' : 'text-slate-400 hover:text-slate-200'}`}>{l}</button>
            ))}
          </div>
          {profile && <span className="font-mono text-[11px] text-slate-500">{profile.name}</span>}
          <button type="button" onClick={onClose} className="ml-auto rounded border border-edge px-2 py-1 text-xs text-slate-400 hover:text-hud2" aria-label="Close"><Ico name="close" /></button>
        </div>
        <div className="space-y-4 p-5">
          <ChromiumBanner detected={pads.length} compact />
          {tab === 'slots' && <SlotsTab profile={profile} pads={pads} describe={describe} slots={slots} />}
          {tab === 'settings' && settings && onSettings && <DeviceSettingsEditor profile={profile} settings={settings} tree={tree} pads={pads} onChange={onSettings} />}
          {tab === 'tester' && (
            <section>
              <p className="mb-2 text-[11px] text-slate-500">Everything the browser reports, live. &quot;last&quot; shows the Star Citizen input a press or move would be captured as. If a device or button doesn&apos;t show up here, the browser can&apos;t see it.</p>
              <InputTester describe={describe} />
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

const SEL = 'rounded border border-edge bg-panel2 px-1.5 py-1 text-xs text-slate-200 outline-none focus:border-hud';
const BTN = 'rounded border border-edge px-2 py-1 text-[11px] text-slate-300 hover:border-hud/60 hover:text-hud2 disabled:opacity-40';
const MATCH_TEXT: Record<NonNullable<GameSlot['hwMatch']>, string> = { usb: 'matched on import (USB id)', name: 'matched on import (name)', legacy: 'your earlier numbering', order: 'matched on import (gamepad order)' };

/**
 * "Pick by pressing": while armed, the next button press on any controller (one the browser already shows, or one it reveals
 * because of that very press) is reported. Esc cancels (handled by the caller).
 */
function usePressToPick(armed: boolean, describe: (l: readonly PadLike[]) => PadInfo[], onPick: (p: PadInfo) => void) {
  const ref = useRef({ describe, onPick });
  useEffect(() => { ref.current = { describe, onPick }; }, [describe, onPick]);
  useEffect(() => {
    if (!armed) return;
    // snapshot at arm time, so a press landing before the first animation frame still counts
    const seen = new Map<string, boolean[]>();
    const first = getPads();
    ref.current.describe(first).forEach((d, i) => seen.set(d.key, first[i].buttons.map((b) => b.pressed || b.value > 0.5)));
    const atStart = new Set(seen.keys());
    let raf = 0, done = false;
    const loop = () => {
      if (done) return;
      const list = getPads();
      const infos = ref.current.describe(list);
      for (let i = 0; i < infos.length && !done; i++) {
        const now = list[i].buttons.map((b) => b.pressed || b.value > 0.5);
        const before = seen.get(infos[i].key);
        // a newly pressed button, or a controller the browser reveals with a button held (that press woke it up)
        const hit = before ? now.some((on, k) => on && !before[k]) : !atStart.has(infos[i].key) && now.some(Boolean);
        seen.set(infos[i].key, now);
        if (hit) { done = true; ref.current.onPick(infos[i]); }
      }
      if (!done) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { done = true; cancelAnimationFrame(raf); };
  }, [armed]);
}

function SlotsTab({ profile, pads, describe, slots }: { profile: Profile | null; pads: PadInfo[]; describe: (l: readonly PadLike[]) => PadInfo[]; slots: SlotActions }) {
  const T = useTemplates();
  const { map } = slots;
  const [removing, setRemoving] = useState<GameSlot | null>(null);
  const [copying, setCopying] = useState<{ from: GameSlot; thenRemove: boolean } | null>(null);
  // "Pick by pressing" armed on one slot row
  const [armed, setArmed] = useState<string | null>(null);
  const armedSlot = armed ? map.slots.find((s) => slotId(s) === armed) : undefined;
  useEscape(() => setArmed(null), !!armed);
  usePressToPick(!!armedSlot, describe, (p) => {
    if (!armedSlot) return;
    if (p.kind !== armedSlot.slot) { /* a gamepad pressed for a joystick slot (or the reverse) still goes there: the slot decides */ }
    slots.assign(armedSlot, hardwareOf(p));
    setArmed(null);
  });
  const padOf = (gs: GameSlot) => (gs.hw ? pads.find((p) => p.key === gs.hw!.key) : undefined);
  const slotOfPad = (p: PadInfo) => map.slots.find((s) => s.hw?.key === p.key);
  const available = pads.filter((p) => !slotOfPad(p));
  const kinds: Slot[] = ['kb', 'mo', 'js', 'gp'];

  return (
    <div className="space-y-4" data-testid="slots-tab">
      <div className="rounded border border-hud/30 bg-hud/5 p-3 text-xs leading-relaxed text-slate-300">
        Star Citizen knows your devices as <b>game slots</b>: <code className="text-hud2">kb1</code>, <code className="text-hud2">mo1</code>, <code className="text-hud2">js1</code>, <code className="text-hud2">js2</code>… and <code className="text-hud2">gp1</code>.
        Each row is one slot: the device the game file names, the controller this browser sees for it, and the template that draws it. Only these slots are shown on the main page and written to the export.
        {' '}Hardware is matched automatically only when you import a profile; a template whenever you assign hardware. Anything you change by hand sticks to this profile.
      </div>
      {!map.slots.length ? (
        <div className="rounded border border-edge/70 bg-black/20 px-4 py-6 text-center text-sm text-slate-400" data-testid="slots-empty">
          {profile ? 'This profile has no game slots yet.' : 'No profile imported: no game slots yet.'} Add the devices you play with below{profile ? '' : ', or import your actionmaps.xml to have them filled in'}.
        </div>
      ) : (
        <div className="space-y-3">
          {kinds.map((k) => {
            const rows = map.slots.filter((s) => s.slot === k);
            if (!rows.length) return null;
            return (
              <section key={k}>
                <h3 className="mb-1 font-display text-[11px] font-bold uppercase tracking-[0.2em] text-hud/70">{SLOT_KIND_LABEL[k]}</h3>
                <div className="space-y-1.5">
                  {rows.map((gs) => (
                    <SlotRow key={slotId(gs)} gs={gs} pad={padOf(gs)} pads={pads} slots={slots} T={T} slotOfPad={slotOfPad}
                      armed={armed === slotId(gs)} onArm={(on) => setArmed(on ? slotId(gs) : null)}
                      onRemove={() => setRemoving(gs)} onCopy={() => setCopying({ from: gs, thenRemove: false })} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-1.5" data-testid="add-slot">
        <span className="mr-1 font-display text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">Add slot</span>
        {kinds.map((k) => (
          <button key={k} type="button" onClick={() => slots.add(k)} data-add-slot={k} className={BTN}><Ico name="plus" /> {k}{nextInstance(map, k)} · {SLOT_KIND_LABEL[k]}</button>
        ))}
      </div>
      <section data-testid="detected-hardware">
        <h3 className="font-display text-sm font-bold uppercase tracking-[0.2em] text-hud">Detected by this browser</h3>
        {!pads.length ? (
          <p className="mt-1 text-xs text-slate-500">No controllers visible yet. Browsers reveal a controller only after one of its buttons is pressed while this page has focus: press one now.</p>
        ) : (
          <ul className="mt-1.5 space-y-1">
            {pads.map((p) => {
              const s = slotOfPad(p);
              return (
                <li key={p.key} data-testid="hw-row" data-hw={p.name} className="flex flex-wrap items-center gap-2 rounded border border-edge/60 bg-black/20 px-3 py-1.5 text-xs">
                  <span className="font-semibold text-slate-100" title={p.id}>{padLabel(p)}</span>
                  <span className="font-mono text-[10px] text-slate-500">{p.buttons} btn · {p.axes} axes{p.vendor ? ` · USB ${p.vendor}:${p.productId}` : ''}</span>
                  {s ? <span className="ml-auto rounded border border-ok/40 px-1.5 font-mono text-[10px] text-ok">in {slotId(s)}</span> : (
                    <span className="ml-auto flex items-center gap-1.5">
                      <span className="rounded border border-mod/50 px-1.5 font-mono text-[10px] text-mod">available</span>
                      <button type="button" onClick={() => slots.add(p.kind, hardwareOf(p))} className={BTN}><Ico name="plus" /> as {p.kind}{nextInstance(map, p.kind)}</button>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {available.some((p) => p.dup) || pads.some((p) => p.dup) ? (
          <p className="mt-2 rounded border border-mod/40 bg-mod/5 px-3 py-2 text-[11px] text-slate-300" data-testid="dup-hint">
            Some devices share a USB id ({[...new Set(pads.filter((p) => p.dup).map((p) => p.name))].join(', ')}), so which one is which is a guess (browser order; for MOZA bases the last is taken as the stick).
            Press a button on each in the Input tester to check, then swap their hardware here if needed.
          </p>
        ) : null}
      </section>
      {removing && (
        <RemoveSlotDialog gs={removing} count={slots.count(removing)} hasTargets={map.slots.some((s) => s.slot === removing.slot && s !== removing)}
          onCancel={() => setRemoving(null)} onRemove={() => { slots.remove(removing); setRemoving(null); }}
          onCopyFirst={() => { setCopying({ from: removing, thenRemove: true }); setRemoving(null); }} />
      )}
      {copying && (
        <CopyBindingsDialog from={copying.from} thenRemove={copying.thenRemove} slots={slots} pads={pads} T={T} onClose={() => setCopying(null)} />
      )}
    </div>
  );
}

function hwValue(gs: GameSlot, pad?: PadInfo) {
  if (!gs.hw) return '';
  if (pad) return `pad:${pad.key}`;
  return gs.hw.manual ? `manual:${gs.hw.key}` : `known:${gs.hw.key}`;
}

function SlotRow({ gs, pad, pads, slots, T, slotOfPad, armed, onArm, onRemove, onCopy }: {
  gs: GameSlot; pad?: PadInfo; pads: PadInfo[]; slots: SlotActions; T: ReturnType<typeof useTemplates>;
  slotOfPad: (p: PadInfo) => GameSlot | undefined; armed: boolean; onArm: (on: boolean) => void; onRemove: () => void; onCopy: () => void;
}) {
  const [typing, setTyping] = useState(false);
  const [name, setName] = useState('');
  const ctl = isController(gs);
  const game = gs.gameProduct ? parseProfileProduct(gs.gameRawProduct ?? gs.gameProduct).name || gs.gameProduct : '';
  const count = slots.count(gs);
  const known = slots.known.filter((h) => !pads.some((p) => p.key === h.key));
  const onHw = (v: string) => {
    if (v === '__type') { setTyping(true); return; }
    if (!v) return slots.assign(gs, null);
    const [kind, ...rest] = v.split(':');
    const key = rest.join(':');
    if (kind === 'pad') { const p = pads.find((x) => x.key === key); if (p) slots.assign(gs, hardwareOf(p)); return; }
    const h = slots.known.find((x) => x.key === key) ?? (gs.hw?.key === key ? gs.hw : undefined);
    if (h) slots.assign(gs, h);
  };
  const st = ctl ? resolveSlotTemplate(T.templates, slots.map, gs, pad, T.picks) : null;
  return (
    <div data-testid="slot-row" data-slot={slotId(gs)} data-armed={armed ? '1' : undefined} className={`grid items-center gap-x-3 gap-y-1.5 rounded border px-3 py-2 text-xs md:grid-cols-[3.5rem_minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,1.2fr)_14rem] ${armed ? 'border-mod bg-mod/[0.07] shadow-[0_0_18px_-6px_var(--color-mod)]' : pad ? 'border-hud/40 bg-hud/[0.04]' : 'border-edge/70 bg-black/20'}`}>
      <span className="font-mono text-sm font-bold text-hud2">{slotId(gs)}</span>
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-widest text-slate-500">In the game file</div>
        <div className="truncate text-slate-200" title={gs.gameRawProduct ?? gs.gameProduct}>{game || <span className="text-slate-500">{gs.slot === 'kb' ? 'Keyboard' : gs.slot === 'mo' ? 'Mouse' : 'not named (added here)'}</span>}</div>
      </div>
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-widest text-slate-500">Hardware</div>
        {!ctl ? <div className="text-slate-300">{gs.slot === 'kb' ? 'Your keyboard' : 'Your mouse'} <span className="text-[10px] text-slate-500">(browsers can&apos;t tell several apart)</span></div> : typing ? (
          <form className="flex gap-1" onSubmit={(e) => { e.preventDefault(); if (name.trim()) slots.assign(gs, manualHardware(name)); setTyping(false); setName(''); }}>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Device name, e.g. VKBsim Gladiator EVO R" data-testid="manual-hw"
              className="min-w-0 flex-1 rounded border border-edge bg-panel2 px-1.5 py-1 text-xs text-slate-100 outline-none focus:border-hud" />
            <button type="submit" className={BTN}>Set</button>
            <button type="button" onClick={() => setTyping(false)} className={BTN} aria-label="Cancel"><Ico name="close" /></button>
          </form>
        ) : armed ? (
          <div data-testid="slot-pick-armed">
            <div className="flex items-center gap-1.5">
              <span className="flex min-w-0 flex-1 items-center gap-1.5 rounded border border-mod/70 bg-mod/15 px-2 py-1 text-mod" title={`Press any button on the controller that should be ${slotId(gs)}`}>
                <span className="relative flex h-2 w-2 shrink-0"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-mod opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-mod" /></span>
                <span className="truncate">Press a button for {slotId(gs)}…</span>
              </span>
              <button type="button" onClick={() => onArm(false)} data-testid="slot-pick-cancel" className={BTN} title="Cancel (Esc)">Cancel</button>
            </div>
            <p className="mt-1 text-[10px] text-slate-500">Listening on every controller · Esc to cancel</p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-1.5">
            <select value={hwValue(gs, pad)} onChange={(e) => onHw(e.target.value)} aria-label={`Hardware for ${slotId(gs)}`} data-testid="slot-hw" className={`${SEL} min-w-0 flex-1`}>
              <option value="">— none —</option>
              {pads.length > 0 && <optgroup label="Detected now">
                {pads.map((p) => { const o = slotOfPad(p); return <option key={p.key} value={`pad:${p.key}`}>{padLabel(p)}{o && o !== gs ? ` · now in ${slotId(o)}` : !o ? ' · available' : ''}</option>; })}
              </optgroup>}
              {(known.length > 0 || (gs.hw && !pad)) && <optgroup label="Not connected">
                {gs.hw && !pad && !known.some((h) => h.key === gs.hw!.key) && <option value={hwValue(gs)}>{gs.hw.name}</option>}
                {known.map((h) => <option key={h.key} value={`${h.manual ? 'manual' : 'known'}:${h.key}`}>{h.name}{h.dup ? ` (${h.dup.n} of ${h.dup.of})` : ''}</option>)}
              </optgroup>}
              <option value="__type">Other device, not detected (type its name)…</option>
            </select>
            <button type="button" onClick={() => onArm(true)} data-testid="slot-pick-press" title={`Pick by pressing: press any button on a controller to put it in ${slotId(gs)} (also wakes up controllers the browser doesn't show yet)`}
              aria-label={`Pick the hardware for ${slotId(gs)} by pressing a button`} className={`${BTN} shrink-0 whitespace-nowrap`}><Ico name="press" /> Press</button>
            </div>
            <div className="mt-1 flex flex-wrap gap-1 font-mono text-[10px]">
              {gs.hw ? (pad ? <span className="rounded border border-ok/40 px-1 text-ok" data-testid="slot-connected"><span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-ok align-middle" />connected</span> : <span className="rounded border border-edge px-1 text-slate-400" data-testid="slot-not-connected">not connected</span>) : null}
              {gs.hw?.manual && <span className="rounded border border-edge px-1 text-slate-400">picked by name</span>}
              {gs.hw && (gs.hwPinned ? <span className="rounded border border-mod/50 px-1 text-mod">set by you</span> : gs.hwMatch ? <span className="rounded border border-ok/40 px-1 text-ok">{MATCH_TEXT[gs.hwMatch]}</span> : null)}
              {(pad?.dup ?? gs.hw?.dup) && !gs.hwPinned && <span className="rounded border border-mod/50 px-1 text-mod" title="Identical USB ids: the browser can't tell which physical device the game numbers first">identical device: a guess</span>}
            </div>
          </>
        )}
      </div>
      <div className="min-w-0">
        <div className="text-[10px] uppercase tracking-widest text-slate-500">Template</div>
        {!ctl || !st ? <div className="text-slate-500">— (keyboard view)</div> : (
          <>
            <select value={st.pick} onChange={(e) => slots.pickTemplate(gs, e.target.value || (st.legacy ? AUTO_TEMPLATE : null))} aria-label={`Template for ${slotId(gs)}`} data-testid="slot-template" className={`${SEL} w-full`}>
              <option value="">Automatic ({autoSlotTemplate(T.templates, gs, pad).name})</option>
              {templateGroups(T.templates.filter((t) => t.slot === gs.slot)).map((g) => (
                <optgroup key={g.label} label={g.label}>{g.templates.map((t) => <option key={t.id} value={t.id}>{t.name}{maxButton(t) > 32 ? ` · ${maxButton(t)} buttons` : ''}</option>)}</optgroup>
              ))}
            </select>
            <div className="mt-1 font-mono text-[10px] text-slate-500">
              {st.how === 'chosen' ? (gs.hw ? 'picked by you · follows this hardware' : 'picked by you for this slot') : st.how === 'guessed' ? 'guessed from the order of identical devices' : st.how === 'matched' ? 'matched to the hardware' : 'generic (no template linked yet)'}
            </div>
          </>
        )}
      </div>
      <div className="flex items-center gap-1.5 justify-self-end">
        <button type="button" onClick={onCopy} data-testid="slot-copy" className={BTN} title={`Copy or move this slot's bindings to another ${SLOT_KIND_LABEL[gs.slot].toLowerCase()} slot.${count ? ` ${count} of them are yours;` : ''} the copy also carries the game defaults on ${slotId(gs)}.`}>
          <Ico name="copy" /> Copy{count ? <span className="ml-1 rounded bg-mod/15 px-1 font-mono text-[10px] text-mod" data-testid="slot-count">{count} yours</span> : null}
        </button>
        {isFixed(gs) ? <span className="px-1 text-[10px] text-slate-600" title="Keyboard and mouse slots are always there">fixed</span>
          : <button type="button" onClick={onRemove} data-testid="slot-remove" className={`${BTN} hover:!border-alert hover:!text-alert`} aria-label={`Remove ${slotId(gs)}`}><Ico name="trash" /> Remove</button>}
      </div>
    </div>
  );
}

function RemoveSlotDialog({ gs, count, hasTargets, onCancel, onRemove, onCopyFirst }: { gs: GameSlot; count: number; hasTargets: boolean; onCancel: () => void; onRemove: () => void; onCopyFirst: () => void }) {
  const name = slotDeviceName(gs);
  useEscape(onCancel);
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-void/80 p-4 backdrop-blur-sm" onClick={onCancel}>
      <div className="hud-panel hud-corners w-full max-w-lg rounded-xl border border-alert/50 p-5 text-sm text-slate-300" onClick={(e) => e.stopPropagation()} data-testid="remove-slot-warning">
        <h3 className="font-display text-lg font-bold uppercase tracking-[0.2em] text-alert">Remove {slotId(gs)}?</h3>
        {name && <div className="mt-0.5 text-xs text-slate-400">{name}</div>}
        {count > 0 ? (
          <p className="mt-3"><b className="text-alert">{count} binding{count === 1 ? '' : 's'}</b> of yours on <code className="text-hud2">{slotId(gs)}_</code> will be dropped from this profile and from the export. You can undo it with Undo (Ctrl+Z).</p>
        ) : <p className="mt-3">This slot has no bindings of yours, so nothing is dropped.</p>}
        <p className="mt-2 text-[11px] text-slate-500">The game&apos;s default bindings aren&apos;t stored in your file and aren&apos;t affected. The slot&apos;s device entry (and its axis settings) leave the export too.</p>
        {count > 0 && (
          <button type="button" onClick={onCopyFirst} data-testid="remove-copy-first" className="mt-3 w-full rounded border border-hud/60 bg-hud/10 px-3 py-2 text-left text-xs text-hud2 hover:bg-hud/20">
            <Ico name="copy" /> Copy the bindings to another slot first{hasTargets ? '' : ' (adds a new slot)'}, then remove {slotId(gs)}
          </button>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded border border-edge px-3 py-1.5 text-xs text-slate-300 hover:border-hud/60">Cancel</button>
          <button type="button" onClick={onRemove} data-testid="remove-confirm" className="rounded border border-alert/70 bg-alert/15 px-3 py-1.5 text-xs font-semibold text-alert hover:bg-alert/25">
            {count ? `Remove and drop ${count} binding${count === 1 ? '' : 's'}` : 'Remove slot'}
          </button>
        </div>
      </div>
    </div>
  );
}

/** inputs a template (and the connected device, if any) doesn't have, among the ones being copied */
function missingOn(t: DeviceTemplate, pad: PadInfo | undefined, inputs: string[]): string[] {
  const covered = new Set(t.callouts.flatMap(coveredInputs));
  return inputs.filter((i) => {
    const b = /^button(\d+)$/.exec(i);
    if (pad && b) return Number(b[1]) > pad.buttons;
    return !covered.has(i);
  });
}

function CopyBindingsDialog({ from, thenRemove, slots, pads, T, onClose }: { from: GameSlot; thenRemove: boolean; slots: SlotActions; pads: PadInfo[]; T: ReturnType<typeof useTemplates>; onClose: () => void }) {
  useEscape(onClose);
  const targets = slots.map.slots.filter((s) => s.slot === from.slot && s.instance !== from.instance);
  const NEW = '__new';
  const [to, setTo] = useState<string>(targets[0] ? slotId(targets[0]) : NEW);
  const [move, setMove] = useState(thenRemove);
  const [clash, setClash] = useState<'replace' | 'keep'>('replace');
  const [skipMissing, setSkipMissing] = useState(false);
  const newSlot: GameSlot = { slot: from.slot, instance: nextInstance(slots.map, from.slot) };
  const target = to === NEW ? newSlot : targets.find((s) => slotId(s) === to) ?? newSlot;
  const plan = slots.plan(from, target);
  const pad = target.hw ? pads.find((p) => p.key === target.hw!.key) : undefined;
  // keyboard / mouse slots have no template: every key exists on every keyboard
  const tpl = isController(target) ? resolveSlotTemplate(T.templates, slots.map, target, pad, T.picks).template : null;
  const missing = tpl ? missingOn(tpl, pad, plan.inputs) : [];
  const apply = () => {
    if (to === NEW) slots.add(from.slot);
    slots.copy(from, target, { clash, move: move || thenRemove, skip: skipMissing ? new Set(missing) : new Set() });
    if (thenRemove) slots.remove(from);
    onClose();
  };
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-void/80 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="hud-panel hud-corners w-full max-w-xl rounded-xl p-5 text-sm text-slate-300" onClick={(e) => e.stopPropagation()} data-testid="copy-bindings">
        <h3 className="font-display text-lg font-bold uppercase tracking-[0.2em] text-hud2">{thenRemove ? `Move bindings off ${slotId(from)}` : `Copy bindings from ${slotId(from)}`}</h3>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span>To</span>
          <select value={to} onChange={(e) => setTo(e.target.value)} data-testid="copy-target" className={SEL}>
            {targets.map((s) => <option key={slotId(s)} value={slotId(s)}>{slotId(s)} · {slotDeviceName(s) ?? 'no device'}</option>)}
            <option value={NEW}>new slot {slotId(newSlot)}</option>
          </select>
          {!thenRemove && (
            <label className="ml-3 flex items-center gap-1.5"><input type="checkbox" checked={move} onChange={(e) => setMove(e.target.checked)} className="accent-[#4fd8ff]" /> move (remove them from {slotId(from)})</label>
          )}
        </div>
        <div className="mt-3 rounded border border-edge/70 bg-black/30 p-3 text-xs" data-testid="copy-preview">
          {!plan.count ? <span className="text-slate-500">{slotId(from)} has no bindings to copy.</span> : <>
            <div><b className="text-slate-100">{plan.count}</b> binding{plan.count === 1 ? '' : 's'} on <b className="text-slate-100">{plan.actions}</b> action{plan.actions === 1 ? '' : 's'}: <b className="text-mod">{plan.yours} yours</b>{plan.count > plan.yours ? <> and <b className="text-slate-200">{plan.count - plan.yours} game default{plan.count - plan.yours === 1 ? '' : 's'}</b> on {slotId(from)}</> : null}. The same inputs carry over ({isController(from) ? 'button5 stays button5' : 'L-Alt+N stays L-Alt+N'}).</div>
            {tpl && <div className="mt-2 text-slate-400">Target template: <b className="text-slate-200">{tpl.name}</b>{pad ? ` · ${pad.buttons} buttons connected` : ''}</div>}
            {missing.length > 0 ? (
              <div className="mt-1 text-mod" data-testid="copy-missing">
                {missing.length} input{missing.length === 1 ? '' : 's'} {missing.length === 1 ? "isn't" : "aren't"} on the target: <span className="font-mono">{missing.slice(0, 16).join(', ')}{missing.length > 16 ? ` +${missing.length - 16}` : ''}</span>
                <label className="mt-1 flex items-center gap-1.5 text-slate-300"><input type="checkbox" checked={skipMissing} onChange={(e) => setSkipMissing(e.target.checked)} className="accent-[#4fd8ff]" /> skip those</label>
              </div>
            ) : <div className="mt-1 text-ok">Every input exists on the target.</div>}
            {plan.clashes > 0 && (
              <div className="mt-2" data-testid="copy-clash">
                <span className="text-alert">{plan.clashes} binding{plan.clashes === 1 ? '' : 's'} on {slotId(target)} already use{plan.clashes === 1 ? 's' : ''} the same inputs.</span>
                <div className="mt-1 flex gap-3">
                  <label className="flex items-center gap-1.5"><input type="radio" checked={clash === 'replace'} onChange={() => setClash('replace')} className="accent-[#4fd8ff]" /> replace them</label>
                  <label className="flex items-center gap-1.5"><input type="radio" checked={clash === 'keep'} onChange={() => setClash('keep')} className="accent-[#4fd8ff]" /> keep both (shows as conflicts)</label>
                </div>
              </div>
            )}
          </>}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded border border-edge px-3 py-1.5 text-xs text-slate-300 hover:border-hud/60">Cancel</button>
          <button type="button" onClick={apply} disabled={!plan.count && !thenRemove} data-testid="copy-apply" className="rounded border border-hud/60 bg-hud/15 px-3 py-1.5 text-xs font-semibold text-hud2 hover:bg-hud/25 disabled:opacity-40">
            {thenRemove ? `Move and remove ${slotId(from)}` : move ? 'Move bindings' : 'Copy bindings'}
          </button>
        </div>
      </div>
    </div>
  );
}
