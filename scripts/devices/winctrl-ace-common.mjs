// WinCtrl "Ace" grips (CarrierAce = F/A-18 style, ViperAce = F-16 style) on the WinCtrl metal gimbal base: shared body, each grip
// keeps its own head shape and control layout. Original procedural line art, no vendor artwork. Axes: x forward, y up, z thumb side.
import { buildStick, trigger, stickAxes, add, mul, nrm, slab, fillet2, hull } from './kit.mjs';

// WinCtrl Orion 2 metal gimbal base: tall rounded-square aluminium shroud (about 114 x 124 x 114 mm) on a wider bolt-down plate,
// securing ring and rubber boot on top
const TY0 = -118, TY1 = -12;
const BASE = {
  type: 'custom', y0: TY0, plate: { px: 92, pz: 86, t: 5 },
  pts: [[-62, TY0, -58], [62, TY0, -58], [62, TY0, 58], [-62, TY0, 58], [-62, TY1, -58], [62, TY1, 58]],
  draw(sc) {
    const plan = fillet2([[-62, -58], [62, -58], [62, 58], [-62, 58]], 18, 4);
    const r = slab(sc, plan, { A: [1, 0, 0], B: [0, 0, 1], E: [0, 1, 0], layers: [[0, TY0], [0, TY1 - 14], [5, TY1 - 5], [13, TY1]] });
    const { L, poly } = sc;
    // shroud details: lower seam, etched band on the pilot-side face, vent slots on the side
    L.wire.push(`<path d="${poly([[-62, TY0 + 12, -40], [-62, TY0 + 12, 40]])}" stroke-opacity=".5"/>`);
    L.accent.push(`<path d="${poly([[-62.2, TY1 - 30, -34], [-62.2, TY1 - 30, 34]])}" stroke-width="1.8"/>`);
    for (let i = 0; i < 6; i++) { const x = -30 + i * 12; L.wire.push(`<path d="${poly([[x, TY0 + 26, 58.2], [x + 5, TY0 + 26, 58.2], [x + 5, TY0 + 64, 58.2], [x, TY0 + 64, 58.2]], true)}" stroke-opacity=".5"/>`); }
    for (const [x, z] of [[-44, -40], [44, -40], [44, 40], [-44, 40]]) L.wire.push(sc.ellipse([x, TY1 + 0.1, z], [0, 1, 0], 2));
    return { hull: r.outline, top: TY1 };
  },
};
const NECK = [[[42, TY1], [42, TY1 + 5], [36, TY1 + 7]], { boot: [34, 22, TY1 + 7, 10, 3] }, { knurl: [24, 10, 22, 20] }, [[23, 22], [24, 26], [23, 31]]];

export function carrier() {
  return buildStick({
    H: 920, AZ: 40, EL: 24,
    // F/A-18 style: slim S-curved handle, hooded head pitched forward over the trigger, round connector collar at the bottom
    KEY: [[0, 30, 24, 21, 0], [-2, 52, 22.5, 19.5, 2], [-5, 78, 22, 19, 0], [-5, 102, 23, 19.5, -6], [-1, 124, 26, 21, -12],
      [9, 146, 33, 24, -12], [21, 165, 42, 27, -2], [27, 181, 46, 28, 12], [25, 194, 41, 27, 26], [17, 202, 32, 25, 38]],
    loft: { pex: 2.3, egg: 0.16 }, base: BASE, neck: NECK,
    seam: [0.3, 8.6, 100], grooves: [1.4, 2.3], fit: [260, 740, 30, 800],
    details(ctx) {
      const { sc, cap, N, FWD, on } = ctx;
      sc.hat('trim', cap(0.05, -0.1, 0.5), N, 9.5, FWD, { rings: true, h: 3.6 }); // 19 = POV trim
      sc.button('wpn', cap(0.55, 0.5, 0.5), N, 5.4, 3.2, true); // 20 weapon release (red)
      sc.hat('hatA', cap(-0.5, 0.45, 0.4), N, 7.2, FWD, { cross: true }); // 9-13
      sc.hat('hatB', cap(0.55, -0.55, 0.4), N, 6.6, FWD, { ribs: true }); // 14-18
      { const [p, n] = on(7.0, 118, [0, 0.35, 0]); sc.hat('hatC', p, n, 6.6, [1, 0.3, 0], { stalk: 4 }); } // 21-25 thumb side
      { const [p, n] = on(8.7, 78, [0, 0.3, 0]); sc.rotary('sel5', p, n, 4.6, [1, 0.5, 0], 5, -80, 80, 2); } // 5-way 1/2/26/27/3
      { const [p, n] = on(6.2, 200); sc.button('rear', p, n, 4.6, 3.4); } // 6
      ctx.blade('trig', 156, 124, 15);
      sc.paddle('paddle', [ctx.xAt(36) - 3, 34, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1], [[0, 0], [9, 6], [14, 20], [15, 38], [12, 54], [7, 62], [3, 60], [6, 46], [7, 30], [4, 14]], 6, { edges: [0, 3, 6], anchorAt: [14, 40] });
      stickAxes(ctx, 'xy', TY1 + 0.5, 46, 54, { regionR: 56 });
    },
  });
}

