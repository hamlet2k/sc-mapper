// Device-specific built-in templates: original holographic wireframe art generated from procedural 3D models (scripts/devices/*.mjs,
// no vendor artwork) with callouts at the real controls and the button / axis / hat numbers the device reports (DirectInput, as the
// browser and the game see them: button N = jsX_buttonN). Loaded lazily (own chunk) by useTemplates; the generic stick / throttle /
// gamepad stay the fallback for every other device.
import type { Callout, CalloutKind, DeviceTemplate, TemplateView } from './templates';
import type { DeviceArt } from './deviceArtTypes';
import { DEVICE_ART, DEVICE_SVG } from './deviceArt';
import { DEVICE_PHOTO_LAYOUTS, type DevicePhotoLayout } from './devicePhotoLayouts';
import { DEVICE_PHOTO_SIZES } from './devicePhotoSizes';
import { PHOTO_LABEL_GUTTER, pageSizeForPhoto } from './templatePages';

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

/**
 * A built-in that only has photos (and optional callouts placed on them): used for devices we have a cut-out picture of but no
 * SVG art yet. Empty callouts are fine — the picture still shows so users can Customize a copy and place their own.
 * The layout must already be in DEVICE_PHOTO_LAYOUTS (looked up by `meta.id`).
 */
function photoTpl(meta: Meta & { id: string }, specs: Spec[] = []): void {
  const layout = photoLayoutFor(meta.id);
  if (!layout) { PHOTO_LAYOUT_PROBLEMS.push(`${meta.id}: no photo layout`); return; }
  const stub: DeviceTemplate = {
    version: 1, builtin: true, slot: 'js', ...meta, aspect: 1,
    callouts: specs.map((sp) => ({
      id: sp.id, kind: sp.kind, inputs: sp.inputs, anchor: { x: 0.5, y: 0.5 }, box: { x: 0.5, y: 0.5 },
      ...(sp.label ? { label: sp.label } : {}), ...(sp.group ? { group: sp.group } : {}),
    })),
  };
  const r = withPhotoLayout(stub, layout);
  if (Array.isArray(r)) PHOTO_LAYOUT_PROBLEMS.push(`${meta.id}: ${r.join('; ')}`);
  else ALL.push(r);
}

/**
 * Photo built-in with callouts already placed (anchor + box fractions as authored). Skips withPhotoLayout's
 * auto box layout so exported positions stay exact. Each view's `photo` must be a key of DEVICE_PHOTO_SIZES.
 */
function photoTplExact(
  meta: Meta & { id: string },
  photo: string,
  viewId: string,
  viewLabel: string,
  width: number,
  height: number,
  callouts: Callout[],
): void {
  photoTplExactViews(meta, [{ id: viewId, label: viewLabel, photo, width, height }], callouts);
}
function photoTplExactViews(
  meta: Meta & { id: string },
  views: { id: string; label: string; photo: string; width: number; height: number }[],
  callouts: Callout[],
): void {
  for (const v of views) {
    if (!DEVICE_PHOTO_SIZES[v.photo]) { PHOTO_LAYOUT_PROBLEMS.push(`${meta.id}: unknown photo “${v.photo}”`); return; }
  }
  const { width, height } = views[0]!;
  ALL.push({
    version: 1, builtin: true, slot: 'js', ...meta,
    aspect: width / height,
    views: views.map((v) => ({ id: v.id, label: v.label, image: `/device-photos/${v.photo}.webp`, width: v.width, height: v.height })),
    callouts,
  });
}

/* ------------------------------------------------------------------ photo templates */
/** @deprecated use PHOTO_LABEL_GUTTER from templatePages — kept as alias for call sites */
export const PHOTO_GUTTER = PHOTO_LABEL_GUTTER;
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
    const canvas = pageSizeForPhoto(pw, ph);
    views.push({ id: v.id, label: v.label, image: `/device-photos/${v.photo}.webp`, width: canvas.width, height: canvas.height, ...(v.swap ? { swap: v.swap } : {}) });
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
    const side = (c: Callout): 'L' | 'R' | undefined => anchors[c.id].side === 'L' || anchors[c.id].side === 'R' ? anchors[c.id].side : byMiddle && !lopsided ? undefined : anchors[c.id].x < mid || (anchors[c.id].x === mid && rank.get(c.id)! < on.length / 2) ? 'L' : 'R';
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

