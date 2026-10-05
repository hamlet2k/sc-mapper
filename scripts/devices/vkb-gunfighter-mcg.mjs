// VKB Gunfighter base with the MCG Ultimate grip: original holographic wireframe (procedural model inspired by the product's shape:
// square metal gimbal block on a plate with a rubber boot; modern combat grip with a ministick, four hats, buttons, a two-stage
// trigger, a flip trigger and a brake lever). No vendor artwork. Axes: x forward, y up, z thumb side (left).
import { buildStick, trigger, stickAxes, nrm, slab, fillet2 } from './kit.mjs';

const Y0 = -120, Y1 = -40, HX = 52;
export default () => buildStick({
  H: 940, AZ: 40, EL: 24,
  // MCG Ultimate: thick handle with finger swells, compact head pitched forward; Gunfighter: square metal block on a big plate
  KEY: [[0, 30, 26, 22, 0], [1, 50, 25.5, 21, -2], [3, 74, 26, 21, -4], [5, 98, 27, 21.5, -6], [10, 120, 29, 22.5, -12],
    [19, 140, 34, 25, -16], [28, 157, 40, 27.5, -10], [32, 172, 42, 28.5, 4], [29, 186, 38, 28, 20], [22, 195, 31, 26, 36]],
  loft: { pex: 2.9, egg: 0.12 },
  base: {
    type: 'custom', y0: Y0, plate: { px: 112, pz: 106, t: 4 },
    pts: [[-HX, Y0, -HX], [HX, Y0, HX], [-HX, Y1, HX], [HX, Y1, -HX]],
    draw(sc) {
      const plan = fillet2([[-HX, -HX], [HX, -HX], [HX, HX], [-HX, HX]], 12, 3);
      const r = slab(sc, plan, { A: [1, 0, 0], B: [0, 0, 1], E: [0, 1, 0], layers: [[0, Y0], [0, Y1 - 6], [6, Y1]] });
      const { L, poly } = sc;
      L.wire.push(`<path d="${poly([[HX, Y0 + 20, -30], [HX, Y0 + 20, 30], [HX, Y0 + 44, 30], [HX, Y0 + 44, -30]], true)}" stroke-opacity=".55"/>`); // label plate
      L.wire.push(`<path d="${poly([[-HX + 6, Y1 - 10, HX], [HX - 6, Y1 - 10, HX]])}" stroke-opacity=".5"/>`);
      return { hull: r.outline, top: Y1 };
    },
  },
  neck: [{ boot: [46, 22, -40, -6, 5] }, [[12, -6], [12, 10]], { knurl: [22, 10, 22, 20] }, [[22, 22], [24, 26], [23, 31]]],
  flange: { y: 31, t: 6, front: 36, back: 50, half: 32, dx: -5 },
  seam: [0.3, 8.6, 100], grooves: [1.5, 2.4, 3.3], fit: [250, 750, 40, 800],
  details(ctx) {
    const { sc, cap, N, FWD, on } = ctx;
    sc.button('apoff', cap(0.6, 0.45, 0.5), N, 4.8, 3.2, true); // AP OFF (red)
    sc.hat('mmode', cap(0.15, -0.35, 0.5), N, 7.6, FWD, { cross: true }); // MASTER MODE hat
    sc.ministick('gc', cap(-0.45, 0.4, 0.4), N, 5.6, { post: 5, spokes: true }); // GATE CONT ministick
    sc.hat('dc', cap(-0.5, -0.45, 0.4), N, 6.6, FWD, { ribs: true }); // DC hat
    sc.button('lvl', cap(0.62, -0.62, 0.3), N, 3.8, 3); // LVLNG
    { const [p, n] = on(7.6, 100, [0, 0.35, 0]); sc.hat('manvr', p, n, 6.4, [1, 0.3, 0], { stalk: 4 }); } // MANVR (thumb)
    { const [p, n] = on(6.2, 118, [0, 0.2, 0]); sc.hat('reset', p, n, 5.6, [1, 0.3, 0], { stalk: 3 }); } // RESET hat
    { const [p, n] = on(8.6, 215); sc.button('gun', p, n, 4.4, 3.4); } // GUN button (outer side)
    { const [p, n] = on(3.4, 30); sc.button('ring', p, n, 4.4, 3.4); } // ring-finger button
    // flip trigger (folds down in front of the main trigger) + main trigger
    trigger(ctx, 'flip', [[ctx.xAt(168) + 2, 170], [ctx.xAt(162) + 10, 163], [ctx.xAt(156) + 12, 155], [ctx.xAt(150) + 6, 149]], [[ctx.xAt(168) - 2, 167], [ctx.xAt(162) + 4, 161], [ctx.xAt(156) + 6, 155], [ctx.xAt(150) + 6, 149]], { z: 5, red: false });
    ctx.blade('trig', 146, 116, 15);
    // brake lever along the grip front (pull / low / hi)
    sc.paddle('brake', [ctx.xAt(40) - 3, 34, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1], [[0, 0], [9, 6], [16, 22], [17, 42], [13, 60], [8, 70], [4, 66], [8, 50], [8, 32], [4, 14]], 6, { edges: [0, 3, 6], anchorAt: [15, 44] });
    stickAxes(ctx, 'xy', Y1 + 0.5, 48, 56, { regionR: 58 });
    void nrm;
  },
});
