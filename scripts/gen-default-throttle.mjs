// Generates the built-in default throttle art (src/lib/defaultThrottleArt.ts): an original holographic wireframe twin-lever
// throttle (split grips, control panel base) drawn from a small 3D model in a 3/4 view, same style as the default stick.
// Run: node scripts/gen-default-throttle.mjs
import { writeFileSync } from 'node:fs';

const W = 1000, H = 800;
const MX = 1;
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

/* ---------------------------------------------------------------- camera: from behind (pilot side) right and above */
const AZ = 32 * deg, EL = 27 * deg;
const V = [-Math.sin(AZ) * Math.cos(EL), Math.sin(EL), Math.cos(AZ) * Math.cos(EL)];
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

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}
/* ---------------------------------------------------------------- fit into the canvas */
{
  const raw = (p) => [dot(p, R), -dot(p, U)];
  const pts = [];
  for (const x of [-131, 85]) for (const y of [-45, 0]) for (const z of [-85, 85]) pts.push(raw([x, y, z]));
  for (const x of [-38, 75]) for (const z of [-50, 50]) pts.push(raw([x, 102, z]));
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  S = Math.min(640 / (y1 - y0), 590 / (x1 - x0));
  OX = 500 - S * (x0 + x1) / 2; OY = 705 - S * y1;
}
const L = { back: [], wire: [], sil: [], ctl: [], ctlFill: [], red: [], accent: [], floor: [], axis: [], text: [], fill: [] };
const anchors = {}, regions = {};
const anchor = (id, p) => { anchors[id] = P2(p); };
/** outlines (closed 2D polygons) as one SVG path relative to the anchor of `id` */
function relPath(id, outlines) {
  const [ax, ay] = anchors[id];
  return outlines.map((ps) => 'M' + ps.map(([x, y]) => `${f1(x - ax)} ${f1(y - ay)}`).join('L') + 'Z').join('');
}
function region(id, ...outlines) { regions[id] = relPath(id, outlines); }
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
function ringY(y, r, steps = 96, a0 = 0, a1 = 360) { const ps = []; for (let j = 0; j <= steps; j++) { const t = (a0 + ((a1 - a0) * j) / steps) * deg; ps.push([r * Math.cos(t), y, r * Math.sin(t)]); } return ps; }
/* ---------------------------------------------------------------- loft helper (vertical stack of superellipse sections) */
function makeLoft(KEYS, off, pex = 3) {
  const n = KEYS.length, KT = n - 1;
  const sec = (k) => { const i = Math.max(0, Math.min(n - 2, Math.floor(k))), t = Math.min(1, Math.max(0, k - i)); const g = (j) => KEYS[Math.max(0, Math.min(n - 1, j))]; return [0, 1, 2, 3].map((c) => catmull(g(i - 1)[c], g(i)[c], g(i + 1)[c], g(i + 2)[c], t)); };
  const se = (v) => Math.sign(v) * Math.abs(v) ** (2 / pex);
  const surf = (k, phi) => { const [y, dx, a, b] = sec(k); const c = Math.cos(phi * deg), s = Math.sin(phi * deg); return [off[0] + dx + a * se(c), y, off[2] + b * se(s)]; };
  const ctr = (k) => { const [y, dx] = sec(k); return [off[0] + dx, y, off[2]]; };
  const surfN = (k, phi) => { const e = 0.01, d = 0.5; const dk = sub(surf(k + e, phi), surf(k - e, phi)), dp = sub(surf(k, phi + d), surf(k, phi - d)); let nn = nrm(cross(dp, dk)); if (dot(nn, sub(surf(k, phi), ctr(k))) < 0) nn = mul(nn, -1); return nn; };
  return { surf, surfN, ctr, KT, sec, se };
}
/** draw a loft: silhouette, contour rings, flow lines, cap (top), fill */
function drawLoft(lo, rings, flows = 12) {
  const { surf, surfN, ctr, KT } = lo;
  const NK = 40, silA = [], silB = [];
  for (let i = 0; i <= NK; i++) {
    const k = (i / NK) * KT; const ps = []; for (let j = 0; j < 48; j++) ps.push(P2(surf(k, j * 7.5)));
    const c = P2(ctr(k));
    let lo2 = ps[0], hi = ps[0]; for (const q of ps) { if (q[0] < lo2[0]) lo2 = q; if (q[0] > hi[0]) hi = q; }
    silA.push(lo2); silB.push(hi);
    if (i < NK && i % 2 === 0) { const ps2 = []; for (let j = 0; j < 48; j++) ps2.push(P2(surf(((i + 2) / NK) * KT, j * 7.5))); L.fill.push(`<path d="M${hull([...ps, ...ps2]).map(([x, y]) => `${f1(x)} ${f1(y)}`).join('L')}Z"/>`); }
    void c;
  }
  L.sil.push(`<path d="${smooth2(silA.filter((_, i) => i % 3 === 0 || i === NK))}"/>`, `<path d="${smooth2(silB.filter((_, i) => i % 3 === 0 || i === NK))}"/>`);
  const ringAt = (k, tgtVis, tgtHid) => {
    let seg = [], vis = null;
    const flush = () => { if (seg.length > 1) (vis ? tgtVis : tgtHid).push(`<path d="${smooth(seg)}"/>`); };
    for (let j = 0; j <= 48; j++) { const phi = j * 7.5, p = surf(k, phi), v = dot(surfN(k, phi), V) > 0; if (vis === null) vis = v; if (v !== vis) { seg.push(p); flush(); seg = [p]; vis = v; } else seg.push(p); }
    flush();
  };
  for (const k of rings) ringAt(k, L.wire, L.back);
  // top cap outline (fully visible from above)
  const top = []; for (let j = 0; j < 40; j++) top.push(surf(KT, j * 9));
  L.sil.push(`<path d="${smooth(top, true)}"/>`);
  L.fill.push(`<path d="M${top.map(P2).map(([x, y]) => `${f1(x)} ${f1(y)}`).join('L')}Z"/>`);
  for (let j = 0; j < flows; j++) {
    const phi = (j / flows) * 360 + 7.5;
    let seg = [], vis = null;
    const flush = () => { if (seg.length > 1) (vis ? L.wire : L.back).push(`<path d="${smooth(seg)}"/>`); };
    for (let i = 0; i <= 16; i++) { const k = (i / 16) * KT, p = surf(k, phi), v = dot(surfN(k, phi), V) > 0; if (vis === null) vis = v; if (v !== vis) { seg.push(p); flush(); seg = [p]; vis = v; } else seg.push(p); }
    flush();
  }
}
/** a box from min / max corners, with visible / hidden edges */
function box3(x0, y0, z0, x1, y1, z1, tgt = L.wire, fill = true) {
  const P = (i) => [i & 1 ? x1 : x0, i & 2 ? y1 : y0, i & 4 ? z1 : z0];
  const faces = [[0, 1, 3, 2, [0, 0, -1]], [4, 6, 7, 5, [0, 0, 1]], [0, 4, 5, 1, [0, -1, 0]], [2, 3, 7, 6, [0, 1, 0]], [0, 2, 6, 4, [-1, 0, 0]], [1, 5, 7, 3, [1, 0, 0]]];
  const vis = faces.map((f) => dot(f[4], V) > 0);
  const edges = new Map();
  faces.forEach((f, fi) => { for (let j = 0; j < 4; j++) { const a = f[j], b = f[(j + 1) % 4]; const k = [a, b].sort().join('-'); const e = edges.get(k) ?? { a, b, fs: [] }; e.fs.push(fi); edges.set(k, e); } });
  for (const e of edges.values()) { const nv = e.fs.filter((i) => vis[i]).length; if (nv) tgt.push(`<path d="${poly([P(e.a), P(e.b)])}"${nv === 1 ? ' stroke-width="1.6"' : ''}/>`); else L.back.push(`<path d="${poly([P(e.a), P(e.b)])}"/>`); }
  if (fill) faces.forEach((f, i) => { if (vis[i]) L.fill.push(`<path d="${poly(f.slice(0, 4).map(P), true)}"/>`); });
  return [0, 1, 2, 3, 4, 5, 6, 7].map((i) => P2(P(i)));
}

