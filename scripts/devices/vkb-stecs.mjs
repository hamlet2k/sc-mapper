// VKB STECS Mk.II throttle with the STEM add-on module: original holographic wireframe (procedural model inspired by the product's
// shape: two vented boxes side by side on one large bolt plate (the STEM module outboard, the STECS base inboard with a rounded top
// edge and a mode / START / SYS strip), a fan-shaped quadrant on top, and a split grip of two horizontal, rib-wrapped drums whose
// inboard end is a dark control head full of hats, a ministick and an encoder). No vendor artwork. Axes: x forward, y up, z right.
import { buildThrottle, fillet2 } from './kit.mjs';

const BX0 = -100, BX1 = 80, BY = -46;
const XC = 22, YC = 96, R = 27;   // grip drum axis (along z)
export default () => buildThrottle({
  W: 1000, H: 1000, AZ: 66, EL: 24,
  fit: [[BX0 - 10, BY - 4, -150], [BX1 + 10, BY - 4, 96], [BX0 - 10, BY - 4, 96], [BX1 + 10, BY - 4, -150], [XC, YC + R + 4, -66], [XC, YC + R + 4, 70]],
  fitBox: [190, 810, 170, 860],
  fadeHull: [[BX0, BY, -140], [BX1, BY, -140], [BX1, BY, 60], [BX0, BY, 60], [BX0, 0, -140], [BX1, 0, -140], [BX1, 0, 60], [BX0, 0, 60]],
  details(ctx) {
    const { sc, L, UP, poly } = ctx;
    // bolt plate, STEM module (outboard, -z), STECS base (rounded top rear edge), vents on the pilot-facing faces
    ctx.plate(BX0 - 10, BX1 + 10, -150, 96, BY, 4, { cut: 6 });
    sc.floor(BY - 5, -200, 160, -220, 160);
    ctx.slabX(fillet2([[BX0, BY], [BX1 - 20, BY], [BX1 - 20, -6], [BX0, -6]], [0, 0, 4, 4], 2), -140, -52, { bevel: 2 });
    ctx.slabX(fillet2([[BX0, BY], [BX1, BY], [BX1, 0], [BX0, 0]], [0, 0, 6, 14], 3), -48, 60, { bevel: 2 });
    for (const [z0, z1] of [[-128, -64], [-30, 50]]) for (let i = 0; i < 14; i++) { const z = z0 + (i / 13) * (z1 - z0); L.wire.push(`<path d="${poly([[BX0 - 0.3, BY + 6, z], [BX0 - 0.3, BY + 22, z]])}" stroke-opacity=".5"/>`); }
    L.wire.push(`<path d="${poly([[BX0 + 6, 0.2, -44], [BX0 + 6, 0.2, 56], [-62, 0.2, 56], [-62, 0.2, -44]], true)}" stroke-opacity=".5"/>`);
    // fan-shaped quadrant on the STECS top, lever slots
    const arc = []; for (let i = 0; i <= 8; i++) { const a = (i / 8) * Math.PI; arc.push([XC - 42 * Math.cos(a), Math.max(0, 24 * Math.sin(a))]); }
    ctx.slabX(arc, -30, 30, { bevel: 3 });
    for (const z of [-9, 9]) { const ps = []; for (let i = 1; i < 8; i++) { const a = (i / 8) * Math.PI; ps.push([XC - 42.4 * Math.cos(a), 24.4 * Math.sin(a), z]); } L.wire.push(`<path d="${poly(ps)}" stroke-width="2.2" stroke-opacity=".8"/>`); }
    // posts + split grip: left drum (z -58..-6), right drum (z 4..44) ending in the control head (z 44..62)
    const circ = (r, n = 20) => Array.from({ length: n }, (_, i) => { const a = (i / n) * 2 * Math.PI; return [XC + r * Math.cos(a), YC + r * Math.sin(a)]; });
    const aL = ctx.arm(XC, -10, 20, YC - R + 6, { w: 16, d: 7, top: 18 }), aR = ctx.arm(XC, 10, 20, YC - R + 6, { w: 16, d: 7, top: 18 });
    const dL = ctx.slabX(circ(R), -62, -4, { bevel: 6 });
    const dR = ctx.slabX(circ(R), 4, 46, { bevel: 4 });
    const hd = ctx.slabX(circ(R + 4), 46, 66, { bevel: 5 });
    for (let i = 0; i < 9; i++) { const z0 = i < 5 ? -52 + i * 10 : 8 + (i - 5) * 9; const ps = []; for (let j = 0; j <= 12; j++) { const a = Math.PI * (0.45 + j / 12); ps.push([XC + (R + 0.4) * Math.cos(a), YC + (R + 0.4) * Math.sin(a), z0]); } L.accent.push(`<path d="${poly(ps)}" stroke-width="1.5" stroke-opacity=".7"/>`); }
    ctx.leverRegion('mtgl', [XC - 12, 60, -9], [aL, dL.outline]);
    ctx.leverRegion('mtgr', [XC - 12, 60, 9], [aR, dR.outline, hd.outline]);
    const on = (r, a, z) => { const t = (a * Math.PI) / 180; return [[XC + r * Math.cos(t), YC + r * Math.sin(t), z], [Math.cos(t), Math.sin(t), 0]]; };
    const ez = 66, en = [0, 0, 1];
    // right grip head (inboard end face): RADIO, BRK hats, OTS ministick, side encoder; pilot side: OP EXEC, RST / ENT / WEP; triggers
    sc.hat('radio', [XC - 12, YC + 12, ez], en, 5, UP, { cross: true });
    sc.ministick('ots', [XC + 11, YC + 12, ez], en, 4.6, { post: 4, spokes: true });
    sc.hat('brk', [XC - 12, YC - 11, ez], en, 4.6, UP, {});
    sc.wheel('senc', [XC + 12, YC - 11, ez], en, [1, 0, 0], 4.4, 5);
    let [p, n] = on(R + 4, 150, 56); sc.hat('opex', p, n, 4.4, UP, { ribs: true });
    { const os = [[195, 51], [195, 61], [215, 56]].map(([a, z]) => { [p, n] = on(R + 4, a, z); return sc.button(null, p, n, 2.8, 2.4); }); sc.anchor('rew', [XC - R - 8, YC - 10, 56]); sc.region('rew', ...os); sc.inputRegion('rew', os); }
    [p, n] = on(R + 4, 0, 56); sc.rocker('fwdr', p, n, [0, 1, 0], 5, 3);
    [p, n] = on(R + 4, 250, 56); sc.rocker('aftr', p, n, [0, 0, 1], 5, 3);
    // left grip: MB1 / MB2 hats on the pilot side, ring-finger encoder on the outboard cap, forward / aft triggers
    [p, n] = on(R, 160, -44); sc.hat('mb1', p, n, 4.4, UP, { cross: true });
    [p, n] = on(R, 160, -28); sc.hat('mb2', p, n, 4.4, UP, {});
    sc.knob('renc', [XC, YC, -62], [0, 0, -1], 13, 5);
    [p, n] = on(R, 10, -30); sc.rocker('fwdl', p, n, [0, 1, 0], 4.6, 2.8);
    [p, n] = on(R, 230, -36); sc.rocker('aftl', p, n, [0, 0, 1], 4.6, 2.8);
    // STECS strip along the pilot edge: MODE 1-5, START, SYS
    ctx.panel([
      { t: 'rot', id: 'mode', at: [-82, -26], r: 5.4, pos: 5, a0: -80, a1: 80, sel: 0, label: 'MODE', lx: -13 },
      { t: 'red', id: 'start', at: [-82, 22], r: 4.4, label: 'START' }, { t: 'btn', id: 'sys', at: [-82, 42], r: 3.6, label: 'SYS' },
    ]);
    // STEM module (deck y = -6)
    ctx.panel([
      { t: 'tog', id: 'sw1', at: [-80, -128], lean: [0, 0, 0], label: 'SW1' }, { t: 'tog', id: 'sw2', at: [-80, -108], lean: [0, 0, 0], label: 'SW2' },
      { t: 'tog', id: 'tgl', at: [-80, -66], label: 'TGL' },
      { t: 'knob', id: 'en1', at: [-50, -126], r: 5, h: 8, label: 'EN1' }, { t: 'knob', id: 'en2', at: [-50, -100], r: 5, h: 8, label: 'EN2' },
      { t: 'group', id: 'a12', label: 'A1 A2', lx: -12, parts: [-80, -66].map((z) => ({ t: 'btn', at: [-50, z], r: 3 })) },
      { t: 'group', id: 'b15', label: 'B1-B5', lx: -12, parts: [-128, -112, -96, -80, -64].map((z) => ({ t: 'key', at: [-22, z], w: 4.6, hh: 3.4, u: [0, 0, 1] })) },
      { t: 'btn', id: 'c1', at: [8, -96], r: 3.6, label: 'C1' },
      { t: 'slide', id: 'mlev', at: [8, -70], u: [1, 0, 0], len: 10, wid: 3 },
    ], { y: -6 });
    // landing-gear lever (wheel-shaped knob on an arm)
    { const x = 14, z = -124; const a = ctx.arm(x, z, -6, 20, { w: 2, d: 2, top: 3 }); const kn = sc.wheel(null, [x, 24, z], [0, 0, 1], [1, 0, 0], 5, 4); ctx.leverRegion('gear', [x, 24, z], [a, kn]); ctx.label([x - 14, -6, z], 'GEAR'); }
  },
});
