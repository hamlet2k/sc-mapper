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

const search = page.getByPlaceholder(/Search actions|refine:/);
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
log('stats after import:', (await page.locator('header button:has-text("customized"), header button:has-text("conflicts")').allInnerTexts()).join(' | '));
await page.screenshot({ path: shots + '03-imported-profile.png' });
await page.getByRole('button', { name: 'Customized only' }).click();
await page.waitForTimeout(250);
log('customized-only rows:', await rows.count());
await page.screenshot({ path: shots + '04-customized-only.png' });
await page.getByRole('button', { name: 'Customized only' }).click();
await page.getByRole('button', { name: /Joystick/ }).first().dblclick();
await page.waitForTimeout(250);
log('joystick-only rows:', await rows.count());
await page.getByRole('button', { name: /Joystick/ }).first().dblclick();
await page.getByRole('button', { name: /Keyboard$/ }).last().click();
await page.waitForTimeout(300);
await page.locator('button[title^="V:"]').first().hover();
await page.waitForTimeout(200);
await page.screenshot({ path: shots + '05-keyboard-view.png' });
await page.getByRole('button', { name: /^⚠ Conflicts/ }).click();
await page.waitForTimeout(300);
log('conflict cards:', await page.locator('#main .hud-panel.border-l-2').count());
await page.screenshot({ path: shots + '06-conflicts.png' });
await page.getByRole('button', { name: /☰ List/ }).click();

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

// ===================== controllers panel + live input tester =====================
console.log('\ncontrollers & input tester');
await page.getByRole('button', { name: /🕹 Controllers/ }).first().click();
const panel = page.getByTestId('controllers-panel');
check(await panel.isVisible(), 'controllers panel opens from the header');
check(await page.getByTestId('tester-empty').isVisible(), 'no devices yet: "Press any button on your controller to wake it up"');
check((await page.getByTestId('profile-devices').innerText()).includes('VKBsim Gladiator EVO L'), 'devices declared in the imported profile are listed');
await page.screenshot({ path: shots + '13-controllers-wake-prompt.png' });
await page.evaluate(() => window.__btn(1, 2, true)); // the waking press
await page.waitForTimeout(120);
await page.evaluate(() => window.__btn(1, 2, false));
await page.waitForTimeout(500);
check(await page.getByTestId('device-row').count() === 3, 'all three controllers appear after one button press (no gamepadconnected event)');
check(await panel.getByTestId('chromium-banner').isVisible(), 'Chromium banner in the Controllers panel (headless Chrome)');
check(/at most 4 controllers/i.test(await panel.getByTestId('chromium-banner').innerText()) && /32 buttons \/ 16 axes/.test(await panel.getByTestId('chromium-banner').innerText()), 'banner explains the 4-device / 32-button / 16-axis limits and recommends Firefox');
await panel.evaluate((el) => el.scrollTo(0, 0));
await page.screenshot({ path: shots + '19-chromium-banner.png' });
const srcs = await page.getByTestId('device-source').allInnerTexts();
log('   sources:', srcs.join(' | '));
check(srcs.filter((x) => x.includes('USB id')).length === 2, 'both VKB sticks matched to the profile by USB id');
check((await page.getByTestId('profile-devices').innerText()).includes('↔ VKBsim Gladiator EVO R'), 'profile js1 shows the browser device mapped to it');
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
const lRow = page.locator('[data-testid=device-row][data-device$="EVO L"]');
await lRow.getByLabel('Game instance').selectOption('3');
await page.waitForTimeout(400);
check((await lRow.getByTestId('device-source').innerText()).includes('set by you'), 'instance can be overridden (js3, "set by you")');
await panel.evaluate((el) => el.scrollTo(0, 0));
await page.screenshot({ path: shots + '15-controllers-panel.png' });
await lRow.getByRole('button', { name: /automatic/ }).click();
await page.waitForTimeout(400);
check((await lRow.getByLabel('Game instance').inputValue()) === '2', 'reset to automatic restores the profile match (js2)');
await panel.getByRole('button', { name: '✕' }).first().click();

