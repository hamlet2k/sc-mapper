// Local-only handler exercise. No credentials or real network required: node --import tsx scripts/feedback-harness.ts
import { GET, POST } from '../api/feedback';
const originalFetch = globalThis.fetch;
const saved = { RESEND_API_KEY: process.env.RESEND_API_KEY, FEEDBACK_TO: process.env.FEEDBACK_TO, TURNSTILE_SECRET_KEY: process.env.TURNSTILE_SECRET_KEY };
try {
  process.env.RESEND_API_KEY = 'harness-only'; process.env.FEEDBACK_TO = 'harness@example.com'; delete process.env.TURNSTILE_SECRET_KEY;
  globalThis.fetch = async (url, init) => {
    const email = JSON.parse(init!.body as string);
    console.log('Mock delivery:', { url: String(url), subject: email.subject, attachments: email.attachments?.length ?? 0 });
    return Response.json({ id: 'harness-id' });
  };
  console.log('GET:', await (await GET(new Request('http://localhost/api/feedback'))).json());
  const form = new FormData(); form.set('payload', JSON.stringify({ kind: 'question', body: 'Harness test', pins: [], context: { route: '/', trail: [] }, hp: '' }));
  const result = await POST(new Request('http://localhost/api/feedback', { method: 'POST', headers: { Origin: 'http://localhost:4199' }, body: form }));
  console.log('POST:', result.status, await result.json());
} finally {
  globalThis.fetch = originalFetch;
  for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
}
