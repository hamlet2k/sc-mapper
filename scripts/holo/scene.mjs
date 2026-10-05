// Shared engine for the holographic wireframe device art: a tiny 3D scene (orthographic camera, hidden-line split into
// visible / hidden layers), control primitives (hats, buttons, toggles, wheels, keys, levers...) that also record an anchor and a
// glow outline per control, and the SVG assembly with the same layers / filters / palette as the built-in stick, throttle and
// gamepad. Used by the per-device generators in scripts/devices/ (run by scripts/gen-device-art.mjs).
//
// Conventions: y is up. Each generator picks its own x / z meaning and camera (azimuth / elevation in degrees; MX = -1 mirrors).
export const deg = Math.PI / 180;
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = (a) => Math.hypot(a[0], a[1], a[2]);
export const nrm = (a) => mul(a, 1 / (len(a) || 1));
export const lerp = (a, b, t) => a + (b - a) * t;
export const lerp3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
export const f1 = (n) => (Math.round(n * 10) / 10).toString();
export function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}
export function hull(points) { // 2D convex hull (monotone chain)
  const p = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of p.reverse()) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return [...lo.slice(0, -1), ...up.slice(0, -1)];
}
export function grow(pts, px) { // push a closed outline outwards from its centroid
  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cy = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  return pts.map(([x, y]) => { const d = Math.hypot(x - cx, y - cy) || 1; return [x + ((x - cx) / d) * px, y + ((y - cy) / d) * px]; });
}
const d2 = (pts) => 'M' + pts.map(([x, y]) => `${f1(x)} ${f1(y)}`).join('L') + 'Z';

