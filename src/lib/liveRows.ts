// Which bound actions fire right now: the rows of a callout (or the inspector) that belong to the input being pressed / moved,
// for the live row highlight on the Devices page. Pure (no React), unit-tested.
import { isModifier } from './inputs';

/** what a device is doing right now (the Devices page's live state: held buttons, pushed hats, moved axes, axis values) */
export interface LiveState { active: ReadonlySet<string>; values: Readonly<Record<string, number>> }

/** how far a gamepad stick has to be pushed one way for its direction bindings (thumbl_left …) to count: the same threshold
 *  that lights the stick's callout (liveInputs' axisDelta) */
export const DIRECTION_MIN = 0.2;
/** gamepad stick directions: [axis, sign] (Gamepad API Y is negative when pushed up, as in capture.ts' GP_AXIS_DIRS) */
const DIRECTIONS: Readonly<Record<string, readonly [string, -1 | 1]>> = {
  thumbl_left: ['thumblx', -1], thumbl_right: ['thumblx', 1], thumbl_up: ['thumbly', -1], thumbl_down: ['thumbly', 1],
  thumbr_left: ['thumbrx', -1], thumbr_right: ['thumbrx', 1], thumbr_up: ['thumbry', -1], thumbr_down: ['thumbry', 1],
};
/** inputs the live state reports under another name: the analog trigger axes ride on the trigger buttons */
const SAME_AS: Readonly<Record<string, string>> = { triggerl: 'triggerl_btn', triggerr: 'triggerr_btn' };

/** is this physical input held / pushed / moved right now (a gamepad stick direction only when pushed that way) */
export function inputHeld(input: string, live: LiveState): boolean {
  if (live.active.has(input)) return true;
  const d = DIRECTIONS[input];
  if (d) {
    const v = live.values[d[0]];
    return live.active.has(d[0]) && v !== undefined && v * d[1] > DIRECTION_MIN;
  }
  const s = SAME_AS[input];
  return !!s && live.active.has(s);
}

const NO_MODS: ReadonlySet<string> = new Set();
const tokensOf = (prefix: string) => prefix.split('+').map((t) => t.trim()).filter(Boolean);
/** is everything that has to be held with a binding held: keyboard modifiers (lalt …) from `keyMods`, device inputs
 *  (a gamepad's shoulderl layer) from the live state */
export function prefixHeld(prefix: string, live: LiveState, keyMods: ReadonlySet<string>): boolean {
  return tokensOf(prefix).every((t) => (isModifier(t) ? keyMods.has(t) : inputHeld(t, live)));
}

/**
 * The bound actions that fire right now, out of a list (a callout's rows, an input's rows in the inspector). Per physical input:
 * nothing while it isn't held; when it is, the rows whose modifier layer is held too, and of those only the most specific layer
 * (holding LB + A fires LB+A's actions, not plain A's; plain A fires when no layer bound on A is held). Rows of other inputs
 * of the same callout never light.
 */
export function firingRows<T>(items: readonly T[], key: (t: T) => { main: string; prefix: string }, live: LiveState, keyMods: ReadonlySet<string> = NO_MODS): Set<T> {
  const out = new Set<T>();
  if (!live.active.size) return out;
  const byMain = new Map<string, { t: T; n: number }[]>();
  for (const t of items) {
    const { main, prefix } = key(t);
    if (!main || !inputHeld(main, live) || !prefixHeld(prefix, live, keyMods)) continue;
    const l = byMain.get(main) ?? [];
    l.push({ t, n: tokensOf(prefix).length });
    byMain.set(main, l);
  }
  for (const l of byMain.values()) {
    const best = Math.max(...l.map((x) => x.n));
    for (const x of l) if (x.n === best) out.add(x.t);
  }
  return out;
}
/**
 * Compact lists (a callout shows its first `max` rows, then "+N more"): rows that fire must not hide behind "+N more".
 * Order is kept as long as every firing row is already among the first `max`; otherwise the firing rows move up front (both
 * groups keeping their order). `hidden` / `hiddenLive`: rows (and firing rows) left behind "+N more".
 */
export function liveFirst<T>(items: readonly T[], isLive: (t: T) => boolean, max: number): { shown: T[]; hidden: number; hiddenLive: number } {
  const live = items.filter(isLive);
  const ordered = items.slice(max).some(isLive) ? [...live, ...items.filter((t) => !isLive(t))] : [...items];
  const shown = ordered.slice(0, max);
  return { shown, hidden: items.length - shown.length, hiddenLive: live.length - shown.filter(isLive).length };
}
