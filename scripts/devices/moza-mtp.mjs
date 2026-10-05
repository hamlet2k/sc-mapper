// MOZA MTP throttle: original holographic wireframe (procedural model inspired by the product's shape: a wedge housing whose panel
// deck rises from a low pilot-side edge (with a light band) to a taller front, panel modules left and right of the centre lever
// gate, and one large helmet-shaped split grip on a tall stem; the thumb side carries the ministick, hats, switches and buttons).
// No vendor artwork. Axes: x forward, y up, z right.
import { buildThrottle, add, nrm, fillet2 } from './kit.mjs';

const BX0 = -104, BX1 = 96, BZ = 84, BY = -78, S = 0.1;
const dy = (x) => S * (x - BX1);   // deck height (0 at the front edge, lower towards the pilot)
export default () => buildThrottle({
  W: 1000, H: 1100, AZ: 46, EL: 26,
  fit: [[BX0, BY, -BZ], [BX1, BY, BZ], [BX0, dy(BX0), BZ], [BX1, 0, -BZ], [-56, 112, -44], [46, 112, 34]],
  fitBox: [200, 800, 170, 950],
  fadeHull: [[BX0, BY, -BZ], [BX1, BY, -BZ], [BX1, BY, BZ], [BX0, BY, BZ], [BX0, dy(BX0), -BZ], [BX1, 0, -BZ], [BX1, 0, BZ], [BX0, dy(BX0), BZ]],
  details(ctx) {
    const { sc, L, UP, poly, ellipse } = ctx;
    // wedge housing (side profile extruded across z, softened edges) + light band on the low pilot-side face
    ctx.slabX(fillet2([[BX0, BY], [BX1, BY], [BX1, 0], [BX0, dy(BX0)]], [4, 4, 6, 6], 2), -BZ, BZ, { bevel: 4 });
    sc.floor(BY - 1, -200, 170, -150, 150);
    for (const y of [BY + 8, BY + 18]) L.accent.push(`<path d="${poly([[BX0 - 0.3, y, -BZ + 8], [BX0 - 0.3, y, BZ - 8]])}" stroke-width="1.6"/>`);
    // panel module seams (deck)
    const dk = (x, z) => [x, dy(x) + 0.2, z];
    for (const [a, b] of [[[BX0 + 6, -28], [BX1 - 6, -28]], [[BX0 + 6, 26], [BX1 - 6, 26]], [[BX0 + 6, -BZ + 6], [BX1 - 6, -BZ + 6]], [[BX0 + 6, BZ - 6], [BX1 - 6, BZ - 6]],
      [[-6, -BZ + 6], [-6, -28]], [[46, -BZ + 6], [46, -28]], [[52, 26], [52, BZ - 6]], [[-52, 26], [-52, BZ - 6]]]) L.wire.push(`<path d="${poly([dk(...a), dk(...b)])}" stroke-opacity=".55"/>`);
    for (const [x, z] of [[BX0 + 10, -BZ + 10], [BX1 - 10, -BZ + 10], [BX1 - 10, BZ - 10], [BX0 + 10, BZ - 10]]) L.wire.push(ellipse(dk(x, z), nrm([-S, 1, 0]), 1.4));
    // centre gate: two sloped tracks
    for (const z of [-9, 9]) L.wire.push(`<path d="${poly([dk(-80, z - 3), dk(70, z - 3), dk(70, z + 3), dk(-80, z + 3)], true)}" stroke-width="1.3"/>`);
    // one large helmet-shaped split grip on a tall stem (left half taller, right half carries the thumb controls)
    const XL = -14, y0 = dy(XL), H = 44;
    const PL = [[-48, 44, 22, 0], [-40, 72, 24, 0], [-20, 90, 25, 0], [4, 94, 25, 0], [26, 86, 24, 0], [40, 66, 22, 0], [46, 44, 19, 0]];
    const PR = [[-46, 42, 17, 0], [-38, 68, 19, 0], [-18, 86, 20, 0], [6, 88, 20, 0], [28, 80, 19, 0], [40, 60, 17, 0], [46, 42, 15, 0]];
    ctx.lever('lthr', { x: XL, z: -9, gz: -20, y0, h: y0 + H, prof: PL, pex: 3, w: 12, d: 4, top: 18, anchorPt: [XL - 10, y0 + 30, -9] });
    const g = ctx.lever('rthr', { x: XL, z: 9, gz: 25, y0, h: y0 + H, prof: PR, pex: 3, w: 12, d: 4, top: 18, anchorPt: [XL - 10, y0 + 30, 9] });
    sc.box(XL - 20, y0, -20, XL + 20, y0 + 8, 20);
    let [p, n] = g.sideAt(XL + 18, 1, 0.3); sc.ministick('mini', p, n, 4.8, { post: 4, spokes: true });
    [p, n] = g.sideAt(XL + 26, 1, 0.82); sc.toggle('s69', p, nrm(add(n, [0, 0.6, 0])), { len: 7, r: 2.6, lean: [0.4, 0, 0] });
    [p, n] = g.sideAt(XL + 4, 1, 0.66); sc.hat('h11', p, nrm(add(n, [0, 0.3, 0])), 5.4, UP, { cross: true });
    [p, n] = g.sideAt(XL - 12, 1, 0.6); sc.hat('h70', p, nrm(add(n, [0, 0.3, 0])), 5, UP, {});
    [p, n] = g.sideAt(XL - 28, 1, 0.25); sc.button('b3', p, n, 3.6, 3);
    [p, n] = g.sideAt(XL - 2, 1, 0.05); sc.button('b4', p, n, 3.6, 3);
    [p, n] = g.sideAt(XL - 16, 1, -0.35); sc.toggle('s5', p, n, { len: 6, r: 2.4, lean: [0.4, 0, 0] });
    [p, n] = g.endFace(true, 0.3, 0.4); sc.slide('slide', p, n, [0, 1, 0], 5, 2.6, 3);
    [p, n] = g.endFace(true, -0.3, 0.1); sc.button('b19', p, n, 3.8, 3);
    // panels (sloped deck): left module toggles / rotaries / knobs, right module light knob, RZ slider, trim, reset
    ctx.panel([
      { t: 'tog', id: 'lgen', at: [74, -76], label: 'L GEN' }, { t: 'tog', id: 's24', at: [74, -54], lean: [0, 0, 0] },
      { t: 'tog', id: 'rgen', at: [74, -34], label: 'R GEN' },
      { t: 'tog', id: 's29', at: [50, -76], lean: [0, 0, 0] }, { t: 'tog', id: 's31', at: [50, -54] }, { t: 'tog', id: 's33', at: [50, -34] },
      { t: 'rot', id: 'rot4', at: [24, -72], r: 4.6, pos: 4, a0: -60, a1: 60 }, { t: 'rot', id: 'rot8', at: [24, -44], r: 5, pos: 8, a0: -105, a1: 105, sel: 3 },
      { t: 'knob', id: 'form', at: [-2, -72], r: 4.6, label: 'FORM' }, { t: 'knob', id: 'pos', at: [-2, -44], r: 4.6, label: 'POS' },
      { t: 'tog', id: 'probe', at: [-28, -72], lean: [0, 0, 0], label: 'PROBE' }, { t: 'tog', id: 'apu', at: [-28, -44], label: 'APU' },
      { t: 'tog', id: 'crank', at: [-54, -72], lean: [0, 0, 0], label: 'CRANK' }, { t: 'tog', id: 'strobe', at: [-54, -44], label: 'STROBE' },
      { t: 'tog', id: 'intr', at: [-80, -58], label: 'INTR WING' },
      { t: 'knob', id: 'light', at: [74, 56], r: 6, label: 'LIGHT' },
      { t: 'slide', id: 'rzs', at: [16, 56], u: [1, 0, 0], len: 14, wid: 3.4 },
      { t: 'knob', id: 'rtrim', at: [-30, 66], r: 5, label: 'RUD TRIM' }, { t: 'btn', id: 'reset', at: [-30, 42], label: 'RESET' },
    ], { slope: S, x0: BX1 });
    ctx.label(dk(40, 64), 'MAX'); ctx.label(dk(-6, 64), 'MIN');
  },
});