// Thrustmaster HOTAS Warthog throttle: exact callouts from Federico's export (2026-10-07) — photoTplExactViews, not withPhotoLayout.
photoTplExactViews({
  id: 'builtin-tm-warthog-throttle', name: 'Thrustmaster HOTAS Warthog throttle', brand: 'Thrustmaster', notes: TM_NOTE,
  match: [{ vendor: '044F', product: '0404' }, { name: 'Throttle - HOTAS Warthog' }],
}, [
  { id: 'top', label: 'Grips and panel (rear)', photo: 'tm-warthog-throttle-top', width: 1819, height: 1187 },
  { id: 'front', label: 'Levers', photo: 'tm-warthog-throttle-front', width: 2226, height: 1327 },
], [
  { id: 'mic', kind: 'hat', inputs: b(3, 4, 5, 6, 2), label: "MIC switch (4-way + push)", group: 'Right grip', view: 'top',
    anchor: { x: 0.33825927070347916, y: 0.1165655458307657 }, box: { x: 0.08513145412192599, y: 0.13434909113357574 } },
  { id: 'spdbrk', kind: 'switch', inputs: b(7, 8), label: "Speedbrake (fwd / aft)", group: 'Right grip', view: 'top',
    anchor: { x: 0.3346328251165146, y: 0.217709418666209 }, box: { x: 0.09383499546690843, y: 0.2399388449948133 } },
  { id: 'boat', kind: 'switch', inputs: b(9, 10), label: "Boat switch (fwd / aft)", group: 'Right grip', view: 'top',
    anchor: { x: 0.32737987860699513, y: 0.265502719192121 }, box: { x: 0.09093381962988016, y: 0.3299680470652203 } },
  { id: 'china', kind: 'switch', inputs: b(11, 12), label: "China hat (fwd / aft)", group: 'Right grip', view: 'top',
    anchor: { x: 0.3237534053522354, y: 0.3277450959525067 }, box: { x: 0.09456029288463991, y: 0.42888896878795 } },
  { id: 'coolie', kind: 'hat', inputs: hat(1), label: "Coolie hat (8-way POV)", group: 'Right grip', view: 'top',
    anchor: { x: 0.47098821396192203, y: 0.19547999233760466 }, box: { x: 0.8184043074994334, y: 0.5800490508627529 } },
  { id: 'slew', kind: 'axis', inputs: ['x',  'y'], label: "Slew control", group: 'Right grip', view: 'top',
    anchor: { x: 0.5203082723608907, y: 0.1943685379808808 }, box: { x: 0.8452402981216002, y: 0.4011021858771946 } },
  { id: 'slewb', kind: 'button', inputs: b(1), label: "Slew press", group: 'Right grip', view: 'top',
    anchor: { x: 0.5210335559447247, y: 0.19659148909359442 }, box: { x: 0.8379873516120807, y: 0.30662712398062625 } },
  { id: 'rthr', kind: 'axis', inputs: ['z'], label: "Right throttle", group: 'Axes', view: 'front',
    anchor: { x: 0.4939163266026022, y: 0.10699478206808168 }, box: { x: 0.2939163614135278, y: 0.04576379042938595 } },
  { id: 'roff', kind: 'button', inputs: b(29), label: "Right throttle OFF (idle cutoff)", group: 'Axes', view: 'front',
    anchor: { x: 0.4954372739610563, y: 0.48075903420278754 }, box: { x: 0.7714828665265565, y: 0.17077707516297885 } },
  { id: 'pinky', kind: 'switch', inputs: b(13, 14), label: "Pinky switch (fwd / aft)", group: 'Left grip', view: 'front',
    anchor: { x: 0.36539926275101, y: 0.3034442399341622 }, box: { x: 0.115, y: 0.3558001130369254 } },
  { id: 'ltb', kind: 'button', inputs: b(15), label: "Left throttle button", group: 'Left grip', view: 'top',
    anchor: { x: 0.6349047940099445, y: 0.17769646823442758 }, box: { x: 0.846690865289268, y: 0.03542814821121313 } },
  { id: 'lthr', kind: 'axis', inputs: ['rotz'], label: "Left throttle", group: 'Axes', view: 'front',
    anchor: { x: 0.38441066959511644, y: 0.1682257980377913 }, box: { x: 0.115, y: 0.08443914845516201 } },
  { id: 'loff', kind: 'button', inputs: b(30), label: "Left throttle OFF (idle cutoff)", group: 'Axes', view: 'front',
    anchor: { x: 0.43460077205991565, y: 0.49989372213125666 }, box: { x: 0.1418251066606761, y: 0.5713298709327304 } },
  { id: 'flaps', kind: 'switch', inputs: b(22, 23), label: "Flaps (UP / DN, MVR = none)", group: 'Panel', view: 'front',
    anchor: { x: 0.40646385511971245, y: 0.6593494062064719 }, box: { x: 0.17148288393201938, y: 0.7779845102926028 } },
  { id: 'ff', kind: 'buttons', inputs: b(16, 17), label: "Fuel flow L / R (NORM)", group: 'Panel', view: 'top',
    anchor: { x: 0.44197642792384406, y: 0.6589635821681238 }, box: { x: 0.24759746700228072, y: 0.9034872717827712 } },
  { id: 'eol', kind: 'switch', inputs: b(31, 18), label: "Engine operate L (IGN / MOTOR)", group: 'Panel', view: 'top',
    anchor: { x: 0.4434269950915118, y: 0.5833834987314563 }, box: { x: 0.8626473254759747, y: 0.7978974967219008 } },
  { id: 'eor', kind: 'switch', inputs: b(32, 19), label: "Engine operate R (IGN / MOTOR)", group: 'Panel', view: 'top',
    anchor: { x: 0.3592928266482038, y: 0.5900523096703313 }, box: { x: 0.13372620126926563, y: 0.6989765325999052 } },
  { id: 'apu', kind: 'button', inputs: b(20), label: "APU start", group: 'Panel', view: 'top',
    anchor: { x: 0.3839528558476881, y: 0.5333672894920967 }, box: { x: 0.08875792737668574, y: 0.5822720443747326 } },
  { id: 'lgsil', kind: 'button', inputs: b(21), label: "L/G horn silence", group: 'Panel', view: 'front',
    anchor: { x: 0.6193916117737048, y: 0.5624003401670392 }, box: { x: 0.8870721969314401, y: 0.44376528474293603 } },
  { id: 'frict', kind: 'axis', inputs: ['slider1'], label: "Friction slider", group: 'Panel', view: 'front',
    anchor: { x: 0.6254752851711026, y: 0.47693210634949923 }, box: { x: 0.8102661829031013, y: 0.3289571571721211 } },
  { id: 'eac', kind: 'button', inputs: b(24), label: "EAC (ARM)", group: 'Panel', view: 'front',
    anchor: { x: 0.5365019243479682, y: 0.6912405527539204 }, box: { x: 0.387452448275606, y: 0.9221325316166927 } },
  { id: 'rdr', kind: 'button', inputs: b(25), label: "Radar altimeter (NRM)", group: 'Panel', view: 'front',
    anchor: { x: 0.5950570342205324, y: 0.6695546120312776 }, box: { x: 0.7813688212927756, y: 0.8787605528473516 } },
  { id: 'apeng', kind: 'button', inputs: b(26), label: "Autopilot engage", group: 'Panel', view: 'front',
    anchor: { x: 0.6490494180541528, y: 0.6325608625714261 }, box: { x: 0.8802281368821293, y: 0.7869139923962661 } },
  { id: 'apsel', kind: 'switch', inputs: b(27, 28), label: "Autopilot PATH / ALT", group: 'Panel', view: 'front',
    anchor: { x: 0.6931559051397636, y: 0.6147018010400438 }, box: { x: 0.9060836037755465, y: 0.593015860317401 } },
]);

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
  c('trim', 'hat', [...hat(1), ...b(19)], 'Trim hat (8-way POV)', 'Grip head', { side: 'R' }),
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
  c('trim', 'hat', [...hat(1), ...b(19)], 'Trim hat (8-way POV)', 'Grip head', { side: 'R' }),
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
// WinCtrl URSA MINOR Combat: exact callouts from Federico's export (2026-10-06) — photoTplExactViews.
photoTplExactViews({
  id: 'builtin-winctrl-ursa-combat', name: 'WinCtrl URSA MINOR throttle (Combat grip)', brand: 'WinCtrl',
  notes: 'Grip numbers from the WinCtrl grip maps; base from published export. Lever detents soft 18/22, hard 24/25. Buttons to 81: use Firefox (Chrome caps at 32). Customize a copy if yours differ.',
  match: [{ vendor: '4098', product: 'B970' }, { vendor: '4098', product: 'BC27' }, { name: 'URSA MINOR Combat' }, { name: 'URSA MINOR Throttle' }],
}, [
  { id: 'base', label: 'Base and side panel', photo: 'winctrl-ursa-combat-front', width: 2284, height: 1423 },
  { id: 'grip', label: 'Grips (rear) and levers', photo: 'winctrl-ursa-combat-front', width: 2284, height: 1423 },
  { id: 'back', label: 'Grips (front)', photo: 'winctrl-ursa-combat-back', width: 2176, height: 1243 },
], [
  { id: 'keys', kind: 'buttons', inputs: ["button1","button2","button3","button4","button5","button6","button7","button8"], label: "Keys B1-B8", group: "Base", view: 'base',
    anchor: { x: 0.40608581436077057, y: 0.604 }, box: { x: 0.2741444808901943, y: 0.37700249194030516 } },
  { id: 'mode', kind: 'switch', inputs: ["button9","button10","button11"], label: "MODE (3 pos)", group: "Base", view: 'base',
    anchor: { x: 0.2802408056042031, y: 0.616 }, box: { x: 0.09543725655559351, y: 0.43436908094336146 } },
  { id: 'enc1', kind: 'encoder', inputs: ["button12","button13"], label: "Encoder 1", group: "Base", view: 'base',
    anchor: { x: 0.34034588441330993, y: 0.687 }, box: { x: 0.10228137462311371, y: 0.6760412883592118 } },
  { id: 'enc2', kind: 'encoder', inputs: ["button14","button15"], label: "Encoder 2", group: "Base", view: 'base',
    anchor: { x: 0.3779115586690017, y: 0.72 }, box: { x: 0.11368821872957759, y: 0.8151858898070702 } },
  { id: 'det', kind: 'buttons', inputs: ["button16","button17","button18","button19","button20","button21","button22","button23","button24","button25"], label: "Lever detents (soft 18 / 22, hard 24 / 25)", group: "Base", view: 'grip',
    anchor: { x: 0.5106463994363415, y: 0.4783095034557513 }, box: { x: 0.7859315473317193, y: 0.8457000527069586 } },
  { id: 'lthr', kind: 'axis', inputs: ["rotx"], label: "Left lever", group: "Axes", view: 'grip',
    anchor: { x: 0.43764260875861455, y: 0.5210293315155952 }, box: { x: 0.08250950860433252, y: 0.5625285651228928 } },
  { id: 'rthr', kind: 'axis', inputs: ["roty"], label: "Right lever", group: "Axes", view: 'grip',
    anchor: { x: 0.5038022813688213, y: 0.5783959670795689 }, box: { x: 0.0817490494296578, y: 0.6455271254593234 } },
  { id: 'thw', kind: 'encoder', inputs: ["button60","button61"], label: "Side thumbwheel", group: "Left grip", view: 'grip',
    anchor: { x: 0.45969579428321056, y: 0.24274017518079605 }, box: { x: 0.18745248308653162, y: 0.21466710806416467 } },
  { id: 'b28', kind: 'button', inputs: ["button28"], label: "Button 28", group: "Left grip", view: 'back',
    anchor: { x: 0.44414062499999996, y: 0.306 }, box: { x: 0.637642573947689, y: 0.8651541709815826 } },
  { id: 'b29', kind: 'button', inputs: ["button29"], label: "Button 29", group: "Left grip", view: 'back',
    anchor: { x: 0.47174172794117647, y: 0.318 }, box: { x: 0.7486691783136288, y: 0.7346904107908312 } },
  { id: 'tog33', kind: 'switch', inputs: ["button33","button34","button35"], label: "Toggle (3 pos)", group: "Left grip", view: 'back',
    anchor: { x: 0.5604595588235294, y: 0.298 }, box: { x: 0.885, y: 0.18542665593993024 } },
  { id: 'b27', kind: 'button', inputs: ["button27"], label: "Button 27", group: "Right grip", view: 'grip',
    anchor: { x: 0.6389929947460595, y: 0.295 }, box: { x: 0.23992394857080263, y: 0.3135330237963537 } },
  { id: 'knob30', kind: 'switch', inputs: ["button30","button31","button32"], label: "Knob (3 pos)", group: "Right grip", view: 'grip',
    anchor: { x: 0.7241418563922942, y: 0.286 }, box: { x: 0.885, y: 0.45459170765987345 } },
  { id: 'h36', kind: 'hat', inputs: ["button36","button37","button38","button39","button40"], label: "Hat (4-way + push)", group: "Right grip", view: 'grip',
    anchor: { x: 0.6177057793345009, y: 0.356 }, box: { x: 0.1844106463878327, y: 0.419722320000149 } },
  { id: 'h41', kind: 'hat', inputs: ["button42","button43","button44","button41","button45"], label: "Hat (4-way + push)", group: "Right grip", view: 'grip',
    anchor: { x: 0.6834457092819615, y: 0.345 }, box: { x: 0.8863118102795271, y: 0.6613944342941644 } },
  { id: 'h46', kind: 'hat', inputs: ["button47","button48","button49","button46","button50"], label: "Hat (4-way + push)", group: "Right grip", view: 'grip',
    anchor: { x: 0.6728021015761821, y: 0.247 }, box: { x: 0.2665399181525517, y: 0.07796367224093971 } },
  { id: 'mini', kind: 'axis', inputs: ["slider1","slider2"], label: "Hat axes (Dial / Slider)", group: "Right grip", view: 'back',
    anchor: { x: 0.27721966911764706, y: 0.24499999999999997 }, box: { x: 0.09771861957506535, y: 0.31800532659360053 } },
  { id: 'minib', kind: 'hat', inputs: ["button52","button53","button54","button55","button51"], label: "Hat (4-way + push)", group: "Right grip", view: 'back',
    anchor: { x: 0.27718631758889317, y: 0.24478589214450341 }, box: { x: 0.11520913707892705, y: 0.5243510054956015 } },
  { id: 'rzk', kind: 'axis', inputs: ["rotz"], label: "Rz thumbwheel", group: "Right grip", view: 'back',
    anchor: { x: 0.22091254172669617, y: 0.1356223615363958 }, box: { x: 0.08022813108030834, y: 0.08902817597787946 } },
  { id: 'rzkb', kind: 'button', inputs: ["button56"], label: "Rz thumbwheel press", group: "Right grip", view: 'back',
    anchor: { x: 0.21863117870722434, y: 0.13695360366747203 }, box: { x: 0.6216730038022814, y: 0.061071659564406446 } },
  { id: 'zw', kind: 'axis', inputs: ["z"], label: "Z wheel", group: "Right grip", view: 'back',
    anchor: { x: 0.3337362132352941, y: 0.258 }, box: { x: 0.17984792034888902, y: 0.7466717931050453 } },
  { id: 'zwb', kind: 'switch', inputs: ["button58","button57","button59"], label: "Z wheel switch mode", group: "Right grip", view: 'back',
    anchor: { x: 0.3334600644419855, y: 0.25942975872087 }, box: { x: 0.3053232055199917, y: 0.8811292796890254 } },
  { id: 'start', kind: 'button', inputs: ["button62"], label: "START", group: "Side panel", view: 'base',
    anchor: { x: 0.7266462346760071, y: 0.489 }, box: { x: 0.9152091718898526, y: 0.33428266388046135 } },
  { id: 'sw1', kind: 'switch', inputs: ["button63","button64","button65"], label: "SW1-3 (3 pos)", group: "Side panel", view: 'base',
    anchor: { x: 0.6803152364273205, y: 0.5 }, box: { x: 0.8901140916483484, y: 0.09993388349713464 } },
  { id: 'sw4', kind: 'switch', inputs: ["button66","button67","button68"], label: "SW4-6 (3 pos)", group: "Side panel", view: 'base',
    anchor: { x: 0.6283493870402802, y: 0.558 }, box: { x: 0.27110267320060005, y: 0.08650764716509197 } },
  { id: 'rk1', kind: 'switch', inputs: ["button69","button70","button71"], label: "Rocker 1 (3 pos)", group: "Side panel", view: 'base',
    anchor: { x: 0.557600700525394, y: 0.673 }, box: { x: 0.7045627492462274, y: 0.8688907420134058 } },
  { id: 'rk2', kind: 'switch', inputs: ["button72","button73","button74"], label: "Rocker 2 (3 pos)", group: "Side panel", view: 'base',
    anchor: { x: 0.521913309982487, y: 0.707 }, box: { x: 0.5387832583583353, y: 0.9128312110867132 } },
  { id: 'rudt', kind: 'switch', inputs: ["button75","button76","button77"], label: "Rudder trim (L / C / R)", group: "Side panel", view: 'base',
    anchor: { x: 0.4279991243432575, y: 0.778 }, box: { x: 0.2019011348825897, y: 0.9262574241382971 } },
  { id: 'xw', kind: 'axis', inputs: ["x"], label: "X wheel", group: "Side panel", view: 'base',
    anchor: { x: 0.7395437262357415, y: 0.5820576107544545 }, box: { x: 0.9053232171236335, y: 0.5332349966755505 } },
  { id: 'xwb', kind: 'encoder', inputs: ["button78","button79"], label: "X wheel (buttons)", group: "Side panel", view: 'base',
    anchor: { x: 0.7410464098073555, y: 0.585 }, box: { x: 0.9022813224067253, y: 0.6186746062343206 } },
  { id: 'yw', kind: 'axis', inputs: ["y"], label: "Y wheel", group: "Side panel", view: 'base',
    anchor: { x: 0.6728021015761821, y: 0.644 }, box: { x: 0.9053232171236335, y: 0.728525592673919 } },
  { id: 'ywb', kind: 'encoder', inputs: ["button80","button81"], label: "Y wheel (buttons)", group: "Side panel", view: 'base',
    anchor: { x: 0.6787072243346007, y: 0.6540710538225583 }, box: { x: 0.8992395437262357, y: 0.810303605118721 } },
]);

