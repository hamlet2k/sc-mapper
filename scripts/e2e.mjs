// End-to-end test + screenshots. Usage: node scripts/e2e.mjs [url]
// Controllers are simulated by replacing navigator.getGamepads() (a headless browser has no real HID devices).
import { chromium, firefox } from 'playwright';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
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
/** the picture preparation's output is rendered for the current framing (no model / render in progress) */
const prepSettled = (pg) => pg.waitForFunction(() => { const a = document.querySelector('[data-testid=photo-prep-after]'); return a && a.dataset.stale !== '1' && !document.querySelector('[data-testid=photo-prep-progress]') && !document.querySelector('[data-testid=photo-prep-rendering]'); }, null, { timeout: 90000 }).then(() => pg.waitForTimeout(100));

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
await page.locator('input[type=file]').first().setInputFiles('public/samples/actionmaps.xml');
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
check(await page.getByTestId('edit-toggle').isVisible(), 'Keyboard view has the Edit toggle');
await page.locator('button[title^="V:"]').first().hover();
await page.waitForTimeout(200);
await page.screenshot({ path: shots + '05-keyboard-view.png' });
// clicking a key stays on the Keyboard view and only selects it in the inspector (does not jump to the List)
const vKey = page.locator('button[title^="V:"]').first();
await vKey.click();
await page.waitForTimeout(250);
check((await page.locator('[data-view-tab][aria-current=page]').getAttribute('data-view-tab')) === 'keyboard'
  && /V/.test(await page.getByTestId('keyboard-inspector').innerText())
  && (await vKey.getAttribute('data-selected')) === '1',
  'clicking a keyboard key stays on Keyboard and sticky-selects it in the inspector');
// hover another key peeks the inspector; leaving restores the selected key
const bKey = page.locator('button[title^="B:"]').first();
await bKey.hover();
await page.waitForTimeout(150);
check(/B/.test(await page.getByTestId('keyboard-inspector').innerText()) && (await vKey.getAttribute('data-selected')) === '1',
  'hovering another key peeks it in the inspector while V stays selected');
await page.getByTestId('keyboard-inspector').hover(); // leave the keys
await page.waitForTimeout(150);
check(/V/.test(await page.getByTestId('keyboard-inspector').innerText()), 'leaving keys restores the selected key in the inspector');
await page.screenshot({ path: shots + '123-kb-selected.png' });
// click same key toggles selection off (hover still peeks while the pointer is over it — leave to see empty)
await vKey.click();
await page.waitForTimeout(150);
check((await vKey.getAttribute('data-selected')) !== '1', 'clicking the selected key again clears data-selected');
await page.getByTestId('keyboard-inspector').hover();
await page.waitForTimeout(150);
check(/Click a key to select/i.test(await page.getByTestId('keyboard-inspector').innerText()),
  'after deselect + leaving the key, inspector is empty');
await vKey.click();
await page.waitForTimeout(100);
check((await vKey.getAttribute('data-selected')) === '1', 'clicking V again selects it');
// click empty board area clears selection
await page.getByTestId('keyboard-board').locator('text=1 action').click();
await page.waitForTimeout(150);
check((await vKey.getAttribute('data-selected')) !== '1', 'clicking empty board area (legend) clears the selection');
await vKey.click(); // leave a selection for the Edit toggle check below
await page.waitForTimeout(100);
await page.getByTestId('edit-toggle').click();
await page.waitForTimeout(200);
check(await page.getByTestId('edit-bar').isVisible() && await page.getByTestId('keyboard-bind').isVisible(), 'Edit on Keyboard: edit bar + bind-an-action search in the inspector');
await page.getByTestId('edit-toggle').click();
await page.waitForTimeout(150);
await page.locator('[data-view-tab=conflicts]').click();

await page.waitForTimeout(300);
log('conflict cards:', await page.locator('#main .hud-panel.border-l-2').count());
check(await page.getByTestId('edit-toggle').isVisible(), 'Conflicts view has the Edit toggle');
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
{
  const ff = panel.getByTestId('chromium-banner').getByTestId('firefox-download');
  check(await ff.isVisible() && (await ff.getAttribute('href')) === 'https://www.mozilla.org/firefox/download/' && (await ff.getAttribute('target')) === '_blank' && /noopener/.test(await ff.getAttribute('rel') ?? ''),
    'Chromium banner: Firefox logo links to the download page (new tab, noopener)');
}
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
const pickChip = async (id) => { await page.getByTestId('sidebar-slots').locator(`[data-slot-row="${id}"]`).click(); await page.waitForTimeout(250); };
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
await page.locator('input[type=file]').first().setInputFiles(file);
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
// round 9: kb / mo are picked in the profile card's Game slots list (no picker in the view's toolbar on a wide screen)
const sideRow = (id) => page.getByTestId('sidebar-slots').locator(`[data-slot-row="${id}"]`);
check(await page.getByTestId('km-slot-kb').count() === 0 && (await page.getByTestId('sidebar-slots').getAttribute('data-mode')) === 'keyboard'
  && (await sideRow('kb2').getAttribute('data-selectable')) === '1' && (await sideRow('kb1').getAttribute('data-selected')) === '1' && (await sideRow('mo1').getAttribute('data-selected')) === '1',
  'Keyboard view: kb1 / kb2 / mo1 selectable in the sidebar Game slots list (kb1 + mo1 marked as shown), no picker in the toolbar');
await sideRow('kb2').click();
await page.waitForTimeout(250);
check((await sideRow('kb2').getAttribute('data-selected')) === '1' && (await sideRow('kb1').getAttribute('data-selected')) === null && (await page.getByTestId('kb-instance').innerText()).trim() === 'kb2', 'clicking kb2 in the sidebar shows kb2');
await page.screenshot({ path: shots + '112-keyboard-kb-mo-picker.png' });
const boundKeys = async () => page.locator('#main button[title]').evaluateAll((bs) => bs.filter((b) => /: [1-9]\d* actions?$/.test(b.title)).map((b) => b.title));
const kb2Keys = (await boundKeys()).filter((t) => !/^(LMB|MMB|RMB|Wheel|Mouse|M\d)/.test(t)); // the mouse block follows the mouse slot (mo1)
check(kb2Keys.length === 1 && /^J:/.test(kb2Keys[0]), `kb2 keyboard shows only kb2 bindings (${kb2Keys.join(', ')})`);
await sideRow('kb2').focus();
await page.keyboard.press('ArrowUp');
await page.waitForTimeout(250);
check((await boundKeys()).length > 50 && (await sideRow('kb1').getAttribute('data-selected')) === '1' && (await page.evaluate(() => document.activeElement?.dataset.slotRow)) === 'kb1', 'arrow up in the sidebar list selects kb1 (and keeps the focus on it): the kb1 bindings are back');
check(await page.getByTestId('flash-badge').count() === 0, 'arrow keys in the slot list are not taken as a keyboard press (no live highlight)');
await page.mouse.move(900, 600);
await page.screenshot({ path: shots + '119-keyboard-sidebar-picker.png' });
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
check(await page.getByTestId('edit-toggle').isVisible(), 'Devices view has the Edit toggle');
const slotChip = async (id) => { await page.getByTestId('sidebar-slots').locator(`[data-slot-row="${id}"]`).click(); await page.waitForTimeout(200); };
const dopts = (await page.getByTestId('sidebar-slots').locator('[data-selectable="1"]').allInnerTexts()).map((x) => x.replace(/\s+/g, ' ').trim());
const dimmed = await page.getByTestId('sidebar-slots').locator('[data-selectable="0"]').evaluateAll((ls) => ls.map((l) => l.dataset.slotRow + ':' + getComputedStyle(l).opacity));
check(await page.getByTestId('device-slot-strip').count() === 0 && dopts.some((o) => /^JS1 VKBsim Gladiator EVO R/.test(o)) && dopts.some((o) => /^JS2 VKBsim Gladiator EVO L/.test(o)) && dopts.some((o) => /^GP1/.test(o)),
  `Devices view: no slot chip bar; the sidebar Game slots list offers the js/gp slots with their hardware (${dopts.join(' | ')})`);
