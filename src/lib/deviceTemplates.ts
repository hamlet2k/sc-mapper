// Device-specific built-in templates: original holographic wireframe art generated from procedural 3D models (scripts/devices/*.mjs,
// no vendor artwork) with callouts at the real controls and the button / axis / hat numbers the device reports (DirectInput, as the
// browser and the game see them: button N = jsX_buttonN). Loaded lazily (own chunk) by useTemplates; the generic stick / throttle /
// gamepad stay the fallback for every other device.
import type { Callout, CalloutKind, DeviceTemplate, TemplateView } from './templates';
import type { DeviceArt } from './deviceArtTypes';
import { DEVICE_ART, DEVICE_SVG } from './deviceArt';
import { DEVICE_PHOTO_LAYOUTS, type DevicePhotoLayout } from './devicePhotoLayouts';
import { DEVICE_PHOTO_SIZES } from './devicePhotoSizes';

const b = (...n: number[]) => n.map((i) => `button${i}`);
const hat = (n: number) => ['up', 'right', 'down', 'left'].map((d) => `hat${n}_${d}`);
/** n inputs without a number yet (devices whose numbering is not published / depends on the user's configuration) */
const u = (n: number) => Array.from({ length: n }, () => '');
const range = (a: number, z: number) => Array.from({ length: z - a + 1 }, (_, i) => a + i);
/** callout spec: art control id, kind, inputs, label, group; side = which label column (default: the side the control is on) */
interface Spec { id: string; art?: string; kind: CalloutKind; inputs: string[]; label?: string; group?: string; side?: 'L' | 'R' | 'B'; box?: [number, number] }
const c = (id: string, kind: CalloutKind, inputs: string[], label?: string, group?: string, more: Partial<Spec> = {}): Spec => ({ id, kind, inputs, label, group, ...more });

/**
 * Callouts from specs: anchors / glow outlines from the art; label boxes laid out automatically. Every control goes to the label
 * column on its side (or `side`), each column sorted by the anchor height so leader lines do not cross and spread evenly; a column
 * holds as many labels as fit the canvas height, the overflow (the controls nearest the middle) moves to the other column, then to a
 * row under the drawing and finally to a row above it (rows sorted by the anchor x). `box` overrides.
 */
export function layoutCallouts(art: DeviceArt, specs: Spec[], opts: { top?: number; bottom?: number; maxPerColumn?: number } = {}): Callout[] {
  const top = opts.top ?? 0.055, bottom = opts.bottom ?? 0.86;
  const items = specs.map((s) => {
    const a = art.anchors[s.art ?? s.id];
    if (!a) throw new Error(`device art has no control “${s.art ?? s.id}”`);
    return { s, ax: a[0] / art.w, ay: a[1] / art.h };
  });
  // rough label heights (px at ~1000 px canvas width): two-axis boxes are the tallest, hats are a 3-row cross
  const hPx = (sp: Spec) => (sp.kind === 'axis' ? 40 + 52 * sp.inputs.length : sp.kind === 'hat' ? 70 : sp.kind === 'button' ? 50 : 60);
  const H = art.h * (1000 / art.w);
  const fits = (col: typeof items) => col.reduce((acc, it) => acc + hPx(it.s) + 6, 0) <= (bottom - top) * H;
  const cols: Record<'L' | 'R' | 'B' | 'T', typeof items> = { L: [], R: [], B: [], T: [] };
  for (const it of items) cols[it.s.side ?? (it.ax < 0.5 ? 'L' : 'R')].push(it);
  const maxCol = opts.maxPerColumn ?? Infinity;
  const over = (side: 'L' | 'R') => cols[side].length > maxCol || !fits(cols[side]);
  const ROW = 4; // labels per row under / above the drawing
  for (const [from, to] of [['L', 'R'], ['R', 'L']] as const) {
    cols[from].sort((p, q) => Math.abs(p.ax - 0.5) - Math.abs(q.ax - 0.5));
    while (over(from) && !over(to) && cols[from].length > 1) { const it = cols[from].shift()!; cols[to].push(it); if (over(to)) { cols[to].pop(); cols[from].unshift(it); break; } }
    cols[from].sort((p, q) => q.ay - p.ay); // overflow: lowest controls go to the bottom row, then the highest to the top row
    while (over(from) && cols.B.length < ROW) cols.B.push(cols[from].shift()!);
    cols[from].sort((p, q) => p.ay - q.ay);
    while (over(from) && cols.T.length < ROW) cols.T.push(cols[from].shift()!);
  }
  type It = (typeof items)[number];
  const place = (L: It[], R: It[]): Map<Spec, [number, number]> => {
    const boxes = new Map<Spec, [number, number]>();
    const colTop = cols.T.length ? top + 0.06 : top;
    for (const [side, col] of [['L', L], ['R', R]] as const) {
      if (!col.length) continue;
      const hs = col.map((it) => hPx(it.s) / H);
      const span = bottom - colTop, need = hs.reduce((acc, v) => acc + v, 0) - (hs[0] + hs[hs.length - 1]) / 2; // centre-to-centre extent without gaps
      const gap = col.length > 1 ? Math.max(0, Math.min(0.03, (span - need) / (col.length - 1))) : 0;
      const k = need + gap * (col.length - 1) > span ? span / (need + gap * (col.length - 1)) : 1; // squeeze if it does not fit
      const ys: number[] = [];
      col.forEach((_, i) => ys.push(i === 0 ? 0 : ys[i - 1] + ((hs[i - 1] + hs[i]) / 2 + gap) * k));
      const ext = ys[ys.length - 1], mean = col.reduce((acc, it) => acc + it.ay, 0) / col.length;
      const start = Math.max(colTop, Math.min(mean - ext / 2, bottom - ext));
      col.forEach((it, i) => { const wide = it.s.kind === 'hat'; boxes.set(it.s, [side === 'L' ? (wide ? 0.125 : 0.115) : (wide ? 0.875 : 0.885), start + ys[i]]); });
    }
    const rowAt = (row: It[], y: number) => [...row].sort((p, q) => p.ax - q.ax).forEach((it, i) => boxes.set(it.s, [row.length === 1 ? 0.5 : 0.14 + (0.72 * i) / (row.length - 1), y]));
    rowAt(cols.B, Math.min(0.955, bottom + 0.075));
    rowAt(cols.T, Math.max(0.03, top - 0.02));
    return boxes;
  };
  // leader-line crossings (canvas units, aspect kept): the local search below swaps neighbours in a column and moves controls
  // without an explicit side to the other column whenever that removes crossings
  const crossings = (boxes: Map<Spec, [number, number]>) => {
    const sg = items.map((it) => { const [bx, by] = boxes.get(it.s)!; return [it.ax, it.ay * H / 1000, bx, by * H / 1000]; });
    const d = (px: number, py: number, qx: number, qy: number, rx: number, ry: number) => (qx - px) * (ry - py) - (qy - py) * (rx - px);
    let n = 0;
    for (let i = 0; i < sg.length; i++) for (let j = i + 1; j < sg.length; j++) {
      const [a0, a1, a2, a3] = sg[i], [b0, b1, b2, b3] = sg[j];
      if (d(a0, a1, a2, a3, b0, b1) * d(a0, a1, a2, a3, b2, b3) < 0 && d(b0, b1, b2, b3, a0, a1) * d(b0, b1, b2, b3, a2, a3) < 0) n++;
    }
    return n;
  };
  let Lc = cols.L.sort((p, q) => p.ay - q.ay), Rc = cols.R.sort((p, q) => p.ay - q.ay);
  let best = crossings(place(Lc, Rc));
  for (let pass = 0; pass < 6 && best > 0; pass++) {
    let improved = false;
    for (const which of [0, 1]) {
      const col = which ? Rc : Lc;
      for (let i = 0; i + 1 < col.length; i++) {
        const next = [...col]; [next[i], next[i + 1]] = [next[i + 1], next[i]];
        const c2 = crossings(which ? place(Lc, next) : place(next, Rc));
        if (c2 < best) { best = c2; if (which) Rc = next; else Lc = next; improved = true; }
      }
      const other = which ? Lc : Rc;
      for (const it of [...col]) {
        if (it.s.side) continue;
        const from = col.filter((x) => x !== it), to = [...other, it].sort((p, q) => p.ay - q.ay);
        if (!fits(to) || to.length > maxCol) continue;
        const c2 = crossings(which ? place(to, from) : place(from, to));
        if (c2 < best) { best = c2; if (which) { Rc = from; Lc = to; } else { Lc = from; Rc = to; } improved = true; break; }
      }
    }
    if (!improved) break;
  }
  const boxes = place(Lc, Rc);
  return items.map(({ s, ax, ay }) => {
    const [bx, by] = s.box ?? boxes.get(s)!;
    const key = s.art ?? s.id, region = art.regions[key], inputRegions = s.art && s.art !== s.id ? undefined : art.inputRegions[key];
    return { id: s.id, kind: s.kind, inputs: s.inputs, anchor: { x: ax, y: ay }, box: { x: bx, y: by }, ...(s.label ? { label: s.label } : {}), ...(s.group ? { group: s.group } : {}), ...(region ? { region } : {}), ...(inputRegions?.length ? { inputRegions } : {}) };
  });
}
type Meta = Omit<DeviceTemplate, 'version' | 'builtin' | 'slot' | 'image' | 'aspect' | 'callouts' | 'loadImage'> & { slot?: 'js' | 'gp' };
const ALL: DeviceTemplate[] = [];
/** a device template from its art id (scripts/devices/<art>.mjs): callouts laid out from the art's anchors, picture loaded on demand */
function tpl(art: string, meta: Meta, specs: Spec[], layout?: Parameters<typeof layoutCallouts>[2]): void {
  const a = DEVICE_ART[art];
  if (!a) return; // (art not generated: only while a new device is being added)
  const t: DeviceTemplate = { version: 1, builtin: true, slot: 'js', ...meta, aspect: a.w / a.h, callouts: layoutCallouts(a, specs, layout), loadImage: DEVICE_SVG[art] };
  const photo = photoLayoutFor(t.id);
  if (photo) {
    const r = withPhotoLayout(t, photo);
    if (Array.isArray(r)) PHOTO_LAYOUT_PROBLEMS.push(`${t.id}: ${r.join('; ')}`);
    else { ALL.push(r); return; }
  }
  ALL.push(t);
}

