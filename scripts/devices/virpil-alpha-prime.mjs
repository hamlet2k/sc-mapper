// VIRPIL VPC Alpha Prime (R) grip on a low rounded-square desk base: original holographic wireframe (procedural model inspired by
// the product's shape: large head leaning over the pilot side with a ministick and two hats, two triggers, pinky brake lever,
// knurled grip ring). No vendor artwork. Axes: x forward, y up, z thumb side (left).
import { buildStick, trigger, stickAxes, add, mul, nrm, grow, hull, slab, fillet2 } from './kit.mjs';

// VPC WarBRD-style desk base: low rounded-square block with a bevelled top
const Y0 = -74, Y1 = -12, HX = 70;
export default () => buildStick({
  H: 900, AZ: 46, EL: 26,
  // Alpha Prime: short, thick handle under a very large rounded head that overhangs forward and back
  KEY: [
    [0, 30, 26, 22, 0], [-1, 50, 24, 20, 2], [0, 76, 24, 20, 2], [3, 100, 25, 20.5, -4], [10, 120, 29, 22, -14],
    [20, 138, 39, 26, -18], [27, 154, 52, 31, -10], [29, 168, 59, 34, 2], [25, 181, 57, 34.5, 16], [18, 191, 49, 33, 30], [10, 197, 38, 30, 44],
  ],
  loft: { pex: 2.5, egg: 0.08 },
  base: {
    type: 'custom', y0: Y0,
    pts: [[-HX, Y0, -HX], [HX, Y0, HX], [-HX, Y1, HX], [HX, Y1, -HX]],
    draw(sc) {
      const plan = fillet2([[-HX, -HX], [HX, -HX], [HX, HX], [-HX, HX]], 24, 4);
      const r = slab(sc, plan, { A: [1, 0, 0], B: [0, 0, 1], E: [0, 1, 0], layers: [[0, Y0], [0, Y1 - 12], [10, Y1]] });
      sc.L.wire.push(`<path d="${sc.poly([[-HX, Y0 + 12, -40], [-HX, Y0 + 12, 40]])}" stroke-opacity=".5"/>`);
      sc.L.accent.push(sc.ellipse([0, Y1 + 0.1, 0], [0, 1, 0], 40, ' stroke-width="1.6"'));
      return { hull: r.outline, top: Y1 };
    },
  },
  neck: [{ boot: [34, 22, Y1, 4, 3] }, [[12, 4], [12, 12]], { knurl: [27, 12, 26, 26] }, [[24, 26], [25, 31]]],
  seam: [0.4, 9.2, 104], grooves: [],
  fit: [250, 750, 40, 800],
  head: { stripRange: [6, 20] },
  details(ctx) {
    const { sc, L, P2, cap, N, FWD, surf, surfN, on } = ctx;
    // pilot-facing head panel: ministick (rX / rY, push 6), button 7, hat 8-12 (push 8), hat 14-18 (push 14), button 13 forward
    sc.ministick('mini', cap(-0.35, 0.52, 0.5), N, 6.4, { post: 5, spokes: true });
    sc.button('b7', cap(0.15, 0.62, 0.5), N, 4.2, 3);
    sc.hat('h8', cap(0.05, -0.05, 0.5), N, 7.6, FWD, {});
    sc.hat('h14', cap(-0.55, -0.15, 0.4), N, 7, FWD, { ribs: true });
    sc.button('b13', cap(0.6, -0.45, 0.4), N, 4.6, 3.2);
    // right side of the head: rocker 28-30 (fwd / push / aft)
    { const [p, n] = on(9.2, 215); sc.slide('r28', p, n, [1, 0.4, 0], 5, 3, 3.6); }
    // thumb lever 19-22 on the grip's pilot side below the head (up / press 1st / press 2nd / down)
    { const [p, n] = on(6.2, 150, [0, 0.3, 0]); sc.slide('l19', p, n, [0, 1, 0], 6, 3.6, 4); }
    // hat 23-27 on the outer (right) side, button 31 low on the back
    { const [p, n] = on(5.4, 238); sc.hat('h23', p, n, 6, [1, 0.5, 0], { stalk: 4 }); }
    { const [p, n] = on(2.2, 205); sc.button('b31', p, n, 4, 3); }
    // triggers: main (1 = forward flip, 2 / 3 = stages), lower trigger 4 / 5
    ctx.blade('t1', 150, 120, 16);
    ctx.blade('t4', 112, 90, 11, { red: false, arc: false });
    // pinky brake lever (32 + analog SLDR) hinged at the bottom front
    {
      const o = [ctx.xAt(38) - 3, 36, 0];
      sc.paddle('brake', o, [1, 0, 0], [0, 1, 0], [0, 0, 1], [[0, 0], [10, 6], [17, 22], [19, 40], [16, 56], [10, 70], [5, 72], [8, 56], [9, 40], [6, 22], [0, 8]], 6, { edges: [0, 3, 6], anchorAt: [16, 44] });
      L.ctl.push(sc.ellipse(add(o, [0, 0, 4]), [0, 0, 1], 3.4), sc.ellipse(add(o, [0, 0, 4]), [0, 0, 1], 1.3, ' class="cf"'));
    }
    // twist (Z) arrows round the knurled ring, stick X / Y on the base top
    { const ps = []; for (let j = 0; j <= 22; j++) { const t = ((sc.tv() + 120 + j * 6) * Math.PI) / 180; ps.push([30 * Math.cos(t), 19, 30 * Math.sin(t)]); } L.axis.push(`<path d="${sc.smooth(ps)}" stroke-width="1.8"/>`);
      const a = ps[ps.length - 1], b = ps[ps.length - 3]; L.axis.push(`<path d="${sc.poly([b, a, add(a, [0, -4, 0])])}"/>`);
      sc.anchor('twist', ps[11]); sc.region('twist', grow(hull([...sc.ring3([0, 12, 0], [0, 1, 0], 28, 24), ...sc.ring3([0, 27, 0], [0, 1, 0], 27, 24)].map(P2)), 2)); }
    stickAxes(ctx, 'xy', Y1 + 0.5, 42, 52, { regionR: 54 });
    void surf; void surfN; void nrm; void mul;
  },
});