/* ------------------------------------------------------------------ MOZA */
const MOZA_NOTE = 'Default numbering from the MOZA diagrams (1-based: button N = jsX_buttonN). MOZA Cockpit can change it: if yours differs, use “Customize a copy”.';
// MOZA AB6 + MHG: exact callouts from Federico's export (2026-10-06) — photoTplExact, not withPhotoLayout.
photoTplExactViews({
  id: 'builtin-moza-ab6', name: 'MOZA AB6 base + MHG grip', brand: 'MOZA',
  notes: MOZA_NOTE + ' MHG 1-24, ministick 25-29, base 49-62. Positions from published export. 128+ buttons: Chrome / Edge cap at 32 — use Firefox.',
  match: [{ vendor: '346E', product: '1002' }, { name: 'AB6' }, { name: 'MOZA AB6' }],
}, [
  { id: 'front', label: 'Front', photo: 'moza-ab6-front', width: 1594, height: 990 },
  { id: 'back', label: 'Back', photo: 'moza-ab6-back', width: 1594, height: 990 },
], [
  { id: 'b2', kind: 'button', inputs: b(2), label: 'Button 2', group: 'Grip head', view: 'front',
    anchor: { x: 0.4429657794676806, y: 0.11616457568739635 }, box: { x: 0.29884200810005684, y: 0.0521026303093653 } },
  { id: 'hat7', kind: 'hat', inputs: b(7, 8, 9, 10, 11), label: 'Hat (4-way + push)', group: 'Grip head', view: 'front',
    anchor: { x: 0.4490494528650784, y: 0.17126240257852568 }, box: { x: 0.2611249067055676, y: 0.17214708206189713 } },
  { id: 'hat17', kind: 'hat', inputs: b(17, 18, 19, 20, 21), label: 'Thumb hat (4-way + push)', group: 'Grip', view: 'back',
    anchor: { x: 0.5310612597066436, y: 0.2365825319836805 }, box: { x: 0.7491803173364701, y: 0.14878443232936364 } },
  { id: 'trig', kind: 'switch', inputs: b(1, 6), label: 'Trigger (stage 1 / 2)', group: 'Grip', view: 'back',
    anchor: { x: 0.4291272885789015, y: 0.21700000000000003 }, box: { x: 0.2653149266609146, y: 0.46885854531921956 } },
  { id: 'b3', kind: 'button', inputs: b(3), label: 'Rear button', group: 'Grip', view: 'back',
    anchor: { x: 0.4848145163192947, y: 0.3410511788914619 }, box: { x: 0.7105263157894737, y: 0.4566334674410995 } },
  { id: 'mini', kind: 'axis', inputs: ['rotx', 'roty'], label: 'Ministick (RX / RY)', group: 'Grip head', view: 'front',
    anchor: { x: 0.47490491975849575, y: 0.1222865564530774 }, box: { x: 0.6958643406062603, y: 0.42557426740640414 } },
  { id: 'minib', kind: 'hat', inputs: b(25, 26, 27, 28, 29), label: 'Ministick buttons (4-way + push)', group: 'Grip head', view: 'front',
    anchor: { x: 0.47262358574812857, y: 0.12106215562924053 }, box: { x: 0.6899089955218672, y: 0.5244998117809441 } },
  { id: 'hat12', kind: 'hat', inputs: b(12, 13, 14, 15, 16), label: 'Hat (4-way + push)', group: 'Grip head', view: 'front',
    anchor: { x: 0.5015208893402447, y: 0.09290105344850907 }, box: { x: 0.6799834372092122, y: 0.0320952075502003 } },
  { id: 'b5', kind: 'button', inputs: b(5), label: 'Button 5', group: 'Grip head', view: 'front',
    anchor: { x: 0.5015208893402447, y: 0.1406524987501205 }, box: { x: 0.693217514959419, y: 0.2010466573796668 } },
  { id: 'b4', kind: 'button', inputs: b(4), label: 'Button 4', group: 'Grip head', view: 'back',
    anchor: { x: 0.39370145624932595, y: 0.0943273847866357 }, box: { x: 0.2680759380561098, y: 0.0487612759945968 } },
  { id: 'rock', kind: 'switch', inputs: b(22, 24, 23), label: 'Rocker (up / push / down)', group: 'Grip head', view: 'back',
    anchor: { x: 0.3750647214901046, y: 0.13544802420333008 }, box: { x: 0.203882646930948, y: 0.22991433851949877 } },
  { id: 'twist', kind: 'axis', inputs: ['z', 'rotz'], label: 'Twist (Z / RZ)', group: 'Axes', view: 'front',
    anchor: { x: 0.5053231707090661, y: 0.5900058495855034 }, box: { x: 0.2710504650182227, y: 0.5267228658210561 } },
  { id: 'xy', kind: 'axis', inputs: ['x', 'y'], label: 'Stick X / Y', group: 'Axes', view: 'front',
    anchor: { x: 0.5015208893402447, y: 0.4345075755028103 }, box: { x: 0.2928866882576639, y: 0.355548340750863 } },
  { id: 'bkeys', kind: 'buttons', inputs: b(49, 50, 51, 52), label: 'Base keys (left) 49-52', group: 'Base', view: 'back',
    anchor: { x: 0.43787748058671266, y: 0.5611021143488809 }, box: { x: 0.19076790863116103, y: 0.8400555667243724 } },
  { id: 'bkeysr', kind: 'buttons', inputs: b(53, 54, 55, 56), label: 'Base keys (right) 53-56', group: 'Base', view: 'back',
    anchor: { x: 0.5579810286514506, y: 0.5944431664604699 }, box: { x: 0.7830025884383088, y: 0.8578374442257505 } },
  { id: 'wl', kind: 'axis', inputs: ['slider1'], label: 'Slider wheel (left)', group: 'Base', view: 'front',
    anchor: { x: 0.5304182509505704, y: 0.6793868061300518 }, box: { x: 0.2882547559966915, y: 0.7556965415267886 } },
  { id: 'wlb', kind: 'switch', inputs: b(57, 58, 59), label: 'Slider wheel (zones)', group: 'Base', view: 'front',
    anchor: { x: 0.5288973616103255, y: 0.6793868061300518 }, box: { x: 0.3444995864350703, y: 0.9124212365368678 } },
  { id: 'wr', kind: 'axis', inputs: ['slider2'], label: 'Dial wheel (right)', group: 'Base', view: 'front',
    anchor: { x: 0.5958174788906547, y: 0.6438792990062991 }, box: { x: 0.7726219814606596, y: 0.7468043253663402 } },
  { id: 'wrb', kind: 'switch', inputs: b(60, 61, 62), label: 'Dial wheel (zones)', group: 'Base', view: 'front',
    anchor: { x: 0.59429658955041, y: 0.6451036764766327 }, box: { x: 0.7626964231480046, y: 0.921313452697316 } },
]);