/* ------------------------------------------------------------------ photo templates */
/** label gutter on each side of a photo view, as a fraction of the photo height (room for the label columns) */
export const PHOTO_GUTTER = 0.3;
/** incomplete / broken entries of DEVICE_PHOTO_LAYOUTS (those templates keep their art); the unit tests require none */
export const PHOTO_LAYOUT_PROBLEMS: string[] = [];
/** test hook (e2e only): `globalThis.__SC_TEST_PHOTO_LAYOUTS = { [templateId]: DevicePhotoLayout }`, set before the app loads,
 * adds / replaces layouts so photo rendering can be exercised without real coordinates */
function photoLayoutFor(id: string): DevicePhotoLayout | undefined {
  const test = (globalThis as { __SC_TEST_PHOTO_LAYOUTS?: Record<string, DevicePhotoLayout> }).__SC_TEST_PHOTO_LAYOUTS;
  return (test && typeof test === 'object' && Object.prototype.hasOwnProperty.call(test, id) ? test[id] : undefined) ?? DEVICE_PHOTO_LAYOUTS[id];
}
/** the views of a photo layout: each photo (size from DEVICE_PHOTO_SIZES) centred on a canvas widened by the label gutters */
export function photoViews(layout: DevicePhotoLayout): { views: TemplateView[]; problems: string[] } {
  const problems: string[] = [], ids = new Set<string>(), views: TemplateView[] = [];
  if (!layout?.views?.length) problems.push('no views');
  for (const v of layout?.views ?? []) {
    const size = DEVICE_PHOTO_SIZES[v.photo];
    if (!/^[A-Za-z0-9_-]{1,24}$/.test(v.id) || ids.has(v.id)) { problems.push(`bad or duplicate view id “${v.id}”`); continue; }
    if (!size || !/^[a-z0-9][a-z0-9-]{0,80}$/.test(v.photo)) { problems.push(`unknown photo “${v.photo}”`); continue; }
    ids.add(v.id);
    const [pw, ph] = size;
    views.push({ id: v.id, label: v.label, image: `/device-photos/${v.photo}.webp`, width: Math.round(pw + 2 * PHOTO_GUTTER * ph), height: ph, ...(v.swap ? { swap: v.swap } : {}) });
  }
  return { views, problems };
}
/**
 * `t` (a device template laid out on its art) as a multi-view photo template: views from the layout's photos, each callout's
 * anchor from the layout (fractions of the photo, mapped onto the view canvas) and its labels laid out per view. Returns the
 * problems instead when the layout does not place every callout (or names an unknown view / photo).
 */
export function withPhotoLayout(t: DeviceTemplate, layout: DevicePhotoLayout): DeviceTemplate | string[] {
  const { views, problems } = photoViews(layout);
  const anchors = layout?.anchors ?? {};
  const ok = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;
  for (const c of t.callouts) {
    const a = anchors[c.id];
    if (!a) problems.push(`no anchor for “${c.id}”`);
    else if (!views.some((v) => v.id === a.view)) problems.push(`“${c.id}” is on an unknown view “${a.view}”`);
    else if (!ok(a.x) || !ok(a.y)) problems.push(`“${c.id}” has coordinates outside 0..1`);
  }
  if (problems.length) return problems;
  const callouts = new Map<string, Callout>();
  for (const v of views) {
    const pw = DEVICE_PHOTO_SIZES[layout.views.find((x) => x.id === v.id)!.photo][0], gx = (v.width - pw) / 2;
    const on = t.callouts.filter((c) => anchors[c.id].view === v.id);
    if (!on.length) continue;
    const art: DeviceArt = { w: v.width, h: v.height, regions: {}, inputRegions: {}, anchors: Object.fromEntries(on.map((c) => [c.id, [gx + anchors[c.id].x * pw, anchors[c.id].y * v.height]])) };
    // label columns: by the side of the photo the control is on; when that leaves one column (nearly) empty (the controls of a
    // view are often all on one side of a centred device photo), split at the median x instead
    const xs = on.map((c) => anchors[c.id].x).sort((p, q) => p - q), mid = on.length > 1 ? (xs[(on.length - 1) >> 1] + xs[on.length >> 1]) / 2 : 0.5;
    const rank = new Map([...on].sort((p, q) => anchors[p.id].x - anchors[q.id].x).map((c, i) => [c.id, i]));
    const nLeft = on.filter((c) => anchors[c.id].x < 0.5).length, byMiddle = Math.min(nLeft, on.length - nLeft) >= on.length / 4;
    // a small view with a lopsided split (e.g. 7 / 3) is also split at the median so neither label column overflows
    const lopsided = on.length <= 10 && Math.abs(on.length - 2 * nLeft) > 2;
    const side = (c: Callout): 'L' | 'R' | undefined => byMiddle && !lopsided ? undefined : anchors[c.id].x < mid || (anchors[c.id].x === mid && rank.get(c.id)! < on.length / 2) ? 'L' : 'R';
    const laid = layoutCallouts(art, on.map((c) => ({ id: c.id, kind: c.kind, inputs: c.inputs, label: c.label, group: c.group, side: side(c) })), { top: 0.05, bottom: 0.9 });
    for (const c of laid) callouts.set(c.id, { ...c, view: v.id });
  }
  const { loadImage: _l, image: _i, ...rest } = t;
  return { ...rest, views, aspect: views[0].width / views[0].height, callouts: t.callouts.map((c) => callouts.get(c.id)!) };
}

