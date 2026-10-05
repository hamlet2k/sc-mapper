// VIRPIL VPC VMAX Prime throttle: original holographic wireframe (procedural model inspired by the product's shape: a long, low base
// on four splayed corner feet, the control panel on the pilot-side half (APU selector, 2x3 keypad, jettison button, encoders,
// toggles), a raised lever gate on the front half, and two horizontal, drum-shaped grips side by side across the top: the left one
// ends in a large knurled wheel, the right one in a rounded control end with hats and a ministick). No vendor artwork.
// Axes: x forward, y up, z right.
import { buildThrottle, fillet2 } from './kit.mjs';

const BX0 = -112, BX1 = 100, BZ = 70, BY = -36, FY = -46;
const XC = 40, YC = 86, R = 30;   // grip drum axis (along z) and radius
export default () => buildThrottle({
  W: 1000, H: 1050, AZ: 40, EL: 28,
  fit: [[BX0 - 14, FY, -BZ - 14], [BX1 + 14, FY, BZ + 14], [BX0 - 14, FY, BZ + 14], [BX1 + 14, FY, -BZ - 14], [XC, YC + R, -92], [XC, YC + R, 84]],
  fitBox: [200, 800, 150, 930],
  fadeHull: [[BX0, FY, -BZ], [BX1, FY, -BZ], [BX1, FY, BZ], [BX0, FY, BZ], [BX0, 0, -BZ], [BX1, 0, -BZ], [BX1, 0, BZ], [BX0, 0, BZ]],
  details(ctx) {
    const { sc, L, UP, poly, ellipse } = ctx;
    // base box (bevelled top edge), four splayed feet, panel bezel, raised gate module
    ctx.slabY(fillet2([[BX0, -BZ], [BX1, -BZ], [BX1, BZ], [BX0, BZ]], 4, 2), BY, 0, { top: 3 });
    for (const [x, z, dx, dz] of [[BX0 + 6, -BZ + 6, -1, -1], [BX1 - 6, -BZ + 6, 1, -1], [BX1 - 6, BZ - 6, 1, 1], [BX0 + 6, BZ - 6, -1, 1]]) ctx.foot(x, z, dx, dz, FY, BY + 14);
    sc.floor(FY - 1, -220, 180, -160, 160);
    L.wire.push(`<path d="${poly([[BX0 + 5, 0.15, -BZ + 5], [-12, 0.15, -BZ + 5], [-12, 0.15, BZ - 5], [BX0 + 5, 0.15, BZ - 5]], true)}" stroke-opacity=".55"/>`);
    ctx.slabY([[-6, -40], [96, -40], [96, 40], [-6, 40]], 0, 6, { top: 1.5 });
    for (const z of [-14, 14]) ctx.slot(4, 88, z, 6, 3, 6);
    for (const [x, z] of [[BX0 + 9, -BZ + 9], [BX0 + 9, BZ - 9], [-16, -BZ + 9], [-16, BZ - 9]]) L.wire.push(ellipse([x, 0.15, z], UP, 1.4));
    // carriage + posts up to the grips
    sc.box(XC - 22, 6, -26, XC + 22, 16, 26);
    const circ = (r, n = 20) => Array.from({ length: n }, (_, i) => { const a = (i / n) * 2 * Math.PI; return [XC + r * Math.cos(a), YC + r * Math.sin(a)]; });
    const post = (z) => ctx.arm(XC, z, 16, YC - R + 4, { w: 9, d: 4, top: 13 });
    const aL = post(-14), aR = post(14);
    // left drum (z -66..-8) with a big knurled end wheel; right drum (z 6..58) with a rounded control end
    const dL = ctx.slabX(circ(R), -78, -6, { bevel: 5 });
    const dR = ctx.slabX(circ(R), 6, 62, { bevel: 5 });
    const eR = ctx.slabX(circ(R + 3), 62, 78, { bevel: 6 });
    for (const z of [-66, -56, -46, -36, -26, -16, 16, 26, 36, 46, 54]) { const ps = []; for (let i = 0; i <= 10; i++) { const a = Math.PI * (0.5 + i / 10); ps.push([XC + (R + 0.3) * Math.cos(a), YC + (R + 0.3) * Math.sin(a), z]); } L.accent.push(`<path d="${poly(ps)}" stroke-width="1.2" stroke-opacity=".55"/>`); }
    ctx.leverRegion('lthr', [XC - 10, 50, -14], [aL, dL.outline]);
    ctx.leverRegion('rthr', [XC - 10, 50, 14], [aR, dR.outline, eR.outline]);
    const rear = (dy, z) => [[XC - Math.sqrt(R * R - dy * dy), YC + dy, z], [-Math.sqrt(R * R - dy * dy) / R, dy / R, 0]];
    // right grip: 17 (top knob of the end), hat 10-14 + ministick + 16 on the end face, hat 18-22 on the pilot-facing side
    sc.button('b17', [XC, YC + R + 3, 70], UP, 7, 5);
    sc.hat('h10', [XC - 9, YC + 9, 78], [0, 0, 1], 5.2, UP, { cross: true });
    sc.ministick('mini', [XC - 9, YC - 10, 78], [0, 0, 1], 4.6, { post: 4, spokes: true });
    sc.button('b16', [XC + 11, YC, 78], [0, 0, 1], 3.6, 3);
    let [p, n] = rear(2, 50); sc.hat('h18', p, n, 5, UP, {});
    // left grip: big end wheel 9 + DL, hat 4-8 / buttons 3 and 1 on the pilot side, rotary 2 on top, paddle (RZ) underneath
    sc.knob('wl9', [XC, YC, -78], [0, 0, -1], 18, 7);
    [p, n] = rear(6, -62); sc.hat('h4', p, n, 4.8, UP, { cross: true });
    [p, n] = rear(-10, -46); sc.button('b3', p, n, 3.6, 3);
    [p, n] = rear(-10, -30); sc.button('b1', p, n, 3.6, 3);
    sc.knob('rot2', [XC - 6, YC + R, -46], UP, 4, 3.4);
    sc.paddle('paddle', [XC + 6, YC - R + 2, -38], [1, 0, 0], [0, -1, 0], [0, 0, 1], [[0, 0], [10, 2], [16, 10], [12, 16], [2, 8]], 8, { edges: [0, 2] });
    // decorative fin lever on the gate (right)
    sc.prism([[66, 6, 30], [80, 6, 30], [80, 6, 36], [66, 6, 36]], [[58, 26, 30], [66, 30, 30], [66, 30, 36], [58, 26, 36]]);
    // pilot-side panel
    ctx.panel([
      { t: 'rot', id: 'apu', at: [-100, -48], r: 5.6, pos: 5, a0: -80, a1: 80, label: 'APU', lx: -14 },
      { t: 'btn', id: 'apub', at: [-100, -24], r: 4.4, label: 'START', lx: -12 },
      { t: 'group', id: 'keys', label: 'KEYS', lx: -14, parts: [[-72, -50], [-72, -34], [-72, -18], [-52, -50], [-52, -34], [-52, -18]].map((at) => ({ t: 'key', at, w: 6, hh: 4.6, u: [0, 0, 1] })) },
      { t: 'red', id: 'jett', at: [-34, 4], r: 6, label: 'JETT', lx: -14 },
      { t: 'tog', id: 't1', at: [-34, 32], label: 'T1', lx: -10 }, { t: 'tog', id: 't2', at: [-34, 52], label: 'T2', lx: -10 },
      { t: 'tog', id: 't3', at: [-102, 20], label: 'T3', lx: -10 }, { t: 'tog', id: 't4', at: [-102, 38], label: 'T4', lx: -10 },
      { t: 'tog', id: 't5', at: [-102, 56], label: 'T5', lx: -10 },
      { t: 'knob', id: 'e1', at: [-68, 14], r: 5.4, label: 'E1', lx: -12 }, { t: 'knob', id: 'e2', at: [-68, 44], r: 5.4, label: 'E2', lx: -12 },
    ]);
  },
});