/* ---------------------------------------------------------------- base: long flat box, chamfered deck, splayed feet. Pilot side = -X */
const BX0 = -118, BX1 = 72, BZ = 72, BY0 = -36, CHF = 5;
const UP = [0, 1, 0];
{
  const dk = [[BX0 + CHF, 0, BZ - CHF], [BX1 - CHF, 0, BZ - CHF], [BX1 - CHF, 0, -BZ + CHF], [BX0 + CHF, 0, -BZ + CHF]];
  const rim = (y) => [[BX0, y, BZ], [BX1, y, BZ], [BX1, y, -BZ], [BX0, y, -BZ]];
  const top = rim(-CHF), bot = rim(BY0);
  const faces = [dk, ...[0, 1, 2, 3].map((i) => [dk[i], dk[(i + 1) % 4], top[(i + 1) % 4], top[i]]), ...[0, 1, 2, 3].map((i) => [top[i], top[(i + 1) % 4], bot[(i + 1) % 4], bot[i]]), [...bot].reverse()];
  const ctr = [(BX0 + BX1) / 2, BY0 / 2, 0];
  const normal = (f) => { let n = [0, 0, 0]; for (let i = 0; i < f.length; i++) { const a = f[i], b = f[(i + 1) % f.length]; n = add(n, [(a[1] - b[1]) * (a[2] + b[2]), (a[2] - b[2]) * (a[0] + b[0]), (a[0] - b[0]) * (a[1] + b[1])]); } n = nrm(n); const c = f.reduce((s, p) => add(s, mul(p, 1 / f.length)), [0, 0, 0]); return dot(n, sub(c, ctr)) < 0 ? mul(n, -1) : n; };
  const vis = faces.map((f) => dot(normal(f), V) > 0.02);
  const key = (p) => p.map((v) => v.toFixed(2)).join(',');
  const edges = new Map();
  faces.forEach((f, i) => f.forEach((p, j) => { const q = f[(j + 1) % f.length]; const k = [key(p), key(q)].sort().join('|'); const e = edges.get(k) ?? { p, q, faces: [] }; e.faces.push(i); edges.set(k, e); }));
  for (const e of edges.values()) { const nv = e.faces.filter((i) => vis[i]).length; (nv === 1 ? L.sil : nv === 2 ? L.wire : L.back).push(`<path d="${poly([e.p, e.q])}"${nv === 2 ? ' stroke-width="1.3"' : ''}/>`); }
  faces.forEach((f, i) => { if (vis[i]) L.fill.push(`<path d="${poly(f, true)}"/>`); });
  // splayed feet at the corners
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const cx = sx < 0 ? BX0 : BX1, cz = sz * BZ;
    const o = [cx + sx * 13, BY0 - 9, cz + sz * 13];
    const a = [cx - sx * 4, BY0, cz], b = [cx, BY0, cz - sz * 4];
    L.wire.push(`<path d="${poly([a, o, b])}" stroke-width="1.3"/>`, ellipse(o, UP, 7, ' stroke-opacity=".8"'), ellipse([o[0], o[1] + 2.5, o[2]], UP, 6, ' stroke-opacity=".5"'));
  }
  // vents on the right wall, label plate with a status LED strip and a port on the pilot wall
  for (let i = 0; i < 13; i++) { const x = -40 + i * 7; L.wire.push(`<path d="${poly([[x, -30, BZ], [x + 3, -30, BZ], [x + 3, -11, BZ], [x, -11, BZ]], true)}" stroke-opacity=".7"/>`); }
  L.wire.push(`<path d="${poly([[BX0, -30, -40], [BX0, -30, 40], [BX0, -13, 40], [BX0, -13, -40]], true)}" stroke-opacity=".55"/>`, `<path d="${poly([[BX0, -24, 52], [BX0, -24, 60], [BX0, -19, 60], [BX0, -19, 52]], true)}" stroke-opacity=".7"/>`);
  for (let i = 0; i < 6; i++) { const z = -34 + i * 7; L.accent.push(`<path d="${poly([[BX0, -26, z], [BX0, -26, z + 3], [BX0, -17, z + 6], [BX0, -17, z + 3]], true)}" stroke-width="1.1"/>`); }
  // panel plate on the pilot half of the deck, with screws and group frames
  const pz = BZ - 6;
  L.wire.push(`<path d="${poly([[-115, 0.1, pz], [-30, 0.1, pz], [-30, 0.1, -pz], [-115, 0.1, -pz]], true)}" stroke-opacity=".8"/>`);
  for (const [x, z] of [[-112, pz - 3], [-33, pz - 3], [-33, -pz + 3], [-112, -pz + 3]]) L.wire.push(ellipse([x, 0.1, z], UP, 1.3));
  L.wire.push(`<path d="${poly([[-114, 0.1, -68], [-75, 0.1, -68], [-75, 0.1, -12], [-114, 0.1, -12]], true)}" stroke-opacity=".45" stroke-dasharray="4 3"/>`);
  L.wire.push(`<path d="${poly([[-115, 0.1, 46], [-72, 0.1, 46], [-72, 0.1, 65.5], [-115, 0.1, 65.5]], true)}" stroke-opacity=".45" stroke-dasharray="4 3"/>`);
}
/** convex 8-corner block (bottom and top quads, same corner order) with visible / hidden edges */
function prism(bot, top, tgt = L.wire) {
  const vs = [...bot, ...top];
  const faces = [[0, 1, 2, 3], [7, 6, 5, 4], [0, 4, 5, 1], [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 4, 0]];
  const ctr = vs.reduce((s, p) => add(s, mul(p, 1 / 8)), [0, 0, 0]);
  const vis = faces.map((f) => { let n = nrm(cross(sub(vs[f[1]], vs[f[0]]), sub(vs[f[2]], vs[f[0]]))); const c = f.reduce((s, i) => add(s, mul(vs[i], 1 / 4)), [0, 0, 0]); if (dot(n, sub(c, ctr)) < 0) n = mul(n, -1); return dot(n, V) > 0; });
  const edges = new Map();
  faces.forEach((f, fi) => f.forEach((a, j) => { const b = f[(j + 1) % 4]; const k = [a, b].sort().join('-'); const e = edges.get(k) ?? { a, b, fs: [] }; e.fs.push(fi); edges.set(k, e); }));
  for (const e of edges.values()) { const nv = e.fs.filter((i) => vis[i]).length; (nv ? tgt : L.back).push(`<path d="${poly([vs[e.a], vs[e.b]])}"${nv === 1 ? ' stroke-width="1.6"' : ''}/>`); }
  faces.forEach((f, i) => { if (vis[i]) L.fill.push(`<path d="${poly(f.map((j) => vs[j]), true)}"/>`); });
  return vs.map(P2);
}
const quad = (x0, x1, z0, z1, y) => [[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]];
/* ---------------------------------------------------------------- lever gate, twin levers and split grips */
const XL = 0, XR = 40, ZL = -31, ZR = 29; // lever positions: split (right lever pushed further forward)
{
  L.wire.push(`<path d="${poly([[-20, 0.1, 46], [66, 0.1, 46], [66, 0.1, -46], [-20, 0.1, -46]], true)}" stroke-opacity=".8"/>`);
  for (const z of [ZL, ZR]) {
    L.wire.push(`<path d="${poly([[-14, 0.2, z - 3.5], [60, 0.2, z - 3.5], [60, 0.2, z + 3.5], [-14, 0.2, z + 3.5]], true)}"/>`);
    const s = z < 0 ? 1 : -1;
    for (let x = -10; x <= 50; x += 10) L.wire.push(`<path d="${poly([[x, 0.2, z + s * 6], [x, 0.2, z + s * (x % 20 === 0 ? 11 : 8.5)]])}" stroke-opacity=".7"/>`);
  }
  // detents: IDLE (pilot end) and AB / MAX
  L.axis.push(`<path d="${poly([[-8, 0.3, -40], [-8, 0.3, 40]])}" stroke-dasharray="3 3"/>`, `<path d="${poly([[54, 0.3, -40], [54, 0.3, 40]])}" stroke-dasharray="3 3"/>`);
  const t1 = P2([-8, 0, 51]), t2 = P2([54, 0, 51]);
  L.text.push(`<text x="${f1(t1[0])}" y="${f1(t1[1] + 4)}" class="sm">IDLE</text>`, `<text x="${f1(t2[0])}" y="${f1(t2[1] + 4)}" class="sm">MAX</text>`);
}
const GY = 37, YB = GY + 6; // top of the lever posts, seat of the grips (on a mount shoe)
// grip body: lofted fore-aft (X) through rounded-rectangle sections, flat underside on the shoe, palm hump at the rear
const PROF = [
  // x (from the lever), h (height above the seat), b (half width), z offset
  [-33, 38, 15.5, 1],
  [-31.5, 45, 17, 1],
  [-24, 50, 17.5, 0.8],
  [-10, 52, 17.5, 0],
  [6, 48, 17.5, -1.2],
  [18, 38, 17, -2.4],
  [27, 26, 16, -3.2],
  [31, 18, 14.5, -3.5],
];
function makeGrip(Xc, Zc, prof0, pex = 5) {
  const prof = prof0.map(([x, h, b, dz]) => [x * 1.12, h * 1.12, b * 1.1, dz]); // overall grip size
  const n = prof.length, KT = n - 1;
  const g = (j) => prof[Math.max(0, Math.min(n - 1, j))];
  const sec = (k) => { const i = Math.max(0, Math.min(n - 2, Math.floor(k))), t = Math.min(1, Math.max(0, k - i)); return [0, 1, 2, 3].map((c) => catmull(g(i - 1)[c], g(i)[c], g(i + 1)[c], g(i + 2)[c], t)); };
  const se = (v) => Math.sign(v) * Math.abs(v) ** (2 / pex);
  const surf = (k, phi) => { const [x, h, b, dz] = sec(k); const c = Math.cos(phi * deg), s = Math.sin(phi * deg); return [Xc + x, YB + h / 2 + (h / 2) * se(s), Zc + dz + b * se(c)]; };
  const ctr = (k) => { const [x, h, , dz] = sec(k); return [Xc + x, YB + h / 2, Zc + dz]; };
  const surfN = (k, phi) => { const e = 0.01, d = 0.5; const dk = sub(surf(k + e, phi), surf(k - e, phi)), dp = sub(surf(k, phi + d), surf(k, phi - d)); let nn = nrm(cross(dp, dk)); if (dot(nn, sub(surf(k, phi), ctr(k))) < 0) nn = mul(nn, -1); return nn; };
  /** k for a given x (from the lever) */
  const kAt = (x) => { let k = 0; for (let i = 0; i <= 400; i++) { const kk = (i / 400) * KT; if (Math.abs(sec(kk)[0] - x) < Math.abs(sec(k)[0] - x)) k = kk; } return k; };
  return { surf, surfN, ctr, KT, sec, kAt, Xc, Zc };
}
/** grip body: hull silhouette, section rings, flow lines (visible solid, hidden dashed), body fill */
function drawGrip(gr) {
  const { surf, surfN, KT } = gr;
  const all = [];
  for (let i = 0; i <= 56; i++) for (let j = 0; j < 72; j++) all.push(P2(surf((i / 56) * KT, j * 5)));
  const h = hull(all);
  const d = 'M' + h.map(([x, y]) => `${f1(x)} ${f1(y)}`).join('L') + 'Z';
  L.sil.push(`<path d="${d}"/>`);
  L.fill.push(`<path d="${d}"/>`);
  const curve = (pts, vis) => { let seg = [], cur = null; const out = (s, v) => { if (s.length > 1) (v ? L.wire : L.back).push(`<path d="${smooth(s)}"/>`); }; for (const [p, v] of pts.map((p, i) => [p, vis[i]])) { if (cur === null) cur = v; if (v !== cur) { seg.push(p); out(seg, cur); seg = [p]; cur = v; } else seg.push(p); } out(seg, cur); };
  for (const k of [0, 1, 2.5, 4, 5.4, 7]) { const ps = [], vs = []; for (let j = 0; j <= 72; j++) { ps.push(surf(k, j * 5)); vs.push(dot(surfN(k, j * 5), V) > 0); } curve(ps, vs); }
  for (const phi of [-30, 20, 55, 90, 125, 160, 210]) { const ps = [], vs = []; for (let i = 0; i <= 28; i++) { const k = (i / 28) * KT; ps.push(surf(k, phi)); vs.push(dot(surfN(k, phi), V) > 0); } curve(ps, vs); }
  // flat end faces (palm face at the rear, nose at the front)
  for (const k of [0, KT]) { const ring = []; for (let j = 0; j < 72; j++) ring.push(surf(k, j * 5)); const facing = dot([k ? 1 : -1, 0, 0], V) > 0; (facing ? L.wire : L.back).push(`<path d="${smooth(ring, true)}"${facing ? ' stroke-width="1.4"' : ''}/>`); }
  // seam where the body meets the shoe
  { const ps = [], vs = []; for (let i = 0; i <= 28; i++) { const k = 0.5 + (i / 28) * (KT - 1); ps.push(surf(k, -62)); vs.push(dot(surfN(k, -62), V) > 0); } curve(ps, vs); }
  return h;
}
/** lever: tapered post from the gate slot up to a mount shoe the grip sits on */
function lever(Xc, Zc) {
  const post = prism(quad(Xc - 6, Xc + 6, Zc - 3, Zc + 3, 0), quad(Xc - 10, Xc + 9, Zc - 7, Zc + 7, GY - 3));
  const shoe = prism(quad(Xc - 35, Xc + 19, Zc - 21.5, Zc + 21.5, GY - 3), quad(Xc - 35, Xc + 19, Zc - 21.5, Zc + 21.5, YB));
  // bolts on the shoe's side
  for (const x of [Xc - 25, Xc - 7, Xc + 11]) L.wire.push(ellipse([x, GY + 1.5, Zc + 21.6], [0, 0, 1], 1.3));
  return { post, shoe };
}
const gripL = makeGrip(XL, ZL, PROF.map(([x, h, b, dz]) => [x, h, b, -dz])), gripR = makeGrip(XR, ZR, PROF);
const levL = lever(XL, ZL);
const hullL = drawGrip(gripL);
const levR = lever(XR, ZR);
const hullR = drawGrip(gripR);
// palm rest texture on the rear top of each grip
for (const g of [gripL, gripR]) for (let i = 0; i < 5; i++) {
  const k = 1.25 + i * 0.32, ps = [];
  for (let j = 0; j <= 10; j++) { const phi = 62 + j * 5.6; ps.push(add(g.surf(k, phi), mul(g.surfN(k, phi), 0.4))); }
  L.accent.push(`<path d="${smooth(ps)}" stroke-width="1.3"/>`);
}
// lever axes: anchors on the posts, regions = whole lever (post + shoe + grip) + gate slot
anchor('lz', [XL + 9, GY * 0.45, ZL + 6]);
region('lz', grow(hull([...levL.post, ...levL.shoe, ...hullL]), 2), grow(hull([P2([-14, 0, ZL - 4]), P2([60, 0, ZL - 4]), P2([60, 0, ZL + 4]), P2([-14, 0, ZL + 4])]), 2));
anchor('lrz', [XR + 9, GY * 0.45, ZR + 6]);
region('lrz', grow(hull([...levR.post, ...levR.shoe, ...hullR]), 2), grow(hull([P2([-14, 0, ZR - 4]), P2([60, 0, ZR - 4]), P2([60, 0, ZR + 4]), P2([-14, 0, ZR + 4])]), 2));

