// VKB Gladiator NXT EVO with the Space Combat Grip (SCG): original holographic wireframe (procedural model inspired by the product's
// shape: low rounded base with F1-F3 keys, a switch, an encoder and a throttle lever; grip head with two hats, a ministick, a red
// button, rapid-fire + main triggers, thumb hat, pinky button). No vendor artwork. Axes: x forward, y up, z thumb side (left).
import { buildStick, trigger, stickAxes, add, nrm, grow, hull, slab, fillet2 } from './kit.mjs';

// NXT EVO base: low housing, sloped pilot-side face (F1-F3 keys, vent grille), flat top with the gimbal, on a plate with tabs
const Y0 = -104, Y1 = -18, BZ = 70;
const SIDE = [[-88, Y0], [74, Y0], [74, Y1 - 16], [60, Y1], [-34, Y1], [-88, Y0 + 40]];
export default () => buildStick({
  H: 900, AZ: 44, EL: 27,
  // Space Combat Grip: thick handle, big rounded head with a hooded front and a hump at the back
  KEY: [[1, 26, 25, 21, 0], [0, 48, 24, 19.5, 2], [1, 74, 24.5, 19.5, 2], [3, 98, 25.5, 20, -2], [8, 118, 28, 21.5, -10],
    [16, 136, 33, 24, -14], [24, 152, 40, 27.5, -8], [28, 168, 44, 29.5, 6], [25, 182, 41, 29, 22], [18, 191, 34, 27, 38]],
  loft: { pex: 2.6, egg: 0.12 },
  base: {
    type: 'custom', y0: Y0, plate: { px: 110, pz: 92, t: 4, cx: -6 },
    pts: [...SIDE.map(([x, y]) => [x, y, -BZ]), ...SIDE.map(([x, y]) => [x, y, BZ])],
    draw(sc) {
      const { L, poly } = sc;
      const prof = fillet2(SIDE, [4, 4, 8, 10, 10, 6], 3);
      const r = slab(sc, prof, { A: [1, 0, 0], B: [0, 1, 0], E: [0, 0, 1], layers: [[5, -BZ], [0, -BZ + 5], [0, BZ - 5], [5, BZ]] });
      // vent grille on the sloped face, side seam, round top plate of the gimbal
      for (let i = 0; i < 8; i++) { const z = -30 + i * 8.5; L.wire.push(`<path d="${poly([[-86, Y0 + 14, z], [-86, Y0 + 30, z]])}" stroke-opacity=".6"/>`); }
      L.wire.push(`<path d="${poly([[-70, Y0 + 10, BZ], [66, Y0 + 10, BZ]])}" stroke-opacity=".45"/>`);
      L.wire.push(sc.ellipse([0, Y1 + 0.1, 0], [0, 1, 0], 36, ' stroke-opacity=".7"'));
      return { hull: r.outline, top: Y1 };
    },
  },
  neck: [{ boot: [32, 20, Y1, 6, 3] }, [[11, 6], [11, 14]], [[19, 14], [22, 20], [21, 26]]],
  seam: [0.3, 8.6, 100], grooves: [1.5, 2.4, 3.3], fit: [260, 740, 40, 790],
  details(ctx) {
    const { sc, L, cap, N, FWD, on, P2 } = ctx;
    sc.hat('a4', cap(0.3, 0.5, 0.5), N, 6.8, FWD, { cross: true }); // A4 hat (top left)
    sc.ministick('a1', cap(-0.4, 0.42, 0.4), N, 5.6, { post: 5, spokes: true }); // A1 ministick (5-way + analog)
    sc.hat('a3', cap(0.0, -0.3, 0.5), N, 7.4, FWD, {}); // A3 hat (centre)
    sc.button('a2', cap(0.55, -0.42, 0.4), N, 4.8, 3.2, true); // A2 red button
    { const [p, n] = on(7.0, 100, [0, 0.35, 0]); sc.hat('c1', p, n, 6.4, [1, 0.3, 0], { stalk: 4 }); } // C1 thumb hat
    { const [p, n] = on(8.4, 205); sc.button('b1', p, n, 4.4, 3.4); } // B1 side button
    { const [p, n] = on(1.6, 25); sc.button('d1', p, n, 4.8, 3.6); } // D1 pinky
    // rapid-fire trigger (up / down) above the two-stage main trigger
    trigger(ctx, 'rf', [[ctx.xAt(166) - 1, 167], [ctx.xAt(162) + 6, 162], [ctx.xAt(157) + 8, 156], [ctx.xAt(153) + 3, 152]], [[ctx.xAt(166) - 3, 164], [ctx.xAt(162) + 1, 160], [ctx.xAt(157) + 3, 155], [ctx.xAt(153) + 3, 152]], { z: 5, red: false });
    ctx.blade('trig', 148, 118, 14);
    // twist arrows round the neck
    { const ps = []; for (let j = 0; j <= 22; j++) { const t = ((sc.tv() + 120 + j * 6) * Math.PI) / 180; ps.push([25 * Math.cos(t), 18, 25 * Math.sin(t)]); } L.axis.push(`<path d="${sc.smooth(ps)}" stroke-width="1.8"/>`);
      const a = ps[ps.length - 1], b = ps[ps.length - 3]; L.axis.push(`<path d="${sc.poly([b, a, add(a, [0, -4, 0])])}"/>`);
      sc.anchor('twist', ps[11]); sc.region('twist', grow(hull([...sc.ring3([0, 12, 0], [0, 1, 0], 23, 24), ...sc.ring3([0, 26, 0], [0, 1, 0], 22, 24)].map(P2)), 2)); }
    stickAxes(ctx, 'xy', Y1 + 0.5, 40, 50, { regionR: 52 });
    // base: F1-F3 keys on the sloped pilot-side face, Sw1 switch (left side), En1 encoder (right side), throttle lever (left front)
    { const n = nrm([-46, 54, 0]), c = [-66, Y0 + 58, 18]; const outs = sc.keys([null, null, null], c, n, [0, 0, -1], 18, 0, 3, 6, 4, true);
      sc.anchor("fkeys", [-64, Y0 + 61, 0]); sc.region('fkeys', grow(hull(outs.flat()), 2)); sc.inputRegion('fkeys', outs); }
    sc.toggle('sw1', [-30, Y0 + 34, BZ], [0, 0, 1], { len: 10, lean: [0, 0.4, 0] });
    sc.knob('en1', [-30, Y0 + 34, -BZ], [0, 0, -1], 5.4, 5);
    { const o = [26, Y1, BZ - 10]; sc.paddle('thr', o, [1, 0, 0], [0, 1, 0], [0, 0, 1], [[-6, 0], [6, 0], [8, 14], [10, 26], [2, 30], [-4, 26], [-6, 12]], 6, { edges: [0, 3], anchorAt: [3, 22] });
      L.wire.push(`<path d="${sc.poly([[6, Y1 + 0.2, BZ - 10], [50, Y1 + 0.2, BZ - 10]])}" stroke-width="2.4" stroke-opacity=".6"/>`); }
  },
});
