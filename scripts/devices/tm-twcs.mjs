// Thrustmaster TWCS throttle: original holographic wireframe (procedural model inspired by the product's shape: long, low, flared
// "ski" base with side rails and a centre track, a single sliding carriage and a large rounded ergonomic grip sitting low on it;
// POV hat, two 4-way hats, ministick, buttons and a rocker on the thumb side, a front button, a paddle rocker and an "antenna"
// wheel for the index finger). No vendor artwork. Axes: x forward, y up, z right.
import { buildThrottle, add, nrm, fillet2 } from './kit.mjs';

const BY = -22;
const PLAN = fillet2([[-112, -46], [70, -50], [112, -70], [120, -60], [120, 60], [112, 70], [70, 50], [-112, 46]], [10, 30, 10, 8, 8, 10, 30, 10], 3);
export default () => buildThrottle({
  H: 820, AZ: -46, EL: 26,
  fit: [[-112, BY, -50], [120, BY, 70], [-112, 0, 50], [120, 0, -70], [-60, 120, -34], [64, 120, 38]],
  fitBox: [210, 790, 70, 760],
  fadeHull: [[-112, BY, -50], [120, BY, -70], [120, BY, 70], [-112, BY, 50], [-112, 0, -50], [120, 0, -70], [120, 0, 70], [-112, 0, 50]],
  details(ctx) {
    const { sc, L, UP, poly } = ctx;
    ctx.slabY(PLAN, BY, 0, { top: 9, topH: 10 });
    sc.floor(BY - 1, -170, 170, -110, 110);
    // centre track (raised rails) and side trim strips
    ctx.slabY([[-90, -24], [86, -24], [86, 24], [-90, 24]], 0, 5, { top: 2 });
    for (const z of [-14, 14]) L.wire.push(`<path d="${poly([[-84, 5.1, z], [80, 5.1, z]])}" stroke-width="1.3"/>`);
    for (const s of [-1, 1]) L.accent.push(`<path d="${poly([[-100, -10, s * 47.5], [64, -10, s * 51.5]])}" stroke-width="2"/>`);
    ctx.slot(-70, 66, 0, 5, 4, 8);
    ctx.label([84, 5, 32], 'MAX'); ctx.label([-80, 5, 32], 'MIN');
    // carriage + grip
    const X = 4;
    const car = sc.prism([[X - 34, 5, -26], [X + 34, 5, -26], [X + 34, 5, 26], [X - 34, 5, 26]], [[X - 30, 14, -24], [X + 30, 14, -24], [X + 30, 14, 24], [X - 30, 14, 24]]);
    const g = ctx.grip(X, 12, 2, [[-62, 44, 24, 0], [-52, 74, 30, 0], [-30, 96, 33, 2], [-4, 106, 34, 4], [22, 100, 33, 4], [42, 82, 30, 3], [54, 60, 26, 1], [60, 40, 22, 0]], 3);
    ctx.leverRegion('thr', [X - 8, 10, 26], [car, g.outline]);
    // thumb side (+z): POV (8-way) on top-front, hats 7-10 and 11-14, ministick (6), buttons 2 / 3, rocker 4 / 5
    let [p, n] = g.sideAt(X + 32, 1, 0.72); sc.hat('pov', p, nrm(add(n, [0.2, 0.4, 0])), 6.6, UP, { rings: true, h: 3 });
    [p, n] = g.sideAt(X + 8, 1, 0.78); sc.hat('h7', p, nrm(add(n, [0, 0.4, 0])), 5.8, UP, { cross: true });
    [p, n] = g.sideAt(X - 18, 1, 0.74); sc.hat('h11', p, nrm(add(n, [0, 0.4, 0])), 5.8, UP, {});
    [p, n] = g.sideAt(X + 20, 1, 0.28); sc.ministick('mini', p, n, 5, { post: 4, spokes: true });
    [p, n] = g.sideAt(X - 6, 1, 0.3); sc.button('b2', p, n, 3.8, 3);
    [p, n] = g.sideAt(X - 30, 1, 0.34); sc.button('b3', p, n, 3.8, 3);
    [p, n] = g.sideAt(X - 4, 1, -0.2); sc.rocker('r45', p, n, [1, 0, 0], 6, 3.2);
    // front: button 1 (index), paddle rocker (RZ), antenna wheel (Slider 0)
    [p, n] = g.endFace(true, 0.2, 0.55); sc.button('b1', p, n, 4.6, 3.6);
    [p, n] = g.endFace(true, -0.1, -0.2); sc.rocker('paddle', p, n, [0, 0, 1], 9, 4);
    [p, n] = g.sideAt(X + 50, -1, 0.5); sc.wheel('ant', p, n, [0, 1, 0], 5, 5);
  },
});
