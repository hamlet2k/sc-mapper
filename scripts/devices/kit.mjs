// Shared builders for the device art: a flight stick (grip loft + base + neck) and a throttle (base box + gate + levers + grips)
// with callbacks for the device's own controls. Every device keeps its own shape (spine / profile / base parameters) and its own
// control layout; this only removes the boilerplate. Original procedural line art, no vendor artwork.
import { createScene, add, mul, sub, nrm, cross, dot, lerp, lerp3, grow, hull, deg } from '../holo/scene.mjs';
export { add, mul, sub, nrm, cross, dot, lerp, lerp3, grow, hull, deg };

/* ================================================================== shared shape helpers */
/** convex polygon (2D, any winding) offset inwards by d */
export function inset2(poly, d) {
  if (!d) return poly.map((p) => [...p]);
  const n = poly.length, cx = poly.reduce((s, p) => s + p[0], 0) / n, cy = poly.reduce((s, p) => s + p[1], 0) / n;
  const lines = poly.map((a, i) => {
    const b = poly[(i + 1) % n]; let nx = -(b[1] - a[1]), ny = b[0] - a[0]; const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
    if ((cx - a[0]) * nx + (cy - a[1]) * ny < 0) { nx = -nx; ny = -ny; } // inward normal
    return [a[0] + nx * d, a[1] + ny * d, b[0] - a[0], b[1] - a[1]];
  });
  return poly.map((_, i) => {
    const [x1, y1, dx1, dy1] = lines[(i + n - 1) % n], [x2, y2, dx2, dy2] = lines[i];
    const den = dx1 * dy2 - dy1 * dx2; if (Math.abs(den) < 1e-9) return [x2, y2];
    const t = ((x2 - x1) * dy2 - (y2 - y1) * dx2) / den; return [x1 + dx1 * t, y1 + dy1 * t];
  });
}
/** round the corners of a polygon: each corner replaced by `steps` points on a fillet of radius r (clamped) */
export function fillet2(poly, r, steps = 3) {
  const n = poly.length, out = [];
  for (let i = 0; i < n; i++) {
    const p = poly[i], a = poly[(i + n - 1) % n], b = poly[(i + 1) % n];
    const ua = [a[0] - p[0], a[1] - p[1]], ub = [b[0] - p[0], b[1] - p[1]], la = Math.hypot(...ua), lb = Math.hypot(...ub);
    const rr = Array.isArray(r) ? r[i] : r, k = Math.min(rr, la * 0.45, lb * 0.45);
    if (k <= 0.01) { out.push([...p]); continue; }
    const p0 = [p[0] + (ua[0] / la) * k, p[1] + (ua[1] / la) * k], p1 = [p[0] + (ub[0] / lb) * k, p[1] + (ub[1] / lb) * k];
    for (let j = 0; j <= steps; j++) { const t = j / steps, q = 1 - t; out.push([q * q * p0[0] + 2 * q * t * p[0] + t * t * p1[0], q * q * p0[1] + 2 * q * t * p[1] + t * t * p1[1]]); }
  }
  return out;
}
/** extruded convex profile with chamfer layers: points o + a*A + b*B + e*E; layers [[inset, e], ...] (default: bevel at both ends).
 *  Drawn as a solid (visible edges, silhouette, hidden dashed); returns { outline (2D hull), faces, top (last layer 3D pts) } */
export function slab(sc, prof, { o = [0, 0, 0], A = [1, 0, 0], B = [0, 1, 0], E = [0, 0, 1], e0 = 0, e1 = 10, bevel = 0, layers = null, opts = {} } = {}) {
  const Ls = layers ?? (bevel ? [[bevel, e0], [0, e0 + bevel], [0, e1 - bevel], [bevel, e1]] : [[0, e0], [0, e1]]);
  const at = ([a, b], e) => add(o, add(add(mul(A, a), mul(B, b)), mul(E, e)));
  const rings = Ls.map(([d, e]) => inset2(prof, d).map((p) => at(p, e)));
  const faces = [rings[0], rings[rings.length - 1]];
  for (let i = 0; i < rings.length - 1; i++) for (let j = 0; j < prof.length; j++) { const k = (j + 1) % prof.length; faces.push([rings[i][j], rings[i][k], rings[i + 1][k], rings[i + 1][j]]); }
  const all = rings.flat(), ctr = all.reduce((s, p) => add(s, mul(p, 1 / all.length)), [0, 0, 0]);
  const r = sc.solid(faces, ctr, opts);
  return { outline: r.outline, faces, rings, vis: r.vis };
}