check(!dopts.some((o) => /^(KB|MO)\d/.test(o)) && dimmed.length >= 2 && dimmed.every((d) => /^(kb|mo)\d+:0\.4/.test(d)), `kb / mo rows dimmed in the Devices view (${dimmed.join(', ')})`);
check(await page.getByTestId('device-manage-slots').count() === 0, 'no "Game slots & controllers…" link in the slot bar (the profile card button is the entry point)');
await slotChip('js1');
check(/VKBsim Gladiator EVO R/.test(await page.getByTestId('device-hardware').innerText()), 'slot bar shows the hardware assigned to js1');
check((await page.getByTestId('sidebar-slots').locator('[data-slot-row="js1"]').getAttribute('data-selected')) === '1' && /^JS1/.test((await page.getByTestId('device-slot-badge').innerText()).trim()), 'the picked js1 row is marked in the sidebar; the slot bar names JS1');
await page.mouse.move(900, 600);
await page.waitForTimeout(500);
await page.screenshot({ path: shots + '119-devices-sidebar-picker.png' });
await page.waitForTimeout(300);
{ // the template line: dropdown + icon groups (template tools | picture tools) on the same line, and the slot's axis settings CTA
  const bar = page.getByTestId('device-slot-bar');
  const line = bar.getByTestId('template-line');
  const tools = line.getByTestId('template-tools'), pic = line.getByTestId('picture-tools');
  const labels = await tools.locator('button').evaluateAll((bs) => bs.map((b) => b.getAttribute('aria-label')));
  const titlesOk = await line.locator('button').evaluateAll((bs) => bs.every((b) => b.getAttribute('aria-label') && !b.title && !b.innerText.trim())); // tooltip: the Tip bubble (round 5)
  check(await line.getByTestId('template-select').isVisible() && labels.length === 4 && /Customize a copy|Edit this template/.test(labels[0]) && /^New/.test(labels[1]) && /^Import/.test(labels[2]) && /^Export/.test(labels[3]),
    `template group: Customize a copy, New, Import, Export as icon buttons next to the Template dropdown (${labels.join(' | ')})`);
  check(await pic.locator('button').count() === 2 && /PNG/.test(await pic.getByTestId('device-png').getAttribute('aria-label')) && /Print/.test(await pic.getByTestId('device-print').getAttribute('aria-label')), 'second group: PNG, Print');
  check(titlesOk, 'icon buttons: icon only, with an accessible name (the visible tooltip is checked in round 5)');
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
  check(await dv.getByTestId('chromium-button-notice').getByTestId('firefox-download').isVisible() && await dv.getByRole('button', { name: /Copy link for Firefox/ }).isVisible(),
    'button-limit notice: Firefox logo download link + Copy link for Firefox button');
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
// Edit must be on for bind / unbind / Edit in the panel (view-only when off)
if (!(await page.getByTestId('edit-bar').isVisible().catch(() => false))) { await page.getByTestId('edit-toggle').click(); await page.waitForTimeout(200); }
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
check((await page.getByTestId('sidebar-slots').locator('[data-slot-row="js1"]').getAttribute('data-selected')) === '1' && (await page.getByTestId('sidebar-slots').locator('[data-slot-row="js2"]').getAttribute('data-selected')) === null,
  'press-to-switch moves the sidebar highlight to js1');
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
  // an upload opens the picture preparation (remove background / format); "Keep original" stores it as uploaded
  await page.getByTestId('photo-prep-before').waitFor({ timeout: 5000 });
  check(await page.getByTestId('photo-prep-remove').isVisible() && await page.getByTestId('photo-prep-format').isVisible() && await page.getByTestId('photo-prep-use').isDisabled(), 'upload opens the picture preparation (Remove background / Format only; nothing to use yet)');
  await page.getByTestId('photo-prep-keep').click();
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
{ // Orion Combat Rudder Pedals: faithful Federico export (exact anchor+box); Left Buttons chips = DI numbers 2,7,8,9,10
  await dv.getByTestId('template-select').selectOption('builtin-winctrl-orion-pedals');
  await page.waitForTimeout(600);
  check((await dv.locator('[data-callout]').count()) === 6, 'Orion pedals: 6 callouts');
  const left = dv.locator('[data-callout="lbtns"]');
  check(await left.isVisible(), 'Orion pedals: Left Buttons callout visible');
  const leftTxt = await left.innerText();
  check(/2/.test(leftTxt) && /7/.test(leftTxt) && /8/.test(leftTxt) && /9/.test(leftTxt) && /10/.test(leftTxt)
    && !/\b1\s*2\b/.test(leftTxt.replace(/\n/g, ' ')),
    `Orion pedals Left Buttons chips show DI numbers 2/7/8/9/10 (not invented 1..n) (${leftTxt.replace(/\n/g, ' | ').slice(0, 120)})`);
  // stored fractions are asserted in unit tests (DOM labels may be nudged to avoid overlap)
  await dv.getByTestId('device-canvas').screenshot({ path: shots + '124-orion-faithful.png' });
  await dv.getByTestId('template-select').selectOption('');
  await page.waitForTimeout(300);
}
{ // Honeycomb Bravo: researched DI callouts on Federico photo
  await dv.getByTestId('template-select').selectOption('builtin-honeycomb-bravo');
  await page.waitForTimeout(600);
  check((await dv.locator('[data-callout]').count()) === 17, 'Bravo: 17 callouts');
  const ap = dv.locator('[data-callout="ap"]');
  check(await ap.isVisible(), 'Bravo: AP modes callout visible');
  const apTxt = await ap.innerText();
  check(/1/.test(apTxt) && /7/.test(apTxt), `Bravo AP chips show DI 1–7 (${apTxt.replace(/\n/g, ' | ').slice(0, 100)})`);
  await dv.getByTestId('device-canvas').screenshot({ path: shots + '125-bravo-builtin.png' });
  { // Federico's positions: each marker centre sits on its exported anchor fraction
    const off = await dv.evaluate((root) => {
      const view = root.querySelector('[data-testid=device-canvas-view][data-view=main], [data-testid=device-canvas]');
      const r = view.getBoundingClientRect();
      const at = { apsel: [0.42243348328332936, 0.3188625338925878], l6: [0.6840303950436668, 0.6769308877231421], rev: [0.6049429889867515, 0.8869258235407149] };
      return Object.entries(at).map(([id, [x, y]]) => { const m = root.querySelector(`[data-marker="${id}"] circle`).getBoundingClientRect(); return Math.hypot((m.x + m.width / 2 - r.x) / r.width - x, (m.y + m.height / 2 - r.y) / r.height - y); });
    });
    check(off.every((d) => d < 0.006), `Bravo markers on Federico's anchors (max off ${Math.max(...off).toFixed(4)})`);
  }
  await dv.getByTestId('device-canvas').screenshot({ path: shots + '128-bravo-federico.png' });
  await dv.getByTestId('template-select').selectOption('');
  await page.waitForTimeout(300);
}
{ // MOZA AB6: faithful Federico export (exact coords)
  await dv.getByTestId('template-select').selectOption('builtin-moza-ab6');
  await page.waitForTimeout(600);
  check((await dv.locator('[data-callout]').count()) === 19, 'MOZA AB6: 19 callouts');
  const front = dv.locator('[data-testid=device-canvas-view][data-view=front]');
  const back = dv.locator('[data-testid=device-canvas-view][data-view=back]');
  check(await front.count() === 1 && await back.count() === 1, 'MOZA AB6: front + back photo pages');
  await front.scrollIntoViewIfNeeded();
  await front.screenshot({ path: shots + '126-moza-ab6-faithful-front.png' });
  await back.scrollIntoViewIfNeeded();
  await back.screenshot({ path: shots + '126-moza-ab6-faithful-back.png' });
  await dv.getByTestId('template-select').selectOption('');
  await page.waitForTimeout(300);
}
{ // URSA Combat: faithful Federico export
  await dv.getByTestId('template-select').selectOption('builtin-winctrl-ursa-combat');
  await page.waitForTimeout(600);
  check((await dv.locator('[data-callout]').count()) === 32, 'URSA: 32 callouts');
  const base = dv.locator('[data-testid=device-canvas-view][data-view=base]');
  await base.scrollIntoViewIfNeeded();
  await base.screenshot({ path: shots + '127-ursa-faithful-base.png' });
  await dv.getByTestId('template-select').selectOption('');
  await page.waitForTimeout(300);
}
{ // CarrierAce UFC + HUD: Federico's WinCtrl diagrams (UFC 1-41 incl. top toggles 33-38, HUD 65-83 + X/Y/Z/Dial)
  await dv.getByTestId('template-select').selectOption('builtin-winctrl-carrierace-ufc-hud');
  await page.waitForTimeout(600);
  check((await dv.locator('[data-callout]').count()) === 25, 'UFC + HUD: 25 callouts');
  const ufc = dv.locator('[data-testid=device-canvas-view][data-view=ufc]');
  const hud = dv.locator('[data-testid=device-canvas-view][data-view=hud]');
  check(await ufc.count() === 1 && await hud.count() === 1, 'UFC + HUD: UFC + HUD photo pages');
  const kp = (await dv.locator('[data-callout="keypad"]').innerText()).replace(/\n/g, ' ');
  check(/\b2\b/.test(kp) && /\b13\b/.test(kp), `UFC keypad chips show DI 2-13 (${kp.slice(0, 100)})`);
  const crs = (await dv.locator('[data-callout="crs"]').innerText()).replace(/\n/g, ' ');
  check(/81/.test(crs) && /83/.test(crs), `HUD CRS chips show 81-83 (${crs.slice(0, 80)})`);
  await page.setViewportSize({ width: 1680, height: 1600 }); // each whole photo page clear of the sticky header
  await ufc.scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  await ufc.screenshot({ path: shots + '129-ufc-front.png' });
  await hud.scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  await hud.screenshot({ path: shots + '130-ufc-hud.png' });
  await page.setViewportSize({ width: 1680, height: 1000 });
  await dv.getByTestId('template-select').selectOption('');
  await page.waitForTimeout(300);
}
{ // CarrierAce PTO 2: Federico's WinCtrl diagram (1, 3-41)
  await dv.getByTestId('template-select').selectOption('builtin-winctrl-carrierace-pto2');
  await page.waitForTimeout(600);
  check((await dv.locator('[data-callout]').count()) === 14, 'PTO 2: 14 callouts');
  const sj = (await dv.locator('[data-callout="seljett"]').innerText()).replace(/\n/g, ' ');
  check(/17/.test(sj) && /21/.test(sj), `PTO 2 SELECT JETT chips show 17-21 (${sj.slice(0, 80)})`);
  await dv.getByTestId('device-canvas').screenshot({ path: shots + '132-pto2.png' });
  await dv.getByTestId('template-select').selectOption('');
  await page.waitForTimeout(300);
}
{ // MOZA AB6 base + other grips: grip variants of the AB6 (same USB id, never auto-linked), one photo page per view
  const sel = dv.getByTestId('template-select');
  const GRIPS = [
    ['builtin-moza-ab6-mh16', 19, [['front', '133-moza-ab6-mh16-front'], ['side', '134-moza-ab6-mh16-side']], ['castle', /20/, /24/]],
    ['builtin-moza-ab6-carrierace', 16, [['front', '135-moza-ab6-carrierace-front'], ['side', '136-moza-ab6-carrierace-side'], ['rear', '137-moza-ab6-carrierace-rear']], ['hatC', /21/, /25/]],
    ['builtin-moza-ab6-viperace', 21, [['front', '138-moza-ab6-viperace-front'], ['side', '139-moza-ab6-viperace-side']], ['hatE', /36/, /40/]],
  ];
  check(await sel.locator('optgroup[data-group=grips]').count() === 0, 'grip variants: no “Grips for this base” group when the slot is not an AB6');
  check(await sel.locator('optgroup[data-group=MOZA] option[value="builtin-moza-ab6-mh16"]').count() === 1, 'grip variants listed under MOZA in the template picker');
  await page.setViewportSize({ width: 1680, height: 1600 }); // each whole photo page clear of the sticky header
  for (const [id, n, views, [cid, lo, hi]] of GRIPS) {
    await sel.selectOption(id);
    await page.waitForTimeout(600);
    check((await dv.locator('[data-callout]').count()) === n, `${id}: ${n} callouts (${await dv.locator('[data-callout]').count()})`);
    const chips = (await dv.locator(`[data-callout="${cid}"]`).innerText()).replace(/\n/g, ' ');
    check(lo.test(chips) && hi.test(chips), `${id}: ${cid} chips show its DI numbers (${chips.slice(0, 80)})`);
    const keys = (await dv.locator('[data-callout="bkeys"]').innerText()).replace(/\n/g, ' ');
    check(/49/.test(keys) && /52/.test(keys), `${id}: AB6 base keys 49-52 (${keys.slice(0, 60)})`);
    check(/Firefox/.test(await dv.getByTestId('chromium-button-notice').innerText().catch(() => '')), `${id}: buttons up to 62 -> Chromium notice points to Firefox`);
    for (const [v, file] of views) {
      const page_ = dv.locator(`[data-testid=device-canvas-view][data-view=${v}]`);
      check(await page_.count() === 1, `${id}: ${v} photo page`);
      await page_.scrollIntoViewIfNeeded();
      await page.waitForTimeout(250);
      await page_.screenshot({ path: shots + file + '.png' });
    }
  }
  await page.setViewportSize({ width: 1680, height: 1000 });
  await sel.selectOption('');
  await page.waitForTimeout(300);
}
{ // rudder pedal built-ins: one photo page each, axis chips, markers on the measured spots (photo fractions -> canvas)
  const sel = dv.getByTestId('template-select');
  const sizes = Object.fromEntries([...readFileSync(new URL('../src/lib/devicePhotoSizes.ts', import.meta.url), 'utf8').matchAll(/"([\w-]+)": \[ (\d+), (\d+),/g)].map((m) => [m[1], [Number(m[2]), Number(m[3])]]));
  const PEDALS = [ // id, photo, screenshot, { callout: [chip, photo x, photo y] }
    ['builtin-honeycomb-charlie', 'honeycomb-charlie-main', '141-pedals-honeycomb-charlie', { ltoe: ['X', 0.17, 0.22], rtoe: ['Y', 0.66, 0.14], rudder: ['Z', 0.42, 0.3] }],
    ['builtin-logitech-flight-rudder', 'logitech-flight-rudder-main', '142-pedals-logitech-flight-rudder', { ltoe: ['X', 0.37, 0.12], rtoe: ['Y', 0.79, 0.28], rudder: ['RZ', 0.5, 0.47] }],
    ['builtin-mfg-crosswind', 'mfg-crosswind-v3-main', '143-pedals-mfg-crosswind-v3', { ltoe: ['X', 0.13, 0.22], rtoe: ['Y', 0.74, 0.18], rudder: ['RZ', 0.5, 0.6] }],
    ['builtin-tm-tfrp', 'tm-tfrp-main', '144-pedals-tm-tfrp', { ltoe: ['Y', 0.36, 0.14], rtoe: ['X', 0.8, 0.22], rudder: ['Z', 0.48, 0.6] }],
    ['builtin-tm-tpr', 'tm-tpr-main', '145-pedals-tm-tpr', { ltoe: ['Y', 0.19, 0.33], rtoe: ['X', 0.82, 0.52], rudder: ['Z', 0.45, 0.3] }],
    ['builtin-virpil-r1-falcon', 'virpil-r1-falcon-main', '146-pedals-virpil-r1-falcon', { ltoe: ['S1', 0.18, 0.3], rtoe: ['S2', 0.77, 0.2], rudder: ['Z', 0.48, 0.55] }],
    ['builtin-vkb-t-rudder', 'vkb-t-rudder-main', '147-pedals-vkb-t-rudder', { rudder: ['RX', 0.47, 0.38] }],
  ];
  await page.setViewportSize({ width: 1680, height: 1600 }); // the whole photo page clear of the sticky header
  for (const [id, photo, file, cs] of PEDALS) {
    await sel.selectOption(id);
    await page.waitForTimeout(600);
    const n = Object.keys(cs).length;
    check((await dv.locator('[data-callout]').count()) === n, `${id}: ${n} axis callouts`);
    const view = dv.locator('[data-testid=device-canvas-view][data-view=main]');
    check((await view.count()) === 1 && (await view.locator('img').first().getAttribute('src') ?? '').includes(`/device-photos/${photo}.webp`), `${id}: its pedal photo`);
    const chips = {};
    for (const cid of Object.keys(cs)) chips[cid] = (await dv.locator(`[data-callout="${cid}"]`).innerText()).replace(/\n/g, ' ');
    check(Object.entries(cs).every(([cid, [chip]]) => new RegExp(`\\b${chip}\\b`).test(chips[cid])) && /Rudder/.test(chips.rudder), `${id}: axis chips ${Object.entries(cs).map(([cid, [chip]]) => `${cid}=${chip}`).join(' ')} (${Object.values(chips).join(' | ').slice(0, 120)})`);
    const [pw, ph] = sizes[photo], W = Math.round(pw + 0.6 * ph), gx = (W - pw) / 2;
    const want = Object.fromEntries(Object.entries(cs).map(([cid, [, x, y]]) => [cid, [(gx + x * pw) / W, y]]));
    const off = await dv.evaluate((root, want) => {
      const r = root.querySelector('[data-testid=device-canvas-view][data-view=main]').getBoundingClientRect();
      return Object.entries(want).map(([cid, [x, y]]) => { const m = root.querySelector(`[data-marker="${cid}"] circle`).getBoundingClientRect(); return Math.hypot((m.x + m.width / 2 - r.x) / r.width - x, (m.y + m.height / 2 - r.y) / r.height - y); });
    }, want);
    check(off.every((d) => d < 0.006), `${id}: markers on the measured pedal spots (max off ${Math.max(...off).toFixed(4)})`);
    await view.scrollIntoViewIfNeeded();
    await page.waitForTimeout(250);
    await view.screenshot({ path: shots + file + '.png' });
  }
  await page.setViewportSize({ width: 1680, height: 1000 });
  await sel.selectOption('');
  await page.waitForTimeout(300);
}
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
{ // AB6 grip variants: offered under the AB6 in the Template list of the AB6 stick slot only (Automatic stays the plain AB6); a pick sticks
  const stickRow = fpanel.locator(`[data-testid=slot-row][data-slot="${moza133}"]`);
  const otherRow = fpanel.locator(`[data-testid=slot-row][data-slot="${mozaSlots.find(([id]) => id !== moza133)[0]}"]`);
  const tsel = stickRow.getByTestId('slot-template');
  const grips = await tsel.locator('optgroup[data-group=grips] option').allInnerTexts();
  const autoTxt = await tsel.locator('option[value=""]').innerText();
  check(/MOZA AB6 base \+ MHG/.test(autoTxt) && grips.length === 4 && /MHG/.test(grips[0]) && /MH16/.test(grips[1]) && /CarrierAce/.test(grips[2]) && /ViperAce/.test(grips[3]),
    `AB6 stick slot: Automatic = plain AB6, “Grips for this base” = AB6 + MH16 / CarrierAce / ViperAce (${autoTxt} | ${grips.join(' | ')})`);
  check(await otherRow.getByTestId('slot-template').locator('optgroup[data-group=grips]').count() === 0, 'the other AB6 (guessed MTQ throttle) has no grip group');
  await tsel.selectOption('builtin-moza-ab6-viperace');
  await fp.waitForTimeout(300);
  check((await tsel.inputValue()) === 'builtin-moza-ab6-viperace' && /picked by you/.test(await stickRow.innerText()), 'picking the ViperAce grip variant sticks on the AB6 slot');
  await stickRow.scrollIntoViewIfNeeded();
  await stickRow.screenshot({ path: shots + '140-ab6-grip-variant-picked.png' });
  await tsel.selectOption('');
  await fp.waitForTimeout(300);
  check((await tsel.inputValue()) === '', 'back to Automatic (plain AB6)');
}
await fpanel.getByTestId('tab-tester').click();
await fp.waitForTimeout(400);
// round 5: a press scrolls its device card into sight and flashes it (held buttons don't repeat; the user scrolling wins)
{
  await fpanel.evaluate((el) => el.scrollTo(0, 0));
  await fp.waitForTimeout(200);
  const cardOf = (i) => fpanel.locator('[data-testid=tester-device]').nth(i);
  const inSight = (i) => cardOf(i).evaluate((el) => { const r = el.getBoundingClientRect(); return r.top >= -1 && r.bottom <= window.innerHeight + 1; });
  check(!(await inSight(14)), 'precondition: the last device (Bravo) is out of sight');
  await fp.evaluate(() => window.__btn(14, 3, true));
  await fp.waitForTimeout(900);
  check(await inSight(14) && (await cardOf(14).getAttribute('data-flash')) !== null && await cardOf(14).locator('[data-tester-button="3"].tester-flash-chip').count() === 1,
    'input tester: a press on the last device scrolls its card into sight and flashes it (and the button)');
  await fp.screenshot({ path: shots + '114-input-tester-follow.png' });
  const top1 = await fpanel.evaluate((el) => el.scrollTop);
  await fp.mouse.move(800, 500);
  await fp.mouse.wheel(0, -1500);
  await fp.waitForTimeout(400);
  const top2 = await fpanel.evaluate((el) => el.scrollTop);
  await fp.evaluate(() => window.__btn(14, 3, false));
  await fp.evaluate(() => window.__btn(14, 4, true));
  await fp.waitForTimeout(700);
  check(top2 < top1 && Math.abs((await fpanel.evaluate((el) => el.scrollTop)) - top2) < 2, `right after the user scrolled, a press doesn't pull the page back (${top1} -> ${top2})`);
  await fp.evaluate(() => window.__btn(14, 4, false));
  await fp.waitForTimeout(2100);
  await fp.evaluate(() => window.__btn(14, 5, true));
  await fp.waitForTimeout(900);
  check(await inSight(14), 'after the pause, presses follow again');
  const t3 = await fpanel.evaluate((el) => el.scrollTop);
  await fp.evaluate(() => window.__btn(0, 1, true)); // held: one scroll to device #0, no fighting afterwards
  await fp.waitForTimeout(900);
  const t4 = await fpanel.evaluate((el) => el.scrollTop);
  await fpanel.evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await fp.waitForTimeout(2300);
  check(t4 < t3 && (await fpanel.evaluate((el) => el.scrollTop)) > t4 + 100, 'a held button scrolls once, then lets the user scroll away');
  await fp.evaluate(() => { window.__btn(0, 1, false); window.__btn(14, 5, false); });
  await fp.waitForTimeout(200);
}
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
  const st = async (id) => { await fp.locator(`[data-slot-row="${id}"]`).click(); await fp.waitForTimeout(250); return fp.getByTestId('device-status').innerText(); };
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
  const fchipSel = async (id) => { await fp.getByTestId('sidebar-slots').locator(`[data-slot-row="${id}"]`).click(); await fp.waitForTimeout(250); };
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
  if (!(await fp.getByTestId('edit-bar').isVisible().catch(() => false))) { await fp.getByTestId('edit-toggle').click(); await fp.waitForTimeout(200); }
  await fip.getByLabel('Search actions to bind').fill('landing system');
  await fip.getByTestId('bind-results').locator('button').first().click();
  await fp.waitForTimeout(300);
  // js9: the game keeps axis / curve settings for js1–js8 only
  await fchipSel('js9');
  const fbar = fp.getByTestId('device-slot-bar');
  const lockTxt = await fbar.getByTestId('axis-locked').innerText();
  check(await fbar.getByTestId('slot-axis-settings').isDisabled() && /The game lists this device as js9; Star Citizen only allows axis, inversion and curve tuning on js1–js8\. The order comes from the game and Windows USB order, not this app\. To tune it, change which devices connect first, then refresh game state here\./.test(lockTxt)
    && !/reorder/i.test(lockTxt) && await fbar.getByTestId('axis-refresh').isVisible(),
    `js9: Axis settings CTA disabled; the note says the order comes from the game / USB order, not the app (${lockTxt.slice(0, 70)}…)`);
  await fp.screenshot({ path: shots + '113-js9-note.png' });
  const fside = fp.getByTestId('sidebar-slots');
  check(await fside.locator('[data-slot-row="js9"] [data-testid=slot-axis-locked]').count() === 1 && await fside.locator('[data-slot-row="js8"] [data-testid=slot-axis-locked]').count() === 0 && (await fside.locator('[data-slot-row="js9"]').getAttribute('data-selected')) === '1',
    'sidebar: js9 row selected, with the subtle "no curves" marker (js8 has none)');
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
  check(/Move mappings js1 ⇄ js2/.test(await fpanel.getByTestId('slot-move-notice').innerText()) && /game's own device order is never changed/.test(await fpanel.getByTestId('slot-move-notice').innerText()), 'move notice with Undo (says the game order is unchanged)');
  check(/Move mappings to the next slot \(use when the game renumbered your devices\)/.test(await fRow('js1').getByTestId('slot-move-down').getAttribute('title') ?? '')
    && /use when the game renumbered your devices/.test(await fRow('js2').getByTestId('slot-move-up').getAttribute('aria-label') ?? ''), 'arrows are labelled as moving mappings, not changing the game order');
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

// ---- refresh game state: a fresh export with renumbered devices, dropped on the page (round 4)
console.log('\nrefresh game state (drop a reshuffled export)');
{
  const rc = await browser.newContext({ viewport: { width: 1680, height: 1000 }, deviceScaleFactor: 1 });
  const rp = await rc.newPage();
  rp.on('pageerror', (e) => errors.push(String(e)));
  await rp.goto(url, { waitUntil: 'networkidle' });
  await rp.evaluate(() => localStorage.clear());
  await rp.reload({ waitUntil: 'networkidle' });
  const tuned = readFileSync('scripts/fixtures/round4-tuned.xml', 'utf8');
  const replugged = readFileSync('scripts/fixtures/round4-replugged.xml', 'utf8');
  /** synthetic file drag: enter (shows the overlay, hovering a zone), then drop on that zone */
  const dragIn = (name, text, zone) => rp.evaluate(({ name, text, zone }) => {
    const dt = new DataTransfer();
    dt.items.add(new File([text], name, { type: 'text/xml' }));
    window.__dt = dt;
    document.body.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true, cancelable: true }));
    return new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => {
      const el = document.querySelector(`[data-drop-zone="${zone}"]`) ?? document.body;
      el.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }));
      res(!!document.querySelector(`[data-drop-zone="${zone}"]`));
    })));
  }, { name, text, zone });
  const dropOn = (zone) => rp.evaluate((zone) => {
    const el = document.querySelector(`[data-drop-zone="${zone}"]`) ?? document.body;
    el.dispatchEvent(new DragEvent('drop', { dataTransfer: window.__dt, bubbles: true, cancelable: true }));
  }, zone);
  const drop = async (name, text, zone) => { await dragIn(name, text, zone); await rp.waitForTimeout(120); await dropOn(zone); await rp.waitForTimeout(400); };
  const rtoast = () => rp.locator('.fixed.bottom-5.right-5').innerText().catch(() => '');

  check(await rp.getByTestId('profile-refresh').count() === 0, 'no profile: no Refresh game state entry next to the slots');
  const zoned = await dragIn('round4-tuned.xml', tuned, 'refresh');
  check(!zoned && await rp.getByTestId('drop-overlay').isVisible() && await rp.locator('[data-drop-zone=import]').count() === 1, 'no profile: the drop overlay only imports');
  await dropOn('import');
  await rp.waitForTimeout(400);
  check(/Imported “round4-tuned/.test(await rtoast()) && await rp.getByTestId('drop-overlay').count() === 0, 'dropped file imported as a profile');
  check(await rp.getByTestId('profile-refresh').isVisible() && await rp.getByTestId('game-path').first().isVisible(), 'profile card: Refresh entry and the usual folder path with a copy button');
  check(/StarCitizen\\LIVE\\user\\client\\0\\Controls\\Mappings\\/.test(await rp.getByTestId('game-path').first().innerText()), 'the path reads StarCitizen\\LIVE\\user\\client\\0\\Controls\\Mappings\\');

  // the overlay with a profile: Refresh game state (default) vs Import as profile
  await dragIn('round4-replugged.xml', replugged, 'refresh');
  check(await rp.getByTestId('drop-refresh').isVisible() && await rp.getByTestId('drop-import').isVisible(), 'with a profile the overlay offers Refresh game state and Import as profile');
  await rp.screenshot({ path: shots + '113-drop-overlay.png' });
  await dropOn('refresh');
  await rp.waitForTimeout(400);
  const banner = rp.getByTestId('rematch-banner');
  const btxt = await banner.innerText().catch(() => '');
  check(await banner.isVisible() && /Orion Pedals js3 → js5/.test(btxt) && /CarrierAce MFD L js5 → js3/.test(btxt) && await banner.getByTestId('rematch-move').count() === 2,
    `refresh shows the renumbering (${(await banner.getByTestId('rematch-summary').innerText().catch(() => '')).replace(/\s+/g, ' ')})`);
  check(await rp.locator('#profile option').count() === 2, 'a refresh drop does not add a profile');
  await rp.screenshot({ path: shots + '113-rematch-banner.png' });
  await banner.getByTestId('rematch-apply').click();
  await rp.waitForTimeout(400);
  check(await banner.count() === 0 && /Mappings moved to the game's device order/.test(await rtoast()), 'Apply moves the mappings (toast)');
  await rp.getByTestId('open-slots').click();
  await rp.waitForTimeout(300);
  const rpanel = rp.getByTestId('controllers-panel');
  const rRow = (id) => rpanel.locator(`[data-testid=slot-row][data-slot="${id}"]`);
  check(/CarrierAce MFD L/.test(await rRow('js3').innerText()) && /Orion Pedals/.test(await rRow('js5').innerText()), 'slots now follow the game: js3 CarrierAce MFD L, js5 Orion Pedals');
  check((await rRow('js5').getByTestId('slot-count').innerText()) === '(1 custom)' && (await rRow('js3').getByTestId('slot-count').innerText()) === '(2 custom)', 'bindings moved with them (pedal yaw on js5, MFD bindings on js3)');
  check(/Refresh game state \(2 devices renumbered\)/.test(await rpanel.getByTestId('slot-move-notice').innerText()) && await rpanel.getByTestId('game-state-strip').getByTestId('refresh-game-state').isEnabled(), 'one undo step, with Refresh game state at the top of the Game slots tab');
  await rp.screenshot({ path: shots + '113-after-apply-slots-modal.png' });
  await rpanel.getByTestId('slot-move-undo').click();
  await rp.waitForTimeout(300);
  check(/Orion Pedals/.test(await rRow('js3').innerText()) && (await rRow('js3').getByTestId('slot-count').innerText()) === '(1 custom)', 'Undo restores the old numbering in one step');
  // refresh from the modal's button (file picker)
  await rp.getByTestId('refresh-file').setInputFiles({ name: 'round4-replugged.xml', mimeType: 'text/xml', buffer: Buffer.from(replugged) });
  await rp.waitForTimeout(300);
  check(await rpanel.getByTestId('rematch-banner').isVisible(), 'the modal\'s Refresh game state button shows the banner inside the modal');
  await rpanel.getByTestId('rematch-apply').click();
  await rp.waitForTimeout(300);
  await rp.keyboard.press('Escape');
  await rp.waitForTimeout(200);
  // the same export again: nothing to do
  await drop('round4-replugged.xml', replugged, 'refresh');
  check(/Game device order unchanged/.test(await rtoast()) && await rp.getByTestId('rematch-banner').count() === 0, 'refreshing with the same order: "Game device order unchanged"');
  await rp.screenshot({ path: shots + '113-unchanged-toast.png' });
  // importing the older file as a profile: ask first, offering to shift it to the current order
  await drop('round4-tuned.xml', tuned, 'import');
  const ask = rp.getByTestId('import-shift');
  check(await ask.isVisible() && /Orion Pedals js3 → js5/.test(await ask.innerText()), 'importing an older file over a profile with another device order asks first');
  await rp.screenshot({ path: shots + '113-import-shift-ask.png' });
  await ask.getByTestId('import-shift-apply').click();
  await rp.waitForTimeout(400);
  check(/shifted to the current game order/.test(await rtoast()) && await rp.locator('#profile option').count() === 3, 'shifted import adds the profile');
  await rp.getByTestId('open-slots').click();
  await rp.waitForTimeout(300);
  check(/Orion Pedals/.test(await rRow('js5').innerText()) && (await rRow('js5').getByTestId('slot-count').innerText()) === '(1 custom)', 'the shifted profile has the pedal bindings on js5');

  // ---- round 5: modal header = title row + tabs + a lone close button; refresh + folder live in the Game slots tab
  console.log('\nround 5: controllers header, settings folder, sticky device lines, tooltips, view vs editor');
  await rpanel.evaluate((el) => el.scrollTo(0, 0));
  const hdr = rpanel.getByTestId('controllers-header');
  const hb = await hdr.boundingBox(), cb = await hdr.getByTestId('controllers-close').boundingBox(), tb = await hdr.locator('h2').boundingBox();
  check(await hdr.getByTestId('refresh-game-state').count() === 0 && await hdr.getByTestId('game-path').count() === 0, 'header: no Refresh game state / path any more');
  check(Math.abs((cb.y + cb.height / 2) - (tb.y + tb.height / 2)) <= 3 && hb.x + hb.width - (cb.x + cb.width) <= 24, `header: close button alone at the top right, aligned with the title row (Δy ${Math.round((cb.y + cb.height / 2) - (tb.y + tb.height / 2))}px)`);
  const strip = rpanel.getByTestId('game-state-strip');
  check(await strip.getByTestId('refresh-game-state').isVisible() && /or drag the exported file anywhere onto the page/.test(await strip.innerText()) && await strip.getByTestId('game-path-copy').isVisible(),
    'Game slots tab: strip with Refresh game state, the drag hint and the folder + copy');
  const panelBox = await rpanel.locator('.hud-panel').first().boundingBox();
  await rp.screenshot({ path: shots + '114-controllers-header.png', clip: { x: panelBox.x - 10, y: Math.max(0, panelBox.y - 10), width: panelBox.width + 20, height: 330 } });
  await rpanel.getByTestId('tab-tester').click();
  await rp.waitForTimeout(200);
  check(await rpanel.getByTestId('game-state-strip').count() === 0, 'Input tester tab: no refresh strip');
  await rp.keyboard.press('Escape');
  await rp.waitForTimeout(200);
  check(/or drag the exported file anywhere onto the page/.test(await rp.getByTestId('profile-drop-hint').innerText()), 'profile card: the drag hint next to Refresh');

  // ---- settings: Star Citizen folder + channel -> mappings folder everywhere
  await rp.getByTestId('open-settings').click();
  const sm = rp.getByTestId('settings-modal');
  check((await sm.getByTestId('setting-game-root').inputValue()) === 'C:\\Program Files\\Roberts Space Industries\\StarCitizen' && (await sm.getByTestId('setting-game-channel').inputValue()) === 'LIVE', 'settings: default game folder and LIVE');
  await sm.getByTestId('setting-game-root').fill('  d:/Games//StarCitizen/  ');
  await sm.getByTestId('setting-game-root').press('Enter');
  await sm.getByTestId('setting-game-channel').selectOption('PTU');
  await rp.waitForTimeout(150);
  const want = 'D:\\Games\\StarCitizen\\PTU\\user\\client\\0\\Controls\\Mappings\\';
  check((await sm.getByTestId('setting-game-root').inputValue()) === 'D:\\Games\\StarCitizen' && (await sm.getByTestId('game-path-text').innerText()).trim() === want,
    `settings: folder normalised and the mappings folder derived (${(await sm.getByTestId('game-path-text').innerText()).trim()})`);
  await rp.screenshot({ path: shots + '114-settings-game-folder.png' });
  await sm.getByTestId('setting-game-root').fill('E:\\SC\\StarCitizen\\EPTU\\user\\client\\0\\Controls\\Mappings\\');
  await sm.getByTestId('setting-game-root').press('Enter');
  await rp.waitForTimeout(150);
  check((await sm.getByTestId('setting-game-root').inputValue()) === 'E:\\SC\\StarCitizen' && (await sm.getByTestId('setting-game-channel').inputValue()) === 'EPTU', 'settings: a pasted mappings path is cut back to the game folder and its channel');
  await sm.getByTestId('setting-game-root').fill('D:/Games/StarCitizen');
  await sm.getByTestId('setting-game-root').press('Enter');
  await sm.getByTestId('setting-game-channel').selectOption('PTU');
  await rp.keyboard.press('Escape');
  await rp.reload({ waitUntil: 'networkidle' });
  check((await rp.getByTestId('profile-panel').getByTestId('game-path-text').innerText()).trim() === want, 'the folder persists (reload) and the profile card shows it');
  await rp.getByTestId('open-slots').click();
  await rp.waitForTimeout(200);
  check((await rpanel.getByTestId('game-state-strip').getByTestId('game-path-text').innerText()).trim() === want, 'the Game slots strip shows the same folder');
  await rp.keyboard.press('Escape');

  // ---- Devices: the hardware / template line and the Groups + legend line stick while the picture scrolls
  await rp.locator('[data-view-tab=devices]').click();
  await rp.waitForTimeout(400);
  await rp.getByTestId('sidebar-slots').locator('[data-slot-row="js4"]').click();
  await rp.getByTestId('template-select').selectOption('builtin-winctrl-ursa-combat');
  await rp.waitForTimeout(1500);
  const gl = rp.getByTestId('device-groups-line');
  check(await gl.getByText('customized').isVisible() && await gl.getByRole('button', { name: 'All' }).isVisible(), 'legend moved onto the Groups line');
  const scroller = await rp.evaluate(() => { const m = document.getElementById('main'); return { main: m.scrollHeight > m.clientHeight + 100, wrap: (() => { const w = document.querySelector('[data-print-area]'); return w.scrollHeight > w.clientHeight + 1; })() }; });
  check(scroller.main && !scroller.wrap, 'Devices: <main> is the element that scrolls (not the canvas wrapper)');
  await rp.evaluate(() => document.getElementById('main').scrollBy(0, 900));
  await rp.waitForTimeout(300);
  const st = await rp.evaluate(() => {
    const m = document.getElementById('main').getBoundingClientRect();
    const line = document.querySelector('[data-testid=device-slot-line]').getBoundingClientRect();
    const grp = document.querySelector('[data-testid=device-groups-line]').getBoundingClientRect();
    const hit = (r) => { const el = document.elementFromPoint(r.left + 40, r.top + r.height / 2); return !!el?.closest('[data-sticky-head]'); };
    const bar = document.querySelector('[data-testid=device-slot-bar]').getBoundingClientRect();
    return { lineTop: line.top - m.top, barTop: bar.top - m.top, grpTop: grp.top - line.bottom, onTop: hit(line) && hit(grp), scrolled: document.getElementById('main').scrollTop };
  });
  check(st.scrolled >= 800 && Math.abs(st.barTop) < 1.5 && st.lineTop >= -1 && st.lineTop < 16 && st.grpTop >= -1 && st.grpTop < 30 && st.onTop,
    `scrolled ${st.scrolled}px: the slot bar (slot · hardware / template line) stuck at the top (line at ${Math.round(st.lineTop)}px), Groups line under it (${Math.round(st.grpTop)}px), both above the callouts`);
  await rp.screenshot({ path: shots + '114-devices-sticky-lines.png' });
  // the page headings of a multi-page template stick right under the Groups line while their page scrolls by
  {
    const pageState = () => rp.evaluate(() => {
      const m = document.getElementById('main');
      const grp = document.querySelector('[data-testid=device-groups-line]').getBoundingClientRect();
      return [...document.querySelectorAll('[data-page-heading]')].map((h) => {
        const r = h.getBoundingClientRect(), page = h.parentElement.getBoundingClientRect();
        // is the heading painted above the picture's callouts / lines? (hit-test it as if it took the pointer)
        h.style.pointerEvents = 'auto';
        const hitEl = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        h.style.pointerEvents = '';
        const cs = getComputedStyle(h);
        return { id: h.dataset.pageHeading, text: h.textContent, stuck: h.dataset.stuck === '1', dTop: r.top - grp.bottom, visible: r.bottom > grp.bottom + 1, onTop: !!hitEl && h.contains(hitEl),
          bg: cs.backgroundColor, z: Number(cs.zIndex), pageTop: page.top - grp.bottom, pageH: page.height, scroll: m.scrollTop };
      });
    });
    // twice: the sticky lines themselves only stop moving once they stick
    const scrollPage = (k, frac) => rp.evaluate(({ k, frac }) => {
      const m = document.getElementById('main');
      for (let i = 0; i < 2; i++) {
        const grp = document.querySelector('[data-testid=device-groups-line]').getBoundingClientRect();
        const page = document.querySelectorAll('[data-page-heading]')[k].parentElement.getBoundingClientRect();
        m.scrollBy(0, page.top - grp.bottom + page.height * frac);
      }
    }, { k, frac });
    await rp.evaluate(() => document.getElementById('main').scrollTo(0, 0));
    await rp.waitForTimeout(300);
    const s0 = await pageState();
    check(s0.length >= 2 && s0.every((h) => !h.stuck && Math.abs(h.pageTop - (h.dTop)) < 1) && s0[0].bg === 'rgba(0, 0, 0, 0)', `URSA: ${s0.length} page headings (${s0.map((h) => h.text).join(' | ')}) sit on their pictures at rest, transparent`);
    await scrollPage(0, 0.5);
    await rp.waitForTimeout(300);
    const s1 = await pageState();
    const opaque = (bg) => /^rgb\(/.test(bg) || /, 1\)$/.test(bg);
    check(s1[0].stuck && Math.abs(s1[0].dTop) < 1 && s1[0].onTop && opaque(s1[0].bg) && s1[0].z > 30 && s1[0].z < 40 && !s1[1].stuck,
      `mid-way into page 1: “${s1[0].text}” stuck right under the Groups line (${s1[0].dTop.toFixed(1)}px), opaque (${s1[0].bg}), above the callouts (z ${s1[0].z}), below the sticky lines`);
    await scrollPage(1, 0.5);
    await rp.waitForTimeout(300);
    const s2 = await pageState();
    check(s2[1].stuck && Math.abs(s2[1].dTop) < 1 && s2[1].onTop && !s2[0].visible, `mid-way into page 2: “${s2[1].text}” replaced it under the Groups line (${s2[1].dTop.toFixed(1)}px); page 1's heading went with its page`);
    await rp.screenshot({ path: shots + '116-devices-sticky-page-heading.png' });
    // a taller Groups line (it wraps in narrower windows) moves the sticking point with it (ResizeObserver -> --sticky-page-top)
    await rp.getByTestId('device-groups-line').evaluate((e) => { e.style.paddingBottom = '40px'; });
    await rp.waitForTimeout(300);
    await scrollPage(1, 0.4);
    await rp.waitForTimeout(300);
    const s3 = await pageState();
    const gh = await rp.getByTestId('device-groups-line').evaluate((e) => e.offsetHeight);
    check(s3[1].stuck && Math.abs(s3[1].dTop) < 1, `Groups line grown to ${gh}px: the heading still sticks right under it (${s3[1].dTop.toFixed(1)}px)`);
    await rp.getByTestId('device-groups-line').evaluate((e) => { e.style.paddingBottom = ''; });
    // a window too narrow for the canvas: the picture column scrolls sideways again and the headings stay on their pictures
    await rp.setViewportSize({ width: 760, height: 1000 });
    await rp.waitForTimeout(400);
    check((await rp.locator('[data-page-heading]').count()) === 0 && (await rp.locator('[data-testid=device-view] [data-view-caption]').count()) === s3.length, 'narrow window: no sticky headings, captions back on the pictures');
    await rp.setViewportSize({ width: 1680, height: 1000 });
    await rp.waitForTimeout(400);
  }
  // tooltips on the icon buttons (a real bubble, not only the title attribute)
  await rp.getByTestId('template-customize').hover();
  await rp.waitForTimeout(500);
  const tip = rp.getByRole('tooltip');
  check(await tip.isVisible() && (await tip.innerText()) === 'Customize a copy of this template' && (await rp.getByTestId('template-customize').getAttribute('aria-label')) === 'Customize a copy of this template',
    'hovering a template icon shows its tooltip (aria-label kept)');
  await rp.screenshot({ path: shots + '114-template-tooltip.png' });
  await rp.getByTestId('device-png').hover();
  await rp.waitForTimeout(500);
  check(/PNG/.test(await rp.getByRole('tooltip').innerText()), 'PNG button tooltip');
  await rp.getByTestId('slot-axis-settings').hover();
  await rp.waitForTimeout(500);
  check(/Invert, exponent/.test(await rp.getByRole('tooltip').innerText()), 'Axis settings button tooltip');
  await rp.getByTestId('device-print').focus();
  await rp.keyboard.press('Shift+Tab'); await rp.keyboard.press('Tab');
  await rp.waitForTimeout(150);
  check(/Print/.test(await rp.getByRole('tooltip').innerText().catch(() => '')), 'tooltip also on keyboard focus');
  await rp.mouse.move(5, 500);
  await rp.evaluate(() => document.activeElement?.blur());

  // ---- URSA MINOR Combat: the editor draws the picture exactly like the Devices view (same size, same label layout)
  await rp.evaluate(() => document.getElementById('main').scrollTo(0, 0));
  await rp.waitForTimeout(300);
  const boxesIn = (sel) => rp.evaluate((sel) => {
    const v = document.querySelector(sel).querySelector('[data-testid=device-canvas-view]');
    const vr = v.getBoundingClientRect();
    return { w: vr.width, h: vr.height, view: v.dataset.view, boxes: Object.fromEntries([...v.querySelectorAll('[data-callout]')].map((c) => { const r = c.getBoundingClientRect(); return [c.dataset.callout, [r.left - vr.left, r.top - vr.top, r.width, r.height]]; })) };
  }, sel);
  const inView = await boxesIn('[data-testid=device-view]');
  // base-view callout (Keys): still fully inside the picture. Lever detents moved to the grips view in Federico's layout update.
  const keys = inView.boxes.keys;
  check(keys && keys[1] >= 1, `Keys box fully inside the picture in the Devices view (top ${keys?.[1].toFixed(1)}px)`);
  const gripBoxes = await rp.evaluate(() => {
    const v = [...document.querySelectorAll('[data-testid=device-view] [data-testid=device-canvas-view]')].find((el) => el.dataset.view === 'grip');
    if (!v) return null;
    const vr = v.getBoundingClientRect();
    const d = v.querySelector('[data-callout=det]');
    if (!d) return null;
    const r = d.getBoundingClientRect();
    return [r.left - vr.left, r.top - vr.top, r.width, r.height];
  });
  check(gripBoxes && gripBoxes[1] >= 1, `Lever detents now sit on the grips view (top ${gripBoxes?.[1]?.toFixed(1)}px)`);
  await rp.locator('[data-testid=device-view] [data-testid=device-canvas-view]').first().screenshot({ path: '/tmp/ursa-view.png' });
  await rp.getByTestId('template-customize').click();
  await rp.waitForTimeout(1500);
  const inEd = await boxesIn('[data-testid=template-editor]');
  const diffs = Object.entries(inView.boxes).map(([id, b]) => { const e = inEd.boxes[id]; return e ? Math.max(...b.map((v, k) => Math.abs(v - e[k]))) : 99; });
  check(inEd.view === inView.view && Math.abs(inEd.w - inView.w) < 0.5 && Math.abs(inEd.h - inView.h) < 0.5 && Math.max(...diffs) < 0.75,
    `editor draws the "${inView.view}" view at the same size (${Math.round(inEd.w)}×${Math.round(inEd.h)} vs ${Math.round(inView.w)}×${Math.round(inView.h)}) with every label box in the same place (max Δ ${Math.max(...diffs).toFixed(2)}px over ${diffs.length})`);
  check(inEd.boxes.keys && inEd.boxes.keys[1] >= 1, `Keys box not cut off in the editor (top ${inEd.boxes.keys?.[1].toFixed(1)}px)`);
  await rp.locator('[data-testid=template-editor] [data-testid=device-canvas-view]').first().screenshot({ path: '/tmp/ursa-editor.png' });
  const sbs = await rc.newPage();
  const b64 = (f) => readFileSync(f).toString('base64');
  await sbs.setViewportSize({ width: Math.round(inView.w) * 2 + 60, height: Math.round(inView.h) + 70 });
  await sbs.setContent(`<body style="margin:0;background:#04070c;color:#8be9ff;font:12px monospace;display:flex;gap:20px;padding:10px 20px">
    <figure style="margin:0"><figcaption>Devices view</figcaption><img src="data:image/png;base64,${b64('/tmp/ursa-view.png')}"></figure>
    <figure style="margin:0"><figcaption>Template editor</figcaption><img src="data:image/png;base64,${b64('/tmp/ursa-editor.png')}"></figure></body>`);
  await sbs.screenshot({ path: shots + '114-ursa-view-vs-editor.png' });
  await sbs.close();
  { // page tabs carry a × (Delete page): on the active tab and on hover; a customized copy of a built-in can delete its pages
    const edu = rp.getByTestId('template-editor');
    const xs = edu.getByTestId('tpl-page-delete'), tabsU = edu.locator('[data-view-tab]');
    const vis = () => xs.evaluateAll((els) => els.map((e) => getComputedStyle(e).opacity));
    const n0 = await tabsU.count(), active0 = await edu.locator('[data-view-tab][aria-selected=true]').getAttribute('data-view-tab');
    const ops = await vis();
    const other = await tabsU.evaluateAll((els) => els.find((e) => e.getAttribute('aria-selected') !== 'true').dataset.viewTab);
    await tabsU.and(rp.locator(`[data-view-tab="${other}"]`)).hover();
    await rp.waitForTimeout(100);
    const hovered = await xs.and(rp.locator(`[data-page="${other}"]`)).evaluate((e) => getComputedStyle(e).opacity);
    check(n0 === 3 && (await xs.count()) === 3 && ops.filter((o) => o === '1').length === 1 && hovered === '1' && (await xs.first().getAttribute('title')) === 'Delete page',
      `each page tab has a × "Delete page" (shown on the active tab ${ops.join('/')}, and on hover: ${hovered})`);
    let msg = '';
    rp.once('dialog', (d) => { msg = d.message(); void d.accept(); });
    await xs.and(rp.locator(`[data-page="${other}"]`)).click();
    await rp.waitForTimeout(200);
    check(/^Delete the page “.+”/.test(msg) && (await tabsU.count()) === 2 && (await edu.locator('[data-view-tab][aria-selected=true]').getAttribute('data-view-tab')) === active0,
      `Customize a copy (URSA): the tab × asks first ("${msg.slice(0, 60)}…"), deletes that page, keeps the shown one`);
    await rp.screenshot({ path: shots + '117-page-tab-delete.png' });
  }
  await rp.getByRole('button', { name: 'Cancel' }).click();
  await rp.waitForTimeout(300);
  await rc.close();
}

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
  await pp.getByTestId('sidebar-slots').locator('[data-slot-row^="js"]').first().click();
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

