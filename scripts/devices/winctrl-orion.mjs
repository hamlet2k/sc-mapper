// WinCtrl Orion 2 throttle base with the F-15EX grips and the F/A-18 panel: original holographic wireframe (procedural model inspired
// by the product's shape: long, narrow metal base on a bolt plate, a raised centre spine with the lever gate, panel modules around it
// (F/A-18 panel at the rear, side modules left and right), a tall lever bracket carrying the two wide, block-shaped F-15EX grips side by
// side; the pilot-facing faces carry hats / ministick, the right grip's outboard end the large wheel). No vendor artwork.
// Axes: x forward, y up, z right.
import { buildThrottle, fillet2 } from './kit.mjs';

const BX0 = -150, BX1 = 110, BZ = 76, BY = -58, GY = 112;
export default () => buildThrottle({
  W: 1000, H: 1100, AZ: 34, EL: 26,
  fit: [[BX0, BY, -BZ], [BX1, BY, BZ], [BX0, 0, BZ], [BX1, 0, -BZ], [-34, GY + 60, -80], [34, GY + 60, 74]],
  fitBox: [190, 810, 160, 960],
  fadeHull: [[BX0, BY, -BZ], [BX1, BY, -BZ], [BX1, BY, BZ], [BX0, BY, BZ], [BX0, 0, -BZ], [BX1, 0, -BZ], [BX1, 0, BZ], [BX0, 0, BZ]],
  details(ctx) {
    const { sc, L, UP, poly, ellipse } = ctx;
    // bolt plate, long body, logo block at the rear, raised centre spine
    ctx.plate(BX0 - 10, BX1 + 10, -BZ - 8, BZ + 8, BY, 3, { cut: 6 });
    ctx.slabY(fillet2([[BX0, -BZ], [BX1, -BZ], [BX1, BZ], [BX0, BZ]], 6, 2), BY, 0, { top: 3 });
    ctx.slabY([[BX0 - 8, -48], [BX0, -48], [BX0, 18], [BX0 - 8, 18]], BY + 6, -14, {});
    ctx.slabY([[-84, -28], [84, -28], [84, 28], [-84, 28]], 0, 5, { top: 1.5 });
    sc.floor(BY - 4, -220, 180, -150, 150);
    // panel module seams + screws
    ctx.seams([[[BX0 + 4, -BZ + 4], [BX0 + 4, BZ - 4]], [[-92, -BZ + 4], [-92, BZ - 4]], [[-92, -30], [BX1 - 4, -30]], [[-92, 30], [BX1 - 4, 30]],
      [[64, -BZ + 4], [64, -30]], [[64, 30], [64, BZ - 4]], [[BX1 - 4, -BZ + 4], [BX1 - 4, BZ - 4]]], 0);
    for (const [x, z] of [[-146, -72], [-146, 72], [-96, -72], [-96, 72], [-88, -34], [-88, 34], [60, -72], [60, 72], [106, -72], [106, 72]]) L.wire.push(ellipse([x, 0.15, z], UP, 1.4));
    // lever gate: two tracks on the spine, a sliding carriage
    for (const z of [-12, 12]) ctx.slot(-74, 74, z, 5, 3, 8);
    const XL = -6;
    sc.box(XL - 18, 5, -22, XL + 18, 14, 22);
    // tall bracket: two broad posts, a cross yoke under the grips
    const PA = [[-34, 34, 34, 0], [-28, 52, 38, 0], [-14, 60, 39, 0], [12, 60, 39, 0], [27, 52, 38, 0], [34, 38, 34, 0]];
    const PB = [[-34, 34, 33, 0], [-28, 52, 36, 0], [-14, 60, 37, 0], [12, 60, 37, 0], [27, 52, 36, 0], [34, 38, 33, 0]];
    const gA = ctx.lever('lthr', { x: XL, z: -10, gz: -40, y0: 14, h: GY - 14, prof: PA, pex: 7, w: 12, d: 5, top: 18, anchorPt: [XL - 12, 60, -10] });
    const gB = ctx.lever('rthr', { x: XL, z: 10, gz: 36, y0: 14, h: GY - 14, prof: PB, pex: 7, w: 12, d: 5, top: 18, anchorPt: [XL - 12, 60, 10] });
    void gA; void gB;
    sc.box(XL - 16, GY - 26, -64, XL + 16, GY, 60);
    for (const z of [-64, 60]) sc.box(XL - 10, GY - 50, z - 1, XL + 10, GY - 26, z + 3);
    // finger lifts on the posts (1, 2, 30, 31)
    { const o1 = sc.button(null, [XL - 9, 48, -10], [-1, 0, 0], 2.6, 2), o2 = sc.button(null, [XL - 9, 60, -10], [-1, 0, 0], 2.6, 2), o3 = sc.button(null, [XL - 9, 48, 10], [-1, 0, 0], 2.6, 2), o4 = sc.button(null, [XL - 9, 60, 10], [-1, 0, 0], 2.6, 2);
      sc.anchor('lbtn', [XL - 12, 40, 0]); sc.region('lbtn', o1, o2, o3, o4); sc.inputRegion('lbtn', [o1, o2, o3, o4]); }
    // right grip (B): pilot-facing face carries the hats / ministick / button; top: 3-way switch; outboard end: big wheel + slide
    const g = (gr, end, u, w) => gr.endFace(end, u, w);
    let [p, n] = g(gB, false, -0.55, 0.45); sc.hat('h6', p, n, 5, UP, { cross: true });
    [p, n] = g(gB, false, -0.05, 0.5); sc.ministick('mini', p, n, 4.6, { post: 4, spokes: true });
    [p, n] = g(gB, false, 0.5, 0.45); sc.hat('h28', p, n, 4.6, UP, { cross: true });
    [p, n] = g(gB, false, -0.5, -0.35); sc.button('b11', p, n, 3.6, 3);
    [p, n] = g(gB, false, 0.0, -0.35); sc.hat('h12', p, n, 4.4, UP, {});
    [p, n] = g(gB, false, 0.5, -0.35); sc.hat('h17', p, n, 4.4, UP, { ribs: true });
    [p, n] = gB.at(XL - 4, 90); sc.toggle('sw3', p, n, { len: 7, r: 2.6, lean: [0.4, 0, 0] });
    [p, n] = gB.sideAt(XL - 2, 1, 0.1); sc.knob('wh5', p, n, 13, 8);
    [p, n] = gB.sideAt(XL + 18, 1, -0.55); sc.slide('slide', p, n, [1, 0, 0], 6, 2.6, 3);
    [p, n] = g(gB, true, 0.3, 0.2); sc.wheel('zw', p, n, [0, 0, 1], 5, 6);
    // left grip (A): face buttons + hat; top toggle; inboard-side RZ wheel
    [p, n] = g(gA, false, -0.5, 0.45); sc.hat('h51', p, n, 5, UP, { cross: true });
    [p, n] = g(gA, false, 0.1, 0.45); sc.button('b50', p, n, 4, 3);
    [p, n] = g(gA, false, -0.2, -0.35); sc.button('b56', p, n, 3.6, 3);
    [p, n] = gA.at(XL - 4, 100); sc.toggle('t57', p, n, { len: 7, r: 2.6, lean: [0.4, 0, 0] });
    [p, n] = gA.sideAt(XL + 4, -1, 0.3); sc.wheel('rz', p, n, [0, 0, 1], 6, 5);
    // panels: F/A-18 module at the rear, left module (master arm / jettison / A-G A-A / heading), right module (wheels, knobs)
    ctx.panel([
      { t: 'tog', id: 'lbar', at: [-134, -52], label: 'L-BAR' }, { t: 'tog', id: 'hook', at: [-134, -26], label: 'HOOK' },
      { t: 'rot', id: 'wfold', at: [-134, 0], r: 4.6, pos: 3, a0: -50, a1: 50, sel: 1, label: 'WING' },
      { t: 'tog', id: 'gear', at: [-134, 26], len: 15, r: 4.6, label: 'GEAR' }, { t: 'tog', id: 'pbrk', at: [-134, 52], label: 'BRAKE' },
      { t: 'rot', id: 'flap', at: [-108, -52], r: 4.6, pos: 3, a0: -50, a1: 50, sel: 1, label: 'FLAP' },
      { t: 'knob', id: 'hmd', at: [-108, -26], r: 4.6, label: 'HMD' }, { t: 'tog', id: 'roll', at: [-108, 0], label: 'ROLL' },
      { t: 'tog', id: 'pitch', at: [-108, 26], label: 'PITCH' }, { t: 'btn', id: 'adv', at: [-108, 52], label: 'ADV' },
      { t: 'tog', id: 'marm', at: [-72, -54], guard: true, label: 'ARM' }, { t: 'red', id: 'jett', at: [-44, -54], r: 5.4, label: 'JETT' },
      { t: 'group', id: 'aga', label: '· A/G · A/A', parts: [{ t: 'btn', at: [-16, -60], r: 3.6 }, { t: 'btn', at: [-16, -48], r: 3.6 }, { t: 'btn', at: [2, -54], r: 3.6 }] },
      { t: 'knob', id: 'hdg', at: [36, -54], r: 4.6, label: 'HDG' },
      { t: 'wheel', id: 'sldw', at: [-72, 54], axis: [0, 0, 1], r: 5, w: 6, label: 'SLDR' }, { t: 'wheel', id: 'dialw', at: [-44, 54], axis: [0, 0, 1], r: 5, w: 6, label: 'DIAL' },
      { t: 'knob', id: 'crs', at: [0, 54], r: 4.6, label: 'CRS' }, { t: 'knob', id: 'lts', at: [36, 54], r: 4.6, label: 'LTS' },
    ]);
    // front module vents
    for (let i = 0; i < 6; i++) { const z = -60 + i * 8; L.wire.push(`<path d="${poly([[74, 0.2, z], [100, 0.2, z]])}" stroke-opacity=".45"/>`); }
  },
});