// MOZA AB6 base fitted with other grips: grip variants of the AB6 above (same USB id 346E:1002 and button count whatever grip is
// fitted, so they have no match rules and are never picked automatically; the template pickers list them under the AB6).
// Base controls keep the AB6's numbers (keys 49-56, levers S1 / S2 + zones 57-62).
const AB6_GRIP_NOTE = 'Never picked automatically (same USB id 346E:1002 as the plain AB6): pick it under “Grips for this base”. Base 49-62, S1, S2 as on the AB6. Buttons above 32: use Firefox.';
const AB6_WC_NOTE = 'WinCtrl grip on the MOZA adaptor: numbers as on the WinCtrl template (check in the input tester). Paddle axis, if on, replaces base lever S1.';
const ab6Base = (): Spec[] => [
  c('bkeys', 'buttons', b(49, 50, 51, 52), 'Base keys (left) 49-52', 'Base'),
  c('bkeysr', 'buttons', b(53, 54, 55, 56), 'Base keys (right) 53-56', 'Base'),
  c('wl', 'axis', ['slider1'], 'Slider wheel (left)', 'Base'),
  c('wlb', 'switch', b(57, 58, 59), 'Slider wheel (zones)', 'Base'),
  c('wr', 'axis', ['slider2'], 'Dial wheel (right)', 'Base'),
  c('wrb', 'switch', b(60, 61, 62), 'Dial wheel (zones)', 'Base'),
];
photoTpl({
  id: 'builtin-moza-ab6-mh16', name: 'MOZA AB6 base + MH16 grip', brand: 'MOZA', variantOf: 'builtin-moza-ab6', match: [],
  notes: 'MOZA Cockpit MH16 diagram, trim in Button mode (D-pad mode: trim = POV 1). TMS / DMS / trim: no push; paddle: button only; twist only with the Z module. Numbers differ? “Customize a copy”. ' + AB6_GRIP_NOTE,
}, [
  c('castle', 'hat', b(20, 21, 22, 23, 24), 'Module hat (4-way + push)', 'Side module'),
  c('msw', 'switch', b(25, 26), 'Module switch (25 / centre / 26)', 'Side module'),
  c('wpn', 'button', b(2), 'WPN REL', 'Grip head'),
  c('trim', 'hat', b(28, 29, 30, 31), 'Trim hat (Button mode)', 'Grip head'),
  c('trimpov', 'hat', hat(1), 'Trim hat as POV (D-pad mode)', 'Grip head'),
  c('tms', 'hat', b(7, 8, 9, 10), 'TMS hat (4-way)', 'Grip head'),
  c('dms', 'hat', b(11, 12, 13, 14), 'DMS hat (4-way)', 'Grip head'),
  c('cms', 'hat', b(15, 16, 17, 18, 19), 'CMS hat (4-way + push)', 'Grip'),
  c('nws', 'button', b(5), 'NWS / A/R DISC / MSL STEP', 'Grip head'),
  c('trig', 'switch', b(1, 6), 'Trigger (stage 1 / 2)', 'Grip'),
  c('fov', 'button', b(3), 'Expand / FOV', 'Grip'),
  c('paddle', 'button', b(4), 'Paddle switch', 'Grip'),
  c('xy', 'axis', ['x', 'y'], 'Stick X / Y', 'Axes'),
  ...ab6Base(),
]);
photoTpl({
  id: 'builtin-moza-ab6-carrierace', name: 'MOZA AB6 base + WinCtrl CarrierAce grip', brand: 'MOZA', variantOf: 'builtin-moza-ab6', match: [],
  notes: AB6_WC_NOTE + ' Not on MOZA’s supported-grip list: check your AB6 firmware. ' + AB6_GRIP_NOTE,
}, [
  c('wpn', 'button', b(20), 'Weapon release', 'Grip head'),
  c('hatC', 'hat', b(22, 23, 24, 25, 21), 'Hat C (4-way + push)', 'Grip head'),
  c('sel5', 'switch', b(1, 2, 26, 27, 3), '5-way switch', 'Grip head'),
  c('trim', 'hat', [...hat(1), ...b(19)], 'Trim hat (8-way POV)', 'Grip head'),
  c('hatB', 'hat', b(15, 16, 17, 18, 14), 'Hat B (4-way + push)', 'Grip head'),
  c('hatA', 'hat', b(10, 11, 12, 13, 9), 'Hat A (4-way + push)', 'Grip'),
  c('trig', 'switch', b(4, 5), 'Trigger (stage 1 / 2)', 'Grip'),
  c('paddle', 'switch', b(7, 8), 'Paddle (stage 1 / 2)', 'Grip'),
  c('rear', 'button', b(6), 'Rear button', 'Grip'),
  c('xy', 'axis', ['x', 'y'], 'Stick X / Y', 'Axes'),
  ...ab6Base(),
]);
// MOZA AB6 + WinCtrl ViperAce EX: exact callouts from Federico's export (2026-10-07) — photoTplExactViews, not withPhotoLayout.
// Canvases = pageSizeForPhoto of each photo (548x986 -> 1140x986, 1136x1430 -> 1994x1430), same as the export.
photoTplExactViews({
  id: 'builtin-moza-ab6-viperace', name: 'MOZA AB6 base + WinCtrl ViperAce EX grip', brand: 'MOZA', variantOf: 'builtin-moza-ab6', match: [],
  notes: AB6_WC_NOTE + ' Wheel / EX trigger 1 / 2 / 41 / 42 / 3 (SimAppPro: 42 / 43). ' + AB6_GRIP_NOTE,
}, [
  { id: 'front', label: 'Front (on the AB6)', photo: 'moza-ab6-viperace-front', width: 1140, height: 986 },
  { id: 'side', label: 'Grip, labelled side', photo: 'winctrl-viperace-side', width: 1994, height: 1430 },
], [
  { id: 'cms', kind: 'hat', inputs: b(22, 23, 24, 25, 21), label: "Thumb hat (4-way + push)", group: 'Side module', view: 'front',
    anchor: { x: 0.43750877192982457, y: 0.135 }, box: { x: 0.125, y: 0.13731744421906694 } },
  { id: 'wpn', kind: 'button', inputs: b(20), label: "Weapon release", group: 'Grip head', view: 'front',
    anchor: { x: 0.48077192982456146, y: 0.112 }, box: { x: 0.115, y: 0.05 } },
  { id: 'mini', kind: 'axis', inputs: ['rotx', 'roty'], label: "Ministick", group: 'Side module', view: 'front',
    anchor: { x: 0.45192982456140357, y: 0.20700000000000002 }, box: { x: 0.115, y: 0.2789756592292089 } },
  { id: 'minib', kind: 'hat', inputs: b(27, 28, 29, 30, 26), label: "Ministick (digital + press)", group: 'Side module', view: 'front',
    anchor: { x: 0.45433333333333337, y: 0.215 }, box: { x: 0.125, y: 0.4206338742393509 } },
  { id: 'trim', kind: 'hat', inputs: [...hat(1), ...b(19)], label: "Trim hat (8-way POV)", group: 'Grip head', view: 'front',
    anchor: { x: 0.528361403508772, y: 0.08 }, box: { x: 0.875, y: 0.05 } },
  { id: 'hatD', kind: 'hat', inputs: b(32, 33, 34, 35, 31), label: "Hat D (4-way + push)", group: 'Grip head', view: 'front',
    anchor: { x: 0.5, y: 0.172 }, box: { x: 0.875, y: 0.2718661257606491 } },
  { id: 'hatE', kind: 'hat', inputs: b(37, 38, 39, 40, 36), label: "Hat E (4-way + push)", group: 'Grip head', view: 'front',
    anchor: { x: 0.5576842105263158, y: 0.16 }, box: { x: 0.875, y: 0.16093306288032455 } },
  { id: 'tms', kind: 'hat', inputs: b(10, 11, 12, 13, 9), label: "Hat (4-way + push)", group: 'Grip', view: 'front',
    anchor: { x: 0.48942456140350876, y: 0.29 }, box: { x: 0.125, y: 0.5195131845841785 } },
  { id: 'nws', kind: 'button', inputs: b(6), label: "Front button", group: 'Grip', view: 'side',
    anchor: { x: 0.47584267948450665, y: 0.7111010079796145 }, box: { x: 0.1252808945902278, y: 0.8411397854372185 } },
  { id: 'dms', kind: 'hat', inputs: b(15, 16, 17, 18, 14), label: "Hat (4-way + push)", group: 'Grip', view: 'side',
    anchor: { x: 0.5803289869608826, y: 0.48800000000000004 }, box: { x: 0.125, y: 0.43668181818181817 } },
  { id: 'trig', kind: 'switch', inputs: b(4, 5), label: "Trigger (stage 1 / 2)", group: 'Grip', view: 'side',
    anchor: { x: 0.5415887662988966, y: 0.506 }, box: { x: 0.115, y: 0.5573181818181818 } },
  { id: 'wheel', kind: 'switch', inputs: b(1, 2, 41, 42, 3), label: "Wheel / EX trigger (5-way)", group: 'Grip', view: 'side',
    anchor: { x: 0.670912738214644, y: 0.551 }, box: { x: 0.885, y: 0.48402517482517493 } },
  { id: 'wheela', kind: 'axis', inputs: ['rotz'], label: "Wheel / EX trigger (analog)", group: 'Grip', view: 'side',
    anchor: { x: 0.6743309929789368, y: 0.56 }, box: { x: 0.885, y: 0.6200000000000001 } },
  { id: 'paddle', kind: 'switch', inputs: b(7, 8), label: "Paddle (stage 1 / 2)", group: 'Grip', view: 'side',
    anchor: { x: 0.6065356068204614, y: 0.749 }, box: { x: 0.8679775280898876, y: 0.751836045261126 } },
  { id: 'xy', kind: 'axis', inputs: ['x', 'y'], label: "Stick X / Y", group: 'Axes', view: 'front',
    anchor: { x: 0.5576842105263158, y: 0.42 }, box: { x: 0.885, y: 0.42557809330628804 } },
  { id: 'bkeys', kind: 'buttons', inputs: b(49, 50, 51, 52), label: "Base keys (left) 49-52", group: 'Base', view: 'front',
    anchor: { x: 0.418280701754386, y: 0.64 }, box: { x: 0.115, y: 0.6883671399594321 } },
  { id: 'bkeysr', kind: 'buttons', inputs: b(53, 54, 55, 56), label: "Base keys (right) 53-56", group: 'Base', view: 'front',
    anchor: { x: 0.6105614035087719, y: 0.583 }, box: { x: 0.885, y: 0.5735091277890467 } },
  { id: 'wl', kind: 'axis', inputs: ['slider1'], label: "Slider wheel (left)", group: 'Base', view: 'front',
    anchor: { x: 0.5624912280701755, y: 0.68 }, box: { x: 0.115, y: 0.7941835699797161 } },
  { id: 'wlb', kind: 'switch', inputs: b(57, 58, 59), label: "Slider wheel (zones)", group: 'Base', view: 'front',
    anchor: { x: 0.5648947368421052, y: 0.69 }, box: { x: 0.115, y: 0.9 } },
  { id: 'wr', kind: 'axis', inputs: ['slider2'], label: "Dial wheel (right)", group: 'Base', view: 'front',
    anchor: { x: 0.6442105263157896, y: 0.635 }, box: { x: 0.885, y: 0.6913793103448277 } },
  { id: 'wrb', kind: 'switch', inputs: b(60, 61, 62), label: "Dial wheel (zones)", group: 'Base', view: 'front',
    anchor: { x: 0.6466140350877194, y: 0.645 }, box: { x: 0.885, y: 0.8092494929006087 } },
  { id: 'paddlea', kind: 'axis', inputs: ['slider1'], label: "Paddle lever", view: 'side',
    anchor: { x: 0.6028090059087517, y: 0.7471357980803838 }, box: { x: 0.8432584612557058, y: 0.9241766887486563 } },
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



/* ------------------------------------------------------------------ photo-only / new WinCtrl + Azeron (Federico's exports, 2026-10-06) */
// Distinct from builtin-winctrl-orion (the F-15EX throttle): pedals use USB 4098:BEF0 and the "Orion Pedals" / "Combat Rudder" names.
// Exact callouts from Federico's export (anchor + box fractions as saved) — do not run through withPhotoLayout auto-box.
photoTplExact({
  id: 'builtin-winctrl-orion-pedals', name: 'WinCtrl Orion Combat Rudder Pedals', brand: 'WinCtrl',
  notes: 'Toe brakes = rotx / roty, rudder = rotz. Button numbers as reported by DirectInput on a Metal unit. Callout positions from the published Metal export.',
  match: [{ vendor: '4098', product: 'BEF0' }, { name: 'Orion Pedals' }, { name: 'Orion Combat Rudder' }, { name: 'Combat Rudder Pedals' }],
}, 'winctrl-orion-pedals-main', 'main', 'Pedals', 1413.0434782608697, 1000, [
  { id: 'ltoe', kind: 'axis', inputs: ['roty'], label: 'Left Toe Brake', view: 'main',
    anchor: { x: 0.23650188953704254, y: 0.10839489180422053 }, box: { x: 0.3330798421069243, y: 0.04177298971756422 } },
  { id: 'rtoe', kind: 'axis', inputs: ['rotx'], label: 'Right Toe Brake', view: 'main',
    anchor: { x: 0.7619771631045034, y: 0.37273337810611146 }, box: { x: 0.7847908513174311, y: 0.06541302477937164 } },
  { id: 'rudder', kind: 'axis', inputs: ['rotz'], label: 'Rudder', view: 'main',
    anchor: { x: 0.41064638783269963, y: 0.4694425789120215 }, box: { x: 0.09581749339520705, y: 0.7466756130241563 } },
  { id: 'rudbtns', kind: 'buttons', inputs: b(11, 12, 13, 14, 15), label: 'Rudder Buttons', view: 'main',
    anchor: { x: 0.36958173744578776, y: 0.5543317416916764 }, box: { x: 0.21901140104228553, y: 0.8723975412792772 } },
  { id: 'rbtns', kind: 'buttons', inputs: b(1, 3, 4, 5, 6), label: 'Right Buttons', view: 'main',
    anchor: { x: 0.7460075929590958, y: 0.4415043407514481 }, box: { x: 0.8577947000133674, y: 0.21584953887099143 } },
  { id: 'lbtns', kind: 'buttons', inputs: b(2, 7, 8, 9, 10), label: 'Left Buttons', view: 'main',
    anchor: { x: 0.22205323774098443, y: 0.19865680845733294 }, box: { x: 0.48745245987924785, y: 0.0847548567424131 } },
]);

// Photo only: picture shows so users can Customize a copy and place their own callouts.
const PHOTO_ONLY_NOTE = 'Picture only for now — Customize a copy to place callouts on the controls.';
const WC_MFD_NOTE = WC_NOTE + ' Bezel 1-44 per the WinCtrl diagram (GAIN 10/11, CONT 21/22, SYM 32/33, DAY/NGT 43/44); BRT encoder unnumbered — Customize a copy if yours differ. Uses buttons above 32: Chrome / Edge only report the first 32, use Firefox.';
photoTpl({
  id: 'builtin-winctrl-carrierace-mfd-l', name: 'WinCtrl CarrierAce MFD', brand: 'WinCtrl', notes: WC_MFD_NOTE,
  match: [{ vendor: '4098', product: 'BEE0' }, { vendor: '4098', product: 'BEE1' }, { vendor: '4098', product: 'BEE2' }, { name: 'CarrierAce MFD' }],
}, [
  // Dense bezels grouped (photo templates have one marker per callout; inputRegions need SVG art). Corner rockers keep the panel labels from the unit.
  c('left', 'buttons', b(...range(1, 9)), 'Left 1-9', 'Left', { side: 'L' }),
  c('gain', 'buttons', b(10, 11), 'GAIN (10 / 11)', 'Left', { side: 'L' }),
  c('bottom', 'buttons', b(...range(12, 20)), 'Bottom 12-20', 'Bottom', { side: 'L' }),
  c('cont', 'buttons', b(21, 22), 'CONT (21 / 22)', 'Bottom', { side: 'R' }),
  c('right', 'buttons', b(...range(23, 31)), 'Right 23-31', 'Right', { side: 'R' }),
  c('sym', 'buttons', b(32, 33), 'SYM (32 / 33)', 'Top', { side: 'R' }),
  c('top', 'buttons', b(...range(34, 42)), 'Top 34-42', 'Top', { side: 'R' }),
  c('dayngt', 'buttons', b(43, 44), 'DAY / NGT (43 / 44)', 'Top', { side: 'L' }),
  c('brt', 'encoder', u(3), 'BRT (− / +)', 'Top', { side: 'R' }),
]);
// PTO 2: numbering from Federico's WinCtrl diagram (2026-10-06). Button 2 (MASTER CAUTION) is not numbered there, so not mapped.
const WC_PTO2_NOTE = WC_NOTE + ' Per Federico\'s WinCtrl diagram: 1, 3-41 (switch positions grouped); MASTER CAUTION is not numbered there. Buttons above 32: use Firefox (Chrome / Edge stop at 32).';
photoTpl({
  id: 'builtin-winctrl-carrierace-pto2', name: 'WinCtrl CarrierAce PTO 2', brand: 'WinCtrl', notes: WC_PTO2_NOTE,
  match: [{ vendor: '4098', product: 'BF05' }, { name: 'CarrierAce PTO 2' }, { name: 'CarrierAce PTO' }],
}, [
  c('jett1', 'button', b(1), 'PUSH TO JETT (1)', 'Left'),
  c('gear', 'switch', b(35, 36, 37), 'LDG GEAR (UP 35 / 36 / DN 37)', 'Left'),
  c('lbar', 'switch', b(3, 4), 'LAUNCH BAR (RETRACT 3 / EXTEND 4)', 'Left'),
  c('flap', 'switch', b(5, 6, 7), 'FLAP (AUTO 5 / HALF 6 / FULL 7)', 'Left'),
  c('ldgtaxi', 'switch', b(8, 9), 'LDG/TAXI LIGHT (ON 8 / OFF 9)', 'Left'),
  c('askid', 'switch', b(10, 11), 'ANTI SKID (ON 10 / OFF 11)', 'Left'),
  c('hbypass', 'switch', b(12, 13), 'HOOK BYPASS (FIELD 12 / CARRIER 13)', 'Left'),
  c('probe', 'switch', b(14, 15, 16), 'PROBE (EXTEND 14 / 15 / EMERG 16)', 'Left'),
  c('seljett', 'switch', b(17, 18, 19, 20, 21), 'SELECT JETT (L FUS 17 / SAFE 18 / R FUS 19 / RACK 20 / STORES 21)', 'Jettison'),
  c('jettbtn', 'button', b(22), 'JETT push (22)', 'Jettison'),
  c('brake', 'switch', b(38, 39, 40, 41), 'EMERG / PARK BRK (38 up / 39 ctr / 40 L / 41 R)', 'Jettison'),
  c('jettsta', 'buttons', b(23, 24, 25, 26, 27), 'JETT STATION (CTR 23 / LI 24 / RI 25 / LO 26 / RO 27)', 'Right'),
  c('hook', 'switch', b(32, 33, 34), 'HOOK (32 / 33 / 34)', 'Right'),
  c('wfold', 'switch', b(28, 29, 30, 31), 'WING FOLD (28 / HOLD 29 / SPREAD 30 / FOLD 31)', 'Right'),
]);
// UFC + HUD (one USB device, 4098:BEDE): numbering + axes from Federico's WinCtrl SimAppPro diagrams (2026-10-06).
// COMM 1 / COMM 2 channel knobs: only PULL is numbered (29 / 32); rotation shows as a "Slider" there, so −/+ stay unassigned.
const WC_UFC_NOTE = WC_NOTE + ' UFC 1-41 (top toggles 33-38), HUD 65-83. Axes: UFC VOL 1/2 = RX/RY, BRT = RZ; HUD BRT = X, BLK LVL = Y, BAL = Z, AOA = Dial. COMM knob turning is not numbered (PULL 29/32 only). Buttons above 32: use Firefox.';
photoTpl({
  id: 'builtin-winctrl-carrierace-ufc-hud', name: 'WinCtrl CarrierAce UFC + HUD', brand: 'WinCtrl', notes: WC_UFC_NOTE,
  match: [{ vendor: '4098', product: 'BEDE' }, { name: 'CarrierAce UFC' }, { name: 'CarrierAce HUD' }, { name: 'UFC+HUD' }],
}, [
  // UFC front
  c('ip', 'button', b(1), 'I/P (1)', 'UFC'),
  c('adf', 'switch', b(39, 40, 41), 'ADF (1 39 / OFF 40 / 2 41)', 'UFC'),
  c('vol1', 'axis', ['rotx'], 'COMM 1 VOL (RX)', 'UFC'),
  c('comm1', 'encoder', ['', '', 'button29'], 'COMM 1 channel (− / + / PULL 29)', 'UFC'),
  c('keypad', 'buttons', b(...range(2, 13)), 'Keypad 1-9, CLR, 0, ENT (2-13)', 'UFC'),
  c('opt', 'buttons', b(...range(14, 18)), 'Option select 1-5 (14-18)', 'UFC'),
  c('fn', 'buttons', b(...range(20, 26)), 'A/P IFF TCN ILS D/L BCN ON/OFF (20-26)', 'UFC'),
  c('brt', 'axis', ['rotz'], 'BRT (RZ)', 'UFC'),
  c('emcon', 'button', b(19), 'EM CON (19)', 'UFC'),
  c('vol2', 'axis', ['roty'], 'COMM 2 VOL (RY)', 'UFC'),
  c('comm2', 'encoder', ['', '', 'button32'], 'COMM 2 channel (− / + / PULL 32)', 'UFC'),
  // UFC top edge: three 2-way toggles (rear diagram 33-38; left → right seen from the front)
  c('tgl1', 'switch', b(33, 34), 'Top toggle left (33 / 34)', 'UFC top'),
  c('tgl2', 'switch', b(35, 36), 'Top toggle centre (35 / 36)', 'UFC top'),
  c('tgl3', 'switch', b(37, 38), 'Top toggle right (37 / 38)', 'UFC top'),
  // HUD panel
  c('rej', 'switch', b(65, 66, 67), 'NORM / REJ 1 / REJ 2 (65 / 66 / 67)', 'HUD'),
  c('hbrt', 'axis', ['x'], 'BRT (X)', 'HUD'),
  c('daynight', 'switch', b(68, 69), 'DAY / NIGHT (68 / 69)', 'HUD'),
  c('blk', 'axis', ['y'], 'BLK LVL (Y)', 'HUD'),
  c('aoa', 'axis', ['slider2'], 'AOA (Dial)', 'HUD'),
  c('alt', 'switch', b(73, 74), 'ALT BARO / RDR (73 / 74)', 'HUD'),
  c('att', 'switch', b(75, 76, 77), 'ATT INS / AUTO / STBY (75 / 76 / 77)', 'HUD'),
  c('vid', 'switch', b(70, 71, 72), 'W/B / VID / OFF (70 / 71 / 72)', 'HUD'),
  c('bal', 'axis', ['z'], 'BAL (Z)', 'HUD'),
  c('hdg', 'switch', b(80, 79, 78), 'HDG (80 / 79 / 78)', 'HUD'),
  c('crs', 'switch', b(83, 82, 81), 'CRS (83 / 82 / 81)', 'HUD'),
]);
photoTpl({
  id: 'builtin-azeron-keypad', name: 'Azeron Keypad (XInput)', brand: 'Azeron', notes: PHOTO_ONLY_NOTE,
  match: [{ vendor: '16D0', product: '12F7' }, { name: 'Azeron Keypad' }, { name: 'Azeron Cyborg' }],
});


// Honeycomb Bravo Throttle Quadrant: USB 294B:1901. Button/axis numbers from published DI maps (RoystonS / Sporty's);
// callout positions from Federico's export (2026-10-06, exact anchor + box fractions — no re-box).
photoTplExact({
  id: 'builtin-honeycomb-bravo', name: 'Honeycomb Bravo Throttle Quadrant', brand: 'Honeycomb',
  notes: 'DI: AP 1-8, INCR/DECR 13/14, mode 17-21, flaps 15/16, trim 22/23, gear 31/32, switches 34-47, rev detents 24-28+33, lever btns 9-12+29+30+48. Axes Y=L1 X=L2 RZ=L3 RY=L4 RX=L5 Z=L6. Positions from the Federico export. Buttons to 48: use Firefox (Chrome caps at 32).',
  match: [{ vendor: '294B', product: '1901' }, { name: 'Bravo Throttle' }, { name: 'Honeycomb Bravo' }, { name: 'Bravo Throttle Quadrant' }],
}, 'honeycomb-bravo-main', 'main', 'Bravo', 1825, 1031, [
  { id: 'apsel', kind: 'switch', inputs: ['button17','button18','button19','button20','button21'], label: "AP mode (IAS/CRS/HDG/VS/ALT)", group: "Autopilot", view: 'main',
    anchor: { x: 0.42243348328332936, y: 0.3188625338925878 }, box: { x: 0.18745248308653162, y: 0.10617531909946491 } },
  { id: 'ap', kind: 'buttons', inputs: ['button1','button2','button3','button4','button5','button6','button7'], label: "AP modes (HDG…IAS)", group: "Autopilot", view: 'main',
    anchor: { x: 0.5737642353478494, y: 0.30270906544112974 }, box: { x: 0.6954372391501307, y: 0.06579167364605011 } },
  { id: 'apenc', kind: 'encoder', inputs: ['button13','button14'], label: "AP value (INCR / DECR)", group: "Autopilot", view: 'main',
    anchor: { x: 0.6216730038022814, y: 0.30001681214080994 }, box: { x: 0.8612167300380228, y: 0.12771326847633221 } },
  { id: 'apm', kind: 'button', inputs: ['button8'], label: "AUTO PILOT", group: "Autopilot", view: 'main',
    anchor: { x: 0.6619772095190708, y: 0.28924785028999145 }, box: { x: 0.9205323425989187, y: 0.31213192631701864 } },
  { id: 'gear', kind: 'switch', inputs: ['button31','button32'], label: "Gear (UP / DOWN)", group: "Panel", view: 'main',
    anchor: { x: 0.3365019011406844, y: 0.4911660775570655 }, box: { x: 0.09, y: 0.28 } },
  { id: 'sw14', kind: 'buttons', inputs: ['button34','button35','button36','button37','button38','button39','button40','button41'], label: "Panel switches 1-4", group: "Panel", view: 'main',
    anchor: { x: 0.4939163266026022, y: 0.4130910399505557 }, box: { x: 0.3821292775665399, y: 0.03 } },
  { id: 'sw57', kind: 'buttons', inputs: ['button42','button43','button44','button45','button46','button47'], label: "Panel switches 5-7", group: "Panel", view: 'main',
    anchor: { x: 0.5623573912413855, y: 0.4023220780997372 }, box: { x: 0.5357414216596365, y: 0.03 } },
  { id: 'flaps', kind: 'switch', inputs: ['button15','button16'], label: "Flaps (down / up)", group: "Panel", view: 'main',
    anchor: { x: 0.6939163498098859, y: 0.4373212169525124 }, box: { x: 0.9091254984924548, y: 0.5248191154349112 } },
  { id: 'trim', kind: 'encoder', inputs: ['button22','button23'], label: "Trim (nose down / up)", group: "Levers", view: 'main',
    anchor: { x: 0.41254752851711024, y: 0.6217398747931988 }, box: { x: 0.09, y: 0.58 } },
  { id: 'l1', kind: 'axis', inputs: ['y'], label: "Lever 1 (Y)", group: "Levers", view: 'main',
    anchor: { x: 0.4863117638649596, y: 0.69173820384921 }, box: { x: 0.14106463298144903, y: 0.97 } },
  { id: 'l2', kind: 'axis', inputs: ['x'], label: "Lever 2 (X)", group: "Levers", view: 'main',
    anchor: { x: 0.5273764142518714, y: 0.6876997982235 }, box: { x: 0.32433461236409816, y: 0.97 } },
  { id: 'l3', kind: 'axis', inputs: ['rotz'], label: "Lever 3 (RZ)", group: "Levers", view: 'main',
    anchor: { x: 0.5623573912413855, y: 0.6850075962736408 }, box: { x: 0.4969581633013011, y: 0.97 } },
  { id: 'l4', kind: 'axis', inputs: ['roty'], label: "Lever 4 (RY)", group: "Levers", view: 'main',
    anchor: { x: 0.6049429889867515, y: 0.6823152916228604 }, box: { x: 0.8574144486692015, y: 0.97 } },
  { id: 'l5', kind: 'axis', inputs: ['rotx'], label: "Lever 5 (RX)", group: "Levers", view: 'main',
    anchor: { x: 0.6467680840437856, y: 0.6809691906479308 }, box: { x: 0.8893535889600166, y: 0.8034662279831049 } },
  { id: 'l6', kind: 'axis', inputs: ['z'], label: "Lever 6 (Z)", group: "Levers", view: 'main',
    anchor: { x: 0.6840303950436668, y: 0.6769308877231421 }, box: { x: 0.9182509505703422, y: 0.6473161527700851 } },
  { id: 'rev', kind: 'buttons', inputs: ['button24','button25','button26','button27','button28','button33'], label: "Reverse detents", group: "Levers", view: 'main',
    anchor: { x: 0.6049429889867515, y: 0.8869258235407149 }, box: { x: 0.6923954604696412, y: 0.97 } },
  { id: 'toga', kind: 'buttons', inputs: ['button9','button10','button11','button12','button29','button30','button48'], label: "Lever TOGA / rev btns", group: "Levers", view: 'main',
    anchor: { x: 0.5661596726102067, y: 0.5988557987661717 }, box: { x: 0.15475284010738474, y: 0.8075046336088149 } },
]);

/* ------------------------------------------------------------------ rudder pedals (photo built-ins, 2026-10-06) */
// Appended after every other built-in so ties on a name rule keep the older template (the Orion pedals keep 4098:BEF0 and
// their names). Anchors are measured on the cut-out photo (fractions of the picture) and moved onto the canvas, where the
// photo sits centred between the two label gutters; boxes go to the label columns.
type PedalCallout = { id: string; input: string; label: string; at: [number, number]; box: [number, number] };
function pedalTpl(meta: Meta & { id: string }, photo: string, callouts: PedalCallout[]): void {
  const size = DEVICE_PHOTO_SIZES[photo];
  if (!size) { PHOTO_LAYOUT_PROBLEMS.push(`${meta.id}: unknown photo “${photo}”`); return; }
  const [w, h] = size, { width, height } = pageSizeForPhoto(w, h), gx = (width - w) / 2;
  photoTplExact(meta, photo, 'main', 'Pedals', width, height, callouts.map((c) => ({
    id: c.id, kind: 'axis', inputs: [c.input], label: c.label, view: 'main',
    anchor: { x: (gx + c.at[0] * w) / width, y: c.at[1] }, box: { x: c.box[0], y: c.box[1] },
  })));
}
const PEDAL_L = 0.115, PEDAL_R = 0.885;

// Honeycomb Charlie: USB 294B:1903 ("Honeycomb Aeronautical Charlie Rudder Pedal", a user's lsusb). Windows Game Controllers:
// X = left toe brake, Y = right toe brake, Z = rudder (IL-2 forum user report). No buttons.
pedalTpl({
  id: 'builtin-honeycomb-charlie', name: 'Honeycomb Charlie Rudder Pedals', brand: 'Honeycomb',
  notes: 'Left toe brake = x, right toe brake = y, rudder = z (as Windows Game Controllers shows them). No buttons. The toe brakes can read inverted (100 % at rest) until calibrated: invert the axis in game if so. USB 294B:1903 (from a Linux lsusb report); other units are matched by name.',
  match: [{ vendor: '294B', product: '1903' }, { name: 'Charlie Rudder' }, { name: 'Honeycomb Charlie' }],
}, 'honeycomb-charlie-main', [
  { id: 'ltoe', input: 'x', label: 'Left Toe Brake', at: [0.17, 0.22], box: [PEDAL_L, 0.22] },
  { id: 'rtoe', input: 'y', label: 'Right Toe Brake', at: [0.66, 0.14], box: [PEDAL_R, 0.14] },
  { id: 'rudder', input: 'z', label: 'Rudder', at: [0.42, 0.3], box: [PEDAL_L, 0.8] },
]);

// Logitech G Flight Rudder Pedals (ex Saitek Pro Flight Rudder Pedals): USB 06A3:0763 (usb.ids "Pro Flight Rudder Pedals";
// the Logitech-badged unit keeps the Saitek id and name). X = left toe brake, Y = right toe brake, RZ = rudder.
// Not 06A3:0764 (Pro Flight Combat Rudder Pedals) or 0765 (Cessna pedals); "Flight Rudder Pedals" alone would also hit the TFRP.
pedalTpl({
  id: 'builtin-logitech-flight-rudder', name: 'Logitech G Flight Rudder Pedals (Saitek Pro Flight)', brand: 'Logitech',
  notes: 'Left toe brake = x, right toe brake = y, rudder = rotz. No buttons. Windows lists it as “Saitek Pro Flight Rudder Pedals” (USB 06A3:0763) even on the Logitech-badged unit. Not the Pro Flight Combat Rudder Pedals (06A3:0764) or the Cessna pedals (0765).',
  match: [{ vendor: '06A3', product: '0763' }, { name: 'Pro Flight Rudder Pedals' }, { name: 'Saitek Flight Rudder' }, { name: 'Logitech G Flight Rudder' }],
}, 'logitech-flight-rudder-main', [
  { id: 'ltoe', input: 'x', label: 'Left Toe Brake', at: [0.37, 0.12], box: [PEDAL_L, 0.12] },
  { id: 'rtoe', input: 'y', label: 'Right Toe Brake', at: [0.79, 0.28], box: [PEDAL_R, 0.28] },
  { id: 'rudder', input: 'rotz', label: 'Rudder', at: [0.5, 0.47], box: [PEDAL_L, 0.8] },
]);

// MFG Crosswind V3: USB 16D0:0A38 "MFG Crosswind V2" (V2 and V3 share the electronics; firmware 5.09+ may report
// "MFG Crosswind v2/3"). DCS default assignment: rudder JOY_RZ, left brake JOY_X, right brake JOY_Y (both inverted).
pedalTpl({
  id: 'builtin-mfg-crosswind', name: 'MFG Crosswind V3 Rudder Pedals', brand: 'MFG',
  notes: 'Left toe brake = x, right toe brake = y, rudder = rotz. No buttons. V2 and V3 share the electronics: Windows shows “MFG Crosswind V2” (USB 16D0:0A38) or, on newer firmware, “MFG Crosswind v2/3”. Brakes may need inverting in game. MFG Configurator can merge the brakes into one axis, and the second-set (SN2) firmware has another id: Customize a copy if yours differ.',
  match: [{ vendor: '16D0', product: '0A38' }, { name: 'MFG Crosswind' }],
}, 'mfg-crosswind-v3-main', [
  { id: 'ltoe', input: 'x', label: 'Left Toe Brake', at: [0.13, 0.22], box: [PEDAL_L, 0.22] },
  { id: 'rtoe', input: 'y', label: 'Right Toe Brake', at: [0.74, 0.18], box: [PEDAL_R, 0.18] },
  { id: 'rudder', input: 'rotz', label: 'Rudder', at: [0.5, 0.6], box: [PEDAL_R, 0.8] },
]);

// Thrustmaster T.Flight Rudder Pedals: Windows name "T-Rudder" (TFRP manual), USB 044F:B679 "T-Rudder" / B678
// "T.Flight Rudder Pedals" (usb.ids). Y = left toe brake, X = right toe brake, Z = rudder (Federico's Game Controllers
// screenshot). "T-Rudder" only with the Thrustmaster vendor id: "VKBsim T-Rudder" is the VKB pedals.
pedalTpl({
  id: 'builtin-tm-tfrp', name: 'Thrustmaster T.Flight Rudder Pedals (TFRP)', brand: 'Thrustmaster',
  notes: 'Left toe brake = y, right toe brake = x, rudder = z. No buttons. On USB (T.RJ12 adapter, selector on AIRPLANE) Windows shows “T-Rudder”. Plugged into a T.Flight HOTAS (RJ12) the pedals are axes of the stick instead and this template does not apply.',
  match: [{ vendor: '044F', product: 'B679' }, { vendor: '044F', product: 'B678' }, { vendor: '044F', name: 'T-Rudder' }, { name: 'T.Flight Rudder' }],
}, 'tm-tfrp-main', [
  { id: 'ltoe', input: 'y', label: 'Left Toe Brake', at: [0.36, 0.14], box: [PEDAL_L, 0.14] },
  { id: 'rtoe', input: 'x', label: 'Right Toe Brake', at: [0.8, 0.22], box: [PEDAL_R, 0.22] },
  { id: 'rudder', input: 'z', label: 'Rudder', at: [0.48, 0.6], box: [PEDAL_L, 0.66] },
]);

// Thrustmaster Pendular Rudder: USB 044F:B68F "T-Pendular-Rudder". DCS default assignment and Federico's Game Controllers
// screenshot agree: Y = left toe brake, X = right toe brake, Z = rudder.
pedalTpl({
  id: 'builtin-tm-tpr', name: 'Thrustmaster Pendular Rudder (TPR)', brand: 'Thrustmaster',
  notes: 'Left toe brake = y, right toe brake = x, rudder = z. No buttons. Windows shows “T-Pendular-Rudder” (USB 044F:B68F).',
  match: [{ vendor: '044F', product: 'B68F' }, { name: 'T-Pendular-Rudder' }, { name: 'Pendular Rudder' }],
}, 'tm-tpr-main', [
  { id: 'ltoe', input: 'y', label: 'Left Toe Brake', at: [0.19, 0.33], box: [PEDAL_L, 0.33] },
  { id: 'rtoe', input: 'x', label: 'Right Toe Brake', at: [0.82, 0.52], box: [PEDAL_R, 0.52] },
  { id: 'rudder', input: 'z', label: 'Rudder', at: [0.45, 0.3], box: [PEDAL_R, 0.14] },
]);

// VIRPIL R1-FALCON (VPC-305-001): USB product id not published, so name rules only. VIRPIL pedals show as "VPC Rudder Pedals"
// with Z = rudder, Slider = left toe brake, Dial = right toe brake (ED forum; DCS default rudder JOY_Z).
pedalTpl({
  id: 'builtin-virpil-r1-falcon', name: 'VIRPIL R1-FALCON Rudder Pedals', brand: 'VIRPIL',
  notes: 'Left toe brake = slider1 (Slider), right toe brake = slider2 (Dial), rudder = z, as VIRPIL pedals report by default. No buttons. Matched by name only (“VPC Rudder Pedals” also covers the older ACE pedals). The VPC Configurator can rename or move the axes: Customize a copy if your numbers differ.',
  match: [{ name: 'R1-FALCON' }, { name: 'VPC Rudder Pedals' }],
}, 'virpil-r1-falcon-main', [
  { id: 'ltoe', input: 'slider1', label: 'Left Toe Brake', at: [0.18, 0.3], box: [PEDAL_L, 0.3] },
  { id: 'rtoe', input: 'slider2', label: 'Right Toe Brake', at: [0.77, 0.2], box: [PEDAL_R, 0.2] },
  { id: 'rudder', input: 'z', label: 'Rudder', at: [0.48, 0.55], box: [PEDAL_R, 0.8] },
]);

// VKB T-Rudder Mk.V: USB 231D:011F "VKBsim T-Rudder" (linux-hardware probes). One axis: the rudder (MARS sensor) = Rx
// (VKB pedals manual; DCS default for "VKBsim T-Rudder" = JOY_RX). No toe brakes.
pedalTpl({
  id: 'builtin-vkb-t-rudder', name: 'VKB T-Rudder Mk.V', brand: 'VKB',
  notes: 'Rudder = rotx (VKB default). No toe brakes and no buttons. VKB ids and axes depend on the VKBDevCfg setup (some shop pages say Z; through a Black Box it shows as “VKBsim Black Box”), and differential braking from the rudder is a VKBDevCfg option that adds axes: Customize a copy if your numbers differ.',
  match: [{ vendor: '231D', product: '011F' }, { name: 'VKBsim T-Rudder' }, { name: 'VKB T-Rudder' }, { name: 'T-Rudder Mk' }],
}, 'vkb-t-rudder-main', [
  { id: 'rudder', input: 'rotx', label: 'Rudder', at: [0.47, 0.38], box: [PEDAL_L, 0.2] },
]);

export const DEVICE_TEMPLATES: DeviceTemplate[] = ALL;