/* ------------------------------------------------------------------ Thrustmaster */
// Thrustmaster HOTAS Warthog: fixed numbering (not configurable without the T.A.R.G.E.T software), 1-based exactly as the manual
// shows: manual button N = DirectInput button N = SC jsX_buttonN. USB ids 044F:0402 (stick) and 044F:0404 (throttle).
const TM_NOTE = 'Numbers as the Thrustmaster manual shows them: button N there = jsX_buttonN in the game (fixed, 1-based). In T.A.R.G.E.T mode the device is replaced by a virtual one and the numbers change.';
tpl('tm-warthog-stick', {
  id: 'builtin-tm-warthog-stick', name: 'Thrustmaster HOTAS Warthog stick', brand: 'Thrustmaster', notes: TM_NOTE,
  match: [{ vendor: '044F', product: '0402' }, { name: 'Joystick - HOTAS Warthog' }],
}, [
  c('wpn', 'button', b(2), 'Weapon release', 'Grip head', { side: 'L' }),
  c('tms', 'hat', b(7, 8, 9, 10), 'TMS (4-way)', 'Grip head', { side: 'L' }),
  c('trig', 'switch', b(1, 6), 'Trigger (stage 1 / 2)', 'Grip', { side: 'L' }),
  c('cms', 'hat', b(15, 16, 17, 18, 19), 'CMS (4-way + push)', 'Grip', { side: 'L' }),
  c('pinky', 'button', b(4), 'Pinky lever', 'Grip', { side: 'L' }),
  c('trim', 'hat', hat(1), 'Trim hat (8-way POV)', 'Grip head', { side: 'R' }),
  c('dms', 'hat', b(11, 12, 13, 14), 'DMS (4-way)', 'Grip head', { side: 'R' }),
  c('mmode', 'button', b(5), 'Master mode', 'Grip head', { side: 'R' }),
  c('nws', 'button', b(3), 'Nosewheel steering', 'Grip', { side: 'R' }),
  c('xy', 'axis', ['x', 'y'], 'Stick X / Y (roll / pitch)', 'Axes', { side: 'R' }),
], { top: 0.06, bottom: 0.8 });

tpl('tm-warthog-throttle', {
  id: 'builtin-tm-warthog-throttle', name: 'Thrustmaster HOTAS Warthog throttle', brand: 'Thrustmaster', notes: TM_NOTE,
  match: [{ vendor: '044F', product: '0404' }, { name: 'Throttle - HOTAS Warthog' }],
}, [
  // right grip (thumb side and front face)
  c('mic', 'hat', b(3, 4, 5, 6, 2), 'MIC switch (4-way + push)', 'Right grip'),
  c('spdbrk', 'switch', b(7, 8), 'Speedbrake (fwd / aft)', 'Right grip'),
  c('boat', 'switch', b(9, 10), 'Boat switch (fwd / aft)', 'Right grip'),
  c('china', 'switch', b(11, 12), 'China hat (fwd / aft)', 'Right grip'),
  c('coolie', 'hat', hat(1), 'Coolie hat (8-way POV)', 'Right grip'),
  c('slew', 'axis', ['x', 'y'], 'Slew control', 'Right grip'),
  c('slewb', 'button', b(1), 'Slew press', 'Right grip', { art: 'slew' }),
  c('rthr', 'axis', ['z'], 'Right throttle', 'Axes'),
  c('roff', 'button', b(29), 'Right throttle OFF (idle cutoff)', 'Axes'),
  // left grip
  c('pinky', 'switch', b(13, 14), 'Pinky switch (fwd / aft)', 'Left grip'),
  c('ltb', 'button', b(15), 'Left throttle button', 'Left grip'),
  c('lthr', 'axis', ['rotz'], 'Left throttle', 'Axes'),
  c('loff', 'button', b(30), 'Left throttle OFF (idle cutoff)', 'Axes'),
  // base panel
  c('flaps', 'switch', b(22, 23), 'Flaps (UP / DN, MVR = none)', 'Panel'),
  c('ff', 'buttons', b(16, 17), 'Fuel flow L / R (NORM)', 'Panel'),
  c('eol', 'switch', b(31, 18), 'Engine operate L (IGN / MOTOR)', 'Panel'),
  c('eor', 'switch', b(32, 19), 'Engine operate R (IGN / MOTOR)', 'Panel'),
  c('apu', 'button', b(20), 'APU start', 'Panel', { side: 'B' }),
  c('lgsil', 'button', b(21), 'L/G horn silence', 'Panel', { side: 'B' }),
  c('frict', 'axis', ['slider1'], 'Friction slider', 'Panel', { side: 'B' }),
  c('eac', 'button', b(24), 'EAC (ARM)', 'Panel'),
  c('rdr', 'button', b(25), 'Radar altimeter (NRM)', 'Panel'),
  c('apeng', 'button', b(26), 'Autopilot engage', 'Panel'),
  c('apsel', 'switch', b(27, 28), 'Autopilot PATH / ALT', 'Panel'),
], { top: 0.05, bottom: 0.86, maxPerColumn: 11 });

// Thrustmaster T.16000M FCS: fixed numbering (manual), right-handed base layout. USB 044F:B10A.
tpl('tm-t16000m', {
  id: 'builtin-tm-t16000m', name: 'Thrustmaster T.16000M FCS stick', brand: 'Thrustmaster',
  notes: 'Numbers as the Thrustmaster manual shows them (fixed, 1-based: button N = jsX_buttonN). Base buttons shown for the right-handed setting; in left-handed mode the two base panels swap.',
  match: [{ vendor: '044F', product: 'B10A' }, { name: 'T.16000M' }],
}, [
  c('pov', 'hat', hat(1), 'POV hat (8-way)', 'Grip head'),
  c('b2', 'button', b(2), 'Head button (back)', 'Grip head'),
  c('b3', 'button', b(3), 'Head button (left)', 'Grip head'),
  c('trig', 'button', b(1), 'Trigger', 'Grip'),
  c('lpanel', 'buttons', b(5, 6, 7, 8, 9, 10), 'Base buttons left (5-10)', 'Base'),
  c('b4', 'button', b(4), 'Head button (right)', 'Grip head'),
  c('twist', 'axis', ['rotz'], 'Twist (rudder)', 'Axes'),
  c('xy', 'axis', ['x', 'y'], 'Stick X / Y', 'Axes'),
  c('rpanel', 'buttons', b(11, 12, 13, 14, 15, 16), 'Base buttons right (11-16)', 'Base'),
  c('thr', 'axis', ['slider1'], 'Throttle slider', 'Base'),
]);

// Thrustmaster TWCS throttle: fixed numbering (manual). USB 044F:B687.
tpl('tm-twcs', {
  id: 'builtin-tm-twcs', name: 'Thrustmaster TWCS throttle', brand: 'Thrustmaster',
  notes: 'Numbers as the Thrustmaster manual shows them (fixed, 1-based: button N = jsX_buttonN).',
  match: [{ vendor: '044F', product: 'B687' }, { name: 'TWCS' }],
}, [
  c('h11', 'hat', b(11, 12, 13, 14), 'Hat (4-way)', 'Grip', { side: 'L' }),
  c('b3', 'button', b(3), 'Button 3', 'Grip', { side: 'L' }),
  c('b2', 'button', b(2), 'Button 2', 'Grip', { side: 'L' }),
  c('r45', 'switch', b(4, 5), 'Rocker (fwd / aft)', 'Grip', { side: 'L' }),
  c('thr', 'axis', ['z'], 'Throttle', 'Axes', { side: 'L' }),
  c('h7', 'hat', b(7, 8, 9, 10), 'Hat (4-way)', 'Grip', { side: 'R' }),
  c('pov', 'hat', hat(1), 'POV hat (8-way)', 'Grip', { side: 'R' }),
  c('mini', 'axis', ['x', 'y'], 'Ministick', 'Grip', { side: 'R' }),
  c('minib', 'button', b(6), 'Ministick press', 'Grip', { art: 'mini', side: 'R' }),
  c('ant', 'axis', ['slider1'], 'Antenna wheel', 'Grip', { side: 'R' }),
  c('b1', 'button', b(1), 'Front button', 'Grip', { side: 'R' }),
  c('paddle', 'axis', ['rotz'], 'Paddle rocker (rudder)', 'Grip', { side: 'R' }),
]);

