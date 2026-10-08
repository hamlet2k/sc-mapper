// Shared controller files (.sckeymap.json): one joystick / gamepad, player to player. A file bundles the device's template (a
// built-in by id, or a custom template in full with its embedded pictures), every binding on that device's game slot (stored
// without the jsN_ prefix, so it lands on whatever number the importer has that device on), the slot's axis settings, and
// metadata (device, USB id, game build, title / note). Pure functions only; the dialogs are in components/ShareDialogs.tsx.
import { blockInstance, blockType, optionsBlock, axisValues, setAxis, type Attr, type DeviceSettings, type OptGroup, type OptionsBlock } from './devopts';
import { effectiveGroup, setGroup, type DefaultsIndex } from './edit';
import { groupOfSlot, normalizeCombo } from './inputs';
import { cleanTemplate, templateForFile, type DeviceTemplate } from './templates';
import type { DefaultsData, Rebind, RebindMap } from './types';

export const SHARE_FORMAT = 'sc-keymap-shared-controller';
export const SHARE_VERSION = 1;
export const SHARE_EXT = '.sckeymap.json';
/** largest file accepted (a custom template with 12 embedded photos stays well under it) */
export const SHARE_MAX_BYTES = 60_000_000;
const MAX_BINDINGS = 5000;

export type PadSlot = 'js' | 'gp';
export interface SlotRef { slot: PadSlot; instance: number }
/** one binding, slot-agnostic: `input` is the device input without its jsN_ prefix ("button6", "x", "hat1_up", "lalt+button3") */
export interface SharedBinding {
  map: string; action: string; input: string; mode?: string; multiTap?: number;
  /** the sharer's labels, for showing actions the importer's game version doesn't have */
  label?: string; category?: string;
  /** a game default the sharer kept (informational: it is applied like any other binding) */
  default?: boolean;
}
export interface SharedAxisGroup { name: string; attrs: Attr[]; curve?: { attrs: Attr[]; points: [string, string][] } }
export interface SharedAxisValue { input: string; deadzone?: number; saturation?: number }
/** the slot's "Axis settings & curves": option groups (<options type instance>) and per-axis deadzone / saturation (<deviceoptions>) */
export interface SharedAxis { groups: SharedAxisGroup[]; axes: SharedAxisValue[] }
export interface SharedDevice {
  kind: PadSlot; name?: string;
  /** USB vendor / product id (4 hex digits) */
  vendor?: string; product?: string; buttons?: number;
  /** the Product string the game writes for it (" Joystick - HOTAS Warthog  {0402044F-…}") */
  gameProduct?: string;
  /** where it sat on the sharer's side (informational) */
  sourceSlot?: string;
}
export type SharedTemplate = { kind: 'builtin'; id: string; name: string } | { kind: 'custom'; name: string; template: DeviceTemplate };
export interface SharedController {
  format: typeof SHARE_FORMAT;
  version: number;
  title?: string; note?: string;
  exportedAt: string;
  app: { name: string; url?: string };
  /** the game build the bindings were made against (bundled defaults of the sharer's app) */
  game: { branch?: string; version?: string; channel?: string };
  device: SharedDevice;
  template: SharedTemplate;
  bindings: SharedBinding[];
  axis?: SharedAxis;
}

/* ------------------------------------------------------------------ export */
const onSlot = (r: Pick<Rebind, 'slot' | 'instance' | 'input'>, t: SlotRef) => !!r.input && r.slot === t.slot && r.instance === t.instance;
const actionKeys = (rebinds: RebindMap, idx: DefaultsIndex) => {
  const keys = new Set(idx.keys());
  for (const [m, acts] of Object.entries(rebinds)) for (const a of Object.keys(acts)) keys.add(`${m}/${a}`);
  return [...keys];
};
const splitKey = (k: string) => { const i = k.indexOf('/'); return { map: k.slice(0, i), action: k.slice(i + 1) }; };