// ---- round 6: template pages (add, rename, move, delete), picture preparation (format only, background removal in the
// browser), custom pages as captioned sections in the Devices view, pages in the exported JSON
console.log('\nround 6: template pages, picture preparation');
{
  const c6 = await browser.newContext({ viewport: { width: 1680, height: 1000 }, deviceScaleFactor: 1, acceptDownloads: true });
  const p6 = await c6.newPage();
  p6.on('pageerror', (e) => errors.push('[r6] ' + String(e)));
  p6.on('console', (m) => m.type() === 'error' && errors.push('[r6] ' + m.text()));
  await p6.addInitScript(() => {
    const pads = [{ index: 0, id: 'VKBsim Gladiator EVO R (Vendor: 231d Product: 0200)', mapping: '', connected: true, buttons: Array.from({ length: 32 }, () => ({ pressed: false, touched: false, value: 0 })), axes: [0, 0, 0, 0, 0, 0, 0, 0, 0, 9 / 7], timestamp: 0 }];
    let revealed = false;
    window.__btn = (i, b, on) => { pads[i].buttons[b] = { pressed: on, touched: on, value: on ? 1 : 0 }; pads[i].timestamp++; if (on) revealed = true; };
    navigator.getGamepads = () => pads.map((p) => (revealed ? Object.freeze({ ...p, axes: Object.freeze([...p.axes]), buttons: Object.freeze(p.buttons.map((x) => Object.freeze({ ...x }))) }) : null));
  });
  await p6.goto(url, { waitUntil: 'networkidle' });
  await p6.evaluate(() => window.__btn(0, 2, true));
  await p6.waitForTimeout(120);
  await p6.evaluate(() => window.__btn(0, 2, false));
  await p6.getByTestId('open-slots').click();
  await p6.getByTestId('hw-row').first().getByRole('button', { name: /as js\d+/ }).click();
  await p6.keyboard.press('Escape');
  await p6.locator('[data-view-tab=devices]').click();
  await p6.waitForTimeout(800);
  const dv6 = p6.getByTestId('device-view');
  await p6.getByTestId('sidebar-slots').locator('[data-slot-row^="js"]').first().click();
  await p6.waitForTimeout(500);
  await dv6.getByTestId('template-new').click();
  const ed = p6.getByTestId('template-editor');
  const tabs = ed.getByTestId('tpl-views').locator('[data-view-tab]');
  const tabTexts = () => tabs.evaluateAll((els) => els.map((e) => e.textContent.replace(/\s+/g, ' ').trim()));
  check((await tabs.count()) === 1 && (await tabs.first().innerText()).startsWith('Page 1') && await ed.getByTestId('tpl-page-add').isVisible(), 'a new template shows its one page as a tab, with "+ Page" next to it');
  await ed.getByTestId('device-canvas').click({ position: { x: 300, y: 200 } });
  await p6.waitForTimeout(150);
  // + Page: a blank page, shown, its name ready to type
  await ed.getByTestId('tpl-page-add').click();
  await p6.waitForTimeout(150);
  const ren = ed.getByTestId('tpl-page-rename');
  check(await ren.isVisible() && await ren.evaluate((el) => el === document.activeElement && el.selectionStart === 0 && el.selectionEnd === el.value.length) && (await ren.inputValue()) === 'Page 2', '"+ Page" adds "Page 2" and opens its name for typing (selected)');
  await p6.keyboard.type('Throttle grip');
  await p6.keyboard.press('Enter');
  await p6.waitForTimeout(150);
  check(JSON.stringify(await tabTexts()) === JSON.stringify(['Page 1 (1)', 'Throttle grip (0)']) && (await tabs.nth(1).getAttribute('aria-selected')) === 'true' && (await ed.getByTestId('device-canvas-view').getAttribute('data-view')) === 'p2', `new page named and shown (${(await tabTexts()).join(' | ')})`);
  await tabs.nth(1).dblclick();
  await ren.fill('Grip top');
  await p6.keyboard.press('Enter');
  await p6.waitForTimeout(100);
  await tabs.nth(1).dblclick();
  await ren.fill('not this');
  await p6.keyboard.press('Escape');
  await p6.waitForTimeout(100);
  check((await tabTexts())[1] === 'Grip top (0)' && (await ed.count()) === 1, 'double-click renames a page; Escape cancels a rename (editor stays open)');
  // format only on a fixture: a transparent picture with the product off-centre (box 160 x 360 px)
  await ed.getByTestId('tpl-upload-file').setInputFiles('scripts/fixtures/photos/cutout-offcentre.png');
  const prep = p6.getByTestId('photo-prep');
  await p6.getByTestId('photo-prep-before').waitFor({ timeout: 5000 });
  check((await prep.innerText()).includes('page “Grip top”'), 'picture preparation names the page it is for');
  await p6.getByTestId('photo-prep-format').click();
  const after = p6.getByTestId('photo-prep-after');
  await after.waitFor({ timeout: 10000 });
  await prepSettled(p6);
  // product 160 x 360 -> upscaled 1.7x (to at most 900 px, as the built-ins) = 272 x 612, 5 % margin = 31 px
  const dims = async () => [await after.getAttribute('data-w'), await after.getAttribute('data-h'), await after.getAttribute('data-mode')].join(' ');
  check((await dims()) === '334 674 alpha' && (await p6.getByTestId('photo-prep-use').innerText()) === 'Use formatted', `format only: trimmed to the product, scaled like the built-ins, 5 % margin (${await dims()})`);
  const glowAt = () => after.evaluate(async (img) => { await img.decode(); const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; const g = c.getContext('2d'); g.drawImage(img, 0, 0); return [g.getImageData(0, 0, 1, 1).data[3], g.getImageData(Math.round(c.width / 2), 27, 1, 1).data[3]]; });
  const [corner, margin] = await glowAt();
  await p6.getByTestId('photo-prep-look').uncheck();
  await p6.waitForTimeout(50);
  await prepSettled(p6);
  const [, marginPlain] = await glowAt();
  check(corner === 0 && margin > 0 && marginPlain === 0 && (await dims()) === '334 674 alpha', `built-in glow baked into the margin, off when unticked (corner ${corner}, margin ${margin} -> ${marginPlain})`);
  await p6.getByTestId('photo-prep-look').check();
  await p6.waitForTimeout(50);
  await prepSettled(p6);
  await p6.getByTestId('photo-prep-use').click();
  await p6.waitForTimeout(300);
  const pv2 = ed.getByTestId('device-canvas-view');
  const img2 = await pv2.evaluate((el) => ({ src: el.querySelector('img')?.getAttribute('src')?.slice(0, 15), ar: el.style.aspectRatio, photo: el.getAttribute('data-photo') }));
  check((await prep.count()) === 0 && img2.src === 'data:image/webp' && Math.abs(img2.ar.split('/').map(Number).reduce((a, b) => a / b) - Math.round(334 + 2 * 0.3 * 674) / 674) < 0.01 && img2.photo === '1', `"Use formatted" puts the picture on the page (photo, canvas widened for labels: ${img2.ar})`);
  const pb = await pv2.boundingBox();
  await p6.mouse.click(pb.x + pb.width * 0.5, pb.y + pb.height * 0.5);
  await p6.waitForTimeout(150);
  check((await tabTexts())[1] === 'Grip top (1)', 'callouts can be placed on the new page');
  // page menu: move left / right; delete asks first (callouts go with the page), undo brings it back
  await ed.getByTestId('tpl-page-menu').click();
  await ed.getByRole('menuitem', { name: 'Move left' }).click();
  await p6.waitForTimeout(100);
  const moved = await tabTexts();
  await ed.getByTestId('tpl-page-menu').click();
  await ed.getByRole('menuitem', { name: 'Move right' }).click();
  await p6.waitForTimeout(100);
  check(moved[0] === 'Grip top (1)' && (await tabTexts())[1] === 'Grip top (1)', `pages reorder from the page menu (${moved.join(' | ')})`);
  let asked = '';
  p6.once('dialog', (d) => { asked = d.message(); void d.dismiss(); });
  await ed.getByTestId('tpl-page-menu').click();
  await ed.getByTestId('tpl-page-menu-delete').click();
  await p6.waitForTimeout(150);
  check(/Delete the page “Grip top” and its 1 callout\?/.test(asked) && (await tabs.count()) === 2, `delete asks first ("${asked}"), cancel keeps the page`);
  p6.once('dialog', (d) => void d.accept());
  await ed.getByTestId('tpl-page-menu').click();
  await ed.getByTestId('tpl-page-menu-delete').click();
  await p6.waitForTimeout(150);
  const afterDel = await tabTexts();
  await ed.getByTestId('tpl-undo').click();
  await p6.waitForTimeout(150);
  check(JSON.stringify(afterDel) === JSON.stringify(['Page 1 (1)']) && JSON.stringify(await tabTexts()) === JSON.stringify(['Page 1 (1)', 'Grip top (1)']), 'deleting removes the page and its callouts; undo restores both');
  // background removal in the browser, on a real vendor photo when available (else the fixture product photo)
  const real = '/workspace/uploads/sc-templates/templates/throttles/thrustmaster/wathhog/81bPEW3rCdL.jpg';
  const photo = existsSync(real) ? real : 'scripts/fixtures/photos/stick-on-white.png';
  await ed.getByTestId('tpl-page-add').click();
  await p6.keyboard.type('Cut-out');
  await p6.keyboard.press('Enter');
  await ed.getByTestId('tpl-upload-file').setInputFiles(photo);
  await p6.getByTestId('photo-prep-before').waitFor({ timeout: 5000 });
  const t0 = Date.now();
  await p6.getByTestId('photo-prep-remove').click();
  await p6.getByTestId('photo-prep-progress').waitFor({ timeout: 3000 });
  const progressTxt = await p6.getByTestId('photo-prep-progress').getAttribute('aria-label');
  await after.waitFor({ timeout: 90000 });
  await prepSettled(p6);
  const cut = await after.evaluate(async (img) => { await img.decode(); const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; const g = c.getContext('2d'); g.drawImage(img, 0, 0); const a = (x, y) => g.getImageData(Math.round(x * (c.width - 1)), Math.round(y * (c.height - 1)), 1, 1).data[3]; return { engine: img.dataset.engine, corners: [a(0, 0), a(1, 0), a(0, 1), a(1, 1)], centre: a(0.5, 0.55), w: c.width, h: c.height }; });
  check(cut.engine === 'model' && cut.corners.every((v) => v === 0) && cut.centre > 240 && (await p6.getByTestId('photo-prep-use').innerText()) === 'Use cut-out',
    `background removed in the browser by the model (${photo.split('/').pop()}: ${cut.w}×${cut.h}, corners ${cut.corners.join('/')}, centre ${cut.centre}; ${((Date.now() - t0) / 1000).toFixed(1)} s incl. download; progress "${progressTxt}")`);
  // the inspect pane switches to the cut-out (checkerboard), with an Original / Cut-out toggle
  const shown0 = await p6.getByTestId('photo-prep-before').getAttribute('data-shown');
  await prep.locator('.hud-panel').screenshot({ path: shots + '115-cutout-before-after.png' });
  await p6.getByTestId('photo-prep-inspect-original').click();
  const shown1 = await p6.getByTestId('photo-prep-before').getAttribute('data-shown');
  await p6.getByTestId('photo-prep-inspect-cutout').click();
  check(shown0 === 'cutout' && shown1 === 'original' && (await p6.getByTestId('photo-prep-before').getAttribute('data-shown')) === 'cutout', 'inspect pane: shows the cut-out after removal, Original / Cut-out toggle');
  await p6.getByTestId('photo-prep-use').click();
  await p6.waitForTimeout(300);
  const pb3 = await ed.getByTestId('device-canvas-view').boundingBox();
  await p6.mouse.click(pb3.x + pb3.width * 0.5, pb3.y + pb3.height * 0.3);
  await p6.waitForTimeout(150);
  await ed.getByLabel('Template name').fill('Round 6 pages');
  check((await tabTexts())[2] === 'Cut-out (1)', 'the cut-out page takes callouts too');
  await p6.screenshot({ path: shots + '115-editor-new-page.png' });
  await ed.getByTestId('tpl-save').click();
  await p6.waitForTimeout(800);
  // Devices view: every page a captioned section, like the built-in photo templates
  const caps = await dv6.locator('[data-view-caption]').evaluateAll((els) => els.map((e) => e.textContent));
  check(JSON.stringify(caps) === JSON.stringify(['Page 1', 'Grip top', 'Cut-out']) && (await dv6.getByTestId('device-canvas').getAttribute('data-views')) === '3', `Devices view shows the custom pages with their names as section headers (${caps.join(' | ')})`);
  await p6.setViewportSize({ width: 1680, height: 2900 });
  await p6.waitForTimeout(400);
  await p6.screenshot({ path: shots + '115-devices-custom-page.png' });
  await p6.setViewportSize({ width: 1680, height: 1000 });
  const [d6] = await Promise.all([p6.waitForEvent('download'), dv6.getByTestId('template-export').click()]);
  const f6 = '/tmp/r6-' + d6.suggestedFilename();
  await d6.saveAs(f6);
  const x6 = JSON.parse(readFileSync(f6, 'utf8')).templates[0];
  check(x6.views.map((v) => v.label).join('|') === 'Page 1|Grip top|Cut-out' && x6.views.slice(1).every((v) => /^data:image\/webp/.test(v.image)) && x6.callouts.filter((c) => c.view === 'p2').length === 1, `pages exported in the template JSON (${x6.views.map((v) => `${v.id}:${v.label}`).join(', ')})`);
  await c6.close();
}

