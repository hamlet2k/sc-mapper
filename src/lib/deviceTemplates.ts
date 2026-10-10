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
  id: 'builtin-tm-warthog-stick', category: 'stick', name: 'Thrustmaster HOTAS Warthog stick', brand: 'Thrustmaster', notes: TM_NOTE,
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
  id: 'builtin-tm-warthog-throttle', category: 'throttle', name: 'Thrustmaster HOTAS Warthog throttle', brand: 'Thrustmaster', notes: TM_NOTE,
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
  id: 'builtin-tm-t16000m', category: 'stick', name: 'Thrustmaster T.16000M FCS stick', brand: 'Thrustmaster',
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
photoTplExactViews({
  id: 'builtin-tm-twcs', category: 'throttle', name: 'Thrustmaster TWCS throttle', brand: 'Thrustmaster',
  notes: 'Numbers as the Thrustmaster manual shows them (fixed, 1-based: button N = jsX_buttonN).',
  match: [{ vendor: '044F', product: 'B687' }, { name: 'TWCS' }],
}, [
  {"id": "thumb", "label": "Thumb side", "width": 1164, "height": 538, "photo": "tm-twcs-thumb"},
  {"id": "front", "label": "Front", "width": 1573, "height": 831, "photo": "tm-twcs-front"},
], [
  {"id": "h11", "kind": "hat", "inputs": ["button11", "button12", "button13", "button14"], "label": "Hat (4-way)", "group": "Grip", "view": "thumb",
    "anchor": {"x": 0.581137742824897, "y": 0.3978930307941653}, "box": {"x": 0.8733533299611714, "y": 0.47698539350562197}},
  {"id": "b3", "kind": "button", "inputs": ["button3"], "label": "Button 3", "group": "Grip", "view": "front",
    "anchor": {"x": 0.5649700507432401, "y": 0.20609065155807366}, "box": {"x": 0.8727544910179641, "y": 0.37266289816361986}},
  {"id": "b2", "kind": "button", "inputs": ["button2"], "label": "Button 2", "group": "Grip", "view": "front",
    "anchor": {"x": 0.5961078027051366, "y": 0.20042492917847027}, "box": {"x": 0.8913174018174589, "y": 0.24801700581234506}},
  {"id": "r45", "kind": "switch", "inputs": ["button4", "button5"], "label": "Rocker (fwd / aft)", "group": "Grip", "view": "front",
    "anchor": {"x": 0.5398203684184366, "y": 0.22762041389097912}, "box": {"x": 0.855988005678097, "y": 0.7443342776203966}},
  {"id": "thr", "kind": "axis", "inputs": ["z"], "label": "Throttle", "group": "Axes", "view": "thumb",
    "anchor": {"x": 0.41329896907216496, "y": 0.25}, "box": {"x": 0.115, "y": 0.18413506815365555}},
  {"id": "h7", "kind": "hat", "inputs": ["button7", "button8", "button9", "button10"], "label": "Hat (4-way)", "group": "Grip", "view": "thumb",
    "anchor": {"x": 0.5805389038816897, "y": 0.2747163695299838}, "box": {"x": 0.8751496640508046, "y": 0.2786061489408175}},
  {"id": "pov", "kind": "hat", "inputs": ["hat1_up", "hat1_right", "hat1_down", "hat1_left"], "label": "POV hat (8-way)", "group": "Grip", "view": "thumb",
    "anchor": {"x": 0.6032934131736527, "y": 0.14505672609400325}, "box": {"x": 0.875, "y": 0.1271840148698885}},
  {"id": "mini", "kind": "axis", "inputs": ["x", "y"], "label": "Ministick", "group": "Grip", "view": "front",
    "anchor": {"x": 0.5008982127298138, "y": 0.2514164305949009}, "box": {"x": 0.12844311834095481, "y": 0.05991501848690908}},
  {"id": "minib", "kind": "button", "inputs": ["button6"], "label": "Ministick press", "group": "Grip", "view": "front",
    "anchor": {"x": 0.5008982127298138, "y": 0.2502833034093927}, "box": {"x": 0.12305388764706915, "y": 0.16643059490084985}},
  {"id": "ant", "kind": "axis", "inputs": ["slider1"], "label": "Antenna wheel", "group": "Grip", "view": "front",
    "anchor": {"x": 0.617065886537472, "y": 0.13130313343772132}, "box": {"x": 0.8607784431137725, "y": 0.0893767791834499}},
  {"id": "b1", "kind": "button", "inputs": ["button1"], "label": "Front button", "group": "Grip", "view": "thumb",
    "anchor": {"x": 0.5535927960972586, "y": 0.4938411867212824}, "box": {"x": 0.7757485212680109, "y": 0.8374392418266309}},
  {"id": "paddle", "kind": "axis", "inputs": ["rotz"], "label": "Paddle rocker (rudder)", "group": "Grip", "view": "front",
    "anchor": {"x": 0.5104790419161677, "y": 0.3828611725112872}, "box": {"x": 0.1296407276998737, "y": 0.7386685552407932}},
]);

// Exact photo, view size and callouts from the supplied Cougar MFD export (2026-10-10).
photoTplExactViews({
  id: 'builtin-tm-cougar-mfd', category: 'panel', name: 'Thrustmaster MFD Cougar', brand: 'Thrustmaster',
  notes: 'Numbering read from the Thrustmaster software; one template for both the left and right MFD.',
  match: [{ vendor: '044F', product: 'B354' }, { name: 'MFD Cougar' }, { name: 'F16 MFD' }],
}, [
  {"id": "main", "label": "Page 1", "width": 1696, "height": 958, "photo": "tm-cougar-mfd-main"},
], [
  {"id": "sv9m6aqq", "kind": "buttons", "inputs": ["button6", "button7", "button8", "button9", "button10"], "view": "main", "label": "OSB R1-R5",
    "anchor": {"x": 0.5947451004327512, "y": 0.43763889736599393}, "box": {"x": 0.8419607484106924, "y": 0.5531944274902344}},
  {"id": "6v6sjpdt", "kind": "encoder", "inputs": ["button21", "button22"], "view": "main", "label": "SYM (up/dn)",
    "anchor": {"x": 0.6185882568359375, "y": 0.1654166751437717}, "box": {"x": 0.7465882185393689, "y": 0.05319444868299696}},
  {"id": "5dv577fg", "kind": "encoder", "inputs": ["button23", "button24"], "view": "main", "label": "CON (up/dn)",
    "anchor": {"x": 0.5702745026233149, "y": 0.7009722391764323}, "box": {"x": 0.7315294333065258, "y": 0.9076388888888889}},
  {"id": "1mosty1x", "kind": "encoder", "inputs": ["button27", "button28"], "view": "main", "label": "GAIN (up/dn)",
    "anchor": {"x": 0.28478430654488357, "y": 0.2043055640326606}, "box": {"x": 0.1605490172143076, "y": 0.06430555979410807}},
  {"id": "21itljm4", "kind": "encoder", "inputs": ["button25", "button28"], "view": "main", "label": "BRT (up/dn)",
    "anchor": {"x": 0.23207841461780024, "y": 0.6965277777777777}, "box": {"x": 0.1410980463962929, "y": 0.8765277438693576}},
  {"id": "rudpgz0h", "kind": "buttons", "inputs": ["button1", "button2", "button3", "button4", "button5"], "view": "main", "label": "OSB T1-T5",
    "anchor": {"x": 0.4529411884382659, "y": 0.12430555555555556}, "box": {"x": 0.8632941391888787, "y": 0.2831944359673394}},
  {"id": "kzu4zqoo", "kind": "buttons", "inputs": ["button20", "button19", "button18", "button17", "button16"], "view": "main", "label": "OSB L1-L5",
    "anchor": {"x": 0.2578039431104473, "y": 0.4509722391764323}, "box": {"x": 0.08274511000689339, "y": 0.2231944613986545}},
  {"id": "d5izpaso", "kind": "buttons", "inputs": ["button15", "button14", "button13", "button12", "button11"], "view": "main", "label": "OSB B1-B5",
    "anchor": {"x": 0.39019609039905023, "y": 0.7954166836208767}, "box": {"x": 0.08086273791743259, "y": 0.5143055386013455}},
]);

