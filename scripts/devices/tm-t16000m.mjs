// Thrustmaster T.16000M FCS flight stick: original holographic wireframe (procedural model inspired by the product's shape: low
// oval base with a 6-button panel on each side and a throttle slider at the back, grip with a flared hand rest, forward head
// with an 8-way POV and 3 buttons, trigger). No vendor artwork. Axes: x forward, y up, z thumb side (left).
import { buildStick, trigger, stickAxes, add, mul, nrm, cross, grow, hull } from './kit.mjs';

export default () => buildStick({
  H: 860, AZ: 42, EL: 30,
  // curved handle that leans back, then a small head hooked forward over the big trigger
  KEY: [
    [0, 30, 26, 22, 0], [-2, 48, 23, 19.5, 4], [-4, 74, 23, 19, 6], [-4, 100, 23.5, 19, 2], [-1, 122, 25, 19.5, -10],
    [7, 142, 28, 20.5, -18], [16, 158, 31, 21.5, -16], [22, 172, 33, 22, -6], [22, 185, 30, 21.5, 10], [17, 193, 24, 19.5, 28],
  ],
  loft: { pex: 2.5, egg: 0.14 },
  base: { type: 'oval', pex: 2.3, prof: [[100, 124, -66], [103, 128, -60], [99, 124, -48], [86, 110, -34], [66, 88, -20], [50, 62, -10], [44, 48, -4]], accentRing: 2 },
  neck: [[[42, -4], [40, 2], [30, 4]], [[30, 4], [27, 6], [13, 8], [12, 20]]],
  flange: { y: 30, t: 10, front: 42, back: 62, half: 42, dx: -8 },
  seam: [0.3, 8.4, 96], grooves: [1.6, 2.4, 3.2],
  fit: [300, 700, 36, 760],
  details(ctx) {
    const { sc, L, P2, cap, N, FWD, on } = ctx;
    // head: 8-way POV hat on the top, button 2 behind it, buttons 3 (left) and 4 (right)
    sc.hat('pov', cap(0.25, 0.0, 0.5), N, 10.5, FWD, { rings: true, h: 4 });
    sc.button('b2', cap(-0.5, 0.05, 0.4), N, 5, 3);
    sc.button('b3', cap(-0.05, 0.66, 0.3), N, 5, 3);
    sc.button('b4', cap(-0.05, -0.66, 0.3), N, 5, 3);
    ctx.blade('trig', 166, 132, 18, { stages: 1 });
    // base panels: right-handed layout (switch under the base). Outer column front to back 5 / 10 / 9, inner 6 / 7 / 8; right side 11-16
    const panel = (side) => {
      const z = side * 78, n = nrm([0, 0.86, side * 0.5]), u = [1, 0, 0];
      const c = [4, -31, z];
      const v = cross(n, u); // across the panel (towards / away from the stick)
      const plate = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => add(c, add(mul(u, a * 34), mul(v, b * 20))));
      L.wire.push(`<path d="${sc.poly(plate, true)}" stroke-opacity=".7"/>`);
      L.fill.push(`<path d="${sc.poly(plate, true)}"/>`);
      const at = (i, j) => add(add(c, mul(n, 0.6)), add(mul(u, 22 - i * 22), mul(v, (j ? -1 : 1) * side * -9.5 * (side > 0 ? 1 : 1))));
      // [i: 0 front .. 2 back, j: 0 inner, 1 outer] in callout order
      const order = side > 0 ? [[0, 1], [0, 0], [1, 0], [2, 0], [2, 1], [1, 1]] : [[0, 1], [0, 0], [1, 0], [2, 0], [2, 1], [1, 1]];
      return order.map(([i, j]) => { const o = sc.key3(null, at(i, j), n, u, 8, 6.5, j === 0); return grow(hull(o), 2); });
    };
    for (const [id, side] of [['lpanel', 1], ['rpanel', -1]]) {
      const outs = panel(side);
      sc.anchor(id, [4, -28, side * 78]);
      sc.region(id, grow(hull(outs.flatMap((o) => o)), 2));
      sc.inputRegion(id, outs);
    }
    sc.text([-36, -36, 96], 'L', 'md'); sc.text([-36, -36, -96], 'R', 'md');
    // throttle slider (Slider 0) on the back of the base
    { const [p, n] = [[-84, -24, 0], nrm([-0.55, 0.83, 0])]; sc.slide('thr', p, n, [0, 0, 1], 14, 5, 6); for (let i = -3; i <= 3; i++) L.wire.push(`<path d="${sc.poly([add(p, [0, 0, i * 7]), add(add(p, [0, 0, i * 7]), mul(n, 0.1))].map((q, k) => (k ? add(q, [-3, 0, 0]) : q)))}" stroke-opacity=".6"/>`); sc.text([-98, -34, 0], '+ · −', 'sm'); }
    // stick axes on the base top + twist (RZ) arrows round the neck
    stickAxes(ctx, 'xy', -3.5, 46, 58, { regionR: 60 });
    L.accent.push(sc.ellipse([0, -3.6, 0], [0, 1, 0], 40, ' stroke-width="2.4"'));
    { const ps = []; for (let j = 0; j <= 22; j++) { const t = ((sc.tv() + 120 + j * 6) * Math.PI) / 180; ps.push([30 * Math.cos(t), 46, 26 * Math.sin(t)]); } L.axis.push(`<path d="${sc.smooth(ps)}" stroke-width="1.8"/>`);
      const a = ps[ps.length - 1], b = ps[ps.length - 3]; L.axis.push(`<path d="${sc.poly([b, a, add(a, [0, -4, 0])])}"/>`);
      sc.anchor('twist', ps[11]); sc.region('twist', grow(hull([...sc.ring3([0, 40, 0], [0, 1, 0], 33, 24), ...sc.ring3([0, 54, 0], [0, 1, 0], 26, 24)].map(P2)), 2)); }
    void on;
  },
});