// ---- round 7: picture preparation zoom / pan (both panes in sync) and canvas aspect; the template editor's input picker
console.log('\nround 7: prepare-picture zoom + aspect, input picker');
{
  const c7 = await browser.newContext({ viewport: { width: 1680, height: 1000 }, deviceScaleFactor: 1 });
  const p7 = await c7.newPage();
  p7.on('pageerror', (e) => errors.push('[r7] ' + String(e)));
  p7.on('console', (m) => m.type() === 'error' && errors.push('[r7] ' + m.text()));
  await p7.addInitScript(() => {
    const pads = [{ index: 0, id: 'VKBsim Gladiator EVO R (Vendor: 231d Product: 0200)', mapping: '', connected: true, buttons: Array.from({ length: 32 }, () => ({ pressed: false, touched: false, value: 0 })), axes: [0, 0, 0, 0, 0, 0, 0, 0, 0, 9 / 7], timestamp: 0 }];
    let revealed = false;
    window.__btn = (i, b, on) => { pads[i].buttons[b] = { pressed: on, touched: on, value: on ? 1 : 0 }; pads[i].timestamp++; if (on) revealed = true; };
    navigator.getGamepads = () => pads.map((p) => (revealed ? Object.freeze({ ...p, axes: Object.freeze([...p.axes]), buttons: Object.freeze(p.buttons.map((x) => Object.freeze({ ...x }))) }) : null));
  });
  await p7.goto(url, { waitUntil: 'networkidle' });
  await p7.evaluate(() => window.__btn(0, 2, true));
  await p7.waitForTimeout(120);
  await p7.evaluate(() => window.__btn(0, 2, false));
  await p7.getByTestId('open-slots').click();
  await p7.getByTestId('hw-row').first().getByRole('button', { name: /as js\d+/ }).click();
  await p7.keyboard.press('Escape');
  await p7.locator('[data-view-tab=devices]').click();
  await p7.waitForTimeout(800);
  const dv7 = p7.getByTestId('device-view');
  await p7.getByTestId('sidebar-slots').locator('[data-slot-row^="js"]').first().click();
  await p7.waitForTimeout(500);
  await dv7.getByTestId('template-new').click();
  const ed = p7.getByTestId('template-editor');
  const prep = p7.getByTestId('photo-prep'), after = p7.getByTestId('photo-prep-after'), before = p7.getByTestId('photo-prep-before');
  const openPrep = async () => { await ed.getByTestId('tpl-upload-file').setInputFiles('scripts/fixtures/photos/cutout-offcentre.png'); await before.waitFor({ timeout: 5000 }); };
  const settle = () => prepSettled(p7);
  await openPrep();
  check((await p7.getByTestId('photo-prep-aspect-auto').getAttribute('aria-checked')) === 'true', 'canvas aspect starts at Auto');
  await p7.getByTestId('photo-prep-format').click();
  await after.waitFor({ timeout: 10000 });
  await settle();
  const dims = async () => [Number(await after.getAttribute('data-w')), Number(await after.getAttribute('data-h'))];
  check(JSON.stringify(await dims()) === '[334,674]', `Auto = the round-6 format (${await dims()})`);
  // inspect pane (left): its own zoom (buttons, %, 100 %, Fit), wheel around the cursor, drag to pan; it never changes the output
  const zoom = p7.getByTestId('photo-prep-zoom');
  const zf = async () => Number(await zoom.getAttribute('data-z'));
  const pct = async () => (await p7.getByTestId('photo-prep-zoom-pct').innerText()).trim();
  const z0 = await zf(), pct0 = await pct();
  await p7.getByTestId('photo-prep-zoom-in').click();
  await p7.getByTestId('photo-prep-zoom-in').click();
  const z2 = await zf(), pct2 = await pct();
  await p7.getByTestId('photo-prep-zoom-out').click();
  check(Math.abs(z2 / z0 - 1.5625) < 1e-6 && Math.abs((await zf()) / z0 - 1.25) < 1e-6 && pct2 !== pct0, `inspect: + / − zoom by 25 % steps (${pct0} -> ${pct2})`);
  await p7.getByTestId('photo-prep-zoom-100').click();
  const pct100 = await pct(), bb100 = await before.boundingBox();
  check(pct100 === '100%' && Math.abs(bb100.width - 800) < 1.5 && Math.abs(bb100.height - 600) < 1.5, `inspect: 100% shows the uploaded picture 1:1 (${bb100.width.toFixed(1)}×${bb100.height.toFixed(1)})`);
  await p7.getByTestId('photo-prep-zoom-fit').click();
  check(Math.abs((await zf()) - z0) < 1e-9 && (await pct()) === pct0, 'inspect: Fit returns to the whole picture');
  const outKey = async () => [await after.getAttribute('src'), await p7.getByTestId('photo-prep-canvas-frame').getAttribute('data-k')].join('|');
  const key0 = await outKey();
  const bp = await p7.getByTestId('photo-prep-before-pane').boundingBox();
  const mx = bp.x + bp.width * 0.62, my = bp.y + bp.height * 0.35;
  const b0 = await before.boundingBox(), u0 = [(mx - b0.x) / b0.width, (my - b0.y) / b0.height];
  await p7.mouse.move(mx, my);
  for (let i = 0; i < 4; i++) { await p7.mouse.wheel(0, -100); await p7.waitForTimeout(60); }
  await p7.waitForTimeout(150);
  const b1 = await before.boundingBox(), u1 = [(mx - b1.x) / b1.width, (my - b1.y) / b1.height];
  await p7.mouse.down(); await p7.mouse.move(mx + 30, my + 20, { steps: 3 }); await p7.mouse.move(mx + 60, my + 40, { steps: 3 }); await p7.mouse.up();
  await p7.waitForTimeout(150);
  const b2 = await before.boundingBox();
  check(b1.width > b0.width * 2 && Math.abs(u0[0] - u1[0]) * b1.width < 2 && Math.abs(u0[1] - u1[1]) * b1.height < 2 && Math.abs(b2.x - b1.x - 60) < 1.5 && Math.abs(b2.y - b1.y - 40) < 1.5 && (await outKey()) === key0,
    `inspect: wheel zooms around the cursor (×${(b1.width / b0.width).toFixed(2)}, point kept), drag pans; the output is unchanged`);
  // zoom the inspect pane into the knob's edge (screenshot)
  await p7.getByTestId('photo-prep-zoom-fit').click();
  const bf = await before.boundingBox();
  await p7.mouse.move(bf.x + bf.width * (470 + 160 * 0.215) / 800, bf.y + bf.height * (140 + 160 * 0.3) / 600);
  for (let i = 0; i < 10; i++) { await p7.mouse.wheel(0, -100); await p7.waitForTimeout(30); }
  await p7.waitForTimeout(200);
  check(parseInt(await pct()) >= 300, `inspect: zoomed in on the edge (${await pct()})`);
  await prep.locator('.hud-panel').screenshot({ path: shots + '117-prepare-zoomed.png' });
  await p7.getByTestId('photo-prep-zoom-fit').click();
  // framing pane (right): the Stick canvas is a fixed frame; the wheel resizes the product around the cursor, a drag moves it;
  // what leaves the frame is cut off (shown dimmed) and the output is exactly the frame's content at the canvas resolution
  await p7.getByTestId('photo-prep-aspect-stick').click();
  await settle();
  const cframe = p7.getByTestId('photo-prep-canvas-frame'), pframe = p7.getByTestId('photo-prep-product-frame');
  const [W, H] = await dims();
  const cf0 = await cframe.boundingBox(), pf0 = await pframe.boundingBox();
  const fx = cf0.x + cf0.width * 0.5, fy = cf0.y + cf0.height * 0.3;
  const v0 = [(fx - pf0.x) / pf0.width, (fy - pf0.y) / pf0.height];
  await p7.mouse.move(fx, fy);
  for (let i = 0; i < 3; i++) { await p7.mouse.wheel(0, -100); await p7.waitForTimeout(60); }
  await p7.waitForTimeout(100);
  const cf1 = await cframe.boundingBox(), pf1 = await pframe.boundingBox(), v1 = [(fx - pf1.x) / pf1.width, (fy - pf1.y) / pf1.height];
  check(JSON.stringify(cf1) === JSON.stringify(cf0) && Math.abs(pf1.width / pf0.width - 1.953125) < 0.01 && Math.abs(v0[0] - v1[0]) * pf1.width < 1.5 && Math.abs(v0[1] - v1[1]) * pf1.height < 1.5 && (await p7.getByTestId('photo-prep-frame-pct').innerText()).trim() === '195%',
    `framing: the canvas frame stays put, the wheel scales the product around the cursor (×${(pf1.width / pf0.width).toFixed(3)}, ${(await p7.getByTestId('photo-prep-frame-pct').innerText()).trim()})`);
  await p7.mouse.move(fx, fy); await p7.mouse.down(); await p7.mouse.move(fx + 40, fy + 30, { steps: 4 }); await p7.mouse.move(fx + 80, fy + 60, { steps: 4 }); await p7.mouse.up();
  await p7.waitForTimeout(100);
  const pf2 = await pframe.boundingBox();
  check(Math.abs(pf2.x - pf1.x - 80) < 1.5 && Math.abs(pf2.y - pf1.y - 60) < 1.5 && JSON.stringify(await cframe.boundingBox()) === JSON.stringify(cf0), 'framing: a drag moves the product inside the fixed frame');
  await settle();
  const live = await p7.getByTestId('photo-prep-frame-live').boundingBox();
  const fr = await cframe.evaluate((el) => ({ k: Number(el.dataset.k), x: Number(el.dataset.x), y: Number(el.dataset.y), cropped: el.dataset.cropped, shadow: getComputedStyle(el).boxShadow }));
  const r = { x: Math.round(470 * fr.k + fr.x), y: Math.round(140 * fr.k + fr.y), w: Math.round(160 * fr.k), h: Math.round(360 * fr.k) };
  const ob = await after.evaluate(async (img) => { await img.decode(); const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight; const g = c.getContext('2d'); g.drawImage(img, 0, 0); const d = g.getImageData(0, 0, c.width, c.height).data; let y1 = -1; for (let y = c.height - 1; y >= 0 && y1 < 0; y--) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > 200) { y1 = y; break; } return { w: c.width, h: c.height, bottomOpaque: y1 }; });
  const outTxt = await p7.getByTestId('photo-prep-output').innerText();
  check(ob.w === W && ob.h === H && r.y + r.h > H && ob.bottomOpaque === H - 1 && fr.cropped === '1' && /cut off at the frame edge/.test(outTxt) && live.y + live.height > cf0.y + cf0.height + 20 && /rgba?\(3, 6, 11/.test(fr.shadow),
    `framing output = the frame's content at ${W}×${H}: the product (${r.w}×${r.h} at ${r.x},${r.y}) runs past the bottom edge and is cut off there; the part outside is shown dimmed`);
  await prep.locator('.hud-panel').screenshot({ path: shots + '118-prepare-framing-stick.png' });
  await p7.getByTestId('photo-prep-frame-fit').click();
  await settle();
  const pf3 = await pframe.boundingBox();
  check((await p7.getByTestId('photo-prep-frame-pct').innerText()).trim() === '100%' && Math.abs(pf3.width - pf0.width) < 1 && Math.abs(pf3.x - pf0.x) < 1 && (await cframe.getAttribute('data-cropped')) === null, 'framing: Fit returns to the initial framing (product centred, built-in scale)');
  // canvas aspect: stick / throttle / square / custom; the product keeps its size, centred, with at least the 5 % margin
  const centred = async () => {
    const [c, p] = await Promise.all([p7.getByTestId('photo-prep-canvas-frame').boundingBox(), p7.getByTestId('photo-prep-product-frame').boundingBox()]);
    return Math.abs((p.x - c.x) - (c.x + c.width - p.x - p.width)) < 1.5 && Math.abs((p.y - c.y) - (c.y + c.height - p.y - p.height)) < 1.5;
  };
  const ratios = [];
  for (const [id, r] of [['stick', 990 / 1064], ['throttle', 990 / 846], ['square', 1]]) {
    await p7.getByTestId(`photo-prep-aspect-${id}`).click();
    await settle();
    const [w, h] = await dims();
    ratios.push(`${id} ${w}×${h}`);
    check(Math.abs(w / h - r) < 0.003 && (h === 674 || w === 334) && await centred() && (await p7.getByTestId(`photo-prep-aspect-${id}`).getAttribute('aria-checked')) === 'true', `${id} canvas: ${w}×${h} (ratio ${(w / h).toFixed(3)}), product centred in its margin`);
  }
  await p7.getByTestId('photo-prep-aspect-throttle').click();
  await settle();
  await prep.locator('.hud-panel').screenshot({ path: shots + '117-prepare-aspect.png' });
  await p7.getByTestId('photo-prep-aspect-custom').click();
  await p7.getByTestId('photo-prep-aspect-w').fill('16');
  await p7.getByTestId('photo-prep-aspect-h').fill('9');
  await p7.getByTestId('photo-prep-aspect-h').press('Enter');
  await settle();
  const [cw, ch] = await dims();
  check(Math.abs(cw / ch - 16 / 9) < 0.003 && await centred(), `custom 16:9 canvas (${cw}×${ch})`);
  // the choice is remembered: cancel, upload again -> custom 16:9 is preselected
  await p7.getByTestId('photo-prep-cancel').click();
  await openPrep();
  check((await p7.getByTestId('photo-prep-aspect-custom').getAttribute('aria-checked')) === 'true' && (await p7.getByTestId('photo-prep-aspect-w').inputValue()) === '16' && (await p7.getByTestId('photo-prep-aspect-h').inputValue()) === '9', 'last aspect choice remembered for the next picture');
  await p7.getByTestId('photo-prep-aspect-auto').click();
  await p7.getByTestId('photo-prep-format').click();
  await after.waitFor({ timeout: 10000 });
  await settle();
  check(JSON.stringify(await dims()) === '[334,674]', 'back to Auto');
  await p7.getByTestId('photo-prep-use').click();
  await p7.waitForTimeout(300);
  // a prepared portrait picture on a single-page template: drawn like the built-in photos (label columns, at most 720 px tall),
  // not stretched to the column width
  const ev = await ed.getByTestId('device-canvas-view').evaluate((el) => { const r = el.getBoundingClientRect(); return { w: r.width, h: r.height, photo: el.dataset.photo, col: el.closest('[data-testid=device-canvas]').getBoundingClientRect().width }; });
  check(ev.photo === '1' && ev.h <= 722 && Math.abs(ev.w / ev.h - Math.round(334 + 2 * 0.3 * 674) / 674) < 0.01 && ev.w < ev.col - 100, `editor: prepared portrait picture capped like the built-in photos (${Math.round(ev.w)}×${Math.round(ev.h)} in a ${Math.round(ev.col)} px column, label columns)`);

  // input picker: the template is linked to the connected Gladiator (32 buttons, POV hat on axis 9, 8 axes)
  const pv = ed.getByTestId('device-canvas-view');
  const place = async (fx, fy) => { const b = await pv.boundingBox(); await p7.mouse.click(b.x + b.width * fx, b.y + b.height * fy); await p7.waitForTimeout(150); };
  await place(0.3, 0.2);
  const props = ed.getByTestId('callout-props');
  const firstIn = await props.getByLabel('Input input').inputValue();
  await props.getByLabel('Callout name').fill('Trigger');
  await place(0.3, 0.45);
  await props.getByTestId('input-picker-btn').click();
  const picker = props.getByTestId('input-picker'), opts = picker.getByTestId('input-picker-option');
  const optInputs = await opts.evaluateAll((els) => els.map((e) => e.dataset.input));
  const usedFirst = await picker.locator(`[data-input="${firstIn}"]`).getAttribute('data-used');
  check((await picker.getAttribute('data-source')) === 'device' && optInputs.length === 36 && optInputs[31] === 'button32' && optInputs.slice(32).join() === 'hat1_up,hat1_right,hat1_down,hat1_left' && usedFirst === 'Trigger',
    `linked: the Input field lists the device's 32 buttons + POV hat directions, each with the callout using it (${firstIn}: "${usedFirst}")`);
  await p7.screenshot({ path: shots + '117-input-picker.png' });
  await picker.locator('[data-input="button7"]').click();
  await p7.waitForTimeout(150);
  check((await props.getByLabel('Input input').inputValue()) === 'button7' && (await picker.count()) === 0, 'picking an entry sets the input');
  // free typing still works
  await props.getByLabel('Input input').fill('12');
  await props.getByLabel('Input input').press('Enter');
  await p7.waitForTimeout(100);
  check((await props.getByLabel('Input input').inputValue()) === 'button12', 'free typing still works next to the picker');
  // axes: the device's axes by game name, with the callout using each
  await props.getByLabel('Callout type').selectOption('axis');
  await p7.waitForTimeout(100);
  const axOpts = await props.getByLabel('Axis 1').locator('option').evaluateAll((els) => els.map((e) => e.textContent));
  check(axOpts.length === 8 && axOpts.includes('slider2') && /devices? axes|8 axes on/.test(await props.innerText()), `axis select lists the device's 8 axes by SC name (${axOpts.join(', ')})`);
  // a 4-way hat reported as buttons: pick its four directions (+ push) at once, in order
  await props.getByLabel('Callout type').selectOption('hat');
  await p7.waitForTimeout(100);
  const povTxt = await props.getByLabel('Hat number').locator('option').evaluateAll((els) => els.map((e) => e.textContent));
  await props.getByLabel('Hat number').selectOption('b');
  await p7.waitForTimeout(100);
  await props.getByTestId('input-picker-multi-btn').click();
  const multi = props.getByTestId('input-picker-multi');
  for (const b of ['button20', 'button21', 'button22', 'button23', 'button24']) await multi.locator(`[data-input="${b}"] input`).check();
  await multi.getByTestId('input-picker-apply').click();
  await p7.waitForTimeout(150);
  const dirs = await Promise.all(['up', 'right', 'down', 'left'].map((d) => props.getByLabel(`Hat ${d} input`).inputValue()));
  check(povTxt[1] === 'POV hat 2 (not seen on the device)' && dirs.join() === 'button20,button21,button22,button23' && (await props.getByLabel('Hat push button').inputValue()) === 'button24',
    `multi-pick fills a 4-button hat's directions and push in order (${dirs.join(', ')}; POV options: ${povTxt.slice(0, 2).join(' / ')})`);
  // the picker of another callout now shows those as used
  await place(0.6, 0.45);
  await props.getByTestId('input-picker-btn').click();
  check(/^Hat\b|B20/.test(await props.getByTestId('input-picker').locator('[data-input="button20"]').getAttribute('data-used')), 'entries used by the hat show it');
  await props.getByTestId('input-picker-btn').click();
  // a switch (rocker): pick several positions
  await props.getByLabel('Callout type').selectOption('switch');
  await p7.waitForTimeout(100);
  await props.getByTestId('input-picker-multi-btn').click();
  for (const b of ['button30', 'button31', 'button29']) await props.getByTestId('input-picker-multi').locator(`[data-input="${b}"] input`).check();
  await props.getByTestId('input-picker-apply').click();
  await p7.waitForTimeout(150);
  const pos = await Promise.all([1, 2, 3].map((i) => props.getByLabel(`Position ${i} input`).inputValue()));
  check(pos.join() === 'button30,button31,button29', `multi-pick sets a switch's positions in the order ticked (${pos.join(', ')})`);
  // device not connected / not matching: the link rule's button count; no count: free typing only
  const link = ed.getByTestId('tpl-link');
  await link.getByLabel('Rule 1 product id').fill('9999');
  await link.getByLabel('Rule 1 buttons').fill('24');
  await p7.waitForTimeout(100);
  await props.getByLabel('Callout type').selectOption('button');
  await props.getByTestId('input-picker-btn').click();
  const rp = props.getByTestId('input-picker');
  check((await rp.getAttribute('data-source')) === 'rule' && (await rp.getByTestId('input-picker-option').count()) === 24 && /link rule/.test(await rp.innerText()), 'not matching the device: buttons 1..24 from the link rule');
  await link.getByLabel('Rule 1 buttons').fill('');
  await p7.waitForTimeout(100);
  check((await props.getByTestId('input-picker-btn').count()) === 0 && await props.getByLabel('Input input').isVisible(), 'no device and no button count: free typing only');
  check((await ed.getByTestId('tpl-page-delete').count()) === 0, 'single page: no × on its tab');
  await link.getByLabel('Rule 1 product id').fill('0200');
  await ed.getByLabel('Template name').fill('Round 7 grip');
  const boxesOf = (root) => p7.evaluate((root) => {
    const r0 = document.querySelector(root), v = r0.querySelector('[data-testid=device-canvas-view]') ?? r0.querySelector('[data-testid=device-canvas]');
    const vr = v.getBoundingClientRect();
    return { w: vr.width, h: vr.height, boxes: Object.fromEntries([...v.querySelectorAll('[data-callout]')].map((c) => { const r = c.getBoundingClientRect(); return [c.dataset.callout, [r.left - vr.left, r.top - vr.top]]; })) };
  }, root);
  await ed.getByTestId('tpl-save').click();
  await p7.waitForTimeout(800);
  await p7.evaluate(() => document.getElementById('main').scrollTo(0, 0));
  await p7.waitForTimeout(200);
  const inV = await boxesOf('[data-testid=device-view]');
  await dv7.getByTestId('template-edit').click();
  await p7.waitForTimeout(800);
  const inE = await boxesOf('[data-testid=template-editor]');
  const dd = Object.entries(inV.boxes).map(([id, b]) => (inE.boxes[id] ? Math.max(Math.abs(b[0] - inE.boxes[id][0]), Math.abs(b[1] - inE.boxes[id][1])) : 99));
  check(inV.h <= 722 && Math.abs(inE.w - inV.w) < 0.5 && Math.abs(inE.h - inV.h) < 0.5 && dd.length >= 3 && Math.max(...dd) < 0.75,
    `Devices view draws the custom portrait page capped too (${Math.round(inV.w)}×${Math.round(inV.h)}), and the editor at the same size with the label boxes in the same place (max Δ ${Math.max(...dd).toFixed(2)} px over ${dd.length})`);
  await ed.getByRole('button', { name: 'Cancel' }).click();
  await p7.waitForTimeout(300);
  // "Keep original" on a classic single-picture template: the canvas takes the picture's shape but is not drawn taller than 720 px
  await dv7.getByTestId('template-new').click();
  await ed.getByTestId('tpl-upload-file').setInputFiles('scripts/fixtures/photos/stick-on-white.png');
  await before.waitFor({ timeout: 5000 });
  await p7.getByTestId('photo-prep-keep').click();
  await p7.waitForTimeout(500);
  const cv = await ed.getByTestId('device-canvas').evaluate((el) => { const r = el.getBoundingClientRect(); return { w: r.width, h: r.height, photo: el.dataset.photo, views: el.dataset.views }; });
  check(!cv.views && Math.abs(cv.h - 720) < 2 && Math.abs(cv.w / cv.h - 346 / 420) < 0.01, `classic canvas with a portrait upload (Keep original): ${Math.round(cv.w)}×${Math.round(cv.h)}, height capped at 720 px, shape kept`);
  await ed.getByTestId('device-canvas').click({ position: { x: cv.w * 0.5, y: cv.h * 0.3 } });
  await p7.waitForTimeout(150);
  await ed.getByLabel('Template name').fill('Round 7 classic');
  await ed.getByTestId('tpl-save').click();
  await p7.waitForTimeout(800);
  const tsel = dv7.getByTestId('template-select');
  await tsel.selectOption(await tsel.locator('option', { hasText: 'Round 7 classic' }).first().getAttribute('value'));
  await p7.waitForTimeout(500);
  const dc = await dv7.getByTestId('device-canvas').evaluate((el) => { const r = el.getBoundingClientRect(); return { w: r.width, h: r.height }; });
  check(Math.abs(dc.h - cv.h) < 1 && Math.abs(dc.w - cv.w) < 1, `Devices view draws it at the same capped size (${Math.round(dc.w)}×${Math.round(dc.h)})`);
  await c7.close();
}