/**
 * Every binding on one game slot as the profile has it: the profile's own plus the game defaults it keeps there (what the
 * Devices page shows), in every action map and game mode, modifier combos included. Labels from the bundled defaults.
 */
export function slotBindings(rebinds: RebindMap, idx: DefaultsIndex, defaults: Pick<DefaultsData, 'maps'>, t: SlotRef): SharedBinding[] {
  const g = groupOfSlot(t.slot);
  const mapInfo = new Map(defaults.maps.map((m, i) => [m.name, { label: m.label, order: i }]));
  const out: (SharedBinding & { o: number })[] = [];
  for (const k of actionKeys(rebinds, idx)) {
    const { map, action } = splitKey(k);
    const own = (rebinds[map]?.[action] ?? []).some((r) => groupOfSlot(r.slot) === g);
    const a = idx.get(k);
    for (const r of effectiveGroup(a, rebinds[map]?.[action], g)) {
      if (!onSlot(r, t)) continue;
      out.push({
        map, action, input: r.input, ...(r.mode ? { mode: r.mode } : {}), ...((r.multiTap ?? 1) > 1 ? { multiTap: r.multiTap } : {}),
        ...(a?.label ? { label: a.label } : {}), ...(mapInfo.get(map) ? { category: mapInfo.get(map)!.label } : {}), ...(own ? {} : { default: true }),
        o: mapInfo.get(map)?.order ?? 9999,
      });
    }
  }
  return out.sort((x, y) => x.o - y.o || x.action.localeCompare(y.action) || x.input.localeCompare(y.input, undefined, { numeric: true })).map(({ o: _o, ...b }) => b);
}

const TYPE: Record<PadSlot, string> = { js: 'joystick', gp: 'gamepad' };
const sameProduct = (a: string, b: string) => a.replace(/\s+/g, ' ').trim().toLowerCase() === b.replace(/\s+/g, ' ').trim().toLowerCase();
/** the slot's axis settings: its option groups (invert / exponent / curve) and, for joysticks, the axes' deadzone / saturation */
export function slotAxisSettings(s: DeviceSettings, t: SlotRef, product?: string): SharedAxis | undefined {
  const b = optionsBlock(s, TYPE[t.slot], t.instance);
  const groups: SharedAxisGroup[] = (b?.groups ?? []).map((g) => ({
    name: g.name, attrs: g.attrs.map(([k, v]) => [k, v] as Attr),
    ...(g.curve ? { curve: { attrs: g.curve.attrs.map(([k, v]) => [k, v] as Attr), points: g.curve.points.map((p) => [p.in, p.out] as [string, string]) } } : {}),
  }));
  const axes = t.slot === 'js' && product ? Object.entries(axisValues(s, product)).map(([input, v]) => ({ input, ...v })) : [];
  return groups.length || axes.length ? { groups, axes } : undefined;
}

export interface PackInput {
  title?: string; note?: string; now?: Date;
  game: SharedController['game']; app?: SharedController['app'];
  device: SharedDevice; template: DeviceTemplate; bindings: SharedBinding[]; axis?: SharedAxis;
}
/** the file's content (a built-in template is referenced by id; a user template goes in whole, pictures included) */
export function packController(p: PackInput): SharedController {
  const title = p.title?.trim().slice(0, 120), note = p.note?.trim().slice(0, 2000);
  return {
    format: SHARE_FORMAT, version: SHARE_VERSION,
    ...(title ? { title } : {}), ...(note ? { note } : {}),
    exportedAt: (p.now ?? new Date()).toISOString(),
    app: p.app ?? { name: 'SC Keymap', url: 'https://sc-mapper.vercel.app' },
    game: p.game,
    device: p.device,
    template: p.template.builtin ? { kind: 'builtin', id: p.template.id, name: p.template.name } : { kind: 'custom', name: p.template.name, template: templateForFile(p.template) },
    bindings: p.bindings,
    ...(p.axis ? { axis: p.axis } : {}),
  };
}
export const serializeShared = (c: SharedController) => JSON.stringify(c, null, 1) + '\n';
export const shareFileName = (c: Pick<SharedController, 'title' | 'device' | 'template'>) => {
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);
  const base = [slug(c.device.name ?? c.template.name), c.title ? slug(c.title) : ''].filter(Boolean).join('--') || 'controller';
  return `${base}${SHARE_EXT}`;
};
/** pictures a template carries: embedded (data: URLs, with their size) and references to the app's built-in photos */
export function templatePictures(t: DeviceTemplate): { embedded: number; bytes: number; builtinRefs: number } {
  const imgs = [...(t.views?.length ? t.views.map((v) => v.image) : [t.image])].filter((x): x is string => !!x);
  const emb = imgs.filter((x) => x.startsWith('data:'));
  return { embedded: emb.length, bytes: emb.reduce((n, x) => n + x.length, 0), builtinRefs: imgs.length - emb.length };
}

