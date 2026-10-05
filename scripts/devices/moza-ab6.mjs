// MOZA AB6 force-feedback flight base with the MOZA MHG grip: original holographic wireframe (procedural model inspired by the
// product's shape: tall cube-shaped base with a bevelled top carrying four function keys on the front and back bevels and two
// roller wheels on the side bevel, square top recess, long quick-release shaft with knurled collars, MHG grip with an angular head
// leaning forward, four hats, a rocker and a two-stage trigger). No vendor artwork. Axes: x forward, y up, z thumb side (left).
import { buildStick, stickAxes, add, mul, nrm, grow, hull, slab, fillet2 } from './kit.mjs';

const Y0 = -172, Y1 = -58, HX = 66, CH = 14;
export default () => buildStick({
  H: 980, AZ: 40, EL: 24,
  KEY: [[0, 34, 25, 21, 0], [3, 54, 24, 19.5, -4], [6, 78, 24.5, 19.5, -6], [8, 100, 25.5, 20, -8], [12, 120, 28, 21.5, -12],
    [20, 139, 33, 24, -16], [29, 156, 40, 27, -12], [35, 171, 44, 28.5, -4], [35, 184, 41, 28.5, 8], [30, 193, 35, 27, 18]],
  loft: { pex: 3.0, egg: 0.12 },
  base: {
    type: 'custom', y0: Y0,
    pts: [[-HX, Y0, -HX], [HX, Y0, HX], [-HX, Y1, HX], [HX, Y1, -HX]],
    draw(sc) {
      const { L, poly } = sc;
      const plan = fillet2([[-HX, -HX], [HX, -HX], [HX, HX], [-HX, HX]], 6, 2);
      const r = slab(sc, plan, { A: [1, 0, 0], B: [0, 0, 1], E: [0, 1, 0], layers: [[0, Y0], [0, Y1 - CH], [CH, Y1]] });
      // top recess (square well round the shaft), seams, side grille
      const q = (h, y) => [[-h, y, -h], [h, y, -h], [h, y, h], [-h, y, h]];
      L.wire.push(`<path d="${poly(q(36, Y1 + 0.1), true)}" stroke-width="1.3"/>`, `<path d="${poly(q(31, Y1 + 0.1), true)}" stroke-opacity=".6"/>`);
      L.wire.push(`<path d="${poly([[HX, Y0 + 14, -HX + 8], [HX, Y0 + 14, HX - 8]])}" stroke-opacity=".5"/>`, `<path d="${poly([[-HX + 8, Y0 + 14, HX], [HX - 8, Y0 + 14, HX]])}" stroke-opacity=".5"/>`);
      for (let i = 0; i < 7; i++) { const z = -36 + i * 6; L.accent.push(`<path d="${poly([[HX + 0.2, Y0 + 52, z], [HX + 0.2, Y0 + 52, z + 3]])}" stroke-width="1.6"/>`); }
      return { hull: r.outline, top: Y1 };
    },
  },
  neck: [[[30, Y1], [30, Y1 + 8], [24, Y1 + 12]], [[13, Y1 + 12], [13, -12]], { knurl: [20, -12, 2, 22] }, [[16, 2], [16, 8]], { knurl: [22, 8, 22, 22] }, [[22, 22], [23, 27], [22, 34]]],
  seam: [0.3, 8.6, 100], grooves: [1.5, 2.4, 3.3], fit: [250, 750, 50, 840],
  details(ctx) {
    const { sc, L, cap, N, FWD, on, P2 } = ctx;
    sc.hat('hat7', cap(0.35, 0.35, 0.5), N, 7.6, FWD, { cross: true }); // 7-11
    sc.hat('hat12', cap(0.3, -0.45, 0.5), N, 7.2, FWD, { ribs: true }); // 12-16
    sc.button('b4', cap(-0.45, 0.4, 0.4), N, 4.4, 3); // 4
    sc.button('b5', cap(-0.5, -0.35, 0.4), N, 4.4, 3); // 5
    { const [p, n] = on(7.2, 96, [0, 0.3, 0]); sc.hat('hat17', p, n, 6.4, [1, 0.3, 0], { stalk: 4 }); } // 17-21
    { const [p, n] = on(5.8, 112, [0, 0.2, 0]); sc.hat('hat25', p, n, 5.8, [1, 0.3, 0], { stalk: 3 }); } // 25-29
    { const [p, n] = on(4.6, 78); sc.rocker('rock', p, n, [0.3, 1, 0], 6, 3.4); } // 22 / 24 / 23
    { const [p, n] = on(8.2, 205); sc.button('b3', p, n, 4.6, 3.4); } // 3 (back)
    { const [p, n] = on(1.6, 25); sc.button('b2', p, n, 4.8, 3.6); } // 2 (pinky)
    ctx.blade('trig', 156, 124, 15);
    // twist (RZ) arrows round the lower collar
    { const ps = []; for (let j = 0; j <= 22; j++) { const t = ((sc.tv() + 120 + j * 6) * Math.PI) / 180; ps.push([24 * Math.cos(t), -4, 24 * Math.sin(t)]); } L.axis.push(`<path d="${sc.smooth(ps)}" stroke-width="1.8"/>`);
      const a = ps[ps.length - 1], b = ps[ps.length - 3]; L.axis.push(`<path d="${sc.poly([b, a, add(a, [0, -4, 0])])}"/>`);
      sc.anchor('twist', ps[11]); sc.region('twist', grow(hull([...sc.ring3([0, -12, 0], [0, 1, 0], 22, 24), ...sc.ring3([0, 4, 0], [0, 1, 0], 22, 24)].map(P2)), 2)); }
    stickAxes(ctx, 'xy', Y1 + 0.5, 44, 54, { regionR: 56 });
    // base: 4 function keys on the front bevel and 4 on the back bevel (one callout), 2 roller wheels on the side bevel
    { const bev = (sx) => nrm([sx, 1, 0]), xb = HX - CH / 2, yb = Y1 - CH / 2;
      const front = sc.keys([null, null, null, null], [xb, yb, -24], bev(1), [0, 0, 1], 16, 0, 4, 6.5, 3.6, true);
      const back = sc.keys([null, null, null, null], [-xb, yb, -24], bev(-1), [0, 0, 1], 16, 0, 4, 6.5, 3.6, true);
      const outs = [...front, ...back];
      sc.anchor('bkeys', [xb + 2, yb + 4, 0]); sc.region('bkeys', grow(hull(outs.flat()), 2)); sc.inputRegion('bkeys', outs); }
    { const n = nrm([0, 1, 1]), zb = HX - CH / 2, yb = Y1 - CH / 2;
      sc.wheel('wl', [24, yb, zb], n, [1, 0, 0], 6, 8);
      sc.wheel('wr', [-24, yb, zb], n, [1, 0, 0], 6, 8); }
    void mul;
  },
});
