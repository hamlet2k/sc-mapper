// Generates the built-in default gamepad art (src/lib/defaultGamepadArt.ts): an original holographic wireframe gamepad in the
// proportions of a common modern dual-stick controller (offset sticks, D-pad, four face buttons, bumpers, triggers), drawn from a
// small 3D model seen from the front and a little above, same style as the default stick / throttle. No vendor artwork or logos.
// Run automatically by scripts/ensure-data.mjs; `node scripts/gen-default-gamepad.mjs out.svg` also writes the standalone SVG.
import { writeFileSync } from 'node:fs';

const W = 1000, H = 800;
const deg = Math.PI / 180;
/* ---------------------------------------------------------------- vector maths */
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a) => Math.hypot(a[0], a[1], a[2]);
const nrm = (a) => mul(a, 1 / (len(a) || 1));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ---------------------------------------------------------------- camera: in front, a little to the right and above
   model: X right, Y up (bumper edge), Z out of the face towards the player */
const AZ = -6 * deg, EL = 35 * deg;
const V = [-Math.sin(AZ) * Math.cos(EL), Math.sin(EL), Math.cos(AZ) * Math.cos(EL)]; // towards the viewer
const R = [Math.cos(AZ), 0, Math.sin(AZ)];
const U = cross(V, R);
let S = 1, OX = 0, OY = 0;
const P2 = (p) => [OX + S * dot(p, R), OY - S * dot(p, U)];
const f1 = (n) => (Math.round(n * 10) / 10).toString();
const pt = (p) => { const [x, y] = P2(p); return `${f1(x)} ${f1(y)}`; };
const poly = (ps, close = false) => 'M' + ps.map(pt).join('L') + (close ? 'Z' : '');
const poly2 = (q, close = true) => 'M' + q.map(([x, y]) => `${f1(x)} ${f1(y)}`).join('L') + (close ? 'Z' : '');
function smooth2(q, close = false) { // Catmull-Rom -> cubic Bezier through 2D points
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
function catmullPt(q, close, t) { // point on a closed Catmull-Rom curve, t in [0, n)
  const n = q.length, i = Math.floor(t), u = t - i, g = (k) => q[(k + n) % n];
  const p0 = g(i - 1), p1 = g(i), p2 = g(i + 1), p3 = g(i + 2);
  const f = (a, b, c, d) => 0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u * u + (-a + 3 * b - 3 * c + d) * u * u * u);
  return [f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])];
}
function inPoly(q, x, y) { let c = false; for (let i = 0, j = q.length - 1; i < q.length; j = i++) { const [xi, yi] = q[i], [xj, yj] = q[j]; if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; }

/* ---------------------------------------------------------------- body outline (front view, mm; origin between the View / Menu buttons) */
const HALF = [[0, 25], [-14, 25.2], [-28, 26.6], [-41, 28.6], [-52, 26.6], [-61, 20.5], [-67.5, 8], [-72.5, -11], [-75.5, -33], [-76, -55], [-71, -73.5], [-61.5, -80.5], [-51.5, -78.5], [-44.5, -69], [-36.5, -58.5], [-23.5, -52.6], [-10, -51]];
const CTRL = [...HALF, ...HALF.slice(1).reverse().map(([x, y]) => [-x, y])];
CTRL.splice(HALF.length, 0, [0, -50.8]);
// CTRL: top centre -> left side -> bottom centre -> right side (counter-clockwise, y up)
const N = 260;
const O = [], NO = [];
{
  const dense = []; for (let i = 0; i < CTRL.length * 40; i++) dense.push(catmullPt(CTRL, true, i / 40));
  const cum = [0]; for (let i = 1; i <= dense.length; i++) cum.push(cum[i - 1] + Math.hypot(dense[i % dense.length][0] - dense[i - 1][0], dense[i % dense.length][1] - dense[i - 1][1]));
  const total = cum[cum.length - 1];
  let j = 0;
  for (let k = 0; k < N; k++) { const L0 = (k / N) * total; while (cum[j + 1] < L0) j++; const u = (L0 - cum[j]) / (cum[j + 1] - cum[j] || 1), a = dense[j], b = dense[(j + 1) % dense.length]; O.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]); }
  for (let k = 0; k < N; k++) { const a = O[(k - 1 + N) % N], b = O[(k + 1) % N]; const tx = b[0] - a[0], ty = b[1] - a[1], l = Math.hypot(tx, ty) || 1; NO.push([ty / l, -tx / l]); }
  // counter-clockwise outline: (ty, -tx) points outwards; check with the top centre
  if (NO[0][1] < 0) for (const n of NO) { n[0] *= -1; n[1] *= -1; }
}
/** half thickness (z): thin across the top, thick grips */
const bAt = (x, y) => 9.5 + 11.5 * clamp((14 - y) / 58, 0, 1) * clamp((Math.abs(x) - 18) / 30, 0, 1);
const RA = 6.5; // in-plane radius of the rolled edge
/** front face: gentle dome */
const hAt = (x, y) => 4.2 * Math.exp(-((x / 64) ** 2 + ((y + 8) / 46) ** 2));
const hN = (x, y) => { const e = 0.3; return nrm([-(hAt(x + e, y) - hAt(x - e, y)) / (2 * e), -(hAt(x, y + e) - hAt(x, y - e)) / (2 * e), 1]); };
const face = (x, y, lift = 0) => { const n = hN(x, y); return add([x, y, hAt(x, y)], mul(n, lift)); };
const B = O.map(([x, y]) => bAt(x, y));
const F = O.map(([x, y], i) => [x - NO[i][0] * RA, y - NO[i][1] * RA]); // edge of the front face
const ZC = F.map(([x, y], i) => hAt(x, y) - B[i]);
const surf = (i, th) => { i = (i + N) % N; const c = Math.cos(th * deg), s = Math.sin(th * deg); return [O[i][0] + NO[i][0] * RA * (c - 1), O[i][1] + NO[i][1] * RA * (c - 1), ZC[i] + B[i] * s]; };
const surfN = (i, th) => { i = (i + N) % N; const c = Math.cos(th * deg), s = Math.sin(th * deg); return nrm([NO[i][0] * c / RA, NO[i][1] * c / RA, s / B[i]]); };
const silTh = (i) => Math.atan((-(NO[i][0] * V[0] + NO[i][1] * V[1]) * B[i]) / (RA * V[2])) / deg;
const idxNear = (x, y) => { let k = 0; for (let i = 0; i < N; i++) if (Math.hypot(O[i][0] - x, O[i][1] - y) < Math.hypot(O[k][0] - x, O[k][1] - y)) k = i; return k; };

