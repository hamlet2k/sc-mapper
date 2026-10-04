// Profile editing: rebinds are stored per action and per device group, exactly as the game stores them
// (a group's rebinds replace that group's defaults; an empty input clears them).
import { contextOf, contextsOverlap, modeBucket } from './groups';
import { bindKey, groupOfSlot, physOf } from './inputs';
import type { Binding, DefaultAction, DefaultsData, Group, Profile, Rebind, RebindMap, Row } from './types';

export type DefaultsIndex = Map<string, DefaultAction>;
export const indexDefaults = (d: DefaultsData): DefaultsIndex =>
  new Map(d.maps.flatMap((m) => m.actions.map((a) => [`${m.name}/${a.name}`, a] as const)));

export const countRebinds = (r: RebindMap) =>
  Object.values(r).reduce((n, acts) => n + Object.values(acts).reduce((k, l) => k + l.length, 0), 0);

/** Current effective rebinds of a group: the profile's rebinds if it overrides the group, otherwise the defaults */
export function effectiveGroup(a: DefaultAction | undefined, rebinds: Rebind[] | undefined, g: Group): Rebind[] {
  const own = (rebinds ?? []).filter((r) => groupOfSlot(r.slot) === g);
  if (own.length) return own.filter((r) => r.input).map((r) => ({ ...r }));
  return (a?.d ?? []).filter((d) => groupOfSlot(d.slot) === g)
    .map((d) => ({ slot: d.slot, instance: 1, input: d.input, ...(d.mode ? { mode: d.mode } : {}) }));
}

const sig = (r: { slot: Rebind['slot']; instance?: number; input: string; mode?: string; multiTap?: number }) =>
  `${bindKey(r.slot, r.instance ?? 1, r.input)}|${r.mode ?? ''}|${(r.multiTap ?? 1) > 1 ? r.multiTap : 1}`;

/** True when a group's rebind list is equivalent to the shipped defaults (so it needn't be written) */
export function equalsDefaults(a: DefaultAction | undefined, g: Group, list: Rebind[]): boolean {
  const defs = (a?.d ?? []).filter((d) => groupOfSlot(d.slot) === g).map((d) => sig({ ...d, instance: 1 }));
  const eff = list.filter((r) => r.input).map(sig);
  if (defs.length !== eff.length) return false;
  const s = new Set(defs);
  return eff.every((x) => s.has(x));
}

function dedupe(list: Rebind[]): Rebind[] {
  const seen = new Set<string>();
  return list.filter((r) => {
    const k = bindKey(r.slot, r.instance, r.input);
    if (!r.input || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Set one device group of one action. Returns a new rebind map (input is not mutated). */
export function setGroup(rebinds: RebindMap, a: DefaultAction | undefined, map: string, action: string, g: Group, list: Rebind[]): RebindMap {
  const clean = dedupe(list).map((r) => {
    const o: Rebind = { slot: r.slot, instance: r.instance, input: r.input };
    if (r.mode) o.mode = r.mode;
    if ((r.multiTap ?? 1) > 1) o.multiTap = r.multiTap;
    if (r.defaultInput !== undefined) o.defaultInput = r.defaultInput;
    return o;
  });
  const others = (rebinds[map]?.[action] ?? []).filter((r) => groupOfSlot(r.slot) !== g);
  let mine: Rebind[];
  if (equalsDefaults(a, g, clean)) mine = [];
  else if (!clean.length) mine = [{ slot: g === 'km' ? 'kb' : g, instance: 1, input: '' }]; // cleared default: kb1_ / js1_ / gp1_
  else mine = clean;
  const next = [...others, ...mine];
  const out: RebindMap = { ...rebinds, [map]: { ...(rebinds[map] ?? {}) } };
  if (next.length) out[map][action] = next;
  else delete out[map][action];
  if (!Object.keys(out[map]).length) delete out[map];
  return out;
}

/** Restore one action to exactly the given rebinds (undefined = game defaults) */
export function setAction(rebinds: RebindMap, map: string, action: string, value: Rebind[] | undefined): RebindMap {
  const out: RebindMap = { ...rebinds, [map]: { ...(rebinds[map] ?? {}) } };
  if (value?.length) out[map][action] = value.map((r) => ({ ...r }));
  else delete out[map][action];
  if (!Object.keys(out[map]).length) delete out[map];
  return out;
}

/** Drop groups whose rebinds are identical to the defaults (no-op rebinds) */
export function pruneRebinds(rebinds: RebindMap, idx: DefaultsIndex): RebindMap {
  let out = rebinds;
  for (const [map, acts] of Object.entries(rebinds)) {
    for (const [action, list] of Object.entries(acts)) {
      const a = idx.get(`${map}/${action}`);
      if (!a) continue;
      for (const g of ['km', 'js', 'gp'] as Group[]) {
        const own = list.filter((r) => groupOfSlot(r.slot) === g);
        if (own.length && own.some((r) => r.input) && equalsDefaults(a, g, own)) out = setGroup(out, a, map, action, g, own);
        else if (own.length && !own.some((r) => r.input) && !a.d.some((d) => groupOfSlot(d.slot) === g)) out = setGroup(out, a, map, action, g, []);
      }
    }
  }
  return out;
}

export function withRebinds(p: Profile, rebinds: RebindMap): Profile {
  return { ...p, rebinds, rebindCount: countRebinds(rebinds), editedAt: new Date().toISOString() };
}

export function newProfile(name: string, rebinds: RebindMap = {}): Profile {
  return {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    name, fileName: 'created in SC Keymap', importedAt: new Date().toISOString(), devices: [], rebinds,
    rebindCount: countRebinds(rebinds), local: true,
  };
}

export interface CaptureConflict { row: Row; binding: Binding }
/**
 * Other actions that already use this physical input in a context that is live at the same time,
 * with an activation mode that would fire together (same rules as the Conflicts view).
 */
export function conflictsFor(rows: Row[], target: Row, cand: Rebind, mode?: string): CaptureConflict[] {
  const phys = physOf(cand.slot, cand.instance, cand.input);
  const ctx = contextOf(target.map);
  const bucket = modeBucket(mode ?? cand.mode ?? target.mode);
  const out: CaptureConflict[] = [];
  for (const r of rows) {
    if (r.id === target.id || r.hidden || r.action === target.action) continue;
    for (const b of r.bindings) {
      if (b.phys !== phys) continue;
      if (!contextsOverlap(contextOf(r.map), ctx)) continue;
      if (modeBucket(b.mode) !== bucket) continue;
      if ((b.multiTap ?? 1) !== (cand.multiTap ?? 1)) continue;
      out.push({ row: r, binding: b });
    }
  }
  return out;
}