/* ------------------------------------------------------------------ VIRPIL */
const VPC_NOTE = 'Default numbering from the VIRPIL diagrams (1-based: button N = jsX_buttonN). The VPC Configurator can renumber everything: if yours differs, use “Customize a copy”.';
tpl('virpil-alpha-prime', {
  id: 'builtin-virpil-alpha-prime', name: 'VIRPIL Alpha Prime (R) stick', brand: 'VIRPIL', notes: VPC_NOTE,
  match: [{ name: 'Alpha Prime' }],
}, [
  c('b13', 'button', b(13), 'Head button (front)', 'Grip head', { side: 'L' }),
  c('b7', 'button', b(7), 'Head button', 'Grip head', { side: 'L' }),
  c('mini', 'axis', ['rotx', 'roty'], 'Ministick', 'Grip head', { side: 'L' }),
  c('minib', 'button', b(6), 'Ministick press', 'Grip head', { art: 'mini', side: 'L' }),
  c('t1', 'switch', b(1, 2, 3), 'Trigger (flip fwd / stage 1 / stage 2)', 'Grip', { side: 'L' }),
  c('t4', 'switch', b(4, 5), 'Lower trigger (stage 1 / 2)', 'Grip', { side: 'L' }),
  c('brake', 'button', b(32), 'Pinky lever (click)', 'Grip', { side: 'L' }),
  c('braked', 'axis', ['slider1'], 'Pinky lever (analog)', 'Grip', { art: 'brake', side: 'L' }),
  c('h8', 'hat', b(9, 12, 11, 10, 8), 'Hat (4-way + push)', 'Grip head', { side: 'R' }),
  c('h14', 'hat', b(15, 18, 17, 16, 14), 'Hat (4-way + push)', 'Grip head', { side: 'R' }),
  c('r28', 'switch', b(29, 28, 30), 'Rocker (up / push / down)', 'Grip head', { side: 'R' }),
  c('h23', 'hat', b(24, 27, 26, 25, 23), 'Rear hat (4-way + push)', 'Grip', { side: 'R' }),
  c('l19', 'switch', b(21, 19, 20, 22), 'Thumb lever (up / press / 2nd stage / down)', 'Grip', { side: 'R' }),
  c('b31', 'button', b(31), 'Rear button', 'Grip', { side: 'R' }),
  c('twist', 'axis', ['z'], 'Twist', 'Axes', { side: 'R' }),
  c('xy', 'axis', ['x', 'y'], 'Stick X / Y', 'Axes', { side: 'R' }),
]);
tpl('virpil-vmax-prime', {
  id: 'builtin-virpil-vmax-prime', name: 'VIRPIL VMAX Prime throttle', brand: 'VIRPIL',
  notes: VPC_NOTE + ' Shown without the shift layer. Uses buttons above 32: Chrome / Edge only report the first 32, use Firefox.',
  match: [{ name: 'VMAX' }],
}, [
  c('keys', 'buttons', b(...range(23, 28)), 'Base keys (23-28)', 'Base', { side: 'L' }),
  c('apu', 'switch', b(47, 48, 49, 50, 51), 'APU selector (5 positions)', 'Base', { side: 'L' }),
  c('apub', 'button', b(40), 'APU start', 'Base', { side: 'L' }),
  c('jett', 'button', b(29), 'Jettison', 'Base', { side: 'L' }),
  c('t1', 'switch', b(30, 32), 'T1 (up / down)', 'Base', { side: 'L' }),
  c('t2', 'switch', b(31, 33), 'T2 (up / down)', 'Base', { side: 'L' }),
  c('t3', 'switch', b(34, 35), 'T3 (up / down)', 'Base', { side: 'L' }),
  c('t4', 'switch', b(36, 37), 'T4 (up / down)', 'Base', { side: 'L' }),
  c('t5', 'switch', b(38, 39), 'T5 (up / down)', 'Base', { side: 'L' }),
  c('e1', 'encoder', b(43, 42, 41), 'Encoder E1', 'Base', { side: 'L' }),
  c('e2', 'encoder', b(46, 45, 44), 'Encoder E2', 'Base', { side: 'L' }),
  c('b17', 'button', b(17), 'Right grip top button', 'Right grip', { side: 'L' }),
  c('h10', 'hat', b(14, 11, 12, 13, 10), 'Hat (4-way + push)', 'Right grip', { side: 'L' }),
  c('b16', 'button', b(16), 'Button 16', 'Right grip', { side: 'L' }),
  c('mini', 'axis', ['x', 'y'], 'Ministick', 'Right grip'),
  c('minib', 'button', b(15), 'Ministick press', 'Right grip', { art: 'mini' }),
  c('h18', 'hat', b(22, 19, 20, 21, 18), 'Hat (4-way + push)', 'Right grip'),
  c('rthr', 'axis', ['roty'], 'Right lever', 'Axes'),
  c('lthr', 'axis', ['rotx'], 'Left lever', 'Axes'),
  c('rot2', 'axis', ['slider1'], 'Rotary (SR)', 'Left grip'),
  c('rot2b', 'button', b(2), 'Rotary press', 'Left grip', { art: 'rot2' }),
  c('wl9', 'axis', ['slider2'], 'Wheel (DL dial)', 'Left grip'),
  c('wl9b', 'button', b(9), 'Wheel press', 'Left grip', { art: 'wl9' }),
  c('h4', 'hat', b(7, 8, 5, 6, 4), 'Hat (4-way + push)', 'Left grip'),
  c('b3', 'button', b(3), 'Button 3', 'Left grip'),
  c('b1', 'button', b(1), 'Button 1', 'Left grip'),
  c('paddle', 'axis', ['rotz'], 'Paddle', 'Left grip'),
]);

