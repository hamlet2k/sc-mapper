// Connected game controllers (Gamepad API) and the user's assignment of each one to a game device instance (js1, js2, gp1...).
import { useEffect, useState } from 'react';
import { parsePadId, productString } from './capture';

export type PadKind = 'js' | 'gp';
export interface PadInfo {
  key: string; index: number; id: string; name: string; mapping: string;
  buttons: number; axes: number; kind: PadKind; instance: number; product: string;
}
type Assign = Record<string, { kind?: PadKind; instance?: number }>;
const KEY = 'sc-mapper:devices:v1';

export function loadAssign(): Assign {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') ?? {}; } catch { return {}; }
}
export function saveAssign(a: Assign) {
  try { localStorage.setItem(KEY, JSON.stringify(a)); } catch { /* ignore */ }
}

export const getPads = (): Gamepad[] =>
  (typeof navigator !== 'undefined' && navigator.getGamepads ? Array.from(navigator.getGamepads()) : []).filter((p): p is Gamepad => !!p && p.connected !== false);

/** Identical devices share an id, so the key includes the occurrence number */
export function padKeys(pads: Gamepad[]): string[] {
  const seen = new Map<string, number>();
  return pads.map((p) => { const n = (seen.get(p.id) ?? 0) + 1; seen.set(p.id, n); return `${p.id}#${n}`; });
}

export function describePads(pads: Gamepad[], assign: Assign): PadInfo[] {
  const keys = padKeys(pads);
  const kinds = pads.map((p, i) => assign[keys[i]]?.kind ?? (p.mapping === 'standard' ? 'gp' : 'js'));
  const taken = new Set(pads.map((_, i) => (kinds[i] === 'js' ? assign[keys[i]]?.instance : undefined)).filter(Boolean));
  let next = 1;
  return pads.map((p, i) => {
    const kind = kinds[i];
    let instance = assign[keys[i]]?.instance;
    if (!instance) {
      if (kind === 'gp') instance = 1;
      else { while (taken.has(next)) next++; instance = next++; }
    }
    return {
      key: keys[i], index: p.index, id: p.id, name: parsePadId(p.id).name, mapping: p.mapping,
      buttons: p.buttons.length, axes: p.axes.length, kind, instance, product: productString(p.id),
    };
  });
}

/** Live list of controllers. Browsers only reveal a controller after one of its buttons is pressed. */
export function usePads(active: boolean) {
  const [assign, setAssign] = useState<Assign>(() => loadAssign());
  const [pads, setPads] = useState<PadInfo[]>([]);
  useEffect(() => {
    if (!active) return;
    const tick = () => setPads((prev) => {
      const next = describePads(getPads(), assign);
      return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
    });
    tick();
    const t = setInterval(tick, 400);
    window.addEventListener('gamepadconnected', tick);
    window.addEventListener('gamepaddisconnected', tick);
    return () => { clearInterval(t); window.removeEventListener('gamepadconnected', tick); window.removeEventListener('gamepaddisconnected', tick); };
  }, [active, assign]);
  const update = (key: string, v: { kind?: PadKind; instance?: number }) => {
    const n = { ...assign, [key]: { ...assign[key], ...v } };
    if (v.kind) delete n[key].instance;
    setAssign(n);
    saveAssign(n);
  };
  return { pads, update };
}
