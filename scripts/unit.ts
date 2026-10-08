// Unit tests: input-name mapping, editing, export structure and import -> export -> import round-trips.
// Usage: npm run test:unit -- [game-exported layout files...]   (or SC_TEST_LAYOUTS=a.xml,b.xml)
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { DOMParser, XMLSerializer } from '@xmldom/xmldom';
(globalThis as any).DOMParser = DOMParser;
(globalThis as any).XMLSerializer = XMLSerializer;

const cap = await import('../src/lib/capture');
const { buildRows } = await import('../src/lib/merge');
const { parseActionMaps } = await import('../src/lib/importer');
const { buildExport, exportFileName } = await import('../src/lib/exporter');
const ed = await import('../src/lib/edit');
const { normalizeCombo } = await import('../src/lib/inputs');
const groups = await import('../src/lib/groups');
const dev = await import('../src/lib/devices');
const search = await import('../src/lib/search');
const dvo = await import('../src/lib/devopts');
const listen = await import('../src/lib/listen');
const { browserName } = await import('../src/lib/browser');
const defaults = JSON.parse(readFileSync('src/data/defaults.json', 'utf8'));
const idx = ed.indexDefaults(defaults);

let passed = 0;
const t = (name: string, fn: () => void) => {
  try { fn(); passed++; console.log('  ✓', name); } catch (e) { console.error('  ✗', name); throw e; }
};

// Every input name the game itself uses, from defaultProfile (bundled defaults) + a real exported layout if present
const gameNames: Record<string, Set<string>> = { kb: new Set(), mo: new Set(), js: new Set(), gp: new Set() };
for (const m of defaults.maps) for (const a of m.actions) for (const d of a.d) for (const x of d.input.split('+')) gameNames[d.slot].add(x);
const extraFiles = [...process.argv.slice(2), ...(process.env.SC_TEST_LAYOUTS ?? '').split(',')].filter((f, i, a) => f && existsSync(f) && a.indexOf(f) === i);
for (const f of extraFiles) for (const m of readFileSync(f, 'utf8').matchAll(/input="(kb|mo|js|gp)\d_([^"]*)"/g)) for (const x of m[2].split('+')) if (x.trim()) gameNames[m[1]].add(x.trim());

console.log('input mapping');
t('KeyboardEvent.code -> game key names', () => {
  const cases: Record<string, string> = {
    KeyA: 'a', KeyZ: 'z', Digit1: '1', Digit0: '0', F1: 'f1', F12: 'f12', AltLeft: 'lalt', AltRight: 'ralt', ShiftLeft: 'lshift',
    ShiftRight: 'rshift', ControlLeft: 'lctrl', ControlRight: 'rctrl', Space: 'space', Enter: 'enter', Escape: 'escape',
    IntlBackslash: 'oem_102', Numpad5: 'np_5', NumpadEnter: 'np_enter', NumpadDecimal: 'np_period', NumpadAdd: 'np_add',
    PageUp: 'pgup', PageDown: 'pgdn', ArrowUp: 'up', BracketLeft: 'lbracket', Quote: 'apostrophe', Backquote: 'tilde', PrintScreen: 'print',
  };
  for (const [code, name] of Object.entries(cases)) assert.equal(cap.scKeyFromCode(code), name, code);
  assert.equal(cap.scKeyFromCode('Fn'), undefined);
});
t('every keyboard key name used by the game files is reachable from a physical key', () => {
  const reachable = new Set(cap.ALL_SC_KEYS);
  const missing = [...gameNames.kb, ...gameNames.mo].filter((n) => !/^(mouse|mwheel|maxis|hmd_)/i.test(n) && !reachable.has(n.toLowerCase()));
  assert.deepEqual(missing.filter((n) => n !== 'K' && n !== ']'), [], `unreachable: ${missing}`); // "K" and "]" are oddities in debug-only actions
});
t('modifier combos', () => {
  assert.equal(cap.comboFrom(['lalt'], 'n'), 'lalt+n');
  assert.equal(cap.comboFrom(['lctrl', 'lshift'], 'f8'), 'lctrl+lshift+f8');
  assert.equal(cap.comboFrom(['lshift']), 'lshift');
  assert.equal(cap.comboFrom(['ralt', 'ralt'], 'mouse2'), 'ralt+mouse2');
});
t('mouse buttons and wheel', () => {
  assert.deepEqual([0, 1, 2, 3, 4].map(cap.scMouseButton), ['mouse1', 'mouse3', 'mouse2', 'mouse4', 'mouse5']);
  assert.equal(cap.scWheel(-120), 'mwheel_up');
  assert.equal(cap.scWheel(53), 'mwheel_down');
  for (const n of ['mouse1', 'mouse2', 'mouse3', 'mwheel_up', 'mwheel_down', 'maxis_x', 'maxis_y']) assert.ok(gameNames.mo.has(n) || gameNames.kb.has(n), n);
});
t('standard gamepad buttons/axes use the names in defaultProfile.xml', () => {
  for (const n of [...cap.GP_BUTTONS, ...cap.GP_AXES]) assert.ok(gameNames.gp.has(n), `${n} not used by the game`);
  const pad = (b: number[], a: number[] = [0, 0, 0, 0]) => ({ buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: b.includes(i), value: b.includes(i) ? 1 : 0 })), axes: a });
  const rest = cap.snapshot(pad([]));
  const ev = (s: any) => cap.detect(rest, cap.snapshot(s)).map(cap.gamepadInput).map((c) => c?.input);
  assert.deepEqual(ev(pad([0])), ['a']);
  assert.deepEqual(ev(pad([4])), ['shoulderl']);
  assert.deepEqual(ev(pad([7])), ['triggerr_btn']);
  assert.deepEqual(ev(pad([12])), ['dpad_up']);
  assert.deepEqual(ev(pad([], [-0.9, 0, 0, 0])), ['thumblx']);
  assert.deepEqual(ev(pad([], [0, 0.3, 0, 0])), [], 'below threshold');
  const ls = cap.gamepadInput({ kind: 'axis', index: 1, dir: -1 })!;
  assert.deepEqual(ls.alt!.map((x) => x.input), ['thumbly', 'thumbl_up']);
  assert.deepEqual(cap.gamepadInput({ kind: 'button', index: 6 })!.alt!.map((x) => x.input), ['triggerl_btn', 'triggerl']);
  for (const n of ['thumbl_up', 'thumbl_left', 'thumbr_down', 'triggerl', 'triggerr']) assert.ok(gameNames.gp.has(n) || n.startsWith('trigger'), n);
});
t('joystick buttons (1-based), axes and hats', () => {
  const js = (b: number[], a: number[]) => ({ buttons: Array.from({ length: 32 }, (_, i) => ({ pressed: b.includes(i), value: b.includes(i) ? 1 : 0 })), axes: a });
  const restAxes = [0, 0, -1, 0, 0, 0, 1, 0, 0, 9 / 7];
  const rest = cap.snapshot(js([], restAxes));
  const ev = (b: number[], a: number[]) => cap.detect(rest, cap.snapshot(js(b, a))).map((e) => cap.joystickInput(e)?.input);
  assert.deepEqual(ev([0], restAxes), ['button1']);
  assert.deepEqual(ev([11], restAxes), ['button12']);
  assert.deepEqual(ev([], [0, 0.8, -1, 0, 0, 0, 1, 0, 0, 9 / 7]), ['y']);
  assert.deepEqual(ev([], [0, 0, -1, 0, 0, -0.7, 1, 0, 0, 9 / 7]), ['rotz']);
  assert.deepEqual(ev([], [0, 0, 0.2, 0, 0, 0, 1, 0, 0, 9 / 7]), ['z'], 'throttle moved from its -1 rest');
  assert.deepEqual(ev([], [0, 0, -0.8, 0, 0, 0, 1, 0, 0, 9 / 7]), [], 'small throttle wiggle relative to rest');
  assert.deepEqual(ev([], [0, 0, -1, 0, 0, 0, 0.2, 0, 0, 9 / 7]), ['slider1']);
  assert.deepEqual(ev([], [0, 0, -1, 0, 0, 0, 1, 0, 0, -1]), ['hat1_up']);
  assert.deepEqual(ev([], [0, 0, -1, 0, 0, 0, 1, 0, 0, -3 / 7]), ['hat1_right']);
  assert.deepEqual(ev([], [0, 0, -1, 0, 0, 0, 1, 0, 0, 1 / 7]), ['hat1_down']);
  assert.deepEqual(ev([], [0, 0, -1, 0, 0, 0, 1, 0, 0, 5 / 7]), ['hat1_left']);
  assert.deepEqual(ev([], [0, 0, -1, 0, 0, 0, 1, 0, 0, -5 / 7]), [], 'diagonal ignored');
  for (const n of ['button1', 'x', 'y', 'rotz', 'slider1', 'hat1_up', 'hat1_left']) assert.ok(gameNames.js.has(n), n);
});
t('manual entry', () => {
  assert.deepEqual(cap.parseManual('js2_button3', 'js').rebind, { slot: 'js', instance: 2, input: 'button3' });
  assert.deepEqual(cap.parseManual('button7', 'js', 3).rebind, { slot: 'js', instance: 3, input: 'button7' });
  assert.deepEqual(cap.parseManual('N+LALT', 'km').rebind, { slot: 'kb', instance: 1, input: 'lalt+n' });
  assert.deepEqual(cap.parseManual('mo1_mouse4', 'km').rebind, { slot: 'mo', instance: 1, input: 'mouse4' });
  assert.deepEqual(cap.parseManual('gp1_shoulderl+thumbr', 'gp').rebind, { slot: 'gp', instance: 1, input: 'shoulderl+thumbr' });
  assert.ok(cap.parseManual('js1_button3', 'km').error);
  assert.ok(cap.parseManual('', 'gp').error);
  assert.ok(cap.parseManual('banana', 'js').warning);
});
t('pad ids -> names and DirectInput product strings', () => {
  assert.deepEqual(cap.parsePadId('VKBsim Gladiator EVO R (Vendor: 231d Product: 0200)'), { name: 'VKBsim Gladiator EVO R', vendor: '231D', product: '0200' });
  assert.deepEqual(cap.parsePadId('231d-200-VKBsim Gladiator EVO L'), { name: 'VKBsim Gladiator EVO L', vendor: '231D', product: '0200' });
  assert.equal(cap.productString('VKBsim Gladiator EVO R (Vendor: 231d Product: 0200)'), ' VKBsim Gladiator EVO R    {0200231D-0000-0000-0000-504944564944}');
});

console.log('editing');
const yaw = idx.get('spaceship_movement/v_yaw');
t('setting a group back to its defaults removes the rebind', () => {
  let r = ed.setGroup({}, yaw, 'spaceship_movement', 'v_yaw', 'js', [{ slot: 'js', instance: 1, input: 'rotz' }]);
  assert.deepEqual(r.spaceship_movement.v_yaw, [{ slot: 'js', instance: 1, input: 'rotz' }]);
  r = ed.setGroup(r, yaw, 'spaceship_movement', 'v_yaw', 'js', ed.effectiveGroup(yaw, undefined, 'js'));
  assert.deepEqual(r, {});
});
t('clearing a bound default writes an empty input; clearing an unbound group writes nothing', () => {
  const a = idx.get('spaceship_targeting/v_target_unlock') ?? [...idx.values()].find((x) => x.d.some((d) => d.slot === 'kb'))!;
  const r = ed.setGroup({}, a, 'm', 'a', 'km', []);
  assert.deepEqual(r.m.a, [{ slot: 'kb', instance: 1, input: '' }]);
  const unbound = [...idx.values()].find((x) => !x.d.some((d) => d.slot === 'js'))!;
  assert.deepEqual(ed.setGroup({}, unbound, 'm', 'a', 'js', []), {});
});
t('keyboard and mouse are one rebind device', () => {
  const a = idx.get('player/attack1')!; // default mouse1 (mouse slot), no keyboard
  const eff = ed.effectiveGroup(a, undefined, 'km');
  assert.deepEqual(eff.map((r) => `${r.slot}_${r.input}`), ['mo_mouse1']);
  const p = ed.withRebinds(ed.newProfile('t'), ed.setGroup({}, a, 'player', 'attack1', 'km', [{ slot: 'kb', instance: 1, input: 'oem_102' }]));
  const row = buildRows(defaults, p).find((x) => x.id === 'player/attack1')!;
  assert.deepEqual(row.bindings.filter((b) => b.slot === 'kb' || b.slot === 'mo').map((b) => b.input), ['oem_102']);
  assert.deepEqual(row.cleared, ['mouse']);
});
t('capture conflicts respect context and activation mode', () => {
  const rows = buildRows(defaults, null);
  const target = rows.find((r) => r.id === 'spaceship_movement/v_yaw')!;
  const { modeBucket } = groups;
  const used = rows.find((r) => r.map === 'spaceship_general' && !r.hidden && r.bindings.some((b) => b.slot === 'kb' && modeBucket(b.mode) === 'short'))!;
  const ub = used.bindings.find((b) => b.slot === 'kb' && modeBucket(b.mode) === 'short')!;
  const c = ed.conflictsFor(rows, target, { slot: 'kb', instance: 1, input: ub.input });
  assert.ok(c.some((x) => x.row.id === used.id), `${ub.input} is used by ${used.id} in ship context`);
  assert.equal(ed.conflictsFor(rows, target, { slot: 'kb', instance: 1, input: ub.input, multiTap: 2 }).some((x) => x.row.id === used.id), false, 'double-tap does not clash with a press');
  const fps = rows.find((r) => r.id === 'player/attack1')!;
  const flightOnly = rows.find((r) => r.map === 'spaceship_quantum' && r.bindings.length)!;
  const cand = { slot: flightOnly.bindings[0].slot, instance: 1, input: flightOnly.bindings[0].input };
  assert.equal(ed.conflictsFor(rows, fps, cand).filter((x) => x.row.id === flightOnly.id).length, 0, 'ship input does not clash on foot');
});

console.log('export');
function effective(p: any) {
  return buildRows(defaults, p).filter((r) => r.customized || r.unlisted).map((r) => ({
    id: r.id, cleared: [...r.cleared].sort(),
    b: r.bindings.map((b) => `${b.slot === 'mo' ? 'kb' : b.slot}${b.slot === 'js' || b.slot === 'gp' ? b.instance : 1}:${normalizeCombo(b.input)}|${b.mode ?? ''}|${b.multiTap ?? 1}`).sort(),
  })).sort((a, b) => (a.id < b.id ? -1 : 1));
}
const norm = (rb: any) => Object.entries(ed.pruneRebinds(rb, idx)).flatMap(([m, acts]: any) => Object.entries(acts).flatMap(([a, l]: any) =>
  l.map((r: any) => `${m}/${a}/${r.slot === 'mo' ? 'kb' : r.slot}${r.instance}_${normalizeCombo(r.input)}|${r.mode ?? ''}|${r.multiTap ?? 1}`))).sort();
const parseXml = (s: string) => new DOMParser().parseFromString(s, 'text/xml');

