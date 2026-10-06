// End-to-end test + screenshots. Usage: node scripts/e2e.mjs [url]
// Controllers are simulated by replacing navigator.getGamepads() (a headless browser has no real HID devices).
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
const url = process.argv[2] ?? 'http://localhost:4173/';
const shots = new URL('../screenshots/', import.meta.url).pathname;
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1680, height: 1000 }, deviceScaleFactor: 1, acceptDownloads: true });
const page = await ctx.newPage();
const errors = [];
const failures = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const log = (...a) => console.log('•', ...a);
const check = (ok, msg) => { console.log(ok ? '  ✓' : '  ✗', msg); if (!ok) failures.push(msg); };

// ---- Gamepad API mock, modelled on Chrome's real behaviour:
//  * navigator.getGamepads() returns [null, null, null, null] until a button is pressed on some controller (user gesture);
//    gamepadconnected is NOT dispatched, so the app must poll;
//  * every call returns fresh snapshot objects (a kept reference never updates);
//  * right after a device is revealed its axes read 0 for a moment before the first real report;
//  * HOTAS sticks have no standard mapping, 32 buttons (Chromium's cap) and the hat as axis 9 resting at 9/7.
await page.addInitScript(() => {
  const btns = (n) => Array.from({ length: n }, () => ({ pressed: false, touched: false, value: 0 }));
  const pads = [
    { index: 0, id: 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)', mapping: 'standard', connected: true, buttons: btns(17), axes: [0, 0, 0, 0], timestamp: 0 },
    { index: 1, id: 'VKBsim Gladiator EVO R (Vendor: 231d Product: 0200)', mapping: '', connected: true, buttons: btns(32), axes: [0, 0, 0, 0, 0, 0, 0, 0, 0, 9 / 7], timestamp: 0 },
    { index: 2, id: 'VKBsim Gladiator EVO L (Vendor: 231d Product: 3201)', mapping: '', connected: true, buttons: btns(32), axes: [0, 0, -1, 0, 0, 0, 0, 0, 0, 9 / 7], timestamp: 0 },
  ];
  let revealedAt = 0;
  const copy = (p) => {
    const fresh = performance.now() - revealedAt < 80;
    return Object.freeze({ ...p, axes: Object.freeze(p.axes.map((v) => (fresh ? 0 : v))), buttons: Object.freeze(p.buttons.map((b) => Object.freeze({ ...b }))) });
  };
  window.__pads = pads;
  window.__btn = (i, b, on) => { pads[i].buttons[b] = { pressed: on, touched: on, value: on ? 1 : 0 }; pads[i].timestamp++; if (on && !revealedAt) revealedAt = performance.now(); };
  window.__axis = (i, a, v) => { pads[i].axes[a] = v; pads[i].timestamp++; };
  window.__hide = () => { revealedAt = 0; };
  navigator.getGamepads = () => [0, 1, 2, 3].map((i) => (revealedAt && pads[i] ? copy(pads[i]) : null));
});

await page.goto(url, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
log('title:', await page.title());
log('header stats:', (await page.locator('header').first().innerText()).split('\n').slice(0, 12).join(' | '));
await page.screenshot({ path: shots + '01-defaults-list.png' });

const search = page.getByTestId('search');
const rows = page.locator('#main .row-cv');
for (const q of ['quantum', 'mining', 'lalt+n', 'key:f', 'mouse2', 'qntm']) {
  await search.fill(q);
  await page.waitForTimeout(250);
  const n = await rows.count();
  const first = await rows.first().innerText().catch(() => '');
  log(`search "${q}": ${n} rows; first: ${first.split('\n').slice(0, 2).join(' / ')}`);
  if (q === 'mining') await page.screenshot({ path: shots + '02-search-mining.png' });
}
await search.fill('');

// Import via the real file input (same path as the Import XML button)
await page.locator('input[type=file]').setInputFiles('public/samples/actionmaps.xml');
await page.waitForTimeout(500);
log('toast:', await page.locator('.fixed.bottom-5').innerText().catch(() => 'none'));
log('stats after import:', await page.getByTestId('list-stats').innerText());
check(await page.getByTestId('app-title').isVisible() && await page.locator('[data-view-tab]').count() === 4, 'title row with the four view tabs under it');
check(await page.getByTestId('section-view').isVisible() && await page.getByTestId('section-filters').isVisible(), 'List toolbar has labelled View and Filters sections');
check(await page.getByTestId('section-view').locator('[data-device-filter]').count() === 4, 'four input-type icon toggles in the View section');
check(await page.getByTestId('section-filters').getByTestId('filter-unbound').isVisible() && await page.getByTestId('section-filters').getByTestId('filter-custom').isVisible() && await page.getByTestId('section-filters').getByTestId('filter-conflicts').isVisible(), 'Show unbound / Customized only / Conflicts only in the Filters section');
check(await page.locator('body').evaluate((b) => !/[\u{1F300}-\u{1FAFF}\u2328\u26A0\u2699\u270E\u21E7\u21E9]/u.test(b.innerText)), 'no emoji icons on the page');
await page.screenshot({ path: shots + '03-imported-profile.png' });
await page.getByRole('button', { name: 'Customized only' }).click();
await page.waitForTimeout(250);
log('customized-only rows:', await rows.count());
await page.screenshot({ path: shots + '04-customized-only.png' });
await page.getByRole('button', { name: 'Customized only' }).click();
await page.locator('[data-device-filter=joystick]').dblclick();
await page.waitForTimeout(250);
log('joystick-only rows:', await rows.count());
await page.locator('[data-device-filter=joystick]').dblclick();
await page.locator('[data-view-tab=keyboard]').click();
await page.waitForTimeout(300);
await page.locator('button[title^="V:"]').first().hover();
await page.waitForTimeout(200);
await page.screenshot({ path: shots + '05-keyboard-view.png' });
await page.locator('[data-view-tab=conflicts]').click();
await page.waitForTimeout(300);
log('conflict cards:', await page.locator('#main .hud-panel.border-l-2').count());
await page.screenshot({ path: shots + '06-conflicts.png' });
await page.locator('[data-view-tab=list]').click();

// ===================== exact-input search from a binding chip =====================
console.log('\nexact input search');
await search.fill('');
await page.waitForTimeout(250);
await page.locator('#main button[title*="find everything"]', { hasText: 'JS2' }).filter({ hasText: /Btn 4(?!\d)/ }).first().click();
await page.waitForTimeout(300);
check((await search.inputValue()) === 'key:js2_button4', `clicking a JS2 Btn 4 chip searches the exact input (${await search.inputValue()})`);
let texts = await rows.allInnerTexts();
check(texts.length > 0 && texts.every((x) => /JS2\s*Btn 4(?!\d)/.test(x)), `every result has js2_button4 (${texts.length} rows)`);
check(!texts.some((x) => /JS1\s*Btn 4(?!\d)/.test(x) && !/JS2\s*Btn 4(?!\d)/.test(x)), 'js1_button4 actions are not included');
await search.fill('js1 btn4');
await page.waitForTimeout(300);
texts = await rows.allInnerTexts();
check(texts.length > 0 && texts.every((x) => /JS1\s*Btn 4(?!\d)/.test(x)), `typed "js1 btn4" is exact (${texts.length} rows)`);
await search.fill('');

// ===================== game slots & controllers modal + live input tester =====================
console.log('\ngame slots & controllers');
check(await page.getByTestId('edit-toggle').isVisible() && await page.locator('header').getByText(/Controllers/).count() === 0, 'no Controllers button in the header; Edit lives in the List toolbar');
await page.getByTestId('open-slots').click();
const panel = page.getByTestId('controllers-panel');
check(await panel.isVisible(), 'controllers modal opens from the sidebar "Game slots & controllers" button');
const slotRow = (id) => panel.locator(`[data-testid=slot-row][data-slot="${id}"]`);
check((await slotRow('js2').innerText()).includes('VKBsim Gladiator EVO L'), 'slots declared in the imported profile are listed (js2 = EVO L)');
await panel.getByTestId('tab-tester').click();
check(await page.getByTestId('tester-empty').isVisible(), 'no devices yet: "Press any button on your controller to wake it up"');
await page.screenshot({ path: shots + '13-controllers-wake-prompt.png' });
await page.evaluate(() => window.__btn(1, 2, true)); // the waking press
await page.waitForTimeout(120);
await page.evaluate(() => window.__btn(1, 2, false));
await page.waitForTimeout(500);
check(await page.getByTestId('tester-device').count() === 3, 'all three controllers appear after one button press (no gamepadconnected event)');
check(await panel.getByTestId('chromium-banner').isVisible(), 'Chromium banner in the controllers modal (headless Chrome)');
check(/at most 4 controllers/i.test(await panel.getByTestId('chromium-banner').innerText()) && /32 buttons \/ 16 axes/.test(await panel.getByTestId('chromium-banner').innerText()), 'banner explains the 4-device / 32-button / 16-axis limits and recommends Firefox');
await page.screenshot({ path: shots + '19-chromium-banner.png' });
const rCard = page.getByTestId('tester-device').filter({ hasText: 'EVO R' });
await page.evaluate(() => window.__btn(1, 11, true));
await page.waitForTimeout(250);
check((await rCard.getByTestId('tester-last').innerText()).includes('js1_button12'), 'tester shows the SC input for a press (js1_button12)');
await page.evaluate(() => { window.__axis(1, 9, -1); window.__axis(2, 2, 0.4); window.__axis(1, 0, 0.6); });
await page.waitForTimeout(250);
await rCard.scrollIntoViewIfNeeded();
await page.screenshot({ path: shots + '14-input-tester.png' });
await page.evaluate(() => { window.__btn(1, 11, false); window.__axis(1, 0, 0); });
await page.waitForTimeout(150);
check((await rCard.getByTestId('tester-last').innerText()).includes('js1_hat1_up'), 'tester shows hat input (js1_hat1_up)');
await page.evaluate(() => { window.__axis(1, 9, 9 / 7); window.__axis(2, 2, -1); });
await panel.getByTestId('tab-slots').click();
await page.waitForTimeout(300);
check(await panel.getByTestId('hw-row').count() === 3, 'detected-by-this-browser lists the three controllers');
check((await slotRow('js1').innerText()).includes('matched on import (USB id)') && (await slotRow('js2').innerText()).includes('matched on import (USB id)'), 'both VKB sticks matched to their slots by USB id');
check(await slotRow('js1').getByTestId('slot-connected').isVisible(), 'js1 shows connected');
const hwText = async (id) => slotRow(id).getByTestId('slot-hw').evaluate((s) => s.options[s.selectedIndex]?.text ?? '');
// pick by pressing: arm, press a button on another controller, the slot takes that hardware
await slotRow('js1').getByTestId('slot-pick-press').click();
check(await slotRow('js1').getByTestId('slot-pick-armed').isVisible(), 'pick by pressing arms the js1 row');
await page.screenshot({ path: shots + '15-pick-by-pressing.png' });
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
check(await slotRow('js1').getByTestId('slot-pick-armed').count() === 0 && await panel.isVisible(), 'Esc cancels listening and keeps the modal open');
await slotRow('js1').getByTestId('slot-pick-press').click();
await page.evaluate(() => window.__btn(2, 5, true));
await page.waitForTimeout(200);
await page.evaluate(() => window.__btn(2, 5, false));
await page.waitForTimeout(300);
check((await hwText('js1')).includes('EVO L') && await slotRow('js1').getByTestId('slot-pick-armed').count() === 0, `pressing a button on EVO L assigns it to js1 (${await hwText('js1')})`);
for (const [id, pad] of [['js1', 1], ['js2', 2]]) { // put both back by pressing
  await slotRow(id).getByTestId('slot-pick-press').click();
  await page.evaluate((i) => window.__btn(i, 5, true), pad);
  await page.waitForTimeout(200);
  await page.evaluate((i) => window.__btn(i, 5, false), pad);
  await page.waitForTimeout(300);
}
check((await hwText('js1')).includes('EVO R') && (await hwText('js2')).includes('EVO L'), `picked back by pressing: js1 ${await hwText('js1')} · js2 ${await hwText('js2')}`);
await panel.evaluate((el) => el.scrollTo(0, 0));
await page.screenshot({ path: shots + '15-controllers-panel.png' });
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
check(await panel.count() === 0, 'Esc closes the controllers modal');

// ===================== device settings: invert / exponent / curve / deadzone =====================
console.log('\ndevice settings & curve editor');
await page.getByTestId('open-slots').click();
check(await panel.getByTestId('tab-settings').count() === 0 && await panel.getByTestId('tab-tester').count() === 1, 'controllers modal: no Axis settings tab any more (Game slots + Input tester)');
await page.keyboard.press('Escape');
check(await page.getByTestId('open-curves').count() === 0, 'no "Axis settings & curves" link under the profile card');
await page.locator('[data-view-tab=devices]').click();
await page.waitForTimeout(600);
const pickChip = async (id) => { await page.getByTestId('device-slot-strip').locator(`[data-slot-chip="${id}"]`).click(); await page.waitForTimeout(250); };
const axisModal = page.getByTestId('axis-settings-modal');
const ds = axisModal.getByTestId('device-settings');
const openAxis = async (id) => { await pickChip(id); await page.getByTestId('slot-axis-settings').click(); await page.waitForTimeout(250); };
const closeAxis = async () => { await axisModal.getByRole('button', { name: 'Close' }).first().click(); await page.waitForTimeout(150); };
await openAxis('js1');
check(await axisModal.isVisible() && (await ds.getAttribute('data-instance')) === 'js1' && /EVO R/.test(await axisModal.innerText()), 'Axis settings & curves opens from the js1 slot in the Devices view, scoped to js1 (EVO R)');
check(await ds.locator('[data-testid^=settings-js]').count() === 0, 'only that device: no joystick tabs in the editor');
const grp = (n) => ds.locator(`[data-testid=settings-groups] button[data-group="${n}"]`);
check((await grp('flight_move_yaw').innerText()).includes('exp 1.3000001'), 'imported js1 flight_move_yaw exponent shown');
await closeAxis();
check(await axisModal.count() === 0, 'Close closes it');
await openAxis('js2');
check((await ds.getAttribute('data-instance')) === 'js2' && /EVO L/.test(await axisModal.innerText()), 'the js2 slot opens js2 (EVO L)');
check((await grp('flight_move_strafe_vertical').innerText()).includes('curve 4pt') && (await grp('flight_move_strafe_vertical').innerText()).includes('inverted'), 'imported js2 strafe vertical invert + 4-point curve shown');
check((await ds.getByLabel('saturation x').count()) === 1, 'axis table shown for js2');
await page.keyboard.press('Escape');
await page.waitForTimeout(150);
check(await axisModal.count() === 0, 'Esc closes the axis settings');
await openAxis('js1');
check((await ds.getByLabel('saturation x').inputValue()) === '0.94050002', 'imported EVO R x saturation shown');
await grp('flight_move_pitch').click();
const ge = ds.getByTestId('group-editor');
await ge.getByLabel('Invert').selectOption('1');
await ge.getByRole('radio', { name: 'exponent' }).click();
await ge.getByLabel('Exponent', { exact: true }).fill('2.5');
await ge.getByLabel('Exponent', { exact: true }).press('Enter');
await page.waitForTimeout(150);
check((await grp('flight_move_pitch').innerText()).includes('exp 2.5'), 'exponent 2.5 set on js1 pitch');
await grp('flight_move_yaw').click();
await ge.getByRole('radio', { name: 'custom curve' }).click();
await page.waitForTimeout(150);
check(await ge.getByTestId('curve-points').isVisible(), 'custom curve converts the exponent into editable points');
// drag the 5th point down on the chart
const chart = ge.getByTestId('curve-chart');
const pts = chart.locator('circle[data-pt]');
const npts = await pts.count();
if (npts) {
  const bb = await pts.nth(4).boundingBox();
  await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
  await page.mouse.down();
  await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2 + 40, { steps: 5 });
  await page.mouse.up();
}
check(npts >= 3, `curve points are draggable handles (${npts})`);
await page.screenshot({ path: shots + '112-axis-settings-from-slot.png' });
await ds.getByLabel('deadzone x').fill('0.05');
await ds.getByLabel('deadzone x').press('Enter');
await ge.getByLabel('Preview axis').selectOption('x');
await page.evaluate(() => window.__axis(1, 0, 0.6));
await page.waitForTimeout(300);
check(await ge.getByTestId('curve-live').count() === 1, 'live axis position drawn on the curve');
await ds.screenshot({ path: shots + '20-curve-editor.png' });
// sliders + precise fields, clamped to the documented ranges, with a live axis bar per axis
console.log('\naxis sliders');
check((await ds.getByLabel('x deadzone slider', { exact: true }).inputValue()) === '0.05', 'deadzone slider follows the typed value (0.05)');
check((await ds.getByLabel('x deadzone slider', { exact: true }).getAttribute('max')) === '0.5' && (await ds.getByLabel('x saturation slider', { exact: true }).getAttribute('min')) === '0.5', 'slider limits: deadzone 0–0.5, saturation 0.5–1');
check((await ds.getByLabel('slider2 deadzone slider', { exact: true }).getAttribute('data-unset')) === '1', 'unset value shows as greyed-out default');
await ds.getByLabel('y deadzone slider', { exact: true }).fill('0.1');
await page.waitForTimeout(150);
check((await ds.getByLabel('deadzone y').inputValue()) === '0.1', 'moving the y deadzone slider fills the number field (0.1)');
check((await ds.locator('tr[data-axis="y"]').innerText()).includes('≈10.1%'), 'in-game percentage shown (0.1 / 0.0099 ≈ 10.1 %)');
await ds.getByLabel('deadzone y').fill('0.9');
await ds.getByLabel('deadzone y').press('Enter');
await page.waitForTimeout(150);
check((await ds.getByLabel('deadzone y').inputValue()) === '0.5', 'typed 0.9 clamped to the 0.5 maximum');
const bar = ds.locator('tr[data-axis="x"] [data-testid=axis-bar]');
check((await bar.getAttribute('data-raw')) === '0.600' && Number(await bar.getAttribute('data-out')) > 0.6, `live axis bar: raw 0.6 -> output ${await bar.getAttribute('data-out')} after deadzone/saturation`);
await ds.locator('tr[data-axis="y"] td').first().click();
check((await ge.getByLabel('Preview axis').inputValue()) === 'y', 'clicking an axis row previews it on the curve');
check((await ge.getByTestId('curve-points').locator('input[type=range]').count()) >= 3, 'curve points have output sliders');
const ptSlider = ge.getByLabel('point 2 out slider');
await ptSlider.fill('0.05');
await page.waitForTimeout(150);
check((await ge.getByLabel('point 2 out', { exact: true }).inputValue()) === '0.05', 'curve point slider updates the point (and the chart)');
await ds.getByTestId('ranges-info').locator('summary').click();
check(/conservative/.test(await ds.getByTestId('ranges-info').innerText()) && /0\.0099/.test(await ds.getByTestId('ranges-info').innerText()), 'value ranges panel lists confirmed vs conservative limits and the 0.0099 grid');
await ge.getByLabel('Preview axis').selectOption('x');
await page.waitForTimeout(150);
await ds.locator('tr[data-axis="x"]').scrollIntoViewIfNeeded();
await ds.screenshot({ path: shots + '23-axis-sliders.png' });
await page.evaluate(() => window.__axis(1, 0, 0));
await closeAxis();
await page.locator('[data-view-tab=list]').click();
await page.waitForTimeout(200);
await page.getByTestId('profile-export').click();
{
  const [d] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-download').click()]);
  const f = '/tmp/settings-' + d.suggestedFilename();
  await d.saveAs(f);
  const x = readFileSync(f, 'utf8');
  check(/<flight_move_pitch invert="1" exponent="2.5"\/>/.test(x), 'export: <flight_move_pitch invert="1" exponent="2.5"/>');
  check(/<flight_move_yaw>\s*<nonlinearity_curve>\s*(<point in="[\d.]+" out="[\d.]+"\/>\s*){3,}<\/nonlinearity_curve>\s*<\/flight_move_yaw>/.test(x), 'export: flight_move_yaw custom <nonlinearity_curve> points');
  check(/<flight_move_strafe_vertical invert="1">\s*<nonlinearity_curve>/.test(x), 'export: untouched js2 curve kept');
  check((x.match(/<option input="x" saturation="0.94050002"\/>/g) ?? []).length === 2 && x.includes('<option input="x" deadzone="0.05"/>'), 'export: deadzone added, saturation still written twice');
  check(x.includes('<option input="y" deadzone="0.5"/>'), 'export: slider-set y deadzone (clamped 0.5) written');
  await page.keyboard.press('Escape');
  await page.getByTestId('export-dialog').click({ position: { x: 5, y: 5 } }).catch(() => {});
  await page.waitForTimeout(150);
}