/* ------------------------------------------------------------------ import: parse + validate */
export class ShareFileError extends Error {}
const NAME_RE = /^[A-Za-z0-9_.-]{1,80}$/;
const TOKEN_RE = /^[a-z0-9_]{1,24}$/;
const MODE_RE = /^[a-z_]{1,40}$/;
const ATTR_RE = /^[A-Za-z_][A-Za-z0-9_.-]{0,40}$/;
const NUM_RE = /^-?\d{1,6}(\.\d{1,12})?([eE]-?\d{1,3})?$/;
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined);
const hex4 = (v: unknown) => (typeof v === 'string' && /^(0x)?[0-9a-f]{1,4}$/i.test(v) ? v.replace(/^0x/i, '').toUpperCase().padStart(4, '0') : undefined);
/** a device input without prefix: up to 4 '+'-joined tokens (modifier combos like lalt+button3, gamepad layers like shoulderl+a) */
export const validInput = (s: unknown): s is string => typeof s === 'string' && s.length <= 80 && s.split('+').length <= 4 && s.split('+').every((x) => TOKEN_RE.test(x));
const cleanAttrs = (v: unknown): Attr[] => (Array.isArray(v) ? v : []).filter((a): a is [string, string] => Array.isArray(a) && a.length === 2 && typeof a[0] === 'string' && ATTR_RE.test(a[0]) && typeof a[1] === 'string' && a[1].length <= 64).slice(0, 20).map(([k, x]) => [k, x]);