/* ---------------------------------------------------------------- grip controls */
{
  const g = gripR, S2 = (x, p) => { const k = g.kAt(x); return [g.surf(k, p), g.surfN(k, p)]; };
  let [p, n] = S2(15, 58); hat('hat1', p, n, 6.8, [1, 0, 0]);
  [p, n] = S2(-12, 38); ministick('ms', p, n, 5.6);
  [p, n] = S2(9, 6); hat('hat2', p, n, 6.2, [0, 1, 0]);
  [p, n] = S2(-15, -14); button('gb1', p, n, 4.2);
  [p, n] = S2(-24, 84); wheel('whl', p, n, [0, 0, 1], 5.6, 8);
}
{
  const g = gripL, S2 = (x, p) => { const k = g.kAt(x); return [g.surf(k, p), g.surfN(k, p)]; };
  const [p, n] = S2(10, 80); hat('hat3', p, n, 6.6, [1, 0, 0]);
}
/** finger trigger hanging under the front of a grip (profile in the x-y plane, extruded across); stages = arc marks */
function trigger(id, Xc, Zc, stages) {
  const front = [[32, 0], [34.5, -5], [33.5, -10], [29, -15.5], [23.5, -17]].map(([x, y]) => [x + Xc, y + YB]);
  const back = [[23.5, 0], [25.5, -5], [24.5, -10], [23.5, -17]].map(([x, y]) => [x + Xc, y + YB]);
  const prof = [...front, ...back.slice(0, -1).reverse()];
  const z0 = Zc + 5, w = 4;
  const f2 = prof.map(([x, y]) => P2([x, y, z0 + w])), b2 = prof.map(([x, y]) => P2([x, y, z0 - w]));
  L.ctlFill.push(`<path d="${smooth2(f2, true)}"/>`, `<path d="M${hull([...f2, ...b2]).map(([x, y]) => `${f1(x)} ${f1(y)}`).join('L')}Z" fill-opacity=".5"/>`);
  L.back.push(`<path d="${smooth2(b2, true)}"/>`);
  L.ctl.push(`<path d="${smooth2(f2, true)}"/>`);
  for (const i of [1, 2, 3]) L.ctl.push(`<path d="${poly([[...prof[i], z0 + w], [...prof[i], z0 - w]])}" stroke-opacity=".7"/>`);
  if (stages) {
    const cx = Xc + 12, cy = YB + 2, r = 24, arc = [];
    for (let j = 0; j <= 12; j++) { const t = (-62 + j * 5) * deg; arc.push([cx + r * Math.cos(t), cy + r * Math.sin(t), z0 + w + 1]); }
    L.axis.push(`<path d="${smooth(arc)}" stroke-dasharray="3 3"/>`);
    for (const [j, lab] of [[3, '1'], [10, '2']]) { const t = (-62 + j * 5) * deg; const lp = P2([cx + (r + 6) * Math.cos(t), cy + (r + 6) * Math.sin(t), z0 + w + 1]); L.text.push(`<text x="${f1(lp[0])}" y="${f1(lp[1] + 3)}" class="sm">${lab}</text>`); }
  }
  anchor(id, [front[2][0] - 1, front[2][1], z0 + w]);
  region(id, grow(hull([...f2, ...b2]), 4));
}
trigger('trgR', XR, ZR, true);
trigger('trgL', XL, ZL, false);