// ===================== find by pressing =====================
console.log('\nfind by pressing');
await search.fill('');
await page.getByTestId('press-search').click();
await page.waitForTimeout(400);
check(await page.getByTestId('press-bar').isVisible(), 'press bar shown');
check(await page.getByTestId('press-bar').getByTestId('chromium-banner').isVisible(), 'compact Chromium banner in the press bar');
await page.evaluate(() => window.__btn(2, 3, true));
await page.waitForTimeout(150);
await page.evaluate(() => window.__btn(2, 3, false));
await page.waitForTimeout(300);
const chip = page.getByTestId('press-chip');
check(await chip.isVisible() && (await chip.innerText()).includes('js2_button4'), `pressing EVO L button 4 -> chip js2_button4 (${await chip.innerText().catch(() => '')})`);
check(!(await page.getByTestId('press-search').getAttribute('aria-pressed') === 'true'), 'listening stops after one input');
texts = await rows.allInnerTexts();
check(texts.length > 0 && texts.every((x) => /JS2\s*Btn 4(?!\d)/.test(x)), `every result is bound to js2_button4 (${texts.length} rows)`);
await page.screenshot({ path: shots + '16-press-to-search.png' });
await search.fill('fire');
await page.waitForTimeout(250);
const refined = await rows.count();
check(refined <= texts.length, `typing refines within the chip (${refined} rows)`);
await search.fill('');
await chip.getByRole('button', { name: 'Remove input filter' }).click();
check(!(await chip.isVisible()), 'chip removable');
await page.getByTestId('press-search').click();
await page.keyboard.press('Alt+N');
await page.waitForTimeout(300);
check((await chip.innerText()).includes('kb1_lalt+n'), `keyboard Alt+N -> kb1_lalt+n (${await chip.innerText().catch(() => '')})`);
texts = await rows.allInnerTexts();
check(texts.length > 0, `Alt+N finds ${texts.length} action(s)`);
await search.press('Backspace');
await search.focus();
await page.keyboard.press('Backspace');
check(!(await chip.isVisible()), 'Backspace in an empty search removes the chip');
await page.getByTestId('press-search').click();
await page.getByTestId('press-mouse-pad').click({ button: 'middle' });
await page.waitForTimeout(250);
check((await chip.innerText()).includes('mo1_mouse3'), 'mouse button via the pad -> mo1_mouse3');
await chip.getByRole('button', { name: 'Remove input filter' }).click();
await page.getByTestId('press-search').click();
await page.waitForTimeout(400);
await page.evaluate(() => window.__axis(1, 9, -1));
await page.waitForTimeout(250);
await page.evaluate(() => window.__axis(1, 9, 9 / 7));
check((await chip.innerText()).includes('js1_hat1_up'), 'hat -> js1_hat1_up');
await chip.getByRole('button', { name: 'Remove input filter' }).click();

// ===================== passive highlight =====================
console.log('\npassive highlight');
await page.locator('body').click({ position: { x: 900, y: 990 } }).catch(() => {});
await page.evaluate(() => document.activeElement?.blur());
await page.evaluate(() => window.__btn(2, 3, true));
await page.waitForTimeout(120);
await page.evaluate(() => window.__btn(2, 3, false));
await page.waitForTimeout(500);
const badge = page.getByTestId('flash-badge');
check(await badge.isVisible() && (await badge.innerText()).includes('js2_button4'), `pressing a button highlights its bindings (${await badge.innerText().catch(() => '')})`);
const flashed = await page.locator('#main [data-flash="1"]').allInnerTexts();
check(flashed.length > 0 && flashed.every((x) => /JS2\s*Btn 4(?!\d)/.test(x)), `only js2_button4 chips flash (${flashed.length})`);
check(await page.locator('#main [data-flash-row="1"]').count() > 0, 'matching rows flash');
await page.waitForTimeout(500);
await page.screenshot({ path: shots + '17-highlight.png' });
await page.waitForTimeout(2800);
check(!(await badge.isVisible()), 'highlight fades after a moment');
await page.locator('[data-view-tab=keyboard]').click();
await page.waitForTimeout(300);
await page.keyboard.press('KeyN');
await page.waitForTimeout(300);
check(await page.locator('#main [data-flash="1"]').count() > 0, 'keyboard view: pressing N lights the key');
await page.screenshot({ path: shots + '18-highlight-keyboard.png' });
await page.locator('[data-view-tab=list]').click();
await page.waitForTimeout(2800);
await search.focus();
await page.keyboard.press('ArrowDown');
await page.waitForTimeout(250);
check(!(await badge.isVisible()), 'no highlight while typing in the search box');
await page.evaluate(() => document.activeElement?.blur());
await search.fill('quantum');
await page.evaluate(() => document.activeElement?.blur());
await page.evaluate(() => window.__btn(2, 3, true));
await page.waitForTimeout(120);
await page.evaluate(() => window.__btn(2, 3, false));
await page.waitForTimeout(300);
check(!(await badge.isVisible()), 'no highlight while a search is active');
await search.fill('');
const toggleHighlight = async () => {
  await page.getByTestId('open-settings').click();
  await page.getByTestId('setting-highlight').click();
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  check(await page.getByTestId('settings-modal').count() === 0, 'Esc closes Settings');
};
await toggleHighlight();
await page.evaluate(() => document.activeElement?.blur());
await page.keyboard.press('KeyN');
await page.waitForTimeout(300);
check(!(await badge.isVisible()), 'toggle turns highlighting off');
await toggleHighlight();