/* ------------------------------------------------------------------ WinCtrl (WinWing) */
const WC_NOTE = 'Default numbering from the WinCtrl diagrams (1-based: button N = jsX_buttonN). SimAppPro can change it: if yours differs, use “Customize a copy”.';
tpl('winctrl-carrierace', {
  id: 'builtin-winctrl-carrierace', name: 'WinCtrl CarrierAce stick (WinCtrl base)', brand: 'WinCtrl', notes: WC_NOTE,
  match: [{ name: 'JGRIP-F18' }, { name: 'Metal 2 + CarrierAce' }, { name: 'CarrierAce Joystick' }, { name: 'CarrierAce Stick' }],
}, [
  c('wpn', 'button', b(20), 'Weapon release', 'Grip head', { side: 'L' }),
  c('hatA', 'hat', b(10, 11, 12, 13, 9), 'Hat A (4-way + push)', 'Grip head', { side: 'L' }),
  c('sel5', 'switch', b(1, 2, 26, 27, 3), '5-way switch', 'Grip', { side: 'L' }),
  c('hatC', 'hat', b(22, 23, 24, 25, 21), 'Hat C (4-way + push)', 'Grip', { side: 'L' }),
  c('trig', 'switch', b(4, 5), 'Trigger (stage 1 / 2)', 'Grip', { side: 'L' }),
  c('paddle', 'switch', b(7, 8), 'Paddle (stage 1 / 2)', 'Grip', { side: 'L' }),
  c('paddlea', 'axis', ['slider1'], 'Paddle (analog)', 'Grip', { art: 'paddle', side: 'L' }),
  c('trim', 'hat', hat(1), 'Trim hat (8-way POV)', 'Grip head', { side: 'R' }),
  c('hatB', 'hat', b(15, 16, 17, 18, 14), 'Hat B (4-way + push)', 'Grip head', { side: 'R' }),
  c('rear', 'button', b(6), 'Rear button', 'Grip', { side: 'R' }),
  c('xy', 'axis', ['x', 'y'], 'Stick X / Y', 'Axes', { side: 'R' }),
]);
tpl('winctrl-viperace', {
  id: 'builtin-winctrl-viperace', name: 'WinCtrl ViperAce stick (WinCtrl base)', brand: 'WinCtrl',
  notes: WC_NOTE + ' Uses buttons above 32: Chrome / Edge only report the first 32, use Firefox.',
  match: [{ name: 'JGRIP-F16' }, { name: 'Metal 2 + ViperAce' }, { name: 'ViperAce Joystick' }, { name: 'ViperAce Stick' }],
}, [
  c('wpn', 'button', b(20), 'Weapon release', 'Grip head', { side: 'L' }),
  c('tms', 'hat', b(10, 11, 12, 13, 9), 'Hat (4-way + push)', 'Grip head', { side: 'L' }),
  c('cms', 'hat', b(22, 23, 24, 25, 21), 'Thumb hat (4-way + push)', 'Grip', { side: 'L' }),
  c('trig', 'switch', b(4, 5), 'Trigger (stage 1 / 2)', 'Grip', { side: 'L' }),
  c('mini', 'axis', ['rotx', 'roty'], 'Ministick', 'Side module', { side: 'L' }),
  c('minib', 'hat', b(27, 28, 29, 30, 26), 'Ministick (digital + press)', 'Side module', { art: 'mini', side: 'L' }),
  c('hatD', 'hat', b(32, 33, 34, 35, 31), 'Hat D (4-way + push)', 'Side module', { side: 'L' }),
  c('hatE', 'hat', b(37, 38, 39, 40, 36), 'Hat E (4-way + push)', 'Side module', { side: 'L' }),
  c('paddle', 'switch', b(7, 8), 'Paddle (stage 1 / 2)', 'Grip', { side: 'L' }),
  c('trim', 'hat', hat(1), 'Trim hat (8-way POV)', 'Grip head', { side: 'R' }),
  c('dms', 'hat', b(15, 16, 17, 18, 14), 'Hat (4-way + push)', 'Grip head', { side: 'R' }),
  c('wheel', 'switch', b(1, 2, 41, 42, 3), 'Wheel (5-way)', 'Grip head', { side: 'R' }),
  c('wheela', 'axis', ['rotz'], 'Wheel (analog)', 'Grip head', { art: 'wheel', side: 'R' }),
  c('nws', 'button', b(6), 'Front button', 'Grip', { side: 'R' }),
  c('paddlea', 'axis', ['slider1'], 'Paddle (analog)', 'Grip', { art: 'paddle', side: 'R' }),
  c('xy', 'axis', ['x', 'y'], 'Stick X / Y', 'Axes', { side: 'R' }),
]);
tpl('winctrl-orion', {
  id: 'builtin-winctrl-orion', name: 'WinCtrl Orion throttle (F-15EX grips, F/A-18 panel)', brand: 'WinCtrl',
  notes: WC_NOTE + ' Uses buttons up to 111: Chrome / Edge only report the first 32, use Firefox.',
  match: [{ name: 'F15EX HANDLE' }, { name: 'Orion Throttle Base II + F15EX' }],
}, [
  c('lbar', 'switch', b(65, 66), 'Launch bar', 'Panel'), c('hook', 'switch', b(67, 68), 'Hook', 'Panel'),
  c('wfold', 'switch', b(69, 70, 71, 72), 'Wing fold (3 pos + push)', 'Panel'), c('gear', 'switch', b(73, 74), 'Gear', 'Panel'),
  c('pbrk', 'switch', b(75, 76), 'Parking brake', 'Panel'), c('flap', 'switch', b(77, 78, 79), 'Flaps (3 pos)', 'Panel'),
  c('hmd', 'encoder', b(83, 84, 85), 'HMD knob', 'Panel'), c('roll', 'switch', b(86, 87, 88), 'ROLL', 'Panel'),
  c('pitch', 'switch', b(89, 90, 91), 'PITCH', 'Panel'), c('adv', 'button', b(92), 'ADV MODE', 'Panel'),
  c('marm', 'switch', b(93, 94, 95), 'Master arm', 'Panel'), c('jett', 'button', b(96), 'Jettison', 'Panel'),
  c('aga', 'buttons', b(80, 81, 82), 'Button · A/G · A/A', 'Panel'), c('hdg', 'encoder', b(97, 98, 99), 'HDG knob', 'Panel'),
  c('sldw', 'axis', ['slider1'], 'Slider wheel', 'Panel'), c('sldwb', 'switch', b(106, 107, 108), 'Slider wheel (buttons)', 'Panel', { art: 'sldw' }),
  c('dialw', 'axis', ['slider2'], 'Dial wheel', 'Panel'), c('dialwb', 'switch', b(109, 110, 111), 'Dial wheel (buttons)', 'Panel', { art: 'dialw' }),
  c('crs', 'encoder', b(100, 101, 102), 'CRS knob', 'Panel'), c('lts', 'encoder', b(103, 104, 105), 'Panel lights', 'Panel'),
  c('lthr', 'axis', ['roty'], 'Left lever', 'Axes'), c('rthr', 'axis', ['rotx'], 'Right lever', 'Axes'),
  c('lbtn', 'buttons', b(1, 2, 30, 31), 'Lever buttons', 'Axes'),
  c('b50', 'button', b(50), 'Button 50', 'Left grip'), c('h51', 'hat', b(51, 52, 53, 54, 55), 'Hat (4-way + push)', 'Left grip'),
  c('b56', 'button', b(56), 'Button 56', 'Left grip'), c('t57', 'switch', b(57, 58, 59), 'Toggle (3 pos)', 'Left grip'),
  c('rz', 'axis', ['rotz'], 'RZ wheel', 'Left grip'), c('rzb', 'switch', b(60, 61, 62), 'RZ wheel (buttons)', 'Left grip', { art: 'rz' }),
  c('sw3', 'switch', b(3, 4, 5), 'Switch (3 pos)', 'Right grip'), c('h6', 'hat', b(6, 7, 8, 9, 10), 'Hat (4-way + push)', 'Right grip'),
  c('b11', 'button', b(11), 'Button 11', 'Right grip'), c('h12', 'hat', b(12, 13, 14, 15, 16), 'Hat (4-way + push)', 'Right grip'),
  c('h17', 'hat', b(17, 18, 19, 20, 21), 'Hat (4-way + push)', 'Right grip'), c('slide', 'switch', b(22, 23, 24), 'Slide (3 pos)', 'Right grip'),
  c('wh5', 'switch', b(43, 25, 26, 27, 44), 'Wheel (5-way)', 'Right grip'), c('h28', 'hat', b(28, 29, 32, 33, 34), 'Hat (4-way + push)', 'Right grip'),
  c('mini', 'axis', ['x', 'y'], 'Ministick', 'Right grip'), c('minib', 'hat', b(36, 37, 38, 39, 35), 'Ministick (digital + press)', 'Right grip', { art: 'mini' }),
  c('zw', 'axis', ['z'], 'Z wheel', 'Right grip'), c('zwb', 'switch', b(40, 41, 42), 'Z wheel (buttons)', 'Right grip', { art: 'zw' }),
]);
tpl('winctrl-ursa-combat', {
  id: 'builtin-winctrl-ursa-combat', name: 'WinCtrl URSA MINOR throttle (Combat grip)', brand: 'WinCtrl',
  notes: 'Grip numbers from the WinCtrl grip maps; base / side panel numbers from WinCtrl material (not yet verified on a unit): if yours differ, use “Customize a copy”. Lever detents are mechanical stops (soft 18 / 22, hard 24 / 25), not finger lifts. 1-based: button N = jsX_buttonN. Uses buttons up to 81: Chrome / Edge only report the first 32, use Firefox.',
  match: [{ vendor: '4098', product: 'B970' }, { vendor: '4098', product: 'BC27' }, { name: 'URSA MINOR Combat' }, { name: 'URSA MINOR Throttle' }],
}, [
  c('keys', 'buttons', b(...range(1, 8)), 'Keys B1-B8', 'Base'), c('mode', 'switch', b(9, 10, 11), 'MODE (3 pos)', 'Base'),
  c('enc1', 'encoder', b(12, 13), 'Encoder 1', 'Base'), c('enc2', 'encoder', b(14, 15), 'Encoder 2', 'Base'),
  c('det', 'buttons', b(...range(16, 25)), 'Lever detents (soft 18 / 22, hard 24 / 25)', 'Base', { art: 'detl' }),
  c('lthr', 'axis', ['rotx'], 'Left lever', 'Axes'), c('rthr', 'axis', ['roty'], 'Right lever', 'Axes'),
  c('thw', 'encoder', b(60, 61), 'Side thumbwheel', 'Left grip'),
  c('b28', 'button', b(28), 'Button 28', 'Left grip', { art: 'b27' }), c('b29', 'button', b(29), 'Button 29', 'Left grip', { art: 'b27' }),
  c('tog33', 'switch', b(33, 34, 35), 'Toggle (3 pos)', 'Left grip'),
  c('b27', 'button', b(27), 'Button 27', 'Right grip'), c('knob30', 'switch', b(30, 31, 32), 'Knob (3 pos)', 'Right grip'),
  c('h36', 'hat', b(36, 37, 38, 39, 40), 'Hat (4-way + push)', 'Right grip'),
  c('h41', 'hat', b(42, 43, 44, 41, 45), 'Hat (4-way + push)', 'Right grip'), c('h46', 'hat', b(47, 48, 49, 46, 50), 'Hat (4-way + push)', 'Right grip'),
  c('mini', 'axis', ['slider1', 'slider2'], 'Hat axes (Dial / Slider)', 'Right grip'), c('minib', 'hat', b(52, 53, 54, 55, 51), 'Hat (4-way + push)', 'Right grip', { art: 'mini' }),
  c('rzk', 'axis', ['rotz'], 'Rz thumbwheel', 'Right grip'), c('rzkb', 'button', b(56), 'Rz thumbwheel press', 'Right grip', { art: 'rzk' }),
  c('zw', 'axis', ['z'], 'Z wheel', 'Right grip'), c('zwb', 'switch', b(58, 57, 59), 'Z wheel switch mode', 'Right grip', { art: 'zw' }),
  c('start', 'button', b(62), 'START', 'Side panel'), c('sw1', 'switch', b(63, 64, 65), 'SW1-3 (3 pos)', 'Side panel'),
  c('sw4', 'switch', b(66, 67, 68), 'SW4-6 (3 pos)', 'Side panel'), c('rk1', 'switch', b(69, 70, 71), 'Rocker 1 (3 pos)', 'Side panel'),
  c('rk2', 'switch', b(72, 73, 74), 'Rocker 2 (3 pos)', 'Side panel'), c('rudt', 'switch', b(75, 76, 77), 'Rudder trim (L / C / R)', 'Side panel'),
  c('xw', 'axis', ['x'], 'X wheel', 'Side panel'), c('xwb', 'encoder', b(78, 79), 'X wheel (buttons)', 'Side panel', { art: 'xw' }),
  c('yw', 'axis', ['y'], 'Y wheel', 'Side panel'), c('ywb', 'encoder', b(80, 81), 'Y wheel (buttons)', 'Side panel', { art: 'yw' }),
]);

