import { devicesOf, normalizeCombo, physOf } from './inputs';
import { groupOf } from './groups';
import type { Binding, DefaultsData, Profile, Row, Slot } from './types';

const SLOTS: Slot[] = ['kb', 'mo', 'js', 'gp'];
const key = (slot: Slot, instance: number, input: string) =>
  `${slot}${slot === 'js' ? instance : 1}:${normalizeCombo(input)}`;

export function buildRows(defaults: DefaultsData, profile: Profile | null): Row[] {
  const rows: Row[] = [];
  const seen = new Set<string>();
  let order = 0;

  // disambiguate maps sharing the same UI label (e.g. "On Foot - All")
  const labelCount = new Map<string, number>();
  defaults.maps.forEach((m) => labelCount.set(m.label, (labelCount.get(m.label) ?? 0) + 1));
  const human = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

  for (const m of defaults.maps) {
    const mapLabel = (labelCount.get(m.label) ?? 0) > 1 && m.name !== 'player' ? `${m.label} (${human(m.name)})` : m.label;
    for (const a of m.actions) {
      seen.add(`${m.name}/${a.name}`);
      const rebinds = profile?.rebinds[m.name]?.[a.name] ?? [];
      const bindings: Binding[] = [];
      const cleared: Slot[] = [];
      let customized = false;
      for (const slot of SLOTS) {
        const defs = a.d.filter((d) => d.slot === slot);
        const rbs = rebinds.filter((r) => r.slot === slot);
        const defKeys = new Set(defs.map((d) => key(slot, 1, d.input)));
        if (!rbs.length) {
          for (const d of defs) {
            bindings.push({ slot, instance: 1, input: d.input, mode: d.mode ?? a.mode, custom: false, devices: devicesOf(slot, d.input), phys: physOf(slot, 1, d.input) });
          }
          continue;
        }
        const eff = rbs.filter((r) => r.input);
        const effKeys = new Set(eff.map((r) => key(slot, r.instance, r.input)));
        const changed = effKeys.size !== defKeys.size || [...effKeys].some((k) => !defKeys.has(k)) || eff.some((r) => r.mode || r.multiTap);
        if (changed) customized = true;
        if (!eff.length && defs.length) cleared.push(slot);
        for (const r of eff) {
          const isCustom = !defKeys.has(key(slot, r.instance, r.input)) || !!r.mode || !!r.multiTap;
          bindings.push({ slot, instance: r.instance, input: r.input, mode: r.mode ?? a.mode, multiTap: r.multiTap, custom: isCustom, devices: devicesOf(slot, r.input), phys: physOf(slot, r.instance, r.input) });
        }
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
        const eff = rbs.filter((r) => r.input);
        rows.push({
          id: `${mapName}/${actionName}`, map: mapName, mapLabel: `${human(mapName)} (unlisted)`, group: 'unlisted', action: actionName,
          label: human(actionName.replace(/^v_/, '')), hidden: false, unlisted: true,
          bindings: eff.map((r) => ({ slot: r.slot, instance: r.instance, input: r.input, mode: r.mode, multiTap: r.multiTap, custom: true, devices: devicesOf(r.slot, r.input), phys: physOf(r.slot, r.instance, r.input) })),
          cleared: [], customized: true, order: order++, defaults: [],
        });
      }
    }
  }
  return rows;
}