// ===================== editing (starting from the game defaults) =====================
console.log('\nbinding editor');
await page.locator('#profile').selectOption('');
await page.getByTestId('edit-toggle').click();
check(await page.getByTestId('edit-bar').isVisible(), 'edit mode bar visible');
await page.evaluate(() => document.activeElement?.blur());
await page.keyboard.press('KeyN');
await page.waitForTimeout(300);
check(!(await page.getByTestId('flash-badge').isVisible()), 'no highlight in edit mode');
const dialog = page.getByTestId('capture-dialog');
const review = page.getByTestId('capture-review');
const rowFor = async (q, label) => {
  await search.fill(q);
  await page.waitForTimeout(300);
  return rows.filter({ hasText: label }).first();
};
const addIn = async (row, device) => row.getByRole('button', { name: `Add ${device} binding` }).click();
const chipsOf = async (row) => (await row.innerText()).replace(/\s+/g, ' ');
const settle = async (choice = 'Keep both') => {
  await page.waitForTimeout(250);
  if (await review.isVisible().catch(() => false)) {
    const txt = await review.innerText();
    log('   review:', txt.split('\n').slice(0, 4).join(' | '));
    const btn = review.getByRole('button', { name: choice === 'Replace' ? /Replace/ : choice });
    if (await btn.count()) await btn.first().click(); else await review.getByRole('button', { name: 'Apply' }).click();
  }
  await page.waitForTimeout(250);
};

// 1. keyboard combo
let row = await rowFor('engage quantum drive', 'Engage Quantum Drive');
await addIn(row, 'keyboard');
check(await dialog.isVisible(), 'capture dialog opens in listening state');
await page.keyboard.down('Alt');
await page.waitForTimeout(150);
check((await page.getByTestId('held-keys').innerText()).includes('L-Alt'), 'held modifier shown live (L-Alt + …)');
await page.screenshot({ path: shots + '07-editor-listening.png' });
await page.keyboard.press('KeyK');
await page.keyboard.up('Alt');
await settle();
check(!(await dialog.isVisible()), 'dialog closes after capture');
row = await rowFor('engage quantum drive', 'Engage Quantum Drive');
check((await chipsOf(row)).includes('L-Alt + K') || (await chipsOf(row)).includes('L-Alt+K') || /L-Alt\s*\+\s*K/.test(await row.innerText()), 'L-Alt + K bound to Engage Quantum Drive');
log('profile now:', await page.locator('#profile option:checked').innerText());
check((await page.locator('#profile option:checked').innerText()).startsWith('My layout'), 'first edit created "My layout" from the defaults');

// 2. conflict: N is Landing System in the same (ship) context
row = await rowFor('engage quantum drive', 'Engage Quantum Drive');
await addIn(row, 'keyboard');
await page.keyboard.press('KeyN');
await page.waitForTimeout(300);
check(await page.getByTestId('capture-conflict').isVisible(), 'conflict warning when capturing N (Engage Quantum Drive is a long press, like Autoland on N)');
log('   conflict:', (await page.getByTestId('capture-conflict').innerText()).split('\n').slice(0, 3).join(' | '));
check((await page.getByTestId('capture-conflict').innerText()).includes('Autoland'), 'conflict names Autoland (same context, same long-press mode; Landing System is a tap so it does not clash)');
await page.screenshot({ path: shots + '08-capture-conflict.png' });
await settle('Replace');
let auto = await rowFor('autoland', 'Autoland');
log('   autoland row after replace:', (await auto.innerText()).replace(/\s+/g, ' ').slice(0, 120));
check((await auto.innerText()).includes('cleared'), 'Replace removed N from Autoland (shows "cleared")');
await page.evaluate(() => document.activeElement?.blur()); // Ctrl+Z inside the search box is the browser's text undo
await page.keyboard.press('Control+z');
await page.waitForTimeout(300);
auto = await rowFor('autoland', 'Autoland');
check(!(await auto.innerText()).includes('cleared'), 'Ctrl+Z restored both actions');

// 3. mouse button
row = await rowFor('engage quantum drive', 'Engage Quantum Drive');
await addIn(row, 'mouse');
await page.getByTestId('mouse-pad').click({ button: 'middle' });
await settle();
row = await rowFor('engage quantum drive', 'Engage Quantum Drive');
check((await row.innerText()).includes('MMB'), 'middle mouse button captured (mouse3)');

// 4. gamepad button (commit on release) and a stick (axis vs direction)
row = await rowFor('engage quantum drive', 'Engage Quantum Drive');
await addIn(row, 'gamepad');
await page.waitForTimeout(200);
await page.evaluate(() => window.__btn(0, 4, true));
await page.waitForTimeout(150);
await page.evaluate(() => window.__btn(0, 0, true));
await page.waitForTimeout(150);
await page.evaluate(() => { window.__btn(0, 0, false); window.__btn(0, 4, false); });
await settle();
row = await rowFor('engage quantum drive', 'Engage Quantum Drive');
check(/LB\s*\+\s*A/.test(await row.innerText()), 'gamepad chord LB + A captured (gp1_shoulderl+a)');
await search.fill('quantum');
await page.waitForTimeout(300);
await rows.first().hover();
await page.screenshot({ path: shots + '12-edit-mode-list.png' });

// 5a. joystick woken by the press itself: controllers hidden again (like a fresh page), the first press must count
await page.evaluate(() => window.__hide());
row = await rowFor('yaw', 'Yaw');
await addIn(row, 'joystick');
await page.waitForTimeout(400);
check((await dialog.innerText()).includes('No joystick detected yet'), 'capture dialog prompts to wake the controller');
await page.getByTestId('toggle-tester').click();
await page.evaluate(() => window.__btn(2, 7, true));
await page.waitForTimeout(150);
await page.evaluate(() => window.__btn(2, 7, false));
await settle();
row = await rowFor('yaw', 'Yaw');
check(/JS2\s*Btn 8/.test(await row.innerText()), 'the press that woke the stick was captured (js2_button8)');

// 5. joystick: axis on the second stick, hat on the first
row = await rowFor('yaw', 'Yaw');
await addIn(row, 'joystick');

await page.waitForTimeout(500);
const devs = await page.getByTestId('device-list').innerText();
check(devs.includes('VKBsim Gladiator EVO R') && devs.includes('VKBsim Gladiator EVO L'), 'both sticks listed with names');
check(await dialog.getByTestId('chromium-banner').isVisible(), 'capture dialog shows the compact Chromium banner');
check(/32/.test(await dialog.innerText()), 'capture dialog mentions the 32-button cap');
await page.screenshot({ path: shots + '09-joystick-capture.png' });
await page.evaluate(() => window.__axis(2, 5, -0.9));
await settle();
await page.evaluate(() => window.__axis(2, 5, 0));
row = await rowFor('yaw', 'Yaw');
check(/JS2\s*Rot Z/.test(await row.innerText()), 'axis on stick #2 captured as js2_rotz');
row = await rowFor('yaw', 'Yaw');
await addIn(row, 'joystick');
await page.waitForTimeout(200);
await page.evaluate(() => window.__axis(1, 9, -1));
await settle();
await page.evaluate(() => window.__axis(1, 9, 9 / 7));
row = await rowFor('yaw', 'Yaw');
check(/JS1\s*Hat1 ↑/.test(await row.innerText()), 'hat up on stick #1 captured as js1_hat1_up');
// throttle resting at -1: a small wiggle is ignored, a real move registers
row = await rowFor('yaw', 'Yaw');
await addIn(row, 'joystick');
await page.waitForTimeout(200);
await page.evaluate(() => window.__axis(2, 2, -0.8));
await page.waitForTimeout(300);
check(await page.getByTestId('capture-dialog').isVisible() && !(await review.isVisible()), 'small throttle wiggle from its rest position ignored');
// 6. manual entry
await page.getByTestId('manual-input').fill('js1_button12');
await page.getByTestId('manual-input').press('Enter');
await settle();
await page.evaluate(() => window.__axis(2, 2, -1));
row = await rowFor('yaw', 'Yaw');
check(/JS1\s*Btn 12/.test(await row.innerText()), 'manual entry js1_button12 applied');

// 7. action editor: activation mode, reset, undo
await row.locator('button[title="Open the action editor"]').click();
const editor = page.getByTestId('action-editor');
check(await editor.isVisible(), 'action editor drawer opens');
await editor.getByTestId('editor-js').getByLabel('Activation mode').first().selectOption('double_tap');
await page.waitForTimeout(200);
await page.screenshot({ path: shots + '10-action-editor.png' });
await editor.getByRole('button', { name: /Reset to game default/ }).click();
await page.waitForTimeout(200);
check(!(await editor.innerText()).includes('overridden'), 'reset action restores the defaults');
await editor.getByRole('button', { name: /Undo last change/ }).click();
await page.waitForTimeout(200);
check((await editor.innerText()).includes('js1_button12'), 'per-action undo brings the edits back');
await editor.getByRole('button', { name: 'Close' }).first().click();

// 8. export, download, re-import
await search.fill('');
await page.getByTestId('profile-export').click();
const exp = page.getByTestId('export-dialog');
check(await exp.isVisible(), 'export dialog opens');
await page.getByTestId('export-name').fill('e2e-hosas');
await page.waitForTimeout(200);
await page.screenshot({ path: shots + '11-export-dialog.png' });
const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-download').click()]);
const file = '/tmp/' + dl.suggestedFilename();
await dl.saveAs(file);
const xml = readFileSync(file, 'utf8');
check(dl.suggestedFilename() === 'layout_e2e-hosas_exported.xml', `downloaded ${dl.suggestedFilename()}`);
check(xml.startsWith('<ActionMaps version="1" optionsVersion="2" rebindVersion="2" profileName="e2e-hosas">'), 'root element like the game writes');
for (const s of ['kb1_lalt+k', 'mo1_mouse3', 'gp1_shoulderl+a', 'js2_rotz', 'js1_hat1_up', 'js1_button12', '<joystick instance="2"/>', 'Product=" VKBsim Gladiator EVO L    {3201231D-0000-0000-0000-504944564944}"'])
  check(xml.includes(s), `export contains ${s}`);
const before = await page.locator('#profile option:checked').innerText();
await page.keyboard.press('Escape');
await page.locator('[data-testid=export-dialog]').click({ position: { x: 5, y: 5 } }).catch(() => {});
await page.waitForTimeout(200);
await page.locator('input[type=file]').setInputFiles(file);
await page.waitForTimeout(500);
const after = await page.locator('#profile option:checked').innerText();
log('re-imported:', after, '| edited:', before);
check(after.split('—')[1]?.trim() === before.split('—')[1]?.trim(), 're-imported export has the same number of rebinds');