/** parse a shared controller file; throws ShareFileError with a message fit for the user */
export function parseShared(text: string): SharedController {
  if (text.length > SHARE_MAX_BYTES) throw new ShareFileError(`This file is too large (${(text.length / 1e6).toFixed(0)} MB) to be a shared controller.`);
  let o: unknown;
  try { o = JSON.parse(text.replace(/^\uFEFF/, '')); } catch { throw new ShareFileError('Not a shared controller file: it isn’t valid JSON (the file may be cut short or damaged).'); }
  if (!isObj(o)) throw new ShareFileError('Not a shared controller file.');
  if (o.format !== SHARE_FORMAT) {
    if (o.format === 'sc-mapper-device-templates' || o.format === 'sc-mapper-device-template' || Array.isArray(o.templates)) throw new ShareFileError('This is a template file, not a shared controller: import it with “Import templates”.');
    throw new ShareFileError('Not a shared controller file (no “sc-keymap-shared-controller” format tag).');
  }
  const v = Number(o.version);
  if (!Number.isInteger(v) || v < 1) throw new ShareFileError('This shared controller file is damaged: its format version is missing.');
  if (v > SHARE_VERSION) throw new ShareFileError(`This file was made by a newer version of SC Keymap (format v${v}; this page reads v${SHARE_VERSION}). Reload the page to get the latest version, then import it again.`);
  // device
  const d = isObj(o.device) ? o.device : {};
  const kind: PadSlot = d.kind === 'gp' ? 'gp' : d.kind === 'js' ? 'js' : (() => { throw new ShareFileError('This shared controller file is damaged: it doesn’t say whether the device is a joystick or a gamepad.'); })();
  const buttons = Number(d.buttons);
  const device: SharedDevice = {
    kind, ...(str(d.name, 120) ? { name: str(d.name, 120) } : {}),
    ...(hex4(d.vendor) && hex4(d.product) ? { vendor: hex4(d.vendor), product: hex4(d.product) } : {}),
    ...(Number.isInteger(buttons) && buttons > 0 && buttons < 1000 ? { buttons } : {}),
    ...(str(d.gameProduct, 200) ? { gameProduct: (d.gameProduct as string).slice(0, 200) } : {}),
    ...(typeof d.sourceSlot === 'string' && /^(js|gp)\d{1,2}$/.test(d.sourceSlot) ? { sourceSlot: d.sourceSlot } : {}),
  };
  // template
  const t = isObj(o.template) ? o.template : null;
  let template: SharedTemplate;
  if (t?.kind === 'builtin' && typeof t.id === 'string' && /^builtin-[a-z0-9-]{1,80}$/.test(t.id)) template = { kind: 'builtin', id: t.id, name: str(t.name, 80) ?? t.id };
  else if (t?.kind === 'custom' && isObj(t.template)) {
    let tpl: DeviceTemplate;
    try { tpl = cleanTemplate(t.template, 0); } catch (e) { throw new ShareFileError(`The template in this file is damaged: ${(e as Error).message}`); }
    if (tpl.slot !== kind) tpl = { ...tpl, slot: kind };
    template = { kind: 'custom', name: tpl.name, template: tpl };
  } else throw new ShareFileError('This shared controller file is damaged: its template is missing.');
  // bindings
  if (!Array.isArray(o.bindings)) throw new ShareFileError('This shared controller file is damaged: it has no bindings list.');
  if (o.bindings.length > MAX_BINDINGS) throw new ShareFileError(`This file has too many bindings (${o.bindings.length}).`);
  const seen = new Set<string>();
  const bindings: SharedBinding[] = [];
  let bad = 0;
  for (const x of o.bindings) {
    if (!isObj(x) || typeof x.map !== 'string' || !NAME_RE.test(x.map) || typeof x.action !== 'string' || !NAME_RE.test(x.action) || !validInput(x.input)) { bad++; continue; }
    const input = (x.input as string).toLowerCase();
    const mt = Number(x.multiTap);
    const b: SharedBinding = {
      map: x.map, action: x.action, input,
      ...(typeof x.mode === 'string' && MODE_RE.test(x.mode) ? { mode: x.mode } : {}),
      ...(Number.isInteger(mt) && mt > 1 && mt < 10 ? { multiTap: mt } : {}),
      ...(str(x.label, 120) ? { label: str(x.label, 120) } : {}), ...(str(x.category, 120) ? { category: str(x.category, 120) } : {}),
      ...(x.default === true ? { default: true } : {}),
    };
    const k = `${b.map}/${b.action}|${normalizeCombo(b.input)}|${b.mode ?? ''}|${b.multiTap ?? 1}`;
    if (seen.has(k)) continue;
    seen.add(k);
    bindings.push(b);
  }
  if (bad && !bindings.length) throw new ShareFileError('This shared controller file is damaged: none of its bindings could be read.');
  // axis settings
  let axis: SharedAxis | undefined;
  if (isObj(o.axis)) {
    const groups: SharedAxisGroup[] = (Array.isArray(o.axis.groups) ? o.axis.groups : []).filter(isObj)
      .filter((g) => typeof g.name === 'string' && /^[A-Za-z_][A-Za-z0-9_]{0,60}$/.test(g.name)).slice(0, 200).map((g) => {
        const c = isObj(g.curve) ? g.curve : null;
        const points = c && Array.isArray(c.points) ? c.points.filter((p): p is [string, string] => Array.isArray(p) && p.length === 2 && p.every((n) => typeof n === 'string' && NUM_RE.test(n))).slice(0, 64) : [];
        return { name: g.name as string, attrs: cleanAttrs(g.attrs), ...(c ? { curve: { attrs: cleanAttrs(c.attrs), points } } : {}) };
      });
    const axes: SharedAxisValue[] = kind === 'js' ? (Array.isArray(o.axis.axes) ? o.axis.axes : []).filter(isObj).filter((a) => validInput(a.input) && !String(a.input).includes('+')).slice(0, 16).map((a) => {
      const dz = Number(a.deadzone), sat = Number(a.saturation);
      return { input: a.input as string, ...(a.deadzone != null && Number.isFinite(dz) && dz >= 0 && dz <= 1 ? { deadzone: dz } : {}), ...(a.saturation != null && Number.isFinite(sat) && sat >= 0 && sat <= 1 ? { saturation: sat } : {}) };
    }).filter((a) => a.deadzone !== undefined || a.saturation !== undefined) : [];
    if (groups.length || axes.length) axis = { groups, axes };
  }
  const g = isObj(o.game) ? o.game : {};
  const app = isObj(o.app) ? o.app : {};
  return {
    format: SHARE_FORMAT, version: v,
    ...(str(o.title, 120) ? { title: str(o.title, 120) } : {}), ...(str(o.note, 2000) ? { note: str(o.note, 2000) } : {}),
    exportedAt: typeof o.exportedAt === 'string' && !Number.isNaN(Date.parse(o.exportedAt)) ? o.exportedAt : '',
    app: { name: str(app.name, 60) ?? 'unknown app', ...(str(app.url, 200) ? { url: str(app.url, 200) } : {}) },
    game: { ...(str(g.branch, 60) ? { branch: str(g.branch, 60) } : {}), ...(str(g.version, 60) ? { version: str(g.version, 60) } : {}), ...(str(g.channel, 30) ? { channel: str(g.channel, 30) } : {}) },
    device, template, bindings, ...(axis ? { axis } : {}),
  };
}
/** a quick look at a JSON text: a shared controller file? (by its format tag; no full parse) */
export const looksShared = (text: string) => /"format"\s*:\s*"sc-keymap-shared-controller"/.test(text.slice(0, 4000));

