// Per-device settings in Star Citizen keybinding files (actionmaps.xml and layout_*_exported.xml), as the game writes them:
//
//   <deviceoptions name=" VKBsim Gladiator EVO R    {0200231D-0000-0000-0000-504944564944}">   <- keyed by the device's Product name
//    <option input="x" deadzone="0.049499996"/>                                                 <- per physical axis
//    <option input="x" saturation="0.8405"/>                                                    <- the game writes saturation twice
//    <option input="x" saturation="0.8405"/>
//   </deviceoptions>
//   <options type="joystick" instance="1" Product=" VKBsim Gladiator EVO R    {0200231D-...}">   <- keyed by type + instance
//    <flight_move_pitch invert="1" exponent="1.3000001"/>                                       <- per option group (defaultProfile <optiontree>)
//    <flight_move_strafe_vertical>
//     <nonlinearity_curve>
//      <point in="0" out="0"/> ... <point in="1" out="1"/>
//     </nonlinearity_curve>
//    </flight_move_strafe_vertical>
//   </options>
//
// The model keeps every element and attribute in file order (values as the original strings), so untouched settings are written
// back exactly as imported; only what the user edits changes.
export type Attr = [string, string];
export interface CurvePoint { in: string; out: string }
export interface OptCurve { attrs: Attr[]; points: CurvePoint[] }
export interface OptGroup { name: string; attrs: Attr[]; curve?: OptCurve; extra: string[] }
export interface OptionsBlock { tag: 'options'; attrs: Attr[]; groups: OptGroup[] }
export interface AxisBlock { tag: 'deviceoptions'; attrs: Attr[]; entries: Attr[][] }
export type SettingsBlock = OptionsBlock | AxisBlock;
export interface DeviceSettings { blocks: SettingsBlock[] }

/** The joystick option tree in defaultProfile.xml declares instances="8": the game keeps settings for js1..js8 */
export const JOYSTICK_SETTING_INSTANCES = 8;
/** axis names used in <deviceoptions> (as seen in game-written files) */
export const JS_AXIS_INPUTS = ['x', 'y', 'z', 'rotx', 'roty', 'rotz', 'slider1', 'slider2'];

const get = (a: Attr[], k: string) => a.find((x) => x[0] === k)?.[1];
const setAttr = (a: Attr[], k: string, v: string | null): Attr[] => {
  if (v === null) return a.filter((x) => x[0] !== k);
  return a.some((x) => x[0] === k) ? a.map((x) => (x[0] === k ? [k, v] : x)) : [...a, [k, v]];
};
const attrsOf = (el: Element): Attr[] => Array.from(el.attributes).map((x) => [x.name, x.value]);
const kids = (el: Element) => Array.from(el.childNodes).filter((n): n is Element => n.nodeType === 1);