// ===================== second keyboard slot (kb2), copy count, Escape on dialogs, profile delete =====================
console.log('\nkb2 slot & profile actions');
await search.fill('');
await page.getByTestId('open-slots').click();
await page.getByTestId('controllers-panel').locator('[data-add-slot=kb]').click();
await page.waitForTimeout(200);
check(await page.locator('[data-testid=slot-row][data-slot=kb2]').count() === 1, 'kb2 slot added from the modal');
await page.keyboard.press('Escape');
await page.waitForTimeout(150);
if (!(await page.getByTestId('edit-bar').isVisible())) await page.getByTestId('edit-toggle').click();
row = await rowFor('self destruct', 'Self Destruct');
await addIn(row, 'keyboard');
check(await page.getByTestId('capture-km-slot').isVisible(), 'capture dialog offers kb1 / kb2 when there are two keyboard slots');
await page.locator('[data-capture-slot=kb2]').click();
await page.evaluate(() => document.activeElement?.blur());
await page.keyboard.press('KeyJ');
await settle();
row = await rowFor('self destruct', 'Self Destruct');
check(/KB2[\s\S]*J/.test(await row.innerText()), `the capture went to kb2 (${(await row.innerText()).replace(/\s+/g, ' ').slice(0, 90)})`);
await search.fill('');
await page.getByTestId('edit-toggle').click();
await page.locator('[data-view-tab=keyboard]').click();
await page.waitForTimeout(300);
check(await page.getByTestId('km-slot-kb').isVisible(), 'Keyboard view gets a kb1 / kb2 picker in its View section');
await page.locator('[data-km-slot=kb2]').click();
await page.waitForTimeout(250);
await page.screenshot({ path: shots + '112-keyboard-kb-mo-picker.png' });
const boundKeys = async () => page.locator('#main button[title]').evaluateAll((bs) => bs.filter((b) => /: [1-9]\d* actions?$/.test(b.title)).map((b) => b.title));
const kb2Keys = (await boundKeys()).filter((t) => !/^(LMB|MMB|RMB|Wheel|Mouse|M\d)/.test(t)); // the mouse block follows the mouse slot (mo1)
check(kb2Keys.length === 1 && /^J:/.test(kb2Keys[0]), `kb2 keyboard shows only kb2 bindings (${kb2Keys.join(', ')})`);
await page.locator('[data-km-slot=kb1]').click();
await page.waitForTimeout(250);
check((await boundKeys()).length > 50, 'kb1 keyboard shows the kb1 bindings');
await page.locator('[data-view-tab=list]').click();
await page.getByTestId('open-slots').click();
const kb2Row = page.locator('[data-testid=slot-row][data-slot=kb2]');
check(/^Copy bindings\s*\(1 custom\)$/.test((await kb2Row.getByTestId('slot-copy').innerText()).trim()) && /1 custom binding \(ones you changed or added/.test(await kb2Row.getByTestId('slot-copy').getAttribute('title')), `copy button: "Copy bindings (1 custom)" with an explaining tooltip (${(await kb2Row.getByTestId('slot-copy').innerText()).trim()})`);
check(!/yours/.test(await page.getByTestId('controllers-panel').innerText()), 'no "yours" wording left in the slots modal');
await kb2Row.getByTestId('slot-copy').click();
check(await page.getByTestId('copy-bindings').isVisible() && /1 custom binding\b/.test(await page.getByTestId('copy-preview').innerText()) && !/yours/.test(await page.getByTestId('copy-bindings').innerText()), `copy dialog says "custom bindings" (${(await page.getByTestId('copy-preview').innerText()).split('.')[0]})`);
await page.keyboard.press('Escape');
await page.waitForTimeout(150);
check(await page.getByTestId('copy-bindings').count() === 0 && await page.getByTestId('controllers-panel').isVisible(), 'Esc closes the Copy dialog only');
await kb2Row.getByTestId('slot-remove').click();
check(await page.getByTestId('remove-slot-warning').isVisible(), 'removing kb2 (with a binding) asks first');
await page.keyboard.press('Escape');
await page.waitForTimeout(150);
check(await page.getByTestId('remove-slot-warning').count() === 0 && await page.getByTestId('controllers-panel').isVisible(), 'Esc closes the Remove dialog only');
await kb2Row.getByTestId('slot-remove').click();
await page.getByTestId('remove-confirm').click();
await page.waitForTimeout(200);
check(await page.locator('[data-testid=slot-row][data-slot=kb2]').count() === 0, 'kb2 removed');
await page.keyboard.press('Escape');
await page.waitForTimeout(150);
// profile delete: warns with the name and what is lost; the defaults can't be deleted
{
  const name = await page.locator('#profile option:checked').innerText();
  await page.getByTestId('profile-delete').click();
  const w = page.getByTestId('profile-delete-warning');
  check(await w.isVisible() && (await w.innerText()).includes(name.split(' — ')[0]) && /can't be undone|cannot be undone/i.test(await w.innerText()), `delete asks first, naming the profile (${name})`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  check(await w.count() === 0 && (await page.locator('#profile option:checked').innerText()) === name, 'Esc cancels: profile kept');
  const n0 = await page.locator('#profile option').count();
  await page.getByTestId('profile-delete').click();
  await page.getByTestId('profile-delete-confirm').click();
  await page.waitForTimeout(300);
  check((await page.locator('#profile option').count()) === n0 - 1 && !(await page.locator('#profile option').allInnerTexts()).includes(name), 'confirmed: the profile is gone');
  await page.locator('#profile').selectOption('');
  await page.waitForTimeout(200);
  check(await page.getByTestId('profile-delete').isDisabled(), 'the game defaults cannot be deleted');
}

// ===================== devices view =====================
console.log('\ndevices view');
await search.fill('');
{ // back to the sample profile (28 rebinds, with customized and conflicting joystick bindings)
  const o = (await page.locator('#profile option').allInnerTexts()).find((x) => x.startsWith('My bindings'));
  await page.locator('#profile').selectOption({ label: o });
  await page.waitForTimeout(300);
}
await page.locator('[data-view-tab=devices]').click();
const dv = page.getByTestId('device-view');
let gladIds = []; // callout ids of the VKB Gladiator template (for the test-only photo layout below)
await page.waitForTimeout(600);
check(await dv.isVisible(), 'devices view opens');
const slotChip = async (id) => { await page.getByTestId('device-slot-strip').locator(`[data-slot-chip="${id}"]`).click(); await page.waitForTimeout(200); };
const dopts = (await page.getByTestId('device-slot-strip').locator('[data-slot-chip]').allInnerTexts()).map((x) => x.replace(/\s+/g, ' ').trim());
check(dopts.some((o) => /^JS1 VKBsim Gladiator EVO R/.test(o)) && dopts.some((o) => /^JS2 VKBsim Gladiator EVO L/.test(o)) && dopts.some((o) => /^GP1/.test(o)), `inline slot strip lists the js/gp slots with their hardware (${dopts.join(' | ')})`);
check(!dopts.some((o) => /^(KB|MO)\d/.test(o)), 'no kb / mo slots in the Devices slot bar (they live in the Keyboard view)');
check(await page.getByTestId('device-manage-slots').count() === 0, 'no "Game slots & controllers…" link in the slot bar (the profile card button is the entry point)');
await slotChip('js1');
check(/VKBsim Gladiator EVO R/.test(await page.getByTestId('device-hardware').innerText()), 'slot bar shows the hardware assigned to js1');
await page.waitForTimeout(300);
{ // the template line: dropdown + icon groups (template tools | picture tools) on the same line, and the slot's axis settings CTA
  const bar = page.getByTestId('device-slot-bar');
  const line = bar.getByTestId('template-line');
  const tools = line.getByTestId('template-tools'), pic = line.getByTestId('picture-tools');
  const labels = await tools.locator('button').evaluateAll((bs) => bs.map((b) => b.getAttribute('aria-label')));
  const titlesOk = await line.locator('button').evaluateAll((bs) => bs.every((b) => b.title && b.title === b.getAttribute('aria-label') && !b.innerText.trim()));
  check(await line.getByTestId('template-select').isVisible() && labels.length === 4 && /Customize a copy|Edit this template/.test(labels[0]) && /^New/.test(labels[1]) && /^Import/.test(labels[2]) && /^Export/.test(labels[3]),
    `template group: Customize a copy, New, Import, Export as icon buttons next to the Template dropdown (${labels.join(' | ')})`);
  check(await pic.locator('button').count() === 2 && /PNG/.test(await pic.getByTestId('device-png').getAttribute('aria-label')) && /Print/.test(await pic.getByTestId('device-print').getAttribute('aria-label')), 'second group: PNG, Print');
  check(titlesOk, 'icon buttons: icon only, with a tooltip and the same accessible name');
  const [sb, tb, pb] = await Promise.all([line.getByTestId('template-select').boundingBox(), tools.boundingBox(), pic.boundingBox()]);
  check(Math.abs((sb.y + sb.height / 2) - (tb.y + tb.height / 2)) < 6 && Math.abs((tb.y + tb.height / 2) - (pb.y + pb.height / 2)) < 6 && pb.x - (tb.x + tb.width) >= 12, `dropdown and both groups on one line, the groups visibly apart (gap ${Math.round(pb.x - tb.x - tb.width)} px)`);
  check(await dv.getByTestId('device-slot-view').getByTestId('template-tools').count() === 1 && await bar.locator('[data-testid=template-tools]').count() === 1, 'no separate template button row any more');
  const cta = bar.getByTestId('slot-axis-settings');
  check(await cta.isEnabled() && /Axis settings & curves for js1/.test(await cta.getAttribute('aria-label')), 'js1: "Axis settings & curves" CTA in the slot bar, enabled');
  await page.screenshot({ path: shots + '112-devices-slot-bar.png' });
  await bar.screenshot({ path: shots + '112-devices-slot-bar-closeup.png' });
  await slotChip('gp1');
  check(await cta.isEnabled() && await bar.getByTestId('axis-locked').count() === 0, 'gp1: CTA enabled (the game keeps gamepad settings for gp1)');
  await cta.click();
  await page.waitForTimeout(250);
  const gm = page.getByTestId('axis-settings-modal');
  check((await gm.getByTestId('device-settings').getAttribute('data-instance')) === 'gp1' && await gm.getByTestId('axis-table').count() === 0 && await gm.locator('[data-group="fps_view_pitch"]').count() === 1,
    'gp1 axis settings use the gamepad option tree, without the joystick deadzone table');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  await slotChip('js1');
}
{ // copy dialog wording: custom bindings vs game defaults
  await page.getByTestId('open-slots').click();
  const r1 = page.locator('[data-testid=slot-row][data-slot=js1]');
  const btn = (await r1.getByTestId('slot-copy').innerText()).trim();
  check(/^Copy bindings\s*\(\d+ custom\)$/.test(btn), `js1 copy button: "${btn}"`);
  await r1.getByTestId('slot-copy').click();
  const prev = await page.getByTestId('copy-preview').innerText();
  check(/\d+ custom bindings? and \d+ game defaults? on js1/.test(prev), `copy dialog: "N custom bindings and M game defaults" (${prev.split('.')[0]})`);
  await page.getByTestId('copy-bindings').screenshot({ path: shots + '112-copy-dialog-wording.png' });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);
}
{ // the EVO R is a VKB Gladiator: its own drawing loads on demand; VKB numbering is configurable, so the callouts start unassigned
  await page.waitForTimeout(500);
  const st = await dv.getByTestId('device-status').innerText();
  const src = await dv.locator('[data-testid=device-canvas] img').first().getAttribute('src').catch(() => '');
  check(/VKB Gladiator/.test(st) && /name “Gladiator”/.test(st) && /^data:image\/svg\+xml|\/device-photos\/vkb-gladiator-scg-[a-z]+\.webp$/.test(src ?? ''), `Gladiator EVO R auto-links to the VKB Gladiator template, drawing / photos lazy-loaded (${st.split('\n')[0]})`);
  check(await dv.getByTestId('template-unassigned').isVisible() && /^A2 red button\s+no number yet/.test(await dv.locator('[data-callout="a2"]').innerText()), 'unassigned callouts flagged (“no number yet”) with an Assign numbers prompt');
  check(await dv.getByTestId('chromium-button-notice').isVisible() && /Firefox/.test(await dv.getByTestId('chromium-button-notice').innerText()), 'a 32-button device in Chrome shows the prominent Chromium button-limit notice with the Firefox advice');
  gladIds = await dv.locator('[data-callout]').evaluateAll((els) => els.map((e) => e.getAttribute('data-callout')));
  await dv.getByTestId('template-select').selectOption('builtin-stick');
  await page.waitForTimeout(300);
}
check(/Generic stick/.test(await dv.getByTestId('device-status').innerText()), 'generic stick picked for the profile tests');
const b1 = dv.locator('[data-callout="trig"]');
check((await b1.innerText()).includes('Engage Quantum Drive'), 'trigger (2-stage) callout shows the js1_button1 action of the profile');
check((await dv.locator('[data-callout]').count()) === 24 && /Deck buttons \(left\)/.test(await dv.locator('[data-callout="rowL"]').innerText()) && (await dv.locator('[data-callout="whl1"]').innerText()).includes('Lever wheel'), 'default stick: holographic grip + base with 24 callouts (grip, deck button rows, toggles, F keys, wheels)');
check((await dv.locator('[data-callout="b5"]').getAttribute('data-tone')) === 'custom' && (await dv.locator('[data-callout="b5"]').innerText()).includes('Cycle Master Mode'), 'customized js1_button5 (pinky) coloured as customized');
check((await dv.locator('[data-callout="b4"]').getAttribute('data-tone')) === 'conflict', 'conflicting js1_button4 coloured as conflict');
check(/Auto Targeting/.test(await dv.locator('[data-callout="hat1"] [data-dir="hat1_up"]').getAttribute('title')), 'hat drawn as a 5-way cross with an action per direction');
await page.evaluate(() => window.__btn(1, 0, true));
await page.waitForTimeout(250);
check((await b1.getAttribute('data-active')) === '1' && (await dv.locator('[data-region="trig"]').getAttribute('data-active')) === '1', 'pressing button 1 lights its callout and the trigger on the picture glows');
await page.evaluate(() => { window.__btn(1, 0, false); window.__axis(1, 9, -1); window.__axis(1, 0, 0.8); });
await page.waitForTimeout(250);
check((await b1.getAttribute('data-active')) === null, 'released: callout back to normal');
check((await dv.locator('[data-callout="hat1"] [data-dir="hat1_up"]').getAttribute('data-active')) === '1', 'hat up lights the up cell of the hat cross');
check((await dv.locator('[data-callout="xy"]').getAttribute('data-active')) === '1' && (await dv.locator('[data-axis-live="x"]').getAttribute('data-value')) === '0.80', 'moving X lights the stick callout and shows the live value');
await page.screenshot({ path: shots + '24-device-view.png' });
await page.evaluate(() => { window.__axis(1, 9, 9 / 7); window.__axis(1, 0, 0); });
check(/Autoland/.test(await dv.locator('[data-callout="hat1"] [data-dir="button12"]').getAttribute('title')), 'js1_button12 (Autoland) shown as the push of hat 1');
{ // the classic stick/throttle templates are gone; the gamepad template stays
  const names = await dv.getByTestId('template-select').locator('option').allInnerTexts();
  check(!names.some((n) => /classic/i.test(n)) && names.some((n) => /^Generic stick/.test(n)) && names.some((n) => /^Generic throttle/.test(n)) && names.some((n) => /^Gamepad/.test(n)),
    `template picker: no classic templates; default stick, throttle and gamepad listed (${names.filter((n) => !n.startsWith('Automatic')).join(' | ')})`);
}
{ // the default holographic throttle: 21 callouts; the keypad, E1 push and the left lever glow on input
  await dv.getByTestId('template-select').selectOption('builtin-throttle');
  await page.waitForTimeout(250);
  await page.evaluate(() => { window.__btn(1, 11, true); window.__btn(1, 19, true); window.__axis(1, 2, 0.6); });
  await page.waitForTimeout(250);
  const on = async (r) => (await dv.locator(`[data-region="${r}"]`).getAttribute('data-active')) === '1';
  check((await dv.locator('[data-callout]').count()) === 21 && await on('e1') && await on('lz') && (await dv.locator('[data-callout="e1"] [data-dir="button20"]').getAttribute('data-active')) === '1',
    'default throttle template: 21 callouts; encoder push and the left lever glow on the picture');
  const lit = await dv.locator('[data-region="keys"][data-active="1"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-input')));
  check(lit.length === 1 && lit[0] === 'button12' && (await dv.locator('[data-callout="trgL"]').innerText()).includes('Left trigger'), `keypad: only the pressed key glows (${lit.join(', ')}); left grip trigger has a callout`);
  await page.evaluate(() => { window.__btn(1, 11, false); window.__btn(1, 19, false); window.__axis(1, 2, 0); });
  await dv.getByTestId('template-select').selectOption('builtin-stick');
  await page.waitForTimeout(250);
}
{ // the default holographic gamepad: 15 callouts; pressing D-pad up lights only that arm, A / LT / the left stick glow
  await slotChip('gp1');
  await page.waitForTimeout(300);
  check(/Gamepad/.test(await dv.getByTestId('device-status').innerText()) && (await dv.locator('[data-callout]').count()) === 15 && (await dv.getByTestId('template-select').locator('option:checked').innerText()).startsWith('Automatic'),
    'gamepad: default holographic gamepad template applies automatically (15 callouts)');
  await page.evaluate(() => { window.__btn(0, 12, true); window.__btn(0, 0, true); window.__btn(0, 6, true); window.__axis(0, 0, 0.8); });
  await page.waitForTimeout(300);
  const lit = await dv.locator('[data-region][data-active="1"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-region') + (e.getAttribute('data-input') ? ':' + e.getAttribute('data-input') : '')).sort());
  check(JSON.stringify(lit) === JSON.stringify(['a', 'dpad:dpad_up', 'ls', 'lt']) && (await dv.locator('[data-callout="dpad"] [data-dir="dpad_up"]').getAttribute('data-active')) === '1',
    `gamepad: only the pressed D-pad arm glows; A, LT and the moved left stick light up (${lit.join(', ')})`);
  check(/triggerl_btn/.test(await dv.locator('[data-callout="lt"]').innerText()) && /thumbl/.test(await dv.locator('[data-callout="l3"]').innerText()), 'gamepad: callouts show the gp1_ input names (triggerl_btn, thumbl)');
  await page.setViewportSize({ width: 1680, height: 1400 }); // the whole canvas fits for the screenshot
  await dv.getByTestId('device-canvas').screenshot({ path: shots + '31-device-view-default-gamepad.png' });
  await page.setViewportSize({ width: 1680, height: 1000 });
  await page.evaluate(() => { window.__btn(0, 12, false); window.__btn(0, 0, false); window.__btn(0, 6, false); window.__axis(0, 0, 0); });
  await page.waitForTimeout(200);
  await slotChip('js1');
  await page.waitForTimeout(300);
}
await b1.click();
const ip = dv.getByTestId('input-panel');
check(await ip.isVisible() && (await ip.innerText()).includes('js1_button1'), 'clicking a callout opens the binding panel for js1_button1');
await ip.getByRole('button', { name: 'Edit' }).first().click();
check(await page.getByTestId('action-editor').isVisible(), 'Edit opens the action editor');
await page.getByTestId('action-editor').getByRole('button', { name: 'Close' }).first().click();
await page.waitForTimeout(150);
await dv.locator('[data-callout="b6"]').click();
await ip.getByLabel('Search actions to bind').fill('landing system');
await ip.getByTestId('bind-results').locator('button').first().click();
await page.waitForTimeout(300);
check((await dv.locator('[data-callout="b6"]').innerText()).includes('Landing System') && (await dv.locator('[data-callout="b6"]').getAttribute('data-tone')) === 'custom', 'binding an action from the panel puts it on js1_button6');
// search and find-by-press stay on the Devices view: they filter / select within it
await search.fill('landing system');
await page.waitForTimeout(400);
check(await dv.isVisible() && await rows.count() === 0, 'typing in the search on Devices stays on Devices (no jump to the List)');
check((await dv.locator('[data-callout="b6"]').getAttribute('data-dim')) === null && (await dv.locator('[data-callout="trig"]').getAttribute('data-dim')) === '1' && /match “landing system”/.test(await dv.getByTestId('device-search-status').innerText()),
  `search dims the callouts that don't match (${await dv.getByTestId('device-search-status').innerText().catch(() => '')})`);