/* ------------------------------------------------------------------ import: target slot */
export interface DeviceIdent { name?: string; vendor?: string; productId?: string }
const normName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');
const sameName = (a: string, b: string) => { const x = normName(a), y = normName(b); return x.length >= 4 && y.length >= 4 && (x === y || x.includes(y) || y.includes(x)); };
/** does a slot's device match the file's? usb = same USB id, name = same name (no USB id on one side), none = different, unknown = no device known */
export function deviceMatch(ident: DeviceIdent | undefined, d: SharedDevice): 'usb' | 'name' | 'none' | 'unknown' {
  if (!ident || (!ident.name && !ident.vendor)) return 'unknown';
  if (d.vendor && d.product && ident.vendor && ident.productId) return hex4(ident.vendor) === d.vendor && hex4(ident.productId) === d.product ? 'usb' : 'none';
  if (d.name && ident.name) return sameName(d.name, ident.name) ? 'name' : 'none';
  return 'unknown';
}
export interface TargetOption { slot: PadSlot; instance: number; ident?: DeviceIdent; connected: boolean }
/**
 * Default target slot: the slot whose connected device matches the file's USB id (then name), else a slot remembering such a
 * device, else the slot shown on the Devices page (same kind), else the first slot of that kind; none = a new slot.
 */
export function defaultTarget(options: TargetOption[], d: SharedDevice, shown?: SlotRef): SlotRef | null {
  const same = options.filter((o) => o.slot === d.kind);
  const pick = (f: (o: TargetOption) => boolean) => same.find(f);
  const r = pick((o) => o.connected && deviceMatch(o.ident, d) === 'usb') ?? pick((o) => o.connected && deviceMatch(o.ident, d) === 'name')
    ?? pick((o) => deviceMatch(o.ident, d) === 'usb') ?? pick((o) => deviceMatch(o.ident, d) === 'name')
    ?? (shown && shown.slot === d.kind ? pick((o) => o.instance === shown.instance) : undefined) ?? same[0];
  return r ? { slot: r.slot, instance: r.instance } : null;
}