/* ------------------------------------------------------------------ MOZA */
const MOZA_NOTE = 'Default numbering from the MOZA diagrams (1-based: button N = jsX_buttonN). MOZA Cockpit can change it: if yours differs, use “Customize a copy”.';
tpl('moza-ab6', {
  id: 'builtin-moza-ab6', name: 'MOZA AB6 base + MGH grip', brand: 'MOZA',
  notes: MOZA_NOTE + ' Base keys 49-56 and the wheels (slider 57-59, dial 60-62, plus their axes) per the MOZA Cockpit diagram. The base reports 128+ buttons: Chrome / Edge only report the first 32, use Firefox.',
  match: [{ vendor: '346E', product: '1002' }, { name: 'AB6' }],
}, [
  c('hat7', 'hat', b(7, 8, 9, 10, 11), 'Hat (4-way + push)', 'Grip head', { side: 'L' }),
  c('b4', 'button', b(4), 'Button 4', 'Grip head', { side: 'L' }),
  c('hat17', 'hat', b(17, 18, 19, 20, 21), 'Thumb hat (4-way + push)', 'Grip', { side: 'L' }),
  c('trig', 'switch', b(1, 6), 'Trigger (stage 1 / 2)', 'Grip', { side: 'L' }),
  c('hat25', 'hat', b(25, 26, 27, 28, 29), 'Hat (4-way + push)', 'Grip', { side: 'L' }),
  c('rock', 'switch', b(22, 24, 23), 'Rocker (up / push / down)', 'Grip', { side: 'L' }),
  c('b2', 'button', b(2), 'Pinky button', 'Grip', { side: 'L' }),
  c('hat12', 'hat', b(12, 13, 14, 15, 16), 'Hat (4-way + push)', 'Grip head', { side: 'R' }),
  c('b5', 'button', b(5), 'Button 5', 'Grip head', { side: 'R' }),
  c('b3', 'button', b(3), 'Rear button', 'Grip', { side: 'R' }),
  c('twist', 'axis', ['rotz'], 'Twist', 'Axes', { side: 'R' }),
  c('xy', 'axis', ['x', 'y'], 'Stick X / Y', 'Axes', { side: 'R' }),
  c('bkeys', 'buttons', b(49, 50, 51, 52), 'Base keys (left) 49-52', 'Base', { side: 'L' }),
  c('bkeysr', 'buttons', b(53, 54, 55, 56), 'Base keys (right) 53-56', 'Base', { side: 'R', art: 'bkeys' }),
  c('wl', 'axis', ['slider1'], 'Slider wheel (left)', 'Base', { side: 'L' }),
  c('wlb', 'switch', b(57, 58, 59), 'Slider wheel (zones)', 'Base', { side: 'L', art: 'wl' }),
  c('wr', 'axis', ['slider2'], 'Dial wheel (right)', 'Base', { side: 'R' }),
  c('wrb', 'switch', b(60, 61, 62), 'Dial wheel (zones)', 'Base', { side: 'R', art: 'wr' }),
]);
tpl('moza-mtp', {
  id: 'builtin-moza-mtp', name: 'MOZA MTP throttle', brand: 'MOZA',
  notes: MOZA_NOTE + ' Uses buttons up to 71: Chrome / Edge only report the first 32, use Firefox.',
  match: [{ name: 'MOZA MTP' }, { name: 'MTP Throttle' }],
}, [
  c('lgen', 'switch', b(21, 20), 'L GEN', 'Panel'), c('s24', 'switch', b(24, 23, 22), 'Switch (3 pos)', 'Panel'),
  c('rgen', 'switch', b(26, 25), 'R GEN', 'Panel'), c('s29', 'switch', b(29, 28, 27), 'Switch (3 pos)', 'Panel'),
  c('s31', 'switch', b(31, 30), 'Switch', 'Panel'), c('s33', 'switch', b(33, 32), 'Switch', 'Panel'),
  c('rot4', 'switch', b(34, 35, 36, 37), 'Rotary (4 pos)', 'Panel'), c('rot8', 'switch', b(...range(38, 45)), 'Rotary (8 pos)', 'Panel'),
  c('probe', 'switch', b(48, 47, 46), 'PROBE (3 pos)', 'Panel'), c('reset', 'button', b(64), 'RESET', 'Panel'),
  c('form', 'encoder', b(49, 50), 'FORMATION', 'Panel'), c('pos', 'encoder', b(51, 52), 'POSITION', 'Panel'),
  c('rtrim', 'encoder', b(62, 63, 65), 'RUD TRIM', 'Panel'), c('light', 'encoder', b(66, 67), 'LIGHT', 'Panel'),
  c('apu', 'switch', b(54, 53), 'APU', 'Panel'), c('crank', 'switch', b(55, 56, 57), 'ENG CRANK (3 pos)', 'Panel'),
  c('strobe', 'switch', b(59, 58), 'STROBE', 'Panel'), c('intr', 'switch', b(61, 60), 'INTR WING', 'Panel'),
  c('rzs', 'axis', ['rotz'], 'MIN / MAX slider', 'Panel'),
  c('lthr', 'axis', ['rotx'], 'Left lever', 'Axes'), c('rthr', 'axis', ['roty'], 'Right lever', 'Axes'),
  c('mini', 'axis', ['x', 'y'], 'Ministick', 'Grip'), c('minib', 'button', b(1), 'Ministick press', 'Grip', { art: 'mini' }),
  c('s69', 'switch', b(69, 2, 68), 'Switch (3 pos)', 'Grip'), c('b3', 'button', b(3), 'Button 3', 'Grip'), c('b4', 'button', b(4), 'Button 4', 'Grip'),
  c('s5', 'switch', b(5, 6, 7), 'Switch (3 pos)', 'Grip'), c('h11', 'hat', b(11, 12, 13, 14, 15), 'Hat (4-way + push)', 'Grip'),
  c('h70', 'hat', b(70, 10, 71, 8, 9), 'Hat (4-way + push)', 'Grip'), c('slide', 'switch', b(16, 17, 18), 'Slide (3 pos)', 'Grip'),
  c('b19', 'button', b(19), 'Button 19', 'Grip'),
]);
tpl('moza-mtq', {
  id: 'builtin-moza-mtq', name: 'MOZA MTQ throttle quadrant', brand: 'MOZA',
  notes: MOZA_NOTE + ' Grip photo follows the grip in use (combat, Airbus 66 / 67, Boeing 68-75): press one of its buttons or pick it above the picture. Uses buttons up to 75: Chrome / Edge only report the first 32, use Firefox.',
  match: [{ name: 'MOZA MTQ' }, { name: 'MTQ Throttle' }],
}, [
  c('spbrk', 'axis', ['slider2'], 'Speedbrake lever', 'Levers'), c('spbrkb', 'switch', b(43, 31), 'Speedbrake (detents)', 'Levers', { art: 'spbrk' }),
  c('lthr', 'axis', ['rotx'], 'Left throttle', 'Levers'), c('lthrb', 'switch', b(41, 33, 32), 'Left throttle (detents)', 'Levers', { art: 'lthr' }),
  c('rthr', 'axis', ['roty'], 'Right throttle', 'Levers'), c('rthrb', 'switch', b(42, 35, 34), 'Right throttle (detents)', 'Levers', { art: 'rthr' }),
  c('flaps', 'axis', ['slider1'], 'Flaps lever', 'Levers'), c('flapsb', 'switch', b(40, 39, 38, 37, 36), 'Flaps (positions)', 'Levers', { art: 'flaps' }),
  c('a14', 'buttons', b(1, 2, 3, 4), 'A1-A4', 'Panel'), c('k510', 'buttons', b(...range(5, 10)), 'Keys 5-10', 'Panel'),
  c('enc1', 'encoder', b(11, 12, 13), 'Encoder 1', 'Panel'), c('enc2', 'encoder', b(14, 15, 16), 'Encoder 2', 'Panel'),
  c('rot5', 'switch', b(17, 18, 19, 20, 21), 'Rotary (5 pos)', 'Panel'), c('s3', 'switch', b(23, 22, 24), 'Switch (3 pos)', 'Panel'),
  c('t25', 'switch', b(25, 26), 'Toggle', 'Panel'), c('t27', 'switch', b(27, 28), 'Toggle', 'Panel'), c('t29', 'switch', b(29, 30), 'Toggle', 'Panel'),
  c('h56', 'hat', b(56, 53, 55, 54, 52), 'Hat (4-way + push)', 'Right grip'), c('h61', 'hat', b(61, 58, 60, 59, 57), 'Hat (4-way + push)', 'Right grip'),
  c('slide', 'switch', b(51, 49, 50), 'Slide (3 pos)', 'Right grip'),
  c('mini', 'axis', ['x', 'y'], 'Ministick', 'Left grip'), c('minib', 'button', b(62), 'Ministick press', 'Left grip', { art: 'mini' }),
  c('b65', 'button', b(65), 'Button 65', 'Left grip', { art: 'b63' }), c('wheel', 'encoder', b(63, 64), 'Side wheel', 'Left grip', { art: 'b63' }),
  // alternative grips (on their own photos, shown instead of the combat grip once one of their buttons is pressed)
  c('ab66', 'button', b(66), 'Right grip button', 'Airbus grips', { art: 'b63' }), c('ab67', 'button', b(67), 'Left grip button', 'Airbus grips', { art: 'b63' }),
  c('ap68', 'button', b(68), 'Right AP disconnect', 'Boeing grips', { art: 'b63' }), c('toga69', 'button', b(69), 'Right TOGA', 'Boeing grips', { art: 'b63' }),
  c('rev70', 'button', b(70), 'Right reverser (finger up)', 'Boeing grips', { art: 'b63' }), c('rev71', 'button', b(71), 'Right reverser (finger normal)', 'Boeing grips', { art: 'b63' }),
  c('ap72', 'button', b(72), 'Left AP disconnect', 'Boeing grips', { art: 'b63' }), c('toga73', 'button', b(73), 'Left TOGA', 'Boeing grips', { art: 'b63' }),
  c('rev74', 'button', b(74), 'Left reverser (finger up)', 'Boeing grips', { art: 'b63' }), c('rev75', 'button', b(75), 'Left reverser (finger normal)', 'Boeing grips', { art: 'b63' }),
]);

