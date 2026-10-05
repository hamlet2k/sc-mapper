// Logitech G X56 H.O.T.A.S. throttle: original holographic wireframe (procedural model inspired by the product's shape: wide base
// with a toggle bank and two rotaries, twin split levers, the left grip carrying a ministick, two hats, rotaries, a slider and a
// thumb button). No vendor artwork. Axes: x forward, y up, z right.
import { buildThrottle, add, nrm, fillet2 } from './kit.mjs';

const BX0 = -96, BX1 = 84, BZ = 78, BY = -40;
export default () => buildThrottle({
  H: 820, AZ: -52, EL: 30,
  fit: [[BX0, BY, -BZ], [BX1, BY, BZ], [BX0, 0, BZ], [BX1, 0, -BZ], [-40, 130, -64], [50, 130, 24]],
  fitBox: [230, 770, 50, 760],
  fadeHull: [[BX0, BY, -BZ], [BX1, BY, -BZ], [BX1, BY, BZ], [BX0, BY, BZ], [BX0, 0, -BZ], [BX1, 0, -BZ], [BX1, 0, BZ], [BX0, 0, BZ]],
  details(ctx) {
    const { sc, L, UP, poly } = ctx;
    // stepped housing: wide lower skirt, body with a bevelled top, raised gate housing on the left half
    ctx.slabY(fillet2([[BX0, -BZ], [BX1, -BZ], [BX1, BZ], [BX0, BZ]], 10, 2), BY, BY + 12, { top: 2 });
    ctx.slabY(fillet2([[BX0 + 5, -BZ + 5], [BX1 - 5, -BZ + 5], [BX1 - 5, BZ - 5], [BX0 + 5, BZ - 5]], 8, 2), BY + 12, 0, { top: 6 });
    ctx.slabY([[-64, -58], [50, -58], [50, 2], [-64, 2]], 0, 6, { top: 3 });
    sc.floor(BY - 1, -160, 150, -130, 130);
    L.accent.push(`<path d="${poly([[BX1 - 5.2, -16, -40], [BX1 - 5.2, -16, 40]])}" stroke-width="1.8"/>`);
    // gate with the two lever tracks
    for (const z of [-34, -12]) ctx.slot(-50, 40, z, 6, 3, 6);
    const XL = 8, XR = 0, ZL = -34, ZR = -12;
    const aL = ctx.arm(XL, ZL, 6, 46, { w: 9, d: 3, top: 16 }), aR = ctx.arm(XR, ZR, 6, 46, { w: 9, d: 3, top: 16 });
    // left half: tall, rounded hump; right half: lower, carries the thumb controls and the two front rotaries
    const gL = ctx.grip(XL, 46, -42, [[-48, 46, 24, 0], [-38, 82, 26, 0], [-16, 100, 27, 0], [8, 104, 27, 0], [28, 94, 26, 0], [40, 70, 24, 0], [44, 46, 21, 0]], 4.5);
    const gR = ctx.grip(XR, 46, 2, [[-40, 40, 15, 0], [-30, 64, 16, 0], [-10, 78, 17, 0], [10, 80, 17, 0], [28, 72, 16, 0], [40, 56, 15, 0], [48, 42, 13, 0]], 4);
    ctx.leverRegion('lthr', [XL - 8, 22, ZL], [aL, gL.outline]);
    ctx.leverRegion('rthr', [XR - 8, 22, ZR], [aR, gR.outline]);
    // right lever grip (thumb side faces +z): ministick, hats, thumb button, slider; front: rotaries
    let [p, n] = gR.sideAt(XR + 10, 1, 0.55); sc.ministick('mini', p, n, 4.6, { post: 4, spokes: true });
    [p, n] = gR.sideAt(XR - 8, 1, 0.66); sc.hat('hat1', p, nrm(add(n, [0, 0.3, 0])), 5, UP, { cross: true });
    [p, n] = gR.sideAt(XR - 22, 1, 0.5); sc.hat('hat2', p, nrm(add(n, [0, 0.3, 0])), 5, UP, {});
    [p, n] = gR.sideAt(XR + 2, 1, 0.0); sc.button('thumb', p, n, 3.8, 3);
    [p, n] = gR.sideAt(XR - 14, 1, -0.1); sc.slide('slider', p, n, [1, 0, 0], 6, 3, 3);
    [p, n] = gR.endFace(true, 0.1, 0.75); sc.knob('rty1', p, nrm(add(n, [0, 1.1, 0])), 6.4, 6);
    [p, n] = gR.endFace(true, 0.2, -0.3); sc.knob('rty2', p, n, 4.2, 3.4);
    [p, n] = gL.endFace(true, -0.3, 0.3); sc.button('lbtn', p, n, 4, 3);
    // base: three guarded switches (SW1-6), four toggles (TGL1-4) on the front, two rotaries, mode switch
    const tg = []; for (let i = 0; i < 3; i++) tg.push(sc.toggle(null, [56, 0, 16 + i * 20], UP, { len: 12, lean: [0.4, 0, 0], guard: true }));
    sc.anchor('sw', [60, 8, 36]); sc.region('sw', ...tg); sc.inputRegion('sw', tg.flatMap((o) => [o, o]));
    ctx.label([38, 0, 36], 'SW 1-6');
    for (let i = 0; i < 3; i++) { const z = 16 + i * 20; L.wire.push(`<path d="${poly([[48, 0.2, z - 6], [48, 13, z - 6], [64, 13, z - 6], [64, 0.2, z - 6]])}" stroke-width="1.6"/>`, `<path d="${poly([[48, 0.2, z + 6], [48, 13, z + 6], [64, 13, z + 6], [64, 0.2, z + 6]])}" stroke-width="1.6"/>`); }
    const tf = []; for (let i = 0; i < 4; i++) tf.push(sc.toggle(null, [BX1, -18, -50 + i * 18], [1, 0, 0], { len: 10, lean: [0, 0.4, 0] }));
    sc.anchor('tgl', [BX1 + 6, -14, -23]); sc.region('tgl', ...tf); sc.inputRegion('tgl', tf.flatMap((o) => [o, o]));
    sc.knob('rty3', [-40, 0, 40], UP, 6, 5); sc.knob('rty4', [-40, 0, 62], UP, 6, 5);
    sc.rotary('mode', [-74, 0, 52], UP, 5, [1, 0, 0], 3, -45, 45, 1);
    ctx.label([-74, 0, 34], 'MODE');
    void L; void poly;
  },
});