/* ------------------------------------------------------------------ VIRPIL */
const VPC_NOTE = 'Default numbering from the VIRPIL diagrams (1-based: button N = jsX_buttonN). The VPC Configurator can renumber everything: if yours differs, use “Customize a copy”.';
tpl('virpil-alpha-prime', {
  id: 'builtin-virpil-alpha-prime', category: 'stick', name: 'VIRPIL Alpha Prime (R) stick', brand: 'VIRPIL', notes: VPC_NOTE,
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
// Exact photos and callouts from Federico's export (2026-10-09); retain the built-in metadata.
// T1 stays 30 / 32: the export's 30 / 31 duplicates T2's button 31.
photoTplExactViews({
  id: 'builtin-virpil-vmax-prime', category: 'throttle', name: 'VIRPIL VMAX Prime throttle', brand: 'VIRPIL',
  notes: VPC_NOTE + ' Shown without the shift layer. Uses buttons above 32: Chrome / Edge only report the first 32, use Firefox.',
  match: [{ name: 'VMAX' }],
}, [
  { id: 'left', label: 'Front Grip', photo: 'virpil-vmax-prime-front', width: 1868, height: 966 },
  { id: 'panel', label: 'Back Grip and Panel', photo: 'virpil-vmax-prime-panel', width: 2092, height: 1182 },
], [
  { id: 'keys', kind: 'buttons', inputs: b(23, 24, 25, 26, 27, 28), label: 'Base keys (23-28)', group: 'Base', view: 'panel',
    anchor: { x: 0.4189723320158103, y: 0.47692893477416654 }, box: { x: 0.25771145796894435, y: 0.2517620876497109 } },
  { id: 'apu', kind: 'switch', inputs: b(47, 48, 49, 50, 51), label: 'APU selector (5 positions)', group: 'Base', view: 'panel',
    anchor: { x: 0.35335968982560834, y: 0.5426880675244857 }, box: { x: 0.0845771144278607, y: 0.46145374449339205 } },
  { id: 'apub', kind: 'button', inputs: b(40), label: 'APU start', group: 'Base', view: 'panel',
    anchor: { x: 0.32252963823763275, y: 0.4993150157054292 }, box: { x: 0.07363183700030122, y: 0.2799559605804309 } },
  { id: 'jett', kind: 'button', inputs: b(29), label: 'Jettison', group: 'Base', view: 'panel',
    anchor: { x: 0.49565214978847577, y: 0.5272976435558211 }, box: { x: 0.7552238957798896, y: 0.5319383259911894 } },
  { id: 't1', kind: 'switch', inputs: b(30, 32), label: 'T1 (up / down)', group: 'Base', view: 'panel',
    anchor: { x: 0.5233201339781991, y: 0.5468855044001462 }, box: { x: 0.94, y: 0.7187224400726184 } },
  { id: 't2', kind: 'switch', inputs: b(31, 33), label: 'T2 (up / down)', group: 'Base', view: 'panel',
    anchor: { x: 0.5454545454545454, y: 0.5832628992566047 }, box: { x: 0.736318407960199, y: 0.7134361099041506 } },
  { id: 't3', kind: 'switch', inputs: b(34, 35), label: 'T3 (up / down)', group: 'Base', view: 'panel',
    anchor: { x: 0.3984189843942997, y: 0.6042498701443986 }, box: { x: 0.08358208575652014, y: 0.7257709251101322 } },
  { id: 't4', kind: 'switch', inputs: b(36, 37), label: 'T4 (up / down)', group: 'Base', view: 'panel',
    anchor: { x: 0.42134386748664465, y: 0.6420263750443259 }, box: { x: 0.07960199004975124, y: 0.944273154641038 } },
  { id: 't5', kind: 'switch', inputs: b(38, 39), label: 'T5 (up / down)', group: 'Base', view: 'panel',
    anchor: { x: 0.44505928250640747, y: 0.688197753695574 }, box: { x: 0.3661691466374184, y: 0.9372246696035242 } },
  { id: 'e1', kind: 'encoder', inputs: b(43, 42, 41), label: 'Encoder E1', group: 'Base', view: 'panel',
    anchor: { x: 0.45454545454545453, y: 0.5818637892131359 }, box: { x: 0.7791045079776897, y: 0.9601322123657764 } },
  { id: 'e2', kind: 'encoder', inputs: b(46, 45, 44), label: 'Encoder E2', group: 'Base', view: 'panel',
    anchor: { x: 0.4869565096768466, y: 0.6266359510756613 }, box: { x: 0.6149254035000777, y: 0.9460352422907489 } },
  { id: 'b17', kind: 'button', inputs: b(17), label: 'Button 17', group: 'Right grip', view: 'panel',
    anchor: { x: 0.5944663790374877, y: 0.31323055117484894 }, box: { x: 0.12039801374596742, y: 0.13017622489761152 } },
  { id: 'h10', kind: 'hat', inputs: b(14, 11, 12, 13, 10), label: 'Hat (4-way + push)', group: 'Right grip', view: 'panel',
    anchor: { x: 0.6521739130434783, y: 0.2418748181327736 }, box: { x: 0.5313432987649642, y: 0.0314978040787617 } },
  { id: 'b16', kind: 'button', inputs: b(16), label: 'Button 16', group: 'Right grip', view: 'panel',
    anchor: { x: 0.6260869323971714, y: 0.28384875990836134 }, box: { x: 0.29413729235881475, y: 0.030000000000000002 } },
  { id: 'mini', kind: 'axis', inputs: ['x', 'y'], label: 'Ministick', group: 'Right grip', view: 'panel',
    anchor: { x: 0.6948616721413352, y: 0.27265571944273 }, box: { x: 0.9064676465086676, y: 0.13370043380670085 } },
  { id: 'minib', kind: 'button', inputs: b(15), label: 'Ministick press', group: 'Right grip', view: 'panel',
    anchor: { x: 0.6932806082864995, y: 0.2740548828588258 }, box: { x: 0.746268656716418, y: 0.03 } },
  { id: 'h18', kind: 'hat', inputs: b(22, 19, 20, 21, 18), label: 'Hat (4-way + push)', group: 'Right grip', view: 'panel',
    anchor: { x: 0.6600790513833992, y: 0.3216253181809157 }, box: { x: 0.8995025027450637, y: 0.3381057268722467 } },
  { id: 'rthr', kind: 'axis', inputs: ['roty'], label: 'Right lever', group: 'Axes', view: 'left',
    anchor: { x: 0.4290597751301914, y: 0.2264919333644533 }, box: { x: 0.8558166719071313, y: 0.12704544067382811 } },
  { id: 'lthr', kind: 'axis', inputs: ['rotx'], label: 'Left lever', group: 'Axes', view: 'left',
    anchor: { x: 0.3443820396166169, y: 0.15181964161655967 }, box: { x: 0.6893258255519225, y: 0.03 } },
  { id: 'rot2', kind: 'axis', inputs: ['slider1'], label: 'Rotary (SR)', group: 'Left grip', view: 'left',
    anchor: { x: 0.521866483751321, y: 0.3681150823887388 }, box: { x: 0.9106741915927844, y: 0.43427481965040216 } },
  { id: 'rot2b', kind: 'button', inputs: b(2), label: 'Rotary press', group: 'Left grip', view: 'left',
    anchor: { x: 0.521866483751321, y: 0.3681150823887388 }, box: { x: 0.8952996761622356, y: 0.5543181679465554 } },
  { id: 'wl9', kind: 'axis', inputs: ['slider2'], label: 'Wheel (DL dial)', group: 'Left grip', view: 'left',
    anchor: { x: 0.2545454605765965, y: 0.09764329840372844 }, box: { x: 0.08146067415730338, y: 0.1735469630037783 } },
  { id: 'wl9b', kind: 'button', inputs: b(9), label: 'Wheel press', group: 'Left grip', view: 'left',
    anchor: { x: 0.2545454605765965, y: 0.09764329840372844 }, box: { x: 0.06797751951753424, y: 0.3973383567154998 } },
  { id: 'h4', kind: 'hat', inputs: b(7, 8, 5, 6, 4), label: 'Hat (4-way + push)', group: 'Left grip', view: 'left',
    anchor: { x: 0.2711462390281466, y: 0.26579620033978313 }, box: { x: 0.11629213911763737, y: 0.603747909894077 } },
  { id: 'b3', kind: 'button', inputs: b(3), label: 'Button 3', group: 'Left grip', view: 'left',
    anchor: { x: 0.3260357911039255, y: 0.3319867090222215 }, box: { x: 0.5587544065804936, y: 0.8234090631658381 } },
  { id: 'b1', kind: 'button', inputs: b(1), label: 'Button 1', group: 'Left grip', view: 'left',
    anchor: { x: 0.4134387291467237, y: 0.33764329023979 }, box: { x: 0.7007050385346284, y: 0.8197727550159801 } },
  { id: 'paddle', kind: 'axis', inputs: ['rotz'], label: 'Paddle', group: 'Axes', view: 'panel',
    anchor: { x: 0.6646067587177406, y: 0.43327669052239337 }, box: { x: 0.9164178952648865, y: 0.517841423135497 } },
]);

// Exact photos, view sizes and callouts from the supplied export (2026-10-10).
photoTplExactViews({
  id: 'builtin-virpil-mt50cm', category: 'throttle', name: 'VIRPIL MongoosT-50CM throttle', brand: 'VIRPIL',
  notes: VPC_NOTE + ' Shown with the exported numbering and mode selector. Uses buttons above 32: Chrome / Edge only report the first 32, use Firefox.',
  match: [{ vendor: '3344', product: '0192' }, { name: 'MT-50CM', nameBoundary: true }, { name: 'MongoosT-50CM', nameBoundary: true }],
}, [
  { id: 'main', label: 'Panel Side Grip', width: 1753, height: 990, photo: 'virpil-mt50cm-panel' },
  { id: 'p2', label: 'Axis Front Grip', width: 1498, height: 846, photo: 'virpil-mt50cm-front' },
], [
  { id: 'qlij6yto', kind: 'hat', inputs: ['button17', 'button14', 'button15', 'button16', 'button13'], view: 'main',
    anchor: { x: 0.6756862386067708, y: 0.20986111958821616 }, box: { x: 0.9009411980124081, y: 0.06319444444444444 } },
  { id: 'eopdbdd5', kind: 'encoder', inputs: ['button18', 'button19'], view: 'main', label: 'Wheel',
    anchor: { x: 0.6708235318053003, y: 0.16041666666666668 }, box: { x: 0.7516078455307904, y: 0.052083333333333336 } },
  { id: '0ro528im', kind: 'button', inputs: ['button20'], view: 'main',
    anchor: { x: 0.6621960808249081, y: 0.2826388888888889 }, box: { x: 0.9040784529143688, y: 0.2654166751437717 } },
  { id: '4zijh859', kind: 'hat', inputs: ['button25', 'button22', 'button23', 'button24', 'button21'], view: 'main',
    anchor: { x: 0.6182745121974571, y: 0.22291666666666668 }, box: { x: 0.40964706121706496, y: 0.03319443596733941 } },
  { id: 'tk1zfqgb', kind: 'button', inputs: ['button31'], view: 'main',
    anchor: { x: 0.5798431396484375, y: 0.25069444444444444 }, box: { x: 0.2182745121974571, y: 0.09541666242811415 } },
  { id: 'bmxe1v63', kind: 'hat', inputs: ['button30', 'button27', 'button28', 'button29', 'button26'], view: 'main',
    anchor: { x: 0.6120000023935356, y: 0.29375 }, box: { x: 0.9, y: 0.391 } },
  { id: '4so3wydg', kind: 'button', inputs: ['button32'], view: 'main',
    anchor: { x: 0.5900392180798101, y: 0.3298611111111111 }, box: { x: 0.9, y: 0.498 } },
  { id: 'cbyrrdn1', kind: 'axis', inputs: ['rotz'], view: 'p2', label: 'Lever',
    anchor: { x: 0.35129410089231006, y: 0.38319443596733943 }, box: { x: 0.09090196796492034, y: 0.7531944274902344 } },
  { id: 'sr5q7m2i', kind: 'switch', inputs: ['button43', ''], view: 'main', label: 'T2',
    anchor: { x: 0.5837647082758884, y: 0.5868055555555556 }, box: { x: 0.9, y: 0.712 } },
  { id: 'gkvkfsko', kind: 'switch', inputs: ['button44', ''], view: 'main', label: 'T3',
    anchor: { x: 0.5476862769033395, y: 0.6201388888888889 }, box: { x: 0.9, y: 0.819 } },
  { id: '7n6pzk47', kind: 'switch', inputs: ['button93', 'button94', 'button95', 'button96', 'button97'], view: 'main', label: 'MODE',
    anchor: { x: 0.4904313749425551, y: 0.6368055555555555 }, box: { x: 0.7635293758616728, y: 0.8754166497124566 } },
  { id: 'f2485x4t', kind: 'encoder', inputs: ['button60', 'button59', 'button58'], view: 'main', label: 'E3',
    anchor: { x: 0.4551372572954963, y: 0.7118055555555556 }, box: { x: 0.5759215710209865, y: 0.9220833672417534 } },
  { id: 'mtxi15i1', kind: 'encoder', inputs: ['button57', 'button56', 'button55'], view: 'main', label: 'E2',
    anchor: { x: 0.4269019631778493, y: 0.6729166666666667 }, box: { x: 0.45356862984451596, y: 0.9331944783528646 } },
  { id: 'r9o62f2n', kind: 'encoder', inputs: ['button54', 'button53', 'button52'], view: 'main', label: 'E1',
    anchor: { x: 0.39552941415824144, y: 0.6284722222222222 }, box: { x: 0.3343529435700061, y: 0.9265277438693577 } },
  { id: 'p6b7xkpy', kind: 'axis', inputs: ['slider1'], view: 'p2', label: 'A2',
    anchor: { x: 0.6449411788641237, y: 0.3398611280653212 }, box: { x: 0.8877646891276042, y: 0.10430556403266059 } },
  { id: 'c2kh05ul', kind: 'axis', inputs: ['slider2'], view: 'p2', label: 'A1',
    anchor: { x: 0.685725492589614, y: 0.3798611111111111 }, box: { x: 0.9059608250038297, y: 0.28208334181043837 } },
  { id: '5p5jsedd', kind: 'switch', inputs: ['button45', 'button46'], view: 'main', label: 'T4',
    anchor: { x: 0.357882355334712, y: 0.48125 }, box: { x: 0.07270587995940564, y: 0.6009722391764323 } },
  { id: 'a5ha4o2f', kind: 'switch', inputs: ['button47', 'button48'], view: 'main', label: 'T5',
    anchor: { x: 0.38705883549708947, y: 0.5143055386013455 }, box: { x: 0.12541177188648897, y: 0.7520833333333333 } },
  { id: 'yt7ylqz7', kind: 'switch', inputs: ['button49', 'button50'], view: 'main', label: 'T6',
    anchor: { x: 0.41705883549708944, y: 0.5443055386013456 }, box: { x: 0.23019609039905026, y: 0.8165278116861979 } },
  { id: 'd8bary6z', kind: 'buttons', inputs: ['button33', 'button34', 'button35', 'button36', 'button37', 'button38', 'button39', 'button40'], view: 'main', label: 'B1-B8',
    anchor: { x: 0.4629803945503983, y: 0.48541666666666666 }, box: { x: 0.1, y: 0.28400000000000003 } },
  { id: '81twnl14', kind: 'switch', inputs: ['button42', 'button41'], view: 'main', label: 'T1',
    anchor: { x: 0.5280784337660845, y: 0.53125 }, box: { x: 0.9, y: 0.605 } },
  { id: 'og69opzs', kind: 'axis', inputs: ['x', 'y'], view: 'p2', label: 'Ministick',
    anchor: { x: 0.37121568866804533, y: 0.2965277777777778 }, box: { x: 0.11349019368489584, y: 0.16986109415690104 } },
  { id: 'gm59mkih', kind: 'hat', inputs: ['button10', 'button9', 'button8', 'button11', 'button7'], view: 'p2',
    anchor: { x: 0.40180392396216297, y: 0.3284722222222222 }, box: { x: 0.3381176398782169, y: 0.03 } },
  { id: 'cn1mosed', kind: 'axis', inputs: ['z'], view: 'p2', label: 'Slide',
    anchor: { x: 0.4386666690602022, y: 0.35625 }, box: { x: 0.5395293950099571, y: 0.035416666666666666 } },
  { id: 'e9zw01gc', kind: 'encoder', inputs: ['button4', 'button6', 'button5'], view: 'p2', label: 'Rocker',
    anchor: { x: 0.4637647082758885, y: 0.3909722222222222 }, box: { x: 0.6863529818665748, y: 0.052083333333333336 } },
  { id: 'ptqvje86', kind: 'button', inputs: ['button3'], view: 'p2',
    anchor: { x: 0.4904313749425551, y: 0.42986111111111114 }, box: { x: 0.7785882568359375, y: 0.7765277438693576 } },
  { id: 'y7dbqf07', kind: 'switch', inputs: ['button2', 'button1'], view: 'p2', label: 'Pinky',
    anchor: { x: 0.5625882376876532, y: 0.3840277777777778 }, box: { x: 0.8676862769033394, y: 0.5454166836208767 } },
  { id: 'qhgqpiei', kind: 'axis', inputs: ['rotx'], view: 'p2', label: 'Left Throttle',
    anchor: { x: 0.5084705906288297, y: 0.5326388888888889 }, box: { x: 0.5953725418390012, y: 0.86875 } },
  { id: 'tav9qoc6', kind: 'axis', inputs: ['roty'], view: 'p2', label: 'Right Throttle',
    anchor: { x: 0.4590588259229473, y: 0.4840277777777778 }, box: { x: 0.30486276663985906, y: 0.8609722561306423 } },
]);

// Exact photos and callouts from Federico's export (2026-10-09); retain the built-in metadata.
photoTplExactViews({
  id: 'builtin-virpil-t50cm4', category: 'throttle', name: 'VIRPIL VPC MongoosT-50CM4 throttle', brand: 'VIRPIL',
  notes: VPC_NOTE + ' Shown without the shift layer. Uses buttons above 32: Chrome / Edge only report the first 32, use Firefox.',
  match: [{ name: 'T-50CM4' }, { name: 'MongoosT-50CM4' }],
}, [
  { id: 'left', label: 'Front Grip', photo: 'virpil-t50cm4-front', width: 1657, height: 936 },
  { id: 'panel', label: 'Back Grip and Panel', photo: 'virpil-t50cm4-panel', width: 1777, height: 1004 },
], [
  { id: 'keys', kind: 'buttons', inputs: b(23, 24, 25, 26, 27, 28), label: 'Base keys (23-28)', group: 'Base', view: 'panel',
    anchor: { x: 0.3949438373694259, y: 0.556572892470198 }, box: { x: 0.09794608864153763, y: 0.43249997225674713 } },
  { id: 'jett', kind: 'button', inputs: b(29), label: 'Start', group: 'Base', view: 'panel',
    anchor: { x: 0.5028089887640449, y: 0.5824253035574214 }, box: { x: 0.07134831889291827, y: 0.6579939948505616 } },
  { id: 't1', kind: 'switch', inputs: b(30, 32), label: 'T1 (up / down)', group: 'Base', view: 'panel',
    anchor: { x: 0.5443819881824965, y: 0.5864026150772036 }, box: { x: 0.6477528261334708, y: 0.9304387339724868 } },
  { id: 't2', kind: 'switch', inputs: b(31, 33), label: 'T2 (up / down)', group: 'Base', view: 'panel',
    anchor: { x: 0.5769662749901247, y: 0.6221982670334288 }, box: { x: 0.8556179946727966, y: 0.8747566761391653 } },
  { id: 'e1', kind: 'encoder', inputs: b(43, 42, 41), label: 'Encoder E1', group: 'Base', view: 'panel',
    anchor: { x: 0.47584267948450665, y: 0.6381075131125579 }, box: { x: 0.08033707436550869, y: 0.7971993670165878 } },
  { id: 'e2', kind: 'encoder', inputs: b(46, 45, 44), label: 'Encoder E2', group: 'Base', view: 'panel',
    anchor: { x: 0.5331460331263167, y: 0.6778804765885653 }, box: { x: 0.2859550647521287, y: 0.9204954931034849 } },
  { id: 'b17', kind: 'button', inputs: b(17), label: 'Button 17', group: 'Right grip', view: 'panel',
    anchor: { x: 0.579213517435481, y: 0.2980486298761495 }, box: { x: 0.1277278562259307, y: 0.25068179043856537 } },
  { id: 'h10', kind: 'hat', inputs: b(14, 11, 12, 13, 10), label: 'Hat (4-way + push)', group: 'Right grip', view: 'panel',
    anchor: { x: 0.6353932927163799, y: 0.19066163607702005 }, box: { x: 0.4556179689557365, y: 0.03 } },
  { id: 'b16', kind: 'button', inputs: b(16), label: 'Button 16', group: 'Right grip', view: 'panel',
    anchor: { x: 0.6117977185195751, y: 0.2443551140113579 }, box: { x: 0.19242617958470395, y: 0.12522728659889915 } },
  { id: 'mini', kind: 'axis', inputs: ['x', 'y'], label: 'Ministick', group: 'Right grip', view: 'panel',
    anchor: { x: 0.6837078480238326, y: 0.20855946205513268 }, box: { x: 0.882584303952335, y: 0.03 } },
  { id: 'minib', kind: 'button', inputs: b(15), label: 'Ministick press', group: 'Right grip', view: 'panel',
    anchor: { x: 0.6825842696629213, y: 0.2105481178150238 }, box: { x: 0.9095505275083392, y: 0.03156978217299018 } },
  { id: 'h18', kind: 'hat', inputs: b(22, 19, 20, 21, 18), label: 'Hat (4-way + push)', group: 'Right grip', view: 'panel',
    anchor: { x: 0.6410112702444698, y: 0.28412807748736535 }, box: { x: 0.94, y: 0.40543566160573263 } },
  { id: 'rthr', kind: 'axis', inputs: ['roty'], label: 'Right lever', group: 'Axes', view: 'left',
    anchor: { x: 0.3904494382022472, y: 0.11113872598599772 }, box: { x: 0.5691011407402125, y: 0.045499757574194055 } },
  { id: 'lthr', kind: 'axis', inputs: ['rotx'], label: 'Left lever', group: 'Axes', view: 'left',
    anchor: { x: 0.4938201904296875, y: 0.1787667620941644 }, box: { x: 0.8264045286714361, y: 0.06141222326847653 } },
  { id: 'rot2', kind: 'axis', inputs: ['slider1'], label: 'Rotary (SR)', group: 'Left grip', view: 'left',
    anchor: { x: 0.5949437859353055, y: 0.2941322332234893 }, box: { x: 0.94, y: 0.34385873594101046 } },
  { id: 'rot2b', kind: 'button', inputs: b(2), label: 'Rotary press', group: 'Left grip', view: 'left',
    anchor: { x: 0.5949437859353055, y: 0.2981103686162153 }, box: { x: 0.9061797924256056, y: 0.5626553478981038 } },
  { id: 'wl9', kind: 'axis', inputs: ['slider2'], label: 'Wheel (DL dial)', group: 'Left grip', view: 'left',
    anchor: { x: 0.2720126735063368, y: 0.086 }, box: { x: 0.08820225147718794, y: 0.14893086046365167 } },
  { id: 'wl9b', kind: 'button', inputs: b(9), label: 'Wheel press', group: 'Left grip', view: 'left',
    anchor: { x: 0.2735954884732707, y: 0.08528095974821102 }, box: { x: 0.06, y: 0.46519144809773516 } },
  { id: 'h4', kind: 'hat', inputs: b(7, 8, 5, 6, 4), label: 'Hat (4-way + push)', group: 'Left grip', view: 'left',
    anchor: { x: 0.2984459867229934, y: 0.244 }, box: { x: 0.12640449438202248, y: 0.8968175068611435 } },
  { id: 'b3', kind: 'button', inputs: b(3), label: 'Button 3', group: 'Left grip', view: 'left',
    anchor: { x: 0.371137598068799, y: 0.316 }, box: { x: 0.579213517435481, y: 0.8232222676638878 } },
  { id: 'b1', kind: 'button', inputs: b(1), label: 'Button 1', group: 'Left grip', view: 'left',
    anchor: { x: 0.48083584791792394, y: 0.27 }, box: { x: 0.8331460845604372, y: 0.8112878614857097 } },
  { id: 'paddle', kind: 'axis', inputs: ['rotz'], label: 'Paddle', group: 'Left grip', view: 'panel',
    anchor: { x: 0.6432584269662921, y: 0.4829928948674027 }, box: { x: 0.9061617771682445, y: 0.6470454822887074 } },
]);

/* ------------------------------------------------------------------ WinCtrl (WinWing) */
const WC_NOTE = 'Default numbering from the WinCtrl diagrams (1-based: button N = jsX_buttonN). SimAppPro can change it: if yours differs, use “Customize a copy”.';
tpl('winctrl-carrierace', {
  id: 'builtin-winctrl-carrierace', category: 'stick', name: 'WinCtrl CarrierAce stick (WinCtrl base)', brand: 'WinCtrl', notes: WC_NOTE,
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
  id: 'builtin-winctrl-viperace', category: 'stick', name: 'WinCtrl ViperAce stick (WinCtrl base)', brand: 'WinCtrl',
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
// Exact photos, view sizes and callouts from the supplied Orion export (2026-10-10).
photoTplExactViews({
  id: 'builtin-winctrl-orion', category: 'throttle', name: 'WinCtrl Orion throttle (F-15EX grips, F/A-18 panel)', brand: 'WinCtrl',
  notes: WC_NOTE + ' Uses buttons up to 111: Chrome / Edge only report the first 32, use Firefox.',
  match: [{ name: 'F15EX HANDLE' }, { name: 'Orion Throttle Base II + F15EX' }],
}, [

  { id: 'panel', label: 'Panel', photo: 'winctrl-orion-right', width: 1959, height: 1165 },
  { id: 'left', label: 'Left grip + top row', photo: 'winctrl-orion-left', width: 1966, height: 1216 },
], [
  { id: "lbar", kind: "switch", inputs: ["button65", "button66"], label: "Launch bar", group: "Panel", view: "left",
    anchor: { x: 0.45051543245610504, y: 0.7443055894639757 }, box: { x: 0.6189003121811909, y: 0.9565277947319879 } },
  { id: "hook", kind: "switch", inputs: ["button67", "button68"], label: "Hook", group: "Panel", view: "left",
    anchor: { x: 0.41821304793210373, y: 0.720972188313802 }, box: { x: 0.5034364261168385, y: 0.9643055386013455 } },
  { id: "wfold", kind: "switch", inputs: ["button69", "button70", "button71", "button72"], label: "Wing fold (3 pos + push)", group: "Panel", view: "left",
    anchor: { x: 0.38178691011933524, y: 0.6831944783528646 }, box: { x: 0.34536082474226804, y: 0.97 } },
  { id: "gear", kind: "switch", inputs: ["button73", "button74"], label: "Gear", group: "Panel", view: "left",
    anchor: { x: 0.33092784553868665, y: 0.6509722391764323 }, box: { x: 0.18659792241361953, y: 0.9365277608235677 } },
  { id: "pbrk", kind: "switch", inputs: ["button75", "button76"], label: "Parking brake", group: "Panel", view: "left",
    anchor: { x: 0.3006872852233677, y: 0.6298611111111111 }, box: { x: 0.11030927310694534, y: 0.8576388888888888 } },
  { id: "flap", kind: "switch", inputs: ["button77", "button78", "button79"], label: "Flaps (3 pos)", group: "Panel", view: "left",
    anchor: { x: 0.26219932320191686, y: 0.5943055894639757 }, box: { x: 0.0718212848676439, y: 0.7565277947319878 } },
  { id: "hmd", kind: "encoder", inputs: ["button83", "button84", "button85"], label: "HMD knob", group: "Panel", view: "panel",
    anchor: { x: 0.6248555014096047, y: 0.5531944274902344 }, box: { x: 0.7338563271734362, y: 0.76875 } },
  { id: "roll", kind: "switch", inputs: ["button86", "button87", "button88"], label: "ROLL", group: "Panel", view: "panel",
    anchor: { x: 0.2890352220520674, y: 0.531 }, box: { x: 0.08843928619813171, y: 0.6554167005750868 } },
  { id: "pitch", kind: "switch", inputs: ["button89", "button90", "button91"], label: "PITCH", group: "Panel", view: "panel",
    anchor: { x: 0.3359877488514548, y: 0.568 }, box: { x: 0.085136230871955, y: 0.7854166666666667 } },
  { id: "adv", kind: "button", inputs: ["button92"], label: "ADV MODE", group: "Panel", view: "panel",
    anchor: { x: 0.39516079632465545, y: 0.562 }, box: { x: 0.08777868521302126, y: 0.9131944444444444 } },
  { id: "marm", kind: "switch", inputs: ["button93", "button94", "button95"], label: "Master arm", group: "Panel", view: "panel",
    anchor: { x: 0.47813169984686066, y: 0.622 }, box: { x: 0.5455821735813635, y: 0.97 } },
  { id: "jett", kind: "button", inputs: ["button96"], label: "Jettison", group: "Panel", view: "panel",
    anchor: { x: 0.5038591117917305, y: 0.68 }, box: { x: 0.6466556867226207, y: 0.97 } },
  { id: "aga", kind: "buttons", inputs: ["button81", "button82"], label: "Button · A/G · A/A", group: "Panel", view: "left",
    anchor: { x: 0.44089348127751826, y: 0.5143055386013455 }, box: { x: 0.7687285118496295, y: 0.8743055555555556 } },
  { id: "hdg", kind: "encoder", inputs: ["button97", "button98", "button99"], label: "HDG knob", group: "Panel", view: "panel",
    anchor: { x: 0.3630015313935681, y: 0.649 }, box: { x: 0.19149462749503252, y: 0.97 } },
  { id: "sldw", kind: "axis", inputs: ["slider1"], label: "Slider wheel", group: "Panel", view: "left",
    anchor: { x: 0.45051543245610504, y: 0.42875001695421006 }, box: { x: 0.06, y: 0.3654166751437717 } },
  { id: "sldwb", kind: "switch", inputs: ["button106", "button107", "button108"], label: "Slider wheel (buttons)", group: "Panel", view: "left",
    anchor: { x: 0.45120275962803374, y: 0.42763888041178383 }, box: { x: 0.07457043624825493, y: 0.41875 } },
  { id: "dialw", kind: "axis", inputs: ["slider2"], label: "Dial wheel", group: "Panel", view: "left",
    anchor: { x: 0.35154640223971756, y: 0.5243055555555556 }, box: { x: 0.06, y: 0.5387500339084201 } },
  { id: "dialwb", kind: "switch", inputs: ["button109", "button110", "button111"], label: "Dial wheel (buttons)", group: "Panel", view: "left",
    anchor: { x: 0.35085907506778885, y: 0.5243055555555556 }, box: { x: 0.06, y: 0.6020833333333333 } },
  { id: "crs", kind: "encoder", inputs: ["button100", "button101", "button102"], label: "CRS knob", group: "Panel", view: "panel",
    anchor: { x: 0.40223583460949464, y: 0.684 }, box: { x: 0.3018166804293972, y: 0.97 } },
  { id: "lts", kind: "encoder", inputs: ["button103", "button104", "button105"], label: "Panel lights", group: "Panel", view: "panel",
    anchor: { x: 0.44983154670750386, y: 0.717 }, box: { x: 0.4253509294681565, y: 0.966527811686198 } },
  { id: "lthr", kind: "axis", inputs: ["roty"], label: "Left lever", group: "Axes", view: "panel",
    anchor: { x: 0.3876961189099917, y: 0.45208333333333334 }, box: { x: 0.2819983484723369, y: 0.41097221374511717 } },
  { id: "rthr", kind: "axis", inputs: ["rotx"], label: "Right lever", group: "Axes", view: "panel",
    anchor: { x: 0.4392237517579738, y: 0.4865277608235677 }, box: { x: 0.17233689652308268, y: 0.5043055216471354 } },
  { id: "lbtn", kind: "buttons", inputs: ["button1", "button2", "button30", "button31"], label: "Lever buttons", group: "Axes", view: "left",
    anchor: { x: 0.5563573673418707, y: 0.5131944444444444 }, box: { x: 0.8003436740731046, y: 0.7331944783528646 } },
  { id: "b50", kind: "button", inputs: ["button50"], label: "Button 50", group: "Left grip", view: "left",
    anchor: { x: 0.5886598043015733, y: 0.21763890584309895 }, box: { x: 0.5824742268041238, y: 0.03 } },
  { id: "h51", kind: "hat", inputs: ["button51", "button52", "button53", "button54", "button55"], label: "Hat (4-way + push)", group: "Left grip", view: "left",
    anchor: { x: 0.6113401852112865, y: 0.23541666666666666 }, box: { x: 0.7666666352052459, y: 0.03874999152289497 } },
  { id: "b56", kind: "button", inputs: ["button56"], label: "Button 56", group: "Left grip", view: "left",
    anchor: { x: 0.6477662705883538, y: 0.2465277777777778 }, box: { x: 0.9323024159854221, y: 0.05986111958821615 } },
  { id: "t57", kind: "switch", inputs: ["button57", "button58", "button59"], label: "Toggle (3 pos)", group: "Left grip", view: "left",
    anchor: { x: 0.7151202434526686, y: 0.3076388888888889 }, box: { x: 0.9213058104629779, y: 0.4031944274902344 } },
  { id: "rz", kind: "axis", inputs: ["rotz"], label: "RZ wheel", group: "Left grip", view: "left",
    anchor: { x: 0.7096219406914466, y: 0.24208331637912325 }, box: { x: 0.9103093098119363, y: 0.23208334181043838 } },
  { id: "rzb", kind: "switch", inputs: ["button60", "button61", "button62"], label: "RZ wheel (buttons)", group: "Left grip", view: "left",
    anchor: { x: 0.7109965950353039, y: 0.24097222222222223 }, box: { x: 0.94, y: 0.30541665818956165 } },
  { id: "sw3", kind: "switch", inputs: ["button3", "button4", "button5"], label: "Switch (3 pos)", group: "Right grip", view: "panel",
    anchor: { x: 0.5363336085879439, y: 0.38874999152289497 }, box: { x: 0.8917423314441836, y: 0.7020833333333333 } },
  { id: "h6", kind: "hat", inputs: ["button6", "button7", "button8", "button9", "button10"], label: "Hat (4-way + push)", group: "Right grip", view: "panel",
    anchor: { x: 0.5475639765366949, y: 0.3109722137451172 }, box: { x: 0.8904211294739627, y: 0.5531944274902344 } },
  { id: "b11", kind: "button", inputs: ["button11"], label: "Button 11", group: "Right grip", view: "panel",
    anchor: { x: 0.5099091659785301, y: 0.31430553860134547 }, box: { x: 0.07588769107884755, y: 0.3898611280653212 } },
  { id: "h12", kind: "hat", inputs: ["button12", "button13", "button14", "button15", "button16"], label: "Hat (4-way + push)", group: "Right grip", view: "panel",
    anchor: { x: 0.5051454823889739, y: 0.255 }, box: { x: 0.13732451510567195, y: 0.27652778625488283 } },
  { id: "h17", kind: "hat", inputs: ["button17", "button18", "button19", "button20", "button21"], label: "Hat (4-way + push)", group: "Right grip", view: "panel",
    anchor: { x: 0.5442609212105182, y: 0.22875001695421007 }, box: { x: 0.8765482567835209, y: 0.28208334181043837 } },
  { id: "slide", kind: "switch", inputs: ["button22", "button23", "button24"], label: "Slide (3 pos)", group: "Right grip", view: "panel",
    anchor: { x: 0.540297264899231, y: 0.15541665818956163 }, box: { x: 0.16969446738232866, y: 0.03 } },
  { id: "wh5", kind: "switch", inputs: ["button43", "button25", "button26", "button27", "button44"], label: "Wheel (5-way)", group: "Right grip", view: "panel",
    anchor: { x: 0.5680429094788656, y: 0.0865277820163303 }, box: { x: 0.8943848361858743, y: 0.03 } },
  { id: "h28", kind: "hat", inputs: ["button28", "button29", "button32", "button33", "button34"], label: "Hat (4-way + push)", group: "Right grip", view: "left",
    anchor: { x: 0.45670100995355456, y: 0.16430553860134547 }, box: { x: 0.1515463865090072, y: 0.06430555979410807 } },
  { id: "mini", kind: "axis", inputs: ["x", "y"], label: "Ministick", group: "Right grip", view: "left",
    anchor: { x: 0.502749151380611, y: 0.1931944529215495 }, box: { x: 0.30618553554888855, y: 0.2731944613986545 } },
  { id: "minib", kind: "hat", inputs: ["button36", "button37", "button38", "button39", "button35"], label: "Ministick (digital + press)", group: "Right grip", view: "left",
    anchor: { x: 0.502749151380611, y: 0.19763887193467883 }, box: { x: 0.1384879567778807, y: 0.19430554707845052 } },
  { id: "zw", kind: "axis", inputs: ["z"], label: "Z wheel", group: "Right grip", view: "left",
    anchor: { x: 0.5419243881382894, y: 0.19763887193467883 }, box: { x: 0.8463917630644598, y: 0.4943055894639757 } },
  { id: "zwb", kind: "switch", inputs: ["button40", "button41", "button42"], label: "Z wheel (buttons)", group: "Right grip", view: "left",
    anchor: { x: 0.5439862647826729, y: 0.19875000847710503 }, box: { x: 0.8237113297190454, y: 0.5943055894639757 } },
  { id: "2hzsw5t4", kind: "button", inputs: ["button80"], view: "left",
    anchor: { x: 0.42027492457648735, y: 0.5420833163791232 }, box: { x: 0.6250858896786404, y: 0.82875001695421 } },
]);
// WinCtrl URSA MINOR Combat: exact callouts from Federico's export (2026-10-06) — photoTplExactViews.
photoTplExactViews({
  id: 'builtin-winctrl-ursa-combat', category: 'throttle', name: 'WinCtrl URSA MINOR throttle (Combat grip)', brand: 'WinCtrl',
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
  id: 'builtin-moza-ab6', category: 'stick', name: 'MOZA AB6/9 base + MHG grip', brand: 'MOZA',
  notes: MOZA_NOTE + ' MHG 1-24, ministick 25-29, base 49-62. Positions from published export. AB9 reference photo has an MH16 grip; choose that grip under Grips for this base. 128+ buttons: Chrome / Edge cap at 32 — use Firefox.',
  match: [{ vendor: '346E', product: '1002' }, { name: 'AB6' }, { name: 'MOZA AB6' }, { vendor: '346E', product: '1000' }, { name: 'AB9' }],
}, [
  { id: 'front', label: 'Front', photo: 'moza-ab6-front', width: 1594, height: 990 },
  { id: 'back', label: 'Back', photo: 'moza-ab6-back', width: 1594, height: 990 },
  { id: 'ab9', label: 'AB9 base (MH16 reference)', photo: 'moza-ab9-main', ...pageSizeForPhoto(DEVICE_PHOTO_SIZES['moza-ab9-main'][0], DEVICE_PHOTO_SIZES['moza-ab9-main'][1]) },
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

// MOZA AB6/9 base fitted with other grips: grip variants of the AB6 above (same USB id 346E:1002 and button count whatever grip is
// fitted, so they have no match rules and are never picked automatically; the template pickers list them under the AB6).
// Base controls keep the AB6's numbers (keys 49-56, levers S1 / S2 + zones 57-62).
const AB6_GRIP_NOTE = 'Never picked automatically (same USB ids as its base: AB6 346E:1002, AB9 346E:1000): pick it under “Grips for this base”. Base 49-62, S1, S2 as on the AB6/9. Buttons above 32: use Firefox.';
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
  id: 'builtin-moza-ab6-mh16', category: 'stick', name: 'MOZA AB6/9 base + MH16 grip', brand: 'MOZA', variantOf: 'builtin-moza-ab6', match: [],
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
  id: 'builtin-moza-ab6-carrierace', category: 'stick', name: 'MOZA AB6/9 base + WinCtrl CarrierAce grip', brand: 'MOZA', variantOf: 'builtin-moza-ab6', match: [],
  notes: AB6_WC_NOTE + ' Not on MOZA’s supported-grip list: check your AB6/9 firmware. ' + AB6_GRIP_NOTE,
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
  id: 'builtin-moza-ab6-viperace', category: 'stick', name: 'MOZA AB6/9 base + WinCtrl ViperAce EX grip', brand: 'MOZA', variantOf: 'builtin-moza-ab6', match: [],
  notes: AB6_WC_NOTE + ' Wheel / EX trigger 1 / 2 / 41 / 42 / 3 (SimAppPro: 42 / 43). ' + AB6_GRIP_NOTE,
}, [
  { id: 'front', label: 'Front (on the AB6/9)', photo: 'moza-ab6-viperace-front', width: 1140, height: 986 },
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

photoTplExactViews({
  id: 'builtin-moza-mtp', category: 'throttle', name: 'MOZA MTP throttle', brand: 'MOZA',
  notes: MOZA_NOTE + ' Uses buttons up to 71: Chrome / Edge only report the first 32, use Firefox.',
  match: [{ name: 'MOZA MTP' }, { name: 'MTP Throttle' }],
}, [
  {"id": "panel", "label": "Panel (right grip)", "width": 1495, "height": 842, "photo": "moza-mtp-main"},
  {"id": "panel2", "label": "Panel (front grip)", "width": 1631, "height": 921, "photo": "moza-mtp-front"},
], [
  {"id": "lgen", "kind": "switch", "inputs": ["button21", "button20"], "label": "L GEN", "group": "Panel", "view": "panel2",
    "anchor": {"x": 0.2832156671262255, "y": 0.5509722391764323}, "box": {"x": 0.1188235294117647, "y": 0.4643055386013455}},
  {"id": "s24", "kind": "switch", "inputs": ["button24", "button23", "button22"], "label": "Switch (3 pos)", "group": "Panel", "view": "panel2",
    "anchor": {"x": 0.3152157054227941, "y": 0.5309722052680121}, "box": {"x": 0.10250981349571078, "y": 0.3254166497124566}},
  {"id": "rgen", "kind": "switch", "inputs": ["button26", "button25"], "label": "R GEN", "group": "Panel", "view": "panel2",
    "anchor": {"x": 0.34407844094669116, "y": 0.5176389058430989}, "box": {"x": 0.19223529890471813, "y": 0.20097223917643228}},
  {"id": "s29", "kind": "switch", "inputs": ["button29", "button28", "button27"], "label": "Switch (3 pos)", "group": "Panel", "view": "panel2",
    "anchor": {"x": 0.3271372357536765, "y": 0.5998611450195312}, "box": {"x": 0.0981176518458946, "y": 0.7254166497124566}},
  {"id": "s31", "kind": "switch", "inputs": ["button31", "button30"], "label": "Switch", "group": "Panel", "view": "panel2",
    "anchor": {"x": 0.3585097847732843, "y": 0.57875001695421}, "box": {"x": 0.19223529890471813, "y": 0.8654166327582465}},
  {"id": "s33", "kind": "switch", "inputs": ["button33", "button32"], "label": "Switch", "group": "Panel", "view": "panel2",
    "anchor": {"x": 0.39364707797181375, "y": 0.5554167005750869}, "box": {"x": 0.3164705882352941, "y": 0.8954166836208768}},
  {"id": "rot4", "kind": "switch", "inputs": ["button34", "button35", "button36", "button37"], "label": "Rotary (4 pos)", "group": "Panel", "view": "panel",
    "anchor": {"x": 0.42644757433489827, "y": 0.38319443596733943}, "box": {"x": 0.251799677459287, "y": 0.09430554707845053}},
  {"id": "rot8", "kind": "switch", "inputs": ["button38", "button39", "button40", "button41", "button42", "button43", "button44", "button45"], "label": "Rotary (8 pos)", "group": "Panel", "view": "panel",
    "anchor": {"x": 0.4777777586744425, "y": 0.43874999152289496}, "box": {"x": 0.08153365587404636, "y": 0.15208333333333332}},
  {"id": "probe", "kind": "switch", "inputs": ["button48", "button47", "button46"], "label": "PROBE (3 pos)", "group": "Panel", "view": "panel",
    "anchor": {"x": 0.35100334448160536, "y": 0.42499999999999993}, "box": {"x": 0.06338028169014084, "y": 0.39763887193467884}},
  {"id": "reset", "kind": "button", "inputs": ["button64"], "label": "RESET", "group": "Panel", "view": "panel2",
    "anchor": {"x": 0.6803921568627451, "y": 0.6209721883138021}, "box": {"x": 0.8661176853553921, "y": 0.7843055725097656}},
  {"id": "form", "kind": "encoder", "inputs": ["button49", "button50"], "label": "FORMATION", "group": "Panel", "view": "panel",
    "anchor": {"x": 0.41987290969899665, "y": 0.487}, "box": {"x": 0.8189358181423612, "y": 0.7920833163791232}},
  {"id": "pos", "kind": "encoder", "inputs": ["button51", "button52"], "label": "POSITION", "group": "Panel", "view": "panel",
    "anchor": {"x": 0.3596120401337793, "y": 0.506}, "box": {"x": 0.7801251956181534, "y": 0.8798611111111111}},
  {"id": "rtrim", "kind": "encoder", "inputs": ["button62", "button63", "button65"], "label": "RUD TRIM", "group": "Panel", "view": "panel2",
    "anchor": {"x": 0.6483921664368872, "y": 0.627638922797309}, "box": {"x": 0.7180392156862745, "y": 0.8887500339084201}},
  {"id": "light", "kind": "encoder", "inputs": ["button66", "button67"], "label": "LIGHT", "group": "Panel", "view": "panel2",
    "anchor": {"x": 0.42, "y": 0.4720833248562283}, "box": {"x": 0.2832156671262255, "y": 0.08208334181043837}},
  {"id": "apu", "kind": "switch", "inputs": ["button54", "button53"], "label": "APU", "group": "Panel", "view": "panel",
    "anchor": {"x": 0.2774647696290591, "y": 0.4865277608235677}, "box": {"x": 0.06964006259780908, "y": 0.5065277947319878}},
  {"id": "crank", "kind": "switch", "inputs": ["button55", "button56", "button57"], "label": "ENG CRANK (3 pos)", "group": "Panel", "view": "panel",
    "anchor": {"x": 0.25242564599838613, "y": 0.5365277608235677}, "box": {"x": 0.09154929577464789, "y": 0.7065277947319879}},
  {"id": "strobe", "kind": "switch", "inputs": ["button59", "button58"], "label": "STROBE", "group": "Panel", "view": "panel",
    "anchor": {"x": 0.30563378371356614, "y": 0.56875}, "box": {"x": 0.176056338028169, "y": 0.7787500169542101}},
  {"id": "intr", "kind": "switch", "inputs": ["button61", "button60"], "label": "INTR WING", "group": "Panel", "view": "panel",
    "anchor": {"x": 0.33380279779807315, "y": 0.6065277947319878}, "box": {"x": 0.25367763083492273, "y": 0.8631944444444445}},
  {"id": "rzs", "kind": "axis", "inputs": ["rotz"], "label": "MIN / MAX slider", "group": "Panel", "view": "panel2",
    "anchor": {"x": 0.7349803730085784, "y": 0.5920833163791233}, "box": {"x": 0.8937254901960784, "y": 0.5554167005750869}},
  {"id": "lthr", "kind": "axis", "inputs": ["rotx"], "label": "Left lever", "group": "Axes", "view": "panel",
    "anchor": {"x": 0.5021909137660162, "y": 0.14208331637912328}, "box": {"x": 0.41330204398046266, "y": 0.03}},
  {"id": "rthr", "kind": "axis", "inputs": ["roty"], "label": "Right lever", "group": "Axes", "view": "panel",
    "anchor": {"x": 0.577308284658035, "y": 0.17319446139865452}, "box": {"x": 0.6699530134365219, "y": 0.03}},
  {"id": "mini", "kind": "axis", "inputs": ["x", "y"], "label": "Ministick", "group": "Grip", "view": "panel2",
    "anchor": {"x": 0.582942097026604, "y": 0.16652776930067276}, "box": {"x": 0.8472941559436274, "y": 0.062083329094780815}},
  {"id": "minib", "kind": "button", "inputs": ["button1"], "label": "Ministick press", "group": "Grip", "view": "panel2",
    "anchor": {"x": 0.5848200504022398, "y": 0.16763890584309896}, "box": {"x": 0.7192940984987745, "y": 0.04541666242811415}},
  {"id": "s69", "kind": "switch", "inputs": ["button69", "button2", "button68"], "label": "Switch (3 pos)", "group": "Grip", "view": "panel2",
    "anchor": {"x": 0.5611764705882353, "y": 0.31763890584309895}, "box": {"x": 0.8742744715073529, "y": 0.4265277862548828}},
  {"id": "b3", "kind": "button", "inputs": ["button3"], "label": "Button 3", "group": "Grip", "view": "panel2",
    "anchor": {"x": 0.5229019703584559, "y": 0.20652779473198785}, "box": {"x": 0.8372549019607843, "y": 0.20986111958821616}},
  {"id": "b4", "kind": "button", "inputs": ["button4"], "label": "Button 4", "group": "Grip", "view": "panel2",
    "anchor": {"x": 0.4940392348345588, "y": 0.2231944613986545}, "box": {"x": 0.869254940257353, "y": 0.29208331637912327}},
  {"id": "s5", "kind": "switch", "inputs": ["button5", "button6", "button7"], "label": "Switch (3 pos)", "group": "Grip", "view": "panel2",
    "anchor": {"x": 0.44635292202818627, "y": 0.3076388888888889}, "box": {"x": 0.4137254901960784, "y": 0.0509722179836697}},
  {"id": "h11", "kind": "hat", "inputs": ["button11", "button12", "button13", "button14", "button15"], "label": "Hat (4-way + push)", "group": "Grip", "view": "panel",
    "anchor": {"x": 0.653051624089153, "y": 0.2076388888888889}, "box": {"x": 0.897183079488214, "y": 0.17763888041178386}},
  {"id": "h70", "kind": "hat", "inputs": ["button70", "button10", "button71", "button8", "button9"], "label": "Hat (4-way + push)", "group": "Grip", "view": "panel",
    "anchor": {"x": 0.6824725752518583, "y": 0.14541668362087673}, "box": {"x": 0.8984350165664123, "y": 0.05652777353922526}},
  {"id": "slide", "kind": "switch", "inputs": ["button16", "button17", "button18"], "label": "Slide (3 pos)", "group": "Grip", "view": "panel",
    "anchor": {"x": 0.6499217336353189, "y": 0.3065277947319878}, "box": {"x": 0.9372457346072965, "y": 0.34541668362087674}},
  {"id": "b19", "kind": "button", "inputs": ["button19"], "label": "Button 19", "group": "Grip", "view": "panel",
    "anchor": {"x": 0.6167449234796801, "y": 0.36875}, "box": {"x": 0.8865414710485133, "y": 0.6454166836208768}},
]);
tpl('moza-mtq', {
  id: 'builtin-moza-mtq', category: 'throttle', name: 'MOZA MTQ throttle quadrant', brand: 'MOZA',
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
  id: 'builtin-vkb-gladiator-scg', category: 'stick', name: 'VKB Gladiator NXT EVO (Space Combat Grip)', brand: 'VKB', notes: OPEN_NOTE,
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
// Exact photos, view sizes and callouts from the supplied export (2026-10-10, corrected v2).
photoTplExactViews({
  id: 'builtin-vkb-gunfighter-mcg', category: 'stick', name: 'VKB Gunfighter + MCG Pro', brand: 'VKB', notes: OPEN_NOTE,
  match: [{ name: 'Gunfighter' }, { vendor: '231D', product: '0125' }],
}, [
  { id: 'front', label: 'Front', width: 1364, height: 895, photo: 'vkb-gunfighter-mcg-front' },
  { id: 'thumb', label: 'Right side', width: 1364, height: 901, photo: 'vkb-gunfighter-mcg-thumb' },
], [
  { id: 'apoff', kind: 'button', inputs: ['button4'], label: 'AP OFF (red)', group: 'Grip head', view: 'front',
    anchor: { x: 0.4334017003893491, y: 0.0798611111111111 }, box: { x: 0.1610950832751711, y: 0.14923075581644918 } },
  { id: 'gca', kind: 'axis', inputs: ['rotz', 'slider1'], label: 'GATE CONT ministick (analog)', group: 'Grip head', view: 'front',
    anchor: { x: 0.4445761278095089, y: 0.1543055640326606 }, box: { x: 0.1829971181556196, y: 0.6063736129593064 } },
  { id: 'manvr', kind: 'hat', inputs: ['button14', 'button15', 'button16', 'button17', 'button18'], label: 'MANVR hat', group: 'Grip', view: 'front',
    anchor: { x: 0.4927610579920213, y: 0.1620833502875434 }, box: { x: 0.8262247310935249, y: 0.30923079605940934 } },
  { id: 'flip', kind: 'button', inputs: ['button3'], label: 'Flip trigger', group: 'Grip', view: 'thumb',
    anchor: { x: 0.5763302864284691, y: 0.28541666666666665 }, box: { x: 0.8587808595167362, y: 0.28989009647578984 } },
  { id: 'trig', kind: 'switch', inputs: ['button1', 'button2'], label: 'Trigger (stage 1 / 2)', group: 'Grip', view: 'thumb',
    anchor: { x: 0.5396439385608847, y: 0.29208331637912327 }, box: { x: 0.8332366278970882, y: 0.6450549450549451 } },
  { id: 'reset', kind: 'hat', inputs: ['button10', 'button11', 'button12', 'button13', 'button9'], label: 'RESET hat', group: 'Grip', view: 'thumb',
    anchor: { x: 0.445428103597832, y: 0.29164837847699177 }, box: { x: 0.1702467166806513, y: 0.3672527606670673 } },
  { id: 'brakea', kind: 'axis', inputs: ['slider2'], label: 'Brake lever (analog)', group: 'Grip', view: 'front',
    anchor: { x: 0.43072014585232454, y: 0.44319445292154946 }, box: { x: 0.7282420221598073, y: 0.8753845885559752 } },
  { id: 'lvl', kind: 'button', inputs: ['button5'], label: 'LVLNG', group: 'Grip head', view: 'thumb',
    anchor: { x: 0.5422360703812316, y: 0.065 }, box: { x: 0.1150079169944925, y: 0.05466592427616926 } },
  { id: 'mmode', kind: 'hat', inputs: ['hat1_up', 'hat1_right', 'hat1_down', 'hat1_left', ''], label: 'MASTER MODE hat', group: 'Grip head', view: 'front',
    anchor: { x: 0.4768353524372213, y: 0.07319444020589193 }, box: { x: 0.7707364421441527, y: 0.03319443596733941 } },
  { id: 'dc', kind: 'hat', inputs: ['button19', 'button22', 'button21', 'button20', 'button23'], label: 'DC hat', group: 'Grip head', view: 'thumb',
    anchor: { x: 0.6110030389689954, y: 0.1909722222222222 }, box: { x: 0.8791402014201253, y: 0.1398611280653212 } },
  { id: 'gun', kind: 'button', inputs: ['button6'], label: 'GUN button', group: 'Grip', view: 'thumb',
    anchor: { x: 0.5331854838709676, y: 0.15 }, box: { x: 0.1150079169944925, y: 0.1603340757238307 } },
  { id: 'ring', kind: 'button', inputs: ['button7'], label: 'Ring-finger button', group: 'Grip', view: 'front',
    anchor: { x: 0.48181085043988275, y: 0.378 }, box: { x: 0.8227664826582763, y: 0.6485714419857487 } },
  { id: 'xy', kind: 'axis', inputs: ['x', 'y'], label: 'Stick X / Y', group: 'Axes', view: 'thumb',
    anchor: { x: 0.48142236895069845, y: 0.4569230635087569 }, box: { x: 0.1261247654265693, y: 0.6538461538461539 } },
  { id: '6dmumr55', kind: 'axis', inputs: ['z'], label: 'Twist', view: 'thumb',
    anchor: { x: 0.5098450207775467, y: 0.6270833333333333 }, box: { x: 0.2143686679347333, y: 0.9 } },
  { id: '1hu0ipa2', kind: 'button', inputs: ['button8'], label: 'GATE CONT Push', view: 'front',
    anchor: { x: 0.44697408098995856, y: 0.15450550121265452 }, box: { x: 0.11959654178674352, y: 0.41824173141311816 } },
]);
// VKB default button map supplied 2026-10-10. Keep the existing photo anchors and label boxes exact
// while correcting kinds and numbering. No separate gear lever appears in the diagram.
// Hats: up / right / down / left / depress. Use the diagram's explicit Up/Down annotations;
// the ministick's perpendicular PUSH/PULL pair occupies right/left. Encoders: CW / CCW / depress.
photoTplExactViews({
  id: 'builtin-vkb-stecs', category: 'throttle', name: 'VKB STECS Mk.II + STEM module', brand: 'VKB',
  notes: 'Numbering from VKB\'s default button map (DirectInput button N = buttonN); VKBDevCfg can change it. Uses buttons above 32: use Firefox to capture them. The diagram leaves axis identifiers, encoder depresses and the unlabelled top up/down pair unassigned; Customize a copy to set them. Existing photo positions include estimated placements.',
  match: [{ name: 'STECS' }],
}, [
  { id: 'front', label: 'Thumb side', width: 1365, height: 738, photo: 'vkb-stecs-front' },
  { id: 'stem', label: 'STEM module', width: 1365, height: 738, photo: 'vkb-stecs-front' },
  { id: 'back', label: 'Grip front + base', width: 1313, height: 819, photo: 'vkb-stecs-back' },
], [
  { id: 'mtgl', kind: 'axis', inputs: [''], label: 'Left lever (MTG-L)', group: 'Levers', view: 'back',
    anchor: { x: 0.5125209444021326, y: 0.17 }, box: { x: 0.115, y: 0.05 } },
  { id: 'mtgr', kind: 'axis', inputs: [''], label: 'Right lever (MTG-R)', group: 'Levers', view: 'back',
    anchor: { x: 0.6001675552170601, y: 0.14 }, box: { x: 0.885, y: 0.05 } },
  { id: 'radio', kind: 'hat', inputs: ['button34', '', 'button33', '', 'button22'], label: 'Top hat (LEFT up / RIGHT down + depress)', group: 'Right grip', view: 'front',
    anchor: { x: 0.6161787545787546, y: 0.187 }, box: { x: 0.125, y: 0.0895284552845528 } },
  { id: 'brk', kind: 'hat', inputs: ['button25', 'button27', 'button26', 'button28', 'button20'], label: 'Ministick (LEFT up / RIGHT down; PUSH / PULL)', group: 'Right grip', view: 'front',
    anchor: { x: 0.6553553113553113, y: 0.23699999999999996 }, box: { x: 0.125, y: 0.24899999999999997 } },
  { id: 'opex', kind: 'button', inputs: ['button24'], label: 'DEPRESS 24 (button)', group: 'Right grip', view: 'front',
    anchor: { x: 0.6283369963369962, y: 0.323 }, box: { x: 0.125, y: 0.4084715447154471 } },
  { id: 'ots', kind: 'axis', inputs: ['', ''], label: 'Ministick H / V axes', group: 'Right grip', view: 'front',
    anchor: { x: 0.6783208791208791, y: 0.143 }, box: { x: 0.885, y: 0.05 } },
  { id: 'otsb', kind: 'switch', inputs: ['', ''], label: 'Unlabelled top pair (up / down)', group: 'Right grip', view: 'front',
    anchor: { x: 0.6823736263736264, y: 0.152 }, box: { x: 0.875, y: 0.2779065040650407 } },
  { id: 'senc', kind: 'switch', inputs: ['button14', 'button15'], label: 'Roller (forward / backward)', group: 'Right grip', view: 'back',
    anchor: { x: 0.664024371667936, y: 0.168 }, box: { x: 0.885, y: 0.20184126984126982 } },
  { id: 'rew', kind: 'buttons', inputs: ['button11', 'button18', 'button10'], label: 'RST / ENT / RED BUTTON', group: 'Right grip', view: 'back',
    anchor: { x: 0.664024371667936, y: 0.248 }, box: { x: 0.885, y: 0.4542222222222222 } },
  { id: 'fwdr', kind: 'button', inputs: ['button16'], label: 'R TRIG (pair 1)', group: 'Right grip', view: 'back',
    anchor: { x: 0.6439908606245239, y: 0.335 }, box: { x: 0.885, y: 0.5804126984126985 } },
  { id: 'aftr', kind: 'button', inputs: ['button17'], label: 'R TRIG (pair 2)', group: 'Right grip', view: 'back',
    anchor: { x: 0.43739527798933736, y: 0.29 }, box: { x: 0.115, y: 0.4702539682539682 } },
  { id: 'mb1', kind: 'hat', inputs: ['button32', 'button30', 'button31', 'button29', 'button21'], label: '4-way (PULL up / PUSH down + depress)', group: 'Left grip', view: 'back',
    anchor: { x: 0.597037319116527, y: 0.326 }, box: { x: 0.875, y: 0.8408095238095239 } },
  { id: 'mb2', kind: 'button', inputs: ['button23'], label: 'DEPRESS 23 (button)', group: 'Left grip', view: 'back',
    anchor: { x: 0.5838903274942879, y: 0.252 }, box: { x: 0.125, y: 0.20985714285714285 } },
  { id: 'renc', kind: 'switch', inputs: ['button13', 'button12'], label: 'Roller (forward / backward)', group: 'Left grip', view: 'back',
    anchor: { x: 0.6283396801218584, y: 0.207 }, box: { x: 0.885, y: 0.328031746031746 } },
  { id: 'fwdl', kind: 'button', inputs: ['button8'], label: 'L TRIG (pair 1)', group: 'Left grip', view: 'back',
    anchor: { x: 0.6377303884234578, y: 0.35 }, box: { x: 0.885, y: 0.7066031746031747 } },
  { id: 'aftl', kind: 'button', inputs: ['button9'], label: 'L TRIG (pair 2)', group: 'Left grip', view: 'back',
    anchor: { x: 0.43739527798933736, y: 0.26 }, box: { x: 0.115, y: 0.344063492063492 } },
  { id: 'mode', kind: 'buttons', inputs: ['button3', 'button4', 'button5', 'button6', 'button7'], label: 'Base buttons 1-5', group: 'Base', view: 'back',
    anchor: { x: 0.4561766945925362, y: 0.563 }, box: { x: 0.115, y: 0.5964444444444444 } },
  { id: 'start', kind: 'button', inputs: ['button2'], label: 'RED START', group: 'Base', view: 'back',
    anchor: { x: 0.49624371667936024, y: 0.606 }, box: { x: 0.115, y: 0.7146190476190476 } },
  { id: 'sys', kind: 'button', inputs: ['button1'], label: 'DOT', group: 'Base', view: 'back',
    anchor: { x: 0.536936785986291, y: 0.6819999999999999 }, box: { x: 0.115, y: 0.8247777777777777 } },
  { id: 'sw1', kind: 'switch', inputs: ['button43', 'button44', 'button45'], label: 'SW1 (up / center / down)', group: 'STEM', view: 'stem',
    anchor: { x: 0.29736263736263735, y: 0.585 }, box: { x: 0.885, y: 0.4863211382113821 } },
  { id: 'sw2', kind: 'switch', inputs: ['button46', 'button47', 'button48'], label: 'SW2 (up / center / down)', group: 'STEM', view: 'stem',
    anchor: { x: 0.38179487179487187, y: 0.56 }, box: { x: 0.885, y: 0.34534552845528455 } },
  { id: 'tgl', kind: 'switch', inputs: ['button49', 'button50'], label: 'TGL (UP / DN)', group: 'STEM', view: 'stem',
    anchor: { x: 0.22306227106227108, y: 0.625 }, box: { x: 0.115, y: 0.447479674796748 } },
  { id: 'en1', kind: 'encoder', inputs: ['button52', 'button51', ''], label: 'EN1 (CW / CCW / depress)', group: 'STEM', view: 'stem',
    anchor: { x: 0.2500805860805861, y: 0.615 }, box: { x: 0.115, y: 0.3065040650406504 } },
  { id: 'en2', kind: 'encoder', inputs: ['button54', 'button53', ''], label: 'EN2 (CW / CCW / depress)', group: 'STEM', view: 'stem',
    anchor: { x: 0.24332600732600732, y: 0.655 }, box: { x: 0.115, y: 0.5884552845528456 } },
  { id: 'b15', kind: 'buttons', inputs: ['button38', 'button39', 'button40', 'button41', 'button42'], label: 'B1-B5', group: 'STEM', view: 'stem',
    anchor: { x: 0.45271794871794874, y: 0.66 }, box: { x: 0.885, y: 0.7682723577235773 } },
  { id: 'a12', kind: 'buttons', inputs: ['button35', 'button36'], label: 'A1 / A2', group: 'STEM', view: 'stem',
    anchor: { x: 0.35815384615384616, y: 0.655 }, box: { x: 0.885, y: 0.6272967479674797 } },
  { id: 'c1', kind: 'button', inputs: ['button37'], label: 'C1', group: 'STEM', view: 'stem',
    anchor: { x: 0.31424908424908427, y: 0.68 }, box: { x: 0.885, y: 0.9 } },
  { id: 'mlev', kind: 'switch', inputs: ['button57', 'button58'], label: 'Slider (UP / DN)', group: 'STEM', view: 'stem',
    anchor: { x: 0.2163076923076923, y: 0.69 }, box: { x: 0.115, y: 0.9 } }
]);

/* ------------------------------------------------------------------ Logitech */
tpl('logitech-x56-stick', {
  id: 'builtin-logitech-x56-stick', category: 'stick', name: 'Logitech G X56 stick', brand: 'Logitech', notes: OPEN_NOTE,
  match: [{ name: 'X56 H.O.T.A.S. Stick' }, { name: 'X56 HOTAS Stick' }, { name: 'X-56 Rhino Stick' }],
}, [
  c('a', 'button', u(1), 'Fire button A (red)', 'Grip head', { side: 'L' }), c('h2', 'hat', u(4), 'Thumb hat', 'Grip', { side: 'L' }),
  c('trig', 'button', u(1), 'Trigger', 'Grip', { side: 'L' }), c('mini', 'axis', ['', ''], 'Thumb ministick', 'Grip', { side: 'L' }),
  c('d', 'button', u(1), 'Pinkie button', 'Grip', { side: 'L' }), c('fp', 'button', u(1), 'Flying pinkie', 'Grip', { side: 'L' }),
  c('pov', 'hat', u(4), 'POV hat', 'Grip head', { side: 'R' }), c('b', 'button', u(1), 'Button B', 'Grip head', { side: 'R' }),
  c('h1', 'hat', u(4), 'Hat 1', 'Grip head', { side: 'R' }), c('c', 'button', u(1), 'Button C', 'Grip', { side: 'R' }),
  c('twist', 'axis', [''], 'Twist', 'Axes', { side: 'R' }), c('xy', 'axis', ['x', 'y'], 'Stick X / Y', 'Axes', { side: 'R' }),
]);
photoTplExactViews({
  id: 'builtin-logitech-x56-throttle', category: 'throttle', name: 'Logitech G X56 throttle', brand: 'Logitech', notes: OPEN_NOTE,
  match: [{ name: 'X56 H.O.T.A.S. Throttle' }, { name: 'X56 HOTAS Throttle' }, { name: 'X-56 Rhino Throttle' }],
}, [
  {"id": "main", "label": "Front", "width": 1498, "height": 846, "photo": "logitech-x56-throttle-main"},
], [
  {"id": "mode", "kind": "switch", "inputs": ["", "", ""], "label": "Mode switch (M1 / M2 / S1)", "group": "Base", "view": "main",
    "anchor": {"x": 0.25745660881174903, "y": 0.509}, "box": {"x": 0.10564706839767157, "y": 0.616527811686198}},
  {"id": "rty3", "kind": "encoder", "inputs": ["button14", "button15"], "label": "Rotary 1", "group": "Base", "view": "main",
    "anchor": {"x": 0.5356875834445928, "y": 0.568}, "box": {"x": 0.49529411764705883, "y": 0.927638922797309}},
  {"id": "rty4", "kind": "encoder", "inputs": ["", "button6"], "label": "Rotary 2", "group": "Base", "view": "main",
    "anchor": {"x": 0.5971495327102804, "y": 0.568}, "box": {"x": 0.6433725394454657, "y": 0.9231944613986545}},
  {"id": "hat2", "kind": "hat", "inputs": ["button20", "button21", "button22", "button23"], "label": "Hat 4", "group": "Right grip", "view": "main",
    "anchor": {"x": 0.6044705978094362, "y": 0.4131944444444444}, "box": {"x": 0.9150587852328431, "y": 0.4765277862548828}},
  {"id": "hat1", "kind": "hat", "inputs": ["button24", "button27", "button26", "button25"], "label": "Hat 3", "group": "Right grip", "view": "main",
    "anchor": {"x": 0.6156542056074766, "y": 0.355}, "box": {"x": 0.9338823146446078, "y": 0.3576388888888889}},
  {"id": "slider", "kind": "switch", "inputs": ["button33", ""], "label": "Slider (aft/fwd)", "group": "Right grip", "view": "main",
    "anchor": {"x": 0.6019607843137255, "y": 0.24319445292154948}, "box": {"x": 0.8987451171875, "y": 0.11652776930067274}},
  {"id": "mini", "kind": "axis", "inputs": ["x", "y"], "label": "Ministick", "group": "Right grip", "view": "main",
    "anchor": {"x": 0.5467450788909314, "y": 0.4120833502875434}, "box": {"x": 0.0786666570925245, "y": 0.4554166581895616}},
  {"id": "thumb", "kind": "button", "inputs": ["button1"], "label": "Thumb button", "group": "Right grip", "view": "main",
    "anchor": {"x": 0.5660881174899867, "y": 0.34500000000000003}, "box": {"x": 0.0805490291819853, "y": 0.3443055470784505}},
  {"id": "rty1", "kind": "axis", "inputs": ["z"], "label": "Rotary 1", "group": "Right grip", "view": "main",
    "anchor": {"x": 0.6527843520220589, "y": 0.09875000847710504}, "box": {"x": 0.519764715456495, "y": 0.03}},
  {"id": "rty2", "kind": "axis", "inputs": ["rotz"], "label": "Rotary 2", "group": "Right grip", "view": "main",
    "anchor": {"x": 0.6578038832720589, "y": 0.29875000847710503}, "box": {"x": 0.9288627833946078, "y": 0.19875000847710503}},
  {"id": "lthr", "kind": "axis", "inputs": [""], "label": "Left throttle", "group": "Axes", "view": "main",
    "anchor": {"x": 0.46517645143995096, "y": 0.1609722137451172}, "box": {"x": 0.3836078239889706, "y": 0.03}},
  {"id": "rthr", "kind": "axis", "inputs": [""], "label": "Right throttle", "group": "Axes", "view": "main",
    "anchor": {"x": 0.5793057409879839, "y": 0.18}, "box": {"x": 0.8479215494791666, "y": 0.03}},
  {"id": "lbtn", "kind": "button", "inputs": ["button5"], "label": "Left grip button", "group": "Left grip", "view": "main",
    "anchor": {"x": 0.4137254901960784, "y": 0.22652778625488282}, "box": {"x": 0.07427451937806373, "y": 0.13541666666666666}},
  {"id": "sw", "kind": "buttons", "inputs": ["", "", "", "", "", ""], "label": "SW 1-6", "group": "Base", "view": "main",
    "anchor": {"x": 0.3986666570925245, "y": 0.5765277438693577}, "box": {"x": 0.17529411764705882, "y": 0.8998611450195313}},
  {"id": "tgl", "kind": "buttons", "inputs": ["", "", "", "", "", "", "", ""], "label": "TGL 1-4 (up / down)", "group": "Base", "view": "main",
    "anchor": {"x": 0.7299607460171569, "y": 0.4776388804117839}, "box": {"x": 0.9345098039215687, "y": 0.6576388888888889}},
  {"id": "s1180l6l", "kind": "button", "inputs": ["button2"], "view": "main", "label": "Rotary 1 Push",
    "anchor": {"x": 0.6534117455575981, "y": 0.1009722179836697}, "box": {"x": 0.6195294309129902, "y": 0.03}},
  {"id": "885q69o6", "kind": "button", "inputs": ["button3"], "view": "main", "label": "Rotary 2 Push",
    "anchor": {"x": 0.6578038832720589, "y": 0.29875000847710503}, "box": {"x": 0.916941157322304, "y": 0.26652776930067273}},
  {"id": "5937cajo", "kind": "button", "inputs": ["button4"], "label": "Right grip button", "group": "Left grip", "view": "main",
    "anchor": {"x": 0.4457254806219363, "y": 0.2331944359673394}, "box": {"x": 0.15584314682904413, "y": 0.07319444020589193}},
  {"id": "a4bsyp5h", "kind": "switch", "inputs": ["button28", "button29"], "view": "main", "label": "K1 (up/dn)",
    "anchor": {"x": 0.5219607843137255, "y": 0.2548611111111111}, "box": {"x": 0.08682353898590686, "y": 0.23541666666666666}},
  {"id": "wp84o9ct", "kind": "encoder", "inputs": ["button30", "button31"], "view": "main", "label": "Scroll (fwd/aft)",
    "anchor": {"x": 0.41294117647058826, "y": 0.15763888888888888}, "box": {"x": 0.24996079388786765, "y": 0.03}},
]);



/* ------------------------------------------------------------------ photo-only / new WinCtrl + Azeron (Federico's exports, 2026-10-06) */
// Distinct from builtin-winctrl-orion (the F-15EX throttle): pedals use USB 4098:BEF0 and the "Orion Pedals" / "Combat Rudder" names.
// Exact callouts from Federico's export (anchor + box fractions as saved) — do not run through withPhotoLayout auto-box.
photoTplExact({
  id: 'builtin-winctrl-orion-pedals', category: 'pedals', name: 'WinCtrl Orion Combat Rudder Pedals', brand: 'WinCtrl',
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
// Exact photos and callouts from Federico's export (2026-10-09); retain the built-in metadata.
// Bottom banks repeat the right-bank inputs in the export; preserve the authored numbering.
photoTplExactViews({
  id: 'builtin-winctrl-carrierace-mfd-l', category: 'panel', name: 'WinCtrl CarrierAce MFD', brand: 'WinCtrl', notes: WC_MFD_NOTE,
  match: [{ vendor: '4098', product: 'BEE0' }, { vendor: '4098', product: 'BEE1' }, { vendor: '4098', product: 'BEE2' }, { name: 'CarrierAce MFD' }],
}, [
  { id: 'main', label: 'MFD', photo: 'winctrl-carrierace-mfd-l', width: 2420, height: 1367 },
], [
  { id: 'gain', kind: 'buttons', inputs: b(10, 11), label: 'GAIN (up/dn)', group: 'Bottom', view: 'main',
    anchor: { x: 0.2980237214461617, y: 0.6841598161161847 }, box: { x: 0.10750988443849586, y: 0.9514563127528184 } },
  { id: 'cont', kind: 'buttons', inputs: b(22, 21), label: 'CONT (up/dn)', group: 'Bottom', view: 'main',
    anchor: { x: 0.5644268895326395, y: 0.8968774430343904 }, box: { x: 0.3612359722008866, y: 0.9604673696382734 } },
  { id: 'right', kind: 'buttons', inputs: b(31, 29, 27, 25, 23), label: 'OSB R1 -  R5', group: 'Right', view: 'main',
    anchor: { x: 0.5992095102905756, y: 0.4826379464940635 }, box: { x: 0.94, y: 0.2713198626423433 } },
  { id: 'sym', kind: 'buttons', inputs: b(33, 32), label: 'SYM (up/dn)', group: 'Top', view: 'main',
    anchor: { x: 0.5865612406975667, y: 0.2671215003682502 }, box: { x: 0.7003952448547122, y: 0.09638765634619323 } },
  { id: 'top', kind: 'buttons', inputs: b(42, 40, 38, 36, 34), label: 'OSB T1 - T5', group: 'Top', view: 'main',
    anchor: { x: 0.3984189843942997, y: 0.19434969187203727 }, box: { x: 0.10197628156940927, y: 0.13137409760542323 } },
  { id: 'dayngt', kind: 'buttons', inputs: b(43, 44), label: 'DAY/NGT (up/dn)', group: 'Top', view: 'main',
    anchor: { x: 0.36679843103461585, y: 0.13697192286839277 }, box: { x: 0.2964426877470356, y: 0.03 } },
  { id: 'brt', kind: 'encoder', inputs: b(49, 50, 48), label: 'BRT (− / +)', group: 'Top', view: 'main',
    anchor: { x: 0.45849802371541504, y: 0.16076268690914736 }, box: { x: 0.5114624264683176, y: 0.03 } },
  { id: '736mei3l', kind: 'buttons', inputs: b(30, 28, 26, 24), label: 'ALT OBS R1.5 -  R4.5', group: 'Right', view: 'main',
    anchor: { x: 0.5920948737223629, y: 0.5987929207976925 }, box: { x: 0.94, y: 0.4168634262496965 } },
  { id: 'ijrcuu4a', kind: 'buttons', inputs: b(41, 39, 37, 35), label: 'ALT OBS T1.5 - T4.5', group: 'Top', view: 'main',
    anchor: { x: 0.4885375433759727, y: 0.25032799788680526 }, box: { x: 0.09960474609857492, y: 0.2573252861386513 } },
  { id: '3quc26mn', kind: 'buttons', inputs: b(1, 3, 5, 7, 9), label: 'OSB L1 - L5', group: 'Left', view: 'main',
    anchor: { x: 0.3241106719367589, y: 0.29511065337563425 }, box: { x: 0.06, y: 0.48683630876815653 } },
  { id: 'j0z93r9r', kind: 'buttons', inputs: b(2, 4, 6, 8), label: 'ALT OBS L1.5 - L4.5', group: 'Left', view: 'main',
    anchor: { x: 0.3185770690676723, y: 0.4140645536570163 }, box: { x: 0.07193676190885159, y: 0.6281815101014167 } },
  { id: 'pwbznv1k', kind: 'buttons', inputs: b(12, 14, 16, 18, 20), label: 'OSB B1 -  B5', group: 'Bottom', view: 'main',
    anchor: { x: 0.3557312252964427, y: 0.7457359740864586 }, box: { x: 0.9122529764891613, y: 0.6883582317753505 } },
  { id: 'y0hu82ch', kind: 'buttons', inputs: b(13, 15, 17, 19), label: 'ALT OBS B1.5 -  B4.5', group: 'Bottom', view: 'main',
    anchor: { x: 0.4426877470355731, y: 0.8157088566049187 }, box: { x: 0.9312253205672555, y: 0.8478964252714685 } },
]);
// PTO 2: numbering from Federico's WinCtrl diagram (2026-10-06). Button 2 (MASTER CAUTION) is not numbered there, so not mapped.
const WC_PTO2_NOTE = WC_NOTE + ' Per Federico\'s WinCtrl diagram: 1, 3-41 (switch positions grouped); MASTER CAUTION is not numbered there. Buttons above 32: use Firefox (Chrome / Edge stop at 32).';
photoTpl({
  id: 'builtin-winctrl-carrierace-pto2', category: 'panel', name: 'WinCtrl CarrierAce PTO 2', brand: 'WinCtrl', notes: WC_PTO2_NOTE,
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
// The Oct 9 export numbers COMM rotation too (28/27, 31/30); keep the existing built-in notes as requested.
const WC_UFC_NOTE = WC_NOTE + ' UFC 1-41 (top toggles 33-38), HUD 65-83. Axes: UFC VOL 1/2 = RX/RY, BRT = RZ; HUD BRT = X, BLK LVL = Y, BAL = Z, AOA = Dial. COMM knob turning is not numbered (PULL 29/32 only). Buttons above 32: use Firefox.';
// Exact photos and callouts from Federico's export (2026-10-09); retain the built-in metadata.
photoTplExactViews({
  id: 'builtin-winctrl-carrierace-ufc-hud', category: 'panel', name: 'WinCtrl CarrierAce UFC + HUD', brand: 'WinCtrl', notes: WC_UFC_NOTE,
  match: [{ vendor: '4098', product: 'BEDE' }, { name: 'CarrierAce UFC' }, { name: 'CarrierAce HUD' }, { name: 'UFC+HUD' }],
}, [
  { id: 'ufc', label: 'UFC', photo: 'winctrl-carrierace-ufc', width: 2299, height: 1299 },
  { id: 'hud', label: 'HUD', photo: 'winctrl-carrierace-hud', width: 2042, height: 1314 },
], [
  { id: 'ip', kind: 'button', inputs: b(1), label: 'I/P', group: 'UFC', view: 'ufc',
    anchor: { x: 0.29183672511222036, y: 0.24319445292154948 }, box: { x: 0.14144423168906986, y: 0.1609722137451172 } },
  { id: 'adf', kind: 'switch', inputs: b(39, 40, 41), label: 'ADF (1/OFF/2)', group: 'UFC', view: 'ufc',
    anchor: { x: 0.29246465901564955, y: 0.31763890584309895 }, box: { x: 0.07770800627943485, y: 0.2620833502875434 } },
  { id: 'vol1', kind: 'axis', inputs: ['rotx'], label: 'COMM 1 VOL (RX)', group: 'UFC', view: 'ufc',
    anchor: { x: 0.2830455067393544, y: 0.4231944613986545 }, box: { x: 0.0660609650835252, y: 0.4366836027713625 } },
  { id: 'comm1', kind: 'encoder', inputs: b(28, 27, 29), label: 'COMM 1 channel (− / + / PULL)', group: 'UFC', view: 'ufc',
    anchor: { x: 0.3094191618579523, y: 0.6343055725097656 }, box: { x: 0.0978022025930264, y: 0.6865277608235677 } },
  { id: 'keypad', kind: 'buttons', inputs: b(2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13), label: 'Keypad', group: 'UFC', view: 'ufc',
    anchor: { x: 0.3728414442700157, y: 0.44208331637912324 }, box: { x: 0.44693879467351844, y: 0.8320832994249132 } },
  { id: 'opt', kind: 'buttons', inputs: b(14, 15, 16, 17, 18), label: 'Option select 1-5', group: 'UFC', view: 'ufc',
    anchor: { x: 0.45007851209895017, y: 0.4620833502875434 }, box: { x: 0.7948194470847233, y: 0.05319444868299696 } },
  { id: 'fn', kind: 'buttons', inputs: b(20, 21, 22, 23, 24, 25, 26), label: 'A/P IFF TCN ILS D/L BCN ON/OFF', group: 'UFC', view: 'ufc',
    anchor: { x: 0.3872841635903159, y: 0.6520833333333333 }, box: { x: 0.16248037676609106, y: 0.7865277608235677 } },
  { id: 'brt', kind: 'axis', inputs: ['rotz'], label: 'BRT (RZ)', group: 'UFC', view: 'ufc',
    anchor: { x: 0.581318662155367, y: 0.44319445292154946 }, box: { x: 0.930455278190002, y: 0.13874999152289497 } },
  { id: 'emcon', kind: 'button', inputs: b(19), label: 'EM CON', group: 'UFC', view: 'ufc',
    anchor: { x: 0.5995290328045281, y: 0.5009722391764323 }, box: { x: 0.7992150323170133, y: 0.40541665818956163 } },
  { id: 'vol2', kind: 'axis', inputs: ['roty'], label: 'COMM 2 VOL', group: 'UFC', view: 'ufc',
    anchor: { x: 0.5806907282519378, y: 0.617638905843099 }, box: { x: 0.9273155607645702, y: 0.4931944105360243 } },
  { id: 'comm2', kind: 'encoder', inputs: b(31, 30, 32), label: 'COMM 2 channel (− / + / PULL)', group: 'UFC', view: 'ufc',
    anchor: { x: 0.5970172492825255, y: 0.8365277608235677 }, box: { x: 0.8846153846153846, y: 0.7409722222222223 } },
  { id: 'tgl1', kind: 'switch', inputs: b(33, 34), label: 'Top rocker left', group: 'UFC top', view: 'ufc',
    anchor: { x: 0.3207221158445349, y: 0.07319444020589193 }, box: { x: 0.17378335470681663, y: 0.03 } },
  { id: 'tgl2', kind: 'switch', inputs: b(35, 36), label: 'Top rocker centre', group: 'UFC top', view: 'ufc',
    anchor: { x: 0.4630525995308185, y: 0.13646886800719066 }, box: { x: 0.42747250830921313, y: 0.03 } },
  { id: 'tgl3', kind: 'switch', inputs: b(37, 38), label: 'Top rocker right', group: 'UFC top', view: 'ufc',
    anchor: { x: 0.5992388354993897, y: 0.21866860507021077 }, box: { x: 0.6032966841333889, y: 0.03 } },
  { id: 'rej', kind: 'switch', inputs: b(65, 66, 67), label: 'NORM / REJ 1 / REJ 2', group: 'HUD', view: 'hud',
    anchor: { x: 0.2565683427935098, y: 0.3998611026340061 }, box: { x: 0.12716710258531613, y: 0.2654166751437717 } },
  { id: 'hbrt', kind: 'axis', inputs: ['x'], label: 'BRT', group: 'HUD', view: 'hud',
    anchor: { x: 0.2987488720223134, y: 0.4720833248562283 }, box: { x: 0.21796248830568588, y: 0.07874999576144748 } },
  { id: 'daynight', kind: 'switch', inputs: b(68, 69), label: 'DAY / NIGHT', group: 'HUD', view: 'hud',
    anchor: { x: 0.39812332439678283, y: 0.47430555555555554 }, box: { x: 0.36595174262734587, y: 0.08208334181043837 } },
  { id: 'blk', kind: 'axis', inputs: ['y'], label: 'BLK LVL', group: 'HUD', view: 'hud',
    anchor: { x: 0.4481680071492404, y: 0.5520833333333334 }, box: { x: 0.606166208930267, y: 0.05986111958821615 } },
  { id: 'aoa', kind: 'axis', inputs: ['slider2'], label: 'AOA', group: 'HUD', view: 'hud',
    anchor: { x: 0.33378016085790885, y: 0.5798611111111112 }, box: { x: 0.10285970161172084, y: 0.7154166327582465 } },
  { id: 'alt', kind: 'switch', inputs: b(73, 74), label: 'ALT BARO / RDR', group: 'HUD', view: 'hud',
    anchor: { x: 0.42672028596961575, y: 0.5931944105360243 }, box: { x: 0.2801608579088472, y: 0.8109722561306424 } },
  { id: 'att', kind: 'switch', inputs: b(75, 76, 77), label: 'ATT INS / AUTO / STBY', group: 'HUD', view: 'hud',
    anchor: { x: 0.49678286364080654, y: 0.6431944105360243 }, box: { x: 0.47890976265778595, y: 0.809861077202691 } },
  { id: 'vid', kind: 'switch', inputs: b(70, 71, 72), label: 'W/B / VID / OFF', group: 'HUD', view: 'hud',
    anchor: { x: 0.546827546393264, y: 0.5620833502875434 }, box: { x: 0.7827524793691354, y: 0.08097222646077475 } },
  { id: 'bal', kind: 'axis', inputs: ['z'], label: 'BAL', group: 'HUD', view: 'hud',
    anchor: { x: 0.5968722291457216, y: 0.6476388719346788 }, box: { x: 0.9050044246397453, y: 0.28986112806532116 } },
  { id: 'hdg', kind: 'switch', inputs: b(80, 79, 78), label: 'HDG (L/C/R)', group: 'HUD', view: 'hud',
    anchor: { x: 0.2622877569258266, y: 0.5654166327582465 }, box: { x: 0.07998212689901697, y: 0.5454166836208767 } },
  { id: 'crs', kind: 'switch', inputs: b(83, 82, 81), label: 'CRS (L/C/R)', group: 'HUD', view: 'hud',
    anchor: { x: 0.6726541118604781, y: 0.819861094156901 }, box: { x: 0.910008980185992, y: 0.6931944105360243 } },
]);
photoTpl({
  id: 'builtin-azeron-keypad', category: 'panel', name: 'Azeron Keypad (XInput)', brand: 'Azeron', notes: PHOTO_ONLY_NOTE,
  match: [{ vendor: '16D0', product: '12F7' }, { name: 'Azeron Keypad' }, { name: 'Azeron Cyborg' }],
});


// Honeycomb Bravo Throttle Quadrant: USB 294B:1901. Button/axis numbers from published DI maps (RoystonS / Sporty's);
// callout positions from Federico's export (2026-10-06, exact anchor + box fractions — no re-box).
photoTplExactViews({
  id: 'builtin-honeycomb-bravo', category: 'throttle', name: 'Honeycomb Bravo Throttle Quadrant', brand: 'Honeycomb',
  notes: 'DI: AP 1-8, INCR/DECR 13/14, mode 17-21, flaps 15/16, trim 22/23, gear 31/32, switches 34-47, rev detents 24-28+33, lever btns 9-12+29+30+48. Axes Y=L1 X=L2 RZ=L3 RY=L4 RX=L5 Z=L6. Positions from the Federico export. Buttons to 48: use Firefox (Chrome caps at 32).',
  match: [{ vendor: '294B', product: '1901' }, { name: 'Bravo Throttle' }, { name: 'Honeycomb Bravo' }, { name: 'Bravo Throttle Quadrant' }],
}, [
  {"id": "main", "label": "Bravo", "width": 1825, "height": 1031, "photo": "honeycomb-bravo-main"},
], [
  {"id": "apsel", "kind": "switch", "inputs": ["button17", "button18", "button19", "button20", "button21"], "label": "AP mode (IAS/CRS/HDG/VS/ALT)", "group": "Autopilot", "view": "main",
    "anchor": {"x": 0.42243348328332936, "y": 0.3188625338925878}, "box": {"x": 0.18745248308653162, "y": 0.10617531909946491}},
  {"id": "ap", "kind": "buttons", "inputs": ["button1", "button2", "button3", "button4", "button5", "button6", "button7"], "label": "AP modes (HDG…IAS)", "group": "Autopilot", "view": "main",
    "anchor": {"x": 0.5216640310721644, "y": 0.30430556403266057}, "box": {"x": 0.6954372391501307, "y": 0.06579167364605011}},
  {"id": "apenc", "kind": "encoder", "inputs": ["button13", "button14"], "label": "AP value (INCR / DECR)", "group": "Autopilot", "view": "main",
    "anchor": {"x": 0.6216730038022814, "y": 0.30001681214080994}, "box": {"x": 0.8612167300380228, "y": 0.12771326847633221}},
  {"id": "apm", "kind": "button", "inputs": ["button8"], "label": "AUTO PILOT", "group": "Autopilot", "view": "main",
    "anchor": {"x": 0.6619772095190708, "y": 0.28924785028999145}, "box": {"x": 0.9205323425989187, "y": 0.31213192631701864}},
  {"id": "gear", "kind": "switch", "inputs": ["button31", "button32"], "label": "Gear (UP / DOWN)", "group": "Panel", "view": "main",
    "anchor": {"x": 0.3365019011406844, "y": 0.4911660775570655}, "box": {"x": 0.09, "y": 0.28}},
  {"id": "sw14", "kind": "buttons", "inputs": ["button34", "button35", "button36", "button37", "button38", "button39", "button40", "button41", "button42", "button43", "button44", "button45", "button46", "button47"], "label": "Panel switches 1-4", "group": "Panel", "view": "main",
    "anchor": {"x": 0.5335949668704622, "y": 0.46875}, "box": {"x": 0.3821292775665399, "y": 0.03}},
  {"id": "flaps", "kind": "switch", "inputs": ["button15", "button16"], "label": "Flaps (down / up)", "group": "Panel", "view": "main",
    "anchor": {"x": 0.6939163498098859, "y": 0.4373212169525124}, "box": {"x": 0.9091254984924548, "y": 0.5248191154349112}},
  {"id": "trim", "kind": "encoder", "inputs": ["button22", "button23"], "label": "Trim (nose down / up)", "group": "Levers", "view": "main",
    "anchor": {"x": 0.41254752851711024, "y": 0.6217398747931988}, "box": {"x": 0.09, "y": 0.58}},
  {"id": "l1", "kind": "axis", "inputs": ["y"], "label": "Lever 1 (Y)", "group": "Levers", "view": "main",
    "anchor": {"x": 0.4863117638649596, "y": 0.69173820384921}, "box": {"x": 0.14106463298144903, "y": 0.97}},
  {"id": "l2", "kind": "axis", "inputs": ["x"], "label": "Lever 2 (X)", "group": "Levers", "view": "main",
    "anchor": {"x": 0.5273764142518714, "y": 0.6876997982235}, "box": {"x": 0.32433461236409816, "y": 0.97}},
  {"id": "l3", "kind": "axis", "inputs": ["rotz"], "label": "Lever 3 (RZ)", "group": "Levers", "view": "main",
    "anchor": {"x": 0.5623573912413855, "y": 0.6850075962736408}, "box": {"x": 0.4969581633013011, "y": 0.97}},
  {"id": "l4", "kind": "axis", "inputs": ["roty"], "label": "Lever 4 (RY)", "group": "Levers", "view": "main",
    "anchor": {"x": 0.6049429889867515, "y": 0.6823152916228604}, "box": {"x": 0.8574144486692015, "y": 0.97}},
  {"id": "l5", "kind": "axis", "inputs": ["rotx"], "label": "Lever 5 (RX)", "group": "Levers", "view": "main",
    "anchor": {"x": 0.6467680840437856, "y": 0.6809691906479308}, "box": {"x": 0.8893535889600166, "y": 0.8034662279831049}},
  {"id": "l6", "kind": "axis", "inputs": ["z"], "label": "Lever 6 (Z)", "group": "Levers", "view": "main",
    "anchor": {"x": 0.6840303950436668, "y": 0.6769308877231421}, "box": {"x": 0.9182509505703422, "y": 0.6473161527700851}},
  {"id": "rev", "kind": "buttons", "inputs": ["button24", "button25", "button26", "button27", "button28", "button33"], "label": "Reverse detents", "group": "Levers", "view": "main",
    "anchor": {"x": 0.6049429889867515, "y": 0.8869258235407149}, "box": {"x": 0.6923954604696412, "y": 0.97}},
  {"id": "toga", "kind": "buttons", "inputs": ["button9", "button10", "button11", "button12", "button29", "button30", "button48"], "label": "Lever TOGA / rev btns", "group": "Levers", "view": "main",
    "anchor": {"x": 0.5661596726102067, "y": 0.5988557987661717}, "box": {"x": 0.15475284010738474, "y": 0.8075046336088149}},
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
  id: 'builtin-honeycomb-charlie', category: 'pedals', name: 'Honeycomb Charlie Rudder Pedals', brand: 'Honeycomb',
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
  id: 'builtin-logitech-flight-rudder', category: 'pedals', name: 'Logitech G Flight Rudder Pedals (Saitek Pro Flight)', brand: 'Logitech',
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
  id: 'builtin-mfg-crosswind', category: 'pedals', name: 'MFG Crosswind V3 Rudder Pedals', brand: 'MFG',
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
  id: 'builtin-tm-tfrp', category: 'pedals', name: 'Thrustmaster T.Flight Rudder Pedals (TFRP)', brand: 'Thrustmaster',
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
  id: 'builtin-tm-tpr', category: 'pedals', name: 'Thrustmaster Pendular Rudder (TPR)', brand: 'Thrustmaster',
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
  id: 'builtin-virpil-r1-falcon', category: 'pedals', name: 'VIRPIL R1-FALCON Rudder Pedals', brand: 'VIRPIL',
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
  id: 'builtin-vkb-t-rudder', category: 'pedals', name: 'VKB T-Rudder Mk.V', brand: 'VKB',
  notes: 'Rudder = rotx (VKB default). No toe brakes and no buttons. VKB ids and axes depend on the VKBDevCfg setup (some shop pages say Z; through a Black Box it shows as “VKBsim Black Box”), and differential braking from the rudder is a VKBDevCfg option that adds axes: Customize a copy if your numbers differ.',
  match: [{ vendor: '231D', product: '011F' }, { name: 'VKBsim T-Rudder' }, { name: 'VKB T-Rudder' }, { name: 'T-Rudder Mk' }],
}, 'vkb-t-rudder-main', [
  { id: 'rudder', input: 'rotx', label: 'Rudder', at: [0.47, 0.38], box: [PEDAL_L, 0.2] },
]);

/* ------------------------------------------------------------------ October 9 photo additions */
// ICP numbering and axes: supplied SimAppPro diagram. USB 4098:BF30: the real Firefox device list in scripts/e2e.mjs.
photoTpl({
  id: 'builtin-winctrl-viperace-icp', category: 'panel', name: 'WinCtrl ViperAce ICP', brand: 'WinCtrl',
  notes: WC_NOTE + ' ICP buttons 1–34 and axes X / Y / RX / RY from the supplied SimAppPro diagram. Chrome / Edge cap at 32 buttons — use Firefox for 33–34.',
  match: [{ vendor: '4098', product: 'BF30' }, { name: 'ICP' }, { name: 'ViperAce ICP' }],
}, [
  c('modes', 'buttons', b(...range(1, 6)), 'COM / IFF / LIST / A-A / A-G', 'Keypad'),
  c('row1', 'buttons', b(7, 8, 9, 10), '1 / 2 / 3 / RCL', 'Keypad'),
  c('row2', 'buttons', b(11, 12, 13, 14), '4 / 5 / 6 / ENTR', 'Keypad'),
  c('row3', 'buttons', b(15, 16, 17, 18), '7 / 8 / 9 / 0', 'Keypad'),
  c('inc', 'switch', b(19, 20), 'Increment / decrement', 'Switches'),
  c('dcs', 'hat', b(22, 23, 24, 25, 21), 'DCS (4-way + push)', 'Switches'),
  c('drift', 'switch', b(26, 27, 28), 'DRIFT C/O / NORM / WARN RESET', 'Switches'),
  c('wx', 'button', b(29), 'WX', 'Switches'),
  c('flir', 'switch', b(30, 31), 'FLIR up / down', 'Switches'),
  c('gain', 'switch', b(32, 33, 34), 'GAIN / LVL / AUTO', 'Switches'),
  c('sym', 'axis', ['y'], 'SYM brightness', 'Axes'),
  c('icpbrt', 'axis', ['roty'], 'ICP brightness', 'Axes'),
  c('dedbrt', 'axis', ['x'], 'DED brightness', 'Axes'),
  c('cont', 'axis', ['rotx'], 'Contrast', 'Axes'),
]);

pedalTpl({
  id: 'builtin-virpil-r1-legend', category: 'pedals', name: 'VIRPIL R1-LEGEND Rudder Pedals', brand: 'VIRPIL',
  notes: 'Same axis layout as R1-FALCON: left toe brake = slider1 (Slider), right toe brake = slider2 (Dial), rudder = z. No buttons. Matched by name only. The VPC Configurator can rename or move the axes: Customize a copy if your numbers differ.',
  match: [{ name: 'R1-LEGEND' }, { name: 'R1 LEGEND' }],
}, 'virpil-r1-legend-main', [
  { id: 'ltoe', input: 'slider1', label: 'Left Toe Brake', at: [0.145, 0.345], box: [PEDAL_L, 0.28] },
  { id: 'rtoe', input: 'slider2', label: 'Right Toe Brake', at: [0.72, 0.14], box: [PEDAL_R, 0.2] },
  { id: 'rudder', input: 'z', label: 'Rudder', at: [0.49, 0.57], box: [PEDAL_R, 0.8] },
]);

// Always expose both base axes, including in the grip variants. X/Y are provisional axis-order assignments: no supplied
// base diagram identifies their DirectInput names. The Plus idle button has no verified logical number, so keep it unassigned
// (especially with a grip: assigning button1 here would collide with every supplied grip diagram).
// The requested "Clutch" label denotes the Plus twist throttle axis; VIRPIL's clutch damper is mechanical, not another input.
const ROTOR_NOTE = 'Default grip numbering: VIRPIL diagrams (button N = jsX_buttonN). VPC Configurator can renumber: Customize a copy. Base X/Y provisional (collective/Plus twist throttle). “Clutch” = twist throttle; damper/lock mechanical. Plus idle number unknown: assign in a copy.';
const ROTOR_AXES: Spec[] = [
  c('collective', 'axis', ['x'], 'Collective axis', 'Base'),
  c('clutch', 'axis', ['y'], 'Clutch (TCS Plus only)', 'Base'),
  c('idle', 'button', u(1), 'Engine idle (TCS Plus only)', 'Base'),
];
photoTpl({
  id: 'builtin-virpil-rotor-tcs', category: 'collective', name: 'VIRPIL Rotor TCS / TCS Plus base', brand: 'VIRPIL',
  notes: ROTOR_NOTE, match: [{ name: 'Rotor TCS' }],
}, ROTOR_AXES);

photoTpl({
  id: 'builtin-virpil-rotor-tcs-dual', category: 'collective', name: 'VIRPIL Rotor TCS / TCS Plus + Dual grip', brand: 'VIRPIL',
  variantOf: 'builtin-virpil-rotor-tcs', match: [],
  notes: ROTOR_NOTE + ' Dual-SF: 1–47, cursor RX/RY; 46/47 = alternate action. Head button anchor estimated. >32 buttons: use Firefox (Chrome/Edge cap 32).',
}, [
  ...ROTOR_AXES,
  c('b1', 'button', b(1), 'Head button', 'Upper grip'),
  c('h2', 'hat', b(3, 4, 5, 6, 2), 'Upper thumb hat', 'Upper grip'),
  c('h7', 'hat', b(8, 9, 10, 11, 7), 'GTM / F-P / ATH hat', 'Upper grip'),
  c('cursor', 'axis', ['rotx', 'roty'], 'Cursor ministick', 'Upper grip'),
  c('cursorb', 'button', b(12), 'Cursor press', 'Upper grip'),
  c('h13', 'hat', b(14, 15, 16, 17, 13), 'LINK hat', 'Upper grip'),
  c('b18', 'button', b(18), 'Upper front button', 'Upper grip'),
  c('trig19', 'button', b(19), 'Upper trigger', 'Upper grip'),
  c('b20', 'button', b(20), 'Upper side button', 'Upper grip'),
  c('s21', 'switch', b(22, 21, 23), 'Upper rocker (up / push / down)', 'Upper grip'),
  c('b24', 'button', b(24), 'Upper rear button', 'Upper grip'),
  c('s25', 'switch', b(27, 25, 26), 'Lower rocker (left / push / right)', 'Lower grip'),
  c('s28', 'switch', b(28, 29, 45), 'STOW / DEP switch (+ alternate)', 'Lower grip'),
  c('h30', 'hat', b(31, 32, 33, 34, 30), 'EXT / RET hat', 'Lower grip'),
  c('s35', 'switch', b(35, 46), 'PNVS button / alternate action', 'Lower grip'),
  c('s36', 'switch', b(37, 36, 38), 'PNVS rocker (up / push / down)', 'Lower grip'),
  c('s39', 'switch', b(40, 39, 41), 'NU rocker (up / push / down)', 'Lower grip'),
  c('trig42', 'button', b(42), 'Lower trigger', 'Lower grip'),
  c('s43', 'switch', b(43, 47), 'JETT / alternate action', 'Lower grip'),
  c('b44', 'button', b(44), 'Lower rear button', 'Lower grip'),
]);

photoTpl({
  id: 'builtin-virpil-rotor-tcs-sharka50', category: 'collective', name: 'VIRPIL Rotor TCS / TCS Plus + SharKa-50 grip', brand: 'VIRPIL',
  variantOf: 'builtin-virpil-rotor-tcs', match: [],
  notes: ROTOR_NOTE + ' SharKa-50 diagram: 1–12, 14–23 (13 not drawn). Hats: up/right/down/left/push.',
}, [
  ...ROTOR_AXES,
  c('b1', 'button', b(1), 'Left push button', 'Grip'),
  c('s2', 'switch', b(2, 3), 'Left toggle', 'Grip'),
  c('h4', 'hat', b(5, 6, 7, 8, 4), 'Lower hat', 'Grip'),
  c('h9', 'hat', b(10, 11, 12, 23, 9), 'Upper hat', 'Grip'),
  c('s14', 'switch', b(15, 14, 16), 'Rocker (up / push / down)', 'Grip'),
  c('s17', 'switch', b(17, 18), 'Middle toggle', 'Grip'),
  c('b19', 'button', b(19), 'Red push button', 'Grip'),
  c('b20', 'button', b(20), 'Right push button', 'Grip'),
  c('s21', 'switch', b(21, 22), 'Right toggle', 'Grip'),
]);

photoTpl({
  id: 'builtin-virpil-rotor-tcs-hawk60', category: 'collective', name: 'VIRPIL Rotor TCS / TCS Plus + Hawk-60 grip', brand: 'VIRPIL',
  variantOf: 'builtin-virpil-rotor-tcs', match: [],
  notes: ROTOR_NOTE + ' Hawk-60 diagram: 1–27. Side hat 2–6 partly hidden: anchor estimated at exposed edge.',
}, [
  ...ROTOR_AXES,
  c('trig', 'button', b(1), 'Trigger', 'Grip'),
  c('h2', 'hat', b(3, 4, 5, 6, 2), 'Side hat', 'Grip'),
  c('h7', 'hat', b(8, 9, 10, 11, 7), 'EXT hat', 'Grip'),
  c('s12', 'switch', b(13, 12, 14), 'ENG RPM (up / push / down)', 'Grip'),
  c('b15', 'button', b(15), 'EMER REL / HOOK', 'Grip'),
  c('h16', 'hat', b(17, 18, 19, 20, 16), 'SRCH LT / SVO hat', 'Grip'),
  c('s21', 'switch', b(21, 22), 'STG toggle', 'Grip'),
  c('h23', 'hat', b(24, 25, 26, 27, 23), 'LDG LT hat', 'Grip'),
]);

export const DEVICE_TEMPLATES: DeviceTemplate[] = ALL;