// ===================== device settings: invert / exponent / curve / deadzone =====================
console.log('\ndevice settings & curve editor');
await page.getByRole('button', { name: /🕹 Controllers/ }).first().click();
await panel.getByTestId('tab-settings').click();
const ds = page.getByTestId('device-settings');
check(await ds.isVisible(), 'settings tab opens');
check(await ds.getByTestId('settings-js9').count() === 0 && await ds.getByTestId('settings-js8').count() === 1, 'settings limited to js1–js8 like the game');
const grp = (n) => ds.locator(`[data-testid=settings-groups] button[data-group="${n}"]`);
check((await grp('flight_move_yaw').innerText()).includes('exp 1.3000001'), 'imported js1 flight_move_yaw exponent shown');
await ds.getByTestId('settings-js2').click();
check((await grp('flight_move_strafe_vertical').innerText()).includes('curve 4pt') && (await grp('flight_move_strafe_vertical').innerText()).includes('inverted'), 'imported js2 strafe vertical invert + 4-point curve shown');
check((await ds.getByLabel('saturation x').count()) === 1, 'axis table shown for js2');
await ds.getByTestId('settings-js1').click();
await page.waitForTimeout(150);
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
await panel.getByRole('button', { name: '✕' }).first().click();
await page.getByRole('button', { name: /⇩ Export/ }).click();
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
await page.getByRole('button', { name: /Keyboard$/ }).last().click();
await page.waitForTimeout(300);
await page.keyboard.press('KeyN');
await page.waitForTimeout(300);
check(await page.locator('#main [data-flash="1"]').count() > 0, 'keyboard view: pressing N lights the key');
await page.screenshot({ path: shots + '18-highlight-keyboard.png' });
await page.getByRole('button', { name: /☰ List/ }).click();
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
await page.getByRole('button', { name: /Highlight on press/ }).click();
await page.evaluate(() => document.activeElement?.blur());
await page.keyboard.press('KeyN');
await page.waitForTimeout(300);
check(!(await badge.isVisible()), 'toggle turns highlighting off');
await page.getByRole('button', { name: /Highlight on press/ }).click();

// ===================== editing (starting from the game defaults) =====================
console.log('\nbinding editor');
await page.locator('#profile').selectOption('');
await page.getByRole('button', { name: /✎ Edit/ }).click();
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
await editor.getByRole('button', { name: '✕' }).first().click();

// 8. export, download, re-import
await search.fill('');
await page.getByRole('button', { name: /⇩ Export/ }).click();
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


