// End-to-end smoke test + screenshots. Usage: node scripts/e2e.mjs [url]
import { chromium } from 'playwright';
const url = process.argv[2] ?? 'http://localhost:4173/';
const shots = new URL('../screenshots/', import.meta.url).pathname;
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1680, height: 1000 }, deviceScaleFactor: 1 });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
const log = (...a) => console.log('•', ...a);

await page.goto(url, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
log('title:', await page.title());
log('header stats:', (await page.locator('header').first().innerText()).split('\n').slice(0, 12).join(' | '));
await page.screenshot({ path: shots + '01-defaults-list.png' });

const search = page.getByPlaceholder(/Search actions/);
for (const q of ['quantum', 'mining', 'lalt+n', 'key:f', 'mouse2', 'qntm']) {
  await search.fill(q);
  await page.waitForTimeout(250);
  const n = await page.locator('#main .row-cv').count();
  const first = await page.locator('#main .row-cv').first().innerText().catch(() => '');
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
log('customized-only rows:', await page.locator('#main .row-cv').count());
await page.screenshot({ path: shots + '04-customized-only.png' });
await page.getByRole('button', { name: 'Customized only' }).click();

// joystick-only filter
await page.getByRole('button', { name: /Joystick/ }).dblclick();
await page.waitForTimeout(250);
log('joystick-only rows:', await page.locator('#main .row-cv').count());
await page.getByRole('button', { name: /Joystick/ }).dblclick();

await page.getByRole('button', { name: /Keyboard$/ }).last().click();
await page.waitForTimeout(300);
await page.locator('button[title^="V:"]').first().hover();
await page.waitForTimeout(200);
await page.screenshot({ path: shots + '05-keyboard-view.png' });

await page.getByRole('button', { name: /^⚠ Conflicts/ }).click();
await page.waitForTimeout(300);
log('conflict cards:', await page.locator('#main .hud-panel.border-l-2').count());
await page.screenshot({ path: shots + '06-conflicts.png' });

// persistence
await page.reload({ waitUntil: 'networkidle' });
log('profile after reload:', await page.locator('#profile option:checked').innerText());
log('errors:', errors.length ? errors : 'none');
await browser.close();