export function viper() {
  return buildStick({
    H: 920, AZ: 40, EL: 24,
    // F-16 style: straight handle raked forward, wide squared head with a flat top, big oval palm-rest disc at the bottom
    KEY: [[0, 30, 31, 28, 0], [3, 50, 31, 27.5, -4], [8, 72, 31, 27.5, -8], [16, 94, 32, 28, -12], [27, 114, 34, 29, -14],
      [39, 132, 38, 30.5, -14], [48, 150, 43, 33, -12], [53, 166, 46, 34.5, -8], [54, 178, 45, 34.5, -4]],
    loft: { pex: 3.4, egg: 0.08 }, base: BASE, neck: NECK,
    flange: { y: 32, t: 6, front: 58, back: 74, half: 62, dx: -8, e: 0.85 },
    seam: [0.3, 7.6, 100], grooves: [1.4, 2.3, 3.2], fit: [260, 740, 30, 800],
    details(ctx) {
      const { sc, L, cap, N, FWD, on, poly } = ctx;
      sc.hat('trim', cap(0.1, -0.15, 0.5), N, 9.2, FWD, { rings: true, h: 3.6 }); // 19 POV
      sc.button('wpn', cap(0.58, 0.48, 0.5), N, 5.2, 3.2, true); // 20
      sc.hat('tms', cap(-0.45, 0.42, 0.4), N, 7, FWD, { ribs: true }); // 9-13
      sc.hat('dms', cap(-0.55, -0.42, 0.4), N, 7, FWD, { cross: true }); // 14-18
      { const [p, n] = on(7.6, 96, [0, 0.35, 0]); sc.hat('cms', p, n, 6.6, [1, 0.3, 0], { stalk: 4 }); } // 21-25
      { const [p, n] = on(9.0, 200); sc.wheel('wheel', p, n, [0, 0, 1], 5.2, 7); } // 1/2/41/42/3 + rotz (5-way wheel)
      { const [p, n] = on(1.2, 30); sc.button('nws', p, n, 4.4, 3.6); } // 6
      // thumb-side module: ministick (rX / rY, push 26, digital 27-30) and two 4-way hats (31-35, 36-40)
      { // thumb-side pod on the head
        const k = ctx.kAtY(150), c0 = ctx.surf(k, 92), n0 = nrm(add(ctx.surfN(k, 92), [0, 0.2, 0])), fw = [1, 0, 0], up = [0, 1, 0];
        const P = (a, b, h = 1) => add(c0, add(add(mul(fw, a), mul(up, b)), mul(n0, h)));
        const pod = [P(-20, -14), P(16, -12), P(16, 12), P(-20, 12)];
        L.wire.push(`<path d="${poly(pod, true)}" stroke-opacity=".75"/>`); L.fill.push(`<path d="${poly(pod, true)}"/>`);
        sc.ministick('mini', P(8, 1, 1.5), n0, 5.4, { post: 5, spokes: true });
        sc.hat('hatD', P(-8, 4, 1.5), n0, 5.4, [0, 1, 0], { cross: true });
        sc.hat('hatE', P(-12, -8, 1.5), n0, 5.2, [0, 1, 0], {});
      }
      ctx.blade('trig', 158, 126, 15);
      sc.paddle('paddle', [ctx.xAt(36) - 3, 34, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1], [[0, 0], [9, 6], [14, 20], [15, 38], [12, 54], [7, 62], [3, 60], [6, 46], [7, 30], [4, 14]], 6, { edges: [0, 3, 6], anchorAt: [14, 40] });
      stickAxes(ctx, 'xy', TY1 + 0.5, 46, 54, { regionR: 56 });
      void add; void mul;
    },
  });
}