/* ------------------------------------------------------------------ devices without published numbers: art + callout spots only */
const OPEN_NOTE = 'Callout spots without numbers (shown as “?”): the numbering depends on the device configuration and is not published. Use “Customize a copy” and type the numbers you see in the input tester.';
tpl('vkb-gladiator-scg', {
  id: 'builtin-vkb-gladiator-scg', name: 'VKB Gladiator NXT EVO (Space Combat Grip)', brand: 'VKB', notes: OPEN_NOTE,
  match: [{ name: 'Gladiator' }],
}, [
  c('a4', 'hat', u(5), 'A4 hat', 'Grip head', { side: 'L' }), c('a2', 'button', u(1), 'A2 red button', 'Grip head', { side: 'L' }),
  c('c1', 'hat', u(5), 'C1 thumb hat', 'Grip', { side: 'L' }), c('rf', 'switch', u(2), 'Rapid-fire trigger (up / down)', 'Grip', { side: 'L' }),
  c('trig', 'switch', u(2), 'Trigger (stage 1 / 2)', 'Grip', { side: 'L' }), c('d1', 'button', u(1), 'D1 pinky button', 'Grip', { side: 'L' }),
  c('thr', 'axis', [''], 'Throttle lever', 'Base', { side: 'L' }), c('sw1', 'switch', u(2), 'Sw1 switch', 'Base', { side: 'L' }),
  c('a1', 'hat', u(5), 'A1 ministick (4-way + push)', 'Grip head', { side: 'R' }), c('a1x', 'axis', ['', ''], 'A1 ministick (analog)', 'Grip head', { art: 'a1', side: 'R' }),
  c('a3', 'hat', u(5), 'A3 hat', 'Grip head', { side: 'R' }), c('b1', 'button', u(1), 'B1 side button', 'Grip', { side: 'R' }),
  c('twist', 'axis', [''], 'Twist', 'Axes', { side: 'R' }), c('xy', 'axis', ['x', 'y'], 'Stick X / Y', 'Axes', { side: 'R' }),
  c('fkeys', 'buttons', u(3), 'F1-F3', 'Base', { side: 'R' }), c('en1', 'encoder', u(2), 'En1 encoder', 'Base', { side: 'R' }),
]);
tpl('vkb-gunfighter-mcg', {
  id: 'builtin-vkb-gunfighter-mcg', name: 'VKB Gunfighter + MCG Ultimate', brand: 'VKB', notes: OPEN_NOTE,
  match: [{ name: 'Gunfighter' }],
}, [
  c('apoff', 'button', u(1), 'AP OFF (red)', 'Grip head', { side: 'L' }), c('gc', 'hat', u(5), 'GATE CONT ministick (4-way + push)', 'Grip head', { side: 'L' }),
  c('gca', 'axis', ['', ''], 'GATE CONT ministick (analog)', 'Grip head', { art: 'gc', side: 'L' }),
  c('manvr', 'hat', u(5), 'MANVR hat', 'Grip', { side: 'L' }), c('flip', 'switch', u(3), 'Flip trigger (click / stage 1 / stage 2)', 'Grip', { side: 'L' }),
  c('trig', 'switch', u(2), 'Trigger (stage 1 / 2)', 'Grip', { side: 'L' }), c('reset', 'hat', u(5), 'RESET hat', 'Grip', { side: 'L' }),
  c('brake', 'switch', u(3), 'Brake lever (pull / low / hi)', 'Grip', { side: 'L' }), c('brakea', 'axis', [''], 'Brake lever (analog)', 'Grip', { art: 'brake', side: 'L' }),
  c('lvl', 'button', u(1), 'LVLNG', 'Grip head', { side: 'R' }), c('mmode', 'hat', u(5), 'MASTER MODE hat', 'Grip head', { side: 'R' }),
  c('dc', 'hat', u(5), 'DC hat', 'Grip head', { side: 'R' }), c('gun', 'button', u(1), 'GUN button', 'Grip', { side: 'R' }),
  c('ring', 'button', u(1), 'Ring-finger button', 'Grip', { side: 'R' }), c('xy', 'axis', ['x', 'y'], 'Stick X / Y', 'Axes', { side: 'R' }),
]);
tpl('vkb-stecs', {
  id: 'builtin-vkb-stecs', name: 'VKB STECS Mk.II + STEM module', brand: 'VKB', notes: OPEN_NOTE,
  match: [{ name: 'STECS' }],
}, [
  c('mtgl', 'axis', [''], 'Left lever (MTG-L)', 'Levers'), c('mtgr', 'axis', [''], 'Right lever (MTG-R)', 'Levers'),
  c('radio', 'hat', u(5), 'RADIO hat', 'Right grip'), c('brk', 'hat', u(5), 'BRK hat', 'Right grip'), c('opex', 'hat', u(5), 'OP EXEC hat', 'Right grip'),
  c('ots', 'axis', ['', ''], 'OTS ministick', 'Right grip'), c('otsb', 'hat', u(5), 'OTS ministick (digital + press)', 'Right grip', { art: 'ots' }),
  c('senc', 'encoder', u(3), 'Side encoder', 'Right grip'), c('rew', 'buttons', u(3), 'RST / ENT / WEP', 'Right grip'),
  c('fwdr', 'switch', u(2), 'Forward trigger R', 'Right grip'), c('aftr', 'switch', u(2), 'Aft trigger R', 'Right grip'),
  c('mb1', 'hat', u(5), 'MB1 hat', 'Left grip'), c('mb2', 'hat', u(5), 'MB2 hat', 'Left grip'), c('renc', 'encoder', u(3), 'Ring-finger encoder', 'Left grip'),
  c('fwdl', 'switch', u(2), 'Forward trigger L', 'Left grip'), c('aftl', 'switch', u(2), 'Aft trigger L', 'Left grip'),
  c('mode', 'switch', u(5), 'MODE 1-5', 'Base'), c('start', 'button', u(1), 'START', 'Base'), c('sys', 'button', u(1), 'SYS', 'Base'),
  c('sw1', 'switch', u(3), 'SW1 (up / push / down)', 'STEM'), c('sw2', 'switch', u(3), 'SW2 (up / push / down)', 'STEM'),
  c('tgl', 'switch', u(2), 'Toggle', 'STEM'), c('gear', 'switch', u(2), 'Landing-gear lever', 'STEM'),
  c('en1', 'encoder', u(3), 'EN1', 'STEM'), c('en2', 'encoder', u(3), 'EN2', 'STEM'),
  c('b15', 'buttons', u(5), 'B1-B5', 'STEM'), c('a12', 'buttons', u(2), 'A1 / A2', 'STEM'), c('c1', 'button', u(1), 'C1', 'STEM'),
  c('mlev', 'axis', [''], 'STEM lever', 'STEM'),
]);

