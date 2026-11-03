import { buildEmail } from './email';
import { createRateLimiter } from './rate-limit';
import { allowedOrigin, FeedbackError, imageType, MAX_IMAGE, validatePayload } from './validation';

type Env = Record<string, string | undefined>;
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
export function configured(env: Env) { return Boolean(env.RESEND_API_KEY && env.FEEDBACK_TO); }
export function createHandlers(options: { env: () => Env; fetch?: typeof fetch; now?: () => number }) {
  const limit = createRateLimiter(options.now);
  const requestFetch = options.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  return {
    async GET(_request: Request) { return json({ configured: configured(options.env()) }); },
    async POST(request: Request) {
      try {
        if (!allowedOrigin(request.headers.get('origin'))) throw new FeedbackError(403, 'Origin not allowed');
        if (Number(request.headers.get('content-length')) > MAX_IMAGE + 224 * 1024) throw new FeedbackError(413, 'Feedback too large');
        const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
        if (!limit(ip)) throw new FeedbackError(429, 'Too many reports. Please try again later.');
        let form: FormData;
        try { form = await request.formData(); } catch { throw new FeedbackError(400, 'Expected multipart form data'); }
        const raw = form.get('payload');
        if (typeof raw !== 'string') throw new FeedbackError(400, 'Missing payload');
        if (new TextEncoder().encode(raw).length > 200 * 1024) throw new FeedbackError(413, 'Payload too large');
        let parsed: unknown;
        try { parsed = JSON.parse(raw); } catch { throw new FeedbackError(400, 'Invalid payload JSON'); }
        if (parsed && typeof parsed === 'object' && 'hp' in parsed && parsed.hp) return json({ ok: true, id: 'accepted' });
        const payload = validatePayload(parsed);
        const image = form.get('image');
        let attachment: { filename: string; content: string } | undefined;
        if (image !== null) {
          if (typeof image === 'string') throw new FeedbackError(400, 'Invalid image');
          if (image.size > MAX_IMAGE) throw new FeedbackError(413, 'Image exceeds 4MB');
          const bytes = new Uint8Array(await image.arrayBuffer());
          const type = imageType(bytes);
          if (!type) throw new FeedbackError(400, 'Image must be WebP, PNG or JPEG');
          attachment = { filename: `screenshot.${type}`, content: Buffer.from(bytes).toString('base64') };
        }
        const env = options.env();
        if (!configured(env)) {
          console.error('[feedback] RESEND_API_KEY and FEEDBACK_TO must be configured');
          throw new FeedbackError(500, 'Feedback is not configured');
        }
        if (env.TURNSTILE_SECRET_KEY) {
          if (!payload.turnstileToken) throw new FeedbackError(403, 'Please complete verification');
          let verification: Response;
          try {
            verification = await requestFetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST',
              body: new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: payload.turnstileToken, remoteip: ip }), signal: AbortSignal.timeout(10000) });
            const result = await verification.json() as { success?: boolean };
            if (!verification.ok || !result.success) throw new FeedbackError(403, 'Verification failed');
          } catch (e) { if (e instanceof FeedbackError) throw e; throw new FeedbackError(502, 'Verification unavailable'); }
        }
        let sent: Response;
        try {
          sent = await requestFetch('https://api.resend.com/emails', { method: 'POST', signal: AbortSignal.timeout(15000),
            headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ from: env.FEEDBACK_FROM || 'SC Mapper Feedback <onboarding@resend.dev>', to: env.FEEDBACK_TO!.split(',').map((v) => v.trim()),
              ...(payload.email ? { reply_to: payload.email } : {}), ...buildEmail(payload), ...(attachment ? { attachments: [attachment] } : {}) }) });
        } catch { throw new FeedbackError(502, 'Could not send feedback. Please retry.'); }
        if (!sent.ok) { console.error('[feedback] Resend delivery failed, HTTP', sent.status); throw new FeedbackError(502, 'Could not send feedback. Please retry.'); }
        let result: { id?: string };
        try { result = await sent.json() as { id?: string }; } catch { throw new FeedbackError(502, 'Delivery was not confirmed. Please retry.'); }
        if (typeof result?.id !== 'string' || !result.id) throw new FeedbackError(502, 'Delivery was not confirmed. Please retry.');
        return json({ ok: true, id: result.id });
      } catch (e) {
        if (e instanceof FeedbackError) return json({ ok: false, error: e.message }, e.status);
        console.error('[feedback] Unexpected request failure');
        return json({ ok: false, error: 'Could not process feedback' }, 500);
      }
    },
  };
}
