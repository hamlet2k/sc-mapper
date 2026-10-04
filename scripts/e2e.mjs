// End-to-end test + screenshots. Usage: node scripts/e2e.mjs [url]
// Controllers are simulated by replacing navigator.getGamepads() (a headless browser has no real HID devices).
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
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
await ff.close();

// persistence
await page.reload({ waitUntil: 'networkidle' });
log('profile after reload:', await page.locator('#profile option:checked').innerText());
check(errors.length === 0, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
await browser.close();
console.log(failures.length ? `\n${failures.length} FAILED` : '\nall e2e checks passed');
process.exit(failures.length ? 1 : 0);
