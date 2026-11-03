export const MAX_IMAGE = 4 * 1024 * 1024;
export class FeedbackError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export function allowedOrigin(origin: string | null): boolean {
  if (!origin) return false;
  try {
    const u = new URL(origin);
    if (u.origin !== origin || u.username || u.password) return false;
    if ((u.hostname === 'localhost' || u.hostname === '127.0.0.1') && ['http:', 'https:'].includes(u.protocol)) return true;
    return u.protocol === 'https:' && !u.port && (u.hostname === 'sc-mapper.vercel.app' || /^sc-mapper-(?:git-)?[a-z0-9-]+-hamlet2k\.vercel\.app$/.test(u.hostname));
  } catch { return false; }
}
export function imageType(bytes: Uint8Array): 'webp' | 'png' | 'jpg' | null {
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') return 'webp';
  if ([137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b)) return 'png';
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return 'jpg';
  return null;
}
export const validEmail = (value: string) => value.length <= 254 && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value) && !/[\r\n]/.test(value);
export type Payload = { kind: 'bug' | 'enhancement' | 'question'; body: string; email?: string; pins: unknown[]; context: Record<string, unknown>; hp?: string; turnstileToken?: string };
export function validatePayload(input: unknown): Payload {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new FeedbackError(400, 'Invalid payload');
  const p = input as Payload;
  if (!['bug', 'enhancement', 'question'].includes(p.kind)) throw new FeedbackError(400, 'Invalid feedback kind');
  if (typeof p.body !== 'string' || !p.body.trim() || p.body.length > 8000) throw new FeedbackError(400, 'Message must contain 1–8000 characters');
  if (p.email !== undefined && (typeof p.email !== 'string' || !validEmail(p.email))) throw new FeedbackError(400, 'Invalid reply-to email');
  if (!Array.isArray(p.pins) || !p.context || typeof p.context !== 'object' || Array.isArray(p.context)) throw new FeedbackError(400, 'Invalid pins or context');
  for (const value of [p.pins, p.context]) if (new TextEncoder().encode(JSON.stringify(value)).length > 64 * 1024) throw new FeedbackError(413, 'Pins or context exceeds 64KB');
  if (p.turnstileToken !== undefined && (typeof p.turnstileToken !== 'string' || p.turnstileToken.length > 4096)) throw new FeedbackError(400, 'Invalid verification token');
  return p;
}