/* ------------------------------------------------------------------ import: apply bindings */
export type ImportMode = 'merge' | 'replace';
export interface ExistingBinding { map: string; action: string; input: string; mode?: string }
export interface ImportPlan {
  rebinds: RebindMap;
  touched: { map: string; action: string }[];
  /** bindings of the file the importer's game version knows (applied) */
  applied: SharedBinding[];
  /** of those, how many weren't on the target slot yet */
  added: number;
  /** already exactly there */
  unchanged: number;
  /** bindings on the target slot that go away: overwritten (Merge) or cleared (Replace) */
  removed: ExistingBinding[];
  /** actions the importer's game version doesn't have */
  skipped: SharedBinding[];
}
const ident = (r: { input: string; mode?: string; multiTap?: number }) => `${normalizeCombo(r.input)}|${r.mode ?? ''}|${(r.multiTap ?? 1) > 1 ? r.multiTap : 1}`;

/**
 * Apply a file's bindings onto one game slot of the profile (the inputs get that slot's jsN_ / gpN_ prefix).
 *  - replace: every binding on the target slot is cleared first (game defaults on it included), then the file's are added;
 *  - merge: on the target slot only, the file wins on every input it uses and on every action its author bound (a game default
 *    the file carries claims its input but doesn't push out the importer's own binding of that action); the rest stays.
 * Other slots, the keyboard and the mouse are never touched (an action's js1 defaults are kept when importing into js2).
 * Actions the importer's defaults don't know are skipped.
 */
export function planImport(rebinds: RebindMap, idx: DefaultsIndex, bindings: SharedBinding[], target: SlotRef, mode: ImportMode): ImportPlan {
  const g = groupOfSlot(target.slot);
  const applied = bindings.filter((b) => idx.has(`${b.map}/${b.action}`));
  const skipped = bindings.filter((b) => !idx.has(`${b.map}/${b.action}`));
  const incoming = new Map<string, Rebind[]>();
  for (const b of applied) {
    const r: Rebind = { slot: target.slot, instance: target.instance, input: b.input, ...(b.mode ? { mode: b.mode } : {}), ...(b.multiTap ? { multiTap: b.multiTap } : {}) };
    const k = `${b.map}/${b.action}`;
    incoming.set(k, [...(incoming.get(k) ?? []), r]);
  }
  const inputs = new Set(applied.map((b) => normalizeCombo(b.input)));
  const claimed = new Set(applied.filter((b) => !b.default).map((b) => `${b.map}/${b.action}`));
  let out = rebinds, added = 0, unchanged = 0;
  const removed: ExistingBinding[] = [];
  const touched: { map: string; action: string }[] = [];
  for (const k of actionKeys(rebinds, idx)) {
    const { map, action } = splitKey(k);
    const a = idx.get(k);
    const eff = effectiveGroup(a, rebinds[map]?.[action], g);
    const onT = eff.filter((r) => onSlot(r, target));
    const add = incoming.get(k) ?? [];
    if (!onT.length && !add.length) continue;
    const others = eff.filter((r) => !onSlot(r, target));
    const keepT = mode === 'replace' ? [] : onT.filter((r) => !claimed.has(k) && !inputs.has(normalizeCombo(r.input)));
    const addIds = new Set(add.map(ident));
    const onIds = new Set(onT.map(ident));
    for (const r of onT) if (!keepT.includes(r) && !addIds.has(ident(r))) removed.push({ map, action, input: r.input, ...(r.mode ? { mode: r.mode } : {}) });
    for (const r of add) if (onIds.has(ident(r))) unchanged++; else added++;
    const next = [...others, ...keepT, ...add];
    const before = new Set(eff.map((r) => `${r.slot}${r.instance}:${ident(r)}`));
    if (next.length === eff.length && next.every((r) => before.has(`${r.slot}${r.instance}:${ident(r)}`))) continue;
    touched.push({ map, action });
    out = setGroup(out, a, map, action, g, next);
  }
  return { rebinds: out, touched, applied, added, unchanged, removed, skipped };
}

