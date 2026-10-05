// WinCtrl URSA MINOR throttle with the Combat grip: original holographic wireframe (procedural model inspired by the product's
// shape: a long, narrow base laid across the desk, a row of panel modules along the pilot edge (mode / encoders, 2x4 keys, rockers,
// the START / SW module with two big trim wheels and the large rudder-trim knob), an arched quadrant behind with the twin lever
// slots, and the large combat grip: a tall textured left half and a right half whose thumb face carries hats, a ministick and knobs).
// No vendor artwork. Axes: x forward, y up, z right.
import { buildThrottle, add, nrm, fillet2 } from './kit.mjs';

const BX0 = -70, BX1 = 66, BZ0 = -132, BZ1 = 128, BY = -44, GY = 70;
export default () => buildThrottle({
  W: 1000, H: 1000, AZ: 52, EL: 28,
  fit: [[BX0, BY, BZ0], [BX1, BY, BZ1], [BX0, BY, BZ1], [BX1, BY, BZ0], [-40, GY + 104, -86], [44, GY + 94, 20]],
  fitBox: [180, 820, 140, 860],
  fadeHull: [[BX0, BY, BZ0], [BX1, BY, BZ0], [BX1, BY, BZ1], [BX0, BY, BZ1], [BX0, 0, BZ0], [BX1, 0, BZ0], [BX1, 0, BZ1], [BX0, 0, BZ1]],
  details(ctx) {
    const { sc, L, UP, poly, ellipse } = ctx;
    // long narrow base, module seams + screws, raised START / SW module on the right
    ctx.slabY(fillet2([[BX0, BZ0], [BX1, BZ0], [BX1, BZ1], [BX0, BZ1]], 5, 2), BY, 0, { top: 2.5 });
    sc.floor(BY - 1, -150, 140, -220, 210);
    ctx.seams([[[BX0 + 4, -80], [BX1 - 4, -80]], [[-8, -80], [-8, 64]], [[BX0 + 4, 0], [-8, 0]], [[BX0 + 4, 62], [BX1 - 4, 62]]], 0);
    for (const [x, z] of [[BX0 + 8, BZ0 + 8], [BX1 - 8, BZ0 + 8], [BX1 - 8, BZ1 - 8], [BX0 + 8, BZ1 - 8], [BX0 + 8, -84], [BX0 + 8, 60], [BX1 - 8, -84], [BX1 - 8, 60]]) L.wire.push(ellipse([x, 0.15, z], UP, 1.4));
    ctx.slabY([[-64, 66], [40, 66], [40, 124], [-64, 124]], 0, 10, { top: 2 });
    // arched quadrant housing behind the keys, twin slots + detent gates
    const arc = []; for (let i = 0; i <= 8; i++) { const a = (i / 8) * Math.PI; arc.push([24 - 34 * Math.cos(a), Math.max(0, 30 * Math.sin(a))]); }
    ctx.slabX(arc, -62, 4, { bevel: 3 });
    for (const z of [-42, -18]) { const ps = []; for (let i = 1; i < 8; i++) { const a = (i / 8) * Math.PI; ps.push([24 - 34.4 * Math.cos(a), 30.4 * Math.sin(a), z]); } L.wire.push(`<path d="${poly(ps)}" stroke-width="2.4" stroke-opacity=".8"/>`); }
    const gate = (id, z) => { sc.anchor(id, [-8, 14, z]); sc.region(id, sc.ellipsePts([-8, 14, z], nrm([-1, 1, 0]), 6)); };
    gate('detl', -42); gate('detr', -18);
    ctx.label([-12, 8, -54], 'IDLE / OFF');
    // levers + combat grip (left half tall with a raised rear hump, right half carries the thumb face)
    const XL = 20;
    const PL = [[-52, 70, 23, 0], [-42, 98, 25, 0], [-22, 104, 26, 0], [4, 96, 26, 0], [26, 84, 25, 0], [42, 66, 23, 0], [50, 46, 20, 0]];
    const PR = [[-50, 46, 22, 0], [-40, 74, 24, 0], [-16, 92, 25, 0], [10, 94, 25, 0], [32, 84, 24, 0], [46, 64, 22, 0], [52, 46, 19, 0]];
    ctx.lever('lthr', { x: XL, z: -42, gz: -58, y0: 24, h: GY, prof: PL, pex: 3.6, w: 10, d: 4, top: 14, anchorPt: [XL - 12, 44, -42] });
    const g = ctx.lever('rthr', { x: XL, z: -18, gz: -7, y0: 24, h: GY, prof: PR, pex: 3.6, w: 10, d: 4, top: 14, anchorPt: [XL - 12, 44, -18] });
    // finger lifts on the lever posts
    { const o1 = sc.button(null, [XL - 10, 46, -42], [-1, 0.2, 0], 2.8, 2), o2 = sc.button(null, [XL - 10, 46, -18], [-1, 0.2, 0], 2.8, 2); sc.anchor('lift', [XL - 12, 46, -30]); sc.region('lift', o1, o2); sc.inputRegion('lift', [o1, o2]); }
    // combat grip thumb face (+z) and top
    let p, n;
    { const os = [[XL + 22, 0.85], [XL + 10, 0.9], [XL - 2, 0.9]].map(([x, w]) => { [p, n] = g.sideAt(x, 1, w); return sc.button(null, p, nrm(add(n, [0, 0.7, 0])), 3, 2.6); });
      sc.anchor('b27', add(p, [6, 4, 0])); sc.region('b27', ...os); sc.inputRegion('b27', os); }
    [p, n] = g.sideAt(XL - 18, 1, 0.78); sc.knob('knob30', p, nrm(add(n, [0, 0.6, 0])), 4.4, 3.4);
    [p, n] = g.sideAt(XL - 30, 1, 0.4); sc.toggle('tog33', p, n, { len: 7, r: 2.6, lean: [0, 0.4, 0] });
    [p, n] = g.sideAt(XL + 4, 1, 0.55); sc.hat('h36', p, nrm(add(n, [0, 0.3, 0])), 5.6, UP, { cross: true });
    [p, n] = g.sideAt(XL - 12, 1, 0.25); sc.hat('h41', p, n, 5, UP, {});
    [p, n] = g.sideAt(XL + 4, 1, 0.0); sc.hat('h46', p, n, 5, UP, { ribs: true });
    [p, n] = g.sideAt(XL + 22, 1, 0.3); sc.ministick('mini', p, n, 4.8, { post: 4, spokes: true });
    [p, n] = g.endFace(true, 0.4, 0.6); sc.knob('rzk', p, nrm(add(n, [0, 0.8, 0])), 6, 5);
    [p, n] = g.endFace(true, -0.3, 0.2); sc.wheel('zw', p, n, [0, 1, 0], 4.4, 5);
    [p, n] = g.sideAt(XL - 22, 1, -0.4); sc.wheel('thw', p, n, [1, 0, 0], 4.4, 5);
    // pilot-edge modules: MODE + encoders (left), keys B1-B8, rockers; right: START / SW, trim wheels, rudder-trim knob
    ctx.panel([
      { t: 'rot', id: 'mode', at: [-18, -110], r: 6, pos: 3, a0: -45, a1: 45, sel: 1, label: 'MODE', lx: -14 },
      { t: 'knob', id: 'enc1', at: [-50, -116], r: 4.6, h: 7, label: 'ENC 1', lx: -12 }, { t: 'knob', id: 'enc2', at: [-50, -94], r: 4.6, h: 7, label: 'ENC 2', lx: -12 },
      { t: 'group', id: 'keys', label: 'B1-B8', lx: -14, parts: [[-24, -70], [-24, -52], [-24, -34], [-24, -16], [-48, -70], [-48, -52], [-48, -34], [-48, -16]].map((at) => ({ t: 'key', at, w: 6, hh: 4.4, u: [0, 0, 1] })) },
      { t: 'rock', id: 'rk1', at: [-30, 18], u: [1, 0, 0], len: 7, wid: 5, label: 'SW8' }, { t: 'rock', id: 'rk2', at: [-30, 42], u: [1, 0, 0], len: 7, wid: 5, label: 'SW11' },
      { t: 'rot', id: 'rudt', at: [32, 22], r: 10, pos: 3, a0: -40, a1: 40, sel: 1, label: 'ROT TRIM', lx: -16 },
    ]);
    ctx.panel([
      { t: 'red', id: 'start', at: [24, 112], r: 4.6, label: 'START' },
      { t: 'tog', id: 'sw1', at: [4, 90], label: 'SW1-3' }, { t: 'tog', id: 'sw4', at: [-24, 76], label: 'SW4-6' },
    ], { y: 10 });
    sc.wheel('xw', [-52, 10, 86], UP, [1, 0, 0], 12, 9);
    sc.wheel('yw', [-52, 10, 108], UP, [1, 0, 0], 12, 9);
    ctx.label([-76, 2, 97], 'X  Y');
  },
});
