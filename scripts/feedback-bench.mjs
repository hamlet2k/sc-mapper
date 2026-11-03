// Usage: node scripts/feedback-bench.mjs <url> — times click → feedback layer open at several viewports.
import { chromium, firefox } from 'playwright';
const url = process.argv[2] || 'http://localhost:4199';
const engine = process.argv[3] || 'chromium';
const browser = engine === 'firefox' ? await firefox.launch() : await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const rows = [];
for (const [width, height] of [[1600, 900], [1920, 1080]]) for (const dpr of [1, 1.5]) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: dpr });
  await ctx.route('**/api/feedback', (r) => r.request().method() === 'GET' ? r.fulfill({ json: { configured: true } }) : r.fulfill({ status: 500 }));
  const p = await ctx.newPage();
  await p.goto(url, { waitUntil: 'networkidle' });
  await p.getByTestId('feedback-open').waitFor();
  await p.waitForTimeout(1500);
  const t = Date.now();
  await p.getByTestId('feedback-open').click();
  let ms, note = '';
  try { await p.getByTestId('feedback-layer').waitFor({ state: 'visible', timeout: 40000 }); ms = Date.now() - t; note = (await p.getByTestId('feedback-capture-skipped').count()) ? 'skipped' : 'ok'; }
  catch { ms = '>40000'; }
  rows.push({ viewport: `${width}x${height}`, dpr, ms, note }); console.log(rows.at(-1));
  await ctx.close();
}
console.table(rows); await browser.close();
