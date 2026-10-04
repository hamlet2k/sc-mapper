// Connected game controllers (Gamepad API) and which Star Citizen device instance (js1, js2..., gp1) each one is.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { parsePadId, productString } from './capture';
import type { ProfileDevice } from './types';

export type PadKind = 'js' | 'gp';
/** how a browser device got its game instance: set by the user, matched to a device declared in the profile, or by browser order */
export type AssignSource = 'manual' | 'profile-id' | 'profile-name' | 'auto';
export interface PadInfo {
  key: string; index: number; id: string; name: string; vendor?: string; productId?: string; mapping: string;
  buttons: number; axes: number; kind: PadKind; instance: number; product: string;
  source: AssignSource;
  /** product name of the profile device this one was matched to */
  matched?: string;
}
type Assign = Record<string, { kind?: PadKind; instance?: number }>;
/** the parts of a Gamepad this module reads (real Gamepad objects or test doubles) */
export interface PadLike {
  id: string; index: number; mapping: string; connected?: boolean; timestamp?: number;
  buttons: readonly { pressed: boolean; value: number; touched?: boolean }[]; axes: readonly number[];
}
const KEY = 'sc-mapper:devices:v1';

export function loadAssign(): Assign {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') ?? {}; } catch { return {}; }
}
export function saveAssign(a: Assign) {
  try { localStorage.setItem(KEY, JSON.stringify(a)); } catch { /* ignore */ }
}

/** Re-query on every call: Chrome returns fresh snapshot objects, so a kept reference never updates */
export const getPads = (): Gamepad[] =>
  (typeof navigator !== 'undefined' && navigator.getGamepads ? Array.from(navigator.getGamepads() ?? []) : [])
    .filter((p): p is Gamepad => !!p && p.connected !== false);

/** Identical devices share an id, so the key includes the occurrence number */
export function padKeys(pads: readonly PadLike[]): string[] {
  const seen = new Map<string, number>();
  return pads.map((p) => { const n = (seen.get(p.id) ?? 0) + 1; seen.set(p.id, n); return `${p.id}#${n}`; });
}

/** Name and USB ids from a profile <options Product="..."> value: " VKBsim Gladiator EVO R    {0200231D-0000-0000-0000-504944564944}" */
export function parseProfileProduct(product: string): { name: string; vendor?: string; productId?: string } {
  const m = /\{([0-9a-f]{4})([0-9a-f]{4})-0000-0000-0000-504944564944\}/i.exec(product);
  const name = product.replace(/\{[^}]*\}/g, '').replace(/\s+/g, ' ').trim();
  return m ? { name, productId: m[1].toUpperCase(), vendor: m[2].toUpperCase() } : { name };
}
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');
const sameName = (a: string, b: string) => {
  const x = norm(a), y = norm(b);
  return x.length >= 4 && y.length >= 4 && (x === y || x.includes(y) || y.includes(x));
};

/**
 * Work out kind (joystick/gamepad) and game instance for every browser device. Priority:
 * 1. what the user picked; 2. a device declared in the active profile with the same USB vendor/product id, then the same name;
 * 3. browser order (standard-mapping pads are gamepads, everything else joysticks numbered from the lowest free js slot).
 */
export function describePads(pads: readonly PadLike[], assign: Assign, profileDevices: readonly ProfileDevice[] = []): PadInfo[] {
  const keys = padKeys(pads);
  const out: PadInfo[] = pads.map((p, i) => {
    const id = parsePadId(p.id);
    return {
      key: keys[i], index: p.index, id: p.id, name: id.name, vendor: id.vendor, productId: id.product, mapping: p.mapping,
      buttons: p.buttons.length, axes: p.axes.length, kind: p.mapping === 'standard' ? 'gp' : 'js', instance: 0,
      product: productString(p.id), source: 'auto',
    };
  });
  const done = new Set<number>();
  const usedProfile = new Set<ProfileDevice>();
  out.forEach((d, i) => {
    const a = assign[d.key];
    if (!a) return;
    if (a.kind) d.kind = a.kind;
    if (a.instance) { d.instance = a.instance; d.source = 'manual'; done.add(i); }
    else if (a.kind) d.source = 'manual';
  });
  for (const pd of profileDevices) if (out.some((d, i) => done.has(i) && d.kind === pd.slot && d.instance === pd.instance)) usedProfile.add(pd);
  const decl = profileDevices.filter((pd) => pd.slot === 'js' || pd.slot === 'gp').slice().sort((a, b) => a.instance - b.instance);
  const claim = (test: (d: PadInfo, pp: ReturnType<typeof parseProfileProduct>) => boolean, source: AssignSource) => {
    for (const pd of decl) {
      if (usedProfile.has(pd)) continue;
      const pp = parseProfileProduct(pd.rawProduct ?? pd.product);
      const i = out.findIndex((d, j) => !done.has(j) && (assign[d.key]?.kind ?? pd.slot) === pd.slot && test(d, pp));
      if (i < 0) continue;
      Object.assign(out[i], { kind: pd.slot as PadKind, instance: pd.instance, source: out[i].source === 'manual' ? 'manual' : source, matched: pp.name });
      done.add(i); usedProfile.add(pd);
    }
  };
  claim((d, pp) => !!pp.vendor && d.vendor === pp.vendor && d.productId === pp.productId, 'profile-id');
  claim((d, pp) => !!pp.name && sameName(d.name, pp.name), 'profile-name');
  const taken = new Set(out.filter((d, i) => done.has(i) && d.kind === 'js').map((d) => d.instance));
  let next = 1;
  out.forEach((d, i) => {
    if (done.has(i)) return;
    if (d.kind === 'gp') { d.instance = 1; return; }
    while (taken.has(next)) next++;
    d.instance = next; taken.add(next);
  });
  return out;
}

/**
 * Live list of controllers. Browsers only reveal a controller after one of its buttons is pressed while the page has focus,
 * and `gamepadconnected` may never fire before that, so this polls as well as listening for the events.
 */
const NO_DEVICES: readonly ProfileDevice[] = [];
export function usePads(active: boolean, profileDevices: readonly ProfileDevice[] = NO_DEVICES) {
  const [assign, setAssign] = useState<Assign>(() => loadAssign());
  const [pads, setPads] = useState<PadInfo[]>([]);
  const describe = useCallback((list: readonly PadLike[]) => describePads(list, assign, profileDevices), [assign, profileDevices]);
  useEffect(() => {
    if (!active) return;
    const tick = () => setPads((prev) => {
      const next = describe(getPads());
      return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
    });
    tick();
    const t = setInterval(tick, 250);
    window.addEventListener('gamepadconnected', tick);
    window.addEventListener('gamepaddisconnected', tick);
    return () => { clearInterval(t); window.removeEventListener('gamepadconnected', tick); window.removeEventListener('gamepaddisconnected', tick); };
  }, [active, describe]);
  const update = useCallback((key: string, v: { kind?: PadKind; instance?: number }) => setAssign((prev) => {
    const n = { ...prev, [key]: { ...prev[key], ...v } };
    if (v.kind && !v.instance) delete n[key].instance;
    saveAssign(n);
    return n;
  }), []);
  const reset = useCallback((key?: string) => setAssign((prev) => {
    const n = { ...prev };
    if (key) delete n[key]; else for (const k of Object.keys(n)) delete n[k];
    saveAssign(n);
    return n;
  }), []);
  return useMemo(() => ({ pads, update, reset, describe }), [pads, update, reset, describe]);
}
