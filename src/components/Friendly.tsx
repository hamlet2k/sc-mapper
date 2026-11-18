// The friendly front end's own pieces: first-run welcome, plain-language limit notes, and the drag-and-drop device order.
// Everything else (pictures, capture, export, share) reuses the existing components; App.tsx wires them.
import { useState } from 'react';
import { browserName } from '../lib/browser';
import { CHROMIUM_BUTTON_CAP } from '../lib/capture';
import { hidSupported } from '../lib/hid';
import type { PadInfo } from '../lib/devices';
import { moveItem, positionNumbers } from '../lib/reorder';
import { slotDeviceName, slotId, type GameSlot, type SlotMap } from '../lib/slots';
import { resolveSlotTemplate } from '../lib/slotTemplates';
import type { useTemplates } from '../lib/templates';
import { CopyText } from './CopyButton';
import { HidConnect } from './InputTester';
import { Ico } from './icons';

/** Chrome's Gamepad API list stops at 8 controllers (Gamepads::kItemsLengthCap) */
export const CHROME_LIST_CAP = 8;
/** WinMM / DirectInput joystick table */
export const WINDOWS_JOYSTICK_SLOTS = 16;
export const MAPPINGS_PATH = 'StarCitizen\\LIVE\\USER\\Client\\0\\Controls\\Mappings';

const btn = 'inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-40';
export const primaryBtn = `${btn} bg-hud text-black hover:bg-hud2 shadow-[0_0_24px_-8px_var(--color-hud)]`;
export const quietBtn = `${btn} border border-edge text-slate-200 hover:border-hud/60 hover:text-hud2`;

export function Welcome({ onImport, onFriend, onSample, onDefaults, onHelp }: {
  onImport: () => void; onFriend: () => void; onSample: () => void; onDefaults: () => void; onHelp: () => void;
}) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col items-center px-4 py-10 text-center" data-testid="friendly-welcome">
      <h2 className="text-3xl font-bold text-slate-50">Map your controls, see them on your gear</h2>
      <p className="mt-3 max-w-xl text-slate-300">
        Bring in your Star Citizen bindings, see every stick, throttle, keyboard and mouse as a picture, change a binding by pressing it,
        and save a file the game loads. Everything stays in this browser.
      </p>
      <div className="mt-8 grid w-full gap-4 sm:grid-cols-2">
        <button type="button" onClick={onImport} data-testid="welcome-import" className="hud-panel rounded-xl border border-hud/50 p-5 text-left hover:border-hud">
          <Ico name="import" className="h-6 w-6 text-hud2" />
          <div className="mt-2 text-lg font-semibold text-slate-50">Import from Star Citizen</div>
          <p className="mt-1 text-sm text-slate-400">Pick or drop <code>actionmaps.xml</code> or an exported <code>layout_…_exported.xml</code>.</p>
        </button>
        <button type="button" onClick={onFriend} data-testid="welcome-friend" className="hud-panel rounded-xl border border-edge p-5 text-left hover:border-hud/60">
          <Ico name="share" className="h-6 w-6 text-mod" />
          <div className="mt-2 text-lg font-semibold text-slate-50">Use a friend&apos;s file</div>
          <p className="mt-1 text-sm text-slate-400">A shared layout (<code>.xml</code>) or one device&apos;s setup (<code>.sckeymap.json</code>).</p>
        </button>
      </div>
      <div className="mt-5 flex flex-wrap justify-center gap-3 text-sm">
        <button type="button" onClick={onDefaults} data-testid="welcome-defaults" className={quietBtn}>Start from the game defaults</button>
        <button type="button" onClick={onSample} data-testid="welcome-sample" className={quietBtn}>Try a sample</button>
      </div>
      <div className="mt-8 w-full rounded-xl border border-edge/70 bg-black/30 p-4 text-left text-sm text-slate-300">
        <div className="font-semibold text-slate-100">Where is my file?</div>
        <ol className="mt-1 list-decimal space-y-0.5 pl-5">
          <li>In Star Citizen: Options → Keybindings → Advanced Controls Customization → Control Profiles → <b>Save Control Settings</b>.</li>
          <li>The file lands in <CopyText text={MAPPINGS_PATH} kind="path" testid="welcome-path" className="text-hud/90" /> under your install folder.</li>
          <li>Drop it on this page, or use <b>Import from Star Citizen</b>.</li>
        </ol>
        <button type="button" onClick={onHelp} className="mt-2 text-xs text-hud underline-offset-2 hover:underline">More help</button>
      </div>
    </div>
  );
}