/* ================================================================== sticks */
/**
 * Flight stick. Axes: x forward (trigger side), y up, z thumb side. S:
 *  KEY (spine sections [x, y, halfDepth, halfWidth, tilt]), loft {pex, egg}, rings, flows
 *  base: { type: 'cyl' | 'oval' | 'box', ... } (see drawBase), neck: lathe profiles [[r, y], ...][] between base and grip,
 *  flange: { y, front, back, half, t } hand rest under the grip, head: { strip, border } decorations,
 *  details(ctx): the device's controls, fit: canvas box for the drawing
 */
export function buildStick(S) {
  const sc = createScene({ W: S.W ?? 1000, H: S.H ?? 900, MX: S.MX ?? -1, AZ: S.AZ ?? 36, EL: S.EL ?? 22 });
  const { L, P2, poly, smooth, ellipse, facing } = sc;
  const lo = sc.spineLoft(S.KEY, S.loft ?? { pex: 2.6, egg: 0.12 });
  const { surf, KT } = lo;
  const B = S.base;
  {
    const pts = [];
    for (let i = 0; i <= 30; i++) for (let j = 0; j < 24; j++) pts.push(surf((i / 30) * KT, j * 15));
    pts.push(...baseBox(B), ...(S.extraFit ?? []));
    sc.fit(pts, S.fit ?? [290, 710, 40, 780], 'bottom');
  }
  const base = drawBase(sc, B);
  for (const prof of S.neck ?? []) { if (prof.knurl) sc.knurl([0, 0, 0], prof.knurl[0], prof.knurl[1], prof.knurl[2], prof.knurl[3] ?? 22); else if (prof.boot) drawBoot(sc, prof.boot); else sc.lathe([0, 0, 0], prof, { rings: prof.map((_, i) => i) }); }
  if (S.flange) drawFlange(sc, S.flange);
  sc.drawSpineLoft(lo, { rings: S.rings ?? Array.from({ length: Math.round(KT / 0.8) + 1 }, (_, i) => Math.min(KT - 0.05, i * 0.8)), flows: S.flows ?? 16 });
  if (S.head?.strip !== false) { const strip = lo.capRing(1.0, 0.2, 48).slice(...(S.head?.stripRange ?? [4, 22])); L.accent.push(`<path d="${smooth(strip)}" stroke-width="2.6"/>`); }
  if (S.head?.border !== false) L.wire.push(`<path d="${smooth(lo.capRing(0.9, 0.5, 36), true)}" stroke-dasharray="6 3"/>`);
  if (S.seam) { const seam = []; for (let i = 0; i <= 30; i++) seam.push(surf(S.seam[0] + (i / 30) * (S.seam[1] - S.seam[0]), S.seam[2] ?? 100)); L.wire.push(`<path d="${smooth(seam)}" stroke-opacity=".9" stroke-width="1.3"/>`); }
  for (const g of S.grooves ?? []) { const a = []; for (let j = 0; j <= 12; j++) a.push(surf(g, -38 + j * 6.3)); L.accent.push(`<path d="${smooth(a)}" stroke-width="1.6"/>`); }
  const ctx = { sc, lo, base, L, P2, poly, smooth, ellipse, facing, N: lo.capN(), FWD: lo.frame(KT).F, KT, cap: lo.cap, surf: lo.surf, surfN: lo.surfN,
    /** point + normal on the grip surface, normal optionally bent towards `bend` */
    on: (k, phi, bend = [0, 0, 0]) => [lo.surf(k, phi), nrm(add(lo.surfN(k, phi), bend))],
    /** spine parameter k whose section centre is at height y */
    kAtY: (y) => { let best = 0; for (let i = 0; i <= 600; i++) { const k = (i / 600) * KT; if (Math.abs(lo.frame(k).C[1] - y) < Math.abs(lo.frame(best).C[1] - y)) best = k; } return best; },
    /** x of the grip surface at height y on side phi (0 = front, 180 = back) */
    xAt: (y, phi = 0) => { let best = null; for (let i = 0; i <= 600; i++) { const p = lo.surf((i / 600) * KT, phi); if (!best || Math.abs(p[1] - y) < Math.abs(best[1] - y)) best = p; } return best[0]; } };
  /** curved trigger blade hanging off the grip front between heights y0 (top) and y1 (bottom), sticking out by `depth` */
  ctx.blade = (id, y0, y1, depth, opts = {}) => {
    const fx = (y) => ctx.xAt(y) - 2, ts = [0, 0.22, 0.45, 0.7, 1];
    const front = ts.map((t) => { const y = y0 + (y1 - y0) * t; return [fx(y) + depth * Math.sin(Math.PI * t) ** 0.7, y]; });
    const back = ts.map((t) => { const y = y0 + (y1 - y0) * t; return [fx(y) + depth * 0.42 * Math.sin(Math.PI * t) ** 0.9, y]; });
    const ym = (y0 + y1) / 2, arc = opts.arc === false ? null : [fx(ym) - 6, ym, depth + 8, -34, 26];
    trigger(ctx, id, front, back, { z: opts.z ?? 6, red: opts.red ?? true, arc, stages: opts.stages ?? 2 });
  };
  S.details?.(ctx);
  return sc.result({ fadeHull: base.fadeHull, beam: S.beam ?? [250, 395, 605, 750] });
}