/* ---------------------------------------------------------------- fit into the canvas */
{
  const raw = []; for (let i = 0; i < N; i++) for (const th of [-90, -45, 0, 45, 90]) raw.push(surf(i, th));
  for (const x of [-58, 58]) raw.push([x, 33, -22], [x, 20, -36]);
  const r2 = raw.map((p) => [dot(p, R), -dot(p, U)]);
  const xs = r2.map((p) => p[0]), ys = r2.map((p) => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  S = Math.min(570 / (x1 - x0), 440 / (y1 - y0));
  OX = 500 - S * (x0 + x1) / 2; OY = 0.45 * H - S * (y0 + y1) / 2;
}
const L = { back: [], mesh: [], wire: [], sil: [], ctl: [], ctlFill: [], accent: [], dots: [], under: [], floor: [], axis: [], text: [], fill: [], letters: [] };
const anchors = {}, regions = {}, inputRegions = {};
const anchor = (id, p) => { anchors[id] = P2(p); };
function relPath(id, outlines) { const [ax, ay] = anchors[id]; return outlines.map((ps) => 'M' + ps.map(([x, y]) => `${f1(x - ax)} ${f1(y - ay)}`).join('L') + 'Z').join(''); }
function region(id, ...outlines) { regions[id] = relPath(id, outlines); }
const visible = (n) => dot(n, V) > 0;
/** a 3D polyline split into visible (solid) and hidden (dashed) runs by a per-point visibility flag */
function runs(ps, vis, tv = L.wire, th = L.back, attrs = '') {
  let seg = [], cur = null;
  const out = (s, v) => { if (s.length > 1) (v ? tv : th).push(`<path d="${smooth(s)}"${v ? attrs : ''}/>`); };
  ps.forEach((p, k) => { const v = vis[k]; if (cur === null) cur = v; if (v !== cur) { seg.push(p); out(seg, cur); seg = [p]; cur = v; } else seg.push(p); });
  out(seg, cur);
}

/* ---------------------------------------------------------------- body: rolled-edge shell with a domed face */
{
  const sil = []; for (let i = 0; i < N; i += 2) sil.push(P2(surf(i, silTh(i))));
  L.sil.push(`<path d="${smooth2(sil, true)}"/>`);
  L.fill.push(`<path d="${poly2(sil)}"/>`);
  const front = F.map(([x, y]) => [x, y, hAt(x, y)]);
  L.fill.push(`<path d="${poly(front, true)}"/>`);
  // face edge, mid-edge seam (shell split line), rear edge
  const ring = (th, tv, attrs) => { const ps = [], vs = []; for (let i = 0; i <= N; i += 2) { ps.push(surf(i, th)); vs.push(visible(surfN(i, th))); } runs(ps, vs, tv, L.back, attrs); };
  ring(89.9, L.wire, ' stroke-width="1.5" stroke-opacity="1"');
  ring(38, L.wire, ' stroke-opacity=".55"');
  ring(-8, L.wire, ' stroke-width="1.3"');
  ring(-60, L.wire, ' stroke-opacity=".5"');
  // rear face outline (hidden)
  { const ps = []; for (let i = 0; i <= N; i += 2) ps.push(surf(i, -90)); L.back.push(`<path d="${smooth(ps)}"/>`); }
  // cross-section lines around the edge
  for (let i = 0; i < N; i += 10) { const ps = [], vs = []; for (let th = -90; th <= 90; th += 6) { ps.push(surf(i, th)); vs.push(visible(surfN(i, th))); } runs(ps, vs, L.wire, L.back, ' stroke-opacity=".6"'); }
}
/* face mesh: a light grid over the domed face (gaps around the controls) */
const HOLES = [];
function faceMesh() {
  const inside = (x, y) => inPoly(F, x, y) && !HOLES.some(([cx, cy, r]) => Math.hypot(x - cx, y - cy) < r);
  const line = (gen) => { let seg = []; const flush = () => { if (seg.length > 1) L.mesh.push(`<path d="${smooth(seg)}"/>`); seg = []; }; for (const [x, y] of gen) { if (inside(x, y)) seg.push(face(x, y, 0.05)); else flush(); } flush(); };
  for (let x = -70; x <= 70; x += 8) { const g = []; for (let y = -85; y <= 30; y += 1) g.push([x, y]); line(g); }
  for (let y = -82; y <= 26; y += 8) { const g = []; for (let x = -80; x <= 80; x += 1) g.push([x, y]); line(g); }
}

/* ---------------------------------------------------------------- control primitives (on the face) */
function basis(n) { const ref = Math.abs(n[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]; const t1 = nrm(cross(ref, n)), t2 = cross(n, t1); return [t1, t2]; }
function ring3(c, n, r, steps = 40) { const [t1, t2] = basis(n), ps = []; for (let j = 0; j < steps; j++) { const t = (j / steps) * 2 * Math.PI; ps.push(add(c, add(mul(t1, r * Math.cos(t)), mul(t2, r * Math.sin(t))))); } return ps; }
function ellipse(c, n, r, attrs = '') {
  const [t1, t2] = basis(n);
  const e1 = [S * r * dot(t1, R), -S * r * dot(t1, U)], e2 = [S * r * dot(t2, R), -S * r * dot(t2, U)];
  const a = e1[0], b = e2[0], cc = e1[1], d = e2[1];
  const E = (a * a + b * b + cc * cc + d * d) / 2, Fv = Math.hypot((a * a + b * b - cc * cc - d * d) / 2, a * cc + b * d);
  const rx = Math.sqrt(E + Fv), ry = Math.sqrt(Math.max(0, E - Fv));
  const ang = 0.5 * Math.atan2(2 * (a * cc + b * d), a * a + b * b - cc * cc - d * d) / deg;
  const [x, y] = P2(c);
  return `<ellipse cx="${f1(x)}" cy="${f1(y)}" rx="${f1(rx)}" ry="${f1(ry)}" transform="rotate(${f1(ang)} ${f1(x)} ${f1(y)})"${attrs}/>`;
}
const ellipsePts = (c, n, r, steps = 28) => ring3(c, n, r, steps).map(P2);
function cylSides(c, n, r, h) {
  const top = add(c, mul(n, h));
  const [ax, ay] = P2(c), [bx, by] = P2(top);
  let dx = bx - ax, dy = by - ay; const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
  const ps = ring3(c, n, r, 72).map(P2);
  let lo = ps[0], hi = ps[0];
  for (const p of ps) { const v = (p[0] - ax) * -dy + (p[1] - ay) * dx; if (v < (lo[0] - ax) * -dy + (lo[1] - ay) * dx) lo = p; if (v > (hi[0] - ax) * -dy + (hi[1] - ay) * dx) hi = p; }
  return `<path d="M${f1(lo[0])} ${f1(lo[1])}l${f1(bx - ax)} ${f1(by - ay)}M${f1(hi[0])} ${f1(hi[1])}l${f1(bx - ax)} ${f1(by - ay)}"/>`;
}
/** thumbstick: recessed collar, neck, domed cap with a concave dish and a knurled rim; dashed travel ring with X / Y ticks */
function thumbstick(id, x, y) {
  const c = face(x, y), n = hN(x, y), rw = 12.6, rc = 9.2;
  HOLES.push([x, y, rw + 1.5]);
  L.axis.push(ellipse(add(c, mul(n, 0.1)), n, rw + 3.2, ' stroke-dasharray="2.5 3" stroke-opacity=".75"'));
  const [t1, t2] = basis(n);
  for (const d of [t1, t2, mul(t1, -1), mul(t2, -1)]) L.axis.push(`<path d="${poly([add(c, mul(d, rw + 2)), add(c, mul(d, rw + 4.6))])}"/>`);
  L.under.push(ellipse(c, n, rw, ' stroke-opacity=".8"'), ellipse(add(c, mul(n, -1.2)), n, rw - 1.6, ' stroke-opacity=".45"'));
  L.under.push(ellipse(c, n, 4.2, ' stroke-opacity=".6"'), cylSides(c, n, 4.2, 6.5));
  const base = add(c, mul(n, 6.5)), top = add(base, mul(n, 3.4));
  L.ctlFill.push(ellipse(base, n, rc), `<path d="${poly2(hull([...ellipsePts(base, n, rc), ...ellipsePts(top, n, rc)]))}"/>`);
  L.ctl.push(ellipse(base, n, rc), cylSides(base, n, rc, 3.4), ellipse(top, n, rc));
  for (let j = 0; j < 36; j++) { const t = (j / 36) * 2 * Math.PI, d = add(mul(t1, Math.cos(t)), mul(t2, Math.sin(t))); const p = add(base, mul(d, rc)); if (dot(d, V) > 0.04) L.ctl.push(`<path d="${poly([add(p, mul(n, 0.6)), add(p, mul(n, 2.8))])}" stroke-width=".8" stroke-opacity=".7"/>`); }
  L.ctl.push(ellipse(top, n, rc * 0.68, ' stroke-opacity=".8"'), ellipse(add(top, mul(n, -0.8)), n, rc * 0.38, ' stroke-opacity=".5"'), ellipse(add(top, mul(n, -0.9)), n, 1.1, ' class="cf"'));
  anchor(id, top);
  region(id, grow(hull([...ellipsePts(c, n, rw), ...ellipsePts(top, n, rc)]), 3));
}
/** round button: bezel ring, raised cap, optional letter */
function button(id, x, y, r, h = 2.6, letter = '', tint = '') {
  const c = face(x, y), n = hN(x, y), top = add(c, mul(n, h));
  HOLES.push([x, y, r * 1.45]);
  L.under.push(ellipse(c, n, r * 1.32, ' stroke-opacity=".55"'));
  L.ctlFill.push(ellipse(top, n, r, tint ? ` fill="${tint}" fill-opacity=".2"` : ''));
  L.ctl.push(ellipse(c, n, r), cylSides(c, n, r, h), ellipse(top, n, r));
  if (letter) { const [lx, ly] = P2(top); L.letters.push(`<text x="${f1(lx)}" y="${f1(ly + 4.4)}" text-anchor="middle"${tint ? ` fill="${tint}"` : ''}>${letter}</text>`); }
  anchor(id, top);
  region(id, grow(hull([...ellipsePts(c, n, r * 1.32), ...ellipsePts(top, n, r)]), 3));
}
/** pill-shaped small button on the face (local axis along x) with a glyph drawer */
function pill(id, x, y, w, hgt, glyph) {
  const n = hN(x, y), h = 1.8;
  HOLES.push([x, y, w * 0.9]);
  const outline = (lift, k) => { const ps = []; for (let j = 0; j <= 40; j++) { const t = (j / 40) * 2 * Math.PI; const cx = Math.cos(t), sy = Math.sin(t); const px = x + Math.sign(cx) * (w / 2 - hgt / 2) * k + cx * (hgt / 2) * k, py = y + sy * (hgt / 2) * k; ps.push(add(face(px, py), mul(n, lift))); } return ps; };
  const base = outline(0, 1.25), top = outline(h, 1);
  L.under.push(`<path d="${smooth(base, true)}" stroke-opacity=".55"/>`);
  L.ctlFill.push(`<path d="${smooth(top, true)}"/>`);
  L.ctl.push(`<path d="${smooth(top, true)}"/>`);
  const tc = add(face(x, y), mul(n, h + 0.05));
  glyph?.(tc, n);
  if (id) { anchor(id, tc); region(id, grow(hull([...base, ...top].map(P2)), 3)); }
}
/** D-pad: disc in a recessed well, cross with four separately outlined arms (one glow outline per direction) */
function dpad(id, x, y) {
  const c = face(x, y), n = hN(x, y), rw = 13.6, rd = 11.6;
  HOLES.push([x, y, rw + 1.5]);
  L.under.push(ellipse(c, n, rw, ' stroke-opacity=".8"'), ellipse(add(c, mul(n, -1)), n, rw - 1.4, ' stroke-opacity=".45"'));
  const disc = add(c, mul(n, 1.2));
  L.ctlFill.push(ellipse(disc, n, rd, ' fill-opacity=".6"'));
  L.ctl.push(ellipse(disc, n, rd, ' stroke-opacity=".75"'));
  // facets of the disc between the arms
  const u = nrm(sub([0, 1, 0], mul(n, dot([0, 1, 0], n)))), v = cross(u, n); // u = up, v = right on the face
  for (const k of [45, 135, 225, 315]) { const t = k * deg, d = add(mul(u, Math.cos(t)), mul(v, Math.sin(t))); L.ctl.push(`<path d="${poly([add(disc, mul(d, 5.6)), add(disc, mul(d, rd - 0.6))])}" stroke-opacity=".45"/>`); }
  const hw = 3.9, h0 = 1.2, h1 = 3.4, out = [];
  // arms in input order: up, right, down, left
  for (const d of [u, v, mul(u, -1), mul(v, -1)]) {
    const side = cross(n, d);
    const quad = (lift, l0, l1, w) => [add(add(disc, mul(d, l0)), mul(side, -w)), add(add(disc, mul(d, l1)), mul(side, -w)), add(add(disc, mul(d, l1)), mul(side, w)), add(add(disc, mul(d, l0)), mul(side, w))].map((p) => add(p, mul(n, lift)));
    const top = quad(h1 - h0, hw, 10.6, hw - 0.4), bot = quad(0, hw, 11.2, hw);
    L.ctlFill.push(`<path d="${poly(top, true)}"/>`);
    L.ctl.push(`<path d="${poly([top[3], top[0], top[1], top[2]])}"/>`, `<path d="${poly([bot[1], bot[2]])}" stroke-opacity=".6"/>`, `<path d="${poly([top[1], bot[1]])}" stroke-opacity=".6"/>`, `<path d="${poly([top[2], bot[2]])}" stroke-opacity=".6"/>`);
    const tip = add(add(disc, mul(d, 9)), mul(n, h1 - h0 + 0.05)), bb = add(add(disc, mul(d, 6.4)), mul(n, h1 - h0 + 0.05));
    L.ctl.push(`<path d="${poly([tip, add(bb, mul(side, 1.9)), add(bb, mul(side, -1.9))], true)}" class="cf"/>`);
    out.push(grow(hull([...top, ...bot].map(P2)), 2.5));
  }
  // centre square
  const cs = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => add(add(disc, mul(u, a * hw)), add(mul(v, b * hw), mul(n, h1 - h0))));
  L.ctlFill.push(`<path d="${poly(cs, true)}"/>`);
  L.ctl.push(ellipse(add(disc, mul(n, h1 - h0 - 0.4)), n, 2.4, ' stroke-opacity=".6"'));
  anchor(id, add(disc, mul(n, h1 - h0)));
  region(id, grow(hull(ellipsePts(c, n, rw + 0.5)), 2));
  inputRegions[id] = out.map((o) => relPath(id, [o]));
}

/* ---------------------------------------------------------------- bumpers and triggers along the top edge */
function bumper(id, side) {
  const x0 = side * 27, x1 = side * 63;
  const idx = []; for (let i = 0; i < N; i++) { const [x, y] = O[i]; if (y > 12 && (side < 0 ? x <= x0 && x >= x1 : x >= x0 && x <= x1)) idx.push(i); }
  // contiguous run in outline order
  idx.sort((a, b) => a - b);
  const ord = side < 0 ? idx : idx; // left side indices increase towards the outer corner, right side towards the top centre
  const T0 = -42, T1 = 58, OFF = 2.6;
  const q = (i, th, off = OFF) => add(surf(i, th), mul(surfN(i, th), off));
  const curve = (th, off) => ord.map((i) => q(i, th, off));
  const vis = (th) => ord.map((i) => visible(surfN(i, th)));
  L.ctlFill.push(...ord.slice(0, -1).map((i, k) => `<path d="${poly2(hull([T0, 0, T1].flatMap((th) => [P2(q(i, th)), P2(q(ord[k + 1], th))]).concat([T0, T1].flatMap((th) => [P2(q(i, silTh(i))), P2(surf(i, th))]))))}" fill-opacity=".55"/>`));
  runs(curve(T1), vis(T1), L.ctl, L.back);
  runs(curve(T0), vis(T0), L.ctl, L.back);
  runs(curve(10), vis(10), L.ctl, L.back, ' stroke-opacity=".55"');
  { const sl = ord.map((i) => q(i, clamp(silTh(i), T0, T1))); runs(sl, sl.map(() => true), L.ctl, L.back, ' stroke-width="1.8"'); }
  for (const i of [ord[0], ord[ord.length - 1]]) { const ps = []; for (let th = T0; th <= T1; th += 5) ps.push(q(i, th)); L.ctl.push(`<path d="${smooth(ps)}"/>`); L.ctl.push(`<path d="${poly([q(i, T1), surf(i, T1)])}" stroke-opacity=".6"/>`); }
  const mid = ord[Math.floor(ord.length * 0.45)];
  anchor(id, q(mid, 10));
  const edge = (th, off) => ord.map((i) => P2(q(i, th, off)));
  regions[id] = relPath(id, [[...edge(T1, OFF + 1.5), ...edge(clamp(-55, T0 - 14, T1), OFF + 1.5).reverse()]]);
  const lp = P2(q(ord[Math.floor(ord.length * 0.6)], 30));
  L.text.push(`<text x="${f1(lp[0])}" y="${f1(lp[1])}" class="md" text-anchor="middle">${side < 0 ? 'LB' : 'RB'}</text>`);
  return mid;
}
function trigger(id, side) {
  // a curved paddle on the rear of the top edge, behind the bumper: profile (dy above the top edge, dz from the rear face) lofted across x
  const PR = [[-1.5, 10.5], [2.8, 8], [5, 3], [4.4, -2.2], [1, -7], [-5, -10.5], [-11.5, -11.5], [-13.5, -7], [-7, -2.5], [-3, 3.5]];
  const xs = []; for (let k = 0; k <= 10; k++) xs.push(side * (31 + k * 2.4));
  const topAt = (x) => { let best = 0; for (let i = 0; i < N; i++) if (O[i][1] > 10 && Math.abs(O[i][0] - x) < Math.abs(O[best][0] - x)) best = i; return best; };
  const slices = xs.map((x, k) => {
    const i = topAt(x), yt = O[i][1], zb = ZC[i] - B[i] + 2;
    const sc = 0.5 + 0.5 * Math.sqrt(Math.sin(Math.PI * (0.04 + 0.92 * k / 10))); // rounded ends, fuller in the middle
    return PR.map(([dy, dz]) => [x, yt + dy * sc, zb + dz * sc]);
  });
  const cen = PR.reduce((s, p) => [s[0] + p[0] / PR.length, s[1] + p[1] / PR.length], [0, 0]);
  const nAt = (j) => nrm([0, PR[j][0] - cen[0], PR[j][1] - cen[1]]);
  for (let k = 0; k < slices.length - 1; k++) L.ctlFill.push(`<path d="${poly2(hull([...slices[k], ...slices[k + 1]].map(P2)))}" fill-opacity=".6"/>`);
  // end faces: the outer one (towards the controller's side) faces the camera on the right, the inner one on the left
  for (const [k, nx] of [[0, -side], [slices.length - 1, side]]) (visible([nx, 0, 0]) ? L.ctl : L.back).push(`<path d="${smooth(slices[k], true)}" stroke-opacity=".5"/>`);
  for (let j = 0; j < PR.length; j++) { const ps = slices.map((sl) => sl[j]); runs(ps, ps.map(() => visible(nAt(j))), L.ctl, L.back, j === 2 ? ' stroke-width="1.8"' : ' stroke-opacity=".55"'); }
  for (let k = 2; k <= 8; k += 2) { const sl = slices[k]; runs(sl.slice(0, 6), PR.slice(0, 6).map((_, j) => visible(nAt(j))), L.accent, L.back, ' stroke-width="1"'); }
  const mid = slices[5];
  anchor(id, mid[2]);
  region(id, grow(hull(slices.flat().map(P2)), 3));
  const lp = P2(add(mid[2], [side * 4, 9, 0]));
  L.text.push(`<text x="${f1(lp[0])}" y="${f1(lp[1])}" class="md" text-anchor="middle">${side < 0 ? 'LT' : 'RT'}</text>`);
}

/* ---------------------------------------------------------------- build */
trigger('lt', -1);
trigger('rt', 1);
bumper('lb', -1);
bumper('rb', 1);
thumbstick('ls', -44, 0);
thumbstick('rs', 24, -26);
dpad('dpad', -23, -27);
const FX = 43, FY = 0, FD = 10.6;
button('y', FX, FY + FD, 5.3, 2.8, 'Y', '#ffe066');
button('b', FX + FD, FY, 5.3, 2.8, 'B', '#ff7a8a');
button('a', FX, FY - FD, 5.3, 2.8, 'A', '#7dffa8');
button('x', FX - FD, FY, 5.3, 2.8, 'X', '#7ab8ff');
// centre: home (generic house glyph, no input in the game), View, Menu, Share
{
  const c = face(0, 16), n = hN(0, 16), r = 6.6, top = add(c, mul(n, 1.6));
  HOLES.push([0, 16, r * 1.5]);
  L.under.push(ellipse(c, n, r * 1.3, ' stroke-opacity=".55"'));
  L.ctl.push(ellipse(c, n, r), cylSides(c, n, r, 1.6), ellipse(top, n, r));
  L.ctlFill.push(ellipse(top, n, r, ' fill="#4fd8ff" fill-opacity=".14"'));
  const g = (x, y) => add(face(x, 16 + y), mul(n, 1.65));
  L.accent.push(`<path d="${poly([g(-3.2, -2.8), g(-3.2, 0.4), g(0, 3.2), g(3.2, 0.4), g(3.2, -2.8)], true)}" stroke-width="1.5"/>`);
}
pill('back', -12.3, 0, 7.4, 7.4, (tc, n) => { const g = (dx, dy) => add(face(-12.3 + dx, dy), mul(n, 1.85)); L.ctl.push(`<path d="${poly([g(-1.9, 0), g(1.5, 2), g(1.5, -2)], true)}" stroke-width="1"/>`); });
pill('start', 12.3, 0, 7.4, 7.4, (tc, n) => { const g = (dx, dy) => add(face(12.3 + dx, dy), mul(n, 1.85)); for (const dy of [-1.3, 0, 1.3]) L.ctl.push(`<path d="${poly([g(-1.9, dy), g(1.9, dy)])}" stroke-width="1"/>`); });
pill('', 0, -9.5, 9.6, 5.6, (tc, n) => { const g = (dx, dy) => add(face(dx, -9.5 + dy), mul(n, 1.85)); L.ctl.push(`<path d="${poly([g(-2.2, -0.2), g(-2.2, -1.6), g(2.2, -1.6), g(2.2, -0.2)])}" stroke-width="1"/>`, `<path d="${poly([g(0, -0.8), g(0, 1.7)])}" stroke-width="1"/>`, `<path d="${poly([g(-1, 0.8), g(0, 1.8), g(1, 0.8)])}" stroke-width="1"/>`); });
for (const [x, lab] of [[-12.3, 'VIEW'], [12.3, 'MENU']]) { const p = P2(face(x, -6.4)); L.text.push(`<text x="${f1(p[0])}" y="${f1(p[1] + 3)}" class="sm" text-anchor="middle">${lab}</text>`); }
faceMesh();
// grip texture: a band of small dots following the edge of each grip
for (const side of [-1, 1]) for (let y = -84; y <= -30; y += 3) for (let x = 36; x <= 82; x += 3) {
  const xx = side * (x + ((Math.round((y + 84) / 3)) % 2) * 1.5);
  if (!inPoly(F, xx, y)) continue;
  const dm = Math.min(...F.map(([fx, fy]) => Math.hypot(fx - xx, fy - y)));
  const fadeTop = clamp((-34 - y) / 12, 0, 1);
  if (dm < 2.5 || dm > 3 + 11 * fadeTop) continue;
  L.dots.push(ellipse(face(xx, y, 0.1), hN(xx, y), 0.55));
}
// ports: USB on the top edge, headset jack at the bottom
{
  const it = idxNear(0, 25), n = surfN(it, -30), c = surf(it, -30), u = [1, 0, 0], v = nrm(cross(n, u));
  L.wire.push(`<path d="${poly([[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => add(c, add(mul(u, a * 4.5), mul(v, b * 1.4)))), true)}" stroke-width="1.2"/>`);
  L.wire.push(ellipse(surf(idxNear(-7, 25), -35), surfN(idxNear(-7, 25), -35), 1.1));
  const ib = idxNear(0, -51), nb = surfN(ib, 50); L.wire.push(ellipse(surf(ib, 50), nb, 1.6), ellipse(surf(ib, 50), nb, 0.7, ' class="cf"'));
}

/* ---------------------------------------------------------------- floor */
{
  const yF = -112, g = [];
  for (let x = -170; x <= 170; x += 20) g.push(`<path d="${poly([[x, yF, -140], [x, yF, 120]])}"/>`);
  for (let z = -140; z <= 120; z += 20) g.push(`<path d="${poly([[-170, yF, z], [170, yF, z]])}"/>`);
  L.floor.push(`<g mask="url(#fade)" stroke-opacity=".35">${g.join('')}</g>`);
  // projector ring under the controller
  L.axis.push(ellipse([0, yF, -12], [0, 1, 0], 62, ' stroke-opacity=".35" stroke-dasharray="4 5"'), ellipse([0, yF, -12], [0, 1, 0], 72, ' stroke-opacity=".18"'));
}

/* ---------------------------------------------------------------- assemble */
const CY = '#4fd8ff';
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" fill="none" stroke-linecap="round" stroke-linejoin="round">
<defs>
<filter id="glow" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="2.4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<filter id="glow2" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<filter id="soft" x="-30%" y="-10%" width="160%" height="120%"><feGaussianBlur stdDeviation="18"/></filter>
<radialGradient id="halo" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="${CY}" stop-opacity=".13"/><stop offset=".6" stop-color="${CY}" stop-opacity=".04"/><stop offset="1" stop-color="${CY}" stop-opacity="0"/></radialGradient>
<linearGradient id="body" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b2a3d" stop-opacity=".55"/><stop offset="1" stop-color="#06131f" stop-opacity=".35"/></linearGradient>
<linearGradient id="strip" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#7b6cff"/><stop offset=".55" stop-color="#5fb8ff"/><stop offset="1" stop-color="#4fffe0"/></linearGradient>
<linearGradient id="beam" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="${CY}" stop-opacity=".10"/><stop offset="1" stop-color="${CY}" stop-opacity="0"/></linearGradient>
<pattern id="scan" width="6" height="4" patternUnits="userSpaceOnUse"><rect width="6" height="1.2" fill="${CY}" fill-opacity=".09"/></pattern>
<mask id="fade" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="url(#fadeg)"/></mask>
<radialGradient id="fadeg" cx="50%" cy="84%" r="34%" gradientUnits="objectBoundingBox"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#000"/></radialGradient>
<style>text{font:700 11px ui-monospace,Menlo,Consolas,monospace;fill:#8be9ff;stroke:none;letter-spacing:.06em}text.sm{font-size:7.5px;font-weight:600;fill:#8be9ff;opacity:.85}text.md{font-size:10.5px;fill:#b5f3ff}.cf{fill:${CY};fill-opacity:.55}</style>
</defs>
<ellipse cx="500" cy="${H * 0.48}" rx="380" ry="${H * 0.46}" fill="url(#halo)"/>
<path d="M300 ${H - 40} L400 90 L600 90 L700 ${H - 40}Z" fill="url(#beam)" opacity=".6" filter="url(#soft)"/>
<g stroke="${CY}" stroke-width="1" filter="url(#glow)">${L.floor.join('')}</g>
<clipPath id="bodyclip">${L.fill.join('')}</clipPath>
<g clip-path="url(#bodyclip)"><rect width="${W}" height="${H}" fill="url(#body)"/><rect width="${W}" height="${H}" fill="url(#scan)"/></g>
<g stroke="#2aa9c4" stroke-width=".8" stroke-opacity=".35" stroke-dasharray="2 3">${L.back.join('')}</g>
<g stroke="#38c9e6" stroke-width=".8" stroke-opacity=".28">${L.mesh.join('')}</g>
<g stroke="#38c9e6" stroke-width="1" stroke-opacity=".75">${L.wire.join('')}</g>
<g stroke="#7fe9ff" stroke-width="2" filter="url(#glow)">${L.sil.join('')}</g>
<g stroke="url(#strip)" filter="url(#glow2)">${L.accent.join('')}</g>
<g stroke="#a8f1ff" stroke-width="1.2" filter="url(#glow)">${L.under.join('')}</g>
<g fill="#5fb8ff" fill-opacity=".55" stroke="none">${L.dots.join('')}</g>
<g fill="#0a2a3d" fill-opacity=".85" stroke="none">${L.ctlFill.join('')}</g>
<g stroke="#a8f1ff" stroke-width="1.4" filter="url(#glow)">${L.ctl.join('')}</g>
<g stroke="#4fffe0" stroke-width="1.4" filter="url(#glow)">${L.axis.join('')}</g>
<g>${L.text.join('')}</g>
<g filter="url(#glow)">${L.letters.join('')}</g>
</svg>`.replace(/\n/g, '');

const svgOut = process.argv.slice(2).find((a) => a.endsWith('.svg'));
if (svgOut) writeFileSync(svgOut, svg);
const round = (o) => Object.fromEntries(Object.entries(o).map(([k, [x, y]]) => [k, [Math.round(x * 10) / 10, Math.round(y * 10) / 10]]));
const ts = `// Generated by scripts/gen-default-gamepad.mjs: do not edit by hand. Original holographic wireframe art (no vendor artwork).
export const DEFAULT_GAMEPAD_W = ${W};
export const DEFAULT_GAMEPAD_H = ${H};
export const DEFAULT_GAMEPAD_SVG = ${JSON.stringify(svg)};
/** control positions on the ${W} x ${H} canvas */
export const DEFAULT_GAMEPAD_ANCHORS: Record<string, [number, number]> = ${JSON.stringify(round(anchors))};
/** outline of each control, relative to its anchor (canvas units), lit up when the control is used */
export const DEFAULT_GAMEPAD_REGIONS: Record<string, string> = ${JSON.stringify(regions)};
/** one outline per input for multi-input controls (D-pad arms: up, right, down, left), same order as the callout inputs */
export const DEFAULT_GAMEPAD_INPUT_REGIONS: Record<string, string[]> = ${JSON.stringify(inputRegions)};
`;
writeFileSync(new URL('../src/lib/defaultGamepadArt.ts', import.meta.url), ts);
console.log('[art] default gamepad svg bytes', svg.length);
