# In-app feedback

When email delivery is configured, **Feedback** in the header or **Ctrl/Cmd+Shift+F** captures the visible viewport before opening a full-screen annotation layer. The shortcut also works in inputs. Escape closes the layer. When capture is unavailable, the existing header feedback link opens GitHub issues instead.

Choose Bug, Enhancement or Question, write up to 8000 characters, and optionally add a reply-to email. Pin points of interest, draw, or cover private details with black Redact boxes. Drag pins and boxes to move them; focus one and press Delete to remove it. Pins also move with arrow keys. Undo (or Ctrl/Cmd+Z) restores the last annotation change, up to 100 steps. Annotations use viewport CSS coordinates; the captured image keeps its original viewport dimensions if the browser is resized.

**Include screenshot** defaults on and is remembered in `localStorage` as `scm.feedback.includeScreenshot`. Turning it off sends text and browser context without pins or an image. Capture failures still allow text-only reports. Redactions destroy pixels in a local copy before upload; the original screenshot is never uploaded. WebP encoding starts at quality 0.85, with PNG fallback, and reduces quality/resolution to stay below 3.5MB. Redaction only covers image pixels: review the message and pin descriptions too, since they are sent separately.

Voice dictation uses the browser's Web Speech API (`en-US`). Tap to toggle or hold for at least 350ms and release to stop. Final text is inserted at the textarea cursor; interim speech appears below it. Unsupported browsers explain that typing is available. The app does not store or upload audio; the browser's speech service may process audio remotely.

Submission uses multipart `POST /api/feedback` with a JSON `payload` and optional flattened `image`. Reports are emailed through Resend and include the message, pins and element descriptions, sanitized URL/route, viewport, user agent/platform/touch, build commit/version, timezone, capture timestamp, current view/template when available, and the last 20 clicks/navigation events. The trail starts at app boot, stays in tab memory and excludes feedback UI and form values. Query parameters whose names contain token, code, secret, key or password are removed, including queries in hash routes. Imported binding files are not attached.

## Environment and deployment

Deploy the Vite site and `api/feedback.ts` together on Vercel. The API uses Node Web-standard Request/Response handlers and no extra server packages. No SPA rewrite is required; `/api` must keep routing to functions. `vite`/`vite preview` serve the frontend only: use Vercel's local runtime for real API delivery, or intercept the endpoint in tests.

| Variable | Purpose |
| --- | --- |
| `RESEND_API_KEY` | Server-only Resend key; required for delivery. |
| `FEEDBACK_TO` | Server-only destination email; required. Comma-separated addresses are accepted. |
| `FEEDBACK_FROM` | Optional sender; defaults to `SC Mapper Feedback <onboarding@resend.dev>`. |
| `TURNSTILE_SECRET_KEY` | Optional server secret; when set, every POST requires successful Turnstile verification. |
| `VITE_TURNSTILE_SITE_KEY` | Optional public widget key; set alongside the server secret to enable the widget. Script loads only when feedback opens. |
| `VITE_FEEDBACK_CAPTURE` | Set to `0` at build time to hide capture UI, disable its shortcut and stop the trail. |
| `VERCEL_GIT_COMMIT_SHA` | Existing build mechanism: commit metadata uses this value, falling back to `git rev-parse HEAD`. |

The Resend test sender (`onboarding@resend.dev`) only delivers to the account owner's email. **Until a sending domain is verified, `FEEDBACK_TO` must be that owner's address.** Use a verified sender/domain in `FEEDBACK_FROM` for other recipients.

The client requests `GET /api/feedback` once per browser tab session, cached in the module and `sessionStorage`. Only `{configured:boolean}` is returned; keys and addresses are never exposed. Capture stays hidden on failure or when either delivery variable is missing. Start a new tab session or clear `scm.feedback.configured` from session storage after changing server configuration.

POST allows the production origin, localhost/127.0.0.1 over HTTP(S), and `sc-mapper-*-hamlet2k.vercel.app` / `sc-mapper-git-*-hamlet2k.vercel.app` HTTPS previews. A missing Origin is rejected. Validation limits pins/context to 64KB each and images to 4MB, checks image magic bytes, validates email, escapes HTML and silently accepts filled honeypots without sending. Rate limits are **best-effort per function instance**: 5 requests per IP in 10 minutes and 20 per day. They reset on cold starts and are not shared between instances.

## Checks

`npm run test:unit` includes pure annotation, gesture, insertion, context, server and mocked-delivery checks. `node --import tsx scripts/feedback-harness.ts` exercises the actual GET/POST exports using a fake Request and mocked fetch (no network). The browser suite intercepts GET with `{configured:true}` and POST with mocked responses; it saves pin/stroke/redaction images under `/workspace/sc-feedback-shots/`. No client override enables real delivery without server configuration.