/** corner points of a base (for fitting the drawing) */
function baseBox(B) {
  const pts = [];
  if (B.type === 'cyl') for (const t of [0, 45, 90, 135, 180, 225, 270, 315]) { const a = t * deg; pts.push([B.r * Math.cos(a), B.y0, B.r * Math.sin(a)], [B.r * Math.cos(a), B.y1, B.r * Math.sin(a)]); }
  if (B.type === 'oval') for (const [rx, rz, y] of B.prof) for (const t of [0, 45, 90, 135, 180, 225, 270, 315]) { const a = t * deg; pts.push([(B.cx ?? 0) + rx * Math.cos(a), y, (B.cz ?? 0) + rz * Math.sin(a)]); }
  if (B.type === 'box') for (const x of [B.x0, B.x1]) for (const z of [B.z0, B.z1]) pts.push([x, B.y0, z], [x, B.y1, z]);
  if (B.type === 'custom') pts.push(...B.pts);
  if (B.plate) { const { px, pz, cx = 0, cz = 0 } = B.plate; for (const x of [-px, px]) for (const z of [-pz, pz]) pts.push([cx + x, B.y0, cz + z]); }
  return pts;
}
/** base under the stick: cylinder ('cyl'), superellipse lathe ('oval'), or a box with a chamfered top ('box'); optional plate */
function drawBase(sc, B) {
  const { L, P2, poly, ellipse, facing } = sc;
  let h, top;
  if (B.type === 'cyl') {
    h = sc.lathe([0, 0, 0], [[B.r, B.y0], [B.r, B.y0 + 6], [B.r - 3, B.y0 + 8], [B.r - 3, B.y1 - 8], [B.r + 1, B.y1 - 6], [B.r + 1, B.y1]], { rings: [1, 2, 4], dash: [3] });
    top = B.y1;
    L.wire.push(ellipse([0, B.y1, 0], [0, 1, 0], B.r * 0.82, ' stroke-opacity=".7"'));
    const t0 = sc.tv(), ps = []; for (let j = 0; j <= 24; j++) { const t = (t0 - 85 + (170 * j) / 24) * deg; ps.push([(B.r - 2.5) * Math.cos(t), B.y0 + 14, (B.r - 2.5) * Math.sin(t)]); } L.accent.push(`<path d="${sc.smooth(ps)}" stroke-width="2"/>`);
  } else if (B.type === 'oval') {
    const r = sc.ovalLathe([B.cx ?? 0, 0, B.cz ?? 0], B.prof, { pex: B.pex ?? 2.4, flows: B.flows ?? 0 });
    h = r.hull; top = B.prof[B.prof.length - 1][2];
    if (B.accent !== false) { // light band along the visible part of one ring
      const ring = r.ring(B.prof[B.accentRing ?? 1]), vis = ring.map((p) => facing(nrm([p[0] - (B.cx ?? 0), 0, p[2] - (B.cz ?? 0)])));
      const s0 = vis.findIndex((v) => !v), run = [];
      if (s0 >= 0) for (let j = 1; j <= ring.length; j++) { const i = (s0 + j) % ring.length; if (vis[i]) run.push(ring[i]); else if (run.length) break; }
      if (run.length > 2) L.accent.push(`<path d="${sc.smooth(run.slice(2, -2))}" stroke-width="2"/>`);
    }
  } else if (B.type === 'custom') {
    const r = B.draw(sc);
    h = r.hull; top = r.top;
  } else {
    const { x0, x1, z0, z1, y0, y1, ch = 0, chY = 0 } = B; // ch: inset of the top edge, chY: height of the chamfer band
    const q = (a0, a1, b0, b1, y) => [[a0, y, b0], [a1, y, b0], [a1, y, b1], [a0, y, b1]];
    const pts = [...sc.prism(q(x0, x1, z0, z1, y0), q(x0, x1, z0, z1, y1 - chY))];
    if (chY) pts.push(...sc.prism(q(x0, x1, z0, z1, y1 - chY), q(x0 + ch, x1 - ch, z0 + ch, z1 - ch, y1)));
    h = hull(pts); top = y1;
  }
  if (B.plate) {
    const { px, pz, t = 4, cx = 0, cz = 0 } = B.plate, y = B.y0;
    const c = (x, z) => [cx + x * px, y, cz + z * pz];
    const tp = [c(-1, -1), c(1, -1), c(1, 1), c(-1, 1)], bt = tp.map(([x, , z]) => [x, y - t, z]);
    for (let i = 0; i < 4; i++) {
      sc.occludedLine(tp[i], tp[(i + 1) % 4], [h]);
      const mid = [(tp[i][0] + tp[(i + 1) % 4][0]) / 2 - cx, 0, (tp[i][2] + tp[(i + 1) % 4][2]) / 2 - cz];
      if (facing(nrm(mid))) { sc.occludedLine(bt[i], bt[(i + 1) % 4], [h], L.wire); L.fill.push(`<path d="${poly([tp[i], tp[(i + 1) % 4], bt[(i + 1) % 4], bt[i]], true)}"/>`); }
    }
    for (let i = 0; i < 4; i++) if (facing(nrm([tp[i][0] - cx, 0, tp[i][2] - cz]))) L.wire.push(`<path d="${poly([tp[i], bt[i]])}"/>`);
    L.fill.push(`<path d="${poly(tp, true)}"/>`);
    for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) L.wire.push(ellipse([cx + x * (px - 8), y, cz + z * (pz - 8)], [0, 1, 0], 2.2));
  }
  const fy = B.y0 - (B.plate?.t ?? 0);
  if (B.floor === false) { const fp0 = baseBox(B).map(([x, , z]) => [x, fy, z]); return { hull: h, top, fadeHull: sc.d2(hull([...fp0, ...fp0.map(([x, , z]) => [x, B.y0, z])].map(P2))) }; }
  const fp = B.plate ? [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, z]) => [(B.plate.cx ?? 0) + x * B.plate.px, fy, (B.plate.cz ?? 0) + z * B.plate.pz]) : baseBox(B).map(([x, , z]) => [x, fy, z]);
  { const bb = baseBox(B), ex = Math.max(...bb.map(([x, , z]) => Math.max(Math.abs(x), Math.abs(z)))) * 1.7; sc.floor(fy - 1, -ex, ex, -ex * 0.9, ex * 0.9); }
  const fadeHull = sc.d2(hull([...fp, ...fp.map(([x, , z]) => [x, B.y0, z])].map(P2)));
  return { hull: h, top, fadeHull };
}
/** rubber boot (bellows) on a base top: [r0, r1, y0, y1, folds] */
function drawBoot(sc, [r0, r1, y0, y1, folds = 4]) {
  const prof = [];
  for (let i = 0; i <= folds * 2; i++) { const t = i / (folds * 2); prof.push([lerp(r0, r1, t) * (i % 2 ? 0.86 : 1), lerp(y0, y1, t)]); }
  sc.lathe([0, 0, 0], prof, { rings: prof.map((_, i) => i) });
}
/** hand-rest flange: rounded slab under the grip */
function drawFlange(sc, { y = 34, t = 8, front = 44, back = 56, half = 33, dx = -4, e = 0.7 }) {
  const { L, P2, smooth, facing } = sc;
  const fl = (yy, k) => { const ps = []; for (let j = 0; j < 40; j++) { const tt = (j / 40) * 2 * Math.PI, c = Math.cos(tt), s = Math.sin(tt); const ee = (v) => Math.sign(v) * Math.abs(v) ** e; ps.push([(c > 0 ? front : back) * k * ee(c) + dx, yy, half * k * ee(s)]); } return ps; };
  const top = fl(y, 1), bot = fl(y - t, 0.96);
  L.fill.push(`<path d="${sc.d2(hull([...top, ...bot].map(P2)))}"/>`);
  L.sil.push(`<path d="${smooth(top, true)}"/>`);
  const vis = bot.map((p) => facing(nrm([p[0] - dx, 0, p[2]])));
  let seg = []; const out = () => { if (seg.length > 1) L.wire.push(`<path d="${smooth(seg)}"/>`); seg = []; };
  bot.forEach((p, i) => { if (vis[i]) seg.push(p); else out(); }); out();
  const tp = top.map(P2), bp = bot.map(P2);
  for (const pick of [(a, q) => (q[0] < a[0] ? q : a), (a, q) => (q[0] > a[0] ? q : a)]) { const a = tp.reduce(pick), b = bp.reduce(pick); L.sil.push(`<path d="M${a[0]} ${a[1]}L${b[0]} ${b[1]}"/>`); }
}
/** trigger blade in the x-y plane (front / back outlines meeting at the ends), with optional travel arc and stage detents */
export function trigger(ctx, id, front, back, { z = 6, red = true, arc = null, stages = 2 } = {}) {
  const { sc, L, P2, poly } = ctx;
  const prof = [...front, ...back.slice(0, -1).reverse()];
  const f2 = prof.map(([x, y]) => P2([x, y, z])), b2 = prof.map(([x, y]) => P2([x, y, -z]));
  const T = red ? L.red : L.ctl;
  L.ctlFill.push(`<path d="${sc.smooth2(f2, true)}"${red ? ' fill="#ff4d6d" fill-opacity=".14"' : ''}/>`);
  L.back.push(`<path d="${sc.smooth2(b2, true)}"/>`);
  T.push(`<path d="${sc.smooth2(f2, true)}"/>`);
  for (const i of [0, Math.floor(front.length / 2), front.length - 1]) T.push(`<path d="${poly([[...prof[i], z], [...prof[i], -z]])}" stroke-opacity=".7"/>`);
  if (arc) { // [cx, cy, r, a0, a1]
    const [cx, cy, r, a0, a1] = arc, ps = [];
    for (let j = 0; j <= 16; j++) { const t = (a0 + ((a1 - a0) * j) / 16) * deg; ps.push([cx + r * Math.cos(t), cy + r * Math.sin(t), z + 3]); }
    L.axis.push(`<path d="${sc.smooth(ps)}" stroke-dasharray="3 3"/>`);
    for (let s = 1; s <= stages; s++) { const t = (a0 + ((a1 - a0) * s) / (stages + 0.6)) * deg; L.axis.push(`<path d="${poly([[cx + (r - 4) * Math.cos(t), cy + (r - 4) * Math.sin(t), z + 3], [cx + (r + 5) * Math.cos(t), cy + (r + 5) * Math.sin(t), z + 3]])}"/>`); }
  }
  const mid = front[Math.floor(front.length / 2)];
  sc.anchor(id, [mid[0], mid[1], z]);
  sc.region(id, grow(hull([...f2, ...b2]), 4));
}
/** axis arrows on a base top (stick X / Y) + twist arc when `twist`; anchor `id` */
export function stickAxes(ctx, id, y, r0, r1, { twist = false, cx = 0, labels = ['X', 'Y'], regionR = r1 + 4, ringY = null, ringR = 30 } = {}) {
  const { sc, L, poly, P2 } = ctx;
  for (const d of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]]) {
    const a = add([cx, y, 0], mul(d, r0)), b = add([cx, y, 0], mul(d, r1));
    const side = cross(d, [0, 1, 0]);
    L.axis.push(`<path d="${poly([a, b])}"/>`, `<path d="${poly([add(b, add(mul(d, -6), mul(side, 4.5))), b, add(b, add(mul(d, -6), mul(side, -4.5)))])}"/>`);
  }
  sc.text([cx + r1 + 10, y, 0], labels[1], 'ax', 'middle', 4);
  sc.text([cx, y, r1 + 10], labels[0], 'ax', 'middle', 4);
  if (twist) { const ps = []; for (let j = 0; j <= 20; j++) { const t = (200 + j * 7) * deg; ps.push([cx + (r0 - 6) * Math.cos(t), y + 0.5, (r0 - 6) * Math.sin(t)]); } L.axis.push(`<path d="${sc.smooth(ps)}" stroke-dasharray="4 3"/>`); }
  sc.anchor(id, [cx - r0 * 0.6, y, r0 * 0.7]);
  const ring = [...sc.ring3([cx, y, 0], [0, 1, 0], regionR, 36), ...(ringY !== null ? sc.ring3([cx, ringY, 0], [0, 1, 0], ringR, 24) : [])].map(P2);
  sc.region(id, grow(hull(ring), 3));
}