/* ------------------------------------------------------------------ import: axis settings */
/**
 * Put a file's axis settings on one slot: option groups go into <options type instance> (Replace clears the slot's other groups
 * first, Merge replaces only the groups the file has); deadzone / saturation per axis go under the slot's device model
 * (`product`, the game stores them by product name; without one they are skipped).
 */
export function applyAxisSettings(s: DeviceSettings, target: SlotRef, product: string | undefined, axis: SharedAxis, mode: ImportMode): { settings: DeviceSettings; groups: number; axes: number } {
  const type = TYPE[target.slot];
  const groups: OptGroup[] = axis.groups.map((g) => ({ name: g.name, attrs: g.attrs.map(([k, v]) => [k, v] as Attr), ...(g.curve ? { curve: { attrs: g.curve.attrs, points: g.curve.points.map(([i, o]) => ({ in: i, out: o })) } } : {}), extra: [] }));
  let blocks = s.blocks;
  const cur = optionsBlock(s, type, target.instance);
  if (cur || groups.length) {
    const base: OptionsBlock = cur ?? { tag: 'options', attrs: [['type', type], ['instance', String(target.instance)], ...(product ? [['Product', product] as Attr] : [])], groups: [] };
    const names = new Set(groups.map((g) => g.name));
    const next: OptionsBlock = { ...base, groups: [...(mode === 'replace' ? [] : base.groups.filter((g) => !names.has(g.name))), ...groups] };
    if (cur) blocks = blocks.map((b) => (b === cur ? next : b));
    else {
      const rank = (b: DeviceSettings['blocks'][number]) => (b.tag === 'deviceoptions' ? -1 : ({ keyboard: 0, mouse: 1, gamepad: 2, joystick: 3 }[blockType(b)] ?? 4) * 100 + blockInstance(b));
      blocks = [...blocks];
      let at = blocks.findIndex((b) => rank(b) > rank(next));
      if (at < 0) at = blocks.length;
      blocks.splice(at, 0, next);
    }
  }
  let out: DeviceSettings = { ...s, blocks };
  let axes = 0;
  if (target.slot === 'js' && product) {
    if (mode === 'replace') out = { ...out, blocks: out.blocks.filter((b) => !(b.tag === 'deviceoptions' && sameProduct(b.attrs.find((x) => x[0] === 'name')?.[1] ?? '', product))) };
    for (const a of axis.axes) for (const key of ['deadzone', 'saturation'] as const) {
      const v = a[key];
      if (v === undefined) continue;
      out = setAxis(out, product, a.input, key, v);
      axes++;
    }
  }
  return { settings: out, groups: groups.length, axes };
}

/* ------------------------------------------------------------------ import: template */
const canon = (v: unknown): string => {
  if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`;
  if (isObj(v)) return `{${Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(',')}}`;
  return JSON.stringify(v);
};
/** a template's content for comparison: everything but its id, save time and file tags */
export const templateContent = (t: DeviceTemplate) => { const { id: _i, updatedAt: _u, format: _f, builtin: _b, loadImage: _l, ...rest } = t; return canon(rest); };
/** the user's template identical to `t` (same content, any id), if they already have it */
export function sameTemplate(user: DeviceTemplate[], t: DeviceTemplate): DeviceTemplate | undefined {
  // both sides go through the file sanitizer, so fields it normalizes (trimmed names, clamped points) compare equal
  const clean = (x: DeviceTemplate) => { try { return templateContent(cleanTemplate(x, 0)); } catch { return templateContent(x); } };
  const c = clean(t);
  return user.find((u) => clean(u) === c);
}
