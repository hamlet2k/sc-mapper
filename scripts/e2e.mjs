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

// ---- Gamepad API mock: one XInput pad (standard mapping) and two HOTAS sticks (raw mapping)
await page.addInitScript(() => {
  const btns = (n) => Array.from({ length: n }, () => ({ pressed: false, touched: false, value: 0 }));
  const pads = [
    { index: 0, id: 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)', mapping: 'standard', connected: true, buttons: btns(17), axes: [0, 0, 0, 0], timestamp: 0 },
    { index: 1, id: 'VKBsim Gladiator EVO R (Vendor: 231d Product: 0200)', mapping: '', connected: true, buttons: btns(32), axes: [0, 0, 0, 0, 0, 0, 0, 0, 0, 9 / 7], timestamp: 0 },
    { index: 2, id: 'VKBsim Gladiator EVO L (Vendor: 231d Product: 3201)', mapping: '', connected: true, buttons: btns(32), axes: [0, 0, -1, 0, 0, 0, 0, 0, 0, 9 / 7], timestamp: 0 },
  ];
  window.__pads = pads;
  window.__btn = (i, b, on) => { pads[i].buttons[b] = { pressed: on, touched: on, value: on ? 1 : 0 }; pads[i].timestamp++; };
  window.__axis = (i, a, v) => { pads[i].axes[a] = v; pads[i].timestamp++; };
  navigator.getGamepads = () => [...pads];
});

await page.goto(url, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
log('title:', await page.title());
log('header stats:', (await page.locator('header').first().innerText()).split('\n').slice(0, 12).join(' | '));
await page.screenshot({ path: shots + '01-defaults-list.png' });

const search = page.getByPlaceholder(/Search actions/);
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

// ===================== editing (starting from the game defaults) =====================
console.log('\nbinding editor');
await page.locator('#profile').selectOption('');
await page.getByRole('button', { name: /✎ Edit/ }).click();
check(await page.getByTestId('edit-bar').isVisible(), 'edit mode bar visible');
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

// 5. joystick: axis on the second stick, hat on the first
row = await rowFor('yaw', 'Yaw');
await addIn(row, 'joystick');
await page.waitForTimeout(500);
const devs = await page.getByTestId('device-list').innerText();
check(devs.includes('VKBsim Gladiator EVO R') && devs.includes('VKBsim Gladiator EVO L'), 'both sticks listed with names');
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

// persistence
await page.reload({ waitUntil: 'networkidle' });
log('profile after reload:', await page.locator('#profile option:checked').innerText());
check(errors.length === 0, `no page errors${errors.length ? ': ' + errors.join(' | ') : ''}`);
await browser.close();
console.log(failures.length ? `\n${failures.length} FAILED` : '\nall e2e checks passed');
process.exit(failures.length ? 1 : 0);