/** browser limits, only the ones that apply here, in plain words */
export function LimitNotes({ pads }: { pads: readonly PadInfo[] }) {
  const b = browserName();
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  const listed = pads.filter((p) => !p.hid).length;
  const wide = pads.some((p) => !p.hid && p.buttons >= CHROMIUM_BUTTON_CAP);
  const name = b.name.replace(/\s*\(.*\)$/, '').replace(/\s+\d+$/, '');
  if (b.chromium && hidSupported() && (listed >= CHROME_LIST_CAP || wide)) {
    return (
      <div className="flex flex-wrap items-center gap-3 border-b border-mod/50 bg-mod/[0.08] px-4 py-2 text-sm" data-testid="limit-chrome">
        <Ico name="alert" className="h-4 w-4 text-mod" />
        <span className="min-w-0 flex-1 text-slate-200">
          {listed >= CHROME_LIST_CAP
            ? <>{name} lists {CHROME_LIST_CAP} controllers on its own. Missing one? Connect it directly and pick it from the list, one device per click.</>
            : <>{name}&apos;s normal list stops at {CHROMIUM_BUTTON_CAP} buttons. Connect that device directly to read all of its buttons.</>}
        </span>
        <HidConnect />
        <button type="button" onClick={() => setHidden(true)} aria-label="Hide this note" className="text-slate-400 hover:text-slate-100"><Ico name="close" className="h-4 w-4" /></button>
      </div>
    );
  }
  if (b.name.startsWith('Firefox')) {
    return (
      <div className="flex flex-wrap items-center gap-3 border-b border-edge/60 bg-black/30 px-4 py-1.5 text-xs text-slate-400" data-testid="limit-firefox">
        <Ico name="info" className="h-3.5 w-3.5" />
        <span className="min-w-0 flex-1">Firefox doesn&apos;t list devices that have buttons but no axes (button boxes like the A-10C UFC). Open this page in Chrome or Edge to connect those directly.</span>
        <button type="button" onClick={() => setHidden(true)} aria-label="Hide this note" className="hover:text-slate-100"><Ico name="close" className="h-3.5 w-3.5" /></button>
      </div>
    );
  }
  return null;
}

type Templates = ReturnType<typeof useTemplates>;

/**
 * Device order: one list per kind (joysticks, gamepads). Drag a card, or use its up / down buttons (Alt+↑ / Alt+↓ on a focused
 * card), and the numbers renumber in list order; bindings, picture and curves go with the device (App's reorderSlotsNow).
 */
export function DeviceOrder({ slotMap, pads, templates, curveLimit, onReorder, onOpen, onRefresh }: {
  slotMap: SlotMap; pads: readonly PadInfo[]; templates: Templates;
  /** how many js / gp numbers keep axis settings in the game's file */
  curveLimit: { js: number; gp: number };
  onReorder: (slot: 'js' | 'gp', order: number[]) => void;
  onOpen: (gs: GameSlot) => void;
  onRefresh: () => void;
}) {
  const kinds = (['js', 'gp'] as const).filter((k) => slotMap.slots.some((s) => s.slot === k));
  const jsCount = slotMap.slots.filter((s) => s.slot === 'js').length;
  return (
    <div className="mx-auto max-w-4xl" data-testid="device-order">
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-semibold text-slate-50">Device order</h2>
          <p className="mt-1 text-sm text-slate-300">
            Star Citizen numbers your controllers js1, js2, js3… If it numbers them differently from this list, drag each device to the
            number the game gives it. Its bindings, picture and curves move with it. No numbers to type.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onRefresh} className={quietBtn} data-testid="order-refresh" title="Load a fresh actionmaps.xml or layout export: if the game renumbered devices, the app offers the moves">
            <Ico name="refresh" className="h-4 w-4" /> Check against a new game file
          </button>
          <HidConnect />
        </div>
      </div>
      {!kinds.length && <p className="mt-6 rounded-xl border border-edge p-6 text-center text-slate-400">No joysticks or gamepads in this profile yet. Import your game file, or press a button on a controller.</p>}
      {kinds.map((k) => (
        <OrderList key={k} kind={k} slots={slotMap.slots.filter((s) => s.slot === k).sort((a, b) => a.instance - b.instance)} slotMap={slotMap}
          pads={pads} templates={templates} curveLimit={curveLimit[k]} onReorder={(o) => onReorder(k, o)} onOpen={onOpen} />
      ))}
      <ul className="mt-6 space-y-1.5 rounded-xl border border-edge/70 bg-black/30 p-4 text-sm text-slate-300" data-testid="order-notes">
        <li><b className="text-slate-100">Curves:</b> Star Citizen only keeps curves and invert for js1–js{curveLimit.js} and {curveLimit.gp > 1 ? `gp1–gp${curveLimit.gp}` : 'gp1'}. Put the devices you tune near the top.</li>
        <li><b className="text-slate-100">Windows:</b> Windows gives games at most {WINDOWS_JOYSTICK_SLOTS} joysticks, and some devices use two of them.{jsCount > WINDOWS_JOYSTICK_SLOTS / 2 ? ' With this many devices, unplug the ones you don’t fly with if one goes missing in game.' : ''}</li>
        <li><b className="text-slate-100">In game:</b> this changes the numbers in your saved file, not the game&apos;s own order. Save for Star Citizen and load it, or reorder in game with <CopyText text="pp_resortdevices joystick 1 2" kind="command" testid="order-cmd-resort" className="rounded bg-black/40 px-1 text-hud/90" />.</li>
      </ul>
    </div>
  );
}

