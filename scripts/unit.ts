// Unit tests: input-name mapping, editing, export structure and import -> export -> import round-trips.
// Usage: npm run test:unit -- [game-exported layout files...]   (or SC_TEST_LAYOUTS=a.xml,b.xml)
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
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
      assert.equal(p2.optionsXml!.length >= p1.optionsXml!.length, true, 'device options preserved');
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
console.log(`\n${passed} tests passed${extraFiles.length ? ` (real layouts: ${extraFiles.join(', ')})` : ' (no real layout files found; pass paths as args)'}`);