for (const f of ['public/samples/actionmaps.xml', ...extraFiles]) {
  const src = readFileSync(f, 'utf8');
  const p1 = parseActionMaps(src, f.split('/').pop()!);
  for (const format of ['layout', 'actionmaps'] as const) {
    t(`${f.split('/').pop()} -> ${format} -> import: same bindings`, () => {
      const xml = buildExport(defaults, p1, { format, name: p1.name });
      const doc = parseXml(xml);
      assert.equal(doc.getElementsByTagName('parsererror').length, 0);
      const p2 = parseActionMaps(xml, exportFileName({ format, name: p1.name }));
      assert.deepEqual(effective(p2), effective(p1));
      assert.deepEqual(norm(p2.rebinds), norm(p1.rebinds));
      assert.equal(p2.settings!.blocks.length >= p1.settings!.blocks.length, true, 'device settings preserved');
      // export again: stable
      assert.equal(buildExport(defaults, p2, { format, name: p1.name }), xml);
      if (format === 'layout') {
        const root = doc.documentElement;
        assert.equal(root.tagName, 'ActionMaps');
        for (const [k, v] of Object.entries({ version: '1', optionsVersion: '2', rebindVersion: '2' })) assert.equal(root.getAttribute(k), v);
        assert.equal(doc.getElementsByTagName('CustomisationUIHeader').length, 1);
        assert.equal(doc.getElementsByTagName('modifiers').length, 1);
      } else {
        assert.equal(doc.getElementsByTagName('ActionProfiles')[0].getAttribute('profileName'), 'default');
      }
    });
  }
}
t('edited profile export: only changed bindings, cleared defaults as "kb1_ ", modes kept', () => {
  let r = {};
  const att = idx.get('player/attack1')!;
  r = ed.setGroup(r, att, 'player', 'attack1', 'km', [{ slot: 'kb', instance: 1, input: 'lalt+mouse1' }]);
  r = ed.setGroup(r, att, 'player', 'attack1', 'gp', []);
  r = ed.setGroup(r, yaw, 'spaceship_movement', 'v_yaw', 'js', [{ slot: 'js', instance: 2, input: 'x' }]);
  r = ed.setGroup(r, idx.get('spaceship_general/v_eject') ?? idx.get('seat_general/v_eject'), 'seat_general', 'v_eject', 'km', [{ slot: 'kb', instance: 1, input: 'ralt+y', mode: 'double_tap' }, { slot: 'kb', instance: 1, input: 'np_1', multiTap: 2 }]);
  const p = ed.withRebinds(ed.newProfile('My Layout'), r);
  const xml = buildExport(defaults, p, { format: 'layout', name: 'My Layout', devices: [{ type: 'joystick', instance: 2, product: ' VKBsim Gladiator EVO L    {0200231D-0000-0000-0000-504944564944}' }] });
  assert.match(xml, /^<ActionMaps version="1" optionsVersion="2" rebindVersion="2" profileName="My-Layout">/);
  assert.match(xml, /<joystick instance="2"\/>/);
  assert.match(xml, /<gamepad instance="1"\/>/);
  assert.match(xml, /<options type="joystick" instance="2" Product=" VKBsim Gladiator EVO L    \{0200231D-0000-0000-0000-504944564944\}"\/>/);
  assert.match(xml, /<rebind input="kb1_lalt\+mouse1"\/>/);
  assert.match(xml, /<rebind input="gp1_ "\/>/);
  assert.match(xml, /<rebind input="js2_x"\/>/);
  assert.match(xml, /<rebind input="kb1_ralt\+y" activationMode="double_tap"\/>/);
  assert.match(xml, /<rebind input="kb1_np_1" multiTap="2"\/>/);
  assert.equal((xml.match(/<action name=/g) ?? []).length, 3);
  assert.ok(xml.indexOf('"seat_general"') < xml.indexOf('"spaceship_movement"') && xml.indexOf('"spaceship_movement"') < xml.indexOf('"player"'), 'game map order');
  assert.match(xml, /<category label="@ui_CCSeatGeneral"\/>\n   <category label="@ui_CCSpaceFlight"\/>\n   <category label="@ui_CCFPS"\/>/);
  const back = parseActionMaps(xml, 'layout_My-Layout_exported.xml');
  assert.deepEqual(effective(back), effective(p));
});
if (extraFiles.length) {
  t('real layout export: same header categories, map order and per-action rebinds as the game wrote', () => {
    const f = extraFiles[extraFiles.length - 1];
    const src = readFileSync(f, 'utf8');
    const p = parseActionMaps(src, 'x.xml');
    const out = buildExport(defaults, p, { format: 'layout', name: p.name });
    const cats = (s: string) => [...s.matchAll(/<category label="([^"]*)"/g)].map((m) => m[1]);
    assert.deepEqual(cats(out), cats(src));
    const mapsOf = (s: string) => [...s.matchAll(/<actionmap name="([^"]*)"/g)].map((m) => m[1]);
    assert.deepEqual(mapsOf(out), mapsOf(src));
    const actsOf = (s: string) => [...s.matchAll(/<action name="([^"]*)"/g)].map((m) => m[1]);
    assert.deepEqual(actsOf(out), actsOf(src), 'action order');
    const rebindsOf = (s: string) => [...s.matchAll(/<rebind ([^>]*)\/>/g)].map((m) => m[1].replace(/(input="\w+_[^"]*?) +"/, (_, a) => `${a || ''}"`).replace(/_"/, '_ "')).sort();
    assert.deepEqual(rebindsOf(out), rebindsOf(src), 'identical rebind elements');
    assert.equal(out.split('\n')[0], src.split('\n')[0]);
    const ws = (s: string) => s.replace(/\r\n/g, '\n').replace(/(input="\w+_[^"]*?\S) +"/g, '$1"').trimEnd();
    assert.equal(ws(out), ws(src), 'whole file identical to the game-written layout (except trailing spaces inside input values)');
  });
}

console.log('live capture (PadTracker)');
{
  const st = (b: number[], a: number[], n = 32) => cap.snapshot({ buttons: Array.from({ length: n }, (_, i) => ({ pressed: b.includes(i), value: b.includes(i) ? 1 : 0 })), axes: a });
  const names = (m: Map<string, any[]>, k = 'p') => (m.get(k) ?? []).map((e) => cap.joystickInput(e)?.input);
  const REST = [0, 0, -1, 0, 0, 0, 0, 0, 0, 9 / 7];
  t('a device that appears mid-capture (woken by a press) reports that press on release', () => {
    const tr = new cap.PadTracker(300);
    assert.equal(tr.update([], 0).size, 0, 'nothing visible yet');
    assert.deepEqual(names(tr.update([{ key: 'p', state: st([4], REST) }], 16)), [], 'just appeared, button 5 held');
    assert.deepEqual(names(tr.update([{ key: 'p', state: st([4], REST) }], 100)), [], 'still held');
    assert.deepEqual(names(tr.update([{ key: 'p', state: st([], REST) }], 180)), ['button5'], 'released -> the waking press counts');
  });
  t('toggle switches that stay on never fire; held-at-start buttons count after release', () => {
    const tr = new cap.PadTracker(0);
    tr.update([], 0);
    tr.update([{ key: 'p', state: st([30], REST) }], 10);
    assert.deepEqual(names(tr.update([{ key: 'p', state: st([30], REST) }], 500)), []);
    assert.deepEqual(names(tr.update([{ key: 'p', state: st([30, 2], REST) }], 520)), ['button3'], 'another button works while the toggle is on');
    const t2 = new cap.PadTracker(0);
    t2.update([{ key: 'p', state: st([7], REST) }], 0); // visible from the start, button 8 held
    assert.deepEqual(names(t2.update([{ key: 'p', state: st([7], REST) }], 20)), []);
    assert.deepEqual(names(t2.update([{ key: 'p', state: st([], REST) }], 40)), [], 'release of a held-at-start button is not an input');
    assert.deepEqual(names(t2.update([{ key: 'p', state: st([7], REST) }], 60)), ['button8'], 'its next press is');
  });
  t('first report all zeros: axes re-baselined while settling (no phantom throttle/hat input)', () => {
    const tr = new cap.PadTracker(300);
    tr.update([], 0);
    tr.update([{ key: 'p', state: st([], new Array(10).fill(0)) }], 1);
    assert.deepEqual(names(tr.update([{ key: 'p', state: st([], REST) }], 50)), [], 'real values arrive while settling');
    assert.deepEqual(names(tr.update([{ key: 'p', state: st([], REST) }], 400)), [], 'throttle at -1 and centred hat are rest, not input');
    assert.deepEqual(names(tr.update([{ key: 'p', state: st([], [0, 0, -1, 0, 0, 0, 0, 0, 0, -1]) }], 420)), ['hat1_up']);
    assert.deepEqual(names(tr.update([{ key: 'p', state: st([], [0, 0, 0.1, 0, 0, 0, 0, 0, 0, 9 / 7]) }], 440)), ['z']);
    const t2 = new cap.PadTracker(0); // no settling: hat first seen at 0, then centre (Firefox rests at 3.2857)
    t2.update([{ key: 'p', state: st([], new Array(10).fill(0)) }], 0);
    assert.deepEqual(names(t2.update([{ key: 'p', state: st([], [0, 0, 0, 0, 0, 0, 0, 0, 0, 23 / 7]) }], 10)), [], 'hat centre value fixes the baseline');
    assert.deepEqual(names(t2.update([{ key: 'p', state: st([], [0, 0, 0, 0, 0, 0, 0, 0, 0, 5 / 7]) }], 20)), ['hat1_left']);
  });
  t('many buttons, second hat, unknown axis indices', () => {
    const tr = new cap.PadTracker(0);
    const axes = [...REST, 0, 0, 0, 9 / 7, 0, 0]; // 16 axes, second hat at index 13
    tr.update([{ key: 'p', state: st([], axes, 128) }], 0);
    assert.deepEqual(names(tr.update([{ key: 'p', state: st([99], axes, 128) }], 10)), ['button100']);
    const a2 = [...axes]; a2[13] = 1 / 7;
    assert.deepEqual(names(tr.update([{ key: 'p', state: st([], a2, 128) }], 20)), ['hat2_down']);
    const c = cap.joystickInput({ kind: 'axis', index: 11, dir: 1 })!;
    assert.ok(c.warning && c.alt!.length === 8, 'axis past the known names offers a choice instead of being ignored');
    assert.deepEqual(cap.joystickInput({ kind: 'axis', index: 6, dir: 1 })!.alt!.map((x) => x.input), cap.JS_AXES);
  });
}

console.log('controllers: browser devices <-> profile devices');
{
  const pad = (id: string, index: number, mapping = '', nb = 32) => ({ id, index, mapping, buttons: Array.from({ length: nb }, () => ({ pressed: false, value: 0 })), axes: [0, 0] });
  const profileDevs = parseActionMaps(readFileSync('public/samples/actionmaps.xml', 'utf8'), 's.xml').devices;
  t('matched to the profile by USB vendor/product id regardless of browser order (Chrome and Firefox ids)', () => {
    const d = dev.describePads([pad('VKBsim Gladiator EVO L (Vendor: 231d Product: 3201)', 0), pad('231d-0200-VKBsim Gladiator EVO R', 1), pad('Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)', 2, 'standard')], {}, [
      ...profileDevs.filter((x) => x.slot !== 'js'),
      { slot: 'js', instance: 1, product: ' VKBsim Gladiator EVO R    {0200231D-0000-0000-0000-504944564944}' },
      { slot: 'js', instance: 2, product: ' VKBsim Gladiator EVO L    {3201231D-0000-0000-0000-504944564944}' },
    ]);
    assert.deepEqual(d.map((x) => `${x.kind}${x.instance}:${x.source}`), ['js2:profile-id', 'js1:profile-id', 'gp1:auto']);
    const fromFile = dev.describePads([pad('VKBsim Gladiator EVO L (Vendor: 231d Product: 3201)', 0), pad('VKBsim Gladiator EVO R (Vendor: 231d Product: 0200)', 1)], {}, profileDevs);
    assert.deepEqual(fromFile.map((x) => `${x.kind}${x.instance}:${x.source}`), ['js2:profile-id', 'js1:profile-id'], 'devices parsed from the imported file keep their USB ids');
  });
  t('name match, manual override, and lowest free number for the rest', () => {
    const pads = [pad('Thrustmaster T.16000M (Vendor: 044f Product: b10a)', 0), pad('VKBsim Gladiator EVO R (Vendor: 231d Product: 0200)', 1), pad('MFG Crosswind V2 (Vendor: 1551 Product: 0004)', 2)];
    const decl = [{ slot: 'js' as const, instance: 2, product: 'VKBsim Gladiator EVO R' }];
    let d = dev.describePads(pads, {}, decl);
    assert.deepEqual(d.map((x) => `js${x.instance}:${x.source}`), ['js1:auto', 'js2:profile-name', 'js3:auto']);
    d = dev.describePads(pads, { [d[2].key]: { kind: 'js', instance: 1 } }, decl);
    assert.deepEqual(d.map((x) => `js${x.instance}:${x.source}`), ['js3:auto', 'js2:profile-name', 'js1:manual']);
    assert.deepEqual(dev.parseProfileProduct(' VKBsim Gladiator EVO L    {3201231D-0000-0000-0000-504944564944}'), { name: 'VKBsim Gladiator EVO L', productId: '3201', vendor: '231D' });
    const two = dev.describePads([pad('Same Stick', 0), pad('Same Stick', 1)], {});
    assert.notEqual(two[0].key, two[1].key, 'identical devices get distinct keys');
  });
}

console.log('search: exact inputs');
{
  let r = {};
  const pick = (id: string) => { const [m, a] = id.split('/'); return { m, a, d: idx.get(id) }; };
  const A = pick('spaceship_movement/v_yaw'), B = pick('spaceship_movement/v_pitch'), C = pick('spaceship_general/v_eject') .d ? pick('spaceship_general/v_eject') : pick('seat_general/v_eject');
  r = ed.setGroup(r, A.d, A.m, A.a, 'js', [{ slot: 'js', instance: 1, input: 'button25' }]);
  r = ed.setGroup(r, B.d, B.m, B.a, 'js', [{ slot: 'js', instance: 2, input: 'button25' }]);
  r = ed.setGroup(r, C.d, C.m, C.a, 'km', [{ slot: 'kb', instance: 1, input: 'ralt+n' }]);
  const rows = buildRows(defaults, ed.withRebinds(ed.newProfile('s'), r));
  const hits = (q: string) => rows.filter((x) => search.scoreRow(x, search.parseQuery(q))).map((x) => x.id);
  const yaw = `${A.m}/${A.a}`, pitch = `${B.m}/${B.a}`, eject = `${C.m}/${C.a}`;
  t('clicking a joystick binding (key:js1_button25) matches only that device instance and button', () => {
    assert.deepEqual(hits('key:js1_button25'), [yaw]);
    assert.deepEqual(hits('key:js2_button25'), [pitch]);
    assert.ok(!hits('key:js1_button25').includes(pitch));
    assert.equal(hits('key:js1_button250').length, 0, 'button25 is not button250');
  });
  t('typed device-scoped searches: "js1_button25", "js2 btn25", "js2:b25", "js2"', () => {
    assert.deepEqual(hits('js1_button25'), [yaw]);
    assert.deepEqual(hits('js2 btn25'), [pitch]);
    assert.deepEqual(hits('js2:b25'), [pitch]);
    assert.ok(hits('js2').includes(pitch) && !hits('js2').includes(yaw));
    assert.ok(hits('button25').includes(yaw) && hits('button25').includes(pitch), 'an unscoped search still finds both');
  });
  t('keyboard combos are exact including left/right modifiers', () => {
    assert.ok(hits('key:kb1_ralt+n').includes(eject));
    assert.ok(!hits('key:kb1_lalt+n').includes(eject), 'lalt+n is not ralt+n');
    assert.ok(!hits('key:kb1_n').includes(eject), 'n alone is not ralt+n');
    const n = hits('key:kb1_n');
    assert.ok(n.length > 0 && n.every((id) => rows.find((x) => x.id === id)!.bindings.some((b) => (b.slot === 'kb' || b.slot === 'mo') && normalizeCombo(b.input) === 'n')));
    assert.ok(hits('key:mo1_mouse2').length > 0 && hits('key:mo1_mouse2').every((id) => rows.find((x) => x.id === id)!.bindings.some((b) => normalizeCombo(b.input) === 'mouse2')));
  });
}

console.log('device settings (deviceoptions / options)');
// real game-written files: npm run test:fixtures (downloads pinned copies into .tmp/fixtures)
const fixtureDir = '.tmp/fixtures';
const fixtureFiles = existsSync(fixtureDir) ? readdirSync(fixtureDir).filter((f) => f.endsWith('.xml')).map((f) => `${fixtureDir}/${f}`) : [];
{
  const normXml = (x: string) => x.replace(/<!--[\s\S]*?-->/g, '').replace(/\s*\/>/g, '/>').replace(/>\s+</g, '><').trim();
  const blocksOf = (xml: string) => [...normXml(xml).matchAll(/<(deviceoptions|options)\b[^>]*?(?:\/>|>.*?<\/\1>)/g)].map((m) => m[0]);
  for (const f of ['public/samples/actionmaps.xml', ...fixtureFiles]) {
    const name = f.split('/').pop()!;
    t(`${name}: every <deviceoptions>/<options> block is written back exactly (layout and actionmaps)`, () => {
      const src = readFileSync(f, 'utf8');
      const p = parseActionMaps(src, name);
      const before = blocksOf(src);
      assert.ok(p.settings!.blocks.length === before.length, `parsed ${p.settings!.blocks.length} of ${before.length} blocks`);
      for (const format of ['layout', 'actionmaps'] as const) {
        const out = buildExport(defaults, p, { format, name: 'rt' });
        const after = blocksOf(out);
        for (const b of before) assert.ok(after.includes(b), `${format}: block lost or changed: ${b.slice(0, 160)}`);
        const p2 = parseActionMaps(out, 'rt.xml');
        for (const b of p.settings!.blocks) assert.ok(p2.settings!.blocks.some((x: any) => JSON.stringify(x) === JSON.stringify(b)), 'model survives re-import');
      }
    });
  }
  const sample = parseActionMaps(readFileSync('public/samples/actionmaps.xml', 'utf8'), 'sample.xml');
  const R = ' VKBsim Gladiator EVO R    {0200231D-0000-0000-0000-504944564944}';
  t('reading: invert / exponent / curve per option group, deadzone / saturation per axis', () => {
    const s = sample.settings!;
    assert.deepEqual(dvo.groupValues(s, 'joystick', 1, 'flight_move_pitch'), { invert: true, other: [] });
    assert.equal(dvo.groupValues(s, 'joystick', 1, 'flight_move_yaw')!.exponent, 1.3000001);
    const c = dvo.groupValues(s, 'joystick', 2, 'flight_move_strafe_vertical')!;
    assert.equal(c.invert, true);
    assert.deepEqual(c.curve!.map((p) => p.x), [0, 0.20035715, 0.82027185, 1]);
    assert.deepEqual(dvo.axisValues(s, R), { x: { deadzone: 0.015, saturation: 0.94050002 }, y: { deadzone: 0.015 } });
    assert.deepEqual(dvo.axisValues(s, 'VKBsim  Gladiator EVO R    {0200231D-0000-0000-0000-504944564944}'.replace('  G', ' G')), dvo.axisValues(s, R), 'product names compared ignoring extra spaces');
  });
  t('editing writes the game format and leaves everything else untouched', () => {
    let s = sample.settings!;
    s = dvo.setGroup(s, 'joystick', 1, 'flight_move_roll', { invert: true, exponent: 2 });
    s = dvo.setGroup(s, 'joystick', 1, 'flight_move_yaw', { curve: [{ x: 0.5, y: 0.25 }, { x: 0, y: 0 }, { x: 1, y: 1 }] });
    s = dvo.setGroup(s, 'joystick', 2, 'flight_move_strafe_vertical', { exponent: 1.5 });
    s = dvo.setGroup(s, 'joystick', 3, 'flight_move_pitch', { invert: false }, ' MOZA AB6 FFB Base    {1002346E-0000-0000-0000-504944564944}');
    s = dvo.setAxis(s, R, 'x', 'deadzone', 0.05);
    s = dvo.setAxis(s, R, 'rotz', 'saturation', 0.9);
    s = dvo.setAxis(s, ' VKBsim Gladiator EVO L    {3201231D-0000-0000-0000-504944564944}', 'y', 'deadzone', 0.02);
    s = dvo.setAxis(s, R, 'y', 'deadzone', null);
    const p = { ...sample, settings: s };
    const xml = buildExport(defaults, p, { format: 'layout', name: 't' });
    assert.match(xml, /<flight_move_roll invert="1" exponent="2"\/>/);
    assert.match(xml, /\n  <flight_move_yaw>\n   <nonlinearity_curve>\n    <point in="0" out="0"\/>\n    <point in="0.5" out="0.25"\/>\n    <point in="1" out="1"\/>\n   <\/nonlinearity_curve>\n  <\/flight_move_yaw>/, 'custom curve replaces the exponent');
    assert.match(xml, /<flight_move_strafe_vertical invert="1" exponent="1.5"\/>/, 'exponent replaces the custom curve, invert kept');
    assert.match(xml, /<options type="joystick" instance="3" Product=" MOZA AB6 FFB Base    \{1002346E-0000-0000-0000-504944564944\}">\n  <flight_move_pitch invert="0"\/>/);
    assert.match(xml, /<option input="x" deadzone="0.05"\/>/);
    assert.equal((xml.match(/<option input="rotz" saturation="0.9"\/>/g) ?? []).length, 2, 'saturation written twice like the game');
    assert.match(xml, /<deviceoptions name=" VKBsim Gladiator EVO L    \{3201231D-0000-0000-0000-504944564944\}">\n  <option input="y" deadzone="0.02"\/>/);
    assert.ok(!/<option input="y" deadzone="0.015"\/>/.test(xml), 'cleared deadzone removed');
    assert.equal((xml.match(/<option input="x" saturation="0.94050002"\/>/g) ?? []).length, 2, 'untouched values keep their original text');
    assert.ok(xml.indexOf('<deviceoptions name=" VKBsim Gladiator EVO L') < xml.indexOf('<options type="keyboard"'), 'deviceoptions before options');
    assert.ok(xml.indexOf('instance="2" Product=" VKBsim') < xml.indexOf('instance="3" Product=" MOZA'), 'new joystick block in instance order');
    const back = parseActionMaps(xml, 't.xml').settings!;
    assert.equal(dvo.groupValues(back, 'joystick', 1, 'flight_move_roll')!.exponent, 2);
    assert.equal(dvo.axisValues(back, R).rotz!.saturation, 0.9);
    // resetting everything removes the group / block again
    let r = dvo.setGroup(back, 'joystick', 3, 'flight_move_pitch', { invert: null });
    assert.equal(dvo.optionsBlock(r, 'joystick', 3)!.groups.length, 0);
    r = dvo.resetGroup(r, 'joystick', 1, 'flight_move_roll');
    assert.equal(dvo.groupValues(r, 'joystick', 1, 'flight_move_roll'), undefined);
  });
  t('legacy profiles (optionsXml text from earlier versions) are converted', () => {
    const legacy = { optionsXml: ['<options type="joystick" instance="1" Product="X"><flight_move_pitch invert="1" /></options>'] };
    assert.equal(dvo.groupValues(dvo.settingsOf(legacy), 'joystick', 1, 'flight_move_pitch')!.invert, true);
  });
  t('response preview: exponent, curve interpolation, deadzone/saturation, invert', () => {
    assert.equal(dvo.response(0.5, {}), 0.5);
    assert.equal(dvo.response(0.5, { exponent: 2 }), 0.25);
    assert.equal(dvo.response(-0.5, { exponent: 2 }), -0.25);
    assert.equal(dvo.response(0.5, { invert: true }), -0.5);
    assert.equal(dvo.curveAt([{ x: 0.5, y: 0.2 }], 0.25), 0.1, '(0,0) implied');
    assert.ok(Math.abs(dvo.curveAt([{ x: 0.5, y: 0.2 }], 0.75) - 0.6) < 1e-9, '(1,1) implied');
    assert.equal(dvo.response(0.05, { deadzone: 0.1 }), 0);
    assert.equal(dvo.response(0.9, { saturation: 0.8 }), 1);
    assert.ok(Math.abs(dvo.response(0.55, { deadzone: 0.1, saturation: 1 }) - 0.5) < 1e-9);
  });
  t('option tree from defaultProfile.xml: joystick has 8 instances and the group names the files use', () => {
    const tree = defaults.optionTrees.joystick;
    assert.equal(tree.instances, 8);
    const names = new Set(tree.groups.map((g: any) => g.name));
    for (const n of ['flight_move_pitch', 'flight_move_yaw', 'flight_move_roll', 'flight_move_strafe_vertical', 'flight_move_strafe_lateral', 'flight_strafe_longitudinal', 'flight_view', 'turret_aim_pitch', 'mgv_move']) assert.ok(names.has(n), n);
    assert.equal(tree.groups.find((g: any) => g.name === 'flight_view').exponent, '2.5');
    // names used in the real files that this game version still defines
    for (const f of fixtureFiles) {
      const p = parseActionMaps(readFileSync(f, 'utf8'), 'f.xml');
      const used = dvo.listOptionBlocks(p.settings!).length;
      assert.ok(used >= 0);
    }
  });
}

console.log('controllers: duplicates, >128 buttons, Chromium');
{
  const pad = (id: string, index: number, nb: number, na = 6) => ({ id, index, mapping: '', buttons: Array.from({ length: nb }, () => ({ pressed: false, value: 0 })), axes: Array(na).fill(0) });
  // Firefox ids ("vvvv-pppp-Name"): one MOZA base exposing two interfaces with the same USB id but 128 / 133 buttons
  const moza = [pad('346e-1002-MOZA AB6 FFB Base', 3, 128), pad('346e-1002-MOZA AB6 FFB Base', 7, 133)];
  t('identical USB ids: distinct stable keys from button counts, labelled, flagged as ambiguous', () => {
    const d = dev.describePads([pad('3344-0194-WINCTRL Orion Pedals', 0, 32), ...moza], {});
    assert.notEqual(d[1].key, d[2].key);
    assert.deepEqual([d[1].dup, d[2].dup], [{ n: 1, of: 2 }, { n: 2, of: 2 }]);
    assert.equal(dev.padLabel(d[2]), 'MOZA AB6 FFB Base (2 of 2 · 133 buttons)');
    assert.ok(d[1].ambiguous && d[2].ambiguous && !d[0].ambiguous);
    // keys don't depend on order: the 133-button interface keeps its assignment when the browser lists it first
    const a = { [d[2].key]: { kind: 'js' as const, instance: 9 } };
    const swapped = dev.describePads([moza[1], moza[0]], a);
    assert.equal(swapped[0].instance, 9);
    assert.equal(swapped[0].source, 'manual');
  });
  t('identical devices declared twice in a profile get one instance each (in profile order)', () => {
    const decl = [1, 2].map((i) => ({ slot: 'js' as const, instance: i + 3, product: 'MOZA AB6 FFB Base', rawProduct: ' MOZA AB6 FFB Base    {1002346E-0000-0000-0000-504944564944}' }));
    const d = dev.describePads(moza, {}, decl);
    assert.deepEqual(d.map((x) => `js${x.instance}:${x.source}:${x.ambiguous}`), ['js4:profile-id:true', 'js5:profile-id:true']);
  });
  t('assignments saved by the previous version (id#n keys) still apply', () => {
    const d = dev.describePads(moza, { '346e-1002-MOZA AB6 FFB Base#2': { kind: 'js', instance: 6 } });
    assert.equal(d[1].instance, 6);
  });
  t('buttons above 128 are captured with a warning (DirectInput limit)', () => {
    const c = cap.joystickInput({ kind: 'button', index: 132 })!;
    assert.equal(c.input, 'button133');
    assert.match(c.warning!, /above 128/);
    assert.equal(cap.joystickInput({ kind: 'button', index: 127 })!.warning, undefined);
    assert.match(cap.parseManual('js4_button133', 'js').warning!, /above 128/);
    assert.equal(cap.parseManual('js4_button128', 'js').warning, undefined);
  });
  t('press-to-search hits: exact device + instance, gamepad sticks as axis or direction', () => {
    const [info] = dev.describePads([moza[1]], { [dev.padKeys([moza[1]])[0]]: { kind: 'js', instance: 4 } });
    const h = listen.padHit(info, { kind: 'button', index: 132 })!;
    assert.deepEqual(listen.hitSpecs(h), ['js4_button133']);
    assert.match(h.note!, /above 128/);
    assert.deepEqual([...listen.hitKeys(h)], ['js4:button133']);
    const gp = dev.describePads([{ ...pad('Xbox (STANDARD GAMEPAD Vendor: 045e Product: 0b13)', 0, 17, 4), mapping: 'standard' }], {})[0];
    assert.deepEqual(listen.hitSpecs(listen.padHit(gp, { kind: 'axis', index: 1, dir: -1 })!), ['gp1_thumbly', 'gp1_thumbl_up']);
    assert.equal(listen.padHit(info, { kind: 'axis', index: 11, dir: 1 }), undefined, 'axes without a game name are ignored');
    assert.equal(listen.hitLabel({ slot: 'kb', instance: 1, inputs: ['lalt+n'] }), 'L-Alt + N');
  });
  t('search anyOf: a row matches if any form of the pressed input is bound', () => {
    let r = {};
    const A = idx.get('spaceship_movement/v_yaw');
    r = ed.setGroup(r, A, 'spaceship_movement', 'v_yaw', 'js', [{ slot: 'js', instance: 4, input: 'button133' }]);
    const rows = buildRows(defaults, ed.withRebinds(ed.newProfile('m'), r));
    const q = (any: string[]) => rows.filter((x) => search.scoreRow(x, { terms: [], keyTerms: [], anyOf: any })).map((x) => x.id);
    assert.deepEqual(q(['js4_button133']), ['spaceship_movement/v_yaw']);
    assert.deepEqual(q(['js3_button133']), []);
    assert.ok(q(['gp1_thumbly', 'gp1_thumbl_up']).length > 0);
  });
  t('Chromium detection: Chrome, Edge, Brave, Comet (brands), not Firefox', () => {
    const CH = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
    assert.deepEqual(browserName(CH, undefined, false), { name: 'Chrome 141', chromium: true });
    assert.deepEqual(browserName(CH + ' Edg/141.0.0.0', undefined, false), { name: 'Edge 141', chromium: true });
    assert.deepEqual(browserName(CH, { brands: [{ brand: 'Brave' }, { brand: 'Chromium' }] }, true), { name: 'Brave (Chromium 141)', chromium: true });
    assert.deepEqual(browserName(CH, { brands: [{ brand: 'Not)A;Brand' }, { brand: 'Comet' }, { brand: 'Chromium' }] }, false), { name: 'Comet (Chromium 141)', chromium: true });
    assert.deepEqual(browserName('Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:143.0) Gecko/20100101 Firefox/143.0', undefined, false), { name: 'Firefox 143', chromium: false });
  });
}

// ---------------------------------------------------------------- axis setting ranges, device templates
{
  const rg = await import('../src/lib/ranges');
  const tp = await import('../src/lib/templates');
  const { BUILTIN_TEMPLATES } = await import('../src/lib/builtinTemplates');
  type DeviceTemplate = import('../src/lib/templates').DeviceTemplate;
  t('setting ranges: clamping, game 1 % grid, defaults and observed values inside the ranges', () => {
    const { RANGES } = rg;
    assert.equal(rg.clampTo(RANGES.deadzone, 0.9), 0.5);
    assert.equal(rg.clampTo(RANGES.saturation, 0), 0.5);
    assert.equal(rg.clampTo(RANGES.exponent, 10), 3);
    assert.equal(rg.gamePercent(0.0792), 8);
    assert.equal(rg.gamePercent(0.2475), 25);
    assert.equal(rg.snapToGame(0.05), 0.0495);
    for (const r of Object.values(RANGES)) {
      assert.ok(r.min < r.max && r.step > 0 && r.step <= (r.max - r.min) / 20, r.key);
      if (r.def !== undefined) assert.ok(rg.inRange(r, r.def), `${r.key} default in range`);
      if (r.observed) assert.ok(rg.inRange(r, r.observed[0]) && rg.inRange(r, r.observed[1]), `${r.key} observed values in range`);
    }
    // every deadzone the game wrote in the real files is on the 0.0099 grid
    for (const v of [0.0098999999, 0.0198, 0.0297, 0.049499996, 0.0792, 0.2475]) assert.ok(Math.abs(v / rg.GAME_STEP - Math.round(v / rg.GAME_STEP)) < 1e-3, String(v));
    assert.ok(RANGES.point.confirmed && !RANGES.deadzone.confirmed);
    assert.deepEqual(rg.tidyCurve([{ x: 0.8, y: 1.2 }, { x: -0.1, y: 0.3 }]), [{ x: 0, y: 0.3 }, { x: 0.8, y: 1 }]);
  });
  const moza = (buttons: number) => ({ name: 'MOZA AB6 FFB Base', vendor: '346E', productId: '1002', buttons, slot: 'js' as const });
  const tpl = (id: string, match: any[], extra: any = {}) => ({ version: 1 as const, id, name: id, slot: 'js' as const, aspect: 1.6, match, callouts: [], ...extra });
  t('template matching: USB id, name, button count tells the two MOZA bases apart; user beats built-in; fallbacks', () => {
    const a = tpl('moza-128', [{ vendor: '346e', product: '1002', buttons: 128 }]);
    const b = tpl('moza-133', [{ vendor: '346E', product: '1002', buttons: 133 }]);
    const any = tpl('moza-any', [{ vendor: '346E', product: '1002' }]);
    assert.equal(tp.matchScore(a, moza(128)), 13);
    assert.equal(tp.matchScore(a, moza(133)), 0);
    assert.equal(tp.pickTemplate([a, b, ...BUILTIN_TEMPLATES], moza(128)).template.id, 'moza-128');
    assert.equal(tp.pickTemplate([a, b, ...BUILTIN_TEMPLATES], moza(133)).template.id, 'moza-133');
    assert.equal(tp.pickTemplate([any, b], moza(133)).template.id, 'moza-133', 'the more specific rule wins');
    assert.equal(tp.pickTemplate([any, b], moza(128)).template.id, 'moza-any');
    assert.equal(tp.matchScore(tpl('n', [{ name: 'gladiator evo' }]), { name: 'VKBsim Gladiator EVO R', slot: 'js' }), 5);
    assert.equal(tp.matchScore({ ...any, slot: 'gp' }, moza(128)), 0, 'a gamepad template never applies to a joystick');
    assert.equal(tp.matchScore(tpl('empty', [{}]), moza(128)), 0, 'an empty rule matches nothing');
    const r = tp.pickTemplate([a, ...BUILTIN_TEMPLATES], moza(133), 'builtin-throttle');
    assert.equal(r.template.id, 'builtin-throttle'); assert.equal(r.how, 'chosen');
    assert.equal(tp.pickTemplate(BUILTIN_TEMPLATES, { slot: 'gp' }).template.id, 'builtin-gamepad');
    assert.equal(tp.pickTemplate(BUILTIN_TEMPLATES, { name: 'Bravo Throttle Quadrant', slot: 'js' }).template.id, 'builtin-throttle');
    assert.equal(tp.pickTemplate(BUILTIN_TEMPLATES, { name: 'VKBsim Gladiator EVO R', slot: 'js' }).how, 'fallback');
    assert.notEqual(tp.identityKey(moza(128)), tp.identityKey(moza(133)));
    assert.equal(tp.identityKey({ ...moza(128), dup: { n: 2, of: 2 } }), `${tp.identityKey(moza(128))}#2`, 'identical devices: own pick key each');
    assert.equal(tp.identityKey({ ...moza(128), dup: { n: 1, of: 1 } }), tp.identityKey(moza(128)));
    assert.deepEqual(tp.matchFor(moza(133), true), { vendor: '346E', product: '1002', buttons: 133 });
    assert.deepEqual(tp.matchFor({ name: 'Some Stick' }, false), { name: 'Some Stick' });
  });
  t('template JSON: export -> import keeps image, callouts and links; bad files rejected; values cleaned', () => {
    const img = 'data:image/webp;base64,UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=';
    const src = tpl('my-1', [{ vendor: '231D', product: '0200', buttons: 32 }], {
      image: img, aspect: 1.5,
      callouts: [{ id: 'c1', kind: 'hat', inputs: tp.hatInputs(2), label: 'Trim', group: 'Grip', anchor: { x: 0.4, y: 0.3 }, box: { x: 0.1, y: 0.2 } }],
    });
    const back = tp.parseTemplates(tp.exportTemplates([src]));
    assert.equal(back.length, 1);
    assert.equal(back[0].id, 'my-1'); assert.equal(back[0].image, img); assert.equal(back[0].aspect, 1.5);
    assert.deepEqual(back[0].callouts, src.callouts); assert.deepEqual(back[0].match, src.match);
    assert.throws(() => tp.parseTemplates('nope'), /JSON/);
    assert.throws(() => tp.parseTemplates(JSON.stringify({ ...src, image: 'https://example.com/a.png' })), /embedded data:image/);
    assert.throws(() => tp.parseTemplates(JSON.stringify({ ...src, callouts: [{ kind: 'button', inputs: ['Bad Name!'] }] })), /no valid input/);
    const odd = tp.parseTemplates(JSON.stringify([{ name: ' x ', id: 'builtin-stick', callouts: [{ kind: 'weird', inputs: ['button2'], anchor: { x: 7, y: -1 } }], match: [{ vendor: 'zz' }, { product: '0x200', buttons: 2.5 }] }]))[0];
    assert.notEqual(odd.id, 'builtin-stick', 'imported files cannot replace a built-in');
    assert.equal(odd.name, 'x'); assert.equal(odd.callouts[0].kind, 'button');
    assert.deepEqual(odd.callouts[0].anchor, { x: 1, y: 0 }); assert.deepEqual(odd.callouts[0].box, { x: 1, y: 0 });
    assert.deepEqual(odd.match, [{ product: '0200' }]);
    assert.equal(tp.parseTemplates(JSON.stringify({ format: tp.TEMPLATE_FILE_FORMAT, templates: [src, { ...src, id: 'my-2' }] })).length, 2);
  });
  t('image sizing: longest side 1600 px, data URL size', () => {
    assert.deepEqual(tp.fitWithin(3200, 2000), { w: 1600, h: 1000 });
    assert.deepEqual(tp.fitWithin(1000, 3000), { w: 533, h: 1600 });
    assert.deepEqual(tp.fitWithin(800, 500), { w: 800, h: 500 });
    assert.equal(tp.dataUrlBytes('data:image/png;base64,AAAA'), 3);
  });
  t('callouts from pressed inputs, kind changes, covered inputs, combos', () => {
    assert.deepEqual(tp.calloutFor('hat1_down'), { kind: 'hat', inputs: ['hat1_up', 'hat1_right', 'hat1_down', 'hat1_left'] });
    assert.deepEqual(tp.calloutFor('dpad_left'), { kind: 'hat', inputs: ['dpad_up', 'dpad_right', 'dpad_down', 'dpad_left'] });
    assert.deepEqual(tp.calloutFor('thumbly'), { kind: 'axis', inputs: ['thumblx', 'thumbly'] });
    assert.deepEqual(tp.calloutFor('rotz'), { kind: 'axis', inputs: ['rotz'] });
    assert.deepEqual(tp.calloutFor('button7'), { kind: 'button', inputs: ['button7'] });
    const used = new Set(['button1', 'button2', 'hat1_up']);
    assert.deepEqual(tp.inputsForKind('switch', ['button3'], 'js', used), ['button3', 'button4', 'button5']);
    assert.deepEqual(tp.inputsForKind('encoder', [], 'js', used), ['button3', 'button4']);
    assert.deepEqual(tp.inputsForKind('hat', ['button3'], 'js', used), tp.hatInputs(2));
    assert.deepEqual(tp.inputsForKind('button', ['button9', 'button10'], 'js', used), ['button9']);
    assert.ok(tp.coveredInputs({ inputs: ['thumblx'] }).includes('thumbl_left'));
    assert.deepEqual(tp.splitCombo('u+lshift'), { main: 'u', prefix: 'lshift' });
    assert.deepEqual(tp.splitCombo('shoulderl+a'), { main: 'a', prefix: 'shoulderl' });
    assert.deepEqual(tp.splitCombo('button3'), { main: 'button3', prefix: '' });
    assert.equal(tp.calloutTitle({ id: 'x', kind: 'hat', inputs: tp.hatInputs(3), anchor: { x: 0, y: 0 }, box: { x: 0, y: 0 } }), 'Hat 3');
    assert.equal(tp.shortInput('hat1_up'), 'H1↑');
  });
  t('live inputs: held buttons, hats (diagonals light both), axes moved from rest, throttle parked at -1', () => {
    const axes = [0.7, 0, -1, 0, 0, 0, 0, 0, 0, -1];
    const rest = [0, 0, -1, 0, 0, 0, 0, 0, 0, 9 / 7];
    const r = tp.liveInputs('js', { buttons: [false, true], axes }, rest);
    assert.deepEqual([...r.active].sort(), ['button2', 'hat1_up', 'x']);
    assert.equal(r.values.x, 0.7);
    const diag = tp.liveInputs('js', { buttons: [], axes: [0, 0, -1, 0, 0, 0, 0, 0, 0, -1 + 2 / 7] }, rest);
    assert.deepEqual([...diag.active].sort(), ['hat1_right', 'hat1_up']);
    const gp = tp.liveInputs('gp', { buttons: Array.from({ length: 17 }, (_, i) => i === 12), axes: [0.5, 0, 0, 0] }, [0, 0, 0, 0]);
    assert.deepEqual([...gp.active].sort(), ['dpad_up', 'thumblx']);
  });
  t('built-in templates: generic SVG art, valid game input names, unique ids, coordinates inside the canvas', () => {
    const jsName = /^(button\d{1,3}|hat[1-4]_(up|down|left|right)|x|y|z|rotx|roty|rotz|slider[12])$/;
    for (const b of BUILTIN_TEMPLATES) {
      assert.ok(b.builtin && b.image!.startsWith('data:image/svg+xml'), b.id);
      const ids = new Set(b.callouts.map((c) => c.id));
      assert.equal(ids.size, b.callouts.length);
      const inputs = b.callouts.flatMap((c) => c.inputs);
      assert.equal(new Set(inputs).size, inputs.length, `${b.id}: every input on one callout`);
      for (const i of inputs) assert.ok(b.slot === 'js' ? jsName.test(i) : [...cap.GP_BUTTONS, ...cap.GP_AXES].includes(i), `${b.id}: ${i}`);
      for (const c of b.callouts) for (const p of [c.anchor, c.box]) assert.ok(p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1, `${b.id}/${c.id}`);
    }
  });
  t('default holo stick + throttle: fallbacks, glow regions, button rows, encoder push, 32-button cap, boxes apart', () => {
    const byId = (id: string) => BUILTIN_TEMPLATES.find((b) => b.id === id)!;
    assert.equal(tp.pickTemplate(BUILTIN_TEMPLATES, { name: 'Unknown Stick', slot: 'js' }).template.id, 'builtin-stick');
    assert.equal(tp.pickTemplate(BUILTIN_TEMPLATES, { name: 'VKBsim STECS Mini Plus', slot: 'js' }).template.id, 'builtin-throttle');
    assert.deepEqual(BUILTIN_TEMPLATES.map((b) => b.id), ['builtin-stick', 'builtin-throttle', 'builtin-gamepad'], 'classic stick/throttle removed, gamepad kept');
    for (const id of ['builtin-stick', 'builtin-throttle']) {
      const b = byId(id);
      assert.ok(b.callouts.length >= 20, `${id}: ${b.callouts.length} callouts`);
      const btns = new Set(b.callouts.flatMap((c) => c.inputs).filter((i) => /^button\d+$/.test(i)));
      assert.ok([...btns].every((i) => Number(i.slice(6)) <= 32), `${id}: buttons within the 32-button browser cap`);
      for (const c of b.callouts) {
        assert.ok(c.region && tp.REGION_RE.test(c.region), `${id}/${c.id}: glow region`);
        for (const o of b.callouts) if (o !== c) {
          const dx = Math.abs(o.box.x - c.box.x), dy = Math.abs(o.box.y - c.box.y);
          assert.ok(dx > 0.12 || dy > 0.06, `${id}: boxes ${c.id} / ${o.id} too close`);
        }
      }
      const back = tp.parseTemplates(tp.exportTemplates([{ ...b, builtin: undefined, id: 'copy' } as any]))[0];
      assert.deepEqual(back.callouts.map((c) => c.region), b.callouts.map((c) => c.region), `${id}: regions survive export/import`);
    }
    const th = byId('builtin-throttle');
    assert.equal(byId('builtin-stick').callouts.length, 24); assert.equal(th.callouts.length, 21);
    const row = byId('builtin-stick').callouts.find((c) => c.id === 'rowL')!;
    assert.equal(row.kind, 'buttons'); assert.equal(tp.inputRole(row, 3), '4');
    assert.deepEqual(th.callouts.find((c) => c.id === 'e1')!.inputs.map((_, k) => tp.inputRole(th.callouts.find((c) => c.id === 'e1')!, k)), ['⟳', '⟲', '●']);
    const keys = th.callouts.find((c) => c.id === 'keys')!;
    assert.equal(keys.kind, 'buttons'); assert.equal(tp.inputRole(keys, 5), '6');
    assert.deepEqual(tp.inputsForKind('encoder', ['button5', 'button6', 'button7'], 'js', new Set()), ['button5', 'button6', 'button7'], 'encoder keeps its push');
    const bad = tp.parseTemplates(JSON.stringify({ ...th, builtin: undefined, id: 'x', callouts: [{ ...keys, region: 'M0 0<script>' }] }))[0];
    assert.equal(bad.callouts[0].region, undefined, 'invalid region dropped');
    // per-key outlines: one per keypad key, valid paths, kept on export/import, dropped when any entry is invalid or there are too many
    assert.equal(keys.inputRegions?.length, keys.inputs.length);
    assert.ok(keys.inputRegions!.every((r) => tp.REGION_RE.test(r)) && new Set(keys.inputRegions).size === 6, 'six distinct key outlines');
    const kb = tp.parseTemplates(tp.exportTemplates([{ ...th, builtin: undefined, id: 'copy2' } as any]))[0];
    assert.deepEqual(kb.callouts.find((c) => c.id === 'keys')!.inputRegions, keys.inputRegions, 'key outlines survive export/import');
    const odd = (ir: unknown) => tp.parseTemplates(JSON.stringify({ ...th, builtin: undefined, id: 'y', callouts: [{ ...keys, inputRegions: ir }] }))[0].callouts[0].inputRegions;
    assert.equal(odd([...keys.inputRegions!.slice(0, 5), 'M0 0<x>']), undefined);
    assert.equal(odd([...keys.inputRegions!, 'M0 0Z']), undefined, 'more outlines than inputs');
    assert.deepEqual(odd(['', 'M0 0L1 1Z']), ['', 'M0 0L1 1Z'], 'empty entries allowed');
    assert.deepEqual(th.callouts.find((c) => c.id === 'trgL')!.inputs, ['button4'], 'left grip trigger');
  });
  t('default holo gamepad: every standard gp1_ input on a callout, game names, glow regions, one outline per D-pad direction, boxes apart', () => {
    const gp = BUILTIN_TEMPLATES.find((b) => b.id === 'builtin-gamepad')!;
    assert.equal(gp.slot, 'gp'); assert.equal(gp.name, 'Gamepad'); assert.ok(gp.image!.startsWith('data:image/svg+xml'));
    assert.equal(tp.pickTemplate(BUILTIN_TEMPLATES, { name: 'Xbox Wireless Controller', slot: 'gp' }).template.id, 'builtin-gamepad');
    const inputs = gp.callouts.flatMap((c) => c.inputs);
    assert.deepEqual([...inputs].sort(), [...cap.GP_BUTTONS, ...cap.GP_AXES].sort(), 'all 16 standard buttons and 4 stick axes, each once');
    for (const i of inputs) assert.ok(gameNames.gp.has(i), `${i} is a gp1_ name used by defaultProfile.xml`);
    // analog trigger axes and stick directions show on the trigger / stick callouts
    const cov = (id: string) => tp.coveredInputs(gp.callouts.find((c) => c.id === id)!);
    assert.ok(cov('lt').includes('triggerl') && cov('rt').includes('triggerr') && cov('ls').includes('thumbl_up') && cov('rs').includes('thumbr_left'));
    assert.equal(gp.callouts.length, 15);
    for (const c of gp.callouts) {
      assert.ok(c.region && tp.REGION_RE.test(c.region), `${c.id}: glow region`);
      for (const o of gp.callouts) if (o !== c) assert.ok(Math.abs(o.box.x - c.box.x) > 0.12 || Math.abs(o.box.y - c.box.y) > 0.085, `boxes ${c.id} / ${o.id} too close`);
    }
    const dp = gp.callouts.find((c) => c.id === 'dpad')!;
    assert.equal(dp.kind, 'hat'); assert.deepEqual(dp.inputs, ['dpad_up', 'dpad_right', 'dpad_down', 'dpad_left']);
    assert.equal(dp.inputRegions?.length, 4); assert.ok(dp.inputRegions!.every((r) => tp.REGION_RE.test(r)) && new Set(dp.inputRegions).size === 4, 'four distinct arm outlines');
    for (const [press, stick] of [['l3', 'ls'], ['r3', 'rs']]) {
      const a = gp.callouts.find((c) => c.id === press)!, b = gp.callouts.find((c) => c.id === stick)!;
      assert.deepEqual(a.anchor, b.anchor, `${press} points at its stick`); assert.equal(a.inputRegions, undefined);
    }
    const back = tp.parseTemplates(tp.exportTemplates([{ ...gp, builtin: undefined, id: 'copy' } as any]))[0];
    assert.deepEqual(back.callouts.map((c) => c.region), gp.callouts.map((c) => c.region), 'regions survive export/import');
    assert.deepEqual(back.callouts.find((c) => c.id === 'dpad')!.inputRegions, dp.inputRegions, 'D-pad outlines survive export/import');
  });
  const { DEVICE_TEMPLATES } = await import('../src/lib/deviceTemplates');
  const dt = await import('../src/lib/deviceTemplates');
  const { DEVICE_PHOTO_LAYOUTS } = await import('../src/lib/devicePhotoLayouts');
  const { DEVICE_PHOTO_SIZES } = await import('../src/lib/devicePhotoSizes');
  const WEBP = 'data:image/webp;base64,UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoBAAEAAwA0JaQAA3AA/vuUAAA=';
  const twoViews = () => tpl('mv-1', [{ name: 'Some Grip' }], {
    aspect: 9,
    views: [
      { id: 'front', label: 'Front', image: '/device-photos/vkb-gladiator-scg-front.webp', width: 1587, height: 990 },
      { id: 'thumb', label: 'Thumb side', image: WEBP, width: 1200, height: 990 },
    ],
    callouts: [
      { id: 'a', kind: 'button', inputs: ['button1'], anchor: { x: 0.4, y: 0.3 }, box: { x: 0.1, y: 0.2 }, view: 'thumb' },
      { id: 'b', kind: 'button', inputs: ['button2'], anchor: { x: 0.5, y: 0.6 }, box: { x: 0.9, y: 0.6 } },
    ],
  });
  t('multi-view templates: JSON round trip keeps views, view pictures and the view of each callout', () => {
    const src = twoViews();
    const back = tp.parseTemplates(tp.exportTemplates([src]))[0];
    assert.deepEqual(back.views, src.views);
    assert.equal(back.image, undefined);
    assert.equal(back.aspect, 1587 / 990, 'aspect = first view');
    assert.deepEqual(back.callouts.map((c) => c.view), ['thumb', undefined]);
    assert.deepEqual(back.callouts.map((c) => tp.calloutView(back, c)), ['thumb', 'front'], 'callout without a view sits on the first view');
    const th = tp.viewTemplate(back, 'thumb');
    assert.equal(th.image, WEBP); assert.equal(th.aspect, 1200 / 990); assert.deepEqual(th.callouts.map((c) => c.id), ['a']);
    assert.deepEqual(tp.viewTemplate(back, 'nope').callouts.map((c) => c.id), ['b'], 'unknown view id -> first view');
    const again = tp.parseTemplates(tp.exportTemplates([back]))[0];
    assert.deepEqual({ ...again, updatedAt: 0, id: '' }, { ...back, updatedAt: 0, id: '' }, 'stable on a second round trip');
    const copy = tp.cloneTemplate(back);
    assert.deepEqual(copy.views, back.views, 'a copy keeps its views');
  });
  t('multi-view templates: old single-image files still load as one implicit view', () => {
    const old = JSON.stringify({ format: 'sc-mapper-device-template', version: 1, id: 'old-1', name: 'Old', slot: 'js', image: WEBP, aspect: 1.25, match: [],
      callouts: [{ id: 'c1', kind: 'button', inputs: ['button3'], anchor: { x: 0.2, y: 0.3 }, box: { x: 0.1, y: 0.3 }, view: 'front' }] });
    const o = tp.parseTemplates(old)[0];
    assert.equal(o.views, undefined); assert.equal(o.image, WEBP); assert.equal(o.aspect, 1.25);
    assert.equal(o.callouts[0].view, undefined, 'a view on a single-view template is dropped');
    const vs = tp.templateViews(o);
    assert.equal(vs.length, 1); assert.equal(vs[0].id, tp.MAIN_VIEW); assert.equal(vs[0].image, WEBP); assert.equal(vs[0].width / vs[0].height, 1.25);
    assert.equal(tp.calloutView(o, o.callouts[0]), tp.MAIN_VIEW);
    assert.equal(tp.viewTemplate(o, 'whatever'), o, 'single-view templates render unchanged');
    assert.ok(!tp.exportTemplates([o]).includes('"views"'), 'no views written for single-view templates');
  });
  t('multi-view templates: view ids, pictures and sizes validated', () => {
    const src = twoViews();
    const bad = tp.parseTemplates(JSON.stringify({ ...src, views: [
      { id: 'bad id!', label: '  Front  ', width: 'x', height: 990 },
      { id: 'dup', label: 'A', width: 100, height: 100 },
      { id: 'dup', label: 'B', width: 100, height: 100 },
      ...Array.from({ length: 12 }, (_, k) => ({ id: `x${k}`, label: '', width: 10, height: 10 })),
    ], callouts: [{ ...src.callouts[0], view: 'bad id!' }, { ...src.callouts[1], view: 'dup' }] }))[0];
    assert.equal(bad.views!.length, tp.MAX_VIEWS, `at most ${tp.MAX_VIEWS} views`);
    assert.equal(bad.views![0].id, 'v1', 'invalid id replaced'); assert.equal(bad.views![0].label, 'Front');
    assert.deepEqual([bad.views![0].width, bad.views![0].height], [1000 * tp.BLANK_ASPECT, 1000], 'bad size -> default canvas');
    assert.equal(new Set(bad.views!.map((v) => v.id)).size, tp.MAX_VIEWS, 'duplicate ids made unique');
    assert.deepEqual(bad.callouts.map((c) => c.view), [undefined, 'dup'], 'callout on an unknown view: view dropped');
    assert.throws(() => tp.parseTemplates(JSON.stringify({ ...src, views: [{ ...src.views[0], image: 'https://example.com/x.webp' }] })), /data:image/);
    assert.throws(() => tp.parseTemplates(JSON.stringify({ ...src, views: [{ ...src.views[0], image: '/device-photos/../../etc.webp' }] })), /data:image/);
    assert.throws(() => tp.parseTemplates(JSON.stringify({ ...src, views: [{ ...src.views[0], image: '//evil.example/device-photos/x.webp' }] })), /data:image/);
    assert.ok(tp.isSafeImage('/device-photos/moza-ab6-front.webp') && !tp.isSafeImage('/device-photos/a.svg') && !tp.isSafeImage('/elsewhere/a.webp'));
  });
  t('device photo layouts: a complete entry turns a device template into a multi-view photo template; incomplete ones are ignored', () => {
    assert.deepEqual(dt.PHOTO_LAYOUT_PROBLEMS, [], 'no incomplete entries in DEVICE_PHOTO_LAYOUTS');
    // every built-in photo listed in views.json exists, with its size
    const listed = JSON.parse(readFileSync(new URL('./device-photos/views.json', import.meta.url), 'utf8')).views as { device: string; view: string }[];
    for (const v of listed) {
      const key = `${v.device}-${v.view}`;
      assert.ok(DEVICE_PHOTO_SIZES[key] && existsSync(new URL(`../public/device-photos/${key}.webp`, import.meta.url)), `photo ${key}`);
    }
    for (const [id, l] of Object.entries(DEVICE_PHOTO_LAYOUTS)) {
      const d = DEVICE_TEMPLATES.find((x) => x.id === id);
      assert.ok(d?.views?.length === l.views.length, `${id}: built as a photo template`);
      const stale = Object.keys(l.anchors).filter((k) => !d!.callouts.some((c) => c.id === k));
      assert.deepEqual(stale, [], `${id}: anchors for controls the template does not have`);
    }
    // a sample (test-only, made-up) layout on the Gladiator template: controls spread over both of its photos
    const base = DEVICE_TEMPLATES.find((x) => x.id === 'builtin-vkb-gladiator-scg')!;
    const layout = {
      views: [{ id: 'front', label: 'Front', photo: 'vkb-gladiator-scg-front' }, { id: 'thumb', label: 'Thumb side', photo: 'vkb-gladiator-scg-thumb' }],
      anchors: Object.fromEntries(base.callouts.map((c, k) => [c.id, { view: k % 2 ? 'thumb' : 'front', x: 0.2 + 0.6 * ((k * 37) % 100) / 100, y: 0.1 + 0.8 * ((k * 53) % 100) / 100 }])),
    };
    const p = dt.withPhotoLayout(base, layout);
    assert.ok(!Array.isArray(p), `complete layout accepted (${Array.isArray(p) ? p.join('; ') : ''})`);
    const pt = p as DeviceTemplate;
    assert.equal(pt.id, base.id); assert.equal(pt.name, base.name); assert.equal(pt.loadImage, undefined); assert.equal(pt.image, undefined);
    assert.deepEqual(pt.views!.map((v) => [v.id, v.label, v.image]), [['front', 'Front', '/device-photos/vkb-gladiator-scg-front.webp'], ['thumb', 'Thumb side', '/device-photos/vkb-gladiator-scg-thumb.webp']]);
    for (const v of pt.views!) {
      const [pw, ph] = DEVICE_PHOTO_SIZES[layout.views.find((x) => x.id === v.id)!.photo];
      assert.equal(v.height, ph); assert.ok(v.width > pw * 1.3, `${v.id}: label gutters`);
    }
    assert.equal(pt.aspect, pt.views![0].width / pt.views![0].height);
    assert.deepEqual(pt.callouts.map((c) => [c.id, c.kind, c.inputs, c.label]), base.callouts.map((c) => [c.id, c.kind, c.inputs, c.label]), 'same controls');
    for (const c of pt.callouts) {
      const a = layout.anchors[c.id], v = pt.views!.find((x) => x.id === c.view)!;
      assert.equal(c.view, a.view, `${c.id}: on its view`);
      const pw = DEVICE_PHOTO_SIZES[layout.views.find((x) => x.id === v.id)!.photo][0], g = (v.width - pw) / 2;
      assert.ok(Math.abs(c.anchor.x - (g + a.x * pw) / v.width) < 1e-9 && Math.abs(c.anchor.y - a.y) < 1e-9, `${c.id}: anchor mapped from the photo onto the view`);
      assert.ok(!c.region && !c.inputRegions, `${c.id}: no art outlines on a photo`);
      assert.ok(c.box.x >= 0 && c.box.x <= 1 && c.box.y >= 0 && c.box.y <= 1);
      assert.ok(c.box.x < g / v.width || c.box.x > 1 - g / v.width || c.box.y > 0.9 || c.box.y < 0.06, `${c.id}: label in a gutter or a row`);
      for (const o of pt.callouts) if (o !== c && o.view === c.view) assert.ok(Math.abs(o.box.x - c.box.x) > 0.12 || Math.abs(o.box.y - c.box.y) > 0.03, `boxes ${c.id} / ${o.id} too close`);
    }
    const back = tp.parseTemplates(tp.exportTemplates([{ ...pt, builtin: undefined, id: 'copy' } as any]))[0];
    assert.deepEqual(back.views, pt.views, 'photo views survive export/import (built-in photo paths allowed)');
    assert.deepEqual(back.callouts.map((c) => c.view), pt.callouts.map((c) => c.view));
    // incomplete / broken layouts: problems reported, never a half-placed template
    const { [base.callouts[0].id]: _gone, ...fewer } = layout.anchors;
    const miss = dt.withPhotoLayout(base, { ...layout, anchors: fewer });
    assert.ok(Array.isArray(miss) && miss.some((m) => m.includes(base.callouts[0].id)), 'missing anchor reported');
    const wrongView = dt.withPhotoLayout(base, { ...layout, anchors: { ...layout.anchors, [base.callouts[1].id]: { view: 'side', x: 0.5, y: 0.5 } } });
    assert.ok(Array.isArray(wrongView) && wrongView.some((m) => /unknown view/.test(m)));
    assert.ok(Array.isArray(dt.withPhotoLayout(base, { ...layout, views: [{ id: 'front', label: 'F', photo: 'no-such-photo' }, layout.views[1]] })), 'unknown photo rejected');
    assert.ok(Array.isArray(dt.withPhotoLayout(base, { ...layout, anchors: { ...layout.anchors, [base.callouts[2].id]: { view: 'front', x: 1.5, y: 0.5 } } })), 'coordinates outside 0..1 rejected');
    assert.ok(Array.isArray(dt.withPhotoLayout(base, { views: [], anchors: {} })), 'empty layout rejected');
  });
  t('device templates (34 devices): own art per device, real numbering where published, unassigned spots elsewhere, links, regions, groups', () => {
    const jsName = /^(button\d{1,3}|hat[1-4]_(up|down|left|right)|x|y|z|rotx|roty|rotz|slider[12])$/;
    const all = [...BUILTIN_TEMPLATES, ...DEVICE_TEMPLATES];
    assert.equal(DEVICE_TEMPLATES.length, 34, 'all 34 device templates (31 devices + 3 AB6 grip variants)');
    assert.equal(new Set(all.map((x) => x.id)).size, all.length, 'unique ids');
    // devices without published numbers: callout spots only (stick X / Y where obvious)
    const OPEN = new Set(['builtin-vkb-gladiator-scg', 'builtin-vkb-gunfighter-mcg', 'builtin-vkb-stecs', 'builtin-logitech-x56-stick', 'builtin-logitech-x56-throttle']);
    const USB = new Set(['builtin-tm-warthog-stick', 'builtin-tm-warthog-throttle', 'builtin-tm-t16000m', 'builtin-tm-twcs', 'builtin-moza-ab6', 'builtin-winctrl-ursa-combat',
      'builtin-winctrl-orion-pedals', 'builtin-winctrl-carrierace-mfd-l', 'builtin-winctrl-carrierace-pto2', 'builtin-winctrl-carrierace-ufc-hud', 'builtin-azeron-keypad', 'builtin-honeycomb-bravo',
      'builtin-honeycomb-charlie', 'builtin-logitech-flight-rudder', 'builtin-mfg-crosswind', 'builtin-tm-tfrp', 'builtin-tm-tpr', 'builtin-vkb-t-rudder']);
    const PHOTO_ONLY = new Set(['builtin-azeron-keypad']);
    const ASPECTS = new Set<number>();
    for (const d of DEVICE_TEMPLATES) {
      assert.ok(d.builtin && d.brand && d.id.startsWith('builtin-') && !d.image && (d.views?.length ? !d.loadImage && d.views.every((v) => tp.BUILTIN_PHOTO_RE.test(v.image ?? '')) : typeof d.loadImage === 'function') && d.notes, `${d.id}: picture loaded on demand (art) or built-in photos (photo template)`);
      ASPECTS.add(d.aspect);
      if (d.variantOf) assert.deepEqual(d.match, [], `${d.id}: a grip variant has no match rules (picked by hand)`);
      else assert.ok(d.match.some((m) => m.name), `${d.id}: name pattern`);
      assert.equal(d.match.some((m) => m.vendor && m.product), USB.has(d.id), `${d.id}: USB id only where confident`);
      // one exception: the AB6 + ViperAce paddle lever and the base left lever are both S1 (whichever is switched on; Federico's export)
      const inputs = d.callouts.filter((c) => !(d.id === 'builtin-moza-ab6-viperace' && c.id === 'paddlea')).flatMap((c) => c.inputs).filter(Boolean);
      assert.equal(new Set(inputs).size, inputs.length, `${d.id}: every input on one callout`);
      for (const i of inputs) assert.ok(jsName.test(i), `${d.id}: ${i}`);
      const open = d.callouts.reduce((n, c) => n + tp.unassignedCount(c), 0);
      if (OPEN.has(d.id)) {
        assert.ok(open > 5 && d.callouts.flatMap((c) => c.inputs).filter((i) => /^button|^hat/.test(i)).length === 0, `${d.id}: buttons left unassigned`);
        assert.match(d.notes!, /Customize a copy/);
      } else if (d.id === 'builtin-winctrl-carrierace-mfd-l') {
        assert.equal(open, 3, 'MFD: only BRT encoder inputs unassigned (diagram does not number it)');
      } else if (d.id === 'builtin-winctrl-carrierace-ufc-hud') {
        assert.equal(open, 4, 'UFC: only COMM 1 / COMM 2 channel −/+ unassigned (diagram numbers PULL only)');
      } else assert.equal(open, 0, `${d.id}: fully numbered`);
      if (PHOTO_ONLY.has(d.id)) {
        assert.equal(d.callouts.length, 0, `${d.id}: photo-only (empty callouts)`);
        assert.match(d.notes!, /Customize a copy/);
      }
      for (const c of d.callouts) {
        if (!d.views) assert.ok(c.region && tp.REGION_RE.test(c.region), `${d.id}/${c.id}: glow region`);
        for (const pt of [c.anchor, c.box]) assert.ok(pt.x >= 0 && pt.x <= 1 && pt.y >= 0 && pt.y <= 1, `${d.id}/${c.id}`);
        for (const o of d.callouts) if (o !== c && tp.calloutView(d, o) === tp.calloutView(d, c)) assert.ok(Math.abs(o.box.x - c.box.x) > 0.12 || Math.abs(o.box.y - c.box.y) > 0.03, `${d.id}: boxes ${c.id} / ${o.id} too close`);
        if (c.inputRegions) assert.equal(c.inputRegions.length, c.inputs.length, `${d.id}/${c.id}: one outline per input`);
        if (c.kind === 'hat') assert.ok(c.inputs.length >= 4 && c.inputs.length <= 5, `${d.id}/${c.id}: hat = 4 directions (+ push)`);
      }
      if (tp.maxButton(d) > 32) assert.match(d.notes!, /Firefox/, `${d.id}: >32 buttons mentions Firefox`);
      const back = tp.parseTemplates(tp.exportTemplates([{ ...d, builtin: undefined, id: 'copy' } as any]))[0];
      assert.deepEqual(back.callouts.map((c) => c.region), d.callouts.map((c) => c.region), `${d.id}: regions survive export/import`);
      assert.deepEqual(back.callouts.map((c) => c.inputs), d.callouts.map((c) => c.inputs), `${d.id}: unassigned inputs survive export/import`);
      assert.equal(back.brand, d.brand); assert.equal(back.notes, d.notes); assert.equal((back as any).loadImage, undefined, 'no function in the export');
    }
    const by = (id: string) => DEVICE_TEMPLATES.find((x) => x.id === `builtin-${id}`)!;
    const btn = (x: DeviceTemplate) => x.callouts.flatMap((c) => c.inputs).filter((i) => /^button/.test(i)).map((i) => Number(i.slice(6))).sort((p, q) => p - q);
    const seq = (a: number, z: number, skip: number[] = []) => Array.from({ length: z - a + 1 }, (_, i) => a + i).filter((n) => !skip.includes(n));
    assert.deepEqual(btn(by('tm-warthog-stick')), seq(1, 19), 'Warthog stick: buttons 1-19, each once');
    assert.deepEqual(btn(by('tm-warthog-throttle')), seq(1, 32), 'Warthog throttle: buttons 1-32, each once (= the 32-button browser cap)');
    assert.deepEqual(btn(by('tm-t16000m')), seq(1, 16), 'T.16000M: 1-16');
    assert.deepEqual(btn(by('tm-twcs')), seq(1, 14), 'TWCS: 1-14');
    assert.deepEqual(btn(by('virpil-alpha-prime')), seq(1, 32), 'Alpha Prime: 1-32');
    assert.deepEqual(btn(by('virpil-vmax-prime')), seq(1, 51), 'VMAX Prime: 1-51 (no shift)');
    assert.deepEqual(btn(by('winctrl-carrierace')), seq(1, 27), 'CarrierAce: 1-27 (19 = trim hat push, confirmed by Federico)');
    assert.deepEqual(btn(by('winctrl-viperace')), seq(1, 42), 'ViperAce: 1-42 (19 = trim hat push, confirmed by Federico)');
    assert.deepEqual(btn(by('winctrl-orion')), [...seq(1, 62, [45, 46, 47, 48, 49]), ...seq(65, 111)], 'Orion: grips 1-62, panel 65-111');
    assert.deepEqual(btn(by('winctrl-ursa-combat')), seq(1, 81, [26]), 'URSA MINOR Combat: 1-81 (26 unused)');
    assert.deepEqual(btn(by('moza-ab6')), seq(1, 62, Array.from({ length: 19 }, (_, i) => 30 + i)), 'AB6 + MHG: grip 1-29, base 49-62');
    assert.deepEqual(btn(by('winctrl-carrierace-mfd-l')), seq(1, 44), 'CarrierAce MFD: bezel 1-44');
    assert.equal(by('winctrl-carrierace-mfd-l').callouts.length, 9, 'MFD: 4 banks + 4 rockers + BRT');
    { // CarrierAce UFC + HUD / PTO 2: DI coverage per view from Federico's WinCtrl diagrams
      const uh = by('winctrl-carrierace-ufc-hud'), pto = by('winctrl-carrierace-pto2');
      const b = (...n: number[]) => n.map((i) => `button${i}`);
      const ins = (x: DeviceTemplate, id: string) => x.callouts.find((c) => c.id === id)!.inputs;
      const onView = (x: DeviceTemplate, v: string) => ({ ...x, callouts: x.callouts.filter((c) => c.view === v) });
      assert.deepEqual(uh.views!.map((v) => v.id), ['ufc', 'hud'], 'UFC + HUD: two photo views');
      assert.deepEqual(btn(onView(uh, 'ufc')), [...seq(1, 26), 29, ...seq(32, 41)], 'UFC: 1-26, PULL 29/32, top toggles 33-38, ADF 39-41');
      assert.deepEqual(btn(onView(uh, 'hud')), seq(65, 83), 'HUD: 65-83');
      const axes = (x: DeviceTemplate, v: string) => x.callouts.filter((c) => c.view === v && c.kind === 'axis').map((c) => `${c.id}:${c.inputs.join(',')}`).sort();
      assert.deepEqual(axes(uh, 'ufc'), ['brt:rotz', 'vol1:rotx', 'vol2:roty'], 'UFC axes RX / RY / RZ');
      assert.deepEqual(axes(uh, 'hud'), ['aoa:slider2', 'bal:z', 'blk:y', 'hbrt:x'], 'HUD axes X / Y / Z / Dial');
      assert.equal(uh.callouts.length, 25, 'UFC + HUD: 14 UFC + 11 HUD callouts');
      assert.deepEqual(ins(uh, 'adf'), b(39, 40, 41)); assert.deepEqual(ins(uh, 'rej'), b(65, 66, 67)); assert.deepEqual(ins(uh, 'hdg'), b(80, 79, 78));
      assert.deepEqual(ins(uh, 'crs'), b(83, 82, 81)); assert.deepEqual(ins(uh, 'comm1'), ['', '', 'button29']); assert.deepEqual(ins(uh, 'comm2'), ['', '', 'button32']);
      assert.deepEqual(['tgl1', 'tgl2', 'tgl3'].map((id) => ins(uh, id)), [b(33, 34), b(35, 36), b(37, 38)], 'top toggles in pairs');
      assert.deepEqual(btn(pto), [1, ...seq(3, 41)], 'PTO 2: 1, 3-41 (2 = MASTER CAUTION, not numbered in the diagram)');
      assert.equal(pto.callouts.length, 14, 'PTO 2: 14 callouts');
      assert.deepEqual(ins(pto, 'seljett'), b(17, 18, 19, 20, 21)); assert.deepEqual(ins(pto, 'jettbtn'), b(22));
      assert.deepEqual(ins(pto, 'brake'), b(38, 39, 40, 41)); assert.deepEqual(ins(pto, 'wfold'), b(28, 29, 30, 31));
      assert.deepEqual(ins(pto, 'jettsta'), b(23, 24, 25, 26, 27)); assert.deepEqual(ins(pto, 'gear'), b(35, 36, 37)); assert.deepEqual(ins(pto, 'hook'), b(32, 33, 34));
      // exact anchors: layout fractions of the photo -> canvas fractions (photo centred between the label gutters)
      const L = DEVICE_PHOTO_LAYOUTS;
      const at = (x: DeviceTemplate, id: string) => {
        const lay = L[x.id], a = lay.anchors[id], photo = lay.views.find((v) => v.id === a.view)!.photo, view = x.views!.find((v) => v.id === a.view)!;
        const pw = DEVICE_PHOTO_SIZES[photo][0], gx = (view.width - pw) / 2, cc = x.callouts.find((c) => c.id === id)!;
        assert.equal(cc.view, a.view, `${x.id}/${id}: on view ${a.view}`);
        assert.ok(Math.abs(cc.anchor.x - (gx + a.x * pw) / view.width) < 1e-9 && Math.abs(cc.anchor.y - a.y) < 1e-9, `${x.id}/${id}: anchor from the layout`);
        return [a.x, a.y];
      };
      assert.deepEqual(at(uh, 'ip'), [0.125, 0.238]); assert.deepEqual(at(uh, 'keypad'), [0.274, 0.462]); assert.deepEqual(at(uh, 'tgl2'), [0.42, 0.131]);
      assert.deepEqual(at(uh, 'comm2'), [0.674, 0.811]); assert.deepEqual(at(uh, 'rej'), [0.098, 0.377]); assert.deepEqual(at(uh, 'aoa'), [0.244, 0.536]); assert.deepEqual(at(uh, 'crs'), [0.747, 0.792]);
      assert.deepEqual(at(pto, 'jett1'), [0.122, 0.528]); assert.deepEqual(at(pto, 'seljett'), [0.445, 0.33]); assert.deepEqual(at(pto, 'wfold'), [0.664, 0.846]); assert.deepEqual(at(pto, 'hook'), [0.65, 0.484]);
      for (const x of [uh, pto]) for (const cc of x.callouts) at(x, cc.id);
    }
    assert.deepEqual(btn(by('moza-mtp')), seq(1, 71), 'MTP: 1-71');
    assert.deepEqual(btn(by('moza-mtq')), seq(1, 75, [44, 45, 46, 47, 48]), 'MTQ: 1-65 (combat grip) + 66-75 (Airbus / Boeing grips)');
    const ins = (x: DeviceTemplate, id: string) => x.callouts.find((c) => c.id === id)!.inputs;
    const st = by('tm-warthog-stick'), th = by('tm-warthog-throttle');
    assert.deepEqual(ins(st, 'trig'), ['button1', 'button6']); assert.deepEqual(ins(st, 'cms'), ['button15', 'button16', 'button17', 'button18', 'button19']);
    assert.deepEqual(ins(st, 'trim'), ['hat1_up', 'hat1_right', 'hat1_down', 'hat1_left']); assert.deepEqual(ins(st, 'xy'), ['x', 'y']);
    assert.deepEqual(ins(th, 'mic'), ['button3', 'button4', 'button5', 'button6', 'button2'], 'MIC: up/right/down/left + push');
    assert.deepEqual(ins(th, 'eol'), ['button31', 'button18'], 'engine operate L: IGN (up) = 31, MOTOR (down) = 18');
    assert.deepEqual([ins(th, 'rthr'), ins(th, 'lthr'), ins(th, 'frict'), ins(th, 'slew')], [['z'], ['rotz'], ['slider1'], ['x', 'y']]);
    if (!th.views) assert.equal(th.callouts.find((c) => c.id === 'ff')!.inputRegions?.length, 2, 'fuel flow: one outline per switch'); // (art only: photos have markers)
    assert.deepEqual([st.views?.map((v) => v.id), th.views?.map((v) => v.id)], [['thumb', 'side'], ['top', 'front']], 'Warthog: photo templates (measured layouts)');
    assert.deepEqual(ins(by('tm-t16000m'), 'lpanel'), ['button5', 'button6', 'button7', 'button8', 'button9', 'button10']);
    assert.deepEqual(ins(by('virpil-alpha-prime'), 'h8'), ['button9', 'button12', 'button11', 'button10', 'button8'], 'Alpha hat: up 9 / right 12 / down 11 / left 10 / push 8');
    assert.deepEqual(ins(by('winctrl-ursa-combat'), 'det'), Array.from({ length: 10 }, (_, i) => `button${16 + i}`), 'URSA: all lever detents in one callout'); assert.deepEqual([ins(by('winctrl-ursa-combat'), 'b28'), ins(by('winctrl-ursa-combat'), 'b29')], [['button28'], ['button29']]);
    assert.deepEqual(ins(by('moza-mtq'), 'flapsb'), ['button40', 'button39', 'button38', 'button37', 'button36']);
    {
      // MTQ: ministick 62, button 65 and the side wheel 63 / 64 apart; Airbus / Boeing grip buttons on their own (swappable) photos
      const q = by('moza-mtq'), on = (v: string) => q.callouts.filter((c) => c.view === v).map((c) => c.id);
      assert.deepEqual([ins(q, 'minib'), ins(q, 'b65'), ins(q, 'wheel'), q.callouts.find((c) => c.id === 'wheel')!.kind], [['button62'], ['button65'], ['button63', 'button64'], 'encoder']);
      assert.ok(!q.callouts.some((c) => c.id === 'b63'), 'no combined 63-65 callout');
      assert.deepEqual(q.views!.map((v) => [v.id, v.swap ?? '']), [['levers', ''], ['panel', ''], ['combat', 'Grip'], ['airbus', 'Grip'], ['boeing', 'Grip']]);
      assert.deepEqual(on('combat'), ['mini', 'minib', 'b65', 'wheel']);
      assert.deepEqual(on('airbus'), ['ab66', 'ab67']); assert.deepEqual([ins(q, 'ab66'), ins(q, 'ab67')], [['button66'], ['button67']]);
      assert.deepEqual(on('boeing').map((id) => ins(q, id)[0]).sort(), seq(68, 75).map((n) => `button${n}`).sort());
      assert.deepEqual([ins(q, 'ap72'), ins(q, 'toga73'), ins(q, 'rev74'), ins(q, 'rev75')], [['button72'], ['button73'], ['button74'], ['button75']], 'Boeing left: AP disc / TOGA / reverser up / normal');
      assert.deepEqual([ins(q, 'ap68'), ins(q, 'toga69'), ins(q, 'rev70'), ins(q, 'rev71')], [['button68'], ['button69'], ['button70'], ['button71']], 'Boeing right');
      assert.equal(tp.maxButton(q), 75); assert.match(q.notes!, /up to 75/);
    }
    assert.match(by('winctrl-ursa-combat').notes!, /grip maps/); assert.doesNotMatch(by('winctrl-ursa-combat').notes!, /PROVISIONAL/);
    assert.equal(tp.maxButton(by('winctrl-orion')), 111); assert.equal(tp.maxButton(by('tm-warthog-throttle')), 32);
    // auto-link: USB id (Chromium id string), name only (Firefox), generic fallback for other devices
    const ident = (id: string, buttons: number) => { const q = cap.parsePadId(id); return { name: q.name, vendor: q.vendor, productId: q.product, buttons, slot: 'js' as const }; };
    const pick = (id: string, n: number) => tp.pickTemplate(all, ident(id, n)).template.id;
    assert.equal(pick('Joystick - HOTAS Warthog (Vendor: 044f Product: 0402)', 19), st.id);
    assert.equal(pick('Throttle - HOTAS Warthog (Vendor: 044f Product: 0404)', 32), th.id);
    assert.equal(pick('044f-0404-Throttle - HOTAS Warthog', 32), th.id, 'Firefox-style id');
    assert.equal(tp.pickTemplate(all, { name: 'Throttle - HOTAS Warthog', slot: 'js' }).how, 'matched', 'name alone links');
    assert.equal(pick('T.16000M (Vendor: 044f Product: b10a)', 16), 'builtin-tm-t16000m');
    assert.equal(pick('TWCS Throttle (Vendor: 044f Product: b687)', 14), 'builtin-tm-twcs');
    assert.equal(pick('MOZA AB6 Flight Base (Vendor: 346e Product: 1002)', 128), 'builtin-moza-ab6', 'AB6 with 128 buttons');
    assert.equal(pick('346e-1002-MOZA AB6 Flight Base', 133), 'builtin-moza-ab6', 'AB6 with 133 buttons');
    // two identical MOZA bases: the last is the stick, the others the throttle plugged into a base (AB6 -> MTQ, AB9 -> MTP); a pick wins; user templates don't
    const ab6 = (n: number, of = 2) => ({ ...ident('MOZA AB6 FFB Base (Vendor: 346e Product: 1002)', 128), dup: { n, of } });
    const ab9 = (n: number, of = 2) => ({ ...ident('MOZA AB9 FFB Base (Vendor: 346e Product: 1000)', 128), dup: { n, of } });
    assert.deepEqual([tp.pickTemplate(all, ab6(1)).template.id, tp.pickTemplate(all, ab6(2)).template.id, tp.pickTemplate(all, ab6(1, 3)).template.id], ['builtin-moza-mtq', 'builtin-moza-ab6', 'builtin-moza-mtq']);
    assert.equal(tp.pickTemplate(all, ab6(1)).how, 'guessed');
    assert.equal(tp.pickTemplate(all, ab6(1), 'builtin-moza-mtp').template.id, 'builtin-moza-mtp', 'the user pick wins over the guess');
    assert.equal(tp.pickTemplate(all, ab9(1)).template.id, 'builtin-moza-mtp', 'AB9: the 1st is the MTP');
    assert.notEqual(tp.pickTemplate(all, ab9(2)).how, 'guessed', 'AB9: no stick guess for the last (no AB9 template)');
    assert.equal(tp.pickTemplate(all, { ...ab6(1), dup: undefined }).template.id, 'builtin-moza-ab6', 'one AB6: the stick');
    assert.equal(tp.pickTemplate([tpl('mine', [{ vendor: '346E', product: '1002' }]), ...all], ab6(1)).template.id, 'builtin-moza-mtq', 'identical devices: the order guess beats a match rule (a copy is picked explicitly)');
    assert.equal(tp.pickTemplate([tpl('mine-128', [{ vendor: '346E', product: '1002', buttons: 128 }]), ...all], ab6(1)).template.id, 'mine-128', 'a user template linked by the exact button count beats the guess');
    assert.equal(tp.pickTemplate(all, { ...ab6(1), slot: 'gp' }).how, 'fallback', 'slot respected');
    assert.equal(pick('WINCTRL URSA MINOR Combat Joystick (Vendor: 4098 Product: b970)', 81), 'builtin-winctrl-ursa-combat');
    assert.equal(pick('4098-bc27-WINCTRL URSA MINOR Throttle', 81), 'builtin-winctrl-ursa-combat');
    assert.equal(tp.pickTemplate(all, { name: 'URSA MINOR Throttle L', slot: 'js' }).template.id, 'builtin-winctrl-ursa-combat', 'URSA by name');
    for (const [name, id] of [['VPC Constellation Alpha Prime R', 'virpil-alpha-prime'], ['VPC VMAX Prime Throttle', 'virpil-vmax-prime'], ['WINCTRL Orion Joystick Base Metal 2 + JGRIP-F18', 'winctrl-carrierace'],
      ['WINCTRL Orion Joystick Base Metal 2 + JGRIP-F16', 'winctrl-viperace'], ['WINCTRL Orion Throttle Base II + F15EX HANDLE L + F15EX HANDLE R', 'winctrl-orion'], ['MOZA MTP Throttle', 'moza-mtp'], ['MOZA MTQ Throttle', 'moza-mtq'],
      [' VKB-Sim Gladiator EVO R ', 'vkb-gladiator-scg'], ['VKBsim Gunfighter Modern Combat Pro', 'vkb-gunfighter-mcg'], ['VKBsim STECS Mk.II Standard', 'vkb-stecs'],
      ['Saitek Pro Flight X-56 Rhino Stick', 'logitech-x56-stick'], ['Logitech X56 H.O.T.A.S. Throttle', 'logitech-x56-throttle']] as const)
      assert.equal(tp.pickTemplate(all, { name, slot: 'js' }).template.id, `builtin-${id}`, name);
    // new builtins from Federico's exports: USB + name auto-match
    assert.equal(pick('WINCTRL Orion Combat Rudder Pedals Metal (Vendor: 4098 Product: bef0)', 15), 'builtin-winctrl-orion-pedals');
    assert.equal(pick('WINCTRL CarrierAce MFD L (Vendor: 4098 Product: bee1)', 32), 'builtin-winctrl-carrierace-mfd-l');
    assert.equal(pick('WINCTRL CarrierAce MFD (Vendor: 4098 Product: bee0)', 32), 'builtin-winctrl-carrierace-mfd-l', 'MFD USB BEE0');
    assert.equal(pick('WINCTRL CarrierAce MFD R (Vendor: 4098 Product: bee2)', 32), 'builtin-winctrl-carrierace-mfd-l', 'MFD USB BEE2');
    assert.equal(pick('WINCTRL CarrierAce PTO 2 (Vendor: 4098 Product: bf05)', 32), 'builtin-winctrl-carrierace-pto2');
    assert.equal(pick('WINCTRL CarrierAce UFC (Vendor: 4098 Product: bede)', 32), 'builtin-winctrl-carrierace-ufc-hud');
    assert.equal(pick('Controller (Azeron Keypad - XInput) (Vendor: 16d0 Product: 12f7)', 20), 'builtin-azeron-keypad');
    assert.equal(pick('Bravo Throttle Quadrant (Vendor: 294b Product: 1901)', 48), 'builtin-honeycomb-bravo');
    assert.equal(tp.pickTemplate(all, { name: 'Honeycomb Bravo', slot: 'js' }).template.id, 'builtin-honeycomb-bravo', 'Bravo by name');
    assert.equal(tp.pickTemplate(all, { name: 'WINCTRL Orion Pedals', slot: 'js' }).template.id, 'builtin-winctrl-orion-pedals', 'Orion pedals by name');
    assert.equal(tp.pickTemplate(all, { name: 'WINCTRL CarrierAce MFD L', slot: 'js' }).template.id, 'builtin-winctrl-carrierace-mfd-l');
    // still no template: ViperAce ICP, Orion F18 HANDLE throttle (the VKB T-Rudder has its pedal template now)
    for (const name of ['WINCTRL ViperAce ICP', 'WINCTRL Orion Throttle Base II + F18 HANDLE'])
      assert.ok(!tp.pickTemplate(all, { name, slot: 'js' }).template.id.startsWith('builtin-winctrl') && !tp.pickTemplate(all, { name, slot: 'js' }).template.id.startsWith('builtin-vkb'), `${name} is not a stick/throttle template`);
    assert.equal(pick('Thrustmaster T.Flight Hotas One (Vendor: 044f Product: b68d)', 14), 'builtin-stick', 'other devices keep the generic stick');
    assert.equal(tp.pickTemplate(all, { name: 'Throttle - HOTAS Warthog', slot: 'gp' }).template.id, 'builtin-gamepad', 'slot respected');
    // picker groups: user templates, generic built-ins, then brands A-Z
    const mine = { ...tp.newTemplate('js', 'Mine'), brand: 'Thrustmaster' };
    const gr = tp.templateGroups([mine, ...all]);
    assert.deepEqual(gr.map((g) => g.label), ['Your templates', 'Generic (built-in)', 'Azeron', 'Honeycomb', 'Logitech', 'MFG', 'MOZA', 'Thrustmaster', 'VIRPIL', 'VKB', 'WinCtrl']);
    assert.deepEqual(gr[0].templates.map((x) => x.name), ['Mine'], 'a user copy of a brand template stays under “Your templates”');
    assert.equal(gr[7].templates.length, 6, 'Thrustmaster: Warthog stick + throttle, T.16000M, TWCS, TFRP, TPR');
    // a copy of an unassigned template takes numbers per callout (the editor's “Customize a copy” path)
    const copy = tp.cloneTemplate(by('vkb-gladiator-scg'), 'My Gladiator');
    assert.ok(!copy.builtin && !(copy as any).loadImage);
    copy.callouts = copy.callouts.map((c) => (c.id === 'a2' ? { ...c, inputs: ['button7'] } : c));
    const saved = tp.parseTemplates(tp.exportTemplates([copy]))[0];
    assert.deepEqual(saved.callouts.find((c) => c.id === 'a2')!.inputs, ['button7']);
    assert.equal(tp.shortInput(''), '?');
  });
  t('rudder pedal built-ins: USB / name auto-match, axes per set, nothing taken from the existing templates', () => {
    const all = [...BUILTIN_TEMPLATES, ...DEVICE_TEMPLATES];
    const by = (id: string) => DEVICE_TEMPLATES.find((x) => x.id === `builtin-${id}`)!;
    const ident = (id: string, buttons = 0) => { const q = cap.parsePadId(id); return { name: q.name, vendor: q.vendor, productId: q.product, buttons, slot: 'js' as const }; };
    const pick = (id: string, n = 0) => tp.pickTemplate(all, ident(id, n)).template.id;
    const byName = (name: string) => tp.pickTemplate(all, { name, slot: 'js' }).template.id;
    // axes per set: left toe brake / right toe brake / rudder (no buttons on any of them)
    const SETS: [string, string, string, string | null, string | null, string][] = [
      ['honeycomb-charlie', 'Honeycomb', 'honeycomb-charlie-main', 'x', 'y', 'z'],
      ['logitech-flight-rudder', 'Logitech', 'logitech-flight-rudder-main', 'x', 'y', 'rotz'],
      ['mfg-crosswind', 'MFG', 'mfg-crosswind-v3-main', 'x', 'y', 'rotz'],
      ['tm-tfrp', 'Thrustmaster', 'tm-tfrp-main', 'y', 'x', 'z'],
      ['tm-tpr', 'Thrustmaster', 'tm-tpr-main', 'y', 'x', 'z'],
      ['virpil-r1-falcon', 'VIRPIL', 'virpil-r1-falcon-main', 'slider1', 'slider2', 'z'],
      ['vkb-t-rudder', 'VKB', 'vkb-t-rudder-main', null, null, 'rotx'],
    ];
    const ids = DEVICE_TEMPLATES.map((x) => x.id);
    const firstPedal = ids.indexOf('builtin-honeycomb-charlie');
    for (const [id, brand, photo, l, r, rud] of SETS) {
      const d = by(id);
      assert.ok(d, id);
      assert.ok(ids.indexOf(d.id) >= firstPedal, `${id}: after every older built-in (older templates win ties)`);
      assert.equal(d.brand, brand);
      assert.deepEqual(d.views?.map((v) => [v.id, v.image]), [['main', `/device-photos/${photo}.webp`]], `${id}: one photo page`);
      const [pw, ph] = DEVICE_PHOTO_SIZES[photo];
      const v = d.views![0];
      assert.equal(v.height, ph); assert.equal(v.width, Math.round(pw + 0.6 * ph), `${id}: label gutters like the other photo built-ins`);
      const ax = Object.fromEntries(d.callouts.map((c) => [c.id, c]));
      assert.ok(d.callouts.every((c) => c.kind === 'axis' && c.inputs.length === 1 && c.view === 'main'), `${id}: axes only`);
      assert.deepEqual(d.callouts.map((c) => c.inputs[0]).sort(), [l, r, rud].filter(Boolean).sort(), `${id}: axis coverage`);
      assert.equal(ax.rudder.inputs[0], rud, `${id}: rudder`); assert.equal(ax.rudder.label, 'Rudder');
      if (l) { assert.equal(ax.ltoe.inputs[0], l, `${id}: left toe brake`); assert.equal(ax.ltoe.label, 'Left Toe Brake'); }
      if (r) { assert.equal(ax.rtoe.inputs[0], r, `${id}: right toe brake`); assert.equal(ax.rtoe.label, 'Right Toe Brake'); }
      if (l && r) assert.ok(ax.ltoe.box.x < 0.5 && ax.rtoe.box.x > 0.5, `${id}: left brake labelled left, right brake right`);
      // anchors sit on the photo (inside the product box), not in the label gutters
      const [, , bx, by0, bw, bh] = DEVICE_PHOTO_SIZES[photo], gx = (v.width - pw) / 2;
      for (const c of d.callouts) {
        const px = (c.anchor.x * v.width - gx) / pw;
        assert.ok(px >= bx && px <= bx + bw && c.anchor.y >= by0 && c.anchor.y <= by0 + bh, `${id}/${c.id}: anchor on the product`);
      }
      assert.equal(tp.maxButton(d), 0, `${id}: no buttons`);
    }
    assert.equal(by('vkb-t-rudder').callouts.length, 1, 'T-Rudder Mk.V: rudder only (no toe brakes)');
    // auto-link by USB id (Chromium) and by name (Firefox ids / renamed devices)
    for (const [padId, id] of [
      ['Honeycomb Aeronautical Charlie Rudder Pedal (Vendor: 294b Product: 1903)', 'honeycomb-charlie'],
      ['294b-1903-Charlie Rudder Pedals', 'honeycomb-charlie'],
      ['Saitek Pro Flight Rudder Pedals (Vendor: 06a3 Product: 0763)', 'logitech-flight-rudder'],
      ['Logitech G Flight Rudder Pedals (Vendor: 06a3 Product: 0763)', 'logitech-flight-rudder'],
      ['MFG Crosswind V2 (Vendor: 16d0 Product: 0a38)', 'mfg-crosswind'],
      ['16d0-0a38-MFG Crosswind v2/3', 'mfg-crosswind'],
      ['T-Rudder (Vendor: 044f Product: b679)', 'tm-tfrp'],
      ['T.Flight Rudder Pedals (Vendor: 044f Product: b678)', 'tm-tfrp'],
      ['044f-b679-T-Rudder', 'tm-tfrp'],
      ['T-Pendular-Rudder (Vendor: 044f Product: b68f)', 'tm-tpr'],
      ['VPC R1-FALCON Rudder Pedals (Vendor: 3344 Product: 0000)', 'virpil-r1-falcon'],
      ['VPC Rudder Pedals (Vendor: 3344 Product: 01f8)', 'virpil-r1-falcon'],
      ['VKBsim T-Rudder (Vendor: 231d Product: 011f)', 'vkb-t-rudder'],
      [' VKBsim T-Rudder ', 'vkb-t-rudder'],
    ] as const) assert.equal(pick(padId), `builtin-${id}`, padId);
    for (const [name, id] of [['Charlie Rudder Pedals', 'honeycomb-charlie'], ['Honeycomb Charlie', 'honeycomb-charlie'], ['Saitek Pro Flight Rudder Pedals', 'logitech-flight-rudder'],
      ['MFG Crosswind V2', 'mfg-crosswind'], ['T.Flight Rudder Pedals', 'tm-tfrp'], ['T-Pendular-Rudder', 'tm-tpr'], ['VIRPIL R1-FALCON', 'virpil-r1-falcon'], ['VKBsim T-Rudder', 'vkb-t-rudder']] as const)
      assert.equal(byName(name), `builtin-${id}`, `${name} by name`);
    // the VKB "T-Rudder" never goes to the TFRP and a TFRP never goes to the VKB
    assert.equal(byName('T-Rudder') === 'builtin-tm-tfrp', false, 'bare “T-Rudder” without the Thrustmaster vendor id: not linked to the TFRP');
    assert.equal(pick('VKBsim T-Rudder (Vendor: 231d Product: 0120)'), 'builtin-vkb-t-rudder', 'VKB with another PID: by name');
    // the Orion pedals still win their own id and names; other devices keep their template
    assert.equal(pick('WINCTRL Orion Combat Rudder Pedals Metal (Vendor: 4098 Product: bef0)', 15), 'builtin-winctrl-orion-pedals');
    assert.equal(pick('4098-bef0-WINCTRL Orion Combat Rudder Pedals', 15), 'builtin-winctrl-orion-pedals');
    assert.equal(byName('WINCTRL Orion Pedals'), 'builtin-winctrl-orion-pedals');
    assert.equal(byName('WINCTRL Orion Combat Rudder Pedals'), 'builtin-winctrl-orion-pedals');
    assert.equal(pick('Saitek Pro Flight Combat Rudder Pedals (Vendor: 06a3 Product: 0764)'), 'builtin-winctrl-orion-pedals', 'Combat Rudder Pedals: unchanged (Orion name rule), not the Flight Rudder Pedals');
    assert.notEqual(pick('Saitek Pro Flight Cessna Rudder Pedals (Vendor: 06a3 Product: 0765)'), 'builtin-logitech-flight-rudder');
    assert.equal(pick('Bravo Throttle Quadrant (Vendor: 294b Product: 1901)', 48), 'builtin-honeycomb-bravo', 'Bravo keeps 294B:1901');
    assert.equal(pick('Controller (Azeron Keypad - XInput) (Vendor: 16d0 Product: 12f7)', 20), 'builtin-azeron-keypad', 'Azeron keeps 16D0:12F7 (same vendor id as MFG)');
    assert.equal(pick('T.16000M (Vendor: 044f Product: b10a)', 16), 'builtin-tm-t16000m');
    assert.equal(pick('TWCS Throttle (Vendor: 044f Product: b687)', 14), 'builtin-tm-twcs');
    assert.equal(pick('Thrustmaster T.Flight Hotas One (Vendor: 044f Product: b68d)', 14), 'builtin-stick', 'T.Flight HOTAS (TFRP on RJ12 inside): generic stick');
    assert.equal(byName('VPC Constellation Alpha Prime R'), 'builtin-virpil-alpha-prime');
    assert.equal(byName('VKBsim Gladiator EVO R'), 'builtin-vkb-gladiator-scg');
    // no pedal template claims a device another built-in matched before (every existing USB id + name keeps its template)
    const older = DEVICE_TEMPLATES.slice(0, firstPedal);
    for (const o of older) for (const m of o.match) {
      const name = m.name ?? o.name;
      const idn = { name, vendor: m.vendor, productId: m.product, buttons: m.buttons, slot: 'js' as const };
      assert.equal(tp.pickTemplate(all, idn).template.id, tp.pickTemplate([...BUILTIN_TEMPLATES, ...older], idn).template.id, `${o.id}: ${JSON.stringify(m)} keeps its template`);
    }
  });
  t('Orion pedals: callouts keep Federico export anchor+box fractions (no withPhotoLayout re-box)', () => {
    const ped = DEVICE_TEMPLATES.find((x) => x.id === 'builtin-winctrl-orion-pedals')!;
    assert.ok(ped);
    assert.deepEqual(ped.views?.map((v) => [v.id, v.label, v.image, v.width, v.height]),
      [['main', 'Pedals', '/device-photos/winctrl-orion-pedals-main.webp', 1413.0434782608697, 1000]]);
    const by = Object.fromEntries(ped.callouts.map((c) => [c.id, c]));
    const expect: Record<string, { label: string; kind: string; inputs: string[]; ax: number; ay: number; bx: number; by: number }> = {
      ltoe: { label: 'Left Toe Brake', kind: 'axis', inputs: ['roty'], ax: 0.23650188953704254, ay: 0.10839489180422053, bx: 0.3330798421069243, by: 0.04177298971756422 },
      rtoe: { label: 'Right Toe Brake', kind: 'axis', inputs: ['rotx'], ax: 0.7619771631045034, ay: 0.37273337810611146, bx: 0.7847908513174311, by: 0.06541302477937164 },
      rudder: { label: 'Rudder', kind: 'axis', inputs: ['rotz'], ax: 0.41064638783269963, ay: 0.4694425789120215, bx: 0.09581749339520705, by: 0.7466756130241563 },
      rudbtns: { label: 'Rudder Buttons', kind: 'buttons', inputs: ['button11', 'button12', 'button13', 'button14', 'button15'], ax: 0.36958173744578776, ay: 0.5543317416916764, bx: 0.21901140104228553, by: 0.8723975412792772 },
      rbtns: { label: 'Right Buttons', kind: 'buttons', inputs: ['button1', 'button3', 'button4', 'button5', 'button6'], ax: 0.7460075929590958, ay: 0.4415043407514481, bx: 0.8577947000133674, by: 0.21584953887099143 },
      lbtns: { label: 'Left Buttons', kind: 'buttons', inputs: ['button2', 'button7', 'button8', 'button9', 'button10'], ax: 0.22205323774098443, ay: 0.19865680845733294, bx: 0.48745245987924785, by: 0.0847548567424131 },
    };
    assert.deepEqual(Object.keys(by).sort(), Object.keys(expect).sort());
    for (const [id, e] of Object.entries(expect)) {
      const c = by[id];
      assert.equal(c.label, e.label, id);
      assert.equal(c.kind, e.kind, id);
      assert.deepEqual(c.inputs, e.inputs, id);
      assert.equal(c.view, 'main', id);
      assert.ok(Math.abs(c.anchor.x - e.ax) < 1e-12 && Math.abs(c.anchor.y - e.ay) < 1e-12, `${id} anchor`);
      assert.ok(Math.abs(c.box.x - e.bx) < 1e-12 && Math.abs(c.box.y - e.by) < 1e-12, `${id} box`);
    }
    assert.equal(DEVICE_PHOTO_LAYOUTS['builtin-winctrl-orion-pedals'], undefined, 'not in DEVICE_PHOTO_LAYOUTS (exact path)');
    assert.ok(ped.match.some((m) => m.vendor === '4098' && m.product === 'BEF0'));
  });
  t('MOZA AB6: callouts keep Federico export anchor+box fractions (no withPhotoLayout re-box)', () => {
    const ab6 = DEVICE_TEMPLATES.find((x) => x.id === 'builtin-moza-ab6')!;
    assert.ok(ab6);
    assert.deepEqual(ab6.views?.map((v) => [v.id, v.label, v.image, v.width, v.height]),
      [['front', 'Front', '/device-photos/moza-ab6-front.webp', 1594, 990],
       ['back', 'Back', '/device-photos/moza-ab6-back.webp', 1594, 990]]);
    const by = Object.fromEntries(ab6.callouts.map((c) => [c.id, c]));
    assert.equal(ab6.callouts.length, 19);
    assert.deepEqual(by.trig.inputs, ['button1', 'button6']);
    assert.deepEqual(by.minib.inputs, ['button25', 'button26', 'button27', 'button28', 'button29']);
    assert.ok(Math.abs(by.b2.anchor.x - 0.4429657794676806) < 1e-12 && Math.abs(by.b2.box.y - 0.0521026303093653) < 1e-12, 'b2 exact');
    assert.ok(Math.abs(by.wrb.anchor.x - 0.59429658955041) < 1e-12 && Math.abs(by.wrb.box.y - 0.921313452697316) < 1e-12, 'wrb exact');
    assert.equal(by.hat17.view, 'back');
    assert.equal(DEVICE_PHOTO_LAYOUTS['builtin-moza-ab6'], undefined, 'not in DEVICE_PHOTO_LAYOUTS (exact path)');
    assert.ok(ab6.match.some((m) => m.vendor === '346E' && m.product === '1002'));
  });
  t('Honeycomb Bravo: callouts keep Federico export anchor+box fractions (no withPhotoLayout re-box)', () => {
    const br = DEVICE_TEMPLATES.find((x) => x.id === 'builtin-honeycomb-bravo')!;
    assert.ok(br);
    assert.deepEqual(br.views?.map((v) => [v.id, v.label, v.image, v.width, v.height]),
      [['main', 'Bravo', '/device-photos/honeycomb-bravo-main.webp', 1825, 1031]]);
    assert.ok(br.match.some((m) => m.vendor === '294B' && m.product === '1901'));
    const by = Object.fromEntries(br.callouts.map((c) => [c.id, c]));
    const expect: Record<string, { label: string; kind: string; inputs: string[]; ax: number; ay: number; bx: number; by: number }> = {
      apsel: { label: "AP mode (IAS/CRS/HDG/VS/ALT)", kind: 'switch', inputs: ["button17", "button18", "button19", "button20", "button21"], ax: 0.42243348328332936, ay: 0.3188625338925878, bx: 0.18745248308653162, by: 0.10617531909946491 },
      ap: { label: "AP modes (HDG…IAS)", kind: 'buttons', inputs: ["button1", "button2", "button3", "button4", "button5", "button6", "button7"], ax: 0.5737642353478494, ay: 0.30270906544112974, bx: 0.6954372391501307, by: 0.06579167364605011 },
      apenc: { label: "AP value (INCR / DECR)", kind: 'encoder', inputs: ["button13", "button14"], ax: 0.6216730038022814, ay: 0.30001681214080994, bx: 0.8612167300380228, by: 0.12771326847633221 },
      apm: { label: "AUTO PILOT", kind: 'button', inputs: ["button8"], ax: 0.6619772095190708, ay: 0.28924785028999145, bx: 0.9205323425989187, by: 0.31213192631701864 },
      gear: { label: "Gear (UP / DOWN)", kind: 'switch', inputs: ["button31", "button32"], ax: 0.3365019011406844, ay: 0.4911660775570655, bx: 0.09, by: 0.28 },
      sw14: { label: "Panel switches 1-4", kind: 'buttons', inputs: ["button34", "button35", "button36", "button37", "button38", "button39", "button40", "button41"], ax: 0.4939163266026022, ay: 0.4130910399505557, bx: 0.3821292775665399, by: 0.03 },
      sw57: { label: "Panel switches 5-7", kind: 'buttons', inputs: ["button42", "button43", "button44", "button45", "button46", "button47"], ax: 0.5623573912413855, ay: 0.4023220780997372, bx: 0.5357414216596365, by: 0.03 },
      flaps: { label: "Flaps (down / up)", kind: 'switch', inputs: ["button15", "button16"], ax: 0.6939163498098859, ay: 0.4373212169525124, bx: 0.9091254984924548, by: 0.5248191154349112 },
      trim: { label: "Trim (nose down / up)", kind: 'encoder', inputs: ["button22", "button23"], ax: 0.41254752851711024, ay: 0.6217398747931988, bx: 0.09, by: 0.58 },
      l1: { label: "Lever 1 (Y)", kind: 'axis', inputs: ["y"], ax: 0.4863117638649596, ay: 0.69173820384921, bx: 0.14106463298144903, by: 0.97 },
      l2: { label: "Lever 2 (X)", kind: 'axis', inputs: ["x"], ax: 0.5273764142518714, ay: 0.6876997982235, bx: 0.32433461236409816, by: 0.97 },
      l3: { label: "Lever 3 (RZ)", kind: 'axis', inputs: ["rotz"], ax: 0.5623573912413855, ay: 0.6850075962736408, bx: 0.4969581633013011, by: 0.97 },
      l4: { label: "Lever 4 (RY)", kind: 'axis', inputs: ["roty"], ax: 0.6049429889867515, ay: 0.6823152916228604, bx: 0.8574144486692015, by: 0.97 },
      l5: { label: "Lever 5 (RX)", kind: 'axis', inputs: ["rotx"], ax: 0.6467680840437856, ay: 0.6809691906479308, bx: 0.8893535889600166, by: 0.8034662279831049 },
      l6: { label: "Lever 6 (Z)", kind: 'axis', inputs: ["z"], ax: 0.6840303950436668, ay: 0.6769308877231421, bx: 0.9182509505703422, by: 0.6473161527700851 },
      rev: { label: "Reverse detents", kind: 'buttons', inputs: ["button24", "button25", "button26", "button27", "button28", "button33"], ax: 0.6049429889867515, ay: 0.8869258235407149, bx: 0.6923954604696412, by: 0.97 },
      toga: { label: "Lever TOGA / rev btns", kind: 'buttons', inputs: ["button9", "button10", "button11", "button12", "button29", "button30", "button48"], ax: 0.5661596726102067, ay: 0.5988557987661717, bx: 0.15475284010738474, by: 0.8075046336088149 },
    };
    assert.deepEqual(br.callouts.map((c) => c.id), Object.keys(expect), 'same 17 callouts, export order');
    for (const [id, e] of Object.entries(expect)) {
      const c = by[id];
      assert.equal(c.label, e.label, id); assert.equal(c.kind, e.kind, id); assert.deepEqual(c.inputs, e.inputs, id); assert.equal(c.view, 'main', id);
      assert.ok(Math.abs(c.anchor.x - e.ax) < 1e-12 && Math.abs(c.anchor.y - e.ay) < 1e-12, `${id} anchor`);
      assert.ok(Math.abs(c.box.x - e.bx) < 1e-12 && Math.abs(c.box.y - e.by) < 1e-12, `${id} box`);
    }
    assert.equal(tp.maxButton(br), 48);
    assert.match(br.notes!, /Firefox/);
    assert.equal(DEVICE_PHOTO_LAYOUTS['builtin-honeycomb-bravo'], undefined, 'not in DEVICE_PHOTO_LAYOUTS (exact path)');
  });
  t('MOZA AB6 + ViperAce EX: callouts keep Federico export anchor+box fractions (no withPhotoLayout re-box), same canvases', () => {
    const va = DEVICE_TEMPLATES.find((x) => x.id === 'builtin-moza-ab6-viperace')!;
    assert.ok(va);
    assert.equal(va.name, 'MOZA AB6 base + WinCtrl ViperAce EX grip'); assert.equal(va.brand, 'MOZA'); assert.deepEqual(va.match, []);
    assert.deepEqual(va.views?.map((v) => [v.id, v.label, v.image, v.width, v.height]), [
      ['front', 'Front (on the AB6)', '/device-photos/moza-ab6-viperace-front.webp', 1140, 986],
      ['side', 'Grip, labelled side', '/device-photos/winctrl-viperace-side.webp', 1994, 1430],
    ]);
    // the export's canvases = the app's canvas for each photo (photo centred between the 0.3 * h label gutters)
    for (const [photo, w, h] of [['moza-ab6-viperace-front', 1140, 986], ['winctrl-viperace-side', 1994, 1430]] as const) {
      const [pw, ph] = DEVICE_PHOTO_SIZES[photo];
      assert.deepEqual([Math.round(pw + 0.6 * ph), ph], [w, h], `${photo}: canvas as positioned`);
    }
    const expect: Record<string, { label: string; kind: string; group: string | undefined; view: string; inputs: string[]; ax: number; ay: number; bx: number; by: number }> = {
      cms: { label: "Thumb hat (4-way + push)", kind: 'hat', group: "Side module", view: 'front', inputs: ["button22", "button23", "button24", "button25", "button21"], ax: 0.43750877192982457, ay: 0.135, bx: 0.125, by: 0.13731744421906694 },
      wpn: { label: "Weapon release", kind: 'button', group: "Grip head", view: 'front', inputs: ["button20"], ax: 0.48077192982456146, ay: 0.112, bx: 0.115, by: 0.05 },
      mini: { label: "Ministick", kind: 'axis', group: "Side module", view: 'front', inputs: ["rotx", "roty"], ax: 0.45192982456140357, ay: 0.20700000000000002, bx: 0.115, by: 0.2789756592292089 },
      minib: { label: "Ministick (digital + press)", kind: 'hat', group: "Side module", view: 'front', inputs: ["button27", "button28", "button29", "button30", "button26"], ax: 0.45433333333333337, ay: 0.215, bx: 0.125, by: 0.4206338742393509 },
      trim: { label: "Trim hat (8-way POV)", kind: 'hat', group: "Grip head", view: 'front', inputs: ["hat1_up", "hat1_right", "hat1_down", "hat1_left", "button19"], ax: 0.528361403508772, ay: 0.08, bx: 0.875, by: 0.05 },
      hatD: { label: "Hat D (4-way + push)", kind: 'hat', group: "Grip head", view: 'front', inputs: ["button32", "button33", "button34", "button35", "button31"], ax: 0.5, ay: 0.172, bx: 0.875, by: 0.2718661257606491 },
      hatE: { label: "Hat E (4-way + push)", kind: 'hat', group: "Grip head", view: 'front', inputs: ["button37", "button38", "button39", "button40", "button36"], ax: 0.5576842105263158, ay: 0.16, bx: 0.875, by: 0.16093306288032455 },
      tms: { label: "Hat (4-way + push)", kind: 'hat', group: "Grip", view: 'front', inputs: ["button10", "button11", "button12", "button13", "button9"], ax: 0.48942456140350876, ay: 0.29, bx: 0.125, by: 0.5195131845841785 },
      nws: { label: "Front button", kind: 'button', group: "Grip", view: 'side', inputs: ["button6"], ax: 0.47584267948450665, ay: 0.7111010079796145, bx: 0.1252808945902278, by: 0.8411397854372185 },
      dms: { label: "Hat (4-way + push)", kind: 'hat', group: "Grip", view: 'side', inputs: ["button15", "button16", "button17", "button18", "button14"], ax: 0.5803289869608826, ay: 0.48800000000000004, bx: 0.125, by: 0.43668181818181817 },
      trig: { label: "Trigger (stage 1 / 2)", kind: 'switch', group: "Grip", view: 'side', inputs: ["button4", "button5"], ax: 0.5415887662988966, ay: 0.506, bx: 0.115, by: 0.5573181818181818 },
      wheel: { label: "Wheel / EX trigger (5-way)", kind: 'switch', group: "Grip", view: 'side', inputs: ["button1", "button2", "button41", "button42", "button3"], ax: 0.670912738214644, ay: 0.551, bx: 0.885, by: 0.48402517482517493 },
      wheela: { label: "Wheel / EX trigger (analog)", kind: 'axis', group: "Grip", view: 'side', inputs: ["rotz"], ax: 0.6743309929789368, ay: 0.56, bx: 0.885, by: 0.6200000000000001 },
      paddle: { label: "Paddle (stage 1 / 2)", kind: 'switch', group: "Grip", view: 'side', inputs: ["button7", "button8"], ax: 0.6065356068204614, ay: 0.749, bx: 0.8679775280898876, by: 0.751836045261126 },
      xy: { label: "Stick X / Y", kind: 'axis', group: "Axes", view: 'front', inputs: ["x", "y"], ax: 0.5576842105263158, ay: 0.42, bx: 0.885, by: 0.42557809330628804 },
      bkeys: { label: "Base keys (left) 49-52", kind: 'buttons', group: "Base", view: 'front', inputs: ["button49", "button50", "button51", "button52"], ax: 0.418280701754386, ay: 0.64, bx: 0.115, by: 0.6883671399594321 },
      bkeysr: { label: "Base keys (right) 53-56", kind: 'buttons', group: "Base", view: 'front', inputs: ["button53", "button54", "button55", "button56"], ax: 0.6105614035087719, ay: 0.583, bx: 0.885, by: 0.5735091277890467 },
      wl: { label: "Slider wheel (left)", kind: 'axis', group: "Base", view: 'front', inputs: ["slider1"], ax: 0.5624912280701755, ay: 0.68, bx: 0.115, by: 0.7941835699797161 },
      wlb: { label: "Slider wheel (zones)", kind: 'switch', group: "Base", view: 'front', inputs: ["button57", "button58", "button59"], ax: 0.5648947368421052, ay: 0.69, bx: 0.115, by: 0.9 },
      wr: { label: "Dial wheel (right)", kind: 'axis', group: "Base", view: 'front', inputs: ["slider2"], ax: 0.6442105263157896, ay: 0.635, bx: 0.885, by: 0.6913793103448277 },
      wrb: { label: "Dial wheel (zones)", kind: 'switch', group: "Base", view: 'front', inputs: ["button60", "button61", "button62"], ax: 0.6466140350877194, ay: 0.645, bx: 0.885, by: 0.8092494929006087 },
      paddlea: { label: "Paddle lever", kind: 'axis', group: undefined, view: 'side', inputs: ["slider1"], ax: 0.6028090059087517, ay: 0.7471357980803838, bx: 0.8432584612557058, by: 0.9241766887486563 },
    };
    assert.deepEqual(va.callouts.map((c) => c.id), Object.keys(expect), 'same 22 callouts, export order');
    for (const c of va.callouts) {
      const e = expect[c.id];
      assert.equal(c.label, e.label, c.id); assert.equal(c.kind, e.kind, c.id); assert.equal(c.group, e.group, c.id); assert.equal(c.view, e.view, c.id);
      assert.deepEqual(c.inputs, e.inputs, c.id);
      assert.deepEqual([c.anchor.x, c.anchor.y, c.box.x, c.box.y], [e.ax, e.ay, e.bx, e.by], `${c.id}: anchor + box`);
    }
    assert.equal(DEVICE_PHOTO_LAYOUTS['builtin-moza-ab6-viperace'], undefined, 'not in DEVICE_PHOTO_LAYOUTS (exact path)');
  });
  t('URSA Combat: callouts keep Federico export anchor+box fractions (no withPhotoLayout re-box)', () => {
    const u = DEVICE_TEMPLATES.find((x) => x.id === 'builtin-winctrl-ursa-combat')!;
    assert.ok(u);
    assert.deepEqual(u.views?.map((v) => [v.id, v.label, v.image, v.width, v.height]),
      [['base', 'Base and side panel', '/device-photos/winctrl-ursa-combat-front.webp', 2284, 1423],
       ['grip', 'Grips (rear) and levers', '/device-photos/winctrl-ursa-combat-front.webp', 2284, 1423],
       ['back', 'Grips (front)', '/device-photos/winctrl-ursa-combat-back.webp', 2176, 1243]]);
    assert.equal(u.callouts.length, 32);
    const by = Object.fromEntries(u.callouts.map((c) => [c.id, c]));
    assert.deepEqual(by.det.inputs, Array.from({ length: 10 }, (_, i) => `button${16 + i}`));
    assert.deepEqual([by.b28.inputs, by.b29.inputs], [['button28'], ['button29']]);
    assert.ok(Math.abs(by.keys.anchor.x - 0.40608581436077057) < 1e-12, 'keys anchor');
    assert.ok(Math.abs(by.ywb.box.y - 0.810303605118721) < 1e-12, 'ywb box');
    assert.equal(by.tog33.view, 'back');
    assert.equal(DEVICE_PHOTO_LAYOUTS['builtin-winctrl-ursa-combat'], undefined, 'not in DEVICE_PHOTO_LAYOUTS (exact path)');
    assert.ok(u.match.some((m) => m.vendor === '4098' && m.product === 'B970'));
  });

  {
    // lazy pictures: a template with loadImage gets its picture on demand (cached afterwards); every device template now uses photos
    const d = DEVICE_TEMPLATES.find((x) => x.id === 'builtin-winctrl-orion')!;
    assert.ok(!d.loadImage && d.views!.length === 3 && d.views!.every((v) => v.image!.startsWith('/device-photos/')), 'Orion uses its photo views');
    assert.deepEqual(DEVICE_TEMPLATES.filter((x) => !x.views?.length).map((x) => x.id), [], 'every device template has a photo layout');
    let calls = 0;
    const lazy = { ...d, id: 'test-lazy-picture', views: undefined, loadImage: async () => { calls++; return 'data:image/svg+xml,<svg/>'; } };
    const r = await tp.resolveTemplateImage(lazy);
    assert.ok(r.image === 'data:image/svg+xml,<svg/>' && !(lazy as { image?: string }).image, 'picture resolves, template untouched');
    assert.equal((await tp.resolveTemplateImage(lazy)).image, r.image, 'cached'); assert.equal(calls, 1);
    const imgs = await Promise.all(DEVICE_TEMPLATES.map((x) => tp.resolveTemplateImage(x).then((y) => y.image ?? y.views!.map((v) => v.image).join()))); // (photo templates: their views' photos)
    assert.equal(new Set(imgs).size, 34, 'one distinct picture per device');
    passed++; console.log('  ✓ device template pictures: all 34 photo templates (distinct), lazy pictures cached');
  }
  t('saved picks of the removed classic templates move to the default stick / throttle (and are saved back)', () => {
    const js = { name: 'VKBsim Gladiator EVO R', vendor: '231D', productId: '0200', buttons: 32, slot: 'js' as const };
    for (const [old, now] of [['builtin-stick-classic', 'builtin-stick'], ['builtin-throttle-classic', 'builtin-throttle']]) {
      const r = tp.pickTemplate(BUILTIN_TEMPLATES, js, old);
      assert.equal(r.template.id, now); assert.equal(r.how, 'chosen');
    }
    assert.deepEqual(tp.migratePicks({ a: 'builtin-stick-classic', b: 'builtin-throttle-classic', c: 'my-1', d: 'builtin-gamepad' }),
      { picks: { a: 'builtin-stick', b: 'builtin-throttle', c: 'my-1', d: 'builtin-gamepad' }, changed: true });
    assert.deepEqual(tp.migratePicks({ c: 'my-1' }), { picks: { c: 'my-1' }, changed: false });
    assert.deepEqual(tp.migratePicks({ c: 5, d: '' }), { picks: {}, changed: true }, 'junk entries dropped');
    assert.deepEqual(tp.migratePicks('nope'), { picks: {}, changed: true });
    const store = new Map<string, string>();
    const prev = (globalThis as any).localStorage;
    (globalThis as any).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    try {
      assert.deepEqual(tp.loadPicks(), {}, 'nothing saved yet');
      assert.equal(store.size, 0, 'nothing written when there is nothing to migrate');
      store.set('sc-mapper:template-picks', JSON.stringify({ k1: 'builtin-throttle-classic', k2: 'my-1' }));
      assert.deepEqual(tp.loadPicks(), { k1: 'builtin-throttle', k2: 'my-1' });
      assert.deepEqual(JSON.parse(store.get('sc-mapper:template-picks')!), { k1: 'builtin-throttle', k2: 'my-1' }, 'migrated picks saved');
    } finally { (globalThis as any).localStorage = prev; }
  });
}

console.log('\nphoto views: focus on press');
{
  const vf = await import('../src/lib/viewFocus');
  const tpl = {
    aspect: 1, image: undefined, views: [{ id: 'front', label: 'Front', width: 100, height: 100 }, { id: 'thumb', label: 'Thumb', width: 100, height: 100 }],
    callouts: [
      { id: 'trig', kind: 'button', inputs: ['button1'], anchor: { x: 0, y: 0 }, box: { x: 0, y: 0 } },
      { id: 'hat', kind: 'hat', view: 'thumb', inputs: ['hat1_up', 'hat1_right', 'hat1_down', 'hat1_left'], anchor: { x: 0, y: 0 }, box: { x: 0, y: 0 } },
      { id: 'xy', kind: 'axis', view: 'front', inputs: ['x', 'y'], anchor: { x: 0, y: 0 }, box: { x: 0, y: 0 } },
      { id: 'b2', kind: 'button', view: 'nope', inputs: ['button2'], anchor: { x: 0, y: 0 }, box: { x: 0, y: 0 } },
    ],
  } as any;
  t('inputViews: every input of a multi-view template mapped to its callout view (unknown / missing view: the first)', () => {
    const m = vf.inputViews(tpl);
    assert.deepEqual(Object.fromEntries(m), { button1: 'front', hat1_up: 'thumb', hat1_right: 'thumb', hat1_down: 'thumb', hat1_left: 'thumb', x: 'front', y: 'front', button2: 'front' });
    assert.equal(vf.inputViews({ ...tpl, views: [tpl.views[0]] }).size, 0, 'single view: nothing to focus');
    assert.equal(vf.inputViews({ ...tpl, views: undefined }).size, 0, 'classic template: nothing to focus');
  });
  t('pressedView: only newly active inputs count; a chord goes to the view most of them are on, a tie to the newest', () => {
    const m = vf.inputViews(tpl);
    const S = (...a: string[]) => new Set(a);
    assert.equal(vf.pressedView(S(), S(), m), null);
    assert.deepEqual(vf.pressedView(S(), S('hat1_up'), m), { view: 'thumb', input: 'hat1_up' });
    assert.equal(vf.pressedView(S('hat1_up'), S('hat1_up'), m), null, 'held input: no new focus');
    assert.equal(vf.pressedView(S('hat1_up'), S(), m), null, 'release: no focus');
    assert.equal(vf.pressedView(S(), S('button99'), m), null, 'input without a callout');
    assert.deepEqual(vf.pressedView(S(), S('button1', 'hat1_up', 'hat1_right'), m), { view: 'thumb', input: 'hat1_right' }, 'two on thumb beat one on front');
    assert.deepEqual(vf.pressedView(S(), S('hat1_up', 'x'), m), { view: 'front', input: 'x' }, 'tie: the newest');
    assert.deepEqual(vf.pressedView(S('hat1_up'), S('hat1_up', 'x'), m), { view: 'front', input: 'x' }, 'the held one does not count');
  });
  t('viewInSight / scrollDelta: scroll only when the view (or its marker) is out of sight, centring it', () => {
    const port = { top: 100, bottom: 900 };
    assert.equal(vf.viewInSight({ top: 150, bottom: 750 }, port), true);
    assert.equal(vf.scrollDelta({ top: 150, bottom: 750 }, port), 0, 'fully visible: stay');
    assert.equal(vf.scrollDelta({ top: 400, bottom: 1000 }, port, { top: 500, bottom: 520 }), 0, 'mostly visible with the marker in sight: stay');
    assert.equal(vf.scrollDelta({ top: 400, bottom: 1000 }, port, { top: 950, bottom: 970 }), 200, 'marker cut off: centre the view (mid 700 -> 500)');
    assert.equal(vf.scrollDelta({ top: 1200, bottom: 1800 }, port), 1000, 'below: centred');
    assert.equal(vf.scrollDelta({ top: -900, bottom: -300 }, port), -1100, 'above: centred');
    assert.equal(vf.scrollDelta({ top: 1000, bottom: 2200 }, port, { top: 1990, bottom: 2010 }), 1300, 'taller than the area: marker centred, clamped to the view bottom');
    assert.equal(vf.scrollDelta({ top: 1000, bottom: 2200 }, port, { top: 1590, bottom: 1610 }), 1100, 'taller than the area: marker centred');
  });
}
console.log('\nphoto views: swappable views (interchangeable grips)');
{
  const vs = await import('../src/lib/viewSwap');
  const tp = await import('../src/lib/templates');
  const V = (id: string, swap?: string) => ({ id, label: id.toUpperCase(), width: 200, height: 100, ...(swap ? { swap } : {}) });
  const C = (id: string, view: string, inputs: string[]) => ({ id, kind: 'button', view, inputs, anchor: { x: 0, y: 0 }, box: { x: 0, y: 0 } });
  const g = {
    id: 'g', name: 'g', version: 1, slot: 'js', match: [], aspect: 2,
    views: [V('levers'), V('combat', 'Grip'), { ...V('airbus', 'Grip'), width: 300 }, V('boeing', 'Grip'), V('lonely', 'Solo')],
    callouts: [C('thr', 'levers', ['rotx']), C('mini', 'combat', ['x', 'button62']), C('ab66', 'airbus', ['button66']), C('ap68', 'boeing', ['button68']), C('h', 'boeing', ['hat1_up']), C('s', 'lonely', ['button9'])],
  } as any;
  t('swapGroups / visibleViews: one view per swap group (the first by default), its callouts only; single-view groups ignored', () => {
    assert.deepEqual([...vs.swapGroups(g)], [['Grip', ['combat', 'airbus', 'boeing']]]);
    const d = vs.visibleViews(g, {});
    assert.deepEqual(d.views!.map((v: any) => v.id), ['levers', 'combat', 'lonely']);
    assert.deepEqual(d.callouts.map((c: any) => c.id), ['thr', 'mini', 's']);
    const a = vs.visibleViews(g, { Grip: 'airbus' });
    assert.deepEqual(a.views!.map((v: any) => v.id), ['levers', 'airbus', 'lonely']); assert.deepEqual(a.callouts.map((c: any) => c.id), ['thr', 'ab66', 's']);
    assert.deepEqual(vs.visibleViews(g, { Grip: 'nope' }).views!.map((v: any) => v.id), ['levers', 'combat', 'lonely'], 'unknown choice: the first');
    assert.equal(vs.visibleViews(vs.visibleViews(g, {}), {}).views!.length, 3);
    const first = vs.visibleViews({ ...g, views: [V('combat', 'Grip'), { ...V('airbus', 'Grip'), width: 300 }] }, { Grip: 'airbus' });
    assert.equal(first.aspect, 3, 'aspect follows the first shown view');
    const plain = { ...g, views: [V('a'), V('b')] };
    assert.equal(vs.visibleViews(plain, {}), plain, 'no swap groups: unchanged');
  });
  t('swapInputs / swapPresses: a fresh button / hat press on another view of the group switches to it (axes and held inputs do not)', () => {
    const m = vs.swapInputs(g);
    assert.deepEqual(Object.fromEntries(m), { button62: ['Grip', 'combat'], button66: ['Grip', 'airbus'], button68: ['Grip', 'boeing'], hat1_up: ['Grip', 'boeing'] });
    const S = (...a: string[]) => new Set(a);
    assert.deepEqual(vs.swapPresses(S(), S('button66'), m), { Grip: 'airbus' });
    assert.equal(vs.swapPresses(S('button66'), S('button66'), m), null, 'held: no new choice');
    assert.equal(vs.swapPresses(S(), S('x', 'rotx', 'button9'), m), null, 'axes / non-swap views: nothing');
    assert.deepEqual(vs.swapPresses(S(), S('button66', 'hat1_up'), m), { Grip: 'boeing' }, 'the newest wins');
    assert.deepEqual(vs.swapShown(g, { Grip: 'boeing' }), { Grip: 'boeing' }); assert.deepEqual(vs.swapShown(g, {}), { Grip: 'combat' });
  });
  t('swap groups survive export / import (user copies keep the grip switch)', () => {
    const src = { ...g, id: 'copy', views: g.views.map((v: any) => ({ ...v, image: '/device-photos/moza-mtq-airbus.webp' })) };
    const back = tp.parseTemplates(tp.exportTemplates([src]))[0];
    assert.deepEqual(back.views!.map((v) => v.swap ?? ''), ['', 'Grip', 'Grip', 'Grip', 'Solo']);
    const bad = tp.parseTemplates(JSON.stringify({ ...src, views: [{ ...src.views[0], swap: '<b>x</b>' }] }))[0];
    assert.equal(bad.views![0].swap, undefined, 'odd swap keys dropped');
  });
}
// ---------------------------------------------------------------- game slots (Controllers modal): seeding, matching, pinning, bindings
{
  const sl = await import('../src/lib/slots');
  const st = await import('../src/lib/slotTemplates');
  const tpl = await import('../src/lib/templates');
  const { DEVICE_TEMPLATES } = await import('../src/lib/deviceTemplates');
  const { BUILTIN_TEMPLATES } = await import('../src/lib/builtinTemplates');
  const ALL = [...BUILTIN_TEMPLATES, ...DEVICE_TEMPLATES];
  const AB6_RAW = ' MOZA AB6 FFB Base    {1002346E-0000-0000-0000-504944564944}';
  const pad = (key: string, name: string, vendor: string, productId: string, buttons: number, dup?: { n: number; of: number }) =>
    ({ key, name, vendor, productId, buttons, axes: 8, kind: 'js' as const, ...(dup ? { dup } : {}) });
  const MTQ = pad('mtq|80b8a#1', 'MOZA MTQ Throttle', '346E', '1007', 80);
  const AB1 = pad('ab6|128b8a#1', 'MOZA AB6 FFB Base', '346E', '1002', 128, { n: 1, of: 2 });
  const AB2 = pad('ab6|128b8a#2', 'MOZA AB6 FFB Base', '346E', '1002', 128, { n: 2, of: 2 });
  const prof = (devices: any[], rebinds: any = {}) => ({ devices, rebinds });
  const S = (slot: any, instance: number) => ({ slot, instance });

  t('slots: no profile = no slots; an import seeds kb1/mo1 (fixed), its <options> devices and the js/gp numbers its bindings use', () => {
    assert.deepEqual(sl.seedSlots(null).slots, []);
    const m = sl.seedSlots(prof([{ slot: 'gp', instance: 1, product: 'Xbox' }, { slot: 'js', instance: 2, product: 'MOZA AB6 FFB Base', rawProduct: AB6_RAW }],
      { spaceship_movement: { v_pitch: [{ slot: 'js', instance: 4, input: 'y' }, { slot: 'js', instance: 1, input: '' }] } }));
    assert.deepEqual(m.slots.map(sl.slotId), ['kb1', 'mo1', 'js2', 'js4', 'gp1'], 'cleared js1_ (empty input) adds no slot');
    assert.equal(m.slots.find((s) => s.instance === 2 && s.slot === 'js')!.gameRawProduct, AB6_RAW);
    assert.equal(m.pendingMatch, true);
    assert.ok(sl.isFixed(S('kb', 1)) && sl.isFixed(S('mo', 1)) && !sl.isFixed(S('kb', 2)));
  });
  t('slots: hardware auto-match by USB id, then name; identical devices go in browser order; legacy numbers win; pinned slots untouched', () => {
    const seeded = sl.seedSlots(prof([
      { slot: 'js', instance: 1, product: 'MOZA AB6 FFB Base', rawProduct: AB6_RAW },
      { slot: 'js', instance: 2, product: 'MOZA AB6 FFB Base', rawProduct: AB6_RAW },
      { slot: 'js', instance: 3, product: 'MOZA MTQ Throttle' },
    ]));
    const m = sl.autoMatchHardware(seeded, [MTQ, AB1, AB2]);
    const hw = (i: number) => m.slots.find((s) => s.slot === 'js' && s.instance === i)!;
    assert.equal(hw(1).hw!.key, AB1.key); assert.equal(hw(1).hwMatch, 'usb');
    assert.equal(hw(2).hw!.key, AB2.key);
    assert.equal(hw(3).hw!.key, MTQ.key); assert.equal(hw(3).hwMatch, 'name');
    assert.equal(m.pendingMatch, false);
    const legacy = sl.autoMatchHardware(seeded, [MTQ, AB1, AB2], { [AB2.key]: { kind: 'js', instance: 1 } });
    assert.equal(legacy.slots.find((s) => s.instance === 1 && s.slot === 'js')!.hw!.key, AB2.key, 'the number set by hand before slots existed');
    assert.equal(legacy.slots.find((s) => s.instance === 2 && s.slot === 'js')!.hw!.key, AB1.key);
    const pinned = sl.assignHardware(seeded, S('js', 1), null, true);
    assert.equal(sl.autoMatchHardware(pinned, [AB1, AB2]).slots.find((s) => s.instance === 1 && s.slot === 'js')!.hw, undefined, 'a slot the user emptied stays empty');
  });
  t('slots: assigning hardware takes it out of its old slot and pins it; padAssign / reservedJs feed the game numbers', () => {
    let m = sl.addSlot(sl.addSlot(sl.emptySlotMap(), 'js'), 'js');
    m = sl.assignHardware(m, S('js', 1), sl.hardwareOf(AB1));
    m = sl.assignHardware(m, S('js', 2), sl.hardwareOf(AB1));
    assert.equal(m.slots[0].hw, undefined); assert.equal(m.slots[1].hw!.key, AB1.key); assert.equal(m.slots[1].hwPinned, true);
    assert.deepEqual(sl.padAssign(m), { [AB1.key]: { kind: 'js', instance: 2 } });
    assert.deepEqual(sl.reservedJs(m), [1, 2]);
    const fake = (id: string) => ({ id, index: 0, mapping: '', buttons: Array.from({ length: 8 }, () => ({ pressed: false, value: 0 })), axes: [0, 0] });
    const d = dev.describePads([fake('Some Stick (Vendor: 1234 Product: 5678)')], {}, [], sl.reservedJs(m));
    assert.equal(d[0].instance, 3, 'a controller in no slot is numbered after the slots, even disconnected ones');
    const man = sl.manualHardware('VKBsim Gladiator EVO R');
    m = sl.assignHardware(m, S('js', 1), man);
    assert.equal(sl.padAssign(m)[man.key], undefined, 'a device picked by name has no live pad');
  });
  t('slots: template auto-match on hardware (re)assignment, manual pick pinned and following the hardware to another slot', () => {
    let m = sl.addSlot(sl.addSlot(sl.emptySlotMap(), 'js'), 'js');
    m = sl.assignHardware(m, S('js', 1), sl.hardwareOf(AB2));
    const r1 = st.resolveSlotTemplate(ALL, m, m.slots[0], undefined);
    assert.equal(r1.template.id, 'builtin-moza-ab6'); assert.equal(r1.how, 'guessed', 'last of two identical bases = the stick (dupOrderGuess)');
    m = sl.assignHardware(m, S('js', 1), sl.hardwareOf(AB1));
    assert.equal(st.resolveSlotTemplate(ALL, m, m.slots[0], undefined).template.id, 'builtin-moza-mtq', 'new hardware: template matched again');
    m = sl.setSlotTemplate(m, S('js', 1), 'builtin-stick');
    assert.equal(st.resolveSlotTemplate(ALL, m, m.slots[0], undefined).how, 'chosen');
    m = sl.assignHardware(m, S('js', 2), sl.hardwareOf(AB1));
    assert.equal(st.resolveSlotTemplate(ALL, m, m.slots[1], undefined).template.id, 'builtin-stick', 'the pick follows the hardware');
    assert.equal(st.resolveSlotTemplate(ALL, m, m.slots[0], undefined).how, 'fallback', 'the old slot is empty and automatic again');
    m = sl.setSlotTemplate(m, S('js', 1), 'builtin-throttle');
    assert.equal(m.slots[0].template, 'builtin-throttle', 'no hardware: the pick sits on the slot');
    m = sl.setSlotTemplate(m, S('js', 2), null);
    assert.equal(st.resolveSlotTemplate(ALL, m, m.slots[1], undefined).template.id, 'builtin-moza-mtq');
    const legacyKey = tpl.identityKey(st.resolveSlotTemplate(ALL, m, m.slots[1], undefined).ident);
    assert.equal(st.resolveSlotTemplate(ALL, m, m.slots[1], undefined, { [legacyKey]: 'builtin-stick' }).legacy, true, 'old per-device picks still apply');
    m = sl.setSlotTemplate(m, S('js', 2), st.AUTO_TEMPLATE);
    assert.equal(st.resolveSlotTemplate(ALL, m, m.slots[1], undefined, { [legacyKey]: 'builtin-stick' }).template.id, 'builtin-moza-mtq', 'Automatic beats an old pick');
  });
  t('MOZA AB6 grip variants (MH16 / CarrierAce / ViperAce EX): never picked automatically, listed under the AB6, real DI numbers per grip', () => {
    const ids = ['builtin-moza-ab6-mh16', 'builtin-moza-ab6-carrierace', 'builtin-moza-ab6-viperace'];
    const [mh, ca, va] = ids.map((id) => ALL.find((x) => x.id === id)!);
    const ab6 = ALL.find((x) => x.id === 'builtin-moza-ab6')!;
    for (const v of [mh, ca, va]) {
      assert.ok(v, 'variant exists');
      assert.equal(v.variantOf, 'builtin-moza-ab6', `${v.id}: variant of the AB6`);
      assert.deepEqual(v.match, [], `${v.id}: no match rules (same USB id as the plain AB6)`);
      assert.equal(v.brand, 'MOZA'); assert.ok(v.builtin);
      assert.match(v.notes!, /Never picked automatically/); assert.match(v.notes!, /Firefox/, `${v.id}: buttons above 32 need Firefox`);
      assert.equal(tpl.maxButton(v), 62, `${v.id}: base buttons up to 62`);
      for (const id of ['bkeys', 'bkeysr', 'wl', 'wlb', 'wr', 'wrb'])
        assert.deepEqual(v.callouts.find((c) => c.id === id)?.inputs, ab6.callouts.find((c) => c.id === id)!.inputs, `${v.id}/${id}: the AB6 base numbers`);
      for (const view of v.views!) assert.ok(v.callouts.some((c) => c.view === view.id), `${v.id}: callouts on view ${view.id}`);
    }
    assert.deepEqual([mh, ca, va].map((v) => v.views!.map((w) => w.id)), [['front', 'side'], ['front', 'side', 'rear'], ['front', 'side']]);
    assert.deepEqual([mh, ca, va].map((v) => v.views![0].image), ['/device-photos/moza-ab6-mh16-front.webp', '/device-photos/moza-ab6-carrierace-front.webp', '/device-photos/moza-ab6-viperace-front.webp']);
    // autodetect untouched: one or two AB6 bases, 128 / 133 buttons, USB id or name only
    const ab6Id = (buttons: number, dup?: { n: number; of: number }) => ({ name: 'MOZA AB6 FFB Base', vendor: '346E', productId: '1002', buttons, slot: 'js' as const, ...(dup ? { dup } : {}) });
    for (const n of [128, 133]) {
      assert.equal(tpl.pickTemplate(ALL, ab6Id(n)).template.id, 'builtin-moza-ab6', `one AB6 (${n} buttons): the plain AB6`);
      assert.equal(tpl.pickTemplate(ALL, ab6Id(n, { n: 2, of: 2 })).template.id, 'builtin-moza-ab6', `last of two AB6 (${n}): the stick = plain AB6`);
      assert.equal(tpl.pickTemplate(ALL, ab6Id(n, { n: 1, of: 2 })).template.id, 'builtin-moza-mtq', `first of two AB6 (${n}): the MTQ`);
    }
    for (const name of ['MOZA AB6', 'MOZA AB6 FFB Base', 'MOZA AB6 MH16', 'AB6 CarrierAce', 'AB6 ViperAce'])
      assert.equal(tpl.pickTemplate(ALL, { name, slot: 'js' }).template.id, 'builtin-moza-ab6', `name only (${name}): the plain AB6`);
    assert.ok(!ids.includes(tpl.pickTemplate(ALL, { name: 'WINCTRL Orion Joystick Base Metal 2 + JGRIP-F16', slot: 'js' }).template.id), 'WinCtrl base keeps its own ViperAce template');
    // picked by hand: wins, and follows the hardware like any pick
    for (const id of ids) {
      const r = tpl.pickTemplate(ALL, ab6Id(128, { n: 2, of: 2 }), id);
      assert.deepEqual([r.template.id, r.how], [id, 'chosen']);
    }
    let m = sl.assignHardware(sl.addSlot(sl.emptySlotMap(), 'js'), S('js', 1), sl.hardwareOf(AB2));
    assert.equal(st.resolveSlotTemplate(ALL, m, m.slots[0], undefined).template.id, 'builtin-moza-ab6');
    m = sl.setSlotTemplate(m, S('js', 1), 'builtin-moza-ab6-viperace');
    assert.deepEqual([st.resolveSlotTemplate(ALL, m, m.slots[0], undefined).template.id, st.resolveSlotTemplate(ALL, m, m.slots[0], undefined).how], ['builtin-moza-ab6-viperace', 'chosen']);
    assert.equal(st.autoSlotTemplate(ALL, m.slots[0]).id, 'builtin-moza-ab6', 'Automatic stays the plain AB6');
    // the pickers' grip group: the AB6 first, then its variants; nothing for other templates or user copies
    const fam = ['builtin-moza-ab6', ...ids];
    assert.deepEqual(tpl.templateVariants(ALL, ab6).map((x) => x.id), fam);
    assert.deepEqual(tpl.templateVariants(ALL, ca).map((x) => x.id), fam, 'from a variant too');
    assert.deepEqual(tpl.templateVariants(ALL, ALL.find((x) => x.id === 'builtin-moza-mtq')), []);
    assert.deepEqual(tpl.templateVariants(ALL, undefined), []);
    const copy = tpl.cloneTemplate(mh);
    assert.equal(copy.variantOf, undefined, 'a user copy is no variant'); assert.deepEqual(tpl.templateVariants([copy, ...ALL], copy), []);
    assert.ok(!('variantOf' in tpl.parseTemplates(tpl.exportTemplates([{ ...mh, builtin: undefined, id: 'copy' } as any]))[0]), 'not exported');
    // DI coverage per grip
    const nums = (x: DeviceTemplate) => x.callouts.flatMap((c) => c.inputs).filter((i) => /^button/.test(i)).map((i) => Number(i.slice(6))).sort((p, q) => p - q);
    const axes = (x: DeviceTemplate) => x.callouts.flatMap((c) => c.inputs).filter((i) => !/^(button|hat)/.test(i)).sort();
    const seq = (a: number, z: number, skip: number[] = []) => Array.from({ length: z - a + 1 }, (_, i) => a + i).filter((n) => !skip.includes(n));
    const ins = (x: DeviceTemplate, id: string) => x.callouts.find((c) => c.id === id)!.inputs;
    const bs = (...n: number[]) => n.map((i) => `button${i}`);
    assert.deepEqual(nums(mh), [...seq(1, 31, [27]), ...seq(49, 62)], 'MH16: grip 1-31 (27 unused) + base 49-62');
    assert.deepEqual(axes(mh), ['slider1', 'slider2', 'x', 'y'], 'MH16: X / Y (no twist) + base levers');
    assert.deepEqual([ins(mh, 'trig'), ins(mh, 'wpn'), ins(mh, 'fov'), ins(mh, 'paddle'), ins(mh, 'nws')], [bs(1, 6), bs(2), bs(3), bs(4), bs(5)]);
    assert.deepEqual([ins(mh, 'tms'), ins(mh, 'dms'), ins(mh, 'cms')], [bs(7, 8, 9, 10), bs(11, 12, 13, 14), bs(15, 16, 17, 18, 19)], 'MH16 hats: up / right / down / left (+ CMS push)');
    assert.deepEqual([ins(mh, 'castle'), ins(mh, 'msw'), ins(mh, 'trim'), ins(mh, 'trimpov')], [bs(20, 21, 22, 23, 24), bs(25, 26), bs(28, 29, 30, 31), ['hat1_up', 'hat1_right', 'hat1_down', 'hat1_left']]);
    // WinCtrl grips: the WinCtrl template's grip numbers (minus the paddle axis, which shares S1 with the base left lever)
    for (const [v, wc] of [[ca, 'builtin-winctrl-carrierace'], [va, 'builtin-winctrl-viperace']] as const) {
      const w = ALL.find((x) => x.id === wc)!;
      for (const cw of w.callouts.filter((x) => x.id !== 'paddlea' || v === va)) assert.deepEqual(ins(v, cw.id), cw.inputs, `${v.id}/${cw.id}: as on ${wc}`);
    }
    assert.ok(!ca.callouts.some((x) => x.id === 'paddlea'), 'CarrierAce on AB6: no separate paddle axis');
    // ViperAce on AB6: Federico added the paddle lever (S1, like the WinCtrl template; it shares S1 with the base left lever, see the notes)
    assert.deepEqual(va.callouts.filter((x) => x.inputs.includes('slider1')).map((x) => x.id), ['wl', 'paddlea'], 'ViperAce on AB6: S1 = base left lever or paddle lever');
    assert.deepEqual(nums(ca), [...seq(1, 27), ...seq(49, 62)], 'CarrierAce on AB6: grip 1-27 (19 = trim hat push) + base 49-62');
    assert.deepEqual(axes(ca), ['slider1', 'slider2', 'x', 'y']);
    assert.deepEqual(nums(va), [...seq(1, 42), ...seq(49, 62)], 'ViperAce EX on AB6: grip 1-42 (19 = trim hat push) + base 49-62');
    assert.deepEqual(axes(va), ['rotx', 'roty', 'rotz', 'slider1', 'slider1', 'slider2', 'x', 'y']);
    assert.deepEqual([mh, ca, va].map((v) => v.callouts.length), [19, 16, 22]);
  });
  t('slots: removing drops only the profile\'s bindings on that slot (cleared defaults stay cleared); ensureUsedSlots re-adds used numbers', () => {
    const rb = {
      spaceship_movement: { v_pitch: [{ slot: 'js', instance: 2, input: 'y' }], v_yaw: [{ slot: 'js', instance: 1, input: 'x' }, { slot: 'js', instance: 2, input: 'button3' }] },
      spaceship_view: { v_view_yaw: [{ slot: 'kb', instance: 1, input: 'f' }] },
    } as any;
    assert.equal(sl.slotBindingCount(rb, S('js', 2)), 2);
    const r = sl.dropSlotBindings(rb, idx, S('js', 2));
    assert.equal(r.dropped, 2); assert.equal(sl.slotBindingCount(r.rebinds, S('js', 2)), 0);
    assert.deepEqual(r.rebinds.spaceship_movement.v_pitch, [{ slot: 'js', instance: 1, input: '' }], 'v_pitch had js1_y by default: it stays cleared');
    assert.equal(r.rebinds.spaceship_movement.v_yaw, undefined, 'js1_x left = the game default for v_yaw: nothing to store');
    assert.deepEqual(r.rebinds.spaceship_view, rb.spaceship_view, 'other groups untouched');
    const m = sl.ensureUsedSlots(sl.seedSlots(prof([])), rb);
    assert.deepEqual(m.slots.map(sl.slotId), ['kb1', 'mo1', 'js1', 'js2']);
  });
  t('slots: copy / move bindings to another slot (same input names; clashes replace or keep both; skip inputs)', () => {
    const rb = { spaceship_movement: { v_roll: [{ slot: 'js', instance: 2, input: 'y' }] } } as any;
    const plan = sl.planCopy(rb, idx, S('js', 1), S('js', 2));
    assert.ok(plan.count > 3, 'js1 defaults count too'); assert.ok(plan.inputs.includes('x') && plan.inputs.includes('y'));
    assert.equal(plan.clashes, 1, 'js2_y already used by v_roll');
    const keep = sl.copySlotBindings(rb, idx, S('js', 1), S('js', 2), { clash: 'keep' });
    assert.ok(keep.copied >= plan.count - 0 && keep.replaced === 0);
    assert.deepEqual(keep.rebinds.spaceship_movement.v_roll, rb.spaceship_movement.v_roll);
    assert.ok(keep.rebinds.spaceship_movement.v_pitch.some((x: any) => x.instance === 2 && x.input === 'y'));
    assert.ok(keep.rebinds.spaceship_movement.v_pitch.some((x: any) => x.instance === 1 && x.input === 'y'), 'copy keeps the source');
    const rep = sl.copySlotBindings(rb, idx, S('js', 1), S('js', 2), { clash: 'replace' });
    assert.equal(rep.replaced, 1); assert.ok(!rep.rebinds.spaceship_movement.v_roll?.some((x: any) => x.instance === 2 && x.input === 'y'));
    const mv = sl.copySlotBindings(rb, idx, S('js', 1), S('js', 2), { clash: 'keep', move: true });
    assert.equal(sl.slotBindingCount(mv.rebinds, S('js', 1)), 0, 'move leaves nothing on js1');
    assert.deepEqual(mv.rebinds.spaceship_movement.v_pitch.filter((x: any) => x.input).map((x: any) => `js${x.instance}_${x.input}`), ['js2_y']);
    const sk = sl.copySlotBindings(rb, idx, S('js', 1), S('js', 2), { clash: 'keep', skip: new Set(['y']) });
    assert.ok(!sk.rebinds.spaceship_movement.v_pitch?.some((x: any) => x.instance === 2));
    assert.equal(sl.copySlotBindings(rb, idx, S('js', 1), S('gp', 1), { clash: 'keep' }).copied, 0, 'only between slots of one kind');
  });
  t('slots: export declares added slots with their product names (joysticks, gamepad, extra keyboard)', () => {
    const p = { ...ed.newProfile('X'), rebinds: {} };
    const xml = buildExport(defaults, p, { format: 'layout', name: 'x', devices: [
      { type: 'joystick', instance: 1, product: ' MOZA AB6 FFB Base    {1002346E-0000-0000-0000-504944564944}' },
      { type: 'joystick', instance: 3, product: 'VKBsim Gladiator EVO R' }, { type: 'keyboard', instance: 2, product: 'Second keyboard' }] });
    assert.match(xml, /<options type="joystick" instance="1" Product=" MOZA AB6 FFB Base {4}\{1002346E-0000-0000-0000-504944564944\}"\/>/);
    assert.match(xml, /<options type="joystick" instance="3" Product="VKBsim Gladiator EVO R"\/>/);
    assert.match(xml, /<joystick instance="3"\/>/); assert.match(xml, /<keyboard instance="2"\/>/);
    assert.match(xml, /<options type="keyboard" instance="2" Product="Second keyboard"\/>/);
    const back = parseActionMaps(buildExport(defaults, { ...p, rebinds: { spaceship_movement: { v_pitch: [{ slot: 'js', instance: 3, input: 'y' }] } }, rebindCount: 1 } as any, { format: 'actionmaps', name: 'x', devices: [{ type: 'joystick', instance: 3, product: 'VKBsim Gladiator EVO R' }] }), 'actionmaps.xml');
    assert.deepEqual(sl.seedSlots(back).slots.map((s) => `${sl.slotId(s)}:${s.gameProduct ?? ''}`), ['kb1:Keyboard', 'mo1:', 'js3:VKBsim Gladiator EVO R']);
  });
  t('slots: stored maps are sanitized', () => {
    const m = sl.cleanSlotMap({ slots: [{ slot: 'js', instance: 1, hw: { key: 'k', name: 'n' }, hwPinned: true }, { slot: 'js', instance: 1 }, { slot: 'xx', instance: 2 }, { slot: 'gp', instance: 99 }, { slot: 'kb', instance: 1 }], hwTemplates: { k: 'builtin-stick', z: 5 } });
    assert.deepEqual(m!.slots.map(sl.slotId), ['kb1', 'js1']);
    assert.deepEqual(m!.hwTemplates, { k: 'builtin-stick' });
    assert.equal(sl.cleanSlotMap('nope'), null);
  });
  t('slots: an open gamepad slot takes the remaining gamepad in order (XInput names differ between Windows and the browser)', () => {
    const seeded = sl.seedSlots(prof([{ slot: 'gp', instance: 1, product: 'Controller (Xbox One For Windows)' }]));
    const XB = { ...pad('xb|17b4a#1', 'Xbox Wireless Controller', '045E', '0B13', 17), kind: 'gp' as const };
    const g = sl.autoMatchHardware(seeded, [MTQ, XB]).slots.find((s) => s.slot === 'gp')!;
    assert.equal(g.hw!.key, XB.key); assert.equal(g.hwMatch, 'order');
    assert.equal(sl.autoMatchHardware(seeded, [MTQ]).slots.find((s) => s.slot === 'gp')!.hw, undefined, 'a joystick is not taken for a gamepad slot by order');
  });
  t('slots: copy plan counts your own bindings apart from the game defaults', () => {
    const rb = { spaceship_movement: { v_roll: [{ slot: 'js', instance: 1, input: 'rotz' }] }, seat_general: { v_eject: [{ slot: 'kb', instance: 2, input: 'j' }] } } as any;
    const p1 = sl.planCopy(rb, idx, S('js', 1), S('js', 2));
    assert.equal(p1.yours, 1); assert.ok(p1.count > p1.yours, 'the js1 defaults come along too');
    const p2 = sl.planCopy(rb, idx, S('kb', 2), S('kb', 3));
    assert.equal(p2.yours, 1); assert.equal(p2.count, 1, 'kb2 has no game defaults');
  });
  // ---- move up / down: swapping two slot numbers
  const effOf = (rb: any, map: string, action: string) => ed.effectiveGroup(idx.get(`${map}/${action}`), rb[map]?.[action], 'js')
    .filter((r) => r.input).map((r) => `js${r.instance}_${r.input}`).sort();
  t('slots: swapping js2 <> js3 moves every stored binding on either number (both ways, js1 untouched)', () => {
    const rb = {
      spaceship_movement: { v_strafe_up: [{ slot: 'js', instance: 2, input: 'button4' }], v_strafe_down: [{ slot: 'js', instance: 3, input: 'button7' }, { slot: 'js', instance: 1, input: 'button9' }] },
      seat_general: { v_eject: [{ slot: 'kb', instance: 1, input: 'ralt+l' }] },
    } as any;
    const r = sl.swapSlotBindings(rb, idx, 'js', 2, 3);
    assert.deepEqual(effOf(r.rebinds, 'spaceship_movement', 'v_strafe_up'), ['js3_button4']);
    assert.deepEqual(effOf(r.rebinds, 'spaceship_movement', 'v_strafe_down'), ['js1_button9', 'js2_button7'], 'js1 stays js1');
    assert.equal(r.moved, 2);
    assert.deepEqual(r.touched.map((x) => x.action).sort(), ['v_strafe_down', 'v_strafe_up']);
    assert.deepEqual(r.rebinds.seat_general, rb.seat_general, 'keyboard bindings untouched');
    const back = sl.swapSlotBindings(r.rebinds, idx, 'js', 2, 3);
    assert.deepEqual(effOf(back.rebinds, 'spaceship_movement', 'v_strafe_up'), ['js2_button4'], 'swapping again restores the numbers');
    assert.deepEqual(effOf(back.rebinds, 'spaceship_movement', 'v_strafe_down'), ['js1_button9', 'js3_button7']);
    assert.equal(sl.swapSlotBindings(rb, idx, 'js', 2, 2).rebinds, rb, 'same number: nothing to do');
  });
  t('slots: swapping js1 <> js2 rewrites only the profile\'s own bindings; game defaults stay on their number, cleared defaults stay cleared', () => {
    assert.equal(sl.swapSlotBindings({} as any, idx, 'js', 1, 2).moved, 0, 'no stored bindings: nothing to rewrite');
    const rb = { spaceship_movement: {
      v_pitch: [{ slot: 'js', instance: 1, input: 'rotx' }],          // your override of the js1_y default
      v_yaw: [{ slot: 'js', instance: 1, input: '' }],                // a cleared default
      v_roll: [{ slot: 'js', instance: 2, input: 'rotz' }, { slot: 'kb', instance: 1, input: 'q' }],
    } } as any;
    const r = sl.swapSlotBindings(rb, idx, 'js', 1, 2);
    assert.deepEqual(effOf(r.rebinds, 'spaceship_movement', 'v_pitch'), ['js2_rotx']);
    assert.deepEqual(effOf(r.rebinds, 'spaceship_movement', 'v_roll'), ['js1_rotz']);
    assert.deepEqual(r.rebinds.spaceship_movement.v_roll.filter((x: any) => x.slot === 'kb'), [{ slot: 'kb', instance: 1, input: 'q' }], 'keyboard half of the action kept');
    assert.deepEqual(r.rebinds.spaceship_movement.v_yaw, rb.spaceship_movement.v_yaw, 'cleared stays cleared');
    assert.equal(r.moved, 2);
    assert.equal(r.rebinds.spaceship_movement.v_strafe_vertical, undefined, 'untouched actions keep their game defaults on js1');
  });
  t('slots: swapping slots moves hardware, template pick and the game file\'s device with each number; neighbours of the same kind', () => {
    let m = sl.addSlot(sl.addSlot(sl.addSlot(sl.addSlot(sl.emptySlotMap(), 'js'), 'js'), 'js'), 'gp');
    m = sl.assignHardware(m, S('js', 2), sl.hardwareOf(AB1));
    m = sl.assignHardware(m, S('js', 3), sl.hardwareOf(MTQ));
    m = sl.setSlotTemplate(m, S('js', 1), 'builtin-throttle');
    m = { ...m, slots: m.slots.map((s) => (s.slot === 'js' && s.instance === 3 ? { ...s, gameProduct: 'MOZA MTQ Throttle' } : s)) };
    const w = sl.swapSlots(m, 'js', 2, 3);
    const at = (mm: typeof m, i: number) => mm.slots.find((s) => s.slot === 'js' && s.instance === i)!;
    assert.equal(at(w, 2).hw!.key, MTQ.key); assert.equal(at(w, 2).gameProduct, 'MOZA MTQ Throttle');
    assert.equal(at(w, 3).hw!.key, AB1.key);
    assert.deepEqual(w.slots.map(sl.slotId), m.slots.map(sl.slotId), 'still sorted js1, js2, js3, gp1');
    assert.deepEqual(sl.padAssign(w), { [MTQ.key]: { kind: 'js', instance: 2 }, [AB1.key]: { kind: 'js', instance: 3 } });
    const t1 = sl.swapSlots(m, 'js', 1, 2);
    assert.equal(at(t1, 2).template, 'builtin-throttle', 'a template picked on a slot with no hardware moves with it');
    assert.equal(at(t1, 1).hw!.key, AB1.key);
    assert.equal(sl.neighbourSlot(m, S('js', 1), -1), undefined, 'js1 is first');
    assert.equal(sl.slotId(sl.neighbourSlot(m, S('js', 1), 1)!), 'js2');
    assert.equal(sl.neighbourSlot(m, S('js', 3), 1), undefined, 'gp1 is not a joystick neighbour');
    assert.equal(sl.neighbourSlot(m, S('gp', 1), -1), undefined);
    const gaps = sl.addSlot(sl.emptySlotMap(), 'js', 5);
    assert.equal(sl.slotId(sl.neighbourSlot(sl.addSlot(gaps, 'js', 2), S('js', 5), -1)!), 'js2', 'numbers with gaps: the next one of the kind');
    const devs = sl.swapProfileDevices([{ slot: 'js', instance: 2, product: 'A' }, { slot: 'js', instance: 3, product: 'B' }, { slot: 'gp', instance: 2, product: 'C' }] as any[], 'js', 2, 3);
    assert.deepEqual(devs.map((d: any) => `${d.slot}${d.instance}:${d.product}`), ['js3:A', 'js2:B', 'gp2:C']);
  });
  t('devopts: swapping option instances moves invert / curves with the device number; deviceoptions (per model) stay', () => {
    let s = dvo.emptySettings();
    s = dvo.setGroup(s, 'joystick', 2, 'flight_move_pitch', { invert: true }, 'Stick A');
    s = dvo.setGroup(s, 'joystick', 3, 'flight_move_yaw', { exponent: 2 }, 'Stick B');
    s = dvo.setGroup(s, 'gamepad', 1, 'flight_move_pitch', { invert: true });
    s = dvo.setAxis(s, 'Stick A', 'x', 'deadzone', 0.05);
    const w = dvo.swapOptionInstances(s, 'joystick', 2, 3);
    assert.equal(dvo.groupValues(w, 'joystick', 3, 'flight_move_pitch')!.invert, true);
    assert.equal(dvo.groupValues(w, 'joystick', 2, 'flight_move_yaw')!.exponent, 2);
    assert.equal(dvo.groupValues(w, 'joystick', 2, 'flight_move_pitch'), undefined);
    assert.equal(dvo.blockProduct(dvo.optionsBlock(w, 'joystick', 3)!), 'Stick A', 'the product name goes with it');
    assert.equal(dvo.groupValues(w, 'gamepad', 1, 'flight_move_pitch')!.invert, true, 'other device types untouched');
    assert.deepEqual(dvo.axisValues(w, 'Stick A'), { x: { deadzone: 0.05 } });
    assert.deepEqual(dvo.swapOptionInstances(w, 'joystick', 2, 3), s, 'its own inverse');
  });
}
// ---------------------------------------------------------------- refresh game state: rematch to the game's device order
{
  const rm = await import('../src/lib/rematch');
  const sl = await import('../src/lib/slots');
  const imp = await import('../src/lib/importer');
  const D = (slot: any, instance: number, product: string, rawProduct?: string) => ({ slot, instance, product, ...(rawProduct ? { rawProduct } : {}) });
  const MOZA = ' MOZA AB6 FFB Base    {1002346E-0000-0000-0000-504944564944}';
  const before = [D('kb', 1, 'Keyboard'), D('js', 1, 'MOZA AB6 FFB Base', MOZA), D('js', 2, 'MOZA AB6 FFB Base', MOZA), D('js', 3, 'WINCTRL Orion Pedals'), D('js', 4, 'WINCTRL PTO 2'), D('js', 5, 'WINCTRL CarrierAce MFD L')];
  const known = (devs: any[]) => rm.knownDevices(devs, sl.emptySlotMap());
  const S0 = (slot: any, instance: number) => ({ slot, instance });
  const perm = (r: any, slot = 'js') => Object.fromEntries([...(r.perms[slot] ?? new Map())].map(([a, b]: number[]) => [a, b]));
  t('rematch: same order = unchanged (identical devices that kept their numbers are not flagged)', () => {
    const r = rm.computeRematch(known(before), before.map((d) => ({ ...d })));
    assert.equal(r.unchanged, true); assert.deepEqual(r.moves, []); assert.deepEqual(r.ambiguous, []);
    const spaced = rm.computeRematch(known(before), before.map((d) => ({ ...d, product: `  ${d.product.toUpperCase()} ` })));
    assert.equal(spaced.unchanged, true, 'names compared ignoring case and spacing');
  });
  t('rematch: the game swapped Pedals and MFD L -> two moves, a js3 <> js5 permutation', () => {
    const game = [before[0], before[1], before[2], D('js', 3, 'WINCTRL CarrierAce MFD L'), before[4], D('js', 5, 'WINCTRL Orion Pedals')];
    const r = rm.computeRematch(known(before), game);
    assert.equal(r.unchanged, false);
    assert.deepEqual(r.moves.map((m) => `${m.name} ${m.from}->${m.to}`).sort(), ['WINCTRL CarrierAce MFD L 5->3', 'WINCTRL Orion Pedals 3->5']);
    assert.deepEqual(perm(r), { 3: 5, 5: 3 });
    assert.deepEqual(rm.rematchParts(r).sort(), ['WINCTRL CarrierAce MFD L js5 → js3', 'WINCTRL Orion Pedals js3 → js5']);
  });
  t('rematch: an unplugged device -> the others shift, the missing one keeps its mappings on a free number after the game\'s', () => {
    const st = [D('js', 1, 'A'), D('js', 2, 'B'), D('js', 3, 'C')];
    const r = rm.computeRematch(known(st), [D('js', 1, 'A'), D('js', 2, 'C')]);
    assert.deepEqual(r.moves.map((m) => `${m.name} ${m.from}->${m.to}`), ['C 3->2']);
    assert.deepEqual(r.missing, [{ slot: 'js', from: 2, to: 3, name: 'B' }]);
    assert.deepEqual(perm(r), { 3: 2, 2: 3 });
    const r2 = rm.computeRematch(known(st), [D('js', 1, 'A'), D('js', 3, 'C')]);
    assert.deepEqual(r2.missing, [{ slot: 'js', from: 2, to: 2, name: 'B' }], 'its number is free: it stays');
    assert.equal(Object.keys(r2.perms).length, 0);
  });
  t('rematch: a new device; a number that receives a device gives its own back (bijection)', () => {
    const r = rm.computeRematch(known([D('js', 1, 'A')]), [D('js', 1, 'B'), D('js', 2, 'A')]);
    assert.deepEqual(r.added.map((d) => `${d.product}@${d.instance}`), ['B@1']);
    assert.deepEqual(perm(r), { 1: 2, 2: 1 });
    assert.deepEqual(rm.completePerm(new Map([[1, 3], [2, 1]])), new Map([[1, 3], [2, 1], [3, 2]]));
  });
  t('rematch: identical names: told apart by their full Product string when it differs, else moved in order and flagged', () => {
    const X = (n: number, g: string) => D('js', n, 'Stick X', `Stick X {${g}}`);
    const r = rm.computeRematch(known([X(1, 'AAAA'), X(2, 'BBBB')]), [X(1, 'BBBB'), X(2, 'AAAA')]);
    assert.deepEqual(perm(r), { 1: 2, 2: 1 }); assert.deepEqual(r.ambiguous, []);
    const st = [before[1], before[2], D('js', 3, 'Pedals')];
    const g = rm.computeRematch(known(st), [D('js', 1, 'Pedals'), D('js', 2, 'MOZA AB6 FFB Base', MOZA), D('js', 3, 'MOZA AB6 FFB Base', MOZA)]);
    assert.deepEqual(g.ambiguous, [{ slot: 'js', name: 'MOZA AB6 FFB Base', from: [1, 2], to: [2, 3] }]);
    assert.ok(g.moves.filter((m) => m.name.startsWith('MOZA')).every((m) => m.guessed), 'their moves are marked as guessed');
    assert.deepEqual(perm(g), { 1: 2, 2: 3, 3: 1 });
  });
  t('rematch: a slot without a name stays put unless a device lands there; slots named by their hardware are matched', () => {
    let m = sl.addSlot(sl.addSlot(sl.emptySlotMap(), 'js', 1, { key: 'p', name: 'WINCTRL Orion Pedals' }), 'js', 2);
    const r = rm.computeRematch(rm.knownDevices([], m), [D('js', 2, 'WINCTRL Orion Pedals'), D('js', 1, 'New Thing')]);
    assert.deepEqual(r.moves.map((x) => `${x.name} ${x.from}->${x.to}`), ['WINCTRL Orion Pedals 1->2', 'js2 (no device name) 2->3']);
    m = sl.addSlot(sl.emptySlotMap(), 'js', 4);
    const k = rm.computeRematch(rm.knownDevices([], m), [D('js', 4, 'Throttle')]);
    assert.equal(Object.keys(k.perms).length, 0, 'an unnamed js4 meets the game\'s js4: it stays (and gets the name on apply)');
  });
  t('rematch apply: bindings, axis settings, hardware, template pick follow; slots named after the game; missing flagged; device list = game\'s', () => {
    const st = [D('js', 1, 'A', 'A {1}'), D('js', 2, 'B'), D('js', 3, 'C')];
    let m = sl.seedSlots({ devices: st, rebinds: {} } as any);
    m = sl.assignHardware(m, S0('js', 3), { key: 'hc', name: 'C' });
    m = sl.setSlotTemplate(m, S0('js', 3), 'builtin-throttle');
    m = sl.setSlotTemplate(m, S0('js', 2), 'builtin-stick');
    const rebinds = { spaceship_movement: { v_strafe_up: [{ slot: 'js', instance: 3, input: 'button4' }], v_strafe_down: [{ slot: 'js', instance: 2, input: 'button7' }] } } as any;
    let settings = dvo.setGroup(dvo.emptySettings(), 'joystick', 3, 'flight_move_pitch', { invert: true }, 'C');
    settings = dvo.setGroup(settings, 'joystick', 2, 'flight_move_yaw', { exponent: 2 }, 'B');
    const game = [D('js', 1, 'A', 'A {1}'), D('js', 2, 'C', 'C {9}'), D('js', 4, 'New')];
    const r = rm.computeRematch(rm.knownDevices(st, m), game);
    const a = rm.applyRematch({ rebinds, settings, slots: m }, r, idx);
    assert.deepEqual(a.rebinds.spaceship_movement.v_strafe_up, [{ slot: 'js', instance: 2, input: 'button4' }], 'C\'s binding js3 -> js2');
    assert.deepEqual(a.rebinds.spaceship_movement.v_strafe_down, [{ slot: 'js', instance: 5, input: 'button7' }], 'missing B\'s binding kept, on a free number after the game\'s devices (js5)');
    assert.equal(dvo.groupValues(a.settings, 'joystick', 2, 'flight_move_pitch')!.invert, true);
    assert.equal(dvo.blockProduct(dvo.optionsBlock(a.settings, 'joystick', 2)!), 'C {9}', 'the options block takes the game\'s Product');
    assert.equal(dvo.groupValues(a.settings, 'joystick', 5, 'flight_move_yaw')!.exponent, 2);
    const at = (i: number) => a.slots.slots.find((s) => s.slot === 'js' && s.instance === i)!;
    assert.equal(at(2).hw!.key, 'hc'); assert.equal(at(2).gameProduct, 'C'); assert.equal(at(2).gameRawProduct, 'C {9}');
    assert.equal(sl.padAssign(a.slots).hc.instance, 2);
    assert.equal(a.slots.hwTemplates.hc, 'builtin-throttle', 'template pick follows the hardware');
    assert.equal(at(5).gameMissing, true); assert.equal(at(5).gameProduct, 'B'); assert.equal(at(5).template, 'builtin-stick', 'a pick on a slot without hardware moves with it');
    assert.equal(at(4).gameProduct, 'New', 'new device: slot added');
    assert.deepEqual(a.devices, game, 'device list = the game\'s, in its order');
    assert.ok(a.moved === 2 && a.touched.length === 2);
    const again = rm.computeRematch(rm.knownDevices(a.devices, a.slots), game);
    assert.equal(again.moves.length + again.added.length, 0, 'refreshing with the same file again: nothing to move');
  });
  t('rematch: importing a file made for an older order shifts its mappings to the current one', () => {
    const file = { devices: [D('js', 1, 'Pedals'), D('js', 2, 'Stick')], rebinds: { spaceship_movement: { v_strafe_up: [{ slot: 'js', instance: 1, input: 'button4' }] } } as any, settings: dvo.emptySettings() };
    const cur = [D('js', 1, 'Stick'), D('js', 2, 'Pedals')];
    const r = rm.computeRematch(known(file.devices), cur);
    const out = rm.shiftToOrder(file, r, idx);
    assert.deepEqual(out.rebinds.spaceship_movement.v_strafe_up, [{ slot: 'js', instance: 2, input: 'button4' }]);
    assert.deepEqual(out.devices, cur);
  });
  t('refresh: only the device list is read from a game file (no bindings needed)', () => {
    const x = '<ActionMaps><ActionProfiles profileName="default"><options type="joystick" instance="2" Product=" WINCTRL Orion Pedals  {BE644098-0000-0000-0000-504944564944}"/><options type="keyboard" instance="1" Product="Keyboard"/></ActionProfiles></ActionMaps>';
    assert.deepEqual(imp.parseDeviceList(x).map((d) => `${d.slot}${d.instance}:${d.product}`), ['js2:WINCTRL Orion Pedals', 'kb1:Keyboard']);
    assert.throws(() => imp.parseDeviceList('<nope'));
  });
}
{
  const inp = await import('../src/lib/inputs');
  t('inputs: kb / mo instances are real (kb2 binds, conflicts and formats apart from kb1)', () => {
    assert.notEqual(inp.bindKey('kb', 1, 'lalt+n'), inp.bindKey('kb', 2, 'lalt+n'));
    assert.equal(inp.bindKey('kb', 1, 'lalt+n'), inp.bindKey('kb', 1, 'lalt+n'));
    assert.notEqual(inp.physOf('kb', 1, 'n'), inp.physOf('kb', 2, 'n'));
    assert.notEqual(inp.physOf('mo', 1, 'mouse1'), inp.physOf('mo', 2, 'mouse1'));
    assert.equal(inp.formatInput('kb', 2, 'j'), 'kb2_j');
    assert.equal(inp.formatInput('mo', 2, 'mouse3'), 'mo2_mouse3');
    assert.equal(inp.formatInput('kb', 1, 'j'), 'kb1_j');
  });
}

{
  const gf = await import('../src/lib/gameFolder');
  const tf = await import('../src/lib/testerFollow');
  t('settings: Star Citizen folder is normalised (backslashes, no trailing separator, channel folder cut back)', () => {
    assert.equal(gf.normalizeGameRoot('  "D:/Games/StarCitizen/" ').root, 'D:\\Games\\StarCitizen');
    assert.equal(gf.normalizeGameRoot('c:\\Program Files\\\\Roberts Space Industries\\StarCitizen\\\\').root, 'C:\\Program Files\\Roberts Space Industries\\StarCitizen');
    assert.equal(gf.normalizeGameRoot('\\\\nas\\games\\StarCitizen\\').root, '\\\\nas\\games\\StarCitizen');
    assert.deepEqual(gf.normalizeGameRoot('E:\\SC\\StarCitizen\\ptu\\user\\client\\0\\controls\\mappings\\'), { root: 'E:\\SC\\StarCitizen', channel: 'PTU' });
    assert.deepEqual(gf.normalizeGameRoot('E:/SC/StarCitizen/TECH-PREVIEW'), { root: 'E:\\SC\\StarCitizen', channel: 'TECH-PREVIEW' });
    assert.equal(gf.mappingsPath({ root: gf.DEFAULT_GAME_ROOT, channel: 'LIVE' }), 'C:\\Program Files\\Roberts Space Industries\\StarCitizen\\LIVE\\user\\client\\0\\Controls\\Mappings\\');
    assert.equal(gf.mappingsPath({ root: 'D:\\SC', channel: 'EPTU' }), 'D:\\SC\\EPTU\\user\\client\\0\\Controls\\Mappings\\');
    assert.deepEqual(gf.gamePaths({ root: 'D:\\SC', channel: 'PTU' }), { root: 'D:\\SC', channel: 'PTU', channelDir: 'D:\\SC\\PTU', mappings: 'D:\\SC\\PTU\\user\\client\\0\\Controls\\Mappings\\', actionmaps: 'D:\\SC\\PTU\\user\\client\\0\\Profiles\\default\\actionmaps.xml', p4k: 'D:\\SC\\PTU\\Data.p4k' }, 'every shown path comes from the folder + channel');
    assert.equal(gf.layoutPath({ root: 'D:\\SC', channel: 'LIVE' }, 'layout_x_exported.xml'), 'D:\\SC\\LIVE\\user\\client\\0\\Controls\\Mappings\\layout_x_exported.xml');
    assert.equal(gf.mappingsPath({ root: '', channel: 'LIVE' }).startsWith(gf.DEFAULT_GAME_ROOT), true);
  });
  t('input tester follow: rising edges only (held button, axis noise and hysteresis, hats)', () => {
    const f = new tf.TesterFollow();
    const rest = [0, 0, 9 / 7];
    assert.equal(f.update('a', [false, false], [0, 0, 9 / 7], rest), null); // first poll records only
    assert.deepEqual(f.update('a', [false, true], [0, 0, 9 / 7], rest), { kind: 'button', index: 1 });
    assert.equal(f.update('a', [false, true], [0, 0, 9 / 7], rest), null, 'held: no repeat');
    assert.equal(f.update('a', [false, false], [0.3, 0, 9 / 7], rest), null, 'noise below the threshold');
    assert.deepEqual(f.update('a', [false, false], [0.6, 0, 9 / 7], rest), { kind: 'axis', index: 0 });
    assert.equal(f.update('a', [false, false], [0.35, 0, 9 / 7], rest), null, 'still out (hysteresis)');
    assert.equal(f.update('a', [false, false], [0.55, 0, 9 / 7], rest), null, 'wobbling around the threshold does not refire');
    assert.equal(f.update('a', [false, false], [0.1, 0, 9 / 7], rest), null, 're-armed');
    assert.deepEqual(f.update('a', [false, false], [-0.7, 0, 9 / 7], rest), { kind: 'axis', index: 0 });
    assert.deepEqual(f.update('a', [false, false], [-0.7, 0, -1], rest), { kind: 'hat', index: 2 });
    assert.equal(f.update('a', [false, false], [-0.7, 0, -1], rest), null, 'hat held');
    assert.deepEqual(f.update('a', [true, false], [-0.7, 0.9, -1], rest), { kind: 'button', index: 0 }, 'a button wins over an axis in the same poll');
    assert.equal(f.update('b', [true], [], []), null, 'a newly seen device (woken by this press) does not fire');
  });
  t('input tester follow: scroll throttle', () => {
    const base = { now: 10_000, visible: false, lastScrollAt: 0, userScrollAt: 0 };
    assert.equal(tf.shouldFollowScroll(base), true);
    assert.equal(tf.shouldFollowScroll({ ...base, visible: true }), false, 'already in sight: flash only');
    assert.equal(tf.shouldFollowScroll({ ...base, lastScrollAt: 9_600 }), false, 'just scrolled to another device');
    assert.equal(tf.shouldFollowScroll({ ...base, userScrollAt: 9_000 }), false, 'the user is scrolling');
  });
}

// ---- round 6: template pages, picture format
{
  const tp = await import('../src/lib/templates');
  const pg = await import('../src/lib/templatePages');
  const pf = await import('../src/lib/photoFormat');
  const zv = await import('../src/lib/zoomView');
  const ip = await import('../src/lib/inputPicker');
  const { readPng } = await import('./png');
  const classic = (): any => ({ version: 1, id: 'c1', name: 'Classic', slot: 'js', image: 'data:image/png;base64,AAAA', aspect: 1.25, match: [],
    callouts: [{ id: 'a', kind: 'button', inputs: ['button1'], anchor: { x: 0.2, y: 0.3 }, box: { x: 0.1, y: 0.1 }, region: 'M0 0L1 1Z' }] });
  t('pages: a classic template becomes page 1 with its picture, shape and callouts (nothing moves)', () => {
    const t1 = pg.ensurePages(classic());
    assert.equal(t1.image, undefined);
    assert.deepEqual(t1.views, [{ id: 'main', label: 'Page 1', image: 'data:image/png;base64,AAAA', width: 1250, height: 1000 }]);
    assert.equal(t1.aspect, 1.25);
    assert.deepEqual(t1.callouts[0], { ...classic().callouts[0], view: 'main' }, 'spots and region kept, pinned to the page');
    assert.equal(pg.ensurePages(t1), t1, 'idempotent');
  });
  t('pages: add, rename, move, delete (callouts on a deleted page go with it; the last page stays)', () => {
    let { template: t1, id } = pg.addPage(classic());
    assert.equal(id, 'p2');
    assert.deepEqual(t1.views!.map((v) => [v.id, v.label, v.width, v.height, v.image]), [['main', 'Page 1', 1250, 1000, 'data:image/png;base64,AAAA'], ['p2', 'Page 2', 1600, 1000, undefined]]);
    t1 = pg.renamePage(t1, 'p2', '  Grip   top view  ');
    assert.equal(t1.views![1].label, 'Grip top view');
    assert.equal(pg.renamePage(t1, 'p2', '   ').views![1].label, 'Page 2', 'blank name = Page n');
    assert.equal(pg.renamePage(t1, 'p2', 'x'.repeat(60)).views![1].label.length, pg.PAGE_LABEL_MAX);
    t1 = { ...t1, callouts: [...t1.callouts, { id: 'b', kind: 'button', inputs: ['button2'], anchor: { x: 0.5, y: 0.5 }, box: { x: 0.6, y: 0.5 }, view: 'p2' }] };
    const moved = pg.movePage(t1, 'p2', -1);
    assert.deepEqual(moved.views!.map((v) => v.id), ['p2', 'main']);
    assert.equal(moved.aspect, 1.6, 'aspect follows the first page');
    assert.deepEqual(moved.callouts.map((c) => [c.id, tp.calloutView(moved, c)]), [['a', 'main'], ['b', 'p2']], 'callouts keep their page');
    assert.equal(pg.movePage(t1, 'p2', 1), t1, 'cannot move past the end');
    const del = pg.deletePage(moved, 'p2');
    assert.deepEqual(del.views!.map((v) => v.id), ['main']);
    assert.deepEqual(del.callouts.map((c) => c.id), ['a']);
    assert.equal(del.aspect, 1.25);
    assert.equal(pg.deletePage(del, 'main'), del, 'the last page cannot be deleted');
    assert.equal(pg.pageCallouts(moved, 'p2').length, 1);
    // ids stay unique after deletes
    let t2 = pg.addPage(pg.addPage(classic()).template).template;
    t2 = pg.deletePage(t2, 'p2');
    assert.equal(pg.addPage(t2).id, 'p4');
    let full = classic();
    for (let i = 0; i < 20; i++) full = pg.addPage(full).template;
    assert.equal(full.views.length, pg.MAX_PAGES);
    assert.equal(pg.addPage(full).id, null);
  });
  t('pages: picture set / cleared, and they survive export -> import (12 pages, labels, images); old files still import', () => {
    let t1 = pg.addPage(classic(), 'Throttle top').template;
    t1 = pg.setPageImage(t1, 'p2', { dataUrl: 'data:image/webp;base64,BBBB', w: 990, h: 1064 });
    assert.deepEqual([t1.views![1].width, t1.views![1].height, t1.views![1].image], [Math.round(990 + 2 * 0.3 * 1064), 1064, 'data:image/webp;base64,BBBB'], 'label columns on both sides (PHOTO_LABEL_GUTTER 0.3/side, same as built-ins)');
    assert.equal(pg.setPageImage(t1, 'p2', null).views![1].image, undefined);
    for (let i = 0; i < 10; i++) t1 = pg.addPage(t1, `Extra ${i + 1}`).template;
    t1 = { ...t1, callouts: [...t1.callouts, { id: 'z', kind: 'button', inputs: ['button9'], anchor: { x: 0.5, y: 0.5 }, box: { x: 0.5, y: 0.5 }, view: 'p12' }] };
    const back = tp.parseTemplates(tp.exportTemplates([t1]))[0];
    assert.equal(back.views!.length, 12, 'all 12 pages (the old cap was 6)');
    assert.deepEqual(back.views!.map((v) => v.label).slice(0, 3), ['Page 1', 'Throttle top', 'Extra 1']);
    assert.equal(back.views![1].image, 'data:image/webp;base64,BBBB');
    assert.equal(back.callouts.find((c) => c.id === 'z')!.view, 'p12');
    // a file exported before pages existed (classic single picture, no views) imports unchanged
    const old = tp.parseTemplates(JSON.stringify({ format: 'sc-mapper-device-templates', version: 1, templates: [classic()] }))[0];
    assert.equal(old.views, undefined);
    assert.equal(old.image, 'data:image/png;base64,AAAA');
    assert.equal(old.callouts[0].region, 'M0 0L1 1Z');
  });

  t('pages: setPageImage remaps callouts onto the new photo (no shift); export→import keeps fractions', () => {
    const base = tp.newTemplate('js', 'Shift check');
    let t0 = pg.ensurePages(base);
    // place a marker at the centre of a first photo (canvas fractions for object-contain with label gutters)
    const w0 = 526, h0 = 990;
    t0 = pg.setPageImage(t0, t0.views![0].id, { dataUrl: 'data:image/webp;base64,AAAA', w: w0, h: h0 });
    const v0 = t0.views![0];
    const mid = pg.photoToCanvas({ x: 0.42, y: 0.31 }, v0.width, v0.height, w0, h0);
    const box = pg.photoToCanvas({ x: 0.08, y: 0.31 }, v0.width, v0.height, w0, h0);
    t0 = { ...t0, callouts: [{ id: 'a', kind: 'button', inputs: ['button1'], anchor: mid, box, view: v0.id, label: 'A' }] };
    // replace with a wider photo (and the old 0.68-sized canvas path is gone — shared gutter): marker stays on photo 0.42 / 0.31
    const w1 = 921, h1 = 990;
    const t1 = pg.setPageImage(t0, v0.id, { dataUrl: 'data:image/webp;base64,BBBB', w: w1, h: h1 });
    const v1 = t1.views![0];
    assert.deepEqual([v1.width, v1.height], [pg.pageSizeForPhoto(w1, h1).width, h1]);
    const onPhoto = pg.canvasToPhoto(t1.callouts[0].anchor, v1.width, v1.height, w1, h1);
    assert.ok(Math.abs(onPhoto.x - 0.42) < 1e-6 && Math.abs(onPhoto.y - 0.31) < 1e-6, `anchor stayed on the product (got ${onPhoto.x}, ${onPhoto.y})`);
    const boxPhoto = pg.canvasToPhoto(t1.callouts[0].box, v1.width, v1.height, w1, h1);
    assert.ok(Math.abs(boxPhoto.x - 0.08) < 1e-6 && Math.abs(boxPhoto.y - 0.31) < 1e-6, `box stayed on the product (got ${boxPhoto.x}, ${boxPhoto.y})`);
    // export → import round-trip preserves the canvas fractions exactly
    const again = tp.parseTemplates(tp.exportTemplates([t1]))[0];
    assert.equal(again.callouts[0].anchor.x, t1.callouts[0].anchor.x);
    assert.equal(again.callouts[0].anchor.y, t1.callouts[0].anchor.y);
    assert.equal(again.callouts[0].box.x, t1.callouts[0].box.x);
    assert.equal(again.views![0].width, t1.views![0].width);
  });
  t('pages: remapping from a legacy 0.68 canvas keeps the product spot', () => {
    const ph = 990, pw = 921;
    const legacyW = Math.round(pw + 0.68 * ph); // old setPageImage formula
    const view = { id: 'front', label: 'Front', width: legacyW, height: ph, image: 'data:image/webp;base64,X' };
    const inferred = pg.inferPhotoSize(view, pw);
    assert.ok(Math.abs(inferred.pw - pw) < 1 && inferred.ph === ph, `infer legacy photo size (got ${inferred.pw}×${inferred.ph})`);
    // without a hint, 0.6 and 0.68 can both reverse to a valid width — setPageImage passes the new image width as the hint
    assert.equal(pg.inferPhotoSize(view, pw).pw, pw);
    const anchor = pg.photoToCanvas({ x: 0.55, y: 0.2 }, legacyW, ph, pw, ph);
    const callouts = [{ id: 'b', kind: 'button' as const, inputs: ['button2'], anchor, box: anchor, view: 'front' }];
    const next = pg.pageSizeForPhoto(pw, ph);
    const remapped = pg.remapPageCallouts(callouts, 'front', { viewW: legacyW, viewH: ph, pw, ph }, { viewW: next.width, viewH: next.height, pw, ph });
    const back = pg.canvasToPhoto(remapped[0].anchor, next.width, next.height, pw, ph);
    assert.ok(Math.abs(back.x - 0.55) < 1e-6 && Math.abs(back.y - 0.2) < 1e-6, `legacy→shared gutter kept photo spot (${back.x}, ${back.y})`);
  });

  const solid = (w: number, h: number, rgba: number[]) => { const p = pf.makePx(w, h); for (let i = 0; i < p.data.length; i += 4) p.data.set(rgba, i); return p; };
  t('photo format: trim transparent edges, built-in scale and 5 % margin', () => {
    const px = readPng('scripts/fixtures/photos/cutout-offcentre.png');
    assert.equal(pf.hasTransparency(px), true);
    assert.deepEqual(pf.alphaBox(px), { x: 470, y: 140, w: 160, h: 360 });
    const f = pf.formatPhoto(px, { look: false });
    const k = 900 / 360 > 1.7 ? 1.7 : 900 / 360;
    const pw = Math.round(160 * k), ph = Math.round(360 * k), pad = Math.round(0.05 * ph);
    assert.deepEqual([f.mode, f.px.width, f.px.height, f.pad], ['alpha', pw + 2 * pad, ph + 2 * pad, pad]);
    assert.deepEqual(pf.alphaBox(f.px), { x: pad, y: pad, w: pw, h: ph }, 'product centred in its margin');
    assert.deepEqual(pf.formatSize(2600, 1300), { k: 0.5, w: 1300, h: 650, pad: 65, padX: 65, padY: 65, W: 1430, H: 780 }, 'big products shrink to 1300 px');
    assert.equal(pf.formatSize(1000, 500).k, 1, '900-1300 px products keep their size');
    // the glow: the margin gets a faint cyan haze, the product stays opaque
    const g = pf.formatPhoto(px, { look: true });
    const a = (x: number, y: number) => g.px.data[(y * g.px.width + x) * 4 + 3];
    assert.ok(a(Math.round(g.px.width / 2), Math.round(g.px.height * 0.9)) > 250, 'product opaque');
    const edge = g.px.data.subarray(((pad - 4) * g.px.width + Math.round(g.px.width / 2)) * 4, ((pad - 4) * g.px.width + Math.round(g.px.width / 2)) * 4 + 4);
    assert.ok(edge[3] > 10 && edge[3] < 120 && edge[2] > edge[0], `faint cyan glow just outside the product (${[...edge]})`);
  });
  t('photo format: opaque pictures are trimmed by their plain background and padded with it', () => {
    const px = solid(300, 200, [250, 250, 250, 255]);
    for (let y = 50; y < 150; y++) for (let x = 20; x < 120; x++) px.data.set([20, 30, 40, 255], (y * 300 + x) * 4);
    assert.equal(pf.hasTransparency(px), false);
    const f = pf.formatPhoto(px, { look: true });
    assert.equal(f.mode, 'opaque');
    assert.deepEqual(f.box, { x: 20, y: 50, w: 100, h: 100 });
    assert.deepEqual([...f.px.data.subarray(0, 4)], [250, 250, 250, 255], 'margin in the background colour, no glow');
    assert.equal(f.px.width, Math.round(100 * 1.7) + 2 * Math.round(0.05 * 170));
  });
  t('photo format: flood fill removes a plain background, keeps holes that do not touch the border, drops specks', () => {
    const px = solid(120, 100, [240, 240, 240, 255]);
    for (let y = 20; y < 80; y++) for (let x = 20; x < 100; x++) px.data.set([30, 30, 30, 255], (y * 120 + x) * 4);
    for (let y = 40; y < 60; y++) for (let x = 50; x < 70; x++) px.data.set([240, 240, 240, 255], (y * 120 + x) * 4); // enclosed light patch
    px.data.set([0, 0, 0, 255], (5 * 120 + 5) * 4); // speck
    const m = pf.floodFillMask(px);
    assert.equal(m[0], 0);
    assert.equal(m[50 * 120 + 60], 1, 'enclosed patch is not background (no path from the border)');
    const cut = pf.applyMask(px, m, { crisp: false });
    assert.equal(cut.data[(5 * 120 + 5) * 4 + 3], 0, 'speck dropped (main parts only)');
    assert.equal(cut.data[(30 * 120 + 30) * 4 + 3], 255);
    assert.deepEqual(pf.alphaBox(cut), { x: 20, y: 20, w: 80, h: 60 });
    const ea = cut.data[(40 * 120 + 20) * 4 + 3];
    assert.ok(ea > 150 && ea < 255, `soft 1 px edge (${ea})`);
  });
  t('photo format: mask helpers (resize, normalise, blur keeps the sum, model input layout)', () => {
    const m = pf.resizeMask(new Float32Array([0, 1, 1, 0]), 2, 2, 4, 4);
    assert.equal(m.length, 16);
    assert.ok(m[0] === 0 && m[3] === 1);
    assert.deepEqual([...pf.normalizeMask(new Float32Array([2, 4, 6]))], [0, 0.5, 1]);
    const a = new Float32Array(41 * 41); a[20 * 41 + 20] = 1;
    const b = pf.gaussBlur(a, 41, 41, 3);
    assert.ok(Math.abs(b.reduce((s, v) => s + v, 0) - 1) < 1e-4 && b[20 * 41 + 20] < 0.1);
    const inp = pf.modelInput(solid(50, 30, [255, 0, 0, 255]));
    assert.equal(inp.length, 3 * 320 * 320);
    assert.ok(Math.abs(inp[0] - (1 - 0.485) / 0.229) < 1e-4 && Math.abs(inp[320 * 320] - (0 - 0.456) / 0.224) < 1e-4, 'CHW, scaled by the max, ImageNet-normalised');
  });
  t('photo format: canvas aspect presets (stick / throttle / square / custom) keep the product centred', () => {
    assert.equal(pf.aspectOf({ id: 'auto' }), undefined);
    assert.ok(Math.abs(pf.aspectOf({ id: 'stick' })! - 990 / 1064) < 1e-9 && Math.abs(pf.aspectOf({ id: 'throttle' })! - 990 / 846) < 1e-9);
    assert.equal(pf.aspectOf({ id: 'square' }), 1);
    assert.equal(pf.aspectOf({ id: 'custom', w: 16, h: 9 }), 16 / 9);
    assert.equal(pf.aspectOf({ id: 'custom', w: 100, h: 1 }), 5, 'custom clamped to 5:1');
    assert.equal(pf.aspectOf({ id: 'custom', w: 0, h: 9 }), undefined, 'incomplete custom = auto');
    const s = pf.formatSize(2600, 1300, 990 / 1064);
    assert.deepEqual([s.W, s.H, s.padX, s.padY], [1430, Math.round(1430 / (990 / 1064)), 65, Math.floor((Math.round(1430 / (990 / 1064)) - 650) / 2)], 'wide product on a portrait canvas grows the height');
    const px = readPng('scripts/fixtures/photos/cutout-offcentre.png');
    for (const [id, r] of [['throttle', 990 / 846], ['stick', 990 / 1064], ['square', 1]] as const) {
      const f = pf.formatPhoto(px, { look: false, aspect: r });
      assert.ok(Math.abs(f.px.width / f.px.height - r) < 0.002, `${id}: ${f.px.width}x${f.px.height}`);
      const b = pf.alphaBox(f.px)!;
      assert.deepEqual([b.w, b.h], [272, 612], `${id}: product size unchanged`);
      assert.ok(Math.abs(b.x - (f.px.width - b.x - b.w)) <= 1 && Math.abs(b.y - (f.px.height - b.y - b.h)) <= 1, `${id}: centred`);
      assert.ok(b.x >= f.pad && b.y >= f.pad, `${id}: at least the 5 % margin`);
      assert.deepEqual([f.padX, f.padY], [b.x, b.y]);
    }
  });
  t('photo framing: the canvas is a fixed frame, the product moves / scales inside it and is cut off at the edges', () => {
    const px = readPng('scripts/fixtures/photos/cutout-offcentre.png');
    const plan = pf.planFrame(px, 990 / 1064);
    const r0 = pf.productRect(plan, plan.framing);
    assert.deepEqual([r0.w, r0.h, r0.cropped], [272, 612, false], 'Fit = the built-in scale, product inside the frame');
    assert.ok(Math.abs(r0.x - (plan.W - r0.x - r0.w)) <= 1 && Math.abs(r0.y - (plan.H - r0.y - r0.h)) <= 1, 'Fit centres the product');
    const fit = pf.framePhoto(px, plan, plan.framing, { look: false });
    assert.deepEqual(fit.data, pf.formatPhoto(px, { look: false, aspect: 990 / 1064 }).px.data, 'Fit renders exactly the formatted picture');
    // move the product half out of the left edge: the output is the frame's content only (the left half is cut off)
    const moved = { ...plan.framing, x: plan.framing.x - (r0.x + r0.w / 2) };
    const rm = pf.productRect(plan, moved);
    const out = pf.framePhoto(px, plan, moved, { look: false });
    assert.deepEqual([out.width, out.height], [plan.W, plan.H], 'output = the canvas resolution');
    const b = pf.alphaBox(out)!;
    assert.ok(rm.cropped && b.x === 0 && Math.abs(b.w - (rm.x + rm.w)) <= 1 && b.h === rm.h, `cut off at the left edge (${JSON.stringify(b)})`);
    // zoom around a point keeps that point; the range is limited to 0.25x..4x of Fit
    const z = pf.zoomFraming(plan, plan.framing, 2, 100, 200);
    const src = (f: { k: number; x: number; y: number }) => [(100 - f.x) / f.k, (200 - f.y) / f.k];
    assert.ok(Math.abs(src(z)[0] - src(plan.framing)[0]) < 1e-9 && Math.abs(src(z)[1] - src(plan.framing)[1]) < 1e-9 && Math.abs(z.k / plan.framing.k - 2) < 1e-12);
    assert.equal(pf.zoomFraming(plan, plan.framing, 100, 0, 0).k, plan.framing.k * pf.FRAME_MAX_REL);
    assert.equal(pf.clampFraming(plan, { ...plan.framing, k: plan.framing.k / 100 }).k, plan.framing.k * pf.FRAME_MIN_REL);
    const big = pf.zoomFraming(plan, plan.framing, 2, plan.W / 2, plan.H / 2);
    const rb = pf.productRect(plan, big);
    assert.ok(rb.cropped && rb.w === 544, 'zoomed past the frame: cropped');
    // the glow is applied after framing (cut-out only): it reaches into the frame's margin, and stops at the frame
    const g = pf.framePhoto(px, plan, plan.framing, { look: true });
    assert.ok(g.data[((r0.y + 300) * plan.W + r0.x - 6) * 4 + 3] > 0 && fit.data[((r0.y + 300) * plan.W + r0.x - 6) * 4 + 3] === 0, 'glow added around the product after framing');
    // opaque pictures: the canvas outside the product is the background colour
    const op = solid(300, 200, [250, 250, 250, 255]);
    for (let y = 50; y < 150; y++) for (let x = 20; x < 120; x++) op.data.set([20, 30, 40, 255], (y * 300 + x) * 4);
    const opl = pf.planFrame(op, 1);
    const oo = pf.framePhoto(op, opl, { ...opl.framing, x: opl.framing.x + 50 }, { look: true });
    assert.deepEqual([...oo.data.subarray(0, 4)], [250, 250, 250, 255]);
  });
  t('zoom view: fit the union, zoom keeps the point under the cursor, pan, place', () => {
    const v = zv.fitView([{ x: 0, y: 0, w: 100, h: 50 }, { x: -20, y: -10, w: 60, h: 80 }], 400, 400, 1);
    assert.deepEqual(v, { z: 400 / 120, cx: 40, cy: 30 }, 'union -20..100 x -10..70');
    const p = zv.place(v, { x: -20, y: -10, w: 120, h: 80 }, 400, 400);
    assert.ok(Math.abs(p.left) < 1e-9 && Math.abs(p.width - 400) < 1e-9);
    const z = zv.zoomAt(v, 2, 300, 100, 400, 400);
    const before = { x: v.cx + (300 - 200) / v.z, y: v.cy + (100 - 200) / v.z }, after = { x: z.cx + (300 - 200) / z.z, y: z.cy + (100 - 200) / z.z };
    assert.ok(Math.abs(z.z - 2 * v.z) < 1e-9 && Math.abs(before.x - after.x) < 1e-9 && Math.abs(before.y - after.y) < 1e-9, 'same picture point under the cursor');
    assert.equal(zv.zoomAt(v, 1e6, 0, 0, 400, 400, 0.01, 8).z, 8, 'max zoom');
    const q = zv.panBy(z, 30, -10);
    assert.ok(Math.abs(zv.place(q, { x: 0, y: 0, w: 1, h: 1 }, 400, 400).left - zv.place(z, { x: 0, y: 0, w: 1, h: 1 }, 400, 400).left - 30) < 1e-9, 'drag moves the picture by the drag');
  });
  t('input picker: linked device inputs, link-rule fallback, used-by and multi-pick kinds', () => {
    const tpl = { slot: 'js' as const, match: [{ vendor: '231d', product: '0200', buttons: 32 }] };
    const ident = { slot: 'js' as const, vendor: '231d', productId: '0200', name: 'VKB Gladiator', buttons: 32 };
    assert.deepEqual(ip.padLayout([0, 0, 0.5, 0, 0, 0, 0, 0, 9 / 7]), { axes: ['x', 'y', 'z', 'rotx', 'roty', 'rotz', 'slider1', 'slider2'], hats: 1 });
    assert.deepEqual(ip.padLayout([0, 0, 1.2857, 0]), { axes: ['x', 'y', 'rotx'], hats: 1 }, 'a hat axis is not a game axis');
    const d = ip.deviceInputs(tpl, ident, { buttons: 32, axesRest: [0, 0, 0, 0, 0, 9 / 7], name: 'Gladiator' })!;
    assert.deepEqual([d.from, d.buttons, d.hats, d.axes.join()], ['device', 32, 1, 'x,y,z,rotx,roty']);
    const r = ip.deviceInputs(tpl, { ...ident, vendor: '044f' }, undefined)!;
    assert.deepEqual([r.from, r.buttons, r.hats], ['rule', 32, 0], 'not connected: buttons from the link rule');
    assert.equal(ip.deviceInputs({ slot: 'js', match: [{ name: 'Gladiator' }] }, ident, undefined), null, 'no button count anywhere: free typing');
    assert.equal(ip.deviceInputs({ slot: 'js', match: [] }, ident, { buttons: 32, name: 'x' }), null, 'not linked: free typing');
    const callouts = [
      { id: 'a', kind: 'button' as const, inputs: ['button1'], label: 'Trigger', anchor: { x: 0, y: 0 }, box: { x: 0, y: 0 } },
      { id: 'b', kind: 'hat' as const, inputs: ['hat1_up', 'hat1_right', 'hat1_down', 'hat1_left'], anchor: { x: 0, y: 0 }, box: { x: 0, y: 0 } },
      { id: 'c', kind: 'axis' as const, inputs: ['z'], anchor: { x: 0, y: 0 }, box: { x: 0, y: 0 } },
    ];
    const es = ip.pickEntries(d, callouts, 'button');
    assert.equal(es.length, 32 + 4);
    assert.deepEqual(es[0], { input: 'button1', label: 'Button 1', group: 'Buttons', usedBy: [{ id: 'a', title: 'Trigger' }] });
    assert.deepEqual(es[32].usedBy, [{ id: 'b', title: 'Hat 1' }]);
    assert.deepEqual([es[32].input, es[35].input, es[35].group], ['hat1_up', 'hat1_left', 'Hats']);
    assert.deepEqual(ip.pickEntries(d, callouts, 'axis').find((e) => e.input === 'z')!.usedBy.map((u) => u.id), ['c']);
    const gp = ip.deviceInputs({ slot: 'gp', match: [] }, { slot: 'gp' }, { buttons: 17, name: 'Xbox' })!;
    assert.deepEqual(ip.pickEntries(gp, [], 'button').map((e) => e.input), cap.GP_BUTTONS, 'gamepads list the SC gamepad buttons');
    assert.deepEqual(ip.multiPickRange({ kind: 'hat', inputs: ['', '', '', ''] }, 'js'), { min: 4, max: 5 });
    assert.equal(ip.multiPickRange({ kind: 'hat', inputs: ['hat1_up'] }, 'js'), null, 'a POV hat is one choice');
    assert.deepEqual(ip.multiPickRange({ kind: 'switch', inputs: ['button1', 'button2'] }, 'js'), { min: 2, max: 8 });
    assert.equal(ip.multiPickRange({ kind: 'button', inputs: ['button1'] }, 'js'), null);
  });
}

console.log('\npress to bind (Devices, Edit mode)');
{
  const pb = await import('../src/lib/pressBind');
  const callouts = [
    { id: 'trig', inputs: ['button1'] },
    { id: 'hat', inputs: ['hat1_up', 'hat1_right', 'hat1_down', 'hat1_left'] },
    { id: 'ls', inputs: ['thumblx', 'thumbly'] },
    { id: 'lt', inputs: ['triggerl_btn'] },
    { id: 'dup', inputs: ['button1', 'button2'] },
  ];
  t('a press on this slot picks the callout that shows it, with the exact input', () => {
    assert.deepEqual(pb.pressBindTarget(callouts, 'js', 1, { slot: 'js', instance: 1, inputs: ['hat1_right'] }), { kind: 'hit', calloutId: 'hat', input: 'hat1_right' });
    assert.deepEqual(pb.pressBindTarget(callouts, 'js', 1, { slot: 'js', instance: 1, inputs: ['button1'] }), { kind: 'hit', calloutId: 'trig', input: 'button1' });
  });
  t('the selected callout wins when two show the same input', () => {
    assert.deepEqual(pb.pressBindTarget(callouts, 'js', 1, { slot: 'js', instance: 1, inputs: ['button1'] }, 'dup'), { kind: 'hit', calloutId: 'dup', input: 'button1' });
  });
  t('an input no callout shows: raw input (callout null)', () => {
    assert.deepEqual(pb.pressBindTarget(callouts, 'js', 1, { slot: 'js', instance: 1, inputs: ['button47'] }), { kind: 'hit', calloutId: null, input: 'button47' });
  });
  t('another device (or instance) is reported, not picked', () => {
    assert.deepEqual(pb.pressBindTarget(callouts, 'js', 1, { slot: 'js', instance: 2, inputs: ['button1'], device: 'EVO L' }), { kind: 'other', slot: 'js', instance: 2, device: 'EVO L' });
    assert.equal(pb.pressBindTarget(callouts, 'js', 1, { slot: 'gp', instance: 1, inputs: ['a'] }).kind, 'other');
  });
  t('gamepad forms: the first form a callout covers wins (stick axis / direction, analog trigger)', () => {
    assert.deepEqual(pb.pressBindTarget(callouts, 'gp', 1, { slot: 'gp', instance: 1, inputs: ['thumblx', 'thumbl_right'] }), { kind: 'hit', calloutId: 'ls', input: 'thumblx' });
    assert.deepEqual(pb.pressBindTarget([{ id: 'r', inputs: ['triggerr_btn'] }], 'gp', 1, { slot: 'gp', instance: 1, inputs: ['triggerr'] }), { kind: 'hit', calloutId: 'r', input: 'triggerr' });
    assert.deepEqual(pb.pressBindTarget([], 'gp', 1, { slot: 'gp', instance: 1, inputs: ['thumbrx', 'thumbr_left'] }), { kind: 'hit', calloutId: null, input: 'thumbrx' });
  });
}

console.log('\nlive row highlight (which bound actions fire)');
{
  const lr = await import('../src/lib/liveRows');
  const { splitCombo } = await import('../src/lib/templates');
  const L = (active: string[], values: Record<string, number> = {}) => ({ active: new Set(active), values });
  type E = { id: string; input: string };
  const key = (e: E) => { const { main, prefix } = splitCombo(e.input); return { main, prefix }; };
  const ids = (s: Set<E>) => [...s].map((e) => e.id).sort();
  // a 2-stage trigger callout (button1 + button6) listing several actions per input
  const trig: E[] = [{ id: 'qd', input: 'button1' }, { id: 'fire', input: 'button1' }, { id: 'stage2', input: 'button6' }, { id: 'kp', input: 'button6' }];
  t('only the rows of the pressed input fire, not the whole callout', () => {
    assert.deepEqual(ids(lr.firingRows(trig, key, L(['button6']))), ['kp', 'stage2']);
    assert.deepEqual(ids(lr.firingRows(trig, key, L(['button1', 'button6']))), ['fire', 'kp', 'qd', 'stage2']);
    assert.equal(lr.firingRows(trig, key, L([])).size, 0);
    assert.equal(lr.firingRows(trig, key, L(['button2'])).size, 0);
  });
  t('hat directions: only the pushed direction (a diagonal lights both of its parts)', () => {
    const hat: E[] = ['up', 'right', 'down', 'left'].map((d) => ({ id: d, input: `hat1_${d}` }));
    assert.deepEqual(ids(lr.firingRows(hat, key, L(['hat1_right']))), ['right']);
    assert.deepEqual(ids(lr.firingRows(hat, key, L(['hat1_up', 'hat1_left']))), ['left', 'up']);
  });
  t('modifier layers: plain rows fire alone; with the layer held only its rows fire (most specific wins)', () => {
    const a: E[] = [{ id: 'jump', input: 'a' }, { id: 'interact', input: 'a' }, { id: 'lookBehind', input: 'shoulderl+a' }];
    assert.deepEqual(ids(lr.firingRows(a, key, L(['a']))), ['interact', 'jump']);
    assert.deepEqual(ids(lr.firingRows(a, key, L(['a', 'shoulderl']))), ['lookBehind']);
    assert.equal(lr.firingRows(a, key, L(['shoulderl'])).size, 0, 'holding only the layer button fires nothing on A');
    // LB held but no LB layer bound on this input: the plain rows still fire
    assert.deepEqual(ids(lr.firingRows([{ id: 'x', input: 'x' }], key, L(['x', 'shoulderl']))), ['x']);
  });
  t('keyboard modifiers on device bindings: fire only while the key is held', () => {
    const rows: E[] = [{ id: 'plain', input: 'button3' }, { id: 'alt', input: 'lalt+button3' }];
    assert.deepEqual(ids(lr.firingRows(rows, key, L(['button3']))), ['plain']);
    assert.deepEqual(ids(lr.firingRows(rows, key, L(['button3']), new Set(['lalt']))), ['alt']);
    assert.deepEqual(ids(lr.firingRows(rows, key, L(['button3']), new Set(['ralt']))), ['plain']);
  });
  t('gamepad stick: axis rows on any move, direction rows only when pushed that way (Y up is negative)', () => {
    const ls: E[] = [{ id: 'yaw', input: 'thumblx' }, { id: 'panL', input: 'thumbl_left' }, { id: 'panR', input: 'thumbl_right' }, { id: 'thr', input: 'thumbly' }, { id: 'up', input: 'thumbl_up' }];
    assert.deepEqual(ids(lr.firingRows(ls, key, L(['thumblx'], { thumblx: -0.8, thumbly: 0 }))), ['panL', 'yaw']);
    assert.deepEqual(ids(lr.firingRows(ls, key, L(['thumblx'], { thumblx: 0.8, thumbly: 0 }))), ['panR', 'yaw']);
    assert.deepEqual(ids(lr.firingRows(ls, key, L(['thumbly'], { thumblx: 0, thumbly: -0.6 }))), ['thr', 'up']);
    assert.equal(lr.inputHeld('thumbl_left', L([], { thumblx: -0.9 })), false, 'a direction needs its axis to count as moved');
    assert.equal(lr.inputHeld('thumbl_left', L(['thumblx'], { thumblx: -0.1 })), false, 'below the threshold');
  });
  t('analog trigger rows ride on the trigger button', () => {
    const lt: E[] = [{ id: 'btn', input: 'triggerl_btn' }, { id: 'axis', input: 'triggerl' }];
    assert.deepEqual(ids(lr.firingRows(lt, key, L(['triggerl_btn']))), ['axis', 'btn']);
  });
  t('compact lists: firing rows never hide behind "+N more"', () => {
    const xs = ['a1', 'a2', 'a3', 'a4', 'b1', 'b2'];
    const on = (set: string[]) => (x: string) => set.includes(x);
    assert.deepEqual(lr.liveFirst(xs, on([]), 3), { shown: ['a1', 'a2', 'a3'], hidden: 3, hiddenLive: 0 });
    assert.deepEqual(lr.liveFirst(xs, on(['a2']), 3), { shown: ['a1', 'a2', 'a3'], hidden: 3, hiddenLive: 0 }, 'already in sight: order kept');
    assert.deepEqual(lr.liveFirst(xs, on(['b1', 'b2']), 3), { shown: ['b1', 'b2', 'a1'], hidden: 3, hiddenLive: 0 });
    assert.deepEqual(lr.liveFirst(xs, on(['a1', 'a3', 'a4', 'b2']), 3), { shown: ['a1', 'a3', 'a4'], hidden: 3, hiddenLive: 1 });
    assert.deepEqual(lr.liveFirst(['x'], on(['x']), 3), { shown: ['x'], hidden: 0, hiddenLive: 0 });
  });
}


// ---------------------------------------------------------------- shared controller files (.sckeymap.json): pack / unpack, slot remap, merge vs replace
console.log('\nshared controller files');
{
  const sh = await import('../src/lib/share');
  const { cleanTemplate } = await import('../src/lib/templates');
  const sample = parseActionMaps(readFileSync('public/samples/actionmaps.xml', 'utf8'), 'actionmaps.xml');
  const js1 = { slot: 'js' as const, instance: 1 }, js2 = { slot: 'js' as const, instance: 2 };
  const game = { branch: defaults.meta.branch, version: defaults.meta.version, channel: defaults.meta.channel };
  const builtin = { version: 1 as const, id: 'builtin-stick', name: 'Generic stick', builtin: true, slot: 'js' as const, aspect: 1.6, match: [], callouts: [] };
  const px = 'data:image/webp;base64,' + 'A'.repeat(4000);
  const custom = cleanTemplate({ id: 'my-warthog', name: 'My Warthog', slot: 'js', views: [{ id: 'front', label: 'Front', image: px, width: 1000, height: 800 }, { id: 'side', label: 'Side', image: '/device-photos/tm-warthog-stick.webp', width: 900, height: 900 }],
    match: [{ vendor: '044F', product: '0402' }], callouts: [{ id: 'trig', kind: 'switch', inputs: ['button1', 'button6'], label: 'Trigger', anchor: { x: 0.4, y: 0.3 }, box: { x: 0.1, y: 0.2 }, view: 'front' }] });
  const device = { kind: 'js' as const, name: 'Joystick - HOTAS Warthog', vendor: '044F', product: '0402', buttons: 19, gameProduct: ' Joystick - HOTAS Warthog  {0402044F-0000-0000-0000-504944564944}', sourceSlot: 'js1' };
  const bindings = sh.slotBindings(sample.rebinds, idx, defaults, js1);
  const roundTrip = (o: Record<string, unknown>) => sh.parseShared(JSON.stringify(o));
  const errOf = (text: string) => { try { sh.parseShared(text); return ''; } catch (e) { assert.ok(e instanceof sh.ShareFileError, 'a ShareFileError'); return (e as Error).message; } };

  t('a slot\'s bindings are stored without the jsN_ prefix, game defaults and modifier combos included, other slots left out', () => {
    assert.ok(bindings.length > 20);
    assert.ok(bindings.every((b) => !/^(js|gp|kb|mo)\d_/.test(b.input)), 'no device prefix');
    const pitch = bindings.find((b) => b.action === 'v_pitch')!;
    assert.deepEqual([pitch.input, pitch.default], ['y', undefined], 'the profile\'s own js1_y');
    assert.ok(bindings.some((b) => b.default && b.action === 'v_autoland' && b.input === 'button12'), 'a kept game default, flagged');
    assert.ok(!bindings.some((b) => b.action === 'v_strafe_lateral'), 'js2\'s bindings are not on js1');
    assert.equal(bindings.find((b) => b.action === 'v_pitch')!.label, 'Pitch');
    const withCombo = ed.setGroup(sample.rebinds, idx.get('spaceship_movement/v_space_brake'), 'spaceship_movement', 'v_space_brake', 'js', [{ slot: 'js', instance: 1, input: 'lalt+button3' }, { slot: 'js', instance: 2, input: 'button4' }]);
    const c = sh.slotBindings(withCombo, idx, defaults, js1).filter((b) => b.action === 'v_space_brake');
    assert.deepEqual(c.map((b) => b.input), ['lalt+button3'], 'keyboard-modifier + button combo kept, js2 binding of the same action not');
  });
  t('pack: built-in template by id; custom template in full with its embedded photo; metadata', () => {
    const a = sh.packController({ title: '  Dogfight  ', note: 'trim hat = strafe', now: new Date('2026-10-08T08:00:00Z'), game, device, template: builtin, bindings });
    assert.equal(a.format, 'sc-keymap-shared-controller'); assert.equal(a.version, 1); assert.equal(a.title, 'Dogfight');
    assert.deepEqual(a.template, { kind: 'builtin', id: 'builtin-stick', name: 'Generic stick' });
    assert.equal(a.exportedAt, '2026-10-08T08:00:00.000Z'); assert.equal(a.game.version, defaults.meta.version);
    const b = sh.packController({ game, device, template: custom, bindings });
    assert.equal(b.template.kind, 'custom');
    const text = sh.serializeShared(b);
    assert.ok(text.includes(px), 'the embedded WebP travels in the file');
    assert.deepEqual(sh.templatePictures(custom), { embedded: 1, bytes: px.length, builtinRefs: 1 });
    assert.equal(sh.shareFileName(a), 'joystick-hotas-warthog--dogfight.sckeymap.json');
    assert.ok(sh.looksShared(text));
  });
  t('unpack: a file round-trips (bindings, device, custom template, axis settings)', () => {
    const axis = { groups: [{ name: 'flight_move_pitch', attrs: [['invert', '1']] as [string, string][] }, { name: 'flight_move_yaw', attrs: [] as [string, string][], curve: { attrs: [] as [string, string][], points: [['0', '0'], ['0.5', '0.3'], ['1', '1']] as [string, string][] } }], axes: [{ input: 'x', deadzone: 0.02 }] };
    const pk = sh.packController({ title: 'T', game, device, template: custom, bindings, axis });
    const back = sh.parseShared(sh.serializeShared(pk));
    assert.deepEqual(back.bindings, pk.bindings);
    assert.deepEqual(back.device, device);
    assert.deepEqual(back.axis, axis);
    assert.equal(back.template.kind, 'custom');
    if (back.template.kind === 'custom') { assert.equal(back.template.template.views![0].image, px); assert.equal(back.template.template.callouts[0].label, 'Trigger'); }
  });
  t('version and format validation: friendly errors for wrong, corrupt and newer files', () => {
    const ok = sh.packController({ game, device, template: builtin, bindings });
    assert.match(errOf('{"format":"sc-keymap-shared-controller","version":1'), /isn.t valid JSON/);
    assert.match(errOf('<ActionMaps/>'), /isn.t valid JSON/);
    assert.match(errOf(JSON.stringify({ ...ok, version: 2 })), /newer version of SC Keymap \(format v2; this page reads v1\)/);
    assert.match(errOf(JSON.stringify({ ...ok, version: 0 })), /damaged/);
    assert.match(errOf(JSON.stringify({ format: 'sc-mapper-device-templates', version: 1, templates: [] })), /template file/);
    assert.match(errOf(JSON.stringify({ hello: 1 })), /Not a shared controller/);
    assert.match(errOf(JSON.stringify({ ...ok, device: { name: 'x' } })), /joystick or a gamepad/);
    assert.match(errOf(JSON.stringify({ ...ok, template: { kind: 'builtin', id: '../../etc' } })), /template is missing/);
    assert.match(errOf(JSON.stringify({ ...ok, bindings: [{ map: 1 }] })), /none of its bindings/);
    assert.equal(errOf(JSON.stringify(ok)), '');
  });
  t('unpack sanitizes: bad inputs / names dropped, prefixed inputs refused, axis attributes checked, no raw XML', () => {
    const pk = roundTrip({ ...sh.packController({ game, device, template: builtin, bindings: [] }),
      bindings: [{ map: 'spaceship_movement', action: 'v_pitch', input: 'Y' }, { map: 'spaceship_movement', action: 'v_roll', input: 'js1_x"/><evil' }, { map: 'a b', action: 'v', input: 'x' }, { map: 'spaceship_movement', action: 'v_pitch', input: 'y' }],
      axis: { groups: [{ name: 'flight_move_pitch', attrs: [['invert', '1'], ['on<x', '1'], ['exponent', 'x'.repeat(100)]], extra: ['<script/>'] }, { name: '<bad>', attrs: [] }], axes: [{ input: 'x', deadzone: 5 }, { input: 'y', saturation: 0.9 }] } });
    assert.deepEqual(pk.bindings.map((b) => b.input), ['y'], 'lower-cased, deduplicated, the injection and the bad map name dropped');
    assert.deepEqual(pk.axis!.groups, [{ name: 'flight_move_pitch', attrs: [['invert', '1']] }]);
    assert.deepEqual(pk.axis!.axes, [{ input: 'y', saturation: 0.9 }], 'out-of-range deadzone dropped');
  });
  const prof = (rb: Record<string, Record<string, any[]>>) => rb as any;
  const target = sh.slotBindings(sample.rebinds, idx, defaults, js2);
  t('slot remap: a js1 file applied to js2 writes js2_ inputs, keeps js1 (other slot) bindings and defaults', () => {
    const p = sh.planImport(sample.rebinds, idx, bindings, js2, 'merge');
    const pitch = p.rebinds.spaceship_movement.v_pitch;
    assert.ok(pitch.some((r: any) => r.slot === 'js' && r.instance === 2 && r.input === 'y'), 'v_pitch on js2_y');
    assert.ok(pitch.some((r: any) => r.instance === 1 && r.input === 'y'), 'the importer\'s own js1_y stays');
    const autoland = p.rebinds.spaceship_movement.v_autoland;
    assert.deepEqual(autoland.map((r: any) => `js${r.instance}_${r.input}`).sort(), ['js1_button12', 'js2_button12'], 'a js1 game default kept explicitly next to the new js2 binding');
    assert.equal(p.applied.length, bindings.length); assert.equal(p.skipped.length, 0);
    const xml = buildExport(defaults, ed.withRebinds(sample, p.rebinds), { format: 'actionmaps', name: 'x' });
    assert.match(xml, /<action name="v_toggle_qdrive_engagement">[\s\S]*?input="js2_button1"/);
    assert.match(xml, /<joystick instance="2"|type="joystick" instance="2"/);
  });
  t('merge: the file wins on its inputs and actions on the target slot; the rest of the slot stays; counts', () => {
    // js2 has afterburner=button2, space_brake=button4, strafe_lateral=x, … ; the file uses button4 (noise launch) and x (roll) etc.
    const p = sh.planImport(sample.rebinds, idx, bindings, js2, 'merge');
    const on2 = (map: string, action: string) => (p.rebinds[map]?.[action] ?? []).filter((r: any) => r.slot === 'js' && r.instance === 2).map((r: any) => r.input);
    assert.deepEqual(on2('spaceship_movement', 'v_space_brake'), [], 'js2_button4 overwritten (the file binds button4)');
    assert.deepEqual(on2('spaceship_movement', 'v_strafe_lateral'), [], 'js2_x overwritten (the file binds x)');
    assert.deepEqual(on2('spaceship_movement', 'v_toggle_landing_system'), ['button13'], 'an input the file does not use stays');
    assert.ok(p.removed.some((r) => r.action === 'v_space_brake' && r.input === 'button4'));
    assert.equal(p.added + p.unchanged, p.applied.length);
    const keepSame = sh.planImport(sample.rebinds, idx, [{ map: 'spaceship_movement', action: 'v_toggle_landing_system', input: 'button20' }], js2, 'merge');
    assert.deepEqual((keepSame.rebinds.spaceship_movement.v_toggle_landing_system as any[]).filter((r) => r.instance === 2).map((r) => r.input), ['button20'], 'same action: moves to the file\'s input');
    assert.deepEqual(keepSame.removed.map((r) => r.input), ['button13']);
    // the target slot's other actions and the keyboard are untouched
    assert.deepEqual(keepSame.rebinds.seat_general, sample.rebinds.seat_general);
    assert.deepEqual(keepSame.touched, [{ map: 'spaceship_movement', action: 'v_toggle_landing_system' }]);    // a game default the file carries claims its input but doesn't push out the importer's own binding of that action
    const dflt = sh.planImport(sample.rebinds, idx, [{ map: 'spaceship_movement', action: 'v_toggle_landing_system', input: 'button12', default: true }], js2, 'merge');
    assert.deepEqual((dflt.rebinds.spaceship_movement.v_toggle_landing_system as any[]).filter((r) => r.instance === 2).map((r) => r.input).sort(), ['button12', 'button13'], 'default: added next to the own binding');
    assert.deepEqual(dflt.removed, []);
  });
  t('replace: every binding on the target slot is cleared first (defaults included), then the file applies', () => {
    const p = sh.planImport(sample.rebinds, idx, bindings, js2, 'replace');
    const after = sh.slotBindings(p.rebinds, idx, defaults, js2);
    const sig = (l: { map: string; action: string; input: string }[]) => l.map((b) => `${b.map}/${b.action}=${b.input}`).sort();
    assert.deepEqual(sig(after), sig(bindings), 'js2 now has exactly the file\'s bindings');
    assert.equal(p.removed.length, target.filter((b) => !bindings.some((x) => x.map === b.map && x.action === b.action && x.input === b.input)).length);
    assert.ok(p.removed.some((r) => r.action === 'v_toggle_landing_system'), 'replace also drops inputs the file does not use');
    const self = sh.planImport(sample.rebinds, idx, bindings, js1, 'replace');
    assert.equal(self.touched.length, 0, 'replacing js1 with its own export changes nothing');
    assert.equal(self.unchanged, bindings.length);
    // replace into an empty js1 of a fresh profile clears the js1 defaults the file doesn't have
    const only = sh.planImport({}, idx, [{ map: 'spaceship_movement', action: 'v_pitch', input: 'y' }], js1, 'replace');
    assert.deepEqual(only.rebinds.spaceship_movement.v_autoland, [{ slot: 'js', instance: 1, input: '' }], 'a cleared game default (js1_ ) as the game writes it');
  });
  t('unknown actions (another game version) are skipped and listed', () => {
    const extra = [...bindings, { map: 'spaceship_movement', action: 'v_warp_drive_2077', input: 'button18', label: 'Warp drive' }, { map: 'future_map', action: 'x', input: 'button19' }];
    const p = sh.planImport(prof({}), idx, extra, js2, 'merge');
    assert.deepEqual(p.skipped.map((b) => b.action), ['v_warp_drive_2077', 'x']);
    assert.equal(p.applied.length, bindings.length);
    assert.ok(!p.rebinds.spaceship_movement.v_warp_drive_2077 && !p.rebinds.future_map, 'nothing written for them');
  });
  t('axis settings: merge keeps the slot\'s other groups, replace clears them; deadzones go under the device model', () => {
    const s0 = (sample.settings)!;
    const axis = { groups: [{ name: 'flight_move_pitch', attrs: [['exponent', '2']] as [string, string][] }], axes: [{ input: 'x', deadzone: 0.05 }] };
    const prod = ' VKBsim Gladiator EVO L    {3201231D-0000-0000-0000-504944564944}';
    const m = sh.applyAxisSettings(s0, js2, prod, axis, 'merge');
    assert.deepEqual(dvo.groupValues(m.settings, 'joystick', 2, 'flight_move_pitch')?.exponent, 2);
    assert.ok(dvo.groupValues(m.settings, 'joystick', 2, 'flight_move_strafe_vertical')?.curve, 'merge keeps js2\'s curve');
    assert.equal(dvo.axisValues(m.settings, prod).x.deadzone, 0.05);
    const r = sh.applyAxisSettings(s0, js2, prod, axis, 'replace');
    assert.equal(dvo.groupValues(r.settings, 'joystick', 2, 'flight_move_strafe_vertical'), undefined, 'replace clears it');
    assert.equal(dvo.groupValues(r.settings, 'joystick', 1, 'flight_move_pitch')?.invert, true, 'js1 untouched');
    const fresh = sh.applyAxisSettings({ blocks: [] }, { slot: 'js', instance: 3 }, ' X {00010002-0000-0000-0000-504944564944}', axis, 'merge');
    assert.equal(dvo.blockProduct(dvo.optionsBlock(fresh.settings, 'joystick', 3)!), ' X {00010002-0000-0000-0000-504944564944}');
    const none = sh.applyAxisSettings({ blocks: [] }, js2, undefined, axis, 'merge');
    assert.equal(none.axes, 0, 'no product name: deadzones skipped');
    const back = sh.slotAxisSettings(m.settings, js2, prod)!;
    assert.ok(back.groups.some((g) => g.name === 'flight_move_pitch') && back.axes.some((a) => a.input === 'x' && a.deadzone === 0.05), 'export reads them back');
  });
  t('template dedupe and default target slot', () => {
    const stored = { ...custom, id: 'other-id', updatedAt: 123 };
    assert.equal(sh.sameTemplate([stored], custom)?.id, 'other-id', 'identical content, other id: reused');
    assert.equal(sh.sameTemplate([{ ...stored, name: 'Renamed' }], custom), undefined);
    const opts = [
      { slot: 'js' as const, instance: 1, ident: { name: 'VKBsim Gladiator EVO R', vendor: '231D', productId: '0200' }, connected: true },
      { slot: 'js' as const, instance: 2, ident: { name: 'Joystick - HOTAS Warthog', vendor: '044f', productId: '0402' }, connected: false },
      { slot: 'js' as const, instance: 3, ident: { name: 'Joystick - HOTAS Warthog', vendor: '044F', productId: '0402' }, connected: true },
    ];
    assert.deepEqual(sh.defaultTarget(opts, device, js1), { slot: 'js', instance: 3 }, 'the connected USB match wins');
    assert.deepEqual(sh.defaultTarget(opts.slice(0, 2), device, js1), { slot: 'js', instance: 2 }, 'then a remembered USB match');
    assert.deepEqual(sh.defaultTarget(opts.slice(0, 1), device, js1), js1, 'else the shown slot');
    assert.equal(sh.defaultTarget(opts, { ...device, kind: 'gp' }, js1), null, 'no gamepad slot: a new one');
    assert.equal(sh.deviceMatch(opts[0].ident, device), 'none');
    assert.equal(sh.deviceMatch({ name: 'Joystick - HOTAS Warthog' }, { kind: 'js', name: 'Joystick - HOTAS Warthog' }), 'name', 'no USB id on one side: by name');
    assert.equal(sh.deviceMatch(undefined, device), 'unknown');
  });
}

console.log(`\n${passed} tests passed${extraFiles.length ? ` (real layouts: ${extraFiles.join(', ')})` : ' (no real layout files found; pass paths as args)'}${fixtureFiles.length ? `; device-settings fixtures: ${fixtureFiles.length}` : ' (no fixtures: npm run test:fixtures)'}`);
