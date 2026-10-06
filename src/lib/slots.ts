// Game slots (kb1, mo1, js1…, gp1…): what the game knows a device as, which physical controller fills each slot, and which
// device template draws it. The mapping is kept per profile (localStorage) and is what the main page shows and the export writes.
//
// Matching vs assignment (docs/ux-decisions.md):
//  - hardware is auto-matched to slots only on a fresh profile import (by the <options Product> names in the file);
//  - a template is auto-matched whenever hardware is (re)assigned (resolved live from the hardware, nothing stored);
//  - a manual hardware / template pick is pinned; a template picked for a piece of hardware follows it to another slot.
import { parseProfileProduct } from './devices';
import { effectiveGroup, setGroup, type DefaultsIndex } from './edit';
import { groupOfSlot, normalizeCombo } from './inputs';
import type { DeviceIdentity } from './templates';
import type { Profile, Rebind, RebindMap, Slot } from './types';

/** a physical controller as remembered by a slot (enough to show it and match a template while it is not plugged in) */
export interface SlotHardware {
  /** pad key (devices.ts padKeys) of a detected device, or "manual:<name>" for one picked by name without a live device */
  key: string;
  name: string;
  vendor?: string; productId?: string; buttons?: number; axes?: number;
  dup?: { n: number; of: number };
  /** Product attribute to write into <options> (the game's format, with the DirectInput GUID when known) */
  product?: string;
  /** picked by name, never seen by the browser (Chromium shows at most 4 controllers) */
  manual?: boolean;
}
export interface GameSlot {
  slot: Slot;
  instance: number;
  /** device name from the imported file's <options Product="…"> */
  gameProduct?: string;
  gameRawProduct?: string;
  hw?: SlotHardware;
  /** hardware picked by the user: auto-matching never replaces it */
  hwPinned?: boolean;
  /** how the hardware got here when not pinned */
  hwMatch?: 'usb' | 'name' | 'legacy' | 'order';
  /** template picked for this slot while it has no hardware (with hardware the pick lives in SlotMap.hwTemplates) */
  template?: string;
}
export interface SlotMap {
  version: 1;
  slots: GameSlot[];
  /** hardware key -> template id picked by the user: follows that hardware to whichever slot it is assigned to */
  hwTemplates: Record<string, string>;
  /** a fresh import whose hardware auto-match hasn't run yet (controllers only appear after a button press) */
  pendingMatch?: boolean;
}
/** a detected controller, as far as matching needs it (PadInfo fits) */
export interface PadIdentity {
  key: string; name: string; vendor?: string; productId?: string; buttons: number; axes?: number; kind: 'js' | 'gp';
  dup?: { n: number; of: number }; product?: string; mapping?: string;
}

export const FIXED_SLOTS: readonly { slot: Slot; instance: number }[] = [{ slot: 'kb', instance: 1 }, { slot: 'mo', instance: 1 }];
export const SLOT_ORDER: Slot[] = ['kb', 'mo', 'js', 'gp'];
export const SLOT_KIND_LABEL: Record<Slot, string> = { kb: 'Keyboard', mo: 'Mouse', js: 'Joystick / HOTAS', gp: 'Gamepad' };
export const slotId = (s: { slot: Slot; instance: number }) => `${s.slot}${s.instance}`;
export const isFixed = (s: { slot: Slot; instance: number }) => FIXED_SLOTS.some((f) => f.slot === s.slot && f.instance === s.instance);
export const isController = (s: { slot: Slot }): s is { slot: 'js' | 'gp' } & GameSlot => s.slot === 'js' || s.slot === 'gp';
export const emptySlotMap = (): SlotMap => ({ version: 1, slots: [], hwTemplates: {} });

export function sortSlots(slots: GameSlot[]): GameSlot[] {
  return slots.slice().sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot) || a.instance - b.instance);
}

/** js / gp instances a profile's rebinds use (non-empty inputs) */
export function usedSlots(rebinds: RebindMap): { slot: Slot; instance: number }[] {
  const seen = new Map<string, { slot: Slot; instance: number }>();
  for (const acts of Object.values(rebinds)) for (const list of Object.values(acts)) for (const r of list) {
    if (!r.input || (r.slot !== 'js' && r.slot !== 'gp')) continue;
    seen.set(`${r.slot}${r.instance}`, { slot: r.slot, instance: r.instance });
  }
  return [...seen.values()];
}