// ---- round 8: every exposed path comes from Settings (game folder + channel), paths and console commands have copy buttons,
// the export modal wraps its paths at any width
console.log('\nround 8: paths from Settings, copy buttons, export modal wrapping');
{
  const c8 = await browser.newContext({ viewport: { width: 1680, height: 1000 }, deviceScaleFactor: 1, permissions: ['clipboard-read', 'clipboard-write'] });
  const p8 = await c8.newPage();
  p8.on('pageerror', (e) => errors.push('[r8] ' + String(e)));
  await p8.goto(url, { waitUntil: 'networkidle' });
  await p8.locator('input[type=file]').first().setInputFiles('public/samples/actionmaps.xml');
  await p8.waitForTimeout(800);
  const txt = async (id, root = p8) => (await root.getByTestId(id).innerText()).replace(/\s+/g, '').trim();
  const L = 'C:\\Program Files\\Roberts Space Industries\\StarCitizen\\LIVE';
  // export modal: mappings folder + actionmaps path from the default folder, three console commands with copy buttons
  await p8.getByTestId('profile-export').click();
  const ex = p8.getByTestId('export-dialog');
  await ex.waitFor();
  const name = await p8.getByTestId('export-name').inputValue();
  check((await txt('export-path-mappings-text')) === (L + '\\user\\client\\0\\Controls\\Mappings\\').replace(/\s+/g, '') && await ex.getByTestId('export-path-mappings-copy').isVisible(),
    'export: the mappings folder comes from Settings (default LIVE) and has a copy button');
  const cmds = [];
  for (const id of ['export-cmd-rebind', 'export-cmd-rebind-bare', 'export-cmd-resort']) {
    cmds.push((await ex.getByTestId(id + '-text').innerText()).trim());
    check(await ex.getByTestId(id + '-copy').isVisible() && (await ex.getByTestId(id).getAttribute('data-copy-kind')) === 'command', `export: console command "${cmds.at(-1)}" has a copy button`);
  }
  check(cmds[0] === `pp_RebindKeys layout_${name}_exported.xml` && cmds[2] === 'pp_resortdevices joystick 1 2', `export commands follow the file name (${cmds.join(' · ')})`);
  await ex.getByTestId('export-cmd-rebind-copy').click();
  await p8.waitForTimeout(120);
  const clip = await p8.evaluate(() => navigator.clipboard.readText());
  check(clip === cmds[0] && (await ex.getByTestId('export-cmd-rebind-copy').getAttribute('data-copied')) === '1' && /Copied/.test(await ex.getByTestId('export-cmd-rebind').innerText()), `copy puts the command on the clipboard and says "Copied" (${clip})`);
  { const g = await ex.getByTestId('export-guide').boundingBox(); await p8.screenshot({ path: shots + '118-console-command-copy.png', clip: { x: g.x - 8, y: g.y - 8, width: g.width + 16, height: g.height + 16 } }); }
  await ex.getByRole('button', { name: /Replace actionmaps\.xml/ }).click();
  await p8.waitForTimeout(150);
  check((await txt('export-path-actionmaps-text')) === (L + '\\user\\client\\0\\Profiles\\default\\actionmaps.xml').replace(/\s+/g, '') && await ex.getByTestId('export-path-actionmaps-copy').isVisible(), 'export: the actionmaps.xml path comes from Settings too, with a copy button');
  await ex.getByRole('button', { name: /Control profile/ }).click();
  await p8.waitForTimeout(150);
  await p8.waitForTimeout(1600);
  await p8.screenshot({ path: shots + '118-export-paths.png' });
  // no horizontal overflow in the modal: wide and at 420 px
  const overflow = () => p8.evaluate(() => {
    const dlg = document.querySelector('[data-testid=export-dialog]');
    const box = dlg.querySelector('.hud-panel') || dlg;
    const r = box.getBoundingClientRect();
    const bad = [...box.querySelectorAll('code, span, p, li, div')].filter((e) => { if (e.getAttribute('role') === 'status') return false; const b = e.getBoundingClientRect(); return b.width > 0 && (b.right > r.right + 1 || b.left < r.left - 1 || (getComputedStyle(e).overflowX === 'visible' && e.scrollWidth > e.clientWidth + 1 && e.clientWidth > 0)); });
    return { w: Math.round(r.width), vw: window.innerWidth, bad: bad.slice(0, 5).map((e) => e.tagName + ' ' + (e.dataset.testid || '') + ' ' + e.textContent.slice(0, 40)) };
  });
  const ow = await overflow();
  await p8.setViewportSize({ width: 420, height: 900 });
  await p8.waitForTimeout(300);
  const on = await overflow();
  const pr = await ex.getByTestId('export-path-mappings-text').boundingBox();
  check(ow.bad.length === 0 && on.bad.length === 0 && on.w <= 420 && pr.width < 400, `export modal: no path or command overflows its box (wide ${ow.w}px, narrow ${on.w}px of ${on.vw}${on.bad.length ? ': ' + on.bad.join(' | ') : ''})`);
  await p8.screenshot({ path: shots + '118-export-paths-narrow.png' });
  await ex.getByTestId('export-guide').scrollIntoViewIfNeeded();
  await p8.waitForTimeout(150);
  await p8.screenshot({ path: shots + '118-export-paths-narrow-guide.png' });
  await p8.setViewportSize({ width: 1680, height: 1000 });
  await p8.keyboard.press('Escape');
  await p8.waitForTimeout(200);
  // settings: change folder + channel -> settings, export and help paths all follow
  await p8.getByTestId('open-settings').click();
  const sm = p8.getByTestId('settings-modal');
  await sm.getByTestId('setting-game-root').fill('D:\\Games\\StarCitizen');
  await sm.getByTestId('setting-game-root').press('Enter');
  await sm.getByTestId('setting-game-channel').selectOption('PTU');
  await p8.waitForTimeout(150);
  const P = 'D:\\Games\\StarCitizen\\PTU';
  check((await txt('game-path-text', sm)) === P + '\\user\\client\\0\\Controls\\Mappings\\' && (await txt('game-actionmaps-path-text', sm)) === P + '\\user\\client\\0\\Profiles\\default\\actionmaps.xml' && (await txt('settings-path-p4k-text', sm)) === P + '\\Data.p4k'
    && await sm.getByTestId('game-path-copy').isVisible() && await sm.getByTestId('game-actionmaps-path-copy').isVisible() && await sm.getByTestId('settings-path-p4k-copy').isVisible(),
    'settings: mappings folder, actionmaps.xml and Data.p4k derived from the folder + channel, each with a copy button');
  await sm.getByTestId('game-actionmaps-path-copy').click();
  await p8.waitForTimeout(100);
  check((await p8.evaluate(() => navigator.clipboard.readText())) === P + '\\user\\client\\0\\Profiles\\default\\actionmaps.xml', 'settings: copying a path puts exactly the path on the clipboard');
  await p8.waitForTimeout(1600);
  await p8.screenshot({ path: shots + '118-settings-paths.png' });
  await p8.keyboard.press('Escape');
  await p8.waitForTimeout(200);
  check((await txt('sidebar-path-p4k-text')) === P + '\\Data.p4k', 'sidebar: defaults source points at the Settings Data.p4k');
  await p8.getByTestId('profile-export').click();
  await ex.waitFor();
  check((await txt('export-path-mappings-text')) === P + '\\user\\client\\0\\Controls\\Mappings\\', 'export: follows the Settings change (PTU)');
  await p8.keyboard.press('Escape');
  await p8.waitForTimeout(200);
  await p8.getByTestId('open-help').click();
  await p8.waitForTimeout(200);
  check((await txt('help-path-actionmaps-text')) === P + '\\user\\client\\0\\Profiles\\default\\actionmaps.xml' && (await txt('help-path-mappings-text')) === P + '\\user\\client\\0\\Controls\\Mappings\\' && (await txt('help-path-p4k-text')) === P + '\\Data.p4k'
    && (await p8.getByTestId('help-cmd-rebind-text').innerText()).trim() === 'pp_RebindKeys layout_<name>_exported.xml' && await p8.getByTestId('help-cmd-rebind-copy').isVisible(),
    'help: actionmaps, mappings and Data.p4k paths from Settings, pp_RebindKeys with a copy button');
  await p8.keyboard.press('Escape');
  await c8.close();
}