/* ---------------------------------------------------------------- panel controls */
// lit keypad 3 x 2: one outline per key so only the pressed key lights up
const inputRegions = {};
{
  const pts = [];
  let i = 0;
  const XS = [-104, -84], ZS = [-58, -40, -22];
  for (const x of XS) for (const z of ZS) pts.push(key3(`k${i++}`, [x, 0, z], UP, [0, 0, 1], 7.8, 7.8, true));
  L.ctlFill.push(...XS.flatMap((x) => ZS.map((z) => `<path d="${poly([[x - 6.4, 2.7, z - 6.4], [x + 6.4, 2.7, z - 6.4], [x + 6.4, 2.7, z + 6.4], [x - 6.4, 2.7, z + 6.4]], true)}" fill="#4fffe0" fill-opacity=".16"/>`)));
  anchor('keys', [-94, 2.7, -40]);
  const outl = pts.map((k) => grow(hull(k), 2));
  region('keys', ...outl);
  inputRegions.keys = outl.map((o) => relPath('keys', [o]));
}
// guarded red button with an open flip guard and hazard stripes
{
  const c = [-104, 0, 28];
  for (let i = 0; i < 5; i++) { const z = c[2] - 11 + i * 5; L.red.push(`<path d="${poly([[c[0] - 12, 0.2, z], [c[0] - 12, 0.2, z + 2.5], [c[0] - 7, 0.2, z + 5], [c[0] - 7, 0.2, z + 2.5]], true)}" stroke-width="1" stroke-opacity=".7"/>`); }
  button('red', c, UP, 7.4, 3.8, true);
  const hz = c[2] - 10.5; // flip cover hinged on the far side, standing open
  const g = [[c[0] - 9, 1, hz], [c[0] + 9, 1, hz], [c[0] + 9, 15, hz - 3], [c[0] - 9, 15, hz - 3]];
  L.red.push(`<path d="${poly(g, true)}" stroke-opacity=".9"/>`, `<path d="${poly([[c[0] - 9, 8, hz - 1.5], [c[0] + 9, 8, hz - 1.5]])}" stroke-opacity=".5"/>`);
  L.ctlFill.push(`<path d="${poly(g, true)}" fill="#ff4d6d" fill-opacity=".08"/>`);
  region('red', grow(hull([...ellipsePts(c, UP, 12), ...g.map(P2)]), 3));
}
/** push encoder knob: knurled cylinder with a pointer */
function knob(id, c, r, h, pointerDeg = 30) {
  const top = add(c, [0, h, 0]);
  L.ctl.push(ellipse(c, UP, r * 1.45, ' stroke-opacity=".5"'));
  L.ctlFill.push(ellipse(top, UP, r));
  L.ctl.push(ellipse(c, UP, r), cylSides(c, UP, r, h), ellipse(top, UP, r), ellipse(top, UP, r * 0.6, ' stroke-opacity=".6"'));
  for (let j = -6; j <= 6; j++) { const t = (tv + j * 13) * deg; L.ctl.push(`<path d="${poly([add(c, [r * Math.cos(t), 1, r * Math.sin(t)]), add(c, [r * Math.cos(t), h - 1, r * Math.sin(t)])])}" stroke-opacity=".6"/>`); }
  const t = pointerDeg * deg; L.ctl.push(`<path d="${poly([add(top, [0, 0.1, 0]), add(top, [r * 0.9 * Math.cos(t), 0.1, r * 0.9 * Math.sin(t)])])}" stroke-width="2"/>`);
  anchor(id, top);
  region(id, grow(hull([...ellipsePts(c, UP, r * 1.45), ...ellipsePts(top, UP, r)]), 3));
}
const tv = Math.atan2(V[2], V[0]) / deg;
knob('e1', [-50, 0, 0], 8.4, 8.5, 200);
knob('e2', [-50, 0, 28], 8.4, 8.5, 140);
for (const [z, lab, dx, dz] of [[0, 'E1', -29, -15], [28, 'E2', -34, 4]]) { const lp = P2([dx, 0, z + dz]); L.text.push(`<text x="${f1(lp[0])}" y="${f1(lp[1] + 3)}" class="md" text-anchor="middle">${lab}</text>`); }
// mode rotary 1-5, labels on the near side of the dial
{
  const c = [-50, 0, -46];
  knob('mode', c, 8, 7.5, 90);
  for (let i = 0; i < 5; i++) {
    const t = (18 + i * 36) * deg; const a = add(c, [13 * Math.cos(t), 0.2, 13 * Math.sin(t)]), b = add(c, [15.5 * Math.cos(t), 0.2, 15.5 * Math.sin(t)]);
    L.axis.push(`<path d="${poly([a, b])}"/>`);
    const lp = P2(add(c, [20 * Math.cos(t), 0, 20 * Math.sin(t)])); L.text.push(`<text x="${f1(lp[0])}" y="${f1(lp[1] + 3.5)}" class="md" text-anchor="middle">${i + 1}</text>`);
  }
  const lp = P2(add(c, [0, 0, -20])); L.text.push(`<text x="${f1(lp[0])}" y="${f1(lp[1] + 3)}" class="sm" text-anchor="middle">MODE</text>`);
}
// bat-handle toggles T1 (on-off-on), T2, T3 in a row
for (const [id, x, z, lean] of [['t1', -108, 54, 0], ['t2', -94, 54, 7], ['t3', -80, 54, -7]]) {
  const c = [x, 0, z];
  L.ctl.push(ellipse(c, UP, 6, ' stroke-opacity=".55"'), ellipse(add(c, [0, 2.5, 0]), UP, 4.2), cylSides(c, UP, 4.2, 2.5));
  const tip = add(c, [lean, 18, 0]);
  L.ctl.push(`<path d="${poly([add(c, [0, 2, 0]), tip])}" stroke-width="2.6"/>`, ellipse(tip, nrm(sub(tip, c)), 2.4, ' class="cf"'));
  anchor(id, add(c, [lean * 0.7, 9, 0]));
  region(id, grow(hull([...ellipsePts(c, UP, 4.6), P2(tip), P2(add(tip, [0, 2, 0]))]), 4));
  const lp = P2(add(c, [0, 0, 11])); L.text.push(`<text x="${f1(lp[0])}" y="${f1(lp[1] + 4.5)}" class="md" text-anchor="middle">${id.toUpperCase()}</text>`);
}
// side levers: flaps (right) and a slider fin (left)
function sideLever(id, z, xh, fin) {
  L.wire.push(`<path d="${poly([[-16, 0.2, z - 3], [38, 0.2, z - 3], [38, 0.2, z + 3], [-16, 0.2, z + 3]], true)}"/>`);
  for (let x = -12; x <= 36; x += 12) L.wire.push(`<path d="${poly([[x, 0.2, z + 5], [x, 0.2, z + 8]])}" stroke-opacity=".7"/>`);
  const post = box3(xh - 1.5, 0, z - 1.5, xh + 1.5, 10, z + 1.5, L.ctl, false);
  let hd;
  if (fin) { const pr = [[xh - 4, 10], [xh + 6, 10], [xh + 9, 22], [xh + 1, 24]]; const a = pr.map(([x, y]) => P2([x, y, z + 2.5])), b = pr.map(([x, y]) => P2([x, y, z - 2.5])); L.ctlFill.push(`<path d="${smooth2(a, true)}"/>`); L.ctl.push(`<path d="${smooth2(a, true)}"/>`, `<path d="${smooth2(b, true)}" stroke-opacity=".5"/>`); hd = [...a, ...b]; }
  else hd = box3(xh - 3, 10, z - 7, xh + 3, 19, z + 7, L.ctl, false);
  anchor(id, [xh, 15, z]);
  region(id, grow(hull([...post, ...hd]), 4));
}
sideLever('flaps', 57, 4, false);
sideLever('sld', -57, -8, true);

