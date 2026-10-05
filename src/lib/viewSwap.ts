// Swappable photo views: views of a template sharing a `swap` key are alternatives (e.g. the MOZA MTQ's interchangeable grips:
// combat, Airbus, Boeing). Only one of each group shows at a time; a press on a control that only exists on another one (its
// callout sits on that view) switches to it and the choice sticks. Pure helpers (unit-tested); state lives in useSwapViews.
import { calloutView, type DeviceTemplate } from './templates';

type ViewsOf = Pick<DeviceTemplate, 'views' | 'image' | 'aspect'>;
/** swap key -> its view ids in template order (groups of 2+ views only) */
export function swapGroups(t: ViewsOf): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const v of t.views ?? []) if (v.swap) m.set(v.swap, [...(m.get(v.swap) ?? []), v.id]);
  for (const [k, ids] of m) if (ids.length < 2) m.delete(k);
  return m;
}
/** the view shown for each swap group: the chosen one when it belongs to the group, else the group's first */
export function swapShown(t: ViewsOf, chosen: Readonly<Record<string, string>>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, ids] of swapGroups(t)) out[k] = ids.includes(chosen[k]) ? chosen[k] : ids[0];
  return out;
}
/** `t` with the views of its swap groups that are not shown left out (with their callouts); unchanged without swap groups */
export function visibleViews<T extends DeviceTemplate>(t: T, chosen: Readonly<Record<string, string>>): T {
  const groups = swapGroups(t);
  if (!groups.size || !t.views) return t;
  const shown = swapShown(t, chosen);
  const views = t.views.filter((v) => !v.swap || !groups.has(v.swap) || shown[v.swap] === v.id);
  const keep = new Set(views.map((v) => v.id));
  return { ...t, views, aspect: views[0].width / views[0].height, callouts: t.callouts.filter((c) => keep.has(calloutView(t, c))) };
}
/** button / hat inputs (not axes: a resting axis can drift past the live threshold) on the swap views: input -> [group, view] */
export function swapInputs(t: Pick<DeviceTemplate, 'views' | 'image' | 'aspect' | 'callouts'>): Map<string, [string, string]> {
  const groups = swapGroups(t), m = new Map<string, [string, string]>();
  if (!groups.size) return m;
  const groupOf = new Map<string, string>();
  for (const [k, ids] of groups) for (const id of ids) groupOf.set(id, k);
  for (const c of t.callouts) {
    const v = calloutView(t, c), g = groupOf.get(v);
    if (g) for (const i of c.inputs) if (/^(button\d+|hat\d_(up|down|left|right))$/.test(i)) m.set(i, [g, v]);
  }
  return m;
}
/** the swap choices made by the inputs that just became active (in `next`, not in `prev`): group -> view (the newest press wins) */
export function swapPresses(prev: ReadonlySet<string>, next: ReadonlySet<string>, inputs: ReadonlyMap<string, [string, string]>): Record<string, string> | null {
  let out: Record<string, string> | null = null;
  for (const i of next) {
    if (prev.has(i)) continue;
    const gv = inputs.get(i);
    if (gv) (out ??= {})[gv[0]] = gv[1];
  }
  return out;
}
