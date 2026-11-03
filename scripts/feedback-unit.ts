import assert from 'node:assert/strict';
import { annoReducer as reduce, EMPTY_ANNO, rectFrom, simplify } from '../src/feedback/annotations';
import { micDown, micUp } from '../src/feedback/mic-gesture';
import { insertAtCursor } from '../src/feedback/insert-text';
import { safeUrl, TrailBuffer } from '../src/feedback/context';
import { allowedOrigin, FeedbackError, imageType, validatePayload, validEmail, MAX_IMAGE } from '../api/_lib/validation.js';
import { createRateLimiter } from '../api/_lib/rate-limit.js';
import { buildEmail, escapeHtml } from '../api/_lib/email.js';
import { createHandlers } from '../api/_lib/handler.js';
import { GET, POST } from '../api/feedback.js';

let passed = 0;
const t = async (name: string, fn: () => void | Promise<void>) => { await fn(); passed++; console.log('  ✓ feedback:', name); };
const payload = () => ({ kind: 'bug' as const, body: 'A message', email: 'user@example.com', pins: [{ n: 1, x: 20, y: 40, element: { tag: 'button', text: 'Test <b>' } }], context: { route: '/', trail: [{ kind: 'click', el: { text: 'Hello <script>' } }] }, hp: '' });
const env = { RESEND_API_KEY: 'test-secret', FEEDBACK_TO: 'owner@example.com' };
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0]);
const request = (p: unknown = payload(), image?: Blob, origin: string | null = 'http://localhost:4199', ip = '1.2.3.4') => {
  const form = new FormData(); form.set('payload', JSON.stringify(p)); if (image) form.set('image', image, 'untrusted.exe');
  return new Request('https://sc-mapper.vercel.app/api/feedback', { method: 'POST', headers: { ...(origin ? { Origin: origin } : {}), 'x-forwarded-for': ip }, body: form });
};
const statusError = (status: number) => (error: unknown) => error instanceof FeedbackError && error.status === status;

