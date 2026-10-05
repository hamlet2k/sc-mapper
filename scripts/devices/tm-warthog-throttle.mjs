// Thrustmaster HOTAS Warthog dual throttle: original holographic wireframe (procedural 3D model inspired by the product's shape:
// long metal base with a control panel, twin levers in a gate, two drum-topped grips). No vendor artwork or logos.
// Axes: x forward, y up, z right. Seen from the front-right and above so the finger controls on the grips' front faces show.
import { createScene, add, mul, nrm, cross, grow, hull } from '../holo/scene.mjs';

export default function build() {
  const sc = createScene({ W: 1000, H: 800, MX: 1, AZ: -28, EL: 32 });
  const { L, P2, poly, smooth, smooth2, ellipse, anchor, region, text } = sc;
  const UP = [0, 1, 0];
  const BX0 = -112, BX1 = 92, BZ = 66, BY0 = -50, RX = -72, RY = -7; // base; rear strip (pilot side) is a lower step
  const GY = 58, YB = 64; // lever post top, grip seat
  const XL = 16, XR = -18, ZL = -34, ZR = -15; // lever positions in the gate
  const GZL = -50, GZR = -12; // grip centres (grips overhang the gate)
  {
    const pts = [];
    for (const x of [BX0, BX1]) for (const y of [BY0, 0]) for (const z of [-BZ, BZ]) pts.push([x, y, z]);
    for (const x of [XL - 38, XR + 40]) for (const z of [GZL - 18, GZR + 22]) pts.push([x, YB + 66, z]);
    sc.fit(pts, [235, 765, 40, 740]);
  }
  /* ------------------------------------------------ base: main block + lower rear step, feet */
  {
    const c = [(BX0 + BX1) / 2, BY0 / 2, 0];
    const top = [[RX, 0, -BZ], [BX1, 0, -BZ], [BX1, 0, BZ], [RX, 0, BZ]];
    const F = [
      top, // deck
      [[RX, RY, -BZ], [BX0, RY, -BZ], [BX0, RY, BZ], [RX, RY, BZ]], // rear step deck
      [[RX, 0, -BZ], [RX, 0, BZ], [RX, RY, BZ], [RX, RY, -BZ]], // step riser
      [[BX1, 0, -BZ], [BX1, 0, BZ], [BX1, BY0, BZ], [BX1, BY0, -BZ]], // front
      [[BX0, RY, -BZ], [BX0, RY, BZ], [BX0, BY0, BZ], [BX0, BY0, -BZ]], // rear
      [[BX0, BY0, BZ], [BX0, RY, BZ], [RX, RY, BZ], [RX, 0, BZ], [BX1, 0, BZ], [BX1, BY0, BZ]], // right wall
      [[BX0, BY0, -BZ], [BX0, RY, -BZ], [RX, RY, -BZ], [RX, 0, -BZ], [BX1, 0, -BZ], [BX1, BY0, -BZ]], // left wall
      [[BX0, BY0, -BZ], [BX1, BY0, -BZ], [BX1, BY0, BZ], [BX0, BY0, BZ]], // bottom
    ];
    sc.solid(F, [10, -25, 0]);
    void c;
    // the hidden join line between the two blocks on the walls is internal: cover it with the wall fill (already filled)
    // panel insets and screws
    L.wire.push(`<path d="${poly([[RX + 4, 0.1, -BZ + 4], [BX1 - 4, 0.1, -BZ + 4], [BX1 - 4, 0.1, BZ - 4], [RX + 4, 0.1, BZ - 4]], true)}" stroke-opacity=".55"/>`);
    L.wire.push(`<path d="${poly([[BX0 + 4, RY + 0.1, -BZ + 4], [RX - 3, RY + 0.1, -BZ + 4], [RX - 3, RY + 0.1, BZ - 4], [BX0 + 4, RY + 0.1, BZ - 4]], true)}" stroke-opacity=".55"/>`);
    for (const [x, y, z] of [[BX1 - 8, 0, -BZ + 8], [BX1 - 8, 0, BZ - 30], [RX + 8, 0, -BZ + 8], [RX + 8, 0, 18], [BX0 + 8, RY, -BZ + 9], [BX0 + 8, RY, BZ - 9], [RX - 8, RY, -BZ + 9], [RX - 8, RY, BZ - 9]]) L.wire.push(ellipse([x, y + 0.1, z], UP, 1.6));
    // front face: seam + vent slots; right wall: seam
    L.wire.push(`<path d="${poly([[BX1, BY0 + 8, -BZ + 6], [BX1, BY0 + 8, BZ - 6]])}" stroke-opacity=".4"/>`);
    for (let i = 0; i < 10; i++) { const z = -40 + i * 8; L.wire.push(`<path d="${poly([[BX1, -36, z], [BX1, -36, z + 4], [BX1, -16, z + 4], [BX1, -16, z]], true)}" stroke-opacity=".6"/>`); }
    L.wire.push(`<path d="${poly([[BX0 + 6, BY0 + 8, BZ], [BX1 - 6, BY0 + 8, BZ]])}" stroke-opacity=".4"/>`);
    for (let i = 0; i < 6; i++) { const x = 30 + i * 7; L.accent.push(`<path d="${poly([[x, -40, BZ], [x + 3, -40, BZ], [x + 7, -33, BZ], [x + 4, -33, BZ]], true)}" stroke-width="1.1"/>`); }
    // feet
    for (const [x, z] of [[BX0 + 12, -BZ + 12], [BX1 - 12, -BZ + 12], [BX1 - 12, BZ - 12], [BX0 + 12, BZ - 12]]) L.wire.push(ellipse([x, BY0 - 3, z], UP, 8, ' stroke-opacity=".6"'));
    sc.floor(BY0 - 5, -180, 160, -150, 150);
  }
  /* ------------------------------------------------ gate (slot) with IDLE / OFF detents */
  const SX0 = -46, SX1 = 32;
  L.wire.push(`<path d="${poly([[SX0, 0.15, -45], [SX1, 0.15, -45], [SX1, 0.15, -5], [SX0, 0.15, -5]], true)}" stroke-width="1.4"/>`);
  for (const z of [ZL, ZR]) L.wire.push(`<path d="${poly([[SX0 + 4, 0.2, z - 3], [SX1 - 4, 0.2, z - 3], [SX1 - 4, 0.2, z + 3], [SX0 + 4, 0.2, z + 3]], true)}" stroke-opacity=".7"/>`);
  L.axis.push(`<path d="${poly([[SX0 + 10, 0.3, -48], [SX0 + 10, 0.3, -2]])}" stroke-dasharray="3 3"/>`);
  for (let x = SX0 + 18; x <= SX1 - 4; x += 10) L.wire.push(`<path d="${poly([[x, 0.2, -2], [x, 0.2, 2]])}" stroke-opacity=".6"/>`);
  text([SX1 + 2, 0, 0], 'MAX', 'sm', 'start');
  text([SX0 + 10, 0, 6], 'IDLE', 'sm', 'start');
  text([SX0 + 2, 0, 6], 'OFF', 'sm', 'start');
  /* ------------------------------------------------ levers (thin arms) and grips */
  const quad = (x0, x1, z0, z1, y) => [[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]];
  const arm = (Xc, Zc, Gz) => {
    const post = sc.prism(quad(Xc - 7, Xc + 7, Zc - 2, Zc + 2, 0), quad(Xc - 10, Xc + 10, Zc - 3, Zc + 3, GY - 4));
    const shoe = sc.prism(quad(Xc - 24, Xc + 20, Gz - 11, Gz + 11, GY - 3), quad(Xc - 24, Xc + 20, Gz - 11, Gz + 11, YB));
    return [...post, ...shoe];
  };
  const PROF = [[-30, 44, 1, 0], [-28.5, 50, 1, 0], [-20, 54, 1, 0], [-4, 55.5, 1, 0], [12, 54, 1, 0], [23, 49, 1, 0], [29.5, 41, 1, 0], [31.5, 33, 1, 0]];
  const gL = sc.boxLoft(XL, YB, GZL, PROF.map(([x, h]) => [x * 1.12 - 3, h * 1.04, 16.5, 0]), 7);
  const gR = sc.boxLoft(XR, YB, GZR, PROF.map(([x, h]) => [x * 1.2, h * 1.15, 19.5, 0]), 7);
  const aL = arm(XL, ZL, GZL), aR = arm(XR, ZR, GZR);
  const hL = sc.drawBoxLoft(gL), hR = sc.drawBoxLoft(gR);
  // brushed-panel lines on the grips' tops
  for (const g of [gL, gR]) for (let i = 0; i < 4; i++) { const k = 2 + i * 1.1, ps = []; for (let j = 0; j <= 10; j++) ps.push(add(g.surf(k, 60 + j * 6), mul(g.surfN(k, 60 + j * 6), 0.4))); L.accent.push(`<path d="${smooth(ps)}" stroke-width="1.2"/>`); }
  anchor('lthr', [XL + 8, GY * 0.5, ZL + 3]);
  region('lthr', grow(hull([...aL, ...hL]), 2), grow(hull([P2([SX0 + 4, 0, ZL - 4]), P2([SX1 - 4, 0, ZL - 4]), P2([SX1 - 4, 0, ZL + 4]), P2([SX0 + 4, 0, ZL + 4])]), 2));
  anchor('rthr', [XR + 8, GY * 0.5, ZR + 3]);
  region('rthr', grow(hull([...aR, ...hR]), 2), grow(hull([P2([SX0 + 4, 0, ZR - 4]), P2([SX1 - 4, 0, ZR - 4]), P2([SX1 - 4, 0, ZR + 4]), P2([SX0 + 4, 0, ZR + 4])]), 2));
  // idle cutoff detents: one marker per lever track at the OFF end
  for (const [id, z] of [['loff', ZL], ['roff', ZR]]) {
    const r = [[SX0 + 2, 0.4, z - 4], [SX0 + 12, 0.4, z - 4], [SX0 + 12, 0.4, z + 4], [SX0 + 2, 0.4, z + 4]];
    L.axis.push(`<path d="${poly(r, true)}" stroke-width="1.1"/>`);
    anchor(id, [SX0 + 7, 0.4, z]);
    region(id, grow(r.map(P2), 3));
  }
  /* ------------------------------------------------ right grip: front face (coolie hat, slew), right side (MIC, speedbrake, boat, china hat) */
  {
    let [p, n] = gR.endFace(true, 0.5, 0.25); sc.hat('coolie', p, n, 6, UP, { rings: true });
    [p, n] = gR.endFace(true, -0.42, 0.25); sc.ministick('slew', p, n, 5, { post: 4, spokes: true });
    // MIC switch: 4-way + push on a stem sticking out of the right side, top front corner
    [p, n] = gR.sideAt(XR + 33, 1, 0.86); sc.hat('mic', p, nrm(add(n, [0.35, 0.15, 0])), 5.6, [1, 0, 0], { stalk: 7 });
    const slide = (id, x, phi, len, wid, tall) => { // fore-aft slide / rocker switch on the side face
      const [q, nn] = gR.sideAt(x, 1, phi), fw = [1, 0, 0], up = cross(nn, fw);
      const slot = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => add(q, add(mul(fw, a * (len + 3)), mul(up, b * (wid + 1.5)))));
      L.ctl.push(`<path d="${poly(slot, true)}" stroke-opacity=".55"/>`);
      const top = add(q, mul(nn, tall));
      const kb = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => add(q, add(mul(fw, a * len * 0.55), mul(up, b * wid))));
      const kt = kb.map((v) => add(v, mul(nn, tall)));
      L.ctlFill.push(`<path d="${poly(kt, true)}"/>`);
      L.ctl.push(`<path d="${poly(kt, true)}"/>`, ...kb.map((v, i) => `<path d="${poly([v, kt[i]])}" stroke-opacity=".7"/>`));
      for (const a of [-0.25, 0, 0.25]) L.ctl.push(`<path d="${poly([add(top, add(mul(fw, a * len), mul(up, -wid * 0.7))), add(top, add(mul(fw, a * len), mul(up, wid * 0.7)))])}" stroke-opacity=".7"/>`);
      anchor(id, top);
      region(id, grow(hull([...slot, ...kt].map(P2)), 3));
    };
    slide('spdbrk', XR + 23, 0.3, 6.5, 3.4, 3.6);
    slide('boat', XR + 25, -0.12, 5.5, 3, 3.4);
    slide('china', XR + 28, -0.52, 4.5, 2.8, 4.4);
  }
  /* ------------------------------------------------ left grip: front button, pinky switch (left side, towards the back) */
  {
    const [p, n] = gL.endFace(true, 0.05, 0.25); sc.button('ltb', p, n, 4.4, 3.4);
    const [q, nn] = gL.sideAt(XL - 14, -1, -0.1);
    sc.toggle('pinky', q, nn, { len: 10, lean: [-0.3, 0.2, 0], r: 2.8, hidden: true });
  }
  /* ------------------------------------------------ panel (main deck): fuel flow, engine operate, APU, L/G horn, friction slider, flaps */
  const tog = (id, x, z, lean = [0.45, 0, 0], y = 0) => sc.toggle(id, [x, y, z], UP, { len: 13, lean });
  { // fuel flow L / R: one callout, one glow outline per switch
    const o1 = sc.toggle(null, [68, 0, 12], UP, { len: 13, lean: [0.45, 0, 0] }), o2 = sc.toggle(null, [68, 0, 40], UP, { len: 13, lean: [0.45, 0, 0] });
    anchor('ff', [72, 7, 26]);
    region('ff', o1, o2);
    sc.inputRegion('ff', [o1, o2]);
  }
  text([56, 0, 26], 'FUEL FLOW', 'sm');
  tog('eol', 26, 12); tog('eor', 26, 40);
  text([14, 0, 26], 'ENG OPER', 'sm');
  tog('apu', 1, 26, [-0.45, 0, 0]);
  text([-11, 0, 26], 'APU', 'sm');
  { const c = [-36, 0, 26]; L.ctl.push(ellipse(c, UP, 9.5, ' stroke-opacity=".5"')); sc.button('lgsil', c, UP, 5.2, 4.2); text([-50, 0, 26], 'L/G SIL', 'sm'); }
  // status LEDs and the mechanical friction wheel (not an input)
  for (let i = 0; i < 5; i++) L.accent.push(ellipse([62 - i * 5, 0.2, -2], UP, 1.3, ' stroke-width="1.6"'));
  sc.wheel(null, [84, 0, -22], UP, [0, 0, 1], 5, 26);
  // friction control slider (Slider 0): fin in a fore-aft slot by the right edge
  {
    const z = 54, x0 = -46, x1 = 0, xf = -24;
    L.wire.push(`<path d="${poly([[x0, 0.2, z - 3], [x1, 0.2, z - 3], [x1, 0.2, z + 3], [x0, 0.2, z + 3]], true)}"/>`);
    for (let x = x0 + 4; x <= x1 - 2; x += 6) L.wire.push(`<path d="${poly([[x, 0.2, z + 5], [x, 0.2, z + 8]])}" stroke-opacity=".6"/>`);
    const pr = [[xf - 6, 0], [xf + 6, 0], [xf + 9, 13], [xf + 2, 15], [xf - 4, 9]];
    const a = pr.map(([x, y]) => P2([x, y, z + 2.5])), b = pr.map(([x, y]) => P2([x, y, z - 2.5]));
    L.ctlFill.push(`<path d="${smooth2(a, true)}"/>`);
    L.ctl.push(`<path d="${poly(pr.map(([x, y]) => [x, y, z + 2.5]), true)}"/>`, `<path d="${poly(pr.map(([x, y]) => [x, y, z - 2.5]), true)}" stroke-opacity=".5"/>`);
    for (const [x, y] of pr) L.ctl.push(`<path d="${poly([[x, y, z + 2.5], [x, y, z - 2.5]])}" stroke-opacity=".6"/>`);
    anchor('frict', [xf + 2, 9, z]);
    region('frict', grow(hull([...a, ...b, P2([x0, 0, z - 4]), P2([x1, 0, z - 4]), P2([x1, 0, z + 4]), P2([x0, 0, z + 4])]), 3));
  }
  // flaps lever: 3-position (UP / MVR / DN) block lever by the left edge of the gate
  {
    const z = -57, xh = -14;
    L.wire.push(`<path d="${poly([[-30, 0.2, z - 3], [2, 0.2, z - 3], [2, 0.2, z + 3], [-30, 0.2, z + 3]], true)}"/>`);
    const post = sc.prism(quad(xh - 1.5, xh + 1.5, z - 1.5, z + 1.5, 0), quad(xh - 1.5, xh + 1.5, z - 1.5, z + 1.5, 8), { wire: L.ctl, sil: L.ctl, fill: false });
    const head = sc.prism(quad(xh - 5, xh + 5, z - 8, z + 4, 8), quad(xh - 5, xh + 5, z - 8, z + 4, 16), { wire: L.ctl, sil: L.ctl, fill: false });
    L.ctlFill.push(`<path d="${sc.d2(hull(head))}"/>`);
    for (const [x, lab] of [[0, 'UP'], [-14, 'MVR'], [-28, 'DN']]) text([x, 0, z - 11], lab, 'sm');
    anchor('flaps', [xh, 16, z - 2]);
    region('flaps', grow(hull([...post, ...head]), 3));
  }
  /* ------------------------------------------------ rear strip: EAC, radar altimeter, autopilot engage, autopilot mode */
  {
    const x = -90, y = RY;
    sc.toggle('eac', [x, y, -48], UP, { len: 12, lean: [0.45, 0, 0] }); text([x - 14, y, -48], 'EAC', 'sm');
    sc.toggle('rdr', [x, y, -22], UP, { len: 12, lean: [0.45, 0, 0] }); text([x - 14, y, -22], 'RDR ALT', 'sm');
    L.ctl.push(ellipse([x, y, 5], UP, 9, ' stroke-opacity=".5"')); sc.button('apeng', [x, y, 5], UP, 5.6, 4.2); text([x - 14, y, 5], 'AP ENG', 'sm');
    sc.toggle('apsel', [x, y, 31], UP, { len: 12, lean: [0, 0, 0] }); text([x - 14, y, 31], 'PATH · ALT', 'sm');
  }
  const fadeHull = sc.d2(hull([BX0, BX1].flatMap((x) => [BY0 - 5, 0].flatMap((y) => [-BZ, BZ].map((z) => P2([x, y, z]))))));
  return sc.result({ fadeHull, beam: [230, 380, 620, 770] });
}