// ===================== devices view =====================
console.log('\ndevices view');
await search.fill('');
{ // back to the sample profile (28 rebinds, with customized and conflicting joystick bindings)
  const o = (await page.locator('#profile option').allInnerTexts()).find((x) => x.startsWith('My bindings'));
  await page.locator('#profile').selectOption({ label: o });
  await page.waitForTimeout(300);
}
await page.getByRole('button', { name: /🕹 Devices/ }).click();
const dv = page.getByTestId('device-view');
await page.waitForTimeout(600);
check(await dv.isVisible(), 'devices view opens');
const dsel = dv.getByTestId('device-select');
const dopts = await dsel.locator('option').allInnerTexts();
check(dopts.some((o) => /^JS1 · VKBsim Gladiator EVO R/.test(o)) && dopts.some((o) => /^JS2 · VKBsim Gladiator EVO L/.test(o)) && dopts.some((o) => /^GP1/.test(o)), `device picker lists the connected devices with their game numbers (${dopts.join(' | ')})`);
await dsel.selectOption({ label: dopts.find((o) => /^JS1 · /.test(o)) });
await page.waitForTimeout(300);
check(/Generic stick/.test(await dv.getByTestId('device-status').innerText()), 'no template linked yet: generic stick');
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
{ // the classic generic stick is still available; it has no callout for button 12, so that binding goes to the list beside the picture
  await dv.getByTestId('template-select').selectOption('builtin-stick-classic');
  await page.waitForTimeout(250);
  const ov = await dv.getByTestId('device-overflow').innerText();
  check((await dv.locator('[data-callout]').count()) === 12 && (await dv.locator('[data-overflow="button12"]').count()) === 1 && /Autoland/.test(ov), `classic stick template: bound inputs without a callout listed beside the picture (${ov.replace(/\n/g, ' ')})`);
  await dv.getByTestId('template-select').selectOption('');
  await page.waitForTimeout(250);
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
  await dv.getByTestId('template-select').selectOption('');
  await page.waitForTimeout(250);
}
await b1.click();
const ip = dv.getByTestId('input-panel');
check(await ip.isVisible() && (await ip.innerText()).includes('js1_button1'), 'clicking a callout opens the binding panel for js1_button1');
await ip.getByRole('button', { name: 'Edit' }).first().click();
check(await page.getByTestId('action-editor').isVisible(), 'Edit opens the action editor');
await page.getByTestId('action-editor').getByRole('button', { name: '✕' }).first().click();
await page.waitForTimeout(150);
await dv.locator('[data-callout="b6"]').click();
await ip.getByLabel('Search actions to bind').fill('landing system');
await ip.getByTestId('bind-results').locator('button').first().click();
await page.waitForTimeout(300);
check((await dv.locator('[data-callout="b6"]').innerText()).includes('Landing System') && (await dv.locator('[data-callout="b6"]').getAttribute('data-tone')) === 'custom', 'binding an action from the panel puts it on js1_button6');
{
  const [d] = await Promise.all([page.waitForEvent('download'), dv.getByTestId('device-png').click()]);
  const f = '/tmp/' + d.suggestedFilename();
  await d.saveAs(f);
  const buf = readFileSync(f);
  check(d.suggestedFilename().endsWith('.png') && buf.subarray(1, 4).toString() === 'PNG' && buf.length > 20000, `PNG export of the device with its mappings (${d.suggestedFilename()}, ${(buf.length / 1024) | 0} KB)`);
}

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
await dsel.selectOption({ label: (await dsel.locator('option').allInnerTexts()).find((o) => /^JS2 · /.test(o)) });
await page.waitForTimeout(300);
check(/Shared stick/.test(await dv.getByTestId('device-status').innerText()) && /name “Gladiator EVO L”/.test(await dv.getByTestId('device-status').innerText()), 'imported template auto-applies to the EVO L by name');
await page.reload({ waitUntil: 'networkidle' });
await page.getByRole('button', { name: /🕹 Devices/ }).click();
await page.waitForTimeout(500);
await dsel.selectOption({ label: (await dsel.locator('option').allInnerTexts()).find((o) => /^JS1 · /.test(o)) });
await page.waitForTimeout(300);
check(/linked to this device/.test(await dv.getByTestId('device-status').innerText()) && (await dv.locator('[data-callout]').count()) === 4, 'templates survive a reload (IndexedDB) and still match the profile device');
await page.getByRole('button', { name: /☰ List/ }).click();

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
await fp.getByRole('button', { name: /🕹 Controllers/ }).first().click();
const fpanel = fp.getByTestId('controllers-panel');
await fp.evaluate(() => window.__btn(0, 0, true));
await fp.waitForTimeout(120);
await fp.evaluate(() => window.__btn(0, 0, false));
await fp.waitForTimeout(600);
check(await fpanel.getByTestId('chromium-banner').count() === 0, 'Firefox: no Chromium banner');
check(await fpanel.getByTestId('device-row').count() === 15, `Firefox: all 15 controllers listed (${await fpanel.getByTestId('device-row').count()})`);
check(await fpanel.getByTestId('no-profile-hint').isVisible(), 'no profile: hint that numbering is the browser order (guess)');
check(await fpanel.getByTestId('dup-hint').isVisible() && await fpanel.getByTestId('device-ambiguous').count() === 2, 'identical MOZA bases flagged (same USB id 346E:1002)');
const mozaRows = await fpanel.locator('[data-testid=device-row][data-device="MOZA AB6 FFB Base"]').allInnerTexts();
check(mozaRows.length === 2 && mozaRows.some((x) => x.includes('1 of 2') && x.includes('128 buttons')) && mozaRows.some((x) => x.includes('2 of 2') && x.includes('133 buttons')), 'MOZA entries told apart: "1 of 2 · 128 buttons" / "2 of 2 · 133 buttons"');
const mozaInst = await fpanel.locator('[data-testid=device-row][data-device="MOZA AB6 FFB Base"]').nth(1).getByLabel('Game instance').inputValue();
await fp.evaluate(() => window.__btn(13, 132, true));
await fp.waitForTimeout(300);
check(await fpanel.getByTestId('tester-over-cap').first().isVisible(), 'input tester marks buttons above 128');
await fpanel.evaluate((el) => el.scrollTo(0, 0));
await fp.screenshot({ path: shots + '21-firefox-15-controllers.png', fullPage: false });
await fpanel.locator('[data-testid=device-row][data-device="MOZA AB6 FFB Base"]').first().scrollIntoViewIfNeeded();
await fpanel.getByTestId('tester-over-cap').first().scrollIntoViewIfNeeded();
await fp.screenshot({ path: shots + '22-firefox-moza-over-128.png', fullPage: false });
await fp.evaluate(() => window.__btn(13, 132, false));
await fpanel.getByRole('button', { name: '✕' }).first().click();
await fp.getByTestId('press-search').click();
await fp.waitForTimeout(400);
check(await fp.getByTestId('press-bar').getByTestId('chromium-banner').count() === 0, 'Firefox: no banner in the press bar');
await fp.evaluate(() => window.__btn(13, 132, true));
await fp.waitForTimeout(150);
await fp.evaluate(() => window.__btn(13, 132, false));
await fp.waitForTimeout(300);
const fchip = await fp.getByTestId('press-chip').innerText().catch(() => '');
check(fchip.includes(`js${mozaInst}_button133`), `press-to-search: second MOZA button 133 -> js${mozaInst}_button133 (${fchip})`);
check(/128/.test(await fp.getByTestId('press-chip').getAttribute('title')), 'chip warns that the game may not see buttons above 128');
// devices view: a template linked to the 133-button MOZA base only
await fp.getByRole('button', { name: /🕹 Devices/ }).click();
await fp.waitForTimeout(400);
writeFileSync('/tmp/moza133.json', JSON.stringify({ format: 'sc-mapper-device-templates', version: 1, templates: [{ id: 'moza-133', name: 'MOZA base (133)', slot: 'js', aspect: 1.6, match: [{ vendor: '346E', product: '1002', buttons: 133 }], callouts: [{ id: 'c', kind: 'button', inputs: ['button133'], anchor: { x: 0.5, y: 0.5 }, box: { x: 0.8, y: 0.2 } }] }] }));
await fp.getByTestId('template-import-file').setInputFiles('/tmp/moza133.json');
await fp.waitForTimeout(400);
{
  const fsel = fp.getByTestId('device-select');
  const fopts = await fsel.locator('option').allInnerTexts();
  const st = async (label) => { await fsel.selectOption({ label }); await fp.waitForTimeout(250); return fp.getByTestId('device-status').innerText(); };
  const s133 = await st(fopts.find((o) => o.includes('MOZA') && o.includes('133 buttons')));
  const s128 = await st(fopts.find((o) => o.includes('MOZA') && o.includes('128 buttons')));
  check(/MOZA base \(133\)/.test(s133) && /133 buttons/.test(s133) && !/MOZA base \(133\)/.test(s128), 'Firefox: template linked by USB id + 133 buttons applies to the second MOZA base only');
}
await ff.close();

// persistence
await page.reload({ waitUntil: 'networkidle' });
log('profile after reload:', await page.locator('#profile option:checked').innerText());
check(errors.length === 0, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
await browser.close();
console.log(failures.length ? `\n${failures.length} FAILED` : '\nall e2e checks passed');
process.exit(failures.length ? 1 : 0);
