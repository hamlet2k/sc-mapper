// "Refresh game state": Star Citizen numbers devices itself (Windows USB order) and sometimes renumbers them (on its own or
// after a device was unplugged). The app never changes that order: it reads the game's current device list from a fresh
// export and moves the profile's mappings (bindings, hardware, template pick, axis settings) to the numbers the game now uses.
import { parseProfileProduct } from './devices';
import { permuteOptionInstances, setOptionsProduct, type DeviceSettings } from './devopts';
import type { DefaultsIndex } from './edit';
import { permuteSlotBindings, permuteSlots, sortSlots, type GameSlot, type SlotMap } from './slots';
import type { ProfileDevice, RebindMap, Slot } from './types';

const KINDS: Slot[] = ['kb', 'mo', 'js', 'gp'];
export const SLOT_TYPE: Record<Slot, string> = { kb: 'keyboard', mo: 'mouse', js: 'joystick', gp: 'gamepad' };

/** a device the profile knows at a number: from its device list, or a slot (named by the game file or by its hardware) */
export interface KnownDevice { slot: Slot; instance: number; name?: string; rawProduct?: string }
export interface RematchMove { slot: Slot; from: number; to: number; name: string; guessed?: boolean }
export interface Rematch {
  /** per kind: old number -> new number (a bijection over every number involved); kinds without a change are absent */
  perms: Partial<Record<Slot, Map<number, number>>>;
  /** devices that change number (named ones, and slots without a name pushed out of the way) */
  moves: RematchMove[];
  /** devices in the game's list the profile doesn't know */
  added: ProfileDevice[];
  /** devices the profile knows that aren't in the game's list: their mappings are kept (moved to a free number if theirs is taken) */
  missing: RematchMove[];
  /** identical devices (same product name) whose numbers changed: the file can't tell them apart, their relative order is assumed */
  ambiguous: { slot: Slot; name: string; from: number[]; to: number[] }[];
  /** the game's device list, as read */
  game: ProfileDevice[];
  unchanged: boolean;
}

export const shortProduct = (name?: string) => (name ? parseProfileProduct(name).name || name.trim() : '');
/** product names compared ignoring case, spacing and the {GUID} */
export const deviceKey = (name?: string) => shortProduct(name).toLowerCase().replace(/\s+/g, ' ').trim();
const rawKey = (raw?: string) => (raw ? raw.replace(/\s+/g, ' ').trim().toLowerCase() : '');
const byInst = <T extends { instance: number }>(a: T, b: T) => a.instance - b.instance;