/* ---------------------------------------------------------------- floor */
{
  const yF = BY0 - 10;
  const g = [];
  for (let x = -160; x <= 140; x += 20) g.push(`<path d="${poly([[x, yF, -140], [x, yF, 140]])}"/>`);
  for (let z = -140; z <= 140; z += 20) g.push(`<path d="${poly([[-160, yF, z], [140, yF, z]])}"/>`);
  L.floor.push(`<g mask="url(#fade)" stroke-opacity=".35">${g.join('')}</g>`);
}

/* ---------------------------------------------------------------- assemble */
const baseHull = 'M' + hull([BX0 - 14, BX1 + 14].flatMap((x) => [BY0 - 10, 0].flatMap((y) => [-BZ - 14, BZ + 14].map((z) => P2([x, y, z]))))).map(([x, y]) => `${f1(x)} ${f1(y)}`).join('L') + 'Z';
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
<style>text{font:600 11px ui-monospace,Menlo,Consolas,monospace;fill:#8be9ff;stroke:none;letter-spacing:.06em}text.ax{font-size:12px;fill:#4fffe0}text.sm{font-size:8px;fill:#8be9ff;opacity:.85}text.md{font-size:10.5px;font-weight:700;fill:#b5f3ff}.cf{fill:${CY};fill-opacity:.55}</style>
</defs>
<ellipse cx="500" cy="${H * 0.5}" rx="330" ry="${H * 0.5}" fill="url(#halo)"/>
<path d="M250 ${H - 40} L380 60 L620 60 L750 ${H - 40}Z" fill="url(#beam)" opacity=".7" filter="url(#soft)"/>
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

if (process.argv[2]) writeFileSync(process.argv[2], svg); // optional standalone SVG (e.g. for previews)
const round = (o) => Object.fromEntries(Object.entries(o).map(([k, [x, y]]) => [k, [Math.round(x * 10) / 10, Math.round(y * 10) / 10]]));
const ts = `// Generated by scripts/gen-default-throttle.mjs: do not edit by hand. Original holographic wireframe art (no vendor artwork).
export const DEFAULT_THROTTLE_W = ${W};
export const DEFAULT_THROTTLE_H = ${H};
export const DEFAULT_THROTTLE_SVG = ${JSON.stringify(svg)};
/** control positions on the ${W} x ${H} canvas */
export const DEFAULT_THROTTLE_ANCHORS: Record<string, [number, number]> = ${JSON.stringify(round(anchors))};
/** outline of each control, relative to its anchor (canvas units), lit up when the control is used */
export const DEFAULT_THROTTLE_REGIONS: Record<string, string> = ${JSON.stringify(regions)};
/** one outline per input for multi-input controls (keypad keys), same order as the callout inputs */
export const DEFAULT_THROTTLE_INPUT_REGIONS: Record<string, string[]> = ${JSON.stringify(inputRegions)};
`;
writeFileSync(new URL('../src/lib/defaultThrottleArt.ts', import.meta.url), ts);
console.log('svg bytes', svg.length);