/**
 * Slots of a freshly imported profile: keyboard and mouse (fixed), every device the file declares in <options>, and every
 * joystick / gamepad number its bindings use. No profile (game defaults): no slots at all, the user adds them.
 */
export function seedSlots(profile: Pick<Profile, 'devices' | 'rebinds'> | null): SlotMap {
  if (!profile) return emptySlotMap();
  const slots: GameSlot[] = FIXED_SLOTS.map((f) => ({ ...f }));
  for (const d of profile.devices) {
    let s = slots.find((x) => x.slot === d.slot && x.instance === d.instance);
    if (!s) { s = { slot: d.slot, instance: d.instance }; slots.push(s); }
    if (d.product) { s.gameProduct = d.product; if (d.rawProduct) s.gameRawProduct = d.rawProduct; }
  }
  for (const u of usedSlots(profile.rebinds)) if (!slots.some((x) => x.slot === u.slot && x.instance === u.instance)) slots.push({ ...u });
  return { version: 1, slots: sortSlots(slots), hwTemplates: {}, pendingMatch: slots.some(isController) };
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');
const sameName = (a: string, b: string) => {
  const x = norm(a), y = norm(b);
  return x.length >= 4 && y.length >= 4 && (x === y || x.includes(y) || y.includes(x));
};
const hex = (s?: string) => (s ?? '').toUpperCase().padStart(4, '0');

export const hardwareOf = (p: PadIdentity): SlotHardware => ({
  key: p.key, name: p.name,
  ...(p.vendor ? { vendor: p.vendor, productId: p.productId } : {}),
  buttons: p.buttons, ...(p.axes != null ? { axes: p.axes } : {}),
  ...(p.dup ? { dup: p.dup } : {}), ...(p.product ? { product: p.product } : {}),
});
export const manualHardware = (name: string): SlotHardware => ({ key: `manual:${norm(name) || 'device'}`, name: name.trim(), manual: true, product: name.trim() });

/**
 * Hardware auto-match of a fresh import: every unpinned js / gp slot without hardware gets a detected controller whose USB
 * vendor/product id (from the GUID in <options Product>), else name, matches the file's device. Identical devices go in browser
 * order to the slots in instance order (a guess, which the dup-order template guess in templates.ts then follows).
 * `legacy` = per-device numbers the user set before slots existed (pad key -> kind/instance): they win and are pinned.
 */
export function autoMatchHardware(map: SlotMap, pads: readonly PadIdentity[], legacy: Record<string, { kind?: 'js' | 'gp'; instance?: number }> = {}): SlotMap {
  const slots = map.slots.map((s) => ({ ...s }));
  const taken = new Set(slots.map((s) => s.hw?.key).filter(Boolean) as string[]);
  // 0. numbers the user had set by hand
  for (const p of pads) {
    const a = legacy[p.key];
    if (!a?.instance || taken.has(p.key)) continue;
    const s = slots.find((x) => x.slot === (a.kind ?? p.kind) && x.instance === a.instance && !x.hw && !x.hwPinned);
    if (s) { s.hw = hardwareOf(p); s.hwMatch = 'legacy'; taken.add(p.key); }
  }
  const open = () => slots.filter((s) => isController(s) && !s.hw && !s.hwPinned && s.gameProduct).sort((a, b) => a.instance - b.instance);
  const claim = (test: (p: PadIdentity, pp: ReturnType<typeof parseProfileProduct>) => boolean, how: 'usb' | 'name') => {
    for (const s of open()) {
      const pp = parseProfileProduct(s.gameRawProduct ?? s.gameProduct ?? '');
      const p = pads.find((x) => !taken.has(x.key) && x.kind === s.slot && test(x, pp))
        ?? pads.find((x) => !taken.has(x.key) && test(x, pp)); // a stick the browser calls a "gamepad" (standard mapping)
      if (!p) continue;
      s.hw = hardwareOf(p); s.hwMatch = how; taken.add(p.key);
    }
  };
  claim((p, pp) => !!pp.vendor && hex(p.vendor) === pp.vendor && hex(p.productId) === pp.productId, 'usb');
  claim((p, pp) => !!pp.name && sameName(p.name, pp.name), 'name');
  // gamepads: Windows (XInput) and the browser name them differently ("Controller (Xbox One For Windows)" vs "Xbox Wireless
  // Controller"), so gamepad slots still open take the remaining standard-mapping gamepads in order
  const pads2 = pads.filter((p) => p.kind === 'gp' && !taken.has(p.key));
  for (const s of open().filter((x) => x.slot === 'gp')) {
    const p = pads2.shift();
    if (!p) break;
    s.hw = hardwareOf(p); s.hwMatch = 'order'; taken.add(p.key);
  }
  return { ...map, slots, pendingMatch: false };
}

/** put a piece of hardware into a slot (null = none); it leaves any other slot it was in. Manual picks are pinned. */
export function assignHardware(map: SlotMap, target: { slot: Slot; instance: number }, hw: SlotHardware | null, pinned = true): SlotMap {
  const slots = map.slots.map((s) => {
    if (s.slot === target.slot && s.instance === target.instance) {
      const n: GameSlot = { ...s, hwPinned: pinned };
      delete n.hwMatch;
      if (hw) n.hw = hw; else delete n.hw;
      return n;
    }
    if (hw && s.hw?.key === hw.key) { const n = { ...s }; delete n.hw; delete n.hwMatch; return n; }
    return s;
  });
  return { ...map, slots };
}

/** remember the user's template for a slot: on its hardware when it has one (follows the hardware), else on the slot. null = automatic */
export function setSlotTemplate(map: SlotMap, target: { slot: Slot; instance: number }, templateId: string | null): SlotMap {
  const s = map.slots.find((x) => x.slot === target.slot && x.instance === target.instance);
  if (!s) return map;
  if (s.hw) {
    const hwTemplates = { ...map.hwTemplates };
    if (templateId) hwTemplates[s.hw.key] = templateId; else delete hwTemplates[s.hw.key];
    return { ...map, hwTemplates };
  }
  return { ...map, slots: map.slots.map((x) => (x === s ? (templateId ? { ...x, template: templateId } : (({ template: _t, ...rest }) => rest)(x)) : x)) };
}
/** the template the user pinned for a slot (undefined = automatic: matched from the slot's hardware) */
export function pinnedTemplate(map: SlotMap, s: GameSlot): string | undefined {
  return s.hw ? map.hwTemplates[s.hw.key] : s.template;
}

export function nextInstance(map: SlotMap, slot: Slot): number {
  let n = 1;
  while (map.slots.some((s) => s.slot === slot && s.instance === n)) n++;
  return n;
}
export function addSlot(map: SlotMap, slot: Slot, instance = nextInstance(map, slot), hw?: SlotHardware): SlotMap {
  if (map.slots.some((s) => s.slot === slot && s.instance === instance)) return map;
  const s: GameSlot = { slot, instance, ...(hw ? { hw, hwPinned: true } : {}) };
  const m = hw ? { ...map, slots: map.slots.map((x) => (x.hw?.key === hw.key ? (({ hw: _h, hwMatch: _m, ...rest }) => rest)(x) : x)) } : map;
  return { ...m, slots: sortSlots([...m.slots, s]) };
}
export function removeSlot(map: SlotMap, target: { slot: Slot; instance: number }): SlotMap {
  return { ...map, slots: map.slots.filter((s) => !(s.slot === target.slot && s.instance === target.instance)) };
}
/** add slots for joystick / gamepad numbers that bindings use but no slot has yet (e.g. a capture from an unmapped controller) */
export function ensureUsedSlots(map: SlotMap, rebinds: RebindMap, pads: readonly (PadIdentity & { instance: number })[] = []): SlotMap {
  let m = map;
  for (const u of usedSlots(rebinds)) {
    if (m.slots.some((s) => s.slot === u.slot && s.instance === u.instance)) continue;
    const pad = pads.find((p) => p.kind === u.slot && p.instance === u.instance && !m.slots.some((s) => s.hw?.key === p.key));
    m = addSlot(m, u.slot, u.instance, pad ? hardwareOf(pad) : undefined);
  }
  return m;
}

/** game numbers for detected controllers that sit in a slot (pad key -> kind / instance), for devices.ts describePads */
export function padAssign(map: SlotMap): Record<string, { kind: 'js' | 'gp'; instance: number }> {
  const out: Record<string, { kind: 'js' | 'gp'; instance: number }> = {};
  for (const s of map.slots) if (isController(s) && s.hw && !s.hw.manual) out[s.hw.key] = { kind: s.slot, instance: s.instance };
  return out;
}
/** joystick numbers taken by slots (controllers that sit in no slot are numbered after them) */
export const reservedJs = (map: SlotMap) => map.slots.filter((s) => s.slot === 'js').map((s) => s.instance);

/** name to show for a slot's device: its hardware, else the device the game file names */
export function slotDeviceName(s: GameSlot): string | undefined {
  if (s.hw) return s.hw.name;
  if (s.gameProduct) return parseProfileProduct(s.gameRawProduct ?? s.gameProduct).name || s.gameProduct;
  return undefined;
}
/** identity used to match a template: the hardware (live pad info when connected), else the game file's product */
export function slotIdentity(s: GameSlot, pad?: PadIdentity): DeviceIdentity {
  const slot = s.slot === 'gp' ? 'gp' : 'js';
  if (pad) return { name: pad.name, vendor: pad.vendor, productId: pad.productId, buttons: pad.buttons, slot, ...(pad.dup ? { dup: pad.dup } : {}) };
  if (s.hw) return { name: s.hw.name, vendor: s.hw.vendor, productId: s.hw.productId, buttons: s.hw.buttons, slot, ...(s.hw.dup ? { dup: s.hw.dup } : {}) };
  if (s.gameProduct) { const pp = parseProfileProduct(s.gameRawProduct ?? s.gameProduct); return { ...pp, slot }; }
  return { slot };
}

/** Product attribute an added slot writes into <options> (imported <options> blocks keep their own) */
export function slotProduct(s: GameSlot, pad?: PadIdentity): string | undefined {
  return pad?.product ?? s.hw?.product ?? s.hw?.name ?? s.gameRawProduct ?? s.gameProduct;
}

/* ------------------------------------------------------------- bindings on a slot */
type Target = { slot: Slot; instance: number };
const onSlot = (r: Pick<Rebind, 'slot' | 'instance' | 'input'>, t: Target) => !!r.input && r.slot === t.slot && r.instance === t.instance;
const actionKeys = (rebinds: RebindMap, idx: DefaultsIndex) => {
  const keys = new Set(idx.keys());
  for (const [m, acts] of Object.entries(rebinds)) for (const a of Object.keys(acts)) keys.add(`${m}/${a}`);
  return [...keys];
};
const split = (k: string) => { const i = k.indexOf('/'); return { map: k.slice(0, i), action: k.slice(i + 1) }; };

/** the profile's own bindings on a slot (what removing the slot drops from the file; game defaults aren't stored in it) */
export function slotBindingCount(rebinds: RebindMap, t: Target): number {
  let n = 0;
  for (const acts of Object.values(rebinds)) for (const list of Object.values(acts)) for (const r of list) if (onSlot(r, t)) n++;
  return n;
}

/** drop the profile's bindings on a slot (a group left empty keeps the game defaults cleared, as it was) */
export function dropSlotBindings(rebinds: RebindMap, idx: DefaultsIndex, t: Target): { rebinds: RebindMap; touched: { map: string; action: string }[]; dropped: number } {
  let out = rebinds, dropped = 0;
  const touched: { map: string; action: string }[] = [];
  const g = groupOfSlot(t.slot);
  for (const [map, acts] of Object.entries(rebinds)) for (const [action, list] of Object.entries(acts)) {
    const mine = list.filter((r) => groupOfSlot(r.slot) === g);
    const n = mine.filter((r) => onSlot(r, t)).length;
    if (!n) continue;
    dropped += n;
    touched.push({ map, action });
    const keep = mine.filter((r) => r.input && !onSlot(r, t));
    out = setGroup(out, idx.get(`${map}/${action}`), map, action, g, keep);
  }
  return { rebinds: out, touched, dropped };
}

export interface CopyPlan {
  /** bindings that would be copied (effective ones: the profile's plus the game defaults it keeps) */
  count: number;
  /** how many of those are the profile's own bindings (the rest are game defaults it keeps on that slot) */
  yours: number;
  actions: number;
  /** distinct inputs copied (e.g. button5, hat1_up, x) */
  inputs: string[];
  /** bindings already on the target slot that use one of those inputs */
  clashes: number;
}
const mainOf = (input: string) => { const t = normalizeCombo(input).split('+'); return t[t.length - 1] ?? input; };

function sourceLists(rebinds: RebindMap, idx: DefaultsIndex, from: Target) {
  const g = groupOfSlot(from.slot);
  const out: { map: string; action: string; eff: Rebind[]; src: Rebind[] }[] = [];
  for (const k of actionKeys(rebinds, idx)) {
    const { map, action } = split(k);
    const eff = effectiveGroup(idx.get(k), rebinds[map]?.[action], g);
    const src = eff.filter((r) => onSlot(r, from));
    out.push({ map, action, eff, src });
  }
  return out;
}

/** what copying a slot's bindings to another slot of the same kind would do */
export function planCopy(rebinds: RebindMap, idx: DefaultsIndex, from: Target, to: Target): CopyPlan {
  const lists = sourceLists(rebinds, idx, from);
  const src = lists.filter((l) => l.src.length);
  const combos = new Set(src.flatMap((l) => l.src.map((r) => normalizeCombo(r.input))));
  let clashes = 0;
  for (const l of lists) clashes += l.eff.filter((r) => onSlot(r, to) && combos.has(normalizeCombo(r.input))).length;
  return {
    count: src.reduce((n, l) => n + l.src.length, 0), yours: Math.min(src.reduce((n, l) => n + l.src.length, 0), slotBindingCount(rebinds, from)), actions: src.length,
    inputs: [...new Set(src.flatMap((l) => l.src.map((r) => mainOf(r.input))))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    clashes,
  };
}

/**
 * Copy (or move) every binding of one slot onto another slot of the same kind: the same input names carry over (button5 stays
 * button5). Clashes (the target already uses that input): 'replace' removes the target's existing bindings on it, 'keep' leaves
 * both (they then show as conflicts). `skip` = inputs (main input, e.g. button70) not to copy.
 */
export function copySlotBindings(rebinds: RebindMap, idx: DefaultsIndex, from: Target, to: Target, o: { clash: 'replace' | 'keep'; move?: boolean; skip?: ReadonlySet<string> }): { rebinds: RebindMap; touched: { map: string; action: string }[]; copied: number; replaced: number } {
  if (from.slot !== to.slot || from.instance === to.instance) return { rebinds, touched: [], copied: 0, replaced: 0 };
  const g = groupOfSlot(from.slot);
  const lists = sourceLists(rebinds, idx, from);
  const keepIt = (r: Rebind) => !o.skip?.has(mainOf(r.input));
  const combos = new Set(lists.flatMap((l) => l.src.filter(keepIt).map((r) => normalizeCombo(r.input))));
  let out = rebinds, copied = 0, replaced = 0;
  const touched: { map: string; action: string }[] = [];
  for (const l of lists) {
    let next = l.eff;
    const add = l.src.filter(keepIt).map((r) => { const n: Rebind = { ...r, instance: to.instance }; delete n.defaultInput; return n; });
    if (o.clash === 'replace') {
      const before = next.length;
      next = next.filter((r) => !(onSlot(r, to) && combos.has(normalizeCombo(r.input))));
      replaced += before - next.length;
    }
    if (o.move) next = next.filter((r) => !onSlot(r, from));
    const have = new Set(next.map((r) => `${r.slot}${r.instance}:${normalizeCombo(r.input)}`));
    const fresh = add.filter((r) => !have.has(`${r.slot}${r.instance}:${normalizeCombo(r.input)}`));
    copied += fresh.length;
    next = [...next, ...fresh];
    if (next.length === l.eff.length && fresh.length === 0 && next.every((r, i) => r === l.eff[i])) continue;
    touched.push({ map: l.map, action: l.action });
    out = setGroup(out, idx.get(`${l.map}/${l.action}`), l.map, l.action, g, next);
  }
  return { rebinds: out, touched, copied, replaced };
}

/* ------------------------------------------------------------- reordering (move up / down) */
const swapNum = (n: number, a: number, b: number) => (n === a ? b : n === b ? a : n);
/**
 * Swap two slots' numbers (e.g. js2 <> js3) in the profile's own bindings: every stored binding on either number is rewritten
 * to the other (js2_button4 -> js3_button4 and back), so each device keeps what you bound on it. The game's default bindings
 * aren't stored in the profile and stay on their number, like the game's own pp_resortdevices; cleared defaults (js1_) stay
 * cleared. Actions with no stored binding on either number are untouched.
 */
export function swapSlotBindings(rebinds: RebindMap, idx: DefaultsIndex, slot: Slot, a: number, b: number): { rebinds: RebindMap; touched: { map: string; action: string }[]; moved: number } {
  if (a === b) return { rebinds, touched: [], moved: 0 };
  const g = groupOfSlot(slot);
  const hit = (r: Rebind) => r.slot === slot && (r.instance === a || r.instance === b) && !!r.input;
  let out = rebinds, moved = 0;
  const touched: { map: string; action: string }[] = [];
  for (const [map, acts] of Object.entries(rebinds)) {
    for (const [action, list] of Object.entries(acts)) {
      const own = list.filter((r) => groupOfSlot(r.slot) === g);
      const n = own.filter(hit).length;
      if (!n) continue;
      moved += n;
      touched.push({ map, action });
      out = setGroup(out, idx.get(`${map}/${action}`), map, action, g, own.map((r) => (hit(r) ? { ...r, instance: swapNum(r.instance, a, b) } : r)));
    }
  }
  return { rebinds: out, touched, moved };
}
/** swap two slots' numbers in the slot map: hardware, template pick and the game file's device name go along with each slot */
export function swapSlots(map: SlotMap, slot: Slot, a: number, b: number): SlotMap {
  return { ...map, slots: sortSlots(map.slots.map((s) => (s.slot === slot && (s.instance === a || s.instance === b) ? { ...s, instance: swapNum(s.instance, a, b) } : s))) };
}
/** swap two device numbers in the imported file's device list (<options type=… instance=…>) */
export function swapProfileDevices<T extends { slot: Slot; instance: number }>(devices: readonly T[], slot: Slot, a: number, b: number): T[] {
  return devices.map((d) => (d.slot === slot && (d.instance === a || d.instance === b) ? { ...d, instance: swapNum(d.instance, a, b) } : d));
}
/** the neighbour a slot swaps with when moved up (-1) or down (+1) among the slots of its kind, if any */
export function neighbourSlot(map: SlotMap, gs: { slot: Slot; instance: number }, dir: -1 | 1): GameSlot | undefined {
  const same = map.slots.filter((s) => s.slot === gs.slot).sort((x, y) => x.instance - y.instance);
  const i = same.findIndex((s) => s.instance === gs.instance);
  return i < 0 ? undefined : same[i + dir];
}

/* ------------------------------------------------------------- storage */
export const SLOTS_KEY = 'sc-mapper:slots:v1';
/** slot map of the game defaults (no profile): copied to the profile created on the first edit */
export const DEFAULTS_SLOT_KEY = '_defaults';
export type SlotStore = Record<string, SlotMap>;

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
/** sanitize a stored slot map (anything odd is dropped rather than trusted) */
export function cleanSlotMap(v: unknown): SlotMap | null {
  if (!isObj(v) || !Array.isArray(v.slots)) return null;
  const slots: GameSlot[] = [];
  for (const s of v.slots) {
    if (!isObj(s) || !SLOT_ORDER.includes(s.slot as Slot) || !Number.isInteger(s.instance) || (s.instance as number) < 1 || (s.instance as number) > 16) continue;
    if (slots.some((x) => x.slot === s.slot && x.instance === s.instance)) continue;
    const g: GameSlot = { slot: s.slot as Slot, instance: s.instance as number };
    if (typeof s.gameProduct === 'string') g.gameProduct = s.gameProduct;
    if (typeof s.gameRawProduct === 'string') g.gameRawProduct = s.gameRawProduct;
    if (isObj(s.hw) && typeof s.hw.key === 'string' && typeof s.hw.name === 'string') g.hw = s.hw as unknown as SlotHardware;
    if (s.hwPinned === true) g.hwPinned = true;
    if (s.hwMatch === 'usb' || s.hwMatch === 'name' || s.hwMatch === 'legacy') g.hwMatch = s.hwMatch;
    if (typeof s.template === 'string') g.template = s.template;
    slots.push(g);
  }
  const hwTemplates: Record<string, string> = {};
  if (isObj(v.hwTemplates)) for (const [k, t] of Object.entries(v.hwTemplates)) if (typeof t === 'string') hwTemplates[k] = t;
  return { version: 1, slots: sortSlots(slots), hwTemplates, ...(v.pendingMatch === true ? { pendingMatch: true } : {}) };
}
export function loadSlotStore(): SlotStore {
  try {
    const raw = JSON.parse(localStorage.getItem(SLOTS_KEY) ?? '{}');
    if (!isObj(raw)) return {};
    const out: SlotStore = {};
    for (const [k, v] of Object.entries(raw)) { const m = cleanSlotMap(v); if (m) out[k] = m; }
    return out;
  } catch { return {}; }
}
export function saveSlotStore(s: SlotStore) {
  try { localStorage.setItem(SLOTS_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}
/** every piece of hardware any profile has seen (for "not connected" picks), newest first, one per key */
export function knownHardware(store: SlotStore): SlotHardware[] {
  const out = new Map<string, SlotHardware>();
  for (const m of Object.values(store)) for (const s of m.slots) if (s.hw && !out.has(s.hw.key)) out.set(s.hw.key, s.hw);
  return [...out.values()];
}