await search.fill('');
await slotChip('js2');
await page.getByTestId('press-search').click();
await page.waitForTimeout(300);
await page.evaluate(() => window.__btn(1, 4, true));
await page.waitForTimeout(150);
await page.evaluate(() => window.__btn(1, 4, false));
await page.waitForTimeout(500);
check(await dv.isVisible() && await rows.count() === 0 && (await page.getByTestId('device-slot-view').getAttribute('data-slot')) === 'js1', 'find-by-press on Devices stays there and switches to the pressed device (js1)');
check((await dv.locator('[data-callout="b5"]').getAttribute('data-dim')) === null && (await dv.locator('[data-callout="trig"]').getAttribute('data-dim')) === '1' && /Pressed js1_button5/.test(await dv.getByTestId('device-search-status').innerText()), 'the pressed control is picked out, the rest dimmed');
await page.getByTestId('press-chip').getByRole('button', { name: 'Remove input filter' }).click();
await page.waitForTimeout(200);
{
  const [d] = await Promise.all([page.waitForEvent('download'), dv.getByTestId('device-png').click()]);
  const f = '/tmp/' + d.suggestedFilename();
  await d.saveAs(f);
  const buf = readFileSync(f);
  check(d.suggestedFilename().endsWith('.png') && buf.subarray(1, 4).toString() === 'PNG' && buf.length > 20000, `PNG export of the device with its mappings (${d.suggestedFilename()}, ${(buf.length / 1024) | 0} KB)`);
}

await dv.getByTestId('template-select').selectOption(''); // back to automatic (the Gladiator template) before creating one
await page.waitForTimeout(300);

