// Logitech G X56 H.O.T.A.S. stick: original holographic wireframe (procedural model inspired by the product's shape: broad base,
// tall grip with an adjustable palm rest; POV hat, two 4-way hats, thumb ministick, top buttons, trigger, pinkie button and the
// flying pinkie lever). No vendor artwork. Axes: x forward, y up, z thumb side (left).
import { buildStick, trigger, stickAxes, add, grow, hull, slab, fillet2 } from './kit.mjs';

// broad, low rectangular base with a circular well and the exposed F.E.E.L. spring assembly
const Y0 = -84, Y1 = -36, HX = 98, HZ = 104;
export default () => buildStick({
  H: 900, AZ: 44, EL: 28,
  // tall, nearly straight grip with a forward-leaning head and a large palm rest at the bottom back
  KEY: [[0, 30, 24, 20, 0], [0, 52, 23, 18.5, 0], [1, 78, 23, 18.5, 0], [3, 104, 24, 19, -2], [7, 126, 26, 20, -8],
    [14, 146, 31, 22.5, -14], [22, 163, 37, 25, -12], [27, 178, 40, 26.5, -2], [26, 191, 37, 26, 14], [20, 199, 30, 23.5, 32]],
  loft: { pex: 3.4, egg: 0.1 },
  base: {
    type: 'custom', y0: Y0,
    pts: [[-HX, Y0, -HZ], [HX, Y0, HZ], [-HX, Y1, HZ], [HX, Y1, -HZ]],
    draw(sc) {
      const { L, poly } = sc;
      const plan = fillet2([[-HX, -HZ], [HX, -HZ], [HX, HZ], [-HX, HZ]], 16, 3);
      const r = slab(sc, plan, { A: [1, 0, 0], B: [0, 0, 1], E: [0, 1, 0], layers: [[0, Y0], [0, Y1 - 8], [8, Y1]] });
      // circular well, dashed arc band round it, front badge line
      L.wire.push(sc.ellipse([0, Y1 + 0.1, 0], [0, 1, 0], 56, ' stroke-width="1.3"'), sc.ellipse([0, Y1 + 0.1, 0], [0, 1, 0], 48, ' stroke-opacity=".6"'));
      const ps = []; for (let j = 0; j <= 30; j++) { const t = ((sc.tv() + 100 + j * 5.3) * Math.PI) / 180; ps.push([70 * Math.cos(t), Y1 + 0.1, 70 * Math.sin(t)]); } L.accent.push(`<path d="${sc.smooth(ps)}" stroke-width="2" stroke-dasharray="7 4"/>`);
      L.wire.push(`<path d="${poly([[-HX, Y0 + 10, -50], [-HX, Y0 + 10, 50]])}" stroke-opacity=".5"/>`);
      return { hull: r.outline, top: Y1 };
    },
  },
  neck: [[[44, Y1], [44, Y1 + 6], [38, Y1 + 8]], [[30, Y1 + 8], [30, Y1 + 14]], { knurl: [26, Y1 + 14, Y1 + 30, 26] }, [[14, Y1 + 30], [14, 12]], [[22, 12], [24, 20], [23, 30]]],
  flange: { y: 32, t: 7, front: 34, back: 72, half: 38, dx: -16, e: 0.4 },
  seam: [0.3, 8.6, 100], grooves: [1.5, 2.4, 3.3], fit: [250, 750, 40, 800],
  details(ctx) {
    const { sc, L, cap, N, FWD, on, P2 } = ctx;
    sc.hat('pov', cap(0.2, -0.2, 0.5), N, 8.4, FWD, { rings: true, h: 3.4 }); // POV
    sc.button('a', cap(0.55, 0.45, 0.4), N, 4.8, 3.2, true); // A (red, top)
    sc.button('b', cap(-0.4, 0.5, 0.4), N, 4.2, 3); // B
    sc.hat('h1', cap(-0.5, -0.35, 0.4), N, 6.4, FWD, { cross: true }); // hat 1
    { const [p, n] = on(7.8, 100, [0, 0.35, 0]); sc.hat('h2', p, n, 6, [1, 0.3, 0], { stalk: 4 }); } // hat 2 (thumb)
    { const [p, n] = on(6.4, 132, [0, 0.25, 0]); sc.ministick('mini', p, n, 5, { post: 4, spokes: true }); } // thumb ministick
    { const [p, n] = on(8.2, 205); sc.button('c', p, n, 4.2, 3.4); } // C
    { const [p, n] = on(2.6, 25); sc.button('d', p, n, 4.6, 3.6); } // pinkie button
    ctx.blade('trig', 152, 122, 14, { stages: 1 });
    sc.paddle('fp', [ctx.xAt(38) - 3, 36, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1], [[0, 0], [8, 4], [13, 16], [13, 32], [9, 42], [5, 40], [7, 28], [6, 14]], 6, { edges: [0, 3], anchorAt: [12, 26] }); // flying pinkie
    { const ps = []; for (let j = 0; j <= 22; j++) { const t = ((sc.tv() + 120 + j * 6) * Math.PI) / 180; ps.push([28 * Math.cos(t), Y1 + 22, 28 * Math.sin(t)]); } L.axis.push(`<path d="${sc.smooth(ps)}" stroke-width="1.8"/>`);
      const a = ps[ps.length - 1], b = ps[ps.length - 3]; L.axis.push(`<path d="${sc.poly([b, a, add(a, [0, -4, 0])])}"/>`);
      sc.anchor('twist', ps[11]); sc.region('twist', grow(hull([...sc.ring3([0, Y1 + 14, 0], [0, 1, 0], 27, 24), ...sc.ring3([0, Y1 + 30, 0], [0, 1, 0], 27, 24)].map(P2)), 2)); }
    stickAxes(ctx, 'xy', Y1 + 0.5, 58, 70, { regionR: 72 });
  },
});
