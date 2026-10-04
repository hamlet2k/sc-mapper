// Writes Star Citizen keybinding files, matching what the game itself writes:
//  - layout_<name>_exported.xml  (USER/Client/0/Controls/Mappings, loaded via Options > Keybindings > Control Profiles or pp_RebindKeys)
//  - actionmaps.xml              (USER/Client/0/Profiles/default, the live bindings file)
import { formatInput, groupOfSlot } from './inputs';
import { KEYBOARD_PRODUCT } from './capture';
import type { DefaultsData, Group, Profile, Rebind } from './types';

export type ExportFormat = 'layout' | 'actionmaps';
export interface ExportDevice { type: 'joystick' | 'gamepad'; instance: number; product?: string }
export interface ExportOptions { format: ExportFormat; name: string; devices?: ExportDevice[] }

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export const safeName = (s: string) => s.trim().replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'my-layout';
export const exportFileName = (o: ExportOptions) => (o.format === 'layout' ? `layout_${safeName(o.name)}_exported.xml` : 'actionmaps.xml');

const GROUP_ORDER: Group[] = ['km', 'js', 'gp'];
const byCodepoint = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function rebindLine(r: Rebind): string {
  let s = '<rebind ';
  if (r.defaultInput !== undefined) s += `defaultInput="${esc(r.defaultInput)}" `;
  s += `input="${esc(formatInput(r.slot, r.instance, r.input))}"`;
  if (r.mode) s += ` activationMode="${esc(r.mode)}"`;
  if ((r.multiTap ?? 1) > 1) s += ` multiTap="${r.multiTap}"`;
  return s + '/>';
}

/** Which joystick / gamepad instances the rebinds reference */
export function usedInstances(p: Profile) {
  const js = new Set<number>();
  let gp = false;
  for (const acts of Object.values(p.rebinds)) for (const list of Object.values(acts)) for (const r of list) {
    if (r.slot === 'js' && r.input) js.add(r.instance);
    if (r.slot === 'gp') gp = true;
  }
  return { js: [...js].sort((a, b) => a - b), gp };
}

export function buildExport(defaults: DefaultsData, profile: Profile, o: ExportOptions): string {
  const layout = o.format === 'layout';
  const name = layout ? safeName(o.name) : 'default';
  const base = layout ? ' ' : '  ';
  const L: string[] = [];
  const ind = (n: number) => base + ' '.repeat(n);

  // ---- action maps, in the game's own order; actions sorted by name like the game's exporter
  const mapOrder = defaults.maps.map((m) => m.name);
  const known = new Set(mapOrder);
  const maps = [...mapOrder.filter((m) => profile.rebinds[m]), ...Object.keys(profile.rebinds).filter((m) => !known.has(m)).sort(byCodepoint)];
  const catOf = new Map(defaults.maps.map((m) => [m.name, m.cat ?? '']));

  const body: string[] = [];
  for (const m of maps) {
    const acts = Object.keys(profile.rebinds[m]).filter((a) => profile.rebinds[m][a].length).sort(byCodepoint);
    if (!acts.length) continue;
    body.push(`${ind(0)}<actionmap name="${esc(m)}">`);
    for (const a of acts) {
      body.push(`${ind(1)}<action name="${esc(a)}">`);
      const list = [...profile.rebinds[m][a]].sort((x, y) => GROUP_ORDER.indexOf(groupOfSlot(x.slot)) - GROUP_ORDER.indexOf(groupOfSlot(y.slot)));
      for (const r of list) body.push(`${ind(2)}${rebindLine(r)}`);
      body.push(`${ind(1)}</action>`);
    }
    body.push(`${ind(0)}</actionmap>`);
  }

  // ---- devices referenced
  const used = usedInstances(profile);
  const extra = o.devices ?? [];
  const jsInst = [...new Set([...used.js, ...extra.filter((d) => d.type === 'joystick').map((d) => d.instance)])].sort((a, b) => a - b);
  const hasGp = used.gp || extra.some((d) => d.type === 'gamepad') || profile.devices.some((d) => d.slot === 'gp');

  if (layout) {
    L.push(`<ActionMaps version="1" optionsVersion="2" rebindVersion="2" profileName="${esc(name)}">`);
    L.push(` <CustomisationUIHeader label="${esc(name)}" description="" image="">`);
    L.push('  <devices>');
    L.push('   <keyboard instance="1"/>');
    L.push('   <mouse instance="1"/>');
    if (hasGp) L.push('   <gamepad instance="1"/>');
    for (const i of jsInst) L.push(`   <joystick instance="${i}"/>`);
    L.push('  </devices>');
    const cats: string[] = [];
    for (const m of maps) { const c = catOf.get(m) ?? ''; if (!cats.includes(c)) cats.push(c); }
    if (cats.length) {
      L.push('  <categories>');
      for (const c of cats) L.push(`   <category label="${esc(c)}"/>`);
      L.push('  </categories>');
    }
    L.push(' </CustomisationUIHeader>');
  } else {
    L.push('<ActionMaps>');
    L.push(` <ActionProfiles version="1" optionsVersion="2" rebindVersion="2" profileName="default">`);
  }

  // ---- device options: keep the imported blocks verbatim (curves, inverts, deadzones), add any missing devices
  const opts = profile.optionsXml ?? [];
  const has = (type: string, inst: number) => opts.some((x) => new RegExp(`^<options[^>]*type="${type}"[^>]*instance="${inst}"`).test(x) || new RegExp(`^<options[^>]*instance="${inst}"[^>]*type="${type}"`).test(x));
  for (const x of opts.filter((x) => x.startsWith('<deviceoptions'))) L.push(...indentBlock(x, base));
  if (!has('keyboard', 1)) L.push(`${base}<options type="keyboard" instance="1" Product="${esc(KEYBOARD_PRODUCT)}"/>`);
  for (const x of opts.filter((x) => x.startsWith('<options'))) L.push(...indentBlock(x, base));
  if (hasGp && !has('gamepad', 1)) {
    const p = extra.find((d) => d.type === 'gamepad')?.product;
    L.push(`${base}<options type="gamepad" instance="1"${p ? ` Product="${esc(p)}"` : ''}/>`);
  }
  for (const i of jsInst) {
    if (has('joystick', i)) continue;
    const p = extra.find((d) => d.type === 'joystick' && d.instance === i)?.product;
    L.push(`${base}<options type="joystick" instance="${i}"${p ? ` Product="${esc(p)}"` : ''}/>`);
  }
  L.push(`${base}<modifiers />`);
  L.push(...body);
  if (!layout) L.push(' </ActionProfiles>');
  L.push('</ActionMaps>');
  return L.join('\n') + '\n';
}

/** Re-indent a serialized element so its first line sits at `base` and inner lines keep their relative indent */
function indentBlock(xml: string, base: string): string[] {
  const lines = xml.split(/\r?\n/).filter((l, i) => i === 0 || l.trim());
  if (lines.length === 1) return [base + lines[0].trim()];
  const last = lines[lines.length - 1];
  const orig = /^\s*/.exec(last)![0].length; // indent of the closing tag = original indent of the element
  return lines.map((l, i) => (i === 0 ? base + l.trim() : base + l.slice(Math.min(orig, /^\s*/.exec(l)![0].length))));
}
