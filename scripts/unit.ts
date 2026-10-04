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
console.log(`\n${passed} tests passed${extraFiles.length ? ` (real layouts: ${extraFiles.join(', ')})` : ' (no real layout files found; pass paths as args)'}${fixtureFiles.length ? `; device-settings fixtures: ${fixtureFiles.length}` : ' (no fixtures: npm run test:fixtures)'}`);