// ---- round 9: the profile card's Game slots list is the slot picker; narrow layouts get a dropdown in the view
console.log('\nround 9: slot picker in the sidebar, narrow fallback');
{
  const c9 = await browser.newContext({ viewport: { width: 1680, height: 1000 }, deviceScaleFactor: 1 });
  const p9 = await c9.newPage();
  p9.on('pageerror', (e) => errors.push('[r9] ' + String(e)));
  await p9.goto(url, { waitUntil: 'networkidle' });
  await p9.locator('input[type=file]').first().setInputFiles('public/samples/actionmaps.xml');
  await p9.waitForTimeout(800);
  const side = p9.getByTestId('sidebar-slots'), row = (id) => side.locator(`[data-slot-row="${id}"]`);
  const shownSlot = () => p9.getByTestId('device-slot-view').getAttribute('data-slot');
  const view = () => p9.locator('[data-view-tab][aria-current=page]').getAttribute('data-view-tab');
  // List: nothing selected, nothing dimmed; a click opens the slot in the view that shows it
  check((await side.getAttribute('data-mode')) === 'jump' && await side.locator('[data-selected]').count() === 0 && await side.locator('[data-selectable="0"]').count() === 0 && /open it in the Devices or Keyboard view/.test(await p9.getByTestId('slot-pick-hint').innerText()),
    'List view: slot rows are links to their view (nothing selected or dimmed)');
  await row('js2').click();
  await p9.waitForTimeout(500);
  check((await view()) === 'devices' && (await shownSlot()) === 'js2' && (await row('js2').getAttribute('data-selected')) === '1' && (await side.getAttribute('role')) === 'listbox', 'List: clicking js2 opens the Devices view on js2');
  // keyboard: ↓ / ↑ walk the selectable rows only (js / gp), Tab lands on the selected row
  await row('js2').focus();
  await p9.keyboard.press('ArrowDown');
  await p9.waitForTimeout(300);
  const afterDown = await shownSlot();
  await p9.keyboard.press('Home');
  await p9.waitForTimeout(300);
  check(afterDown === 'gp1' && (await shownSlot()) === 'js1' && (await row('js1').getAttribute('tabindex')) === '0' && (await row('kb1').getAttribute('tabindex')) === '-1' && (await p9.evaluate(() => document.activeElement?.dataset.slotRow)) === 'js1',
    'Devices: ↓ selects gp1, Home goes back to js1 (kb / mo skipped); the selected row is the Tab stop');
  // a dimmed row opens its own view
  await row('mo1').click();
  await p9.waitForTimeout(400);
  check((await view()) === 'keyboard' && (await side.getAttribute('data-mode')) === 'keyboard' && (await row('kb1').getAttribute('data-selected')) === '1' && (await row('js1').getAttribute('data-selectable')) === '0',
    'Devices: clicking the dimmed mo1 row switches to the Keyboard view (kb1 + mo1 marked, js dimmed)');
  // the Devices selection persists (reload)
  await row('gp1').click();
  await p9.waitForTimeout(400);
  await p9.reload({ waitUntil: 'networkidle' });
  await p9.locator('[data-view-tab=devices]').click();
  await p9.waitForTimeout(600);
  check((await shownSlot()) === 'gp1' && (await row('gp1').getAttribute('data-selected')) === '1', 'the Devices slot choice survives a reload (gp1, marked in the sidebar)');
  // narrow: the sidebar is hidden, the slot bar gets a compact dropdown
  await p9.setViewportSize({ width: 600, height: 900 });
  await p9.waitForTimeout(400);
  const sel = p9.getByTestId('device-slot-select');
  const opts = await sel.locator('option').allInnerTexts();
  await sel.selectOption('slot:js2');
  await p9.waitForTimeout(400);
  check(!(await p9.getByTestId('sidebar').isVisible()) && opts.length === 3 && /^JS1/.test(opts[0]) && (await shownSlot()) === 'js2' && (await row('js2').getAttribute('data-selected')) === '1',
    `narrow: no sidebar; a slot dropdown in the slot bar (${opts.join(' | ')}) switches to js2 and the profile card list follows`);
  await p9.getByTestId('device-slot-bar').scrollIntoViewIfNeeded();
  await p9.screenshot({ path: shots + '119-narrow-fallback.png' });
  await c9.close();
}