/** Parse <deviceoptions>/<options> elements (children of <ActionProfiles> or the layout root) */
export function parseSettings(elements: Element[]): DeviceSettings {
  const ser = new XMLSerializer();
  const blocks: SettingsBlock[] = [];
  for (const el of elements) {
    if (el.tagName === 'deviceoptions') {
      blocks.push({ tag: 'deviceoptions', attrs: attrsOf(el), entries: kids(el).filter((c) => c.tagName === 'option').map(attrsOf) });
    } else if (el.tagName === 'options') {
      blocks.push({
        tag: 'options', attrs: attrsOf(el),
        groups: kids(el).map((g) => {
          const c = kids(g).find((x) => x.tagName === 'nonlinearity_curve');
          return {
            name: g.tagName, attrs: attrsOf(g),
            ...(c ? { curve: { attrs: attrsOf(c), points: kids(c).filter((p) => p.tagName === 'point').map((p) => ({ in: p.getAttribute('in') ?? '0', out: p.getAttribute('out') ?? '0' })) } } : {}),
            extra: kids(g).filter((x) => x !== c).map((x) => ser.serializeToString(x).replace(/ xmlns="[^"]*"/, '')),
          };
        }),
      });
    }
  }
  return { blocks };
}

/** Parse legacy optionsXml strings (stored by earlier versions) */
export function parseSettingsXml(xml: string[]): DeviceSettings {
  if (!xml.length) return { blocks: [] };
  const doc = new DOMParser().parseFromString(`<r>${xml.join('')}</r>`, 'application/xml');
  if (doc.getElementsByTagName('parsererror')[0]) return { blocks: [] };
  return parseSettings(kids(doc.documentElement));
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const open = (name: string, a: Attr[]) => `<${name}${a.map(([k, v]) => ` ${k}="${esc(v)}"`).join('')}`;
/** self-closing like the game: `<x a="1"/>`, but `<x />` without attributes */
const empty = (name: string, a: Attr[]) => `${open(name, a)}${a.length ? '/>' : ' />'}`;

/** One block as lines, indented from `base` by one space per level (the game's layout/actionmaps style) */
export function serializeBlock(b: SettingsBlock, base: string): string[] {
  const L: string[] = [];
  const ind = (n: number) => base + ' '.repeat(n);
  if (b.tag === 'deviceoptions') {
    if (!b.entries.length) return [ind(0) + empty('deviceoptions', b.attrs)];
    L.push(ind(0) + open('deviceoptions', b.attrs) + '>');
    for (const e of b.entries) L.push(ind(1) + empty('option', e));
    L.push(ind(0) + '</deviceoptions>');
    return L;
  }
  if (!b.groups.length) return [ind(0) + empty('options', b.attrs)];
  L.push(ind(0) + open('options', b.attrs) + '>');
  for (const g of b.groups) {
    if (!g.curve && !g.extra.length) { L.push(ind(1) + empty(g.name, g.attrs)); continue; }
    L.push(ind(1) + open(g.name, g.attrs) + '>');
    if (g.curve) {
      if (!g.curve.points.length) L.push(ind(2) + empty('nonlinearity_curve', g.curve.attrs));
      else {
        L.push(ind(2) + open('nonlinearity_curve', g.curve.attrs) + '>');
        for (const p of g.curve.points) L.push(ind(3) + empty('point', [['in', p.in], ['out', p.out]]));
        L.push(ind(2) + '</nonlinearity_curve>');
      }
    }
    for (const x of g.extra) L.push(ind(2) + x);
    L.push(ind(1) + `</${g.name}>`);
  }
  L.push(ind(0) + '</options>');
  return L;
}

/* ------------------------------------------------------------------ reading */
export const blockType = (b: OptionsBlock) => (get(b.attrs, 'type') ?? '').toLowerCase();
export const blockInstance = (b: OptionsBlock) => Number(get(b.attrs, 'instance')) || 1;
export const blockProduct = (b: OptionsBlock) => get(b.attrs, 'Product');
export const axisBlockName = (b: AxisBlock) => get(b.attrs, 'name') ?? '';
const sameProduct = (a: string, b: string) => a.replace(/\s+/g, ' ').trim().toLowerCase() === b.replace(/\s+/g, ' ').trim().toLowerCase();

export function optionsBlock(s: DeviceSettings, type: string, instance: number): OptionsBlock | undefined {
  return s.blocks.find((b): b is OptionsBlock => b.tag === 'options' && blockType(b) === type && blockInstance(b) === instance);
}
export function axisBlock(s: DeviceSettings, product: string): AxisBlock | undefined {
  return s.blocks.find((b): b is AxisBlock => b.tag === 'deviceoptions' && sameProduct(axisBlockName(b), product));
}

export interface GroupValues { invert?: boolean; exponent?: number; curve?: { x: number; y: number }[]; emptyCurve?: boolean; other: Attr[] }
export function groupValues(s: DeviceSettings, type: string, instance: number, name: string): GroupValues | undefined {
  const g = optionsBlock(s, type, instance)?.groups.find((x) => x.name === name);
  if (!g) return undefined;
  const inv = get(g.attrs, 'invert');
  const exp = get(g.attrs, 'exponent');
  return {
    ...(inv !== undefined ? { invert: inv === '1' } : {}),
    ...(exp !== undefined && Number.isFinite(Number(exp)) ? { exponent: Number(exp) } : {}),
    ...(g.curve?.points.length ? { curve: g.curve.points.map((p) => ({ x: Number(p.in), y: Number(p.out) })) } : {}),
    ...(g.curve && !g.curve.points.length ? { emptyCurve: true } : {}),
    other: g.attrs.filter(([k]) => k !== 'invert' && k !== 'exponent'),
  };
}
export interface AxisValues { deadzone?: number; saturation?: number }
export function axisValues(s: DeviceSettings, product: string): Record<string, AxisValues> {
  const out: Record<string, AxisValues> = {};
  for (const e of axisBlock(s, product)?.entries ?? []) {
    const input = get(e, 'input');
    if (!input) continue;
    for (const k of ['deadzone', 'saturation'] as const) {
      const v = get(e, k);
      if (v !== undefined && Number.isFinite(Number(v))) (out[input] ??= {})[k] = Number(v);
    }
  }
  return out;
}

/* ------------------------------------------------------------------ editing (immutable) */
/** Format an edited number compactly (the game writes float32 noise like 0.049499996; we write what the user set) */
export const fmtNum = (n: number) => String(Math.round(n * 1e6) / 1e6);

function withOptionsBlock(s: DeviceSettings, type: string, instance: number, product: string | undefined, fn: (b: OptionsBlock) => OptionsBlock): DeviceSettings {
  const cur = optionsBlock(s, type, instance);
  if (cur) return { blocks: s.blocks.map((b) => (b === cur ? fn(cur) : b)) };
  const fresh: OptionsBlock = { tag: 'options', attrs: [['type', type], ['instance', String(instance)], ...(product ? [['Product', product] as Attr] : [])], groups: [] };
  const created = fn(fresh);
  if (!created.groups.length) return s;
  // keep the game's order: options sorted keyboard, gamepad, joystick by instance, after every <deviceoptions>
  const rank = (b: SettingsBlock) => (b.tag === 'deviceoptions' ? -1 : ({ keyboard: 0, mouse: 1, gamepad: 2, joystick: 3 }[blockType(b)] ?? 4) * 100 + blockInstance(b));
  const blocks = [...s.blocks];
  let at = blocks.findIndex((b) => rank(b) > rank(created));
  if (at < 0) at = blocks.length;
  blocks.splice(at, 0, created);
  return { blocks };
}

export interface GroupPatch {
  /** true/false writes invert="1"/"0"; null removes it (game default) */
  invert?: boolean | null;
  /** a number writes exponent= and drops custom curve points; null removes it */
  exponent?: number | null;
  /** points write a custom <nonlinearity_curve> and drop exponent; null removes the curve */
  curve?: { x: number; y: number }[] | null;
}
export function setGroup(s: DeviceSettings, type: string, instance: number, name: string, patch: GroupPatch, product?: string): DeviceSettings {
  return withOptionsBlock(s, type, instance, product, (b) => {
    const old = b.groups.find((g) => g.name === name);
    let g: OptGroup = old ? { ...old } : { name, attrs: [], extra: [] };
    if (patch.invert !== undefined) g.attrs = setAttr(g.attrs, 'invert', patch.invert === null ? null : patch.invert ? '1' : '0');
    if (patch.exponent !== undefined) {
      g.attrs = setAttr(g.attrs, 'exponent', patch.exponent === null ? null : fmtNum(patch.exponent));
      if (patch.exponent !== null && g.curve?.points.length) g = { ...g, curve: undefined };
    }
    if (patch.curve !== undefined) {
      if (patch.curve === null) g = { ...g, curve: undefined };
      else {
        g.attrs = setAttr(g.attrs, 'exponent', null);
        const pts = [...patch.curve].sort((a, c) => a.x - c.x).map((p) => ({ in: fmtNum(clamp01(p.x)), out: fmtNum(clamp01(p.y)) }));
        g = { ...g, curve: { attrs: g.curve?.attrs ?? [], points: pts } };
      }
    }
    const keep = g.attrs.length || g.curve || g.extra.length;
    const groups = old ? (keep ? b.groups.map((x) => (x === old ? g : x)) : b.groups.filter((x) => x !== old)) : keep ? [...b.groups, g] : b.groups;
    return { ...b, groups };
  });
}
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Set (or clear with null) the deadzone / saturation of one axis of a device model (shared by every device with that Product name) */
export function setAxis(s: DeviceSettings, product: string, input: string, key: 'deadzone' | 'saturation', value: number | null): DeviceSettings {
  const cur = axisBlock(s, product);
  const b: AxisBlock = cur ?? { tag: 'deviceoptions', attrs: [['name', product]], entries: [] };
  const match = (e: Attr[]) => get(e, 'input') === input && get(e, key) !== undefined;
  let entries: Attr[][];
  if (value === null) entries = b.entries.filter((e) => !match(e));
  else if (b.entries.some(match)) entries = b.entries.map((e) => (match(e) ? setAttr(e, key, fmtNum(value)) : e));
  else {
    const line: Attr[] = [['input', input], [key, fmtNum(value)]];
    entries = [...b.entries, ...(key === 'saturation' ? [line, line] : [line])]; // the game writes each saturation line twice
  }
  const next: AxisBlock = { ...b, entries };
  if (!cur) {
    if (!entries.length) return s;
    const firstOpt = s.blocks.findIndex((x) => x.tag === 'options');
    const blocks = [...s.blocks];
    blocks.splice(firstOpt < 0 ? blocks.length : firstOpt, 0, next);
    return { blocks };
  }
  return { blocks: entries.length ? s.blocks.map((x) => (x === cur ? next : x)) : s.blocks.filter((x) => x !== cur) };
}

/** Remove every setting of one option group, or of a whole device instance */
export function resetGroup(s: DeviceSettings, type: string, instance: number, name: string): DeviceSettings {
  return withOptionsBlock(s, type, instance, undefined, (b) => ({ ...b, groups: b.groups.filter((g) => g.name !== name) }));
}

/* ------------------------------------------------------------------ response preview */
/** Piecewise-linear curve through the points, with (0,0) and (1,1) implied when missing */
export function curveAt(points: { x: number; y: number }[], t: number): number {
  const pts = [...points].sort((a, b) => a.x - b.x);
  if (!pts.length || pts[0].x > 0) pts.unshift({ x: 0, y: 0 });
  if (pts[pts.length - 1].x < 1) pts.push({ x: 1, y: 1 });
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    if (t <= b.x) return b.x === a.x ? b.y : a.y + ((t - a.x) / (b.x - a.x)) * (b.y - a.y);
  }
  return pts[pts.length - 1].y;
}
/**
 * Approximate output for a stick position x in [-1, 1]: deadzone and saturation rescale the travel, then the exponent
 * (|x|^exponent) or the custom curve shapes it, then invert flips the sign. This is how the settings are commonly understood;
 * the game's exact maths is not published.
 */
export function response(x: number, o: { exponent?: number; curve?: { x: number; y: number }[]; invert?: boolean; deadzone?: number; saturation?: number }): number {
  const dz = o.deadzone ?? 0;
  const sat = o.saturation && o.saturation > dz ? o.saturation : 1;
  const t = clamp01((Math.abs(x) - dz) / (sat - dz));
  const y = o.curve?.length ? curveAt(o.curve, t) : Math.pow(t, o.exponent ?? 1);
  return (x < 0 ? -y : y) * (o.invert ? -1 : 1);
}

/** Every device instance that has settings in the file */
export function listOptionBlocks(s: DeviceSettings) {
  return s.blocks.filter((b): b is OptionsBlock => b.tag === 'options').map((b) => ({ type: blockType(b), instance: blockInstance(b), product: blockProduct(b), groups: b.groups.length }));
}
export const emptySettings = (): DeviceSettings => ({ blocks: [] });
/** renumber option blocks of one device type by a permutation (old instance -> new); per-model axis blocks are untouched */
export function permuteOptionInstances(s: DeviceSettings, type: string, perm: ReadonlyMap<number, number>): DeviceSettings {
  if (![...perm].some(([a, b]) => a !== b)) return s;
  return {
    ...s,
    blocks: s.blocks.map((blk) => {
      if (blk.tag !== 'options' || blockType(blk) !== type) return blk;
      const n = blockInstance(blk);
      const to = perm.get(n);
      if (to === undefined || to === n) return blk;
      const v = String(to);
      return { ...blk, attrs: blk.attrs.some(([k]) => k === 'instance') ? blk.attrs.map(([k, x]) => (k === 'instance' ? [k, v] : [k, x]) as Attr) : [...blk.attrs, ['instance', v] as Attr] };
    }),
  };
}
/** swap two device numbers' option blocks (invert / exponent / curves per <options type=… instance=…>) */
export function swapOptionInstances(s: DeviceSettings, type: string, a: number, b: number): DeviceSettings {
  return a === b ? s : permuteOptionInstances(s, type, new Map([[a, b], [b, a]]));
}
/** set the Product attribute of an existing <options type=… instance=…> block (the game's name for the device at that number) */
export function setOptionsProduct(s: DeviceSettings, type: string, instance: number, product: string): DeviceSettings {
  return {
    ...s,
    blocks: s.blocks.map((blk) => {
      if (blk.tag !== 'options' || blockType(blk) !== type || blockInstance(blk) !== instance || blockProduct(blk) === product) return blk;
      return { ...blk, attrs: blk.attrs.some(([k]) => k === 'Product') ? blk.attrs.map(([k, x]) => (k === 'Product' ? [k, product] : [k, x]) as Attr) : [...blk.attrs, ['Product', product] as Attr] };
    }),
  };
}

const legacy = new WeakMap<object, DeviceSettings>();
/** A profile's device settings (converting the legacy optionsXml of profiles saved by earlier versions) */
export function settingsOf(p: { settings?: DeviceSettings; optionsXml?: string[] } | null | undefined): DeviceSettings {
  if (!p) return emptySettings();
  if (p.settings) return p.settings;
  let s = legacy.get(p);
  if (!s) { s = parseSettingsXml(p.optionsXml ?? []); legacy.set(p, s); }
  return s;
}