/* ================================================================== throttles */
/**
 * Throttle. Axes: x forward, y up, z right. S: W, H, AZ, EL, fit (3D points to fit), fitBox, beam, floor
 *  details(ctx): everything (bases with ctx.block, grips with ctx.grip...)
 */
export function buildThrottle(S) {
  // (shape helpers: slab / inset2 / fillet2 are exported for the device files)
  const sc = createScene({ W: S.W ?? 1000, H: S.H ?? 820, MX: 1, AZ: S.AZ ?? -36, EL: S.EL ?? 24 });
  const { L, P2, poly, smooth, ellipse } = sc;
  sc.fit(S.fit, S.fitBox ?? [240, 760, 40, 760], S.align ?? 'center');
  const UP = [0, 1, 0];
  const ctx = {
    sc, L, P2, poly, smooth, ellipse, UP,
    /** box block with optional chamfered top band; panel inset line and screws on top */
    block(x0, x1, z0, z1, y0, y1, { ch = 0, chY = 0, inset = 4, screws = true, vents = null } = {}) {
      const q = (a0, a1, b0, b1, y) => [[a0, y, b0], [a1, y, b0], [a1, y, b1], [a0, y, b1]];
      const pts = [...sc.prism(q(x0, x1, z0, z1, y0), q(x0, x1, z0, z1, y1 - chY))];
      if (chY) pts.push(...sc.prism(q(x0, x1, z0, z1, y1 - chY), q(x0 + ch, x1 - ch, z0 + ch, z1 - ch, y1)));
      const xa = x0 + ch, xb = x1 - ch, za = z0 + ch, zb = z1 - ch;
      if (inset) L.wire.push(`<path d="${poly(q(xa + inset, xb - inset, za + inset, zb - inset, y1 + 0.1), true)}" stroke-opacity=".5"/>`);
      if (screws) for (const [x, z] of [[xa + inset + 3, za + inset + 3], [xb - inset - 3, za + inset + 3], [xb - inset - 3, zb - inset - 3], [xa + inset + 3, zb - inset - 3]]) L.wire.push(ellipse([x, y1 + 0.1, z], UP, 1.5));
      if (vents) { const [face, n] = vents; for (let i = 0; i < n; i++) { const t = (i + 0.5) / n; if (face === 'x1') { const z = lerp(z0 + 10, z1 - 10, t); L.wire.push(`<path d="${poly([[x1, y0 + 8, z], [x1, y0 + 8, z + 3], [x1, y1 - chY - 8, z + 3], [x1, y1 - chY - 8, z]], true)}" stroke-opacity=".5"/>`); } else { const x = lerp(x0 + 10, x1 - 10, t); L.wire.push(`<path d="${poly([[x, y0 + 8, z1], [x + 3, y0 + 8, z1], [x + 3, y1 - chY - 8, z1], [x, y1 - chY - 8, z1]], true)}" stroke-opacity=".5"/>`); } } }
      return hull(pts);
    },
    /** panel separator lines on a deck (y) */
    seams(lines, y) { for (const [a, b] of lines) L.wire.push(`<path d="${poly([[a[0], y + 0.15, a[1]], [b[0], y + 0.15, b[1]]])}" stroke-opacity=".55"/>`); },
    label(p, s, cls = 'sm', anchor = 'middle') { sc.text(p, s, cls, anchor); },
    /** fore-aft slot with detent ticks for a lever at z (deck y) */
    slot(x0, x1, z, y, w = 3, ticks = 0) {
      L.wire.push(`<path d="${poly([[x0, y + 0.2, z - w], [x1, y + 0.2, z - w], [x1, y + 0.2, z + w], [x0, y + 0.2, z + w]], true)}" stroke-width="1.3"/>`);
      for (let i = 0; i < ticks; i++) { const x = lerp(x0 + 4, x1 - 4, i / Math.max(1, ticks - 1)); L.wire.push(`<path d="${poly([[x, y + 0.2, z + w + 2], [x, y + 0.2, z + w + 6]])}" stroke-opacity=".6"/>`); }
    },
    /** lever arm (post) from the deck up to a grip seat */
    arm(x, z, y0, y1, { w = 7, d = 2.4, top = 10 } = {}) {
      const q = (a0, a1, b0, b1, y) => [[a0, y, b0], [a1, y, b0], [a1, y, b1], [a0, y, b1]];
      return sc.prism(q(x - w, x + w, z - d, z + d, y0), q(x - top, x + top, z - d * 1.3, z + d * 1.3, y1));
    },
    /** throttle grip: box loft along x */
    grip(xc, y0, zc, prof, pex = 6, draw = {}) { const g = sc.boxLoft(xc, y0, zc, prof, pex); const h = sc.drawBoxLoft(g, draw); return { ...g, outline: h }; },
    /** lever glow: grip + arm + slot */
    leverRegion(id, anchorPt, parts) { sc.anchor(id, anchorPt); sc.region(id, ...parts.map((p) => grow(hull(p), 2))); },
    /** lever: arm from the deck (x, z) to a grip seat at height h, grip (box loft) centred at gz; glow region `id` (null: none) */
    lever(id, { x, z, gz = z, y0 = 0, h = 44, prof, pex = 4, w = 8, d = 2.6, top = 14, anchorPt = null }) {
      const a = ctx.arm(x, z, y0, h, { w, d, top });
      const g = ctx.grip(x, h, gz, prof, pex);
      if (id) ctx.leverRegion(id, anchorPt ?? [x - 6, y0 + h * 0.5, z], [a, g.outline]);
      return g;
    },
    /** side profile [[x, y], ...] (convex) extruded across z0..z1 with a chamfer `bevel` on both side faces */
    slabX(prof, z0, z1, { bevel = 0, layers = null, opts = {} } = {}) {
      return slab(sc, prof, { A: [1, 0, 0], B: [0, 1, 0], E: [0, 0, 1], e0: z0, e1: z1, bevel, layers, opts });
    },
    /** footprint [[x, z], ...] (convex) extruded up from y0 to y1; top: inset of the top face (sloped / rounded top edge) */
    slabY(plan, y0, y1, { top = 0, topH = 0, layers = null, opts = {} } = {}) {
      const Ls = layers ?? (top ? [[0, y0], [0, y1 - (topH || top)], [top, y1]] : [[0, y0], [0, y1]]);
      return slab(sc, plan, { A: [1, 0, 0], B: [0, 0, 1], E: [0, 1, 0], layers: Ls, opts });
    },
    /** thin bolt-down plate under a base */
    plate(x0, x1, z0, z1, y, t = 4, { holes = true, cut = 0 } = {}) {
      const plan = cut ? [[x0 + cut, z0], [x1 - cut, z0], [x1, z0 + cut], [x1, z1 - cut], [x1 - cut, z1], [x0 + cut, z1], [x0, z1 - cut], [x0, z0 + cut]] : [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
      const r = slab(sc, plan, { A: [1, 0, 0], B: [0, 0, 1], E: [0, 1, 0], layers: [[0, y - t], [0, y]] });
      if (holes) for (const [x, z] of [[x0 + 9, z0 + 9], [x1 - 9, z0 + 9], [x1 - 9, z1 - 9], [x0 + 9, z1 - 9]]) L.wire.push(ellipse([x, y + 0.1, z], UP, 2.4));
      return r.outline;
    },
    /** horizontal drum along x (cylinder-like grip body): centre line y = yc, z = zc, radius r; ribs: accent rings */
    drum(x0, x1, yc, zc, r, { ends = 0.82, ribs = 0, rz = r, draw = {} } = {}) {
      const L0 = x1 - x0, prof = [[0, ends], [0.06, 0.97], [0.18, 1], [0.5, 1], [0.82, 1], [0.94, 0.97], [1, ends]].map(([t, k]) => [x0 + L0 * t, 2 * r * k, rz * k, 0]);
      // (boxLoft grows each section up from y0, so the tapered ends sit slightly low: reads as a rounded grip nose)
      const g2 = sc.boxLoft(0, yc - r, zc, prof.map(([x, h, b]) => [x, h, b, 0]), 2.2);
      const h = sc.drawBoxLoft(g2, { rings: draw.rings ?? [0, 1, 3, 5, 6], flows: draw.flows ?? [-40, 0, 40, 90, 140, 180, 220] });
      for (let i = 0; i < ribs; i++) { const k = 1.2 + (i * 3.6) / Math.max(1, ribs - 1), ps = []; for (let j = 0; j <= 24; j++) ps.push(g2.surf(k, 10 + j * 6.6)); L.accent.push(`<path d="${smooth(ps)}" stroke-width="1.5"/>`); }
      return { ...g2, outline: h };
    },
    /** splayed foot at a base corner: (x, z) corner, (dx, dz) outward direction */
    foot(x, z, dx, dz, y0, y1) {
      const l = Math.hypot(dx, dz), ux = dx / l, uz = dz / l, vx = -uz, vz = ux, w = 6;
      const p = (a, b, y) => [x + ux * a + vx * b, y, z + uz * a + vz * b];
      return sc.prism([p(-4, -w, y0 + 2), p(22, -w, y0), p(22, w, y0), p(-4, w, y0 + 2)], [p(-4, -w, y1), p(4, -w, y1), p(4, w, y1), p(-4, w, y1)]);
    },
    /** panel controls on a flat deck (normal n, height y; slope: the deck rises by `slope` per unit of x from x0):
     *  items { t, id, at: [x, z], ...opts, label, lx, lz }. t: tog | btn | red | knob | rot | key | rock | wheel | slide | group
     *  (parts: items without ids; one glow outline each, in callout order) */
    panel(items, { y = 0, n = UP, slope = 0, x0 = 0 } = {}) {
      if (slope) n = nrm([-slope, 1, 0]);
      const one = (it, id) => {
        const c = it.p ?? [it.at[0], (it.y ?? y) + slope * (it.at[0] - x0), it.at[1]], nn = it.n ?? n;
        let o = null;
        switch (it.t) {
          case 'tog': o = sc.toggle(id, c, nn, { len: it.len ?? 11, lean: it.lean ?? [0.4, 0, 0], guard: it.guard, r: it.r ?? 3.6 }); break;
          case 'btn': case 'red': o = sc.button(id, c, nn, it.r ?? 4.2, it.h ?? 3, it.t === 'red'); break;
          case 'knob': sc.knob(id, c, nn, it.r ?? 5, it.h ?? 4.5, it.ptr ?? 30); o = sc.ellipsePts(c, nn, (it.r ?? 5) * 1.5); break;
          case 'rot': o = sc.rotary(id, c, nn, it.r ?? 5, it.up ?? [1, 0, 0], it.pos ?? 5, it.a0 ?? -70, it.a1 ?? 70, it.sel ?? 0); break;
          case 'key': o = grow(hull(sc.key3(id, c, nn, it.u ?? [0, 0, 1], it.w ?? 6, it.hh ?? 4.5, it.led ?? true)), 2); if (id) sc.region(id, o); break;
          case 'rock': o = sc.rocker(id, c, nn, it.u ?? [1, 0, 0], it.len ?? 6, it.wid ?? 3.4); break;
          case 'wheel': o = sc.wheel(id, c, nn, it.axis ?? [0, 0, 1], it.r ?? 5, it.w ?? 5); break;
          case 'slide': o = sc.slide(id, c, nn, it.u ?? [1, 0, 0], it.len ?? 8, it.wid ?? 3, it.tall ?? 3.4); break;
          default: throw new Error('panel: unknown control ' + it.t);
        }
        if (it.label) sc.text(add(c, [it.lx ?? -11, slope * (it.lx ?? -11), it.lz ?? 0]), it.label, 'sm');
        return o;
      };
      for (const it of items) {
        if (it.t !== 'group') { one(it, it.id); continue; }
        const outs = it.parts.map((q) => grow(hull(one(q, null)), 1));
        const cs = it.parts.map((q) => q.p ?? [q.at[0], (q.y ?? y) + slope * (q.at[0] - x0), q.at[1]]);
        const ctr = cs.reduce((acc, q) => add(acc, mul(q, 1 / cs.length)), [0, 0, 0]);
        sc.anchor(it.id, add(ctr, mul(it.parts[0].n ?? n, 4)));
        sc.region(it.id, ...outs); sc.inputRegion(it.id, outs);
        if (it.label) sc.text(add(ctr, [it.lx ?? -14, 0, it.lz ?? 0]), it.label, 'sm');
      }
    },
  };
  S.details(ctx);
  return sc.result({ fadeHull: S.fadeHull ? sc.d2(hull(S.fadeHull.map(P2))) : '', beam: S.beam ?? [230, 380, 620, 770] });
}
