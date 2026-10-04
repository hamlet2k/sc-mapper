import { bindKey, columnOfInput, devicesOf, groupOfSlot, physOf } from './inputs';
import { groupOf } from './groups';
import type { Binding, DefaultAction, DefaultsData, Device, Group, Profile, Rebind, Row } from './types';

export const GROUPS_ORDER: Group[] = ['km', 'js', 'gp'];

const toBinding = (r: Rebind, actionMode: string | undefined, custom: boolean): Binding => ({
  slot: r.slot, instance: r.instance, input: r.input, mode: r.mode ?? actionMode, multiTap: r.multiTap, custom,
  devices: devicesOf(r.slot, r.input), phys: physOf(r.slot, r.instance, r.input),
});

/** Effective bindings of one device group for an action, given the profile's rebinds for that action. */
export function mergeGroup(a: DefaultAction | undefined, rebinds: Rebind[], g: Group) {
  const defs = (a?.d ?? []).filter((d) => groupOfSlot(d.slot) === g);
  const rbs = rebinds.filter((r) => groupOfSlot(r.slot) === g);
  const bindings: Binding[] = [];
  const cleared: Device[] = [];
  if (!rbs.length) {
    for (const d of defs) bindings.push(toBinding({ slot: d.slot, instance: 1, input: d.input, mode: d.mode }, a?.mode, false));
    return { bindings, cleared, customized: false };
  }
  const defMode = new Map(defs.map((d) => [bindKey(d.slot, 1, d.input), d.mode]));
  const eff = rbs.filter((r) => r.input);
  let customized = false;
  const keys = new Set<string>();
  for (const r of eff) {
    const k = bindKey(r.slot, r.instance, r.input);
    keys.add(k);
    const custom = !defMode.has(k) || (r.mode !== undefined && r.mode !== (defMode.get(k) ?? a?.mode)) || (r.multiTap ?? 1) > 1;
    if (custom) customized = true;
    bindings.push(toBinding(r, a?.mode, custom));
  }
  if ([...defMode.keys()].some((k) => !keys.has(k))) customized = true;
  const effCols = new Set(eff.map((r) => columnOfInput(r.slot, r.input)));
  for (const d of defs) {
    const c = columnOfInput(d.slot, d.input);
    if (!effCols.has(c) && !cleared.includes(c)) cleared.push(c);
  }
  return { bindings, cleared, customized };
}

export function buildRows(defaults: DefaultsData, profile: Profile | null): Row[] {
  const rows: Row[] = [];
  const seen = new Set<string>();
  let order = 0;

  // disambiguate maps sharing the same UI label (e.g. "On Foot - All")
  const labelCount = new Map<string, number>();
  defaults.maps.forEach((m) => labelCount.set(m.label, (labelCount.get(m.label) ?? 0) + 1));

  for (const m of defaults.maps) {
    const mapLabel = (labelCount.get(m.label) ?? 0) > 1 && m.name !== 'player' ? `${m.label} (${human(m.name)})` : m.label;
    for (const a of m.actions) {
      seen.add(`${m.name}/${a.name}`);
      const rebinds = profile?.rebinds[m.name]?.[a.name] ?? [];
      const bindings: Binding[] = [];
      const cleared: Device[] = [];
      let customized = false;
      for (const g of GROUPS_ORDER) {
        const res = mergeGroup(a, rebinds, g);
        bindings.push(...res.bindings);
        cleared.push(...res.cleared);
        customized ||= res.customized;
      }
      rows.push({
        id: `${m.name}/${a.name}`, map: m.name, mapLabel, group: groupOf(m.name), action: a.name, label: a.label,
        desc: a.desc, mode: a.mode, hidden: !!(a.hidden || m.hidden), unlisted: false, bindings, cleared, customized, order: order++, defaults: a.d,
      });
    }
  }

  // Rebinds for actions that are not in the shipped defaults (renamed/new actions)
  if (profile) {
    for (const [mapName, actions] of Object.entries(profile.rebinds)) {
      for (const [actionName, rbs] of Object.entries(actions)) {
        if (seen.has(`${mapName}/${actionName}`)) continue;
        rows.push({
          id: `${mapName}/${actionName}`, map: mapName, mapLabel: `${human(mapName)} (unlisted)`, group: 'unlisted', action: actionName,
          label: human(actionName.replace(/^v_/, '')), hidden: false, unlisted: true,
          bindings: rbs.filter((r) => r.input).map((r) => toBinding(r, undefined, true)),
          cleared: [], customized: true, order: order++, defaults: [],
        });
      }
    }
  }
  return rows;
}

export const human = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
