// Generates the built-in default stick art (src/lib/defaultStickArt.ts): an original holographic wireframe flight stick drawn
// from a small 3D model (lofted grip + head, gimbal base, controls) projected in a 3/4 view. Run automatically by scripts/ensure-data.mjs
// (predev / prebuild / pretest); `node scripts/gen-default-stick.mjs out.svg` also writes the standalone SVG.
import { writeFileSync } from 'node:fs';

const W = 1000, H = 900;
const MX = -1; // mirror the projection: a right-hand grip seen from behind-left (front / trigger towards the left)
const deg = Math.PI / 180;
/* ---------------------------------------------------------------- vector maths */
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const nrm = (a) => mul(a, 1 / (len(a) || 1));
const lerp = (a, b, t) => a + (b - a) * t;

/* ---------------------------------------------------------------- camera: from behind-left and above (thumb side faces us) */
const AZ = 34 * deg, EL = 23 * deg;
const V = [-Math.sin(AZ) * Math.cos(EL), Math.sin(EL), Math.cos(AZ) * Math.cos(EL)]; // towards the viewer
const R = [Math.cos(AZ), 0, Math.sin(AZ)];
const U = cross(V, R);
let S = 1, OX = 0, OY = 0;
const P2 = (p) => [W / 2 + MX * (OX - W / 2 + S * dot(p, R)), OY - S * dot(p, U)];
const f1 = (n) => (Math.round(n * 10) / 10).toString();
const pt = (p) => { const [x, y] = P2(p); return `${f1(x)} ${f1(y)}`; };
const poly = (ps, close = false) => 'M' + ps.map(pt).join('L') + (close ? 'Z' : '');
/** smooth path through 2D points (Catmull-Rom -> cubic Bezier) */
function smooth2(q, close = false) {
  const n = q.length;
  const g = (i) => q[close ? (i + n) % n : Math.max(0, Math.min(n - 1, i))];
  let d = `M${f1(q[0][0])} ${f1(q[0][1])}`;
  for (let i = 0; i < (close ? n : n - 1); i++) {
    const p0 = g(i - 1), p1 = g(i), p2 = g(i + 1), p3 = g(i + 2);
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6], c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${f1(c1[0])} ${f1(c1[1])} ${f1(c2[0])} ${f1(c2[1])} ${f1(p2[0])} ${f1(p2[1])}`;
  }
  return d + (close ? 'Z' : '');
}
const smooth = (ps, close) => smooth2(ps.map(P2), close);

/* ---------------------------------------------------------------- grip + head loft: sections (x, y centre; a = half depth along the
   section's forward axis, b = half width; tilt = section plane leaning back, degrees) */
const KEY = [
  // x,   y,   a,  b, tilt
  [0, 40, 23, 18.5, 0],
  [-3, 62, 22, 17.5, 3],
  [-5, 86, 22, 17.5, 3],
  [-4, 108, 23, 18.5, 0],
  [-1, 128, 24.5, 19.5, -6],
  [6, 146, 29, 22, -14],
  [18, 162, 40, 27, -16],
  [28, 178, 51, 31, -10],
  [33, 194, 56, 33, 0],
  [33, 209, 55, 32.5, 12],
  [30, 222, 50, 30.5, 22],
  [25, 231, 43, 27, 32],
];
function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}
/** section parameters at fractional key index k */
function sec(k) {
  const n = KEY.length;
  const i = Math.max(0, Math.min(n - 2, Math.floor(k))), t = Math.min(1, Math.max(0, k - i));
  const g = (j) => KEY[Math.max(0, Math.min(n - 1, j))];
  return [0, 1, 2, 3, 4].map((c) => catmull(g(i - 1)[c], g(i)[c], g(i + 1)[c], g(i + 2)[c], t));
}
const PEX = 2.5; // superellipse exponent of the cross-section
const se = (v) => Math.sign(v) * Math.abs(v) ** (2 / PEX);
function frame(k) {
  const [x, y, a, b, tl] = sec(k);
  const th = tl * deg;
  return { C: [x, y, 0], F: [Math.cos(th), Math.sin(th), 0], N: [-Math.sin(th), Math.cos(th), 0], Z: [0, 0, 1], a, b };
}
/** surface point: phi 0 = front (trigger side), 90 = left (thumb side, towards the viewer), 180 = back (palm) */
function surf(k, phi) {
  const f = frame(k), c = Math.cos(phi * deg), s = Math.sin(phi * deg);
  const egg = 1 - 0.1 * c; // a little narrower at the front
  return add(f.C, add(mul(f.F, f.a * se(c)), mul(f.Z, f.b * egg * se(s))));
}
function surfN(k, phi) {
  const e = 0.01, d = 0.5;
  const dk = sub(surf(k + e, phi), surf(k - e, phi)), dp = sub(surf(k, phi + d), surf(k, phi - d));
  let n = nrm(cross(dp, dk));
  if (dot(n, sub(surf(k, phi), frame(k).C)) < 0) n = mul(n, -1);
  return n;
}
const KTOP = KEY.length - 1;
/** top panel (cap): u along the panel's forward axis, w across (+ = thumb side), both -1..1 */
function cap(u, w, lift = 0) {
  const f = frame(KTOP);
  const r2 = Math.min(1, (u * u + w * w));
  const p = add(f.C, add(mul(f.F, f.a * u * 0.98), mul(f.Z, f.b * w * 0.98)));
  return add(p, mul(f.N, 2.5 * (1 - r2) + lift));
}
const capN = () => frame(KTOP).N;


/* ---------------------------------------------------------------- fit the drawing into the canvas (x 290..710, y ..808) */
{
  const raw = (p) => [dot(p, R), -dot(p, U)];
  const pts = [];
  for (let i = 0; i <= 40; i++) for (let j = 0; j < 36; j++) pts.push(raw(surf((i / 40) * KTOP, j * 10)));
  for (const x of [-84, 60]) for (const y of [-72, 0]) for (const z of [-64, 64]) pts.push(raw([x, y, z]));
  for (let x = -140; x <= 120; x += 260) for (const z of [-60, 60]) pts.push(raw([x * 0.55, -72, z]));
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  S = Math.min(790 / (y1 - y0), 420 / (x1 - x0));
  OX = 500 - S * (x0 + x1) / 2; OY = 808 - S * y1; // leaves a band at the bottom for callouts
}

/* ---------------------------------------------------------------- output collectors */
const L = { back: [], wire: [], sil: [], ctl: [], ctlFill: [], red: [], accent: [], floor: [], axis: [], text: [], fill: [], scanClip: [] };
const anchors = {}, regions = {};
const anchor = (id, p) => { anchors[id] = P2(p); };
/** region: closed outline (2D points) around a control, stored relative to its anchor */
function region(id, pts2) {
  const [ax, ay] = anchors[id];
  regions[id] = 'M' + pts2.map(([x, y]) => `${f1(x - ax)} ${f1(y - ay)}`).join('L') + 'Z';
}

/* ---------------------------------------------------------------- body wireframe */
const NK = 64, NPHI = 96;
// silhouette: per fine section, the extreme points across the projected spine; fill: union of hulls of neighbouring sections
const silA = [], silB = [], hullsFill = [];
{
  const ringsF = [], ctr = [];
  for (let i = 0; i <= NK; i++) { const k = (i / NK) * KTOP; const r = []; for (let j = 0; j < 48; j++) r.push(P2(surf(k, j * 7.5))); ringsF.push(r); ctr.push(P2(frame(k).C)); }
  for (let i = 0; i <= NK; i++) {
    const c0 = ctr[Math.max(0, i - 1)], c1 = ctr[Math.min(NK, i + 1)];
    let dx = c1[0] - c0[0], dy = c1[1] - c0[1]; const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
    const px = -dy, py = dx, c = ctr[i];
    let lo = null, hi = null, vlo = 1e9, vhi = -1e9;
    for (const q of ringsF[i]) { const v = (q[0] - c[0]) * px + (q[1] - c[1]) * py; if (v < vlo) { vlo = v; lo = q; } if (v > vhi) { vhi = v; hi = q; } }
    if (lo[0] < hi[0]) { silA.push(lo); silB.push(hi); } else { silA.push(hi); silB.push(lo); }
    if (i < NK && i % 2 === 0) hullsFill.push(hull([...ringsF[i], ...ringsF[Math.min(NK, i + 2)]]));
  }
}
// cap outline
const capRing = [];
for (let j = 0; j < 40; j++) { const t = (j / 40) * 2 * Math.PI; capRing.push(cap(se(Math.cos(t)), se(Math.sin(t)) * (1 - 0.1 * Math.cos(t)))); }
hullsFill.push(hull(capRing.map(P2)));
for (const h of hullsFill) L.fill.push(`<path d="M${h.map(([x, y]) => `${f1(x)} ${f1(y)}`).join('L')}Z"/>`);
const sub3 = (a) => a.filter((_, i) => i % 3 === 0 || i === a.length - 1);
L.sil.push(`<path d="${smooth2(sub3(silA))}"/>`, `<path d="${smooth2(sub3(silB))}"/>`);
// contour rings along the grip (front half bright, back half dim)
const RINGS = [0.0, 0.8, 1.6, 2.4, 3.2, 4.0, 4.8, 5.6, 6.4, 7.2, 8.0, 8.8, 9.6, 10.4];
for (const k of RINGS) {
  let seg = [], vis = null;
  const flush = () => { if (seg.length > 1) (vis ? L.wire : L.back).push(`<path d="${smooth(seg)}"/>`); };
  for (let j = 0; j <= 48; j++) {
    const phi = (j / 48) * 360, p = surf(k, phi), v = dot(surfN(k, phi), V) > 0;
    if (vis === null) vis = v;
    if (v !== vis) { seg.push(p); flush(); seg = [p]; vis = v; } else seg.push(p);
  }
  flush();
}
// longitudinal flow lines
for (let j = 0; j < 16; j++) {
  const phi = (j / 16) * 360 + 11.25;
  let seg = [], vis = null;
  const flush = () => { if (seg.length > 1) (vis ? L.wire : L.back).push(`<path d="${smooth(seg)}"/>`); };
  for (let i = 0; i <= 22; i++) {
    const k = (i / 22) * KTOP, p = surf(k, phi), v = dot(surfN(k, phi), V) > 0;
    if (vis === null) vis = v;
    if (v !== vis) { seg.push(p); flush(); seg = [p]; vis = v; } else seg.push(p);
  }
  flush();
}
// cap: outline, inset panel border and a few mesh lines
L.sil.push(`<path d="${smooth(capRing, true)}"/>`);
{
  const inset = [];
  for (let j = 0; j < 32; j++) { const t = (j / 32) * 2 * Math.PI; inset.push(cap(0.86 * se(Math.cos(t)), 0.8 * se(Math.sin(t)) * (1 - 0.1 * Math.cos(t)), 0.4)); }
  L.wire.push(`<path d="${smooth(inset, true)}" stroke-dasharray="6 3"/>`);
}
// grip side seam and palm swell details
{
  const seam = []; for (let i = 0; i <= 30; i++) seam.push(surf(0.3 + (i / 30) * 9.2, 96));
  L.wire.push(`<path d="${smooth(seam)}" stroke-opacity=".9" stroke-width="1.3"/>`);
  // light slats on the back of the grip (nod to RGB grips)
  for (let s = 0; s < 4; s++) {
    const k = 1.7 + s * 0.42, a = [];
    for (let j = 0; j <= 10; j++) a.push(surf(k, 128 + j * 3.2));
    L.accent.push(`<path d="${smooth(a)}" stroke-width="2.4"/>`);
  }
}
// head light strip: along the front/top crest of the head
{
  const strip = [];
  for (let i = 0; i <= 24; i++) { const k = 6.2 + (i / 24) * (KTOP - 6.2); strip.push(surf(k, 22 + (i / 24) * 10)); }
  for (let j = 0; j <= 20; j++) { const t = (8 + j * 3.4) * deg; strip.push(cap(se(Math.cos(t)) * 1.0, se(Math.sin(t)) * (1 - 0.1 * Math.cos(t)) * 1.0, 0.2)); }
  L.accent.push(`<path d="${smooth(strip)}" stroke-width="3.2"/>`);
}

/* ---------------------------------------------------------------- control primitives */
function basis(n) {
  const ref = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const t1 = nrm(cross(ref, n)), t2 = cross(n, t1);
  return [t1, t2];
}
function ring3(c, n, r, steps = 40) {
  const [t1, t2] = basis(n), ps = [];
  for (let j = 0; j < steps; j++) { const t = (j / steps) * 2 * Math.PI; ps.push(add(c, add(mul(t1, r * Math.cos(t)), mul(t2, r * Math.sin(t))))); }
  return ps;
}
/** projected circle as an SVG ellipse element */
function ellipse(c, n, r, attrs = '') {
  const [t1, t2] = basis(n);
  const e1 = [MX * S * r * dot(t1, R), -S * r * dot(t1, U)], e2 = [MX * S * r * dot(t2, R), -S * r * dot(t2, U)];
  // principal axes of M = [e1 e2]
  const a = e1[0], b = e2[0], cc = e1[1], d = e2[1];
  const E = (a * a + b * b + cc * cc + d * d) / 2, F = Math.hypot((a * a + b * b - cc * cc - d * d) / 2, a * cc + b * d);
  const rx = Math.sqrt(E + F), ry = Math.sqrt(Math.max(0, E - F));
  const ang = 0.5 * Math.atan2(2 * (a * cc + b * d), a * a + b * b - cc * cc - d * d) / deg;
  const [x, y] = P2(c);
  return `<ellipse cx="${f1(x)}" cy="${f1(y)}" rx="${f1(rx)}" ry="${f1(ry)}" transform="rotate(${f1(ang)} ${f1(x)} ${f1(y)})"${attrs}/>`;
}
function ellipsePts(c, n, r, steps = 28) { return ring3(c, n, r, steps).map(P2); }
/** silhouette lines of a short cylinder (base ring at c, top at c + h n) */
function cylSides(c, n, r, h) {
  const top = add(c, mul(n, h));
  const [ax, ay] = P2(c), [bx, by] = P2(top);
  let dx = bx - ax, dy = by - ay; const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
  const ps = ring3(c, n, r, 72).map(P2);
  let lo = ps[0], hi = ps[0];
  for (const p of ps) { const v = (p[0] - ax) * -dy + (p[1] - ay) * dx; if (v < (lo[0] - ax) * -dy + (lo[1] - ay) * dx) lo = p; if (v > (hi[0] - ax) * -dy + (hi[1] - ay) * dx) hi = p; }
  const sh = [bx - ax, by - ay];
  return `<path d="M${f1(lo[0])} ${f1(lo[1])}l${f1(sh[0])} ${f1(sh[1])}M${f1(hi[0])} ${f1(hi[1])}l${f1(sh[0])} ${f1(sh[1])}"/>`;
}
function hull(points) { // 2D convex hull (monotone chain)
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.reverse()) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return [...lo.slice(0, -1), ...up.slice(0, -1)];
}
function grow(pts, px) { // push a closed outline outwards from its centroid
  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  return pts.map(([x, y]) => { const d = Math.hypot(x - cx, y - cy) || 1; return [x + ((x - cx) / d) * px, y + ((y - cy) / d) * px]; });
}

/** 4-way hat with push: bezel, raised cap with direction arrows; up = direction `up` on the surface */
function hat(id, c, n, r, up) {
  const h = 3.2, top = add(c, mul(n, h));
  L.ctl.push(ellipse(c, n, r * 1.32, ' stroke-opacity=".55"'));
  L.ctlFill.push(ellipse(top, n, r));
  L.ctl.push(ellipse(c, n, r), cylSides(c, n, r, h), ellipse(top, n, r));
  const u = nrm(sub(up, mul(n, dot(up, n)))), v = cross(n, u);
  for (const [d, k] of [[u, 1], [v, 1], [mul(u, -1), 1], [mul(v, -1), 1]]) {
    const tip = add(top, mul(d, r * 0.78 * k)), base = add(top, mul(d, r * 0.42)), side = cross(n, d);
    L.ctl.push(`<path d="${poly([tip, add(base, mul(side, r * 0.2)), add(base, mul(side, -r * 0.2))], true)}" class="cf"/>`);
  }
  L.ctl.push(ellipse(top, n, r * 0.16, ' class="cf"'));
  anchor(id, top);
  region(id, grow(hull([...ellipsePts(c, n, r * 1.32), ...ellipsePts(top, n, r)]), 3));
}
function button(id, c, n, r, h = 2.6, red = false) {
  const top = add(c, mul(n, h)), tgt = red ? L.red : L.ctl;
  tgt.push(ellipse(c, n, r * 1.4, ' stroke-opacity=".5"'));
  L.ctlFill.push(ellipse(top, n, r, red ? ' fill="#ff4d6d" fill-opacity=".22"' : ''));
  tgt.push(ellipse(c, n, r), cylSides(c, n, r, h), ellipse(top, n, r));
  if (red) tgt.push(ellipse(add(top, mul(n, 0.3)), n, r * 0.45));
  anchor(id, top);
  region(id, grow(hull([...ellipsePts(c, n, r * 1.4), ...ellipsePts(top, n, r)]), 3));
}
function ministick(id, c, n, r) {
  const post = 9, top = add(c, mul(n, post));
  L.ctl.push(ellipse(c, n, r * 1.38, ' stroke-opacity=".55"'), ellipse(c, n, r * 0.95, ' stroke-opacity=".55"'));
  L.ctl.push(ellipse(c, n, 2.6), cylSides(c, n, 2.6, post));
  L.ctlFill.push(ellipse(top, n, r));
  const t2 = add(top, mul(n, 3));
  L.ctl.push(ellipse(top, n, r), cylSides(top, n, r, 3), ellipse(t2, n, r), ellipse(t2, n, r * 0.62), ellipse(t2, n, r * 0.28, ' class="cf"'));
  anchor(id, t2);
  region(id, grow(hull([...ellipsePts(c, n, r * 1.38), ...ellipsePts(t2, n, r)]), 3));
}
/** thumb wheel rolling about `axis` (lies in the surface), half sunk in a slot */
function wheel(id, c, n, axis, r, w) {
  const ax = nrm(sub(axis, mul(n, dot(axis, n)))), dirs = cross(n, ax);
  const ctr = add(c, mul(n, r * 0.35));
  const e1 = add(ctr, mul(ax, -w / 2)), e2 = add(ctr, mul(ax, w / 2));
  // slot on the surface
  const slot = [];
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) slot.push(add(c, add(mul(ax, sx * (w / 2 + 2.2)), mul(dirs, sy * (r + 2.2)))));
  L.ctl.push(`<path d="${poly(slot, true)}" stroke-opacity=".55"/>`);
  // the two wheel faces (only the half above the surface), plus ribs
  const half = (e) => { const ps = []; for (let j = 0; j <= 18; j++) { const t = Math.PI * (j / 18); ps.push(add(e, add(mul(dirs, r * Math.cos(t)), mul(n, r * Math.sin(t) - r * 0.35 + r * 0.35)))); } return ps; };
  const h1 = half(e1), h2 = half(e2);
  L.ctlFill.push(`<path d="${poly([...h1, ...h2.reverse()], true)}"/>`);
  h2.reverse();
  L.ctl.push(`<path d="${poly(h1)}"/>`, `<path d="${poly(h2)}"/>`);
  for (let j = 1; j < 18; j += 2) L.ctl.push(`<path d="${poly([h1[j], h2[j]])}" stroke-opacity=".8"/>`);
  anchor(id, add(ctr, mul(n, r * 0.7)));
  region(id, grow(hull([...h1, ...h2, ...slot].map(P2)), 3));
}

/* ---------------------------------------------------------------- controls on the head */
const fwdUp = (k) => nrm(add(frame(k).N, mul(frame(k).F, 0))); // "up" on the thumb face: along the grip
const capUp = frame(KTOP).F; // on the top panel, hat "up" points forward
hat('hat1', cap(0.4, 0.44), capN(), 8.6, capUp);
ministick('ms', cap(0.36, -0.42), capN(), 8.4);
button('b3', cap(-0.42, -0.34), capN(), 4.4, 3, true);
hat('hat2', cap(-0.4, 0.46), capN(), 7.4, capUp);
// thumb face (left side of the head)
{
  const k = 8.3, phi = 114; hat('hat3', surf(k, phi), surfN(k, phi), 7.8, fwdUp(k));
  const k2 = 8.45, p2 = 80; wheel('enc', surf(k2, p2), surfN(k2, p2), frame(8.45).F, 6.5, 7);
}
{
  const k = 7.3, phi = 76; button('b6', surf(k, phi), surfN(k, phi), 4.6);
  const k2 = 6.75, p2 = 118; hat('hat4', surf(k2, p2), surfN(k2, p2), 6.8, fwdUp(k2));
  const k3 = 7.85, p3 = 140; button('b7', surf(k3, p3), surfN(k3, p3), 4.4);
  const k4 = 7.0, p4 = 26; button('b8', surf(k4, p4), surfN(k4, p4), 4);
  const k5 = 1.9, p5 = 64; button('b5', surf(k5, p5), surfN(k5, p5), 4.4);
}

/* ---------------------------------------------------------------- trigger (two stage) under the head front */
{
  // profile in the x-y plane: front edge and back edge, extruded +-6 in z
  const front = [[58, 168], [67, 158], [72, 144], [71, 130], [66, 120], [60, 116]];
  const back = [[49, 162], [55, 155], [59, 143], [58, 131], [56, 122], [60, 116]];
  const prof = [...front, ...back.slice(0, -1).reverse()];
  const zf = 6.5, zb = -6.5;
  const face = (z) => prof.map(([x, y]) => [x, y, z]);
  const f2 = face(zf).map(P2), b2 = face(zb).map(P2);
  L.ctlFill.push(`<path d="${smooth2(f2, true)}"/>`);
  L.back.push(`<path d="${smooth2(b2, true)}"/>`);
  L.ctl.push(`<path d="${smooth2(f2, true)}"/>`);
  for (const i of [0, 2, 3, 5]) L.ctl.push(`<path d="${poly([[...prof[i], zf], [...prof[i], zb]])}" stroke-opacity=".7"/>`);
  // finger ridges + stage marks
  for (const t of [0.3, 0.5, 0.7]) {
    const i = Math.floor(t * 5), u = t * 5 - i; const pa = front[i], pb = front[i + 1], q = [lerp(pa[0], pb[0], u), lerp(pa[1], pb[1], u)];
    L.ctl.push(`<path d="${poly([[q[0] - 4, q[1], zf], [q[0] - 4, q[1], zb + 2]])}" stroke-opacity=".7"/>`);
  }
  // travel arc with two detents (stage 1 / stage 2)
  const arc = []; for (let j = 0; j <= 16; j++) { const t = (-30 + j * 3.4) * deg; arc.push([48 + 30 * Math.cos(t), 142 + 30 * Math.sin(t), 9]); }
  L.axis.push(`<path d="${smooth(arc)}" stroke-dasharray="3 3"/>`);
  const tick = (j, lab) => { const t = (-30 + j * 3.4) * deg; const a = [48 + 26 * Math.cos(t), 142 + 26 * Math.sin(t), 9], b = [48 + 35 * Math.cos(t), 142 + 35 * Math.sin(t), 9];
    L.axis.push(`<path d="${poly([a, b])}"/>`); const [x, y] = P2([48 + 41 * Math.cos(t), 142 + 41 * Math.sin(t), 9]); L.text.push(`<text x="${f1(x)}" y="${f1(y + 3)}">${lab}</text>`); };
  tick(7, '1'); tick(14, '2');
  anchor('trig', [67, 140, zf]);
  region('trig', grow(hull([...f2, ...b2]), 4));
}

/* ---------------------------------------------------------------- base: an angular block (chamfered deck, square boot, button rows,
   toggles and F keys at the pilot edge, sloped pilot-facing panel with three thumbwheels, vent grille). Pilot side = -X. */
function ringY(y, r, steps = 96, a0 = 0, a1 = 360) { const ps = []; for (let j = 0; j <= steps; j++) { const t = (a0 + ((a1 - a0) * j) / steps) * deg; ps.push([r * Math.cos(t), y, r * Math.sin(t)]); } return ps; }
/** visible part of a horizontal ring of a solid of revolution: near side bright, far side dim */
function revRing(y, r, nearOnly = false, tgt = L.wire, dim = L.back) {
  tgt.push(`<path d="${smooth(ringY(y, r, 16, tv - 90, tv + 90))}"/>`);
  if (!nearOnly) dim.push(`<path d="${smooth(ringY(y, r, 16, tv + 90, tv + 270))}"/>`);
}
const tv = Math.atan2(V[2], V[0]) / deg;
const BX0 = -84, BX1 = 60, BZ = 64, BY0 = -70, DZ = 53, DX0 = -57, DX1 = 49, CH = -11, SL = -32;
const slopeAt = (y) => [lerp(BX0, DX0, (y - SL) / (0 - SL)), y]; // rear panel: x at height y
{
  const sw = (z) => [[BX0, BY0, z], [BX1, BY0, z], [BX1, CH, z], [slopeAt(CH)[0], CH, z], [BX0, SL, z]];
  const faces = [
    [[DX0, 0, DZ], [DX1, 0, DZ], [DX1, 0, -DZ], [DX0, 0, -DZ]], // deck
    sw(BZ), sw(-BZ).reverse(), // side walls
    [[BX1, CH, BZ], [slopeAt(CH)[0], CH, BZ], [DX0, 0, DZ], [DX1, 0, DZ]], // side chamfers
    [[BX1, CH, -BZ], [DX1, 0, -DZ], [DX0, 0, -DZ], [slopeAt(CH)[0], CH, -BZ]],
    [[BX1, BY0, BZ], [BX1, BY0, -BZ], [BX1, CH, -BZ], [BX1, CH, BZ]], // front wall + chamfer
    [[BX1, CH, BZ], [BX1, CH, -BZ], [DX1, 0, -DZ], [DX1, 0, DZ]],
    [[BX0, SL, BZ], [slopeAt(CH)[0], CH, BZ], [DX0, 0, DZ], [DX0, 0, -DZ], [slopeAt(CH)[0], CH, -BZ], [BX0, SL, -BZ]], // sloped rear panel
    [[BX0, BY0, BZ], [BX0, SL, BZ], [BX0, SL, -BZ], [BX0, BY0, -BZ]], // rear wall
    [[BX0, BY0, BZ], [BX0, BY0, -BZ], [BX1, BY0, -BZ], [BX1, BY0, BZ]], // bottom
  ];
  const ctr = [-11, -36, 0];
  const normal = (f) => { let n = [0, 0, 0]; for (let i = 0; i < f.length; i++) { const a = f[i], b = f[(i + 1) % f.length]; n = add(n, [(a[1] - b[1]) * (a[2] + b[2]), (a[2] - b[2]) * (a[0] + b[0]), (a[0] - b[0]) * (a[1] + b[1])]); }
    n = nrm(n); const c = f.reduce((s, p) => add(s, mul(p, 1 / f.length)), [0, 0, 0]); return dot(n, sub(c, ctr)) < 0 ? mul(n, -1) : n; };
  const vis = faces.map((f) => dot(normal(f), V) > 0.02);
  const key = (p) => p.map((v) => v.toFixed(2)).join(',');
  const edges = new Map();
  faces.forEach((f, i) => f.forEach((p, j) => { const q = f[(j + 1) % f.length]; const k = [key(p), key(q)].sort().join('|'); const e = edges.get(k) ?? { p, q, faces: [] }; e.faces.push(i); edges.set(k, e); }));
  for (const e of edges.values()) {
    const nv = e.faces.filter((i) => vis[i]).length;
    (nv === 1 ? L.sil : nv === 2 ? L.wire : L.back).push(`<path d="${poly([e.p, e.q])}"${nv === 2 ? ' stroke-width="1.4"' : ''}/>`);
  }
  faces.forEach((f, i) => { if (vis[i]) L.fill.push(`<path d="${poly(f, true)}"/>`); });
  // panel lines: deck inset, side seam, slope pocket frame
  L.wire.push(`<path d="${poly([[DX0 + 5, 0, DZ - 5], [DX1 - 5, 0, DZ - 5], [DX1 - 5, 0, -DZ + 5], [DX0 + 5, 0, -DZ + 5]], true)}" stroke-opacity=".4" stroke-dasharray="5 4"/>`);
  L.wire.push(`<path d="${poly([[34, BY0 + 6, BZ], [34, CH - 4, BZ]])}" stroke-opacity=".55"/>`, `<path d="${poly([[BX0 + 4, BY0 + 8, BZ], [BX1 - 4, BY0 + 8, BZ]])}" stroke-opacity=".35"/>`);
  // vent grille on the side wall (towards the pilot)
  for (let i = 0; i < 9; i++) {
    const x = -64 + i * 7, y0 = -58, y1 = -28;
    L.wire.push(`<path d="${poly([[x, y0, BZ], [x + 3.2, y0, BZ], [x + 3.2, y1, BZ], [x, y1, BZ]], true)}" stroke-opacity=".75"/>`);
  }
  // accent stripes near the front of the side wall
  for (let i = 0; i < 6; i++) { const x = 2 + i * 6.5, w = i === 0 ? 14 : 3; L.accent.push(`<path d="${poly([[x, -57, BZ], [x + w, -57, BZ], [x + w + 5, -51, BZ], [x + 5, -51, BZ]], true)}" stroke-width="1.2"/>`); }
}
/** small rounded key on a plane (centre c, normal n, u = long axis), with an LED line */
function key3(id, c, n, u, w, h, led = true) {
  const uu = nrm(sub(u, mul(n, dot(u, n)))), vv = cross(n, uu), hh = 2.6;
  const rect = (base, k) => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => add(base, add(mul(uu, a * w * k), mul(vv, b * h * k))));
  const top = add(c, mul(n, hh));
  const r0 = rect(c, 1), r1 = rect(top, 0.86);
  L.ctl.push(`<path d="${poly(r0, true)}" stroke-opacity=".55"/>`);
  L.ctlFill.push(`<path d="${poly(r1, true)}"/>`);
  L.ctl.push(`<path d="${poly(r1, true)}"/>`);
  for (let i = 0; i < 4; i++) L.ctl.push(`<path d="${poly([r0[i], r1[i]])}" stroke-opacity=".6"/>`);
  if (led) L.accent.push(`<path d="${poly([add(top, mul(uu, -w * 0.5)), add(top, mul(uu, w * 0.5))])}" stroke-width="1.8"/>`);
  anchor(id, top);
  return [...r0, ...r1].map(P2);
}
const UP = [0, 1, 0];
// square boot rising from the deck to the collar
{
  const prof = [[37, 0], [35, 7], [31, 14], [27, 20], [25, 25], [24.5, 29]];
  const sq = (r, y, t) => { const c = Math.cos(t), s2 = Math.sin(t); const e = (v) => Math.sign(v) * Math.abs(v) ** 0.5; return [r * e(c), y, r * e(s2)]; };
  const ringSq = (r, y, a0, a1, n = 40) => { const ps = []; for (let j = 0; j <= n; j++) ps.push(sq(r, y, (a0 + ((a1 - a0) * j) / n) * deg)); return ps; };
  // the well in the deck
  L.wire.push(`<path d="${smooth(ringSq(41, 0.2, 0, 360, 48).slice(0, -1), true)}" stroke-opacity=".8"/>`);
  for (const [r, y] of prof.slice(0, -1)) {
    L.wire.push(`<path d="${smooth(ringSq(r, y, tv - 100, tv + 100))}"${y === 14 ? ' stroke-dasharray="3 3"' : ''}/>`);
    L.back.push(`<path d="${smooth(ringSq(r, y, tv + 100, tv + 260))}"/>`);
  }
  for (const t of [45, 135, 225, 315, tv - 20, tv + 20, tv + 60, tv - 60]) { const pts = prof.map(([r, y]) => sq(r, y, t * deg)); L.wire.push(`<path d="${smooth(pts)}" stroke-opacity=".5"${t % 45 === 0 && t % 90 !== 0 ? ' stroke-dasharray="2 3"' : ''}/>`); }
  // boot outline: extreme points of each ring across the screen
  const lft = [], rgt = [];
  for (const [r, y] of prof) { const ps = ringSq(r, y, 0, 360, 72).map(P2); lft.push(ps.reduce((a, q) => (q[0] < a[0] ? q : a))); rgt.push(ps.reduce((a, q) => (q[0] > a[0] ? q : a))); }
  L.sil.push(`<path d="${smooth2(lft)}"/>`, `<path d="${smooth2(rgt)}"/>`);
  L.fill.push(`<path d="M${[...lft, ...rgt.reverse()].map(([x, y]) => `${f1(x)} ${f1(y)}`).join('L')}Z"/>`);
  // X / Y: arrows on the boot, pointing where the stick deflects
  for (const [t, lab] of [[0, 'Y'], [90, 'X'], [180, ''], [270, '']]) {
    const a = sq(33.5, 9, t * deg), b = sq(27.5, 19, t * deg), d = nrm(sub(a, b)), sd = nrm(cross(d, [-Math.sin(t * deg), 0, Math.cos(t * deg)]));
    const side = [Math.sin(t * deg) * -1, 0, Math.cos(t * deg)];
    L.axis.push(`<path d="${poly([b, a])}"/>`, `<path d="${poly([add(a, add(mul(d, -5), mul(side, 3.4))), a, add(a, add(mul(d, -5), mul(side, -3.4)))])}"/>`);
    void sd;
    void lab;
  }
  anchor('xy', sq(31, 14, (tv + 25) * deg));
  const [ax0, ay0] = anchors.xy;
  const ring = [...ringSq(37, 0, 0, 360, 36), ...ringSq(26, 22, 0, 360, 36)].map(P2);
  regions.xy = 'M' + grow(hull(ring), 3).map(([x, y]) => `${f1(x - ax0)} ${f1(y - ay0)}`).join('L') + 'Z';
  // collar (grip mount) with knurling
  const rc = 24.5;
  revRing(29, rc); revRing(41, rc, false, L.sil);
  for (const s2 of [-90, 90]) { const t = (tv + s2) * deg; L.sil.push(`<path d="${poly([[rc * Math.cos(t), 29, rc * Math.sin(t)], [rc * Math.cos(t), 41, rc * Math.sin(t)]])}"/>`); }
  for (let j = -8; j <= 8; j++) { const t = (tv + j * 10) * deg; L.wire.push(`<path d="${poly([[rc * Math.cos(t), 31, rc * Math.sin(t)], [rc * Math.cos(t), 39.5, rc * Math.sin(t)]])}" stroke-opacity=".6"/>`); }
}
// rows of four lit buttons beside the boot (index 1 = nearest the pilot)
for (const [id, z] of [['rowL', 46], ['rowR', -46]]) {
  const pts = [];
  for (let i = 0; i < 4; i++) pts.push(...key3(`${id}_${i}`, [-27 + i * 17, 0, z], UP, [1, 0, 0], 7.2, 5));
  anchor(id, [-1.5, 2.6, z]);
  region(id, grow(hull(pts), 3));
}
// F1-F3 keys at the pilot edge of the deck, with labels
{
  const pts = [];
  ['F1', 'F2', 'F3'].forEach((lab, i) => {
    const z = 15 - i * 15;
    pts.push(...key3(`f${i}`, [-48.5, 0, z], UP, [0, 0, 1], 5.4, 5, false));
    void lab;
  });
  anchor('fkeys', [-48.5, 2.6, 0]);
  region('fkeys', grow(hull(pts), 3));
}
// two flip / toggle switches at the pilot corners of the deck
for (const [id, z] of [['tog1', 41], ['tog2', -41]]) {
  const c = [-48, 0, z];
  const plate = [[-7, -6], [7, -6], [7, 6], [-7, 6]].map(([dx, dz]) => [c[0] + dx, 0.2, c[2] + dz]);
  L.ctl.push(`<path d="${poly(plate, true)}" stroke-opacity=".6"/>`);
  // the paddle leaning back towards the pilot
  const piv = [c[0], 1.5, c[2]], tip = [c[0] + 3, 15, c[2]];
  const wv = [0, 0, 5.5], th = [1.6, 0, 0];
  const pad = [add(piv, wv), add(tip, wv), add(tip, mul(wv, -1)), add(piv, mul(wv, -1))];
  const back = pad.map((q) => add(q, th)), front = pad.map((q) => sub(q, th));
  L.ctlFill.push(`<path d="${poly(front, true)}"/>`);
  L.ctl.push(`<path d="${poly(back, true)}" stroke-opacity=".5"/>`, `<path d="${poly(front, true)}"/>`, `<path d="${poly([front[1], back[1]])}"/>`, `<path d="${poly([front[0], back[0]])}" stroke-opacity=".6"/>`);
  for (const k of [0.6, 0.78, 0.94]) { const q = sub([lerp(piv[0], tip[0], k), lerp(piv[1], tip[1], k), c[2]], th); L.ctl.push(`<path d="${poly([add(q, mul(wv, 0.8)), add(q, mul(wv, -0.8))])}" stroke-opacity=".7"/>`); }
  anchor(id, [lerp(piv[0], tip[0], 0.6), lerp(piv[1], tip[1], 0.6), c[2]]);
  region(id, grow(hull([...plate, ...front, ...back].map(P2)), 3));
}
// three thumbwheels on the sloped pilot panel (the first one with a lever), in pockets
{
  const n = nrm([-(0 - SL), DX0 - BX0, 0]); // panel normal (up and back)
  const along = nrm([DX0 - BX0, 0 - SL, 0]); // up the slope
  const mid = (z) => add([lerp(BX0, DX0, 0.5), SL / 2, z], mul(n, 0));
  for (const z of [26, 9, -9, -26].slice(1, 3)) L.wire.push(`<path d="${poly([add(mid(z * 1.9), mul(along, -18)), add(mid(z * 1.9), mul(along, 18))])}" stroke-opacity=".5"/>`);
  for (const [id, z] of [['whl1', 32], ['whl2', 0], ['whl3', -32]]) {
    const c = mid(z);
    const pocket = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => add(c, add(mul(along, a * 15), mul([0, 0, 1], b * 9))));
    L.wire.push(`<path d="${poly(pocket, true)}" stroke-opacity=".7"/>`);
    wheel(id, c, n, [0, 0, 1], 10.5, 9);
  }
  // lever on the first wheel
  const c = mid(32);
  const base = add(c, add([0, 0, 6.5], mul(n, 4))), tip = add(base, add(mul(n, 4), mul(along, -11)));
  const lv = [add(base, [0, 0, 0]), add(base, [0, 0, 7]), add(tip, [0, 0, 7]), add(tip, [0, 0, 0])];
  L.ctlFill.push(`<path d="${poly(lv, true)}"/>`);
  L.ctl.push(`<path d="${poly(lv, true)}"/>`);
  const lp = P2(add(mid(-32), mul(along, -19))); L.text.push(`<text x="${f1(lp[0])}" y="${f1(lp[1] + 3)}" class="sm" text-anchor="middle">EN1</text>`);
}
// flip / pinky paddle at the base front
{
  const front = [[28, 38], [40, 46], [48, 58], [51, 74], [48, 88], [41, 97]];
  const back = [[25, 44], [34, 50], [40, 61], [42, 74], [41, 86], [41, 97]];
  const prof = [...front, ...back.slice(0, -1).reverse()];
  const z1 = 9, z2 = -9;
  const f2 = prof.map(([x, y]) => P2([x, y, z1])), b2 = prof.map(([x, y]) => P2([x, y, z2]));
  L.ctlFill.push(`<path d="${smooth2(f2, true)}"/>`);
  L.back.push(`<path d="${smooth2(b2, true)}"/>`);
  L.ctl.push(`<path d="${smooth2(f2, true)}"/>`);
  for (const i of [0, 3, 5]) L.ctl.push(`<path d="${poly([[...prof[i], z1], [...prof[i], z2]])}" stroke-opacity=".7"/>`);
  // grip texture dots
  for (let i = 1; i < 5; i++) for (const z of [-4, 0, 4]) {
    const [x, y] = front[i]; const [bx, by] = back[i]; L.ctl.push(ellipse([lerp(x, bx, 0.45), lerp(y, by, 0.45), z], [1, 0.3, 0], 0.9, ' class="cf"'));
  }
  // pivot + mount block
  L.ctl.push(ellipse([28, 40, z1 + 1], [0, 0, 1], 3.2), ellipse([28, 40, z1 + 1], [0, 0, 1], 1.2, ' class="cf"'));
  const blk = [[20, 32, 12], [34, 32, 12], [34, 46, 12], [20, 46, 12]];
  L.wire.push(`<path d="${poly(blk, true)}" stroke-opacity=".7"/>`);
  anchor('b4', [47, 72, z1]);
  region('b4', grow(hull([...f2, ...b2]), 4));
}

/* ---------------------------------------------------------------- holographic floor + twist indicator */
{
  const yF = BY0 - 2;
  const g = [];
  for (let x = -140; x <= 120; x += 20) g.push(`<path d="${poly([[x, yF, -120], [x, yF, 120]])}"/>`);
  for (let z = -120; z <= 120; z += 20) g.push(`<path d="${poly([[-140, yF, z], [120, yF, z]])}"/>`);
  L.floor.push(`<g mask="url(#fade)" stroke-opacity=".35">${g.join('')}</g>`);
  L.floor.push(`<path d="${poly([[BX0 - 8, yF, BZ + 8], [BX1 + 8, yF, BZ + 8], [BX1 + 8, yF, -BZ - 8], [BX0 - 8, yF, -BZ - 8]], true)}" stroke-opacity=".5" stroke-dasharray="2 5"/>`);
  // twist (Z rotation) arc around the collar
  const rt = 38, yT = 50;
  const arc = ringY(yT, rt, 40, tv - 80, tv + 60);
  L.axis.push(`<path d="${smooth(arc)}"/>`);
  const ah = (p, q) => { const d = nrm(sub(p, q)), side = [0, 1, 0]; return poly([add(p, add(mul(d, -8), mul(side, 4.5))), p, add(p, add(mul(d, -8), mul(side, -4.5)))]); };
  L.axis.push(`<path d="${ah(arc[0], arc[1])}"/>`, `<path d="${ah(arc[arc.length - 1], arc[arc.length - 2])}"/>`);
  const lp = P2([rt * 1.22 * Math.cos((tv - 92) * deg), yT, rt * 1.22 * Math.sin((tv - 92) * deg)]);
  L.text.push(`<text x="${f1(lp[0])}" y="${f1(lp[1] + 4)}" class="ax">RZ</text>`);
  anchor('rz', arc[12]);
  region('rz', grow(hull(arc.map(P2)), 7));
}

/* ---------------------------------------------------------------- assemble */
const baseHull = 'M' + hull([-84, 60].flatMap((x) => [-72, 0].flatMap((y) => [-64, 64].map((z) => P2([x, y, z]))))).map(([x, y]) => `${f1(x)} ${f1(y)}`).join('L') + 'Z';
const CY = '#4fd8ff';
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" fill="none" stroke-linecap="round" stroke-linejoin="round">
<defs>
<filter id="glow" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="2.4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<filter id="glow2" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<filter id="soft" x="-30%" y="-10%" width="160%" height="120%"><feGaussianBlur stdDeviation="18"/></filter>
<radialGradient id="halo" cx="50%" cy="55%" r="50%"><stop offset="0" stop-color="${CY}" stop-opacity=".13"/><stop offset=".6" stop-color="${CY}" stop-opacity=".04"/><stop offset="1" stop-color="${CY}" stop-opacity="0"/></radialGradient>
<linearGradient id="body" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b2a3d" stop-opacity=".55"/><stop offset="1" stop-color="#06131f" stop-opacity=".35"/></linearGradient>
<linearGradient id="strip" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#7b6cff"/><stop offset=".55" stop-color="#5fb8ff"/><stop offset="1" stop-color="#4fffe0"/></linearGradient>
<linearGradient id="beam" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="${CY}" stop-opacity=".10"/><stop offset="1" stop-color="${CY}" stop-opacity="0"/></linearGradient>
<pattern id="scan" width="6" height="4" patternUnits="userSpaceOnUse"><rect width="6" height="1.2" fill="${CY}" fill-opacity=".09"/></pattern>
<mask id="fade" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="url(#fadeg)"/><path d="${baseHull}" fill="#000"/></mask>
<radialGradient id="fadeg" cx="50%" cy="78%" r="30%" gradientUnits="objectBoundingBox"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#000"/></radialGradient>
<style>text{font:600 11px ui-monospace,Menlo,Consolas,monospace;fill:#8be9ff;stroke:none;letter-spacing:.06em}text.ax{font-size:12px;fill:#4fffe0}text.sm{font-size:8px;fill:#8be9ff;opacity:.85}.cf{fill:${CY};fill-opacity:.55}</style>
</defs>
<ellipse cx="500" cy="${H * 0.5}" rx="330" ry="${H * 0.5}" fill="url(#halo)"/>
<path d="M290 ${H - 90} L395 30 L605 30 L710 ${H - 90}Z" fill="url(#beam)" opacity=".7" filter="url(#soft)"/>
<g stroke="${CY}" stroke-width="1" filter="url(#glow)">${L.floor.join('')}</g>
<clipPath id="bodyclip">${L.fill.join('')}</clipPath>
<g clip-path="url(#bodyclip)"><rect width="${W}" height="${H}" fill="url(#body)"/><rect width="${W}" height="${H}" fill="url(#scan)"/></g>
<g stroke="#2aa9c4" stroke-width=".8" stroke-opacity=".35" stroke-dasharray="2 3">${L.back.join('')}</g>
<g stroke="#38c9e6" stroke-width="1" stroke-opacity=".75">${L.wire.join('')}</g>
<g stroke="#7fe9ff" stroke-width="2" filter="url(#glow)">${L.sil.join('')}</g>
<g stroke="url(#strip)" filter="url(#glow2)">${L.accent.join('')}</g>
<g fill="#0a2a3d" fill-opacity=".85" stroke="none">${L.ctlFill.join('')}</g>
<g stroke="#a8f1ff" stroke-width="1.4" filter="url(#glow)">${L.ctl.join('')}</g>
<g stroke="#ff5a6e" stroke-width="1.6" filter="url(#glow)">${L.red.join('')}</g>
<g stroke="#4fffe0" stroke-width="1.6" filter="url(#glow)">${L.axis.join('')}</g>
<g>${L.text.join('')}</g>
</svg>`.replace(/\n/g, '');

const svgOut = process.argv.slice(2).find((a) => a.endsWith('.svg')); // optional standalone SVG, e.g. for previews
if (svgOut) writeFileSync(svgOut, svg);
const ts = `// Generated by scripts/gen-default-stick.mjs: do not edit by hand. Original holographic wireframe art (no vendor artwork).
export const DEFAULT_STICK_W = ${W};
export const DEFAULT_STICK_H = ${H};
export const DEFAULT_STICK_SVG = ${JSON.stringify(svg)};
/** control positions on the ${W} x ${H} canvas */
export const DEFAULT_STICK_ANCHORS: Record<string, [number, number]> = ${JSON.stringify(Object.fromEntries(Object.entries(anchors).map(([k, [x, y]]) => [k, [Math.round(x * 10) / 10, Math.round(y * 10) / 10]])))};
/** outline of each control, relative to its anchor (canvas units), lit up when the control is used */
export const DEFAULT_STICK_REGIONS: Record<string, string> = ${JSON.stringify(regions)};
`;
writeFileSync(new URL('../src/lib/defaultStickArt.ts', import.meta.url), ts);
console.log(`default stick: svg ${svg.length} bytes, ${Object.keys(anchors).length} anchors`);
