// MOZA MTQ throttle quadrant: original holographic wireframe (procedural model inspired by the product's shape: a deep box base,
// keypad and knob modules on the pilot-side half, a quadrant of four curved lever housings on the front half (speedbrake, twin
// throttles, flaps), and one wide hammerhead grip on a tall centre stem with hats on its outboard end and a ministick on the front).
// No vendor artwork. Axes: x forward, y up, z right.
import { buildThrottle, add, nrm, fillet2 } from './kit.mjs';

const BX0 = -112, BX1 = 82, BZ = 72, BY = -74, GY = 78;
export default () => buildThrottle({
  W: 1000, H: 1100, AZ: 62, EL: 24,
  fit: [[BX0, BY, -BZ], [BX1, BY, BZ], [BX0, 0, BZ], [BX1, 0, -BZ], [-20, GY + 56, -70], [20, GY + 56, 66]],
  fitBox: [210, 790, 160, 950],
  fadeHull: [[BX0, BY, -BZ], [BX1, BY, -BZ], [BX1, BY, BZ], [BX0, BY, BZ], [BX0, 0, -BZ], [BX1, 0, -BZ], [BX1, 0, BZ], [BX0, 0, BZ]],
  details(ctx) {
    const { sc, L, UP, poly, ellipse } = ctx;
    // deep box base, lip, accent band on the pilot-side face
    ctx.slabY(fillet2([[BX0, -BZ], [BX1, -BZ], [BX1, BZ], [BX0, BZ]], 6, 2), BY, 0, { top: 3 });
    sc.floor(BY - 1, -200, 160, -150, 150);
    L.accent.push(`<path d="${poly([[BX0 - 0.3, BY + 18, 6], [BX0 - 0.3, BY + 18, 58]])}" stroke-width="1.8"/>`);
    ctx.seams([[[BX0 + 5, -BZ + 5], [BX0 + 5, BZ - 5]], [[-28, -BZ + 5], [-28, BZ - 5]], [[BX0 + 5, 0], [-28, 0]], [[BX0 + 5, -BZ + 5], [-28, -BZ + 5]], [[BX0 + 5, BZ - 5], [-28, BZ - 5]]], 0);
    for (const [x, z] of [[BX0 + 9, -BZ + 9], [BX0 + 9, -4], [BX0 + 9, 4], [BX0 + 9, BZ - 9], [-32, -BZ + 9], [-32, BZ - 9]]) L.wire.push(ellipse([x, 0.15, z], UP, 1.4));
    // quadrant: four curved lever housings (quarter drums across z) on the front half
    const arc = []; for (let i = 0; i <= 8; i++) { const a = (i / 8) * Math.PI; arc.push([24 - 44 * Math.cos(a), 22 * Math.sin(a)]); }
    for (const [z0, z1] of [[-66, -42], [-34, -4], [4, 34], [42, 66]]) ctx.slabX(arc.map(([x, y]) => [x, Math.max(0, y)]), z0, z1, { bevel: 2 });
    for (const z of [-54, -19, 19, 54]) { const ps = []; for (let i = 1; i < 8; i++) { const a = (i / 8) * Math.PI; ps.push([24 - 44.4 * Math.cos(a), 22.4 * Math.sin(a), z]); } L.wire.push(`<path d="${poly(ps)}" stroke-width="2.2" stroke-opacity=".8"/>`); }
    // speedbrake (left) and flaps (right): short levers with paddle heads
    const small = (id, x, z, h, w) => {
      const a = ctx.arm(x, z, 18, h, { w: 3, d: 2, top: 4 });
      const kn = sc.prism([[x - 4, h, z - w], [x + 10, h, z - w], [x + 10, h, z + w], [x - 4, h, z + w]], [[x - 8, h + 16, z - w], [x + 2, h + 16, z - w], [x + 2, h + 16, z + w], [x - 8, h + 16, z + w]]);
      ctx.leverRegion(id, [x, h + 10, z], [a, kn]);
    };
    small('spbrk', 4, -54, 40, 6);
    small('flaps', 14, 54, 30, 8);
    ctx.label([-14, 2, -54], 'SPD BRK'); ctx.label([-14, 2, 54], 'FLAPS');
    // hammerhead grip on a tall centre stem: left half (front ministick + buttons), right half (outboard hats, front slide)
    const XL = 12;
    const PL = [[-20, 30, 34, 0], [-15, 46, 38, 0], [-4, 56, 39, 0], [8, 54, 38, 0], [16, 44, 36, 0], [20, 30, 33, 0]];
    const PR = [[-20, 28, 24, 0], [-15, 44, 27, 0], [-4, 52, 28, 0], [8, 50, 27, 0], [16, 40, 25, 0], [20, 28, 23, 0]];
    const gL = ctx.lever('lthr', { x: XL, z: -5, gz: -30, y0: 18, h: GY, prof: PL, pex: 3.4, w: 10, d: 4, top: 14, anchorPt: [XL - 10, 50, -5] });
    const gR = ctx.lever('rthr', { x: XL, z: 5, gz: 37, y0: 18, h: GY, prof: PR, pex: 3.4, w: 10, d: 4, top: 14, anchorPt: [XL - 10, 50, 5] });
    let [p, n] = gR.sideAt(XL + 6, 1, 0.45); sc.hat('h56', p, nrm(add(n, [0, 0.2, 0])), 5.6, UP, { cross: true });
    [p, n] = gR.sideAt(XL - 8, 1, -0.2); sc.hat('h61', p, n, 5.2, UP, {});
    [p, n] = gR.endFace(true, 0.1, 0.3); sc.slide('slide', p, n, [0, 1, 0], 5, 2.6, 3);
    [p, n] = gL.endFace(true, -0.1, 0.4); sc.ministick('mini', p, n, 4.6, { post: 4, spokes: true });
    { const os = [[0.5, 0.45], [0.5, -0.2], [-0.5, -0.2]].map(([u, w]) => { [p, n] = gL.endFace(true, u, w); return sc.button(null, p, n, 3.2, 2.6); }); sc.anchor('b63', add(p, [4, 0, 0])); sc.region('b63', ...os); sc.inputRegion('b63', os); }
    // pilot-side modules: keypad (left), knobs / rotary / toggles (right)
    ctx.panel([
      { t: 'group', id: 'a14', label: 'A1-A4', lx: -12, parts: [-94, -78, -62, -46].map((x) => ({ t: 'key', at: [x, -58], w: 4.6, hh: 4, u: [0, 0, 1] })) },
      { t: 'group', id: 'k510', label: '5-10', lx: -14, parts: [[-90, -38], [-90, -20], [-72, -38], [-72, -20], [-54, -38], [-54, -20]].map((at) => ({ t: 'key', at, w: 5.4, hh: 4.4, u: [0, 0, 1] })) },
      { t: 'knob', id: 'enc1', at: [-58, 16], r: 5, label: 'ENC 1', lx: -13 }, { t: 'knob', id: 'enc2', at: [-58, 38], r: 5, label: 'ENC 2', lx: -13 },
      { t: 'rot', id: 'rot5', at: [-58, 58], r: 5, pos: 5, a0: -80, a1: 80, sel: 2 },
      { t: 'tog', id: 's3', at: [-92, 16], lean: [0, 0, 0] },
      { t: 'tog', id: 't25', at: [-92, 32] }, { t: 'tog', id: 't27', at: [-92, 46] }, { t: 'tog', id: 't29', at: [-92, 60] },
    ]);
  },
});