function OrderList({ kind, slots, slotMap, pads, templates, curveLimit, onReorder, onOpen }: {
  kind: 'js' | 'gp'; slots: GameSlot[]; slotMap: SlotMap; pads: readonly PadInfo[]; templates: Templates; curveLimit: number;
  onReorder: (order: number[]) => void; onOpen: (gs: GameSlot) => void;
}) {
  const [drag, setDrag] = useState<{ from: number; over: number } | null>(null);
  const order = slots.map((s) => s.instance);
  const numbers = positionNumbers(order);
  // while dragging, preview the order the drop would give
  const shown = drag ? moveItem(slots, drag.from, drag.over) : slots;
  const move = (from: number, to: number) => { if (to >= 0 && to < slots.length && to !== from) onReorder(moveItem(order, from, to)); };
  return (
    <section className="mt-6" aria-label={kind === 'js' ? 'Joysticks and HOTAS' : 'Gamepads'}>
      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-slate-400">{kind === 'js' ? 'Joysticks, throttles, pedals & panels' : 'Gamepads'}</h3>
      <ol className="space-y-2" data-testid={`order-list-${kind}`}>
        {shown.map((gs, pos) => {
          const from = slots.indexOf(gs);
          const pad = gs.hw ? pads.find((p) => p.key === gs.hw!.key) : undefined;
          const t = resolveSlotTemplate(templates.templates, slotMap, gs, pad, templates.picks).template;
          const img = t.image ?? t.views?.[0]?.image;
          const name = pad?.name ?? slotDeviceName(gs) ?? (gs.unknown ? 'Unnamed device' : t.name);
          const n = numbers[pos];
          const noCurves = n > curveLimit;
          const dragging = drag?.from === from;
          return (
            <li key={slotId(gs)} draggable tabIndex={0} data-testid="order-card" data-slot={slotId(gs)} data-pos={`${kind}${n}`}
              aria-label={`${name}, ${kind}${n}. Alt+Up or Alt+Down moves it.`}
              onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', slotId(gs)); setDrag({ from, over: from }); }}
              onDragOver={(e) => { if (!drag) return; e.preventDefault(); if (drag.over !== pos) setDrag({ ...drag, over: pos }); }}
              onDrop={(e) => { e.preventDefault(); if (drag) move(drag.from, drag.over); setDrag(null); }}
              onDragEnd={() => setDrag(null)}
              onKeyDown={(e) => { if (e.altKey && e.key === 'ArrowUp') { e.preventDefault(); move(from, from - 1); } else if (e.altKey && e.key === 'ArrowDown') { e.preventDefault(); move(from, from + 1); } }}
              className={`flex cursor-grab items-center gap-3 rounded-xl border bg-panel/70 p-2.5 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-hud active:cursor-grabbing ${dragging ? 'border-hud bg-hud/10 opacity-80' : 'border-edge hover:border-hud/50'}`}>
              <span aria-hidden="true" className="shrink-0 select-none text-lg leading-none text-slate-500">⠿</span>
              <span className={`w-14 shrink-0 rounded-md py-1 text-center font-mono text-lg font-bold ${noCurves ? 'bg-slate-700/40 text-slate-300' : 'bg-hud/15 text-hud2'}`}>{kind}{n}</span>
              <div className="flex h-14 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md bg-black/40">
                {img ? <img src={img} alt="" className="max-h-full max-w-full object-contain" draggable={false} /> : <Ico name={kind === 'gp' ? 'gamepad' : 'joystick'} className="h-7 w-7 text-slate-500" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold text-slate-100">{name}</div>
                <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-slate-400">
                  <span className={pad ? 'text-ok' : 'text-slate-500'}>{pad ? `● connected${pad.hid ? ' directly' : ''}` : '○ not connected'}</span>
                  {noCurves && <span className="text-mod" data-testid="order-no-curves">No curves past {kind}{curveLimit}</span>}
                </div>
              </div>
              <button type="button" onClick={() => onOpen(gs)} className="hidden rounded-md border border-edge px-2 py-1 text-xs text-slate-300 hover:border-hud/60 hover:text-hud2 sm:block">View</button>
              <div className="flex shrink-0 flex-col gap-1">
                <button type="button" aria-label={`Move ${name} up`} data-testid="order-up" disabled={from === 0} onClick={() => move(from, from - 1)}
                  className="rounded border border-edge px-1.5 text-slate-300 hover:border-hud/60 disabled:opacity-30">▲</button>
                <button type="button" aria-label={`Move ${name} down`} data-testid="order-down" disabled={from === slots.length - 1} onClick={() => move(from, from + 1)}
                  className="rounded border border-edge px-1.5 text-slate-300 hover:border-hud/60 disabled:opacity-30">▼</button>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