/** what the active profile knows: its stored device list first, then slots it has no device entry for */
export function knownDevices(devices: readonly ProfileDevice[], map: SlotMap): KnownDevice[] {
  const out: KnownDevice[] = [];
  const seen = new Set<string>();
  for (const d of devices) {
    const k = `${d.slot}${d.instance}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ slot: d.slot, instance: d.instance, name: d.product, ...(d.rawProduct ? { rawProduct: d.rawProduct } : {}) });
  }
  for (const s of map.slots) {
    const k = `${s.slot}${s.instance}`;
    if (seen.has(k)) continue;
    seen.add(k);
    const name = s.gameProduct ?? s.hw?.name;
    out.push({ slot: s.slot, instance: s.instance, ...(name ? { name } : {}), ...(s.gameRawProduct ? { rawProduct: s.gameRawProduct } : {}) });
  }
  return out;
}

/** extend an injective renumbering to a bijection over every number it touches (numbers that receive a device but had none give theirs back) */
export function completePerm(partial: ReadonlyMap<number, number>): Map<number, number> {
  const out = new Map(partial);
  const dom = new Set(partial.keys()), rng = new Set(partial.values());
  const needImage = [...rng].filter((n) => !dom.has(n)).sort((a, b) => a - b);
  const freeImage = [...dom].filter((n) => !rng.has(n)).sort((a, b) => a - b);
  needImage.forEach((n, i) => out.set(n, freeImage[i]));
  for (const [a, b] of [...out]) if (a === b) out.delete(a);
  return out;
}

/**
 * Compare the profile's devices with the game's current list, by product name per kind, and work out where each device's
 * mappings must go. Identical product names: matched by their full Product string when it tells them apart; otherwise in
 * order (the n-th identical device stays the n-th), flagged as ambiguous when their numbers change.
 */
export function computeRematch(stored: readonly KnownDevice[], game: readonly ProfileDevice[]): Rematch {
  const r: Rematch = { perms: {}, moves: [], added: [], missing: [], ambiguous: [], game: game.map((d) => ({ ...d })), unchanged: true };
  for (const slot of KINDS) {
    const S = stored.filter((d) => d.slot === slot).sort(byInst);
    const G = game.filter((d) => d.slot === slot).sort(byInst);
    if (!S.length && !G.length) continue;
    const pairs: { s: KnownDevice; g: ProfileDevice; guessed: boolean }[] = [];
    const keys = [...new Set([...S.map((d) => deviceKey(d.name)), ...G.map((d) => deviceKey(d.product))])].filter(Boolean);
    for (const key of keys) {
      const s = S.filter((d) => deviceKey(d.name) === key), g = G.filter((d) => deviceKey(d.product) === key);
      if (!s.length || !g.length) continue;
      if (s.length === 1 && g.length === 1) { pairs.push({ s: s[0], g: g[0], guessed: false }); continue; }
      const rs = s.map((d) => rawKey(d.rawProduct)), rg = g.map((d) => rawKey(d.rawProduct));
      const distinct = (l: string[]) => l.every(Boolean) && new Set(l).size === l.length;
      if (distinct(rs) && distinct(rg) && rs.every((x) => rg.includes(x))) {
        s.forEach((d, i) => pairs.push({ s: d, g: g[rg.indexOf(rs[i])], guessed: false }));
        continue;
      }
      const k = Math.min(s.length, g.length);
      const changed = s.length !== g.length || s.some((d, i) => i < k && d.instance !== g[i].instance);
      for (let i = 0; i < k; i++) pairs.push({ s: s[i], g: g[i], guessed: changed });
      if (changed) r.ambiguous.push({ slot, name: shortProduct(g[0].product), from: s.map((d) => d.instance), to: g.map((d) => d.instance) });
    }
    const pairedS = new Set(pairs.map((p) => p.s)), pairedG = new Set(pairs.map((p) => p.g));
    const added = G.filter((d) => !pairedG.has(d));
    r.added.push(...added);
    const partial = new Map<number, number>(pairs.map((p) => [p.s.instance, p.g.instance]));
    const used = new Set<number>([...partial.values(), ...added.map((d) => d.instance)]);
    const loose = S.filter((d) => !pairedS.has(d));
    // a device the game doesn't list (or a slot without a name) keeps its number when nothing else lands there
    const rest: KnownDevice[] = [];
    for (const d of loose) {
      const blocked = used.has(d.instance) && !(!d.name && added.some((a) => a.instance === d.instance) && ![...partial.values()].includes(d.instance));
      if (blocked) rest.push(d);
      else { used.add(d.instance); partial.set(d.instance, d.instance); }
    }
    // ...otherwise it goes after the game's devices
    let n = Math.max(0, ...G.map((d) => d.instance), ...used) + 1;
    for (const d of rest) { while (used.has(n)) n++; used.add(n); partial.set(d.instance, n); }
    for (const p of pairs) if (p.s.instance !== p.g.instance) r.moves.push({ slot, from: p.s.instance, to: p.g.instance, name: shortProduct(p.g.product), ...(p.guessed ? { guessed: true } : {}) });
    for (const d of loose) {
      const to = partial.get(d.instance)!;
      if (d.name) r.missing.push({ slot, from: d.instance, to, name: shortProduct(d.name) });
      else if (to !== d.instance) r.moves.push({ slot, from: d.instance, to, name: `${slot}${d.instance} (no device name)` });
    }
    const perm = completePerm(partial);
    if (perm.size) r.perms[slot] = perm;
  }
  r.unchanged = !Object.keys(r.perms).length && !r.added.length && !r.missing.length;
  return r;
}

/** renumber bindings and axis settings by the rematch's permutations */
function permuteAll(rebinds: RebindMap, settings: DeviceSettings, r: Rematch, idx: DefaultsIndex) {
  const touched = new Map<string, { map: string; action: string }>();
  let moved = 0;
  for (const [slot, perm] of Object.entries(r.perms) as [Slot, Map<number, number>][]) {
    const b = permuteSlotBindings(rebinds, idx, slot, perm);
    rebinds = b.rebinds;
    moved += b.moved;
    for (const t of b.touched) touched.set(`${t.map}/${t.action}`, t);
    settings = permuteOptionInstances(settings, SLOT_TYPE[slot], perm);
  }
  for (const d of r.game) settings = setOptionsProduct(settings, SLOT_TYPE[d.slot], d.instance, d.rawProduct ?? d.product);
  return { rebinds, settings, touched: [...touched.values()], moved };
}

/**
 * Apply a refresh to the active profile: mappings follow their devices to the game's numbers, the slot map is renumbered the
 * same way (hardware and template picks go along) and named after the game's list, devices the game no longer lists are
 * flagged (their mappings stay), and the device list becomes exactly the game's.
 */
export function applyRematch(state: { rebinds: RebindMap; settings: DeviceSettings; slots: SlotMap }, r: Rematch, idx: DefaultsIndex) {
  const p = permuteAll(state.rebinds, state.settings, r, idx);
  let slots = state.slots;
  for (const [slot, perm] of Object.entries(r.perms) as [Slot, Map<number, number>][]) slots = permuteSlots(slots, slot, perm);
  const list: GameSlot[] = slots.slots.map((s) => ({ ...s }));
  for (const d of r.game) {
    const named = { gameProduct: d.product, ...(d.rawProduct ? { gameRawProduct: d.rawProduct } : {}) };
    const i = list.findIndex((s) => s.slot === d.slot && s.instance === d.instance);
    if (i >= 0) {
      const { gameMissing: _m, gameRawProduct: _r, ...rest } = list[i];
      void _m; void _r;
      list[i] = { ...rest, ...named };
    } else list.push({ slot: d.slot, instance: d.instance, ...named });
  }
  for (const m of r.missing) {
    const i = list.findIndex((s) => s.slot === m.slot && s.instance === m.to);
    if (i >= 0) list[i] = { ...list[i], gameMissing: true };
    else list.push({ slot: m.slot, instance: m.to, gameProduct: m.name, gameMissing: true });
  }
  return { ...p, slots: { ...slots, slots: sortSlots(list) }, devices: r.game.map((d) => ({ ...d })) };
}

/**
 * Importing a file made for another device order over the current game state: move that file's mappings to the current
 * numbers. Devices of the file the game no longer lists keep their entry (at their new number) so their mappings stay named.
 */
export function shiftToOrder<P extends { rebinds: RebindMap; settings?: DeviceSettings; devices: ProfileDevice[] }>(p: P, r: Rematch, idx: DefaultsIndex): P {
  const x = permuteAll(p.rebinds, p.settings ?? { blocks: [] }, r, idx);
  const missing = r.missing.map((m) => {
    const d = p.devices.find((e) => e.slot === m.slot && e.instance === m.from)!;
    return { ...d, instance: m.to };
  });
  return { ...p, rebinds: x.rebinds, settings: x.settings, devices: [...r.game.map((d) => ({ ...d })), ...missing] };
}

/** one-line summary: "Orion Pedals js3 → js5 · CarrierAce MFD L js5 → js3 · new: … · not in the game: …" */
export function rematchParts(r: Rematch): string[] {
  return [
    ...r.moves.map((m) => `${m.name} ${m.slot}${m.from} → ${m.slot}${m.to}${m.guessed ? ' (?)' : ''}`),
    ...r.added.map((d) => `new: ${shortProduct(d.product)} ${d.slot}${d.instance}`),
    ...r.missing.map((m) => `not in the game: ${m.name} (${m.slot}${m.from}${m.to !== m.from ? `, mappings kept on ${m.slot}${m.to}` : ', mappings kept'})`),
  ];
}