/* ------------------------------------------------------------------ Logitech */
tpl('logitech-x56-stick', {
  id: 'builtin-logitech-x56-stick', name: 'Logitech G X56 stick', brand: 'Logitech', notes: OPEN_NOTE,
  match: [{ name: 'X56 H.O.T.A.S. Stick' }, { name: 'X56 HOTAS Stick' }, { name: 'X-56 Rhino Stick' }],
}, [
  c('a', 'button', u(1), 'Fire button A (red)', 'Grip head', { side: 'L' }), c('h2', 'hat', u(4), 'Thumb hat', 'Grip', { side: 'L' }),
  c('trig', 'button', u(1), 'Trigger', 'Grip', { side: 'L' }), c('mini', 'axis', ['', ''], 'Thumb ministick', 'Grip', { side: 'L' }),
  c('d', 'button', u(1), 'Pinkie button', 'Grip', { side: 'L' }), c('fp', 'button', u(1), 'Flying pinkie', 'Grip', { side: 'L' }),
  c('pov', 'hat', u(4), 'POV hat', 'Grip head', { side: 'R' }), c('b', 'button', u(1), 'Button B', 'Grip head', { side: 'R' }),
  c('h1', 'hat', u(4), 'Hat 1', 'Grip head', { side: 'R' }), c('c', 'button', u(1), 'Button C', 'Grip', { side: 'R' }),
  c('twist', 'axis', [''], 'Twist', 'Axes', { side: 'R' }), c('xy', 'axis', ['x', 'y'], 'Stick X / Y', 'Axes', { side: 'R' }),
]);
tpl('logitech-x56-throttle', {
  id: 'builtin-logitech-x56-throttle', name: 'Logitech G X56 throttle', brand: 'Logitech', notes: OPEN_NOTE,
  match: [{ name: 'X56 H.O.T.A.S. Throttle' }, { name: 'X56 HOTAS Throttle' }, { name: 'X-56 Rhino Throttle' }],
}, [
  c('mode', 'switch', u(3), 'Mode switch (M1 / M2 / S1)', 'Base'), c('rty3', 'axis', [''], 'Rotary 3', 'Base'), c('rty4', 'axis', [''], 'Rotary 4', 'Base'),
  c('hat2', 'hat', u(4), 'Hat 2', 'Right grip'), c('hat1', 'hat', u(4), 'Hat 1', 'Right grip'), c('slider', 'switch', u(2), 'Slider (2 pos)', 'Right grip'),
  c('mini', 'axis', ['', ''], 'Ministick', 'Right grip'), c('thumb', 'button', u(1), 'Thumb button', 'Right grip'),
  c('rty1', 'axis', [''], 'Rotary 1', 'Right grip'), c('rty2', 'axis', [''], 'Rotary 2', 'Right grip'),
  c('lthr', 'axis', [''], 'Left throttle', 'Axes'), c('rthr', 'axis', [''], 'Right throttle', 'Axes'),
  c('lbtn', 'button', u(1), 'Left grip button', 'Left grip'),
  c('sw', 'buttons', u(6), 'SW 1-6', 'Base'), c('tgl', 'buttons', u(8), 'TGL 1-4 (up / down)', 'Base'),
]);


export const DEVICE_TEMPLATES: DeviceTemplate[] = ALL;