// ---- header links: Feedback (GitHub issues), GitHub repo, Support (Ko-fi). Plain links, new tab, no widget script
const HEADER_LINKS = { feedback: 'https://github.com/hamlet2k/sc-mapper/issues/new', github: 'https://github.com/hamlet2k/sc-mapper', support: 'https://ko-fi.com/hamlet2k' };
/** href / target / rel / accessible name / visible label / box of each header link, plus whether the title row overflows */
const headerLinkInfo = (pg) => pg.evaluate((ids) => {
  const row = document.querySelector('header').firstElementChild;
  const links = Object.fromEntries(ids.map((id) => {
    const a = document.querySelector(`[data-testid=link-${id}]`);
    if (!a) return [id, null];
    const r = a.getBoundingClientRect();
    return [id, { href: a.getAttribute('href'), target: a.getAttribute('target'), rel: a.getAttribute('rel') ?? '', name: a.getAttribute('aria-label') ?? '', text: a.innerText.trim(), left: r.left, right: r.right, w: r.width, h: r.height, svg: !!a.querySelector('svg') }];
  }));
  const title = document.querySelector('[data-testid=app-title]');
  return { links, rowOverflow: row.scrollWidth > row.clientWidth + 1, titleCut: title.scrollWidth > title.clientWidth + 1, vw: innerWidth, thirdParty: !!document.querySelector('script[src*="ko-fi"], iframe[src*="ko-fi"], script[src*="github"]') };
}, Object.keys(HEADER_LINKS));
/** every link: right href, new tab, rel=noopener, an icon, an accessible name naming it, inside the viewport */
const headerLinksOk = (info, names = { feedback: /Feedback/, github: /GitHub/, support: /Support.*Ko-fi/ }) => Object.entries(HEADER_LINKS).every(([id, href]) => {
  const l = info.links[id];
  return l && l.href === href && l.target === '_blank' && /\bnoopener\b/.test(l.rel) && l.svg && names[id].test(l.name) && /new tab/.test(l.name) && l.left >= 0 && l.right <= info.vw && l.w >= 24 && l.h >= 24;
});
console.log('\nheader links (Chrome)');
{
  const lc = await browser.newContext({ viewport: { width: 1680, height: 1000 }, deviceScaleFactor: 1 });
  const lp = await lc.newPage();
  lp.on('pageerror', (e) => errors.push('[links] ' + String(e)));
  const outside = [];
  lp.on('request', (r) => { if (/ko-fi\.com|github\.com/.test(r.url())) outside.push(r.url()); });
  await lp.goto(url, { waitUntil: 'networkidle' });
  await lp.evaluate(() => localStorage.clear());
  await lp.reload({ waitUntil: 'networkidle' });
  await lp.locator('input[type=file]').first().setInputFiles('public/samples/actionmaps.xml');
  await lp.waitForTimeout(600);
  const wide = await headerLinkInfo(lp);
  check(headerLinksOk(wide) && !wide.rowOverflow, `wide: Feedback, GitHub and Support links in the title row with the right hrefs, target=_blank, rel=noopener (${Object.values(wide.links).map((l) => l.href).join(' · ')})`);
  check(/^feedback$/i.test(wide.links.feedback.text) && /^support$/i.test(wide.links.support.text) && wide.links.github.text === '', `wide: Feedback and Support carry a text label, GitHub is icon-only (${wide.links.feedback.text} / ${wide.links.support.text})`);
  check(!wide.thirdParty && outside.length === 0, `no Ko-fi / GitHub widget script, iframe or request on load${outside.length ? ': ' + outside.join(' ') : ''}`);
  // a click opens the page in a new tab (the outside site is stubbed: no network in the test)
  await lc.route(/^https:\/\/(ko-fi\.com|github\.com)\//, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<title>stub</title>' }));
  const opened = [];
  for (const id of Object.keys(HEADER_LINKS)) {
    const [pop] = await Promise.all([lc.waitForEvent('page'), lp.getByTestId(`link-${id}`).click()]);
    await pop.waitForLoadState().catch(() => {});
    opened.push(pop.url());
    await pop.close();
  }
  check(opened.join(' ') === Object.values(HEADER_LINKS).join(' ') && lp.url().startsWith(url), `clicking each link opens it in a new tab and the app stays put (${opened.join(' · ')})`);
  await lp.bringToFront(); // background tabs throttle the tooltip timer
  await lp.mouse.move(5, 500); // the last click left the pointer on Support (and its pointerdown hid the tip)
  await lp.getByTestId('link-support').hover();
  await lp.waitForTimeout(450);
  const tip = await lp.getByTestId('tip-support').innerText().catch(() => '');
  check(/Ko-fi/.test(tip) && /new tab/.test(tip), `hovering Support shows a tooltip ("${tip}")`);
  await lp.screenshot({ path: shots + '160-header-links-wide.png', clip: { x: 0, y: 0, width: 1680, height: 260 } });
  await lp.mouse.move(5, 500);
  // narrow: icon-only buttons with aria-labels and tooltips; the title row still fits
  for (const w of [420, 360]) {
    await lp.setViewportSize({ width: w, height: 800 });
    await lp.waitForTimeout(300);
    const n = await headerLinkInfo(lp);
    check(headerLinksOk(n) && !n.rowOverflow && !n.titleCut && Object.values(n.links).every((l) => l.text === '') && await lp.getByTestId('app-title').isVisible() && await lp.getByTestId('open-help').isVisible(),
      `${w} px: the three links collapse to icon-only buttons with aria-labels, the title row fits without cutting the title (help at ${Math.round((await lp.getByTestId('open-help').boundingBox()).x + 32)} px)`);
  }
  // keyboard focus shows the tooltip at once. A Tab press also counts as "highlight on press" (it scrolls the list to
  // Tab's bindings, and any scroll hides tooltips), so Tab once to enter keyboard mode, let that settle, then move focus.
  await lp.keyboard.press('Tab');
  for (let i = 0, last = -1; i < 40; i++) { // until the list has stopped scrolling
    await lp.waitForTimeout(250);
    const top = await lp.evaluate(() => document.querySelector('main')?.scrollTop ?? 0);
    if (top === last) break;
    last = top;
  }
  await lp.getByTestId('link-github').focus();
  await lp.getByTestId('link-feedback').focus();
  await lp.waitForTimeout(150);
  const ntip = await lp.getByTestId('tip-feedback').innerText().catch(() => '');
  check(/Feedback/.test(ntip), `narrow: keyboard focus on the Feedback icon shows its tooltip ("${ntip}")`);
  await lp.screenshot({ path: shots + '161-header-links-narrow.png', clip: { x: 0, y: 0, width: 360, height: 400 } });
  await lc.close();
}

// ---- drag & drop in a real Firefox (Gecko): synthetic file drags exercise the page's handlers there (types list, text-node
// targets, cancelled dragenter / dragover, the overlay hiding when the drag leaves without a final dragleave)
console.log('\ndrop overlay in Firefox (Gecko)');
{
  let gecko = null;
  try { gecko = await firefox.launch(); } catch (e) { console.log('  - skipped: Playwright Firefox not installed (npx playwright install firefox)'); }
  if (gecko) {
    const gp = await (await gecko.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
    gp.on('pageerror', (e) => errors.push('[gecko] ' + String(e)));
    await gp.goto(url, { waitUntil: 'networkidle' });
    await gp.evaluate(() => localStorage.clear());
    await gp.reload({ waitUntil: 'networkidle' });
    const tunedX = readFileSync('scripts/fixtures/round4-tuned.xml', 'utf8'), repl = readFileSync('scripts/fixtures/round4-replugged.xml', 'utf8');
    // enter on <body>, dragover / drop on a zone; textNode: use the zone's first text node as the event target (Gecko does that)
    const gdrag = (name, text, zone, { textNode = false, drop = true } = {}) => gp.evaluate(async ({ name, text, zone, textNode, drop }) => {
      const dt = new DataTransfer();
      dt.items.add(new File([text], name, { type: 'text/xml' }));
      const ev = (type) => new DragEvent(type, { dataTransfer: dt, bubbles: true, cancelable: true });
      const enterCancelled = !document.body.dispatchEvent(ev('dragenter'));
      await new Promise((r) => setTimeout(r, 120));
      const zoneEl = document.querySelector(`[data-drop-zone="${zone}"]`);
      let target = zoneEl ?? document.body;
      if (textNode && zoneEl) { const w = document.createTreeWalker(zoneEl, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode()) && !n.textContent.trim()); if (n) target = n; }
      const overCancelled = !target.dispatchEvent(ev('dragover'));
      const overlay = !!document.querySelector('[data-testid=drop-overlay]');
      if (drop) target.dispatchEvent(ev('drop'));
      return { enterCancelled, overCancelled, overlay, textTarget: target.nodeType === 3, types: [...dt.types] };
    }, { name, text, zone, textNode, drop });
    const r1 = await gdrag('round4-tuned.xml', tunedX, 'import');
    await gp.waitForTimeout(500);
    check(r1.types.includes('Files') && r1.enterCancelled && r1.overCancelled && r1.overlay && (await gp.locator('#profile option').count()) === 2,
      `Firefox: file drag shows the overlay (types ${r1.types.join('/')}, dragenter + dragover cancelled) and the drop imports`);
    const r2 = await gdrag('round4-replugged.xml', repl, 'refresh', { textNode: true });
    await gp.waitForTimeout(500);
    check(r2.textTarget && await gp.getByTestId('rematch-banner').isVisible(), 'Firefox: drop on the Refresh zone (text-node target) refreshes the game state');
    await gp.getByTestId('rematch-dismiss').click();
    const r3 = await gdrag('round4-tuned.xml', tunedX, 'import', { textNode: true });
    await gp.waitForTimeout(500);
    check(r3.textTarget && (await gp.getByTestId('import-shift').isVisible() || (await gp.locator('#profile option').count()) === 3), 'Firefox: a text node inside "Import as profile" still counts as that zone');
    if (await gp.getByTestId('import-shift').isVisible()) await gp.getByTestId('import-as-is').click();
    await gdrag('round4-tuned.xml', tunedX, 'refresh', { drop: false }); // the drag leaves the window without a final dragleave
    await gp.waitForTimeout(1600);
    check(await gp.getByTestId('drop-overlay').count() === 0, 'Firefox: the overlay hides by itself when no dragover arrives any more (no stuck overlay)');
    // header links in Gecko: wide (labels) and narrow (icon-only), same hrefs / new tab / rel
    const gw = await headerLinkInfo(gp);
    check(headerLinksOk(gw) && !gw.rowOverflow && /^support$/i.test(gw.links.support.text), 'Firefox: Feedback, GitHub and Support links with the right hrefs, target=_blank, rel=noopener');
    await gp.context().route(/^https:\/\/(ko-fi\.com|github\.com)\//, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<title>stub</title>' }));
    const [gpop] = await Promise.all([gp.context().waitForEvent('page'), gp.getByTestId('link-support').click()]);
    await gpop.waitForLoadState().catch(() => {});
    check(gpop.url() === HEADER_LINKS.support, `Firefox: Support opens Ko-fi in a new tab (${gpop.url()})`);
    await gpop.close();
    await gp.setViewportSize({ width: 360, height: 800 });
    await gp.waitForTimeout(300);
    const gn = await headerLinkInfo(gp);
    check(headerLinksOk(gn) && !gn.rowOverflow && !gn.titleCut && Object.values(gn.links).every((l) => l.text === ''), 'Firefox 360 px: icon-only links inside the viewport, the title row fits (title not cut)');
    await gp.screenshot({ path: shots + '162-header-links-firefox-narrow.png', clip: { x: 0, y: 0, width: 360, height: 300 } });
    await gecko.close();
  }
}

// persistence
await page.reload({ waitUntil: 'networkidle' });
log('profile after reload:', await page.locator('#profile option:checked').innerText());
check(errors.length === 0, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
await browser.close();
console.log(failures.length ? `\n${failures.length} FAILED` : '\nall e2e checks passed');
process.exit(failures.length ? 1 : 0);