// ===================== template editor =====================
console.log('\ntemplate editor');
await dv.getByTestId('template-new').click();
const te = page.getByTestId('template-editor');
const tplCount = () => te.getByTestId('tpl-callouts').locator('li').count();
check(await te.isVisible() && (await tplCount()) === 0, 'template editor opens with a blank canvas');
check(/matches VKBsim Gladiator EVO R/.test(await te.getByTestId('tpl-link').innerText()), 'new template pre-linked to the selected device (USB 231D:0200)');
await te.getByTestId('tpl-press').click();
await page.waitForTimeout(300);
const tap = async (fn, off) => { await page.evaluate(fn); await page.waitForTimeout(200); await page.evaluate(off); await page.waitForTimeout(200); };
await tap(() => window.__btn(1, 2, true), () => window.__btn(1, 2, false));
await tap(() => window.__axis(1, 9, -3 / 7), () => window.__axis(1, 9, 9 / 7));
await tap(() => window.__axis(1, 2, 0.9), () => window.__axis(1, 2, 0));
check((await tplCount()) === 3, `press to place: button 3, hat 1 and the Z axis added (${await tplCount()})`);
check(/Hat 1/.test(await te.getByTestId('tpl-callouts').innerText()) && /hat · H1↑ H1→ H1↓ H1←/.test(await te.getByTestId('tpl-callouts').innerText()), 'pushing the hat right adds a whole 5-way hat cluster');
await tap(() => window.__btn(1, 2, true), () => window.__btn(1, 2, false));
check((await tplCount()) === 3, 'pressing a placed control selects it instead of adding a duplicate');
await te.getByTestId('tpl-press').click();
await te.getByTestId('device-canvas').click({ position: { x: 300, y: 200 } });
await page.waitForTimeout(150);
check((await tplCount()) === 4 && (await te.getByTestId('callout-props').isVisible()), 'clicking the picture adds a callout (next free button)');
await te.getByLabel('Callout name').fill('Fire');
await page.waitForTimeout(100);
const lastBox = te.locator('[data-callout]').last();
check((await lastBox.innerText()).includes('Fire'), 'callout renamed');
{
  const anchor = te.locator('[data-anchor]').last();
  const s0 = await anchor.getAttribute('style');
  const ab = await anchor.boundingBox();
  await page.mouse.move(ab.x + ab.width / 2, ab.y + ab.height / 2);
  await page.mouse.down();
  await page.mouse.move(ab.x + 120, ab.y + 60, { steps: 6 });
  await page.mouse.up();
  const s1 = await anchor.getAttribute('style');
  const lb = await lastBox.boundingBox();
  const l0 = await lastBox.getAttribute('style');
  await page.mouse.move(lb.x + lb.width / 2, lb.y + lb.height / 2);
  await page.mouse.down();
  await page.mouse.move(lb.x + lb.width / 2 + 40, lb.y + 140, { steps: 6 });
  await page.mouse.up();
  const s2 = await anchor.getAttribute('style'), l1 = await lastBox.getAttribute('style');
  check(s0 !== s1 && s2 === s1 && l1 !== l0, `anchor and label dragged separately (${s0} -> ${s1} -> ${s2}; label ${l0} -> ${l1})`);
}
await te.getByLabel('Callout type', { exact: true }).selectOption('encoder');
check((await te.getByTestId('callout-props').innerText()).includes('Counter-clockwise'), 'callout type changed to encoder pair (two inputs)');
await te.getByTestId('tpl-undo').click();
check(!(await te.getByTestId('callout-props').innerText()).includes('Counter-clockwise'), 'undo restores the button type');
await te.getByTestId('callout-delete').click();
check((await tplCount()) === 3, 'callout deleted');
await page.keyboard.press('Control+z');
await page.waitForTimeout(100);
check((await tplCount()) === 4, 'Ctrl+Z brings it back');
{
  const b64 = await page.evaluate(() => {
    // a plain drawing of a stick (2400 x 1500, scaled down to 1600 px on upload)
    const c = document.createElement('canvas'); c.width = 2400; c.height = 1500;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(1200, 700, 100, 1200, 750, 1300); gr.addColorStop(0, '#1d2f44'); gr.addColorStop(1, '#070d16');
    g.fillStyle = gr; g.fillRect(0, 0, 2400, 1500);
    g.fillStyle = '#5d6b78'; g.strokeStyle = '#9fb2c4'; g.lineWidth = 8;
    g.beginPath(); g.roundRect(820, 1180, 760, 220, 50); g.fill(); g.stroke();
    g.beginPath(); g.roundRect(1150, 900, 100, 300, 20); g.fill(); g.stroke();
    g.beginPath(); g.ellipse(1200, 560, 240, 380, 0, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = '#26323e';
    for (const [x, y, r] of [[1110, 330, 46], [1290, 360, 34], [1200, 470, 30], [1080, 600, 28], [1320, 600, 28], [960, 1290, 34], [1440, 1290, 34]]) { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); g.stroke(); }
    return c.toDataURL('image/png').split(',')[1];
  });
  await te.getByTestId('tpl-upload-file').setInputFiles({ name: 'my-stick.png', mimeType: 'image/png', buffer: Buffer.from(b64, 'base64') });
  await page.waitForTimeout(800);
  const toastTxt = await page.locator('.fixed.bottom-5.right-5').innerText().catch(() => '');
  const src = await te.locator('[data-testid=device-canvas] img').getAttribute('src').catch(() => '');
  check(/Image loaded \(1600×1000/.test(toastTxt) && /^data:image\/(webp|jpeg|png)/.test(src ?? ''), `uploaded 2400×1500 PNG resized and stored (${toastTxt.split('\n')[0]})`);
}
await page.screenshot({ path: shots + '25-template-editor.png' });
await te.getByTestId('tpl-save').click();
await page.waitForTimeout(500);
check(await te.count() === 0, 'template saved, editor closed');
check(/linked to this device \(USB 231D:0200\)/.test(await dv.getByTestId('device-status').innerText()), 'saved template auto-applies to the EVO R by USB id');
check((await dv.locator('[data-callout]').count()) === 4 && (await dv.innerText()).includes('Decoy'), 'device view uses the new template (B3 shows its Decoy binding)');
{ // the 4-callout template has no callout for button 12, so that binding is listed beside the picture
  const ov = await dv.getByTestId('device-overflow').innerText();
  check((await dv.locator('[data-overflow="button12"]').count()) === 1 && /Autoland/.test(ov), `bound inputs without a callout listed beside the picture (${ov.replace(/\n/g, ' ').slice(0, 120)})`);
}
let exported;
{
  const [d] = await Promise.all([page.waitForEvent('download'), dv.getByTestId('template-export').click()]);
  const f = '/tmp/' + d.suggestedFilename();
  await d.saveAs(f);
  exported = JSON.parse(readFileSync(f, 'utf8'));
  const t0 = exported.templates?.[0];
  check(exported.format === 'sc-mapper-device-templates' && /^data:image\//.test(t0?.image) && t0.callouts.length === 4 && t0.match[0].vendor === '231D', `template exported as JSON with the image embedded (${d.suggestedFilename()}, ${(readFileSync(f).length / 1024) | 0} KB)`);
}
writeFileSync('/tmp/shared-template.json', JSON.stringify({ ...exported, templates: [{ ...exported.templates[0], id: 'shared-1', name: 'Shared stick', match: [{ name: 'Gladiator EVO L' }] }] }));
await dv.getByTestId('template-import-file').setInputFiles('/tmp/shared-template.json');
await page.waitForTimeout(500);
await slotChip('js2');
await page.waitForTimeout(300);
check(/Shared stick/.test(await dv.getByTestId('device-status').innerText()) && /name “Gladiator EVO L”/.test(await dv.getByTestId('device-status').innerText()), 'imported template auto-applies to the EVO L by name');
{ // a pick of a removed classic template saved by an earlier version: pick the throttle for JS2, then rewrite it to the old classic id
  await dv.getByTestId('template-select').selectOption('builtin-throttle');
  await page.waitForTimeout(200);
  await page.evaluate(() => {
    // template picks live in the profile's slot map (per hardware) since the game-slots rework
    const st = JSON.parse(localStorage.getItem('sc-mapper:slots:v1') ?? '{}');
    for (const m of Object.values(st.maps ?? st)) for (const k of Object.keys(m?.hwTemplates ?? {})) if (m.hwTemplates[k] === 'builtin-throttle') m.hwTemplates[k] = 'builtin-throttle-classic';
    localStorage.setItem('sc-mapper:slots:v1', JSON.stringify(st));
  });
}
await page.reload({ waitUntil: 'networkidle' });
await page.locator('[data-view-tab=devices]').click();
await page.waitForTimeout(500);
{ // after the reload the old classic pick is moved to the default throttle and saved back (wake the pads first: the pick is keyed by the connected device)
  await page.evaluate(() => window.__btn(0, 0, true));
  await page.waitForTimeout(120);
  await page.evaluate(() => window.__btn(0, 0, false));
  await page.waitForTimeout(400);
  await slotChip('js2');
  await page.waitForTimeout(300);
  const saved = await page.evaluate(() => localStorage.getItem('sc-mapper:slots:v1') ?? '');
  const st = await dv.getByTestId('device-status').innerText();
  check(saved.includes('builtin-throttle-classic') && (await dv.getByTestId('template-select').inputValue()) === 'builtin-throttle' && /Generic throttle/.test(st) && /picked by you/.test(st) && (await dv.locator('[data-callout]').count()) === 21,
    `saved pick of the removed classic throttle migrated to the default throttle (${st.split('\n')[0]})`);
  await dv.getByTestId('template-select').selectOption('');
  await page.waitForTimeout(200);
}
await slotChip('js1');
await page.waitForTimeout(300);
check(/linked to this device/.test(await dv.getByTestId('device-status').innerText()) && (await dv.locator('[data-callout]').count()) === 4, 'templates survive a reload (IndexedDB) and still match the profile device');
{ // device templates: a >32-button device warns in Chrome; numbers can be assigned on a copy of an unassigned built-in
  await dv.getByTestId('template-select').selectOption('builtin-winctrl-orion');
  await page.waitForTimeout(600);
  const n = await dv.getByTestId('chromium-button-notice').innerText().catch(() => '');
  check(/buttons up to\s*\d{2,}/.test(n) && /Open this page in Firefox/.test(n), `>32-button template (WinCtrl Orion) shows the Chromium limit notice (${n.split('\n')[0]})`);
  const opt = await dv.getByTestId('template-select').locator('option:checked').innerText();
  check(/· \d+ buttons$/.test(opt), `template picker shows the button count of big devices (${opt})`);
  await dv.getByTestId('template-select').selectOption('builtin-vkb-gladiator-scg');
  await page.waitForTimeout(600);
  await dv.getByTestId('template-unassigned').getByRole('button', { name: /Assign numbers/ }).click();
  await page.waitForTimeout(500);
  const te2 = page.getByTestId('template-editor');
  check(await te2.isVisible() && (await te2.getByLabel('Template name').inputValue()) !== 'VKB Gladiator NXT EVO (Space Combat Grip)', `Assign numbers opens the editor on a copy (${await te2.getByLabel('Template name').inputValue()})`);
  await te2.getByTestId('tpl-callouts').getByRole('button', { name: /A2 red button/ }).click();
  await te2.getByLabel('Input input').fill('7');
  await te2.getByLabel('Input input').press('Enter');
  await page.waitForTimeout(150);
  check(/A2 red button[^\n]*\n?[^\n]*· 7(\s|$)/.test(await te2.getByTestId('tpl-callouts').innerText()), 'typing 7 assigns button 7 to the A2 callout');
  await te2.getByTestId('tpl-save').click();
  await page.waitForTimeout(500);
  const st = await dv.getByTestId('device-status').innerText();
  const a2 = await dv.locator('[data-callout="a2"]').innerText();
  const sel = await dv.getByTestId('template-select').locator('option:checked').innerText();
  check(/^A2 red button\s+7\b/.test(a2) && !/^VKB Gladiator NXT EVO \(Space Combat Grip\)$/.test(sel), `saved copy is used and the A2 callout now shows button 7 (${a2.replace(/\n/g, ' ')}; ${st.split('\n')[0]})`);
  const src = await dv.locator('[data-testid=device-canvas] img').first().getAttribute('src').catch(() => '');
  check(/^data:image\/svg\+xml|\/device-photos\/vkb-gladiator-scg-[a-z]+\.webp$/.test(src ?? ''), `the copy keeps the device drawing / photos (${(src ?? '').slice(0, 60)})`);
  await dv.getByTestId('device-canvas').screenshot({ path: shots + '32-device-view-gladiator-copy.png' });
}
await page.locator('[data-view-tab=list]').click();

// ===================== Firefox: 15 controllers, identical MOZA bases, >128 buttons =====================
// Firefox exposes every device and all buttons; ids look like "346e-1002-MOZA AB6 FFB Base". Device list from a real Firefox setup.
console.log('\nFirefox with 15 controllers');
const ff = await browser.newContext({ viewport: { width: 1680, height: 1100 }, deviceScaleFactor: 1, userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:143.0) Gecko/20100101 Firefox/143.0' });
const fp = await ff.newPage();
fp.on('pageerror', (e) => errors.push('[firefox] ' + String(e)));
await fp.addInitScript(() => {
  Object.defineProperty(Navigator.prototype, 'userAgentData', { get: () => undefined, configurable: true });
  const btns = (n) => Array.from({ length: n }, () => ({ pressed: false, touched: false, value: 0 }));
  const devs = [
    ['4098-bf02-WINCTRL CarrierAce MFD L', 28, 0], ['4098-bf03-WINCTRL CarrierAce MFD C', 28, 0], ['4098-bf04-WINCTRL CarrierAce MFD R', 28, 0],
    ['4098-bf05-WINCTRL CarrierAce UFC+HUD', 60, 2], ['4098-be64-WINCTRL Orion Pedals', 4, 3], ['4098-bc2a-WINCTRL-32 TCAS', 20, 0],
    ['4098-bf10-WINCTRL PTO 2', 40, 0], ['4098-bc27-WINCTRL URSA MINOR Throttle', 128, 8], ['4098-bf20-WINCTRL 3N PFP', 128, 0],
    ['4098-bf30-WINCTRL ViperAce ICP', 128, 0], ['4098-bc2b-WINCTRL-32 RMP', 64, 0], ['4098-bc1e-WINCTRL-32 FCU+EFIS', 128, 0],
    ['346e-1002-MOZA AB6 FFB Base', 128, 8], ['346e-1002-MOZA AB6 FFB Base', 133, 8], ['294b-1901-Bravo Throttle Quadrant', 48, 7],
  ];
  const pads = devs.map(([id, b, a], index) => ({ index, id, mapping: '', connected: true, buttons: btns(b), axes: Array(a).fill(0), timestamp: 0 }));
  let revealed = false;
  window.__btn = (i, b, on) => { pads[i].buttons[b] = { pressed: on, touched: on, value: on ? 1 : 0 }; pads[i].timestamp++; if (on) revealed = true; };
  navigator.getGamepads = () => pads.map((p) => (revealed ? Object.freeze({ ...p, axes: Object.freeze([...p.axes]), buttons: Object.freeze(p.buttons.map((x) => Object.freeze({ ...x }))) }) : null));
});
await fp.goto(url, { waitUntil: 'networkidle' });
await fp.evaluate(() => localStorage.clear());
await fp.reload({ waitUntil: 'networkidle' });
await fp.getByTestId('open-slots').click();
const fpanel = fp.getByTestId('controllers-panel');
await fp.evaluate(() => window.__btn(0, 0, true));
await fp.waitForTimeout(120);
await fp.evaluate(() => window.__btn(0, 0, false));
await fp.waitForTimeout(600);
check(await fpanel.getByTestId('chromium-banner').count() === 0, 'Firefox: no Chromium banner');
check(await fpanel.getByTestId('hw-row').count() === 15, `Firefox: all 15 controllers listed under "Detected by this browser" (${await fpanel.getByTestId('hw-row').count()})`);
check(await fpanel.getByTestId('slots-empty').isVisible(), 'no profile: no game slots yet, with a hint to add them or import a profile');
check(await fpanel.getByTestId('dup-hint').isVisible(), 'identical MOZA bases flagged (same USB id 346E:1002)');
const mozaHw = fpanel.locator('[data-testid=hw-row][data-hw="MOZA AB6 FFB Base"]');
const mozaRows = await mozaHw.allInnerTexts();
check(mozaRows.length === 2 && mozaRows.some((x) => x.includes('1 of 2') && x.includes('128 buttons')) && mozaRows.some((x) => x.includes('2 of 2') && x.includes('133 buttons')), 'MOZA entries told apart: "1 of 2 · 128 buttons" / "2 of 2 · 133 buttons"');
await fpanel.evaluate((el) => el.scrollTo(0, 0));
await fp.screenshot({ path: shots + '21-firefox-15-controllers.png', fullPage: false });
// both MOZA bases get slots of their own (the "+ as jsN" button of each detected device)
for (let k = 0; k < 2; k++) { await mozaHw.nth(k).getByRole('button', { name: /as js\d+/ }).click(); await fp.waitForTimeout(200); }
const mozaSlots = await fpanel.locator('[data-testid=slot-row]').evaluateAll((rs) => rs.map((r) => [r.dataset.slot, r.querySelector('[data-testid=slot-hw]')?.selectedOptions[0]?.text ?? '']));
check(mozaSlots.length === 2 && mozaSlots.every(([, t]) => /MOZA AB6/.test(t)), `MOZA bases added as slots (${mozaSlots.map((x) => x.join('=')).join(', ')})`);
const moza133 = mozaSlots.find(([, t]) => /133 buttons/.test(t))?.[0];
await fpanel.getByTestId('tab-tester').click();
await fp.evaluate(() => window.__btn(13, 132, true));
await fp.waitForTimeout(300);
check(await fpanel.getByTestId('tester-over-cap').first().isVisible(), 'input tester marks buttons above 128');
await fpanel.getByTestId('tester-over-cap').first().scrollIntoViewIfNeeded();
await fp.screenshot({ path: shots + '22-firefox-moza-over-128.png', fullPage: false });
await fp.evaluate(() => window.__btn(13, 132, false));
await fp.keyboard.press('Escape');
await fp.waitForTimeout(200);
await fp.getByTestId('press-search').click();
await fp.waitForTimeout(400);
check(await fp.getByTestId('press-bar').getByTestId('chromium-banner').count() === 0, 'Firefox: no banner in the press bar');
await fp.evaluate(() => window.__btn(13, 132, true));
await fp.waitForTimeout(150);
await fp.evaluate(() => window.__btn(13, 132, false));
await fp.waitForTimeout(300);
const fchip = await fp.getByTestId('press-chip').innerText().catch(() => '');
check(fchip.includes(`${moza133}_button133`), `press-to-search: second MOZA button 133 -> ${moza133}_button133 (${fchip})`);
check(/128/.test(await fp.getByTestId('press-chip').getAttribute('title')), 'chip warns that the game may not see buttons above 128');
await fp.getByTestId('press-chip').getByRole('button', { name: 'Remove input filter' }).click();
// devices view: a template linked to the 133-button MOZA base only
await fp.locator('[data-view-tab=devices]').click();
await fp.waitForTimeout(400);
writeFileSync('/tmp/moza133.json', JSON.stringify({ format: 'sc-mapper-device-templates', version: 1, templates: [{ id: 'moza-133', name: 'MOZA base (133)', slot: 'js', aspect: 1.6, match: [{ vendor: '346E', product: '1002', buttons: 133 }], callouts: [{ id: 'c', kind: 'button', inputs: ['button133'], anchor: { x: 0.5, y: 0.5 }, box: { x: 0.8, y: 0.2 } }] }] }));
await fp.getByTestId('template-import-file').setInputFiles('/tmp/moza133.json');
await fp.waitForTimeout(400);
{
  const st = async (id) => { await fp.locator(`[data-slot-chip="${id}"]`).click(); await fp.waitForTimeout(250); return fp.getByTestId('device-status').innerText(); };
  const s133 = await st(moza133);
  const s128 = await st(mozaSlots.find(([id]) => id !== moza133)[0]);
  check(/MOZA base \(133\)/.test(s133) && /133 buttons/.test(s133) && !/MOZA base \(133\)/.test(s128), 'Firefox: template linked by USB id + 133 buttons applies to the second MOZA base only');
  // the other base shows the MTQ throttle (grip photos per grip): they switch on a press even with "Highlight on press" off
  check(/MTQ/.test(s128), `first MOZA base drawn as the MTQ throttle quadrant (${s128.split('\n')[0]})`);
  await fp.getByTestId('open-settings').click();
  await fp.getByTestId('setting-highlight').click();
  await fp.keyboard.press('Escape');
  const grip = () => fp.locator('[data-testid=swap-views] [aria-pressed=true]').allInnerTexts();
  const g0 = (await grip()).join();
  await fp.evaluate(() => window.__btn(12, 65, true));
  await fp.waitForTimeout(400);
  const g1 = (await grip()).join();
  const lit = await fp.locator('[data-callout][data-active="1"]').count();
  await fp.screenshot({ path: shots + '26-grip-swap-highlight-off.png', fullPage: false });
  await fp.evaluate(() => window.__btn(12, 65, false));
  check(/Combat/.test(g0) && /Airbus/.test(g1) && lit === 0, `highlight off: pressing Airbus grip button 66 still swaps the photo (${g0} -> ${g1}), nothing lights up`);
  await fp.getByTestId('open-settings').click();
  await fp.getByTestId('setting-highlight').click();
  await fp.keyboard.press('Escape');
}
// ---- slot order: move up / down (swap numbers, everything follows, undoable) and the game's js1–js8 axis-settings limit
console.log('\nslot order & axis settings limit (Firefox, 10 joysticks)');
{
  await fp.getByTestId('open-slots').click();
  await fp.waitForTimeout(200);
  for (let k = 0; k < 8; k++) { await fpanel.locator('[data-testid=hw-row]').getByRole('button', { name: /as js\d+/ }).first().click(); await fp.waitForTimeout(120); }
  await fp.keyboard.press('Escape');
  await fp.getByTestId('profile-more').click();
  await fp.getByTestId('profile-menu').getByText('New profile from the game defaults').click();
  await fp.waitForTimeout(300);
  await fp.getByTestId('open-slots').click();
  const fRow = (id) => fpanel.locator(`[data-testid=slot-row][data-slot="${id}"]`);
  const fHw = async (id) => fRow(id).getByTestId('slot-hw').evaluate((s) => s.options[s.selectedIndex]?.text ?? '');
  const jsRows = await fpanel.locator('[data-testid=slot-row][data-slot^=js]').count();
  check(jsRows === 10, `new profile from the defaults keeps the 10 joystick slots (${jsRows})`);
  check(await fRow('js1').getByTestId('slot-move-up').isDisabled() && await fRow('js1').getByTestId('slot-move-down').isEnabled() && await fRow('js10').getByTestId('slot-move-down').isDisabled(),
    'move arrows on joystick rows: js1 can\'t go up, js10 can\'t go down');
  check(await fRow('kb1').getByTestId('slot-move-up').count() === 0, 'no move arrows on keyboard / mouse rows');
  const hw1 = await fHw('js1'), hw2 = await fHw('js2');
  await fp.keyboard.press('Escape');
  // an axis setting on js1, to see it travel with the device
  await fp.locator('[data-view-tab=devices]').click();
  await fp.waitForTimeout(400);
  const fchipSel = async (id) => { await fp.getByTestId('device-slot-strip').locator(`[data-slot-chip="${id}"]`).click(); await fp.waitForTimeout(250); };
  const fam = fp.getByTestId('axis-settings-modal');
  const pitchOf = async (id) => { await fchipSel(id); await fp.getByTestId('slot-axis-settings').click(); await fp.waitForTimeout(200); const t = await fam.locator('[data-testid=settings-groups] button[data-group="flight_move_pitch"]').innerText(); await fam.getByRole('button', { name: 'Close' }).first().click(); await fp.waitForTimeout(120); return t; };
  await fchipSel('js1');
  await fp.getByTestId('slot-axis-settings').click();
  await fam.locator('[data-testid=settings-groups] button[data-group="flight_move_pitch"]').click();
  await fam.getByTestId('group-editor').getByLabel('Invert').selectOption('1');
  await fam.getByRole('button', { name: 'Close' }).first().click();
  // a template pick and a binding of your own on js1, to see them travel too
  const fdv = fp.getByTestId('device-view');
  await fdv.getByTestId('template-select').selectOption('builtin-stick');
  await fp.waitForTimeout(300);
  await fdv.locator('[data-callout="b6"]').click();
  const fip = fdv.getByTestId('input-panel');
  await fip.getByLabel('Search actions to bind').fill('landing system');
  await fip.getByTestId('bind-results').locator('button').first().click();
  await fp.waitForTimeout(300);
  // js9: the game keeps axis / curve settings for js1–js8 only
  await fchipSel('js9');
  const fbar = fp.getByTestId('device-slot-bar');
  check(await fbar.getByTestId('slot-axis-settings').isDisabled() && /first 8/.test(await fbar.getByTestId('axis-locked').innerText()) && /reorder/i.test(await fbar.getByTestId('axis-locked').innerText()),
    `js9: Axis settings CTA disabled, explaining the first-8 limit (${(await fbar.getByTestId('axis-locked').innerText()).slice(0, 80)}…)`);
  await fp.screenshot({ path: shots + '112-devices-js9-axis-locked.png' });
  await fbar.getByTestId('axis-reorder').click();
  await fp.waitForTimeout(250);
  check(await fpanel.isVisible() && await fpanel.getByTestId('slots-tab').isVisible(), 'the reorder button opens Game slots & controllers');
  const hw9 = await fHw('js9');
  const c1 = await fRow('js1').getByTestId('slot-count').innerText().catch(() => '');
  // move js1 down: js1 <> js2 swap hardware and bindings
  await fRow('js1').getByTestId('slot-move-down').click();
  await fp.waitForTimeout(300);
  check((await fHw('js2')) === hw1 && (await fHw('js1')) === hw2, `move down: js1's hardware is now js2 and the other way round (${hw1.slice(0, 30)} / ${hw2.slice(0, 30)})`);
  const c2 = await fRow('js2').getByTestId('slot-count').innerText().catch(() => '');
  check(/^\(\d+ custom\)$/.test(c1) && c2 === c1 && await fRow('js1').getByTestId('slot-count').count() === 0, `your js1 bindings moved to js2 (${c1} -> ${c2}); none left on js1 (game defaults stay on their number)`);
  check((await fRow('js2').getByTestId('slot-template').inputValue()) === 'builtin-stick' && (await fRow('js1').getByTestId('slot-template').inputValue()) === '', 'the template pick moved with it');
  check(/Swap js1 and js2/.test(await fpanel.getByTestId('slot-move-notice').innerText()), 'swap notice with Undo');
  await fpanel.evaluate((el) => el.scrollTo(0, 0));
  await fp.screenshot({ path: shots + '112-game-slots-move-arrows.png' });
  await fpanel.getByTestId('slot-move-undo').click();
  await fp.waitForTimeout(300);
  check((await fHw('js1')) === hw1 && (await fHw('js2')) === hw2 && await fRow('js2').getByTestId('slot-count').count() === 0 && (await fRow('js1').getByTestId('slot-count').innerText()) === c1 && await fpanel.getByTestId('slot-move-notice').count() === 0, 'Undo reverts the swap (hardware, bindings)');
  await fRow('js2').getByTestId('slot-move-up').click(); // the same swap from the other row
  await fp.waitForTimeout(300);
  check((await fHw('js2')) === hw1, 'move up on js2 swaps it with js1');
  await fRow('js9').getByTestId('slot-move-up').click();
  await fp.waitForTimeout(300);
  check((await fHw('js8')) === hw9, `js9 moved up: its device is js8 now (${hw9})`);
  await fp.keyboard.press('Escape');
  await fp.waitForTimeout(200);
  check(/inverted/.test(await pitchOf('js2')) && !/inverted/.test(await pitchOf('js1')), 'axis settings followed the device: the js1 pitch inversion is on js2 now');
  await fchipSel('js8');
  check(await fbar.getByTestId('slot-axis-settings').isEnabled() && await fbar.getByTestId('axis-locked').count() === 0, 'the device moved to js8 can be customized now');
  await fp.evaluate(() => document.activeElement?.blur());
  await fp.keyboard.press('Control+z'); // js9 -> js8 swap
  await fp.keyboard.press('Control+z'); // js1 <> js2 swap
  await fp.waitForTimeout(300);
  check(/inverted/.test(await pitchOf('js1')) && !/inverted/.test(await pitchOf('js2')), 'Ctrl+Z undoes the swaps, axis settings included');
}
await ff.close();

// ---- photo templates: a TEST-ONLY layout (made-up anchors, not real coordinates) injected through the test hook makes the
// Gladiator template a two-view photo template; checks views side by side / stacked, markers on the right view, live marker,
// label overlap avoidance, PNG export and the editor's view tabs.
log('photo template (test-only layout via __SC_TEST_PHOTO_LAYOUTS)');
{
  const pctx = await browser.newContext({ viewport: { width: 1680, height: 1000 }, deviceScaleFactor: 1, acceptDownloads: true });
  const pp = await pctx.newPage();
  pp.on('pageerror', (e) => errors.push(String(e)));
  pp.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  const viewOf = (k) => (k % 2 ? 'thumb' : 'front');
  await pp.addInitScript((ids) => {
    window.__SC_TEST_PHOTO_LAYOUTS = { 'builtin-vkb-gladiator-scg': {
      views: [{ id: 'front', label: 'Front', photo: 'vkb-gladiator-scg-front' }, { id: 'thumb', label: 'Thumb side', photo: 'vkb-gladiator-scg-thumb' }],
      anchors: Object.fromEntries(ids.map((id, k) => [id, { view: k % 2 ? 'thumb' : 'front', x: 0.3 + (0.4 * ((k * 37) % 100)) / 100, y: 0.1 + (0.8 * ((k * 53) % 100)) / 100 }])),
    } };
    const pads = [{ index: 0, id: 'VKBsim Gladiator EVO R (Vendor: 231d Product: 0200)', mapping: '', connected: true, buttons: Array.from({ length: 32 }, () => ({ pressed: false, touched: false, value: 0 })), axes: [0, 0, 0, 0, 0, 0, 0, 0, 0, 9 / 7], timestamp: 0 }];
    let revealed = false;
    window.__btn = (i, b, on) => { pads[i].buttons[b] = { pressed: on, touched: on, value: on ? 1 : 0 }; pads[i].timestamp++; if (on) revealed = true; };
    window.__axis = (i, a, v) => { pads[i].axes[a] = v; pads[i].timestamp++; };
    navigator.getGamepads = () => pads.map((p) => (revealed ? Object.freeze({ ...p, axes: Object.freeze([...p.axes]), buttons: Object.freeze(p.buttons.map((x) => Object.freeze({ ...x }))) }) : null));
  }, gladIds);
  await pp.goto(url, { waitUntil: 'networkidle' });
  await pp.evaluate(() => window.__btn(0, 2, true));
  await pp.waitForTimeout(120);
  await pp.evaluate(() => window.__btn(0, 2, false));
  // no profile: give the stick a slot first (the Devices view shows game slots)
  await pp.getByTestId('open-slots').click();
  await pp.getByTestId('hw-row').first().getByRole('button', { name: /as js\d+/ }).click();
  await pp.keyboard.press('Escape');
  await pp.locator('[data-view-tab=devices]').click();
  await pp.waitForTimeout(800);
  const pv = pp.getByTestId('device-view');
  await pv.locator('[data-slot-chip]').filter({ hasText: /^\s*JS/ }).first().click();
  await pp.waitForTimeout(800);
  const canvas = pv.getByTestId('device-canvas');
  const views = canvas.getByTestId('device-canvas-view');
  check(gladIds.length > 10 && /VKB Gladiator/.test(await pv.getByTestId('device-status').innerText()) && (await canvas.getAttribute('data-views')) === '2' && (await views.count()) === 2, `test layout: Gladiator shown as a 2-view photo template (${gladIds.length} controls)`);
  const imgs = await views.evaluateAll((els) => els.map((e) => { const i = e.querySelector('img'); return { view: e.getAttribute('data-view'), photo: e.getAttribute('data-photo'), src: i?.getAttribute('src'), ok: !!i && i.complete && i.naturalWidth > 0 }; }));
  check(JSON.stringify(imgs.map((x) => [x.view, x.photo, x.src])) === JSON.stringify([['front', '1', '/device-photos/vkb-gladiator-scg-front.webp'], ['thumb', '1', '/device-photos/vkb-gladiator-scg-thumb.webp']]) && imgs.every((x) => x.ok), `each view shows its product photo, loaded (${imgs.map((x) => `${x.view}:${x.ok}`).join(' ')})`);
  const where = await canvas.locator('[data-callout]').evaluateAll((els) => els.map((e) => [e.getAttribute('data-callout'), e.closest('[data-view]')?.getAttribute('data-view')]));
  const markers = await canvas.locator('[data-marker]').evaluateAll((els) => els.map((e) => [e.getAttribute('data-marker'), e.closest('[data-view]')?.getAttribute('data-view')]));
  const want = gladIds.map((id, k) => [id, viewOf(k)]).sort().join('|');
  check(where.length === gladIds.length && where.sort().join('|') === want, 'every callout label on the view its anchor is on');
  check(markers.length === gladIds.length && markers.sort().join('|') === want, 'a circular marker per control, on the right view');
  const rect = () => views.evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((b) => ({ x: b.x, y: b.y, w: b.width, h: b.height })));
  const fmt = (rs) => rs.map((b) => `${Math.round(b.w)}×${Math.round(b.h)}@${Math.round(b.x)},${Math.round(b.y)}`).join(' ');
  const r = await rect();
  check(r[1].y >= r[0].y + r[0].h - 1 && r.every((b) => b.h > 450), `usual window: photo views stacked, each large (${fmt(r)})`);
  await pp.setViewportSize({ width: 2560, height: 1000 });
  await pp.waitForTimeout(400);
  const rw = await rect();
  check(Math.abs(rw[0].y - rw[1].y) < 2 && rw[1].x >= rw[0].x + rw[0].w - 1 && rw[0].h >= 440, `very wide window: views side by side (${fmt(rw)})`);
  await pp.setViewportSize({ width: 1680, height: 1000 });
  await pp.waitForTimeout(400);
  const overlaps = await views.evaluateAll((els) => els.map((v) => {
    const bs = [...v.querySelectorAll('[data-callout] > div')].map((d) => d.getBoundingClientRect());
    let n = 0;
    for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) { const a = bs[i], b = bs[j]; if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) n++; }
    return n;
  }));
  check(overlaps.every((n) => n === 0), `label boxes do not overlap (${overlaps.join(', ')})`);
  await pp.screenshot({ path: shots + '23-photo-template-test-layout.png', fullPage: false });
  // live: moving the stick lights the X / Y marker (Gladiator's only numbered control) on its view
  await pp.evaluate(() => window.__axis(0, 0, 0.8));
  await pp.waitForTimeout(300);
  const lit = await canvas.locator('[data-marker][data-active="1"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-marker')));
  const litLabel = await canvas.locator('[data-callout][data-active="1"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-callout')));
  check(lit.length === 1 && litLabel.join() === lit.join(), `moving the stick lights its marker and label (${lit.join()})`);
  await pp.evaluate(() => window.__axis(0, 0, 0));
  await pp.waitForTimeout(250);
  check((await canvas.locator('[data-marker][data-active="1"]').count()) === 0, 'marker goes dark again at rest');
  // a press brings the view with that control's marker into sight (smooth scroll of the Devices scroll area) and pulses it briefly
  {
    const litView = (where.find(([id]) => id === lit[0]) ?? [])[1];
    const other = litView === 'front' ? 'thumb' : 'front';
    // share of a view showing inside its scroll area (nearest scrolling ancestor)
    const shown = (v) => canvas.locator(`[data-testid="device-canvas-view"][data-view="${v}"]`).evaluate((el) => {
      let sp = el.parentElement;
      while (sp && !(/(auto|scroll)/.test(getComputedStyle(sp).overflowY) && sp.scrollHeight > sp.clientHeight + 1)) sp = sp.parentElement;
      const r = el.getBoundingClientRect(), p = sp ? sp.getBoundingClientRect() : { top: 0, bottom: innerHeight };
      return Math.max(0, Math.min(r.bottom, p.bottom) - Math.max(r.top, p.top)) / Math.min(r.height, p.bottom - p.top);
    });
    const away = async () => { await canvas.locator(`[data-view="${other}"]`).first().evaluate((el, block) => el.scrollIntoView({ block, behavior: 'instant' }), litView === 'front' ? 'end' : 'start'); await pp.waitForTimeout(250); };
    await away();
    const before = await shown(litView);
    check(before < 0.6, `precondition: the ${litView} view is scrolled out of sight (${(before * 100).toFixed(0)}% visible)`);
    await pp.evaluate(() => window.__axis(0, 0, 0.8));
    await pp.waitForTimeout(450);
    const pulsed = await canvas.locator(`[data-view="${litView}"][data-focused="1"] [data-view-pulse]`).count();
    const otherPulsed = await canvas.locator(`[data-view="${other}"][data-focused="1"]`).count();
    await pp.waitForTimeout(700);
    const after = await shown(litView);
    check(after > 0.95, `moving the stick scrolls its ${litView} view into sight (${(before * 100).toFixed(0)}% -> ${(after * 100).toFixed(0)}% visible)`);
    check(pulsed === 1 && otherPulsed === 0, 'the view brought into sight gets a short rim pulse (only that one)');
    await pp.screenshot({ path: shots + '24-photo-view-focus-on-press.png', fullPage: false });
    await pp.waitForTimeout(800);
    check((await canvas.locator('[data-focused="1"], [data-view-pulse]').count()) === 0, 'the pulse fades out (no lasting highlight)');
    await pp.evaluate(() => window.__axis(0, 0, 0));
    await pp.waitForTimeout(250);
    // already in sight: another press does not move the panel
    const y0 = await canvas.evaluate((el) => el.getBoundingClientRect().top);
    await pp.evaluate(() => window.__axis(0, 0, 0.8));
    await pp.waitForTimeout(700);
    check(Math.abs((await canvas.evaluate((el) => el.getBoundingClientRect().top)) - y0) < 2, 'view already in sight: a press does not scroll');
    await pp.evaluate(() => window.__axis(0, 0, 0));
    await pp.waitForTimeout(250);
    // the user just scrolled (mouse wheel): a press does not take the panel away from them
    await away();
    const vb = await canvas.locator(`[data-view="${other}"]`).first().boundingBox();
    await pp.mouse.move(vb.x + 20, vb.y + vb.height / 2);
    await pp.mouse.wheel(0, litView === 'front' ? 40 : -40);
    await pp.waitForTimeout(150);
    const held = await shown(litView);
    await pp.evaluate(() => window.__axis(0, 0, 0.8));
    await pp.waitForTimeout(700);
    check(Math.abs((await shown(litView)) - held) < 0.02, `right after the user scrolled, a press does not auto-scroll (${(held * 100).toFixed(0)}% stays)`);
    await pp.evaluate(() => window.__axis(0, 0, 0));
    await pp.waitForTimeout(1600);
    // a burst of presses (stick wiggle) settles on one view, no thrashing
    await away();
    for (const v of [0.8, 0, 0.8, 0, 0.8]) { await pp.evaluate((x) => window.__axis(0, 0, x), v); await pp.waitForTimeout(45); }
    await pp.waitForTimeout(1100);
    check((await shown(litView)) > 0.95, 'a burst of presses coalesces into one move to the view');
    await pp.evaluate(() => window.__axis(0, 0, 0));
    await pp.waitForTimeout(250);
  }
  {
    const [d] = await Promise.all([pp.waitForEvent('download'), pv.getByTestId('device-png').click()]);
    const f = '/tmp/photo-' + d.suggestedFilename();
    await d.saveAs(f);
    const buf = readFileSync(f);
    check(buf.subarray(1, 4).toString() === 'PNG' && buf.length > 50000, `PNG export of a photo template (${(buf.length / 1024).toFixed(0)} KB)`);
  }
  // narrow window: the views stack
  await pp.setViewportSize({ width: 820, height: 1000 });
  await pp.waitForTimeout(400);
  const r2 = await views.evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((b) => ({ x: b.x, y: b.y, w: b.width, h: b.height })));
  check(r2[1].y >= r2[0].y + r2[0].h - 1, `narrow window: views stacked (${r2.map((b) => `${Math.round(b.w)}×${Math.round(b.h)}@${Math.round(b.x)},${Math.round(b.y)}`).join(' ')})`);
  await pp.setViewportSize({ width: 1680, height: 1000 });
  await pp.waitForTimeout(300);
  // editor: view tabs; a click adds the callout to the shown view
  await pv.getByTestId('template-customize').click();
  await pp.waitForTimeout(400);
  const ed = pp.getByTestId('template-editor');
  const tabs = ed.getByTestId('tpl-views').locator('[data-view-tab]');
  check((await tabs.count()) === 2 && (await ed.getByTestId('device-canvas-view').count()) === 1 && (await ed.getByTestId('device-canvas-view').getAttribute('data-view')) === 'front', 'editor: one view at a time with view tabs');
  const nFront = gladIds.filter((_, k) => viewOf(k) === 'front').length, nThumb = gladIds.length - nFront;
  check((await ed.locator('[data-anchor]').count()) === nFront, `editor: front tab shows its ${nFront} anchors`);
  await tabs.nth(1).click();
  await pp.waitForTimeout(200);
  check((await ed.getByTestId('device-canvas-view').getAttribute('data-view')) === 'thumb' && (await ed.locator('[data-anchor]').count()) === nThumb, `editor: thumb tab shows its ${nThumb} anchors`);
  const ev = ed.getByTestId('device-canvas-view');
  const eb = await ev.boundingBox();
  await pp.mouse.click(eb.x + eb.width * 0.5, eb.y + eb.height * 0.5);
  await pp.waitForTimeout(200);
  check((await ed.locator('[data-anchor]').count()) === nThumb + 1 && /\(\d+\)/.test(await tabs.nth(1).innerText()) && (await tabs.nth(1).innerText()).includes(`(${nThumb + 1})`), 'editor: clicking the photo adds a callout on the shown view');
  await ed.getByLabel('Callout view').selectOption('front');
  await pp.waitForTimeout(200);
  check((await ed.getByTestId('device-canvas-view').getAttribute('data-view')) === 'front' && (await ed.locator('[data-anchor]').count()) === nFront + 1, 'editor: moving a callout to another view follows it there');
  await ed.getByRole('button', { name: 'Cancel', exact: true }).click();
  await pctx.close();
}

// persistence
await page.reload({ waitUntil: 'networkidle' });
log('profile after reload:', await page.locator('#profile option:checked').innerText());
check(errors.length === 0, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
await browser.close();
console.log(failures.length ? `\n${failures.length} FAILED` : '\nall e2e checks passed');
process.exit(failures.length ? 1 : 0);