export function createScene({ W = 1000, H = 900, MX = 1, AZ = 34, EL = 23 }) {
  const az = AZ * deg, el = EL * deg;
  const V = [-Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)]; // towards the viewer
  const R = [Math.cos(az), 0, Math.sin(az)];
  const U = cross(V, R);
  let S = 1, OX = 0, OY = 0;
  const P2 = (p) => [W / 2 + MX * (OX - W / 2 + S * dot(p, R)), OY - S * dot(p, U)];
  const raw = (p) => [MX * dot(p, R), -dot(p, U)];
  /** scale / place the drawing so the 3D points fit the canvas box [x0, x1] x [y0, y1] */
  function fit(pts, [x0, x1, y0, y1], align = 'center') {
    const q = pts.map(raw), xs = q.map((p) => p[0]), ys = q.map((p) => p[1]);
    const a0 = Math.min(...xs), a1 = Math.max(...xs), b0 = Math.min(...ys), b1 = Math.max(...ys);
    S = Math.min((y1 - y0) / (b1 - b0), (x1 - x0) / (a1 - a0));
    // P2 x = W/2 + MX*(OX - W/2) + S*raw.x (raw already mirrored)
    const cx = (x0 + x1) / 2; OX = W / 2 + MX * (cx - W / 2 - S * (a0 + a1) / 2);
    OY = align === 'bottom' ? y1 - S * b1 : align === 'top' ? y0 - S * b0 : (y0 + y1) / 2 - S * (b0 + b1) / 2;
    return S;
  }
  const pt = (p) => { const [x, y] = P2(p); return `${f1(x)} ${f1(y)}`; };
  const poly = (ps, close = false) => 'M' + ps.map(pt).join('L') + (close ? 'Z' : '');
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
  const tv = () => Math.atan2(V[2], V[0]) / deg; // azimuth (in the x-z plane) of the viewer, degrees
  const facing = (n) => dot(n, V) > 0;

  /* ------------------------------------------------------------ output collectors */
  const L = { back: [], wire: [], sil: [], ctl: [], ctlFill: [], red: [], accent: [], floor: [], axis: [], text: [], fill: [] };
  const anchors = {}, regions = {}, inputRegions = {};
  const anchor = (id, p) => { anchors[id] = P2(p); return anchors[id]; };
  const anchor2 = (id, xy) => { anchors[id] = xy; return xy; };
  function relPath(id, outlines) {
    const [ax, ay] = anchors[id];
    return outlines.map((ps) => 'M' + ps.map(([x, y]) => `${f1(x - ax)} ${f1(y - ay)}`).join('L') + 'Z').join('');
  }
  /** glow outline(s) of a control (closed 2D polygons, canvas units), stored relative to its anchor */
  function region(id, ...outlines) { regions[id] = relPath(id, outlines); }
  /** one outline per input of a multi-input control (same order as the callout inputs) */
  function inputRegion(id, outlines) { inputRegions[id] = outlines.map((o) => (o ? relPath(id, [o]) : '')); }
  const text = (p, s, cls = 'sm', anchorTxt = 'middle', dy = 3) => { const [x, y] = P2(p); L.text.push(`<text x="${f1(x)}" y="${f1(y + dy)}" class="${cls}" text-anchor="${anchorTxt}">${s}</text>`); };

  /* ------------------------------------------------------------ primitives */
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
  function ellipse(c, n, r, attrs = '') {
    const [t1, t2] = basis(n);
    const e1 = [MX * S * r * dot(t1, R), -S * r * dot(t1, U)], e2 = [MX * S * r * dot(t2, R), -S * r * dot(t2, U)];
    const a = e1[0], b = e2[0], cc = e1[1], d = e2[1];
    const E = (a * a + b * b + cc * cc + d * d) / 2, F = Math.hypot((a * a + b * b - cc * cc - d * d) / 2, a * cc + b * d);
    const rx = Math.sqrt(E + F), ry = Math.sqrt(Math.max(0, E - F));
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
    const sh = [bx - ax, by - ay];
    return `<path d="M${f1(lo[0])} ${f1(lo[1])}l${f1(sh[0])} ${f1(sh[1])}M${f1(hi[0])} ${f1(hi[1])}l${f1(sh[0])} ${f1(sh[1])}"/>`;
  }
  /** direction `up` projected into the plane with normal n */
  const inPlane = (up, n) => nrm(sub(up, mul(n, dot(up, n))));

  /** 4-way hat (+ push): bezel, raised cap with direction arrows. opts.rings: concentric rings instead of arrows (trim / coolie);
   * opts.stalk: height of a stem it sits on (thumb hats sticking out of a grip) */
  function hat(id, c, n, r, up, opts = {}) {
    const stalk = opts.stalk ?? 0, h = opts.h ?? 3.2;
    const base = add(c, mul(n, stalk)), top = add(base, mul(n, h));
    if (stalk) { L.ctl.push(ellipse(c, n, r * 0.55, ' stroke-opacity=".6"'), cylSides(c, n, r * 0.55, stalk)); }
    else L.ctl.push(ellipse(c, n, r * 1.32, ' stroke-opacity=".55"'));
    L.ctlFill.push(ellipse(top, n, r));
    L.ctl.push(ellipse(base, n, r), cylSides(base, n, r, h), ellipse(top, n, r));
    const u = inPlane(up, n), v = cross(n, u);
    if (opts.rings) {
      for (const k of [0.74, 0.5, 0.27]) L.ctl.push(ellipse(add(top, mul(n, 0.3)), n, r * k, ' stroke-opacity=".8"'));
      L.ctl.push(ellipse(add(top, mul(n, 0.4)), n, r * 0.1, ' class="cf"'));
    } else if (opts.cross) {
      const w = r * 0.26, l = r * 0.8;
      const cr = [[-w, l], [w, l], [w, w], [l, w], [l, -w], [w, -w], [w, -l], [-w, -l], [-w, -w], [-l, -w], [-l, w], [-w, w]].map(([a, b]) => add(top, add(mul(v, a), mul(u, b))));
      L.ctl.push(`<path d="${poly(cr, true)}"/>`);
    } else if (opts.ribs) {
      for (let j = -3; j <= 3; j++) { const a = add(top, add(mul(v, j * r * 0.2), mul(u, -r * 0.6 * Math.sqrt(1 - (j / 4) ** 2)))), b = add(top, add(mul(v, j * r * 0.2), mul(u, r * 0.6 * Math.sqrt(1 - (j / 4) ** 2)))); L.ctl.push(`<path d="${poly([a, b])}" stroke-opacity=".75"/>`); }
    } else {
      for (const d of [u, v, mul(u, -1), mul(v, -1)]) {
        const tip = add(top, mul(d, r * 0.78)), bs = add(top, mul(d, r * 0.42)), side = cross(n, d);
        L.ctl.push(`<path d="${poly([tip, add(bs, mul(side, r * 0.2)), add(bs, mul(side, -r * 0.2))], true)}" class="cf"/>`);
      }
      L.ctl.push(ellipse(top, n, r * 0.16, ' class="cf"'));
    }
    anchor(id, top);
    region(id, grow(hull([...(stalk ? ellipsePts(c, n, r * 0.6) : ellipsePts(c, n, r * 1.32)), ...ellipsePts(base, n, r), ...ellipsePts(top, n, r)]), 3));
    return { top, u, v };
  }
  function button(id, c, n, r, h = 2.6, red = false) {
    const top = add(c, mul(n, h)), tgt = red ? L.red : L.ctl;
    tgt.push(ellipse(c, n, r * 1.4, ' stroke-opacity=".5"'));
    L.ctlFill.push(ellipse(top, n, r, red ? ' fill="#ff4d6d" fill-opacity=".22"' : ''));
    tgt.push(ellipse(c, n, r), cylSides(c, n, r, h), ellipse(top, n, r));
    if (red) tgt.push(ellipse(add(top, mul(n, 0.3)), n, r * 0.45));
    anchor(id, top);
    const o = grow(hull([...ellipsePts(c, n, r * 1.4), ...ellipsePts(top, n, r)]), 3);
    region(id, o);
    return o;
  }
  function ministick(id, c, n, r, opts = {}) {
    const post = opts.post ?? 9, top = add(c, mul(n, post));
    L.ctl.push(ellipse(c, n, r * 1.38, ' stroke-opacity=".55"'), ellipse(c, n, r * 0.95, ' stroke-opacity=".55"'));
    L.ctl.push(ellipse(c, n, 2.6), cylSides(c, n, 2.6, post));
    L.ctlFill.push(ellipse(top, n, r));
    const t2 = add(top, mul(n, 3));
    L.ctl.push(ellipse(top, n, r), cylSides(top, n, r, 3), ellipse(t2, n, r), ellipse(t2, n, r * 0.62), ellipse(t2, n, r * 0.28, ' class="cf"'));
    if (opts.spokes) { const [t1, tt2] = basis(n); for (let j = 0; j < 8; j++) { const t = (j / 8) * 2 * Math.PI, d = add(mul(t1, Math.cos(t)), mul(tt2, Math.sin(t))); L.ctl.push(`<path d="${poly([add(t2, mul(d, r * 0.62)), add(t2, mul(d, r * 0.95))])}" stroke-opacity=".8"/>`); } }
    anchor(id, t2);
    region(id, grow(hull([...ellipsePts(c, n, r * 1.38), ...ellipsePts(t2, n, r)]), 3));
  }
  /** thumb wheel rolling about `axis` (in the surface), half sunk in a slot */
  function wheel(id, c, n, axis, r, w) {
    const ax = inPlane(axis, n), dirs = cross(n, ax);
    const ctr = add(c, mul(n, r * 0.35));
    const e1 = add(ctr, mul(ax, -w / 2)), e2 = add(ctr, mul(ax, w / 2));
    const slot = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => add(c, add(mul(ax, sx * (w / 2 + 2.2)), mul(dirs, sy * (r + 2.2)))));
    L.ctl.push(`<path d="${poly(slot, true)}" stroke-opacity=".55"/>`);
    const half = (e) => { const ps = []; for (let j = 0; j <= 18; j++) { const t = Math.PI * (j / 18); ps.push(add(e, add(mul(dirs, r * Math.cos(t)), mul(n, r * Math.sin(t))))); } return ps; };
    const h1 = half(e1), h2 = half(e2);
    L.ctlFill.push(`<path d="${poly([...h1, ...[...h2].reverse()], true)}"/>`);
    L.ctl.push(`<path d="${poly(h1)}"/>`, `<path d="${poly(h2)}"/>`);
    for (let j = 1; j < 18; j += 2) L.ctl.push(`<path d="${poly([h1[j], h2[j]])}" stroke-opacity=".8"/>`);
    if (id) { anchor(id, add(ctr, mul(n, r * 0.7))); region(id, grow(hull([...h1, ...h2, ...slot].map(P2)), 3)); }
    return [...h1, ...h2, ...slot].map(P2);
  }
  /** small rounded key on a plane (centre c, normal n, u = long axis), with an LED line */
  function key3(id, c, n, u, w, h, led = true) {
    const uu = inPlane(u, n), vv = cross(n, uu), hh = 2.6;
    const rect = (base, k) => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => add(base, add(mul(uu, a * w * k), mul(vv, b * h * k))));
    const top = add(c, mul(n, hh));
    const r0 = rect(c, 1), r1 = rect(top, 0.86);
    L.ctl.push(`<path d="${poly(r0, true)}" stroke-opacity=".55"/>`);
    L.ctlFill.push(`<path d="${poly(r1, true)}"/>`);
    L.ctl.push(`<path d="${poly(r1, true)}"/>`);
    for (let i = 0; i < 4; i++) L.ctl.push(`<path d="${poly([r0[i], r1[i]])}" stroke-opacity=".6"/>`);
    if (led) L.accent.push(`<path d="${poly([add(top, mul(uu, -w * 0.5)), add(top, mul(uu, w * 0.5))])}" stroke-width="1.8"/>`);
    if (id) anchor(id, top);
    return [...r0, ...r1].map(P2);
  }
  /** bat-handle toggle on a plate: base nut, lever leaning `lean` (a vector in the plate plane, e.g. towards the "up" position) */
  function toggle(id, c, n, opts = {}) {
    const len0 = opts.len ?? 14, lean = opts.lean ?? [0, 0, 0], guard = opts.guard ?? false, r = opts.r ?? 4.4;
    const T = opts.hidden ? L.back : L.ctl; // hidden: on a face turned away from the viewer, drawn dashed ("x-ray")
    T.push(ellipse(c, n, r * 1.45, ' stroke-opacity=".5"'), ellipse(add(c, mul(n, 2.4)), n, r), cylSides(c, n, r, 2.4), ellipse(c, n, r));
    const b = add(c, mul(n, 2.2)), tip = add(b, add(mul(n, len0), mul(lean, len0)));
    T.push(`<path d="${poly([b, tip])}" stroke-width="${opts.hidden ? 1.6 : 2.8}"/>`);
    const tipN = nrm(sub(tip, b));
    if (!opts.hidden) L.ctlFill.push(ellipse(tip, tipN, 2.3));
    T.push(ellipse(tip, tipN, 2.3), ellipse(tip, tipN, 1, opts.hidden ? '' : ' class="cf"'));
    if (guard) { // two guard posts beside the lever
      const s = inPlane(cross(n, nrm(lean.some(Boolean) ? lean : basis(n)[0])), n);
      for (const k of [-1, 1]) { const p = add(c, mul(s, k * r * 1.9)); L.ctl.push(`<path d="${poly([p, add(p, mul(n, len0 * 0.7))])}" stroke-opacity=".7" stroke-width="1.8"/>`); }
    }
    const o = grow(hull([...ellipsePts(c, n, r * 1.45), P2(tip), ...ellipsePts(tip, tipN, 3)]), 3);
    if (id) { anchor(id, lerp3(b, tip, 0.55)); region(id, o); }
    return o;
  }
  /** knurled knob / encoder: cylinder with ribs and a pointer, axis n */
  function knob(id, c, n, r, h, pointerDeg = 30) {
    const top = add(c, mul(n, h)), [t1, t2] = basis(n);
    L.ctl.push(ellipse(c, n, r * 1.45, ' stroke-opacity=".5"'));
    L.ctlFill.push(ellipse(top, n, r));
    L.ctl.push(ellipse(c, n, r), cylSides(c, n, r, h), ellipse(top, n, r), ellipse(top, n, r * 0.6, ' stroke-opacity=".6"'));
    for (let j = 0; j < 24; j++) { const t = (j / 24) * 2 * Math.PI, d = add(mul(t1, Math.cos(t)), mul(t2, Math.sin(t))); if (!facing(d)) continue; L.ctl.push(`<path d="${poly([add(c, add(mul(d, r), mul(n, 1))), add(c, add(mul(d, r), mul(n, h - 1)))])}" stroke-opacity=".6"/>`); }
    const t = pointerDeg * deg; L.ctl.push(`<path d="${poly([top, add(top, add(mul(t1, r * 0.9 * Math.cos(t)), mul(t2, r * 0.9 * Math.sin(t))))])}" stroke-width="2"/>`);
    if (id) { anchor(id, top); region(id, grow(hull([...ellipsePts(c, n, r * 1.45), ...ellipsePts(top, n, r)]), 3)); }
  }
  /** a convex polyhedron given as faces (lists of 3D points, any winding) around an interior point: visible edges bright,
   * silhouette edges glowing, hidden edges dashed; visible faces go into the body fill */
  function solid(faces, inside, opts = {}) {
    const normal = (f) => { let n = [0, 0, 0]; for (let i = 0; i < f.length; i++) { const a = f[i], b = f[(i + 1) % f.length]; n = add(n, [(a[1] - b[1]) * (a[2] + b[2]), (a[2] - b[2]) * (a[0] + b[0]), (a[0] - b[0]) * (a[1] + b[1])]); }
      n = nrm(n); const c = f.reduce((s, p) => add(s, mul(p, 1 / f.length)), [0, 0, 0]); return dot(n, sub(c, inside)) < 0 ? mul(n, -1) : n; };
    const vis = faces.map((f) => dot(normal(f), V) > 0.02);
    const key = (p) => p.map((v) => v.toFixed(2)).join(',');
    const edges = new Map();
    faces.forEach((f, i) => f.forEach((p, j) => { const q = f[(j + 1) % f.length]; const k = [key(p), key(q)].sort().join('|'); const e = edges.get(k) ?? { p, q, faces: [] }; e.faces.push(i); edges.set(k, e); }));
    const silT = opts.sil ?? L.sil, wireT = opts.wire ?? L.wire;
    for (const e of edges.values()) {
      const nv = e.faces.filter((i) => vis[i]).length;
      if (nv === 1) silT.push(`<path d="${poly([e.p, e.q])}"/>`); // silhouette (or the rim of an open face)
      else if (nv === 2) wireT.push(`<path d="${poly([e.p, e.q])}" stroke-width="1.3"/>`);
      else if (!opts.noHidden) L.back.push(`<path d="${poly([e.p, e.q])}"/>`);
    }
    if (opts.fill !== false) faces.forEach((f, i) => { if (vis[i]) L.fill.push(`<path d="${poly(f, true)}"/>`); });
    const pts = faces.flat().map(P2);
    return { vis, outline: hull(pts) };
  }
  /** extruded prism: a 2D profile (closed, convex or not) in the plane spanned by (ax1, ax2), extruded along ex by [e0, e1] */
  function extrude(profile, o, ax1, ax2, ex, e0, e1, opts = {}) {
    const at = ([a, b], e) => add(o, add(add(mul(ax1, a), mul(ax2, b)), mul(ex, e)));
    const A = profile.map((p) => at(p, e0)), B = profile.map((p) => at(p, e1));
    const nE = nrm(ex), showB = facing(nE);
    const front = showB ? B : A, back = showB ? A : B;
    const tgt = opts.ctl ? L.ctl : L.wire, silT = opts.ctl ? L.ctl : L.sil;
    if (opts.fillCtl) L.ctlFill.push(`<path d="${opts.smooth ? smooth(front, true) : poly(front, true)}"/>`);
    L.back.push(`<path d="${opts.smooth ? smooth(back, true) : poly(back, true)}"/>`);
    silT.push(`<path d="${opts.smooth ? smooth(front, true) : poly(front, true)}"/>`);
    (opts.edges ?? profile.map((_, i) => i)).forEach((i) => tgt.push(`<path d="${poly([A[i], B[i]])}" stroke-opacity=".7"/>`));
    const out = hull([...A, ...B].map(P2));
    if (!opts.fillCtl && opts.fill !== false) L.fill.push(`<path d="${d2(out)}"/>`);
    return out;
  }
  /** surface of revolution about the y axis through c: profile [[r, y], ...] bottom to top; near half bright, far half dashed */
  function lathe(c, prof, opts = {}) {
    const t0 = tv(), ring = (r, y, a0, a1, n = 24) => { const ps = []; for (let j = 0; j <= n; j++) { const t = (a0 + ((a1 - a0) * j) / n) * deg; ps.push([c[0] + r * Math.cos(t), c[1] + y, c[2] + r * Math.sin(t)]); } return ps; };
    const lft = [], rgt = [];
    prof.forEach(([r, y], i) => {
      const bright = opts.rings ? opts.rings.includes(i) : true;
      const isEnd = i === 0 || i === prof.length - 1;
      (isEnd ? L.sil : bright ? L.wire : L.back).push(`<path d="${smooth(ring(r, y, t0 - 90, t0 + 90))}"${!isEnd && opts.dash?.includes(i) ? ' stroke-dasharray="3 3"' : ''}/>`);
      if (i === prof.length - 1 && opts.topVisible !== false) L.sil.push(`<path d="${smooth(ring(r, y, t0 + 90, t0 + 270))}"/>`);
      else L.back.push(`<path d="${smooth(ring(r, y, t0 + 90, t0 + 270))}"/>`);
      const ps = ring(r, y, 0, 360, 72).map(P2);
      lft.push(ps.reduce((a, q) => (q[0] < a[0] ? q : a))); rgt.push(ps.reduce((a, q) => (q[0] > a[0] ? q : a)));
    });
    L.sil.push(`<path d="${smooth2(lft)}"/>`, `<path d="${smooth2(rgt)}"/>`);
    const all = prof.flatMap(([r, y]) => ring(r, y, 0, 360, 36).map(P2));
    L.fill.push(`<path d="${d2(hull(all))}"/>`);
    if (opts.flutes) for (let j = 0; j < opts.flutes; j++) { const t = (t0 - 80 + (160 * j) / (opts.flutes - 1)) * deg; L.wire.push(`<path d="${smooth(prof.map(([r, y]) => [c[0] + r * Math.cos(t), c[1] + y, c[2] + r * Math.sin(t)]))}" stroke-opacity=".45"/>`); }
    return hull(all);
  }
  /** knurled ring (short cylinder about y) with ribs on the visible half */
  function knurl(c, r, y0, y1, ribs = 18) {
    lathe(c, [[r, y0], [r, y1]]);
    const t0 = tv();
    for (let j = 0; j <= ribs; j++) { const t = (t0 - 85 + (170 * j) / ribs) * deg; L.wire.push(`<path d="${poly([[c[0] + r * Math.cos(t), c[1] + y0 + 1, c[2] + r * Math.sin(t)], [c[0] + r * Math.cos(t), c[1] + y1 - 1, c[2] + r * Math.sin(t)]])}" stroke-opacity=".65"/>`); }
  }
  const inConvex = (q, poly2) => { let sgn = 0; for (let i = 0; i < poly2.length; i++) { const a = poly2[i], b = poly2[(i + 1) % poly2.length]; const c = (b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0]); if (c !== 0) { if (sgn && Math.sign(c) !== sgn) return false; sgn = Math.sign(c); } } return true; };
  /** straight 3D edge drawn into `tgt`, except where it passes behind one of the given (convex, 2D) occluder outlines: there it
   * goes into the hidden layer */
  function occludedLine(a, b, occluders, tgt = L.sil, attrs = '') {
    const N = 80; let run = [], hid = null;
    const flush = () => { if (run.length > 1) (hid ? L.back : tgt).push(`<path d="${poly(run)}"${hid ? '' : attrs}/>`); };
    for (let i = 0; i <= N; i++) {
      const p = lerp3(a, b, i / N), h = occluders.some((o) => inConvex(P2(p), o));
      if (hid === null) hid = h;
      if (h !== hid) { run.push(p); flush(); run = [p]; hid = h; } else run.push(p);
    }
    flush();
  }
  /** holographic floor grid at height y over [x0, x1] x [z0, z1] (faded towards the edges) */
  function floor(y, x0, x1, z0, z1, step = 20) {
    const g = [];
    for (let x = x0; x <= x1; x += step) g.push(`<path d="${poly([[x, y, z0], [x, y, z1]])}"/>`);
    for (let z = z0; z <= z1; z += step) g.push(`<path d="${poly([[x0, y, z], [x1, y, z]])}"/>`);
    L.floor.push(`<g mask="url(#fade)" stroke-opacity=".35">${g.join('')}</g>`);
  }

  /* ------------------------------------------------------------ lofts */
  /** loft along a bent spine in the x-y plane: sections [x, y, a (half depth along the section's forward axis), b (half width, z),
   * tilt (deg, section plane leaning back)]; superellipse cross-section, a little narrower at the front (egg) */
  function spineLoft(KEY, { pex = 2.5, egg = 0.1, z = 0 } = {}) {
    const n = KEY.length, KT = n - 1;
    const sec = (k) => { const i = Math.max(0, Math.min(n - 2, Math.floor(k))), t = Math.min(1, Math.max(0, k - i)); const g = (j) => KEY[Math.max(0, Math.min(n - 1, j))]; return [0, 1, 2, 3, 4].map((c) => catmull(g(i - 1)[c], g(i)[c], g(i + 1)[c], g(i + 2)[c], t)); };
    const se = (v) => Math.sign(v) * Math.abs(v) ** (2 / pex);
    const frame = (k) => { const [x, y, a, b, tl] = sec(k); const th = tl * deg; return { C: [x, y, z], F: [Math.cos(th), Math.sin(th), 0], N: [-Math.sin(th), Math.cos(th), 0], Z: [0, 0, 1], a, b }; };
    /** phi 0 = front (+F), 90 = +z side, 180 = back */
    const surf = (k, phi) => { const f = frame(k), c = Math.cos(phi * deg), s = Math.sin(phi * deg); return add(f.C, add(mul(f.F, f.a * se(c)), mul(f.Z, f.b * (1 - egg * c) * se(s)))); };
    const surfN = (k, phi) => { const e = 0.01, d = 0.5; const dk = sub(surf(k + e, phi), surf(k - e, phi)), dp = sub(surf(k, phi + d), surf(k, phi - d)); let nn = nrm(cross(dp, dk)); if (dot(nn, sub(surf(k, phi), frame(k).C)) < 0) nn = mul(nn, -1); return nn; };
    /** top panel: u along its forward axis, w across (+z), both -1..1 (bulges a little) */
    const cap = (u, w, lift = 0, bulge = 2.5) => { const f = frame(KT); const r2 = Math.min(1, u * u + w * w); return add(add(f.C, add(mul(f.F, f.a * u * 0.98), mul(f.Z, f.b * w * 0.98))), mul(f.N, bulge * (1 - r2) + lift)); };
    const capRing = (k = 1, lift = 0, steps = 40) => { const ps = []; for (let j = 0; j < steps; j++) { const t = (j / steps) * 2 * Math.PI; ps.push(cap(k * se(Math.cos(t)), k * se(Math.sin(t)) * (1 - egg * Math.cos(t)), lift, 0)); } return ps; };
    return { KT, sec, se, frame, surf, surfN, cap, capRing, capN: () => frame(KT).N };
  }
  function drawSpineLoft(lo, { rings = [], flows = 16, flowSteps = 22 } = {}) {
    const { surf, surfN, frame, KT } = lo, NK = 64;
    const ringsF = [], ctr = [], silA = [], silB = [];
    for (let i = 0; i <= NK; i++) { const k = (i / NK) * KT; const r = []; for (let j = 0; j < 48; j++) r.push(P2(surf(k, j * 7.5))); ringsF.push(r); ctr.push(P2(frame(k).C)); }
    for (let i = 0; i <= NK; i++) {
      const c0 = ctr[Math.max(0, i - 1)], c1 = ctr[Math.min(NK, i + 1)];
      let dx = c1[0] - c0[0], dy = c1[1] - c0[1]; const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
      const px = -dy, py = dx, c = ctr[i];
      let lo2 = null, hi = null, vlo = 1e9, vhi = -1e9;
      for (const q of ringsF[i]) { const v = (q[0] - c[0]) * px + (q[1] - c[1]) * py; if (v < vlo) { vlo = v; lo2 = q; } if (v > vhi) { vhi = v; hi = q; } }
      if (lo2[0] < hi[0]) { silA.push(lo2); silB.push(hi); } else { silA.push(hi); silB.push(lo2); }
      if (i < NK && i % 2 === 0) L.fill.push(`<path d="${d2(hull([...ringsF[i], ...ringsF[Math.min(NK, i + 2)]]))}"/>`);
    }
    const cr = lo.capRing();
    L.fill.push(`<path d="${d2(hull(cr.map(P2)))}"/>`);
    const sub3 = (a) => a.filter((_, i) => i % 3 === 0 || i === a.length - 1);
    L.sil.push(`<path d="${smooth2(sub3(silA))}"/>`, `<path d="${smooth2(sub3(silB))}"/>`);
    const curve = (gen, n) => {
      let seg = [], vis = null;
      const flush = () => { if (seg.length > 1) (vis ? L.wire : L.back).push(`<path d="${smooth(seg)}"/>`); };
      for (let j = 0; j <= n; j++) { const [p, nn] = gen(j); const v = facing(nn); if (vis === null) vis = v; if (v !== vis) { seg.push(p); flush(); seg = [p]; vis = v; } else seg.push(p); }
      flush();
    };
    for (const k of rings) curve((j) => [surf(k, (j / 48) * 360), surfN(k, (j / 48) * 360)], 48);
    for (let j = 0; j < flows; j++) { const phi = (j / flows) * 360 + 180 / flows; curve((i) => [surf((i / flowSteps) * KT, phi), surfN((i / flowSteps) * KT, phi)], flowSteps); }
    (facing(lo.capN()) ? L.sil : L.back).push(`<path d="${smooth(cr, true)}"/>`);
    return { silA, silB };
  }
  /** loft along x (fore-aft) through rounded-rectangle sections [x, h (height above y0), b (half width), dz] (throttle grips) */
  function boxLoft(Xc, Y0, Zc, prof, pex = 5) {
    const n = prof.length, KT = n - 1;
    const g = (j) => prof[Math.max(0, Math.min(n - 1, j))];
    const sec = (k) => { const i = Math.max(0, Math.min(n - 2, Math.floor(k))), t = Math.min(1, Math.max(0, k - i)); return [0, 1, 2, 3].map((c) => catmull(g(i - 1)[c], g(i)[c], g(i + 1)[c], g(i + 2)[c], t)); };
    const se = (v) => Math.sign(v) * Math.abs(v) ** (2 / pex);
    /** phi 0 = +z side, 90 = top, 180 = -z side, 270 = bottom */
    const surf = (k, phi) => { const [x, h, b, dz] = sec(k); const c = Math.cos(phi * deg), s = Math.sin(phi * deg); return [Xc + x, Y0 + h / 2 + (h / 2) * se(s), Zc + dz + b * se(c)]; };
    const ctr = (k) => { const [x, h, , dz] = sec(k); return [Xc + x, Y0 + h / 2, Zc + dz]; };
    const surfN = (k, phi) => { const e = 0.01, d = 0.5; const dk = sub(surf(k + e, phi), surf(k - e, phi)), dp = sub(surf(k, phi + d), surf(k, phi - d)); let nn = nrm(cross(dp, dk)); if (dot(nn, sub(surf(k, phi), ctr(k))) < 0) nn = mul(nn, -1); return nn; };
    const kAt = (x) => { let k = 0; for (let i = 0; i <= 400; i++) { const kk = (i / 400) * KT; if (Math.abs(sec(kk)[0] + Xc - x) < Math.abs(sec(k)[0] + Xc - x)) k = kk; } return k; };
    /** point + normal on the flat end face (k = 0 or KT): u across (z), w up (y), both -1..1 */
    const endFace = (end, u, w) => { const k = end ? KT : 0; const [x, h, b, dz] = sec(k); return [[Xc + x, Y0 + h / 2 + (h / 2) * w, Zc + dz + b * u], [end ? 1 : -1, 0, 0]]; };
    const at = (x, phi) => { const k = kAt(x); return [surf(k, phi), surfN(k, phi)]; };
    /** point + normal on a side face (side +1 = +z, -1 = -z) at height fraction w (-1 bottom .. 1 top) */
    const sideAt = (x, side, w) => { const p0 = (Math.asin(Math.sign(w) * Math.min(1, Math.abs(w)) ** (pex / 2)) / deg); return at(x, side > 0 ? p0 : 180 - p0); };
    return { surf, surfN, ctr, KT, sec, kAt, endFace, at, sideAt, Xc, Zc, Y0 };
  }
  function drawBoxLoft(gr, { rings = [0, 1, 2.5, 4, 5.4, 7], flows = [-30, 20, 55, 90, 125, 160, 210] } = {}) {
    const { surf, surfN, KT } = gr;
    const all = [];
    for (let i = 0; i <= 56; i++) for (let j = 0; j < 72; j++) all.push(P2(surf((i / 56) * KT, j * 5)));
    const h = hull(all);
    L.sil.push(`<path d="${d2(h)}"/>`);
    L.fill.push(`<path d="${d2(h)}"/>`);
    const curve = (pts, vis) => { let seg = [], cur = null; const out = (s, v) => { if (s.length > 1) (v ? L.wire : L.back).push(`<path d="${smooth(s)}"/>`); }; for (const [p, v] of pts.map((p, i) => [p, vis[i]])) { if (cur === null) cur = v; if (v !== cur) { seg.push(p); out(seg, cur); seg = [p]; cur = v; } else seg.push(p); } out(seg, cur); };
    for (const k of rings.filter((k) => k <= KT)) { const ps = [], vs = []; for (let j = 0; j <= 72; j++) { ps.push(surf(k, j * 5)); vs.push(facing(surfN(k, j * 5))); } curve(ps, vs); }
    for (const phi of flows) { const ps = [], vs = []; for (let i = 0; i <= 28; i++) { const k = (i / 28) * KT; ps.push(surf(k, phi)); vs.push(facing(surfN(k, phi))); } curve(ps, vs); }
    for (const k of [0, KT]) { const ring = []; for (let j = 0; j < 72; j++) ring.push(surf(k, j * 5)); const fc = facing([k ? 1 : -1, 0, 0]); (fc ? L.wire : L.back).push(`<path d="${smooth(ring, true)}"${fc ? ' stroke-width="1.4"' : ''}/>`); }
    return h;
  }
  /** axis-aligned box, visible / hidden edges */
  function box(x0, y0, z0, x1, y1, z1, opts = {}) {
    const P = (i) => [i & 1 ? x1 : x0, i & 2 ? y1 : y0, i & 4 ? z1 : z0];
    const F = [[0, 1, 3, 2], [4, 5, 7, 6], [0, 1, 5, 4], [2, 3, 7, 6], [0, 2, 6, 4], [1, 3, 7, 5]].map((f) => f.map(P));
    return solid(F, [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], opts);
  }
  /** convex 8-corner block from a bottom and a top quad (same corner order) */
  function prism(bot, top, opts = {}) {
    const vs = [...bot, ...top];
    const F = [[0, 1, 2, 3], [7, 6, 5, 4], [0, 4, 5, 1], [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 4, 0]].map((f) => f.map((i) => vs[i]));
    const ctr = vs.reduce((s, p) => add(s, mul(p, 1 / 8)), [0, 0, 0]);
    solid(F, ctr, opts);
    return vs.map(P2);
  }

  /** slide / rocker switch on a face: slot along `fw` (in the face), cap with ribs; returns its outline */
  function slide(id, q, nn, fw0, len, wid, tall = 3.4) {
    const fw = inPlane(fw0, nn), up = cross(nn, fw);
    const slot = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => add(q, add(mul(fw, a * (len + 3)), mul(up, b * (wid + 1.5)))));
    L.ctl.push(`<path d="${poly(slot, true)}" stroke-opacity=".55"/>`);
    const top = add(q, mul(nn, tall));
    const kb = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => add(q, add(mul(fw, a * len * 0.55), mul(up, b * wid))));
    const kt = kb.map((v) => add(v, mul(nn, tall)));
    L.ctlFill.push(`<path d="${poly(kt, true)}"/>`);
    L.ctl.push(`<path d="${poly(kt, true)}"/>`, ...kb.map((v, i) => `<path d="${poly([v, kt[i]])}" stroke-opacity=".7"/>`));
    for (const a of [-0.25, 0, 0.25]) L.ctl.push(`<path d="${poly([add(top, add(mul(fw, a * len), mul(up, -wid * 0.7))), add(top, add(mul(fw, a * len), mul(up, wid * 0.7)))])}" stroke-opacity=".7"/>`);
    const o = grow(hull([...slot, ...kt].map(P2)), 3);
    if (id) { anchor(id, top); region(id, o); }
    return o;
  }
  /** rocker: a flat key split in two halves (along u), tilted */
  function rocker(id, c, n, u, len, wid) {
    const uu = inPlane(u, n), vv = cross(n, uu), h = 2.4;
    const R4 = (base, k) => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => add(base, add(mul(uu, a * len * k), mul(vv, b * wid * k))));
    const r0 = R4(c, 1.25), r1 = R4(add(c, mul(n, h)), 1);
    L.ctl.push(`<path d="${poly(r0, true)}" stroke-opacity=".5"/>`);
    L.ctlFill.push(`<path d="${poly(r1, true)}"/>`);
    L.ctl.push(`<path d="${poly(r1, true)}"/>`, `<path d="${poly([add(add(c, mul(n, h)), mul(vv, -wid)), add(add(c, mul(n, h)), mul(vv, wid))])}" stroke-opacity=".8"/>`);
    for (let i = 0; i < 4; i++) L.ctl.push(`<path d="${poly([R4(c, 1)[i], r1[i]])}" stroke-opacity=".6"/>`);
    const o = grow(hull([...r0, ...r1].map(P2)), 3);
    if (id) { anchor(id, add(c, mul(n, h))); region(id, o); }
    return o;
  }
  /** multi-position rotary selector: knob with a bar handle and `n` position ticks around it (arc a0..a1 deg from `up`) */
  function rotary(id, c, nrmv, r, up, nPos = 5, a0 = -70, a1 = 70, sel = 0) {
    const u = inPlane(up, nrmv), v = cross(nrmv, u), h = r * 0.9;
    const dir = (a) => add(mul(u, Math.cos(a * deg)), mul(v, Math.sin(a * deg)));
    for (let i = 0; i < nPos; i++) { const a = nPos > 1 ? a0 + ((a1 - a0) * i) / (nPos - 1) : 0, d = dir(a); L.accent.push(`<path d="${poly([add(c, mul(d, r * 1.45)), add(c, mul(d, r * 1.85))])}" stroke-width="1.6"/>`); }
    L.ctl.push(ellipse(c, nrmv, r * 1.25, ' stroke-opacity=".5"'));
    L.ctlFill.push(ellipse(add(c, mul(nrmv, h)), nrmv, r));
    L.ctl.push(ellipse(c, nrmv, r), cylSides(c, nrmv, r, h), ellipse(add(c, mul(nrmv, h)), nrmv, r));
    const sa = nPos > 1 ? a0 + ((a1 - a0) * sel) / (nPos - 1) : 0, d = dir(sa), side = cross(nrmv, d), t = add(c, mul(nrmv, h));
    const bar = [add(t, add(mul(d, r * 1.1), mul(side, r * 0.28))), add(t, add(mul(d, -r * 0.7), mul(side, r * 0.28))), add(t, add(mul(d, -r * 0.7), mul(side, -r * 0.28))), add(t, add(mul(d, r * 1.1), mul(side, -r * 0.28)))];
    const barT = bar.map((p) => add(p, mul(nrmv, r * 0.55)));
    L.ctlFill.push(`<path d="${poly(barT, true)}"/>`);
    L.ctl.push(`<path d="${poly(barT, true)}"/>`, ...bar.map((p, i) => `<path d="${poly([p, barT[i]])}" stroke-opacity=".6"/>`));
    L.ctl.push(`<path d="${poly([add(barT[0], mul(side, -r * 0.28)), add(t, add(mul(d, r * 0.7), mul(nrmv, r * 0.6)))])}" class="cf" stroke-width="2"/>`);
    const o = grow(hull([...ellipsePts(c, nrmv, r * 1.85), ...barT.map(P2)]), 2);
    if (id) { anchor(id, add(t, mul(nrmv, r * 0.55))); region(id, o); }
    return o;
  }
  /** flat lever / paddle from a 2D profile ([a, b] along axes e1, e2 from origin o), thickness along e3; red = trigger colour */
  function paddle(id, o, e1, e2, e3, prof, thick = 5, opts = {}) {
    const at = ([a, b], t) => add(o, add(add(mul(e1, a), mul(e2, b)), mul(e3, t)));
    const f = prof.map((p) => at(p, thick / 2)), bk = prof.map((p) => at(p, -thick / 2));
    const front = facing(e3) ? f : bk, back = facing(e3) ? bk : f;
    const f2 = front.map(P2), b2 = back.map(P2);
    const T = opts.red ? L.red : L.ctl;
    L.ctlFill.push(`<path d="${smooth2(f2, true)}"${opts.red ? ' fill="#ff4d6d" fill-opacity=".14"' : ''}/>`);
    L.back.push(`<path d="${smooth2(b2, true)}"/>`);
    T.push(`<path d="${smooth2(f2, true)}"/>`);
    (opts.edges ?? [0, Math.floor(prof.length / 2)]).forEach((i) => T.push(`<path d="${poly([front[i], back[i]])}" stroke-opacity=".7"/>`));
    const o2 = grow(hull([...f2, ...b2]), 4);
    if (id) { anchor(id, opts.anchorAt ? at(opts.anchorAt, thick / 2) : lerp3(front[0], front[Math.floor(prof.length / 2)], 0.5)); region(id, o2); }
    return o2;
  }
  /** surface of revolution with superellipse rings (rx along x, rz along z): oval / rounded-square bases. prof [[rx, rz, y], ...] */
  function ovalLathe(c, prof, { pex = 2, rings, flows = 0, top = true } = {}) {
    const se = (v) => Math.sign(v) * Math.abs(v) ** (2 / pex);
    const ring = ([rx, rz, y], n = 72) => { const ps = []; for (let j = 0; j < n; j++) { const t = (j / n) * 2 * Math.PI; ps.push([c[0] + rx * se(Math.cos(t)), c[1] + y, c[2] + rz * se(Math.sin(t))]); } return ps; };
    const all = prof.flatMap((p) => ring(p, 48).map(P2));
    const h = hull(all);
    L.fill.push(`<path d="${d2(h)}"/>`);
    L.sil.push(`<path d="${d2(h)}"/>`);
    const nrmAt = (i, j) => { // outward normal estimate of ring i at angle index j (of 72)
      const a = ring(prof[i])[j], b = ring(prof[Math.min(prof.length - 1, i + 1)])[j], b0 = ring(prof[Math.max(0, i - 1)])[j];
      const t1 = sub(b, b0), r2 = ring(prof[i]), t2 = sub(r2[(j + 1) % 72], r2[(j + 71) % 72]);
      let nn = nrm(cross(t2, t1)); if (dot(nn, [a[0] - c[0], 0, a[2] - c[2]]) < 0) nn = mul(nn, -1); return nn;
    };
    prof.forEach((p, i) => {
      if (rings && !rings.includes(i)) return;
      const r = ring(p), isTop = i === prof.length - 1;
      let seg = [], vis = null;
      const flush = () => { if (seg.length > 1) ((vis || (isTop && top)) ? (isTop ? L.sil : L.wire) : L.back).push(`<path d="${smooth(seg)}"/>`); };
      for (let j = 0; j <= 72; j++) { const v = facing(nrmAt(i, j % 72)); if (vis === null) vis = v; if (v !== vis) { seg.push(r[j % 72]); flush(); seg = [r[j % 72]]; vis = v; } else seg.push(r[j % 72]); }
      flush();
    });
    for (let f = 0; f < flows; f++) { const j = Math.round((f / flows) * 72); const pts = prof.map((p) => ring(p)[j]); if (facing(nrmAt(Math.floor(prof.length / 2), j))) L.wire.push(`<path d="${smooth(pts)}" stroke-opacity=".45"/>`); }
    return { hull: h, ring };
  }
  /** a row / grid of square keys on a plane: returns outlines in order; ids optional */
  function keys(ids, c0, n, u, du, dv, cols, w, h, led = false) {
    const uu = inPlane(u, n), vv = cross(n, uu), out = [];
    ids.forEach((id, i) => { const cc = add(c0, add(mul(uu, (i % cols) * du), mul(vv, Math.floor(i / cols) * dv))); const o = key3(id, cc, n, uu, w, h, led); const g = grow(hull(o), 2); if (id) region(id, g); out.push(g); });
    return out;
  }

  /* ------------------------------------------------------------ assembly */
  function svg({ beam = [290, 395, 605, 710], halo = [500, 0.5, 330], fadeHull = '' } = {}) {
    const CY = '#4fd8ff';
    const [b0, b1, b2, b3] = beam;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" fill="none" stroke-linecap="round" stroke-linejoin="round">
<defs>
<filter id="glow" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="2.4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<filter id="glow2" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
<filter id="soft" x="-30%" y="-10%" width="160%" height="120%"><feGaussianBlur stdDeviation="18"/></filter>
<radialGradient id="halo" cx="50%" cy="55%" r="50%"><stop offset="0" stop-color="${CY}" stop-opacity=".13"/><stop offset=".6" stop-color="${CY}" stop-opacity=".04"/><stop offset="1" stop-color="${CY}" stop-opacity="0"/></radialGradient>
<linearGradient id="body" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b2a3d" stop-opacity=".55"/><stop offset="1" stop-color="#06131f" stop-opacity=".35"/></linearGradient>
<linearGradient id="strip" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#7b6cff"/><stop offset=".55" stop-color="#5fb8ff"/><stop offset="1" stop-color="#4fffe0"/></linearGradient>
<linearGradient id="beam" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="${CY}" stop-opacity=".10"/><stop offset="1" stop-color="${CY}" stop-opacity="0"/></linearGradient>
<pattern id="scan" width="6" height="4" patternUnits="userSpaceOnUse"><rect width="6" height="1.2" fill="${CY}" fill-opacity=".09"/></pattern>
<mask id="fade" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="url(#fadeg)"/>${fadeHull ? `<path d="${fadeHull}" fill="#000"/>` : ''}</mask>
<radialGradient id="fadeg" cx="50%" cy="78%" r="30%" gradientUnits="objectBoundingBox"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#000"/></radialGradient>
<style>text{font:600 11px ui-monospace,Menlo,Consolas,monospace;fill:#8be9ff;stroke:none;letter-spacing:.06em}text.ax{font-size:12px;fill:#4fffe0}text.sm{font-size:8px;fill:#8be9ff;opacity:.85}text.md{font-size:10.5px;font-weight:700;fill:#b5f3ff}.cf{fill:${CY};fill-opacity:.55}</style>
</defs>
<ellipse cx="${halo[0]}" cy="${H * halo[1]}" rx="${halo[2]}" ry="${H * 0.5}" fill="url(#halo)"/>
<path d="M${b0} ${H - 60} L${b1} 30 L${b2} 30 L${b3} ${H - 60}Z" fill="url(#beam)" opacity=".7" filter="url(#soft)"/>
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
  }
  /** the generated art as a plain object (what scripts/gen-device-art.mjs writes into src/lib/deviceArt/) */
  function result(svgOpts) {
    const round = (o) => Object.fromEntries(Object.entries(o).map(([k, [x, y]]) => [k, [Math.round(x * 10) / 10, Math.round(y * 10) / 10]]));
    return { w: W, h: H, svg: svg(svgOpts), anchors: round(anchors), regions, inputRegions };
  }

  return {
    W, H, V, R, U, P2, raw, fit, pt, poly, smooth, smooth2, tv, facing, L, anchors, regions, inputRegions, anchor, anchor2, region, inputRegion, relPath, text,
    basis, ring3, ellipse, ellipsePts, cylSides, inPlane, hat, button, ministick, wheel, key3, toggle, knob, solid, extrude, lathe, knurl, floor, slide, rocker, rotary, paddle, ovalLathe, keys,
    spineLoft, drawSpineLoft, boxLoft, drawBoxLoft, box, prism, svg, result, d2, occludedLine, inConvex, get S() { return S; },
  };
}
