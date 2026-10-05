// Thrustmaster HOTAS Warthog flight stick: original holographic wireframe (procedural 3D model inspired by the product's shape:
// A-10C style grip with a forward head, hand-rest flange, knurled collar, cylindrical gimbal base on a square plate). No vendor artwork.
// Axes: x forward (trigger side), y up, z = thumb side (left). Seen from behind-left and above, front towards the left (MX = -1).
import { createScene, add, mul, sub, nrm, cross, lerp, grow, hull } from '../holo/scene.mjs';

export default function build() {
  const sc = createScene({ W: 1000, H: 900, MX: -1, AZ: 36, EL: 22 });
  const { L, P2, poly, smooth, smooth2, ellipse, anchor, region, facing } = sc;
  // grip + head: [x, y, a (half depth), b (half width), tilt]
  const KEY = [
    [2, 40, 23, 16.5, 0],
    [0, 62, 22.5, 16, 3],
    [1, 86, 22.5, 16, 3],
    [3, 106, 23, 16.5, 0],
    [6, 124, 24, 17.5, -6],
    [14, 141, 28.5, 20, -14],
    [28, 158, 39, 24.5, -15],
    [42, 175, 51, 29.5, -6],
    [46, 192, 52, 31, 10],
    [42, 206, 45, 30, 27],
    [33, 216, 36, 27.5, 44],
  ];
  const lo = sc.spineLoft(KEY, { pex: 2.6, egg: 0.12 });
  const { surf, surfN, cap, capN, KT } = lo;
  const BY = -104; // top of the plate
  {
    const pts = [];
    for (let i = 0; i <= 30; i++) for (let j = 0; j < 24; j++) pts.push(surf((i / 30) * KT, j * 15));
    for (const t of [0, 90, 180, 270, 45, 135, 225, 315]) { const r = 72, a = (t * Math.PI) / 180; pts.push([r * Math.cos(a), -42, r * Math.sin(a)], [r * Math.cos(a), BY, r * Math.sin(a)]); }
    sc.fit(pts, [300, 700, 34, 760], 'bottom');
  }
  /* ------------------------------------------------ base: cylinder with a bright top ring, collar, knurled ring, neck */
  const baseHull = sc.lathe([0, 0, 0], [[70, BY], [70, BY + 6], [67, BY + 8], [67, -50], [71, -48], [71, -42]], { rings: [1, 2, 4], dash: [3], flutes: 0 });
  /* ------------------------------------------------ plate (thin slab; edges behind the base are hidden) + floor */
  {
    const PX = 100, PZ = 84, T = 4;
    const c = (x, y, z) => [x * PX, y, z * PZ];
    const top = [c(-1, BY, -1), c(1, BY, -1), c(1, BY, 1), c(-1, BY, 1)], bot = top.map(([x, , z]) => [x, BY - T, z]);
    for (let i = 0; i < 4; i++) {
      sc.occludedLine(top[i], top[(i + 1) % 4], [baseHull]);
      const mid = [(top[i][0] + top[(i + 1) % 4][0]) / 2, 0, (top[i][2] + top[(i + 1) % 4][2]) / 2];
      if (facing(nrm(mid))) { sc.occludedLine(bot[i], bot[(i + 1) % 4], [baseHull], L.wire); L.fill.push(`<path d="${poly([top[i], top[(i + 1) % 4], bot[(i + 1) % 4], bot[i]], true)}"/>`); }
    }
    for (let i = 0; i < 4; i++) if (facing(nrm([top[i][0], 0, top[i][2]]))) L.wire.push(`<path d="${poly([top[i], bot[i]])}"/>`);
    L.fill.push(`<path d="${poly(top, true)}"/>`);
    for (const [x, z] of [[-PX + 8, -PZ + 8], [PX - 8, -PZ + 8], [PX - 8, PZ - 8], [-PX + 8, PZ - 8]]) L.wire.push(ellipse([x, BY, z], [0, 1, 0], 2.2));
    // engraved lines on the plate (pilot side)
    for (const [dx, op] of [[14, '.45'], [20, '.3']]) sc.occludedLine([-PX + dx, BY, -PZ + 16], [-PX + dx, BY, PZ - 16], [baseHull], L.wire, ` stroke-opacity="${op}"`);
    // cable leaving the base at the back
    const cab = [[-68, BY + 6, -20], [-86, BY + 3, -26], [-104, BY + 1, -30], [-150, BY, -34]];
    L.wire.push(`<path d="${smooth(cab)}" stroke-width="1.6" stroke-opacity=".6"/>`);
    sc.floor(BY - T - 1, -160, 160, -140, 140);
  }
  // trim ring + screws on the base top
  L.wire.push(ellipse([0, -42, 0], [0, 1, 0], 58, ' stroke-opacity=".7"'), ellipse([0, -42, 0], [0, 1, 0], 44, ' stroke-opacity=".55" stroke-dasharray="4 3"'));
  for (let j = 0; j < 8; j++) { const a = (j / 8) * 2 * Math.PI + 0.3; L.wire.push(ellipse([51 * Math.cos(a), -42, 51 * Math.sin(a)], [0, 1, 0], 1.6)); }
  // vertical seam lines on the cylinder (near side)
  for (const dt of [-60, -20, 20, 60]) { const t = ((sc.tv() + dt) * Math.PI) / 180; L.wire.push(`<path d="${poly([[67 * Math.cos(t), BY + 10, 67 * Math.sin(t)], [67 * Math.cos(t), -52, 67 * Math.sin(t)]])}" stroke-opacity=".35"/>`); }
  // accent light band around the base
  { const t0 = sc.tv(), ps = []; for (let j = 0; j <= 24; j++) { const t = ((t0 - 85 + (170 * j) / 24) * Math.PI) / 180; ps.push([67.5 * Math.cos(t), BY + 14, 67.5 * Math.sin(t)]); } L.accent.push(`<path d="${smooth(ps)}" stroke-width="2"/>`); }
  // boot / collar on the base top, shaft, knurled ring, neck to the grip
  sc.lathe([0, 0, 0], [[34, -42], [33, -38], [29, -34]], { rings: [1] });
  sc.lathe([0, 0, 0], [[9, -34], [9, -26]], {});
  sc.knurl([0, 0, 0], 31, -26, -6, 22);
  sc.lathe([0, 0, 0], [[24, -6], [20, -2], [12, 2], [11, 24]], { rings: [1, 2] });
  /* ------------------------------------------------ hand-rest flange under the grip (rounded slab, longer to the back) */
  {
    const fl = (y, k) => { const ps = []; for (let j = 0; j < 40; j++) { const t = (j / 40) * 2 * Math.PI, c = Math.cos(t), s = Math.sin(t); const e = (v) => Math.sign(v) * Math.abs(v) ** 0.7; ps.push([(c > 0 ? 44 : 56) * k * e(c) - 4, y, 33 * k * e(s)]); } return ps; };
    const top = fl(34, 1), bot = fl(26, 0.96);
    L.fill.push(`<path d="${sc.d2(hull([...top, ...bot].map(P2)))}"/>`);
    L.sil.push(`<path d="${smooth(top, true)}"/>`);
    // visible part of the lower rim
    const vis = bot.map((p) => facing(nrm([p[0] + 4, 0, p[2]])));
    let seg = []; const out = () => { if (seg.length > 1) L.wire.push(`<path d="${smooth(seg)}"/>`); seg = []; };
    bot.forEach((p, i) => { if (vis[i]) seg.push(p); else out(); }); out();
    // rim silhouette (left / right extremes)
    const tp = top.map(P2), bp = bot.map(P2);
    for (const pick of [(a, q) => (q[0] < a[0] ? q : a), (a, q) => (q[0] > a[0] ? q : a)]) { const a = tp.reduce(pick), b = bp.reduce(pick); L.sil.push(`<path d="M${a[0]} ${a[1]}L${b[0]} ${b[1]}"/>`); }
    L.wire.push(`<path d="${smooth(fl(34.2, 0.8), true)}" stroke-opacity=".45" stroke-dasharray="4 3"/>`);
  }
  /* ------------------------------------------------ grip body */
  sc.drawSpineLoft(lo, { rings: [0, 0.8, 1.6, 2.4, 3.2, 4.0, 4.8, 5.6, 6.4, 7.2, 8.0, 8.8, 9.5], flows: 16 });
  // grip side seam (thumb side) and finger grooves at the front
  { const seam = []; for (let i = 0; i <= 30; i++) seam.push(surf(0.3 + (i / 30) * 8.6, 100)); L.wire.push(`<path d="${smooth(seam)}" stroke-opacity=".9" stroke-width="1.3"/>`); }
  for (let s = 0; s < 3; s++) { const k = 1.3 + s * 0.9, a = []; for (let j = 0; j <= 12; j++) a.push(surf(k, -38 + j * 6.3)); L.accent.push(`<path d="${smooth(a)}" stroke-width="1.6"/>`); }
  // head light strip along the panel's rim
  { const strip = lo.capRing(1.0, 0.2, 48).slice(4, 22); L.accent.push(`<path d="${smooth(strip)}" stroke-width="2.6"/>`); }
  // panel border (inset)
  L.wire.push(`<path d="${smooth(lo.capRing(0.9, 0.5, 36), true)}" stroke-dasharray="6 3"/>`);
  /* ------------------------------------------------ head panel: weapon release, trim (8-way), TMS, DMS */
  const N = capN(), FWD = lo.frame(KT).F;
  sc.button('wpn', cap(0.52, 0.5, 0.5), N, 5.8, 3.4, true);
  sc.hat('trim', cap(0.36, -0.36, 0.5), N, 10.5, FWD, { rings: true, h: 3.8 });
  sc.hat('tms', cap(-0.22, 0.5, 0.5), N, 8.6, FWD, { ribs: true });
  sc.hat('dms', cap(-0.52, -0.3, 0.5), N, 8.6, FWD, { cross: true });
  // master mode button on the outer (right) rear corner of the head
  { const k = 9.3, phi = 205; sc.button('mmode', surf(k, phi), surfN(k, phi), 4.4, 3.8); }
  // CMS: 4-way + push on a stem, on the thumb side below the head
  { const k = 5.6, phi = 82; const n = nrm(add(surfN(k, phi), [0.05, 0.45, 0])); sc.hat('cms', surf(k, phi), n, 7.2, [1, 0.3, 0], { stalk: 6, ribs: false }); }
  // nosewheel steering button: front / thumb side, low on the grip
  { const k = 1.0, phi = 40; sc.button('nws', surf(k, phi), surfN(k, phi), 5.2, 4); }
  /* ------------------------------------------------ trigger (two stage) under the head */
  {
    const front = [[60, 166], [69, 157], [74, 145], [73, 134], [68, 126], [61, 123]];
    const back = [[51, 160], [57, 153], [61, 143], [60, 133], [58, 127], [61, 123]];
    const prof = [...front, ...back.slice(0, -1).reverse()];
    const zf = 6, zb = -6;
    const f2 = prof.map(([x, y]) => P2([x, y, zf])), b2 = prof.map(([x, y]) => P2([x, y, zb]));
    L.ctlFill.push(`<path d="${smooth2(f2, true)}" fill="#ff4d6d" fill-opacity=".14"/>`);
    L.back.push(`<path d="${smooth2(b2, true)}"/>`);
    L.red.push(`<path d="${smooth2(f2, true)}"/>`);
    for (const i of [0, 2, 3, 5]) L.red.push(`<path d="${poly([[...prof[i], zf], [...prof[i], zb]])}" stroke-opacity=".7"/>`);
    // travel arc with the two detents
    const arc = []; for (let j = 0; j <= 16; j++) { const t = ((-30 + j * 3.4) * Math.PI) / 180; arc.push([50 + 30 * Math.cos(t), 145 + 30 * Math.sin(t), 9]); }
    L.axis.push(`<path d="${smooth(arc)}" stroke-dasharray="3 3"/>`);
    for (const j of [6, 13]) { const t = ((-30 + j * 3.4) * Math.PI) / 180; L.axis.push(`<path d="${poly([[50 + 26 * Math.cos(t), 145 + 26 * Math.sin(t), 9], [50 + 35 * Math.cos(t), 145 + 35 * Math.sin(t), 9]])}"/>`); }
    anchor('trig', [70, 142, zf]);
    region('trig', grow(hull([...f2, ...b2]), 4));
  }
  /* ------------------------------------------------ pinky lever: long paddle hinged under the flange front, along the grip front */
  {
    const front = [[58, 20], [62, 34], [61, 50], [56, 66], [50, 82], [47, 86]];
    const back = [[52, 22], [55, 35], [54, 50], [50, 64], [45, 79], [47, 86]];
    const prof = [...front, ...back.slice(0, -1).reverse()];
    const z1 = 5, z2 = -5;
    const f2 = prof.map(([x, y]) => P2([x, y, z1])), b2 = prof.map(([x, y]) => P2([x, y, z2]));
    L.ctlFill.push(`<path d="${smooth2(f2, true)}"/>`);
    L.back.push(`<path d="${smooth2(b2, true)}"/>`);
    L.ctl.push(`<path d="${smooth2(f2, true)}"/>`);
    for (const i of [0, 3, 5]) L.ctl.push(`<path d="${poly([[...prof[i], z1], [...prof[i], z2]])}" stroke-opacity=".7"/>`);
    // hinge bracket under the flange
    L.ctl.push(ellipse([55, 21, z1 + 1], [0, 0, 1], 3.2), ellipse([55, 21, z1 + 1], [0, 0, 1], 1.2, ' class="cf"'));
    const blk = [[46, 14, 7], [60, 14, 7], [60, 26, 7], [46, 26, 7]];
    L.wire.push(`<path d="${poly(blk, true)}" stroke-opacity=".7"/>`);
    anchor('pinky', [58, 52, z1]);
    region('pinky', grow(hull([...f2, ...b2]), 4));
  }
  /* ------------------------------------------------ X / Y arrows on the base top (pitch along x, roll along z) */
  {
    const y = -41.5, r0 = 40, r1 = 54, aw = 4.5;
    for (const d of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]]) {
      const a = mul(d, r0), b = mul(d, r1); a[1] = b[1] = y;
      const side = cross(d, [0, 1, 0]);
      L.axis.push(`<path d="${poly([a, b])}"/>`, `<path d="${poly([add(b, add(mul(d, -6), mul(side, aw))), b, add(b, add(mul(d, -6), mul(side, -aw)))])}"/>`);
    }
    sc.text([66, -41.5, 0], 'Y', 'ax', 'middle', 4);
    sc.text([0, -41.5, 64], 'X', 'ax', 'middle', 4);
    anchor('xy', [-36, -41.5, 30]);
    const ring = [...sc.ring3([0, -42, 0], [0, 1, 0], 58, 36), ...sc.ring3([0, -26, 0], [0, 1, 0], 31, 24)].map(P2);
    region('xy', grow(hull(ring), 3));
  }
  void sub; void lerp;
  const fadeHull = sc.d2(hull([[-100, BY - 4, -84], [100, BY - 4, -84], [100, BY - 4, 84], [-100, BY - 4, 84], [-100, BY, -84], [100, BY, -84], [100, BY, 84], [-100, BY, 84]].map(P2)));
  return sc.result({ fadeHull, beam: [250, 395, 605, 750] });
}