await t('reducer renumbers pins, moves and deletes, restores undo immutably', () => {
  let s = reduce(EMPTY_ANNO, { type: 'addPin', x: 10, y: 20, element: null }); const first = s;
  s = reduce(s, { type: 'addPin', x: 30, y: 40, element: null });
  s = reduce(s, { type: 'deletePin', n: 1 }); assert.deepEqual(s.current.pins.map((p) => p.n), [1]); assert.equal(s.current.pins[0].x, 30);
  s = reduce(s, { type: 'movePin', n: 1, x: 50, y: 60, element: null }); assert.equal(s.current.pins[0].x, 50);
  s = reduce(s, { type: 'undo' }); assert.equal(s.current.pins[0].x, 30);
  assert.equal(first.current.pins[0].x, 10); assert.equal(reduce(s, { type: 'movePin', n: 99, x: 0, y: 0, element: null }), s);
});
await t('reducer strokes, min redaction, move/delete, reset and 100-entry undo cap', () => {
  let s = reduce(EMPTY_ANNO, { type: 'addStroke', stroke: { points: [[1, 1]] } }); assert.equal(s, EMPTY_ANNO);
  s = reduce(s, { type: 'addStroke', stroke: { points: [[1, 1], [4, 4]] } });
  s = reduce(s, { type: 'addRedaction', x: 0, y: 0, w: 5, h: 40 }); assert.equal(s.current.redactions.length, 0);
  s = reduce(s, { type: 'addRedaction', x: 2, y: 3, w: 6, h: 6 });
  s = reduce(s, { type: 'moveRedaction', id: 1, x: 90, y: 90 }); assert.equal(s.current.redactions[0].x, 90);
  s = reduce(s, { type: 'deleteRedaction', id: 1 }); assert.equal(s.current.redactions.length, 0);
  s = reduce(s, { type: 'undo' }); assert.equal(s.current.redactions.length, 1);
  for (let i = 0; i < 130; i++) s = reduce(s, { type: 'addPin', x: i, y: i, element: null });
  assert.equal(s.past.length, 100);
  for (let i = 0; i < 100; i++) s = reduce(s, { type: 'undo' }); assert.equal(s.current.pins.length, 30);
  assert.equal(reduce(s, { type: 'undo' }), s); assert.equal(reduce(s, { type: 'reset' }), EMPTY_ANNO);
  assert.deepEqual(rectFrom(50, 60, 10, 20), { x: 10, y: 20, w: 40, h: 40 });
  assert.deepEqual(simplify([[0, 0], [1, 0], [2, 0], [2, 1], [5, 5]]), [[0, 0], [2, 0], [5, 5]]);
});
await t('mic tap toggles, hold stops at 350ms, already listening stops', () => {
  assert.equal(micUp(micDown(false, 100), 449), 'keep'); assert.equal(micUp(micDown(false, 100), 450), 'stop');
  assert.equal(micUp(micDown(true, 100), 101), 'stop'); assert.equal(micUp(micDown(true, 100), 900), 'stop');
});
await t('dictated text inserts and replaces at selection with spacing and clamping', () => {
  assert.deepEqual(insertAtCursor('hello world', 'new', { start: 6, end: 6 }), { value: 'hello new world', caret: 9 });
  assert.deepEqual(insertAtCursor('hello world', 'there', { start: 6, end: 11 }), { value: 'hello there', caret: 11 });
  assert.deepEqual(insertAtCursor('hi', ' ok ', null), { value: 'hi ok', caret: 5 });
  assert.equal(insertAtCursor('hi', ' ', null).value, 'hi'); assert.equal(insertAtCursor('hi', 'yes', { start: -10, end: 300 }).value, 'yes');
});
await t('URL stripping covers repeated sensitive params, hashes and credentials', () => {
  const url = new URL(safeUrl('https://name:pass@example.com/path?ok=1&apiKey=private&token=1&TOKEN=2&code=3&secret=4&password=5#/devices?code=hidden&tab=2'));
  assert.equal(url.search, '?ok=1'); assert.equal(url.hash, '#/devices?tab=2'); assert.equal(url.username, ''); assert.equal(url.password, '');
});
await t('trail collapses nav duplicates, retains 20 entries and returns detached snapshots', () => {
  const trail = new TrailBuffer(); trail.push({ t: 0, kind: 'nav', path: '/', el: null }); trail.push({ t: 1, kind: 'nav', path: '/', el: null }); assert.equal(trail.snapshot().length, 1);
  for (let i = 0; i < 25; i++) trail.push({ t: i, kind: 'click', path: `/${i}`, el: null });
  const snapshot = trail.snapshot(); assert.equal(snapshot.length, 20); assert.equal(snapshot[0].path, '/5'); snapshot[0].path = 'mutated'; assert.equal(trail.snapshot()[0].path, '/5');
});
await t('payload shape, body, byte limits and email validation', () => {
  assert.equal(validatePayload(payload()).kind, 'bug');
  for (const p of [null, [], {}, { ...payload(), kind: 'other' }, { ...payload(), body: ' ' }, { ...payload(), body: 'x'.repeat(8001) }, { ...payload(), email: 'a\nb@example.com' }, { ...payload(), pins: {} }, { ...payload(), context: [] }]) assert.throws(() => validatePayload(p), statusError(400));
  assert.throws(() => validatePayload({ ...payload(), context: { x: 'é'.repeat(33000) } }), statusError(413));
  assert.throws(() => validatePayload({ ...payload(), pins: ['x'.repeat(66000)] }), statusError(413));
  assert.equal(validatePayload({ ...payload(), body: 'x'.repeat(8000), email: undefined }).body.length, 8000);
  assert.equal(validEmail('a+b@example.org'), true); assert.equal(validEmail('bad'), false);
});
await t('magic bytes identify images regardless of supplied mime/extension', () => {
  assert.equal(imageType(png), 'png'); assert.equal(imageType(new Uint8Array([255, 216, 255, 0])), 'jpg');
  assert.equal(imageType(new TextEncoder().encode('RIFF0000WEBP')), 'webp');
  for (const bad of [new Uint8Array(), png.slice(0, 6), new TextEncoder().encode('<script>'), new TextEncoder().encode('RIFF0000WAVE')]) assert.equal(imageType(bad), null);
});
await t('origins allow production, local and intended previews only', () => {
  for (const origin of ['https://sc-mapper.vercel.app', 'http://localhost:4199', 'https://localhost:4433', 'http://127.0.0.1:5173', 'https://sc-mapper-abc123-hamlet2k.vercel.app', 'https://sc-mapper-git-feedback-hamlet2k.vercel.app']) assert.equal(allowedOrigin(origin), true, origin);
  for (const origin of [null, 'null', 'https://evil.com', 'https://sc-mapper.vercel.app.evil.com', 'https://sc-mapper-abc-other.vercel.app', 'http://sc-mapper.vercel.app', 'https://sc-mapper.vercel.app/path', 'https://user@sc-mapper.vercel.app']) assert.equal(allowedOrigin(origin), false, String(origin));
});
await t('per-IP limiter enforces sliding 10-minute and daily windows', () => {
  let now = 0; const allow = createRateLimiter(() => now);
  for (let batch = 0; batch < 4; batch++) { for (let i = 0; i < 5; i++) assert.equal(allow('a'), true); assert.equal(allow('a'), false); now += 600001; }
  assert.equal(allow('a'), false); assert.equal(allow('b'), true); now = 86400001; assert.equal(allow('a'), true);
});
await t('email includes kind, pins, context and trail while escaping every HTML value', () => {
  const p = { ...payload(), body: '<script>alert("x")</script>\nnext', context: { '<key>': '<img>', trail: ['<b>'] } };
  const email = buildEmail(p); assert.match(email.subject, /^\[SC Mapper\] Bug:/); assert.equal(email.subject.includes('\n'), false);
  assert.equal(email.html.includes('<script>'), false); assert.equal(email.html.includes('<img>'), false); assert.match(email.html, /&lt;key&gt;/); assert.match(email.html, /&lt;b&gt;/);
  assert.match(email.text, /Pins \(with element info\)/); assert.match(email.text, /Click trail/); assert.match(email.text, /Test <b>/);
  assert.equal(escapeHtml('&<>"\''), '&amp;&lt;&gt;&quot;&#39;');
});
await t('GET reports configured boolean only, from the real entry point', async () => {
  const oldKey = process.env.RESEND_API_KEY, oldTo = process.env.FEEDBACK_TO;
  try {
    process.env.RESEND_API_KEY = 'do-not-echo'; delete process.env.FEEDBACK_TO;
    assert.deepEqual(await (await GET(new Request('http://localhost/api/feedback'))).json(), { configured: false });
    process.env.FEEDBACK_TO = 'owner@example.com';
    assert.deepEqual(await (await GET(new Request('http://localhost/api/feedback'))).json(), { configured: true });
  } finally { if (oldKey === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = oldKey; if (oldTo === undefined) delete process.env.FEEDBACK_TO; else process.env.FEEDBACK_TO = oldTo; }
});
await t('full handler sends multipart image, safe email and reply_to with mocked fetch', async () => {
  let called = 0;
  const handlers = createHandlers({ env: () => env, fetch: async (url, init) => {
    called++; assert.equal(url, 'https://api.resend.com/emails'); assert.equal((init!.headers as Record<string, string>).Authorization, 'Bearer test-secret');
    const message = JSON.parse(init!.body as string); assert.deepEqual(message.to, ['owner@example.com']); assert.equal(message.reply_to, 'user@example.com');
    assert.equal(message.attachments[0].filename, 'screenshot.png'); assert.equal(message.attachments[0].content, Buffer.from(png).toString('base64'));
    assert.match(message.html, /Test &lt;b&gt;/); return Response.json({ id: 'test-id' });
  } });
  const response = await handlers.POST(request(payload(), new Blob([png], { type: 'application/octet-stream' })));
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), { ok: true, id: 'test-id' }); assert.equal(called, 1);
});
await t('POST rejects malformed forms, missing Origin, size/type errors and fakes honeypot success', async () => {
  const handlers = createHandlers({ env: () => env, fetch: async () => { throw new Error('must not call network'); } });
  assert.equal((await handlers.POST(request(payload(), undefined, null))).status, 403);
  assert.equal((await handlers.POST(request({ ...payload(), body: '' }))).status, 400);
  assert.equal((await handlers.POST(request(payload(), new Blob(['<html>'])))).status, 400);
  assert.equal((await handlers.POST(request(payload(), new Blob([new Uint8Array(MAX_IMAGE + 1)])))).status, 413);
  assert.equal((await handlers.POST(request({ hp: 'bot' }))).status, 200);
  const form = new FormData(); form.set('payload', 'no json');
  assert.equal((await handlers.POST(new Request('http://localhost/api/feedback', { method: 'POST', headers: { Origin: 'http://localhost' }, body: form }))).status, 400);
});
await t('Turnstile verification, expired token, upstream failures and rate-limited POST', async () => {
  let calls = 0;
  const handlers = createHandlers({ env: () => ({ ...env, TURNSTILE_SECRET_KEY: 'secret' }), fetch: async (url, init) => {
    calls++;
    if (String(url).includes('siteverify')) { assert.equal((init!.body as URLSearchParams).get('response'), 'token'); return Response.json({ success: true }); }
    return Response.json({ id: 'verified' });
  } });
  assert.equal((await handlers.POST(request())).status, 403);
  assert.equal((await handlers.POST(request({ ...payload(), turnstileToken: 'token' }))).status, 200); assert.equal(calls, 2);
  const rejected = createHandlers({ env: () => ({ ...env, TURNSTILE_SECRET_KEY: 'secret' }), fetch: async () => Response.json({ success: false }) });
  assert.equal((await rejected.POST(request({ ...payload(), turnstileToken: 'token' }))).status, 403);
  const unavailable = createHandlers({ env: () => env, fetch: async () => { throw new Error('no network'); } });
  assert.equal((await unavailable.POST(request())).status, 502);
  for (let i = 0; i < 4; i++) await unavailable.POST(request());
  assert.equal((await unavailable.POST(request())).status, 429);
});
await t('combined valid field sizes are accepted and malformed upstream JSON returns 502', async () => {
  const large = { ...payload(), body: '\u0000'.repeat(8000), pins: ['x'.repeat(65000)], context: { value: 'x'.repeat(65000) } };
  const handlers = createHandlers({ env: () => env, fetch: async () => Response.json({ id: 'large' }) });
  assert.equal((await handlers.POST(request(large))).status, 200);
  const malformed = createHandlers({ env: () => env, fetch: async () => new Response('not JSON') });
  assert.equal((await malformed.POST(request())).status, 502);
});
await t('actual POST export uses injected global fetch without real networking', async () => {
  const originalFetch = globalThis.fetch, originalEnv = { ...process.env };
  const oldError = console.error;
  try {
    delete process.env.RESEND_API_KEY; delete process.env.FEEDBACK_TO; console.error = () => undefined;
    assert.equal((await POST(request())).status, 500);
    Object.assign(process.env, env); delete process.env.TURNSTILE_SECRET_KEY;
    globalThis.fetch = async () => Response.json({ id: 'entry-point' });
    assert.deepEqual(await (await POST(request())).json(), { ok: true, id: 'entry-point' });
    globalThis.fetch = async () => Response.json({ message: 'private detail' }, { status: 401 });
    const failed = await POST(request()); assert.equal(failed.status, 502); assert.equal((await failed.text()).includes('private detail'), false);
  } finally {
    globalThis.fetch = originalFetch; console.error = oldError;
    for (const key of ['RESEND_API_KEY', 'FEEDBACK_TO', 'TURNSTILE_SECRET_KEY']) { if (originalEnv[key] === undefined) delete process.env[key]; else process.env[key] = originalEnv[key]; }
  }
});
console.log(`\n${passed} feedback unit checks passed`);
