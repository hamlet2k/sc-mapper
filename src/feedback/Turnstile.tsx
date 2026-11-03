import { useEffect, useRef, useState } from 'react';
type TurnstileApi = { render(el: HTMLElement, opts: Record<string, unknown>): string; remove(id: string): void };
const api = () => (window as typeof window & { turnstile?: TurnstileApi }).turnstile;
let loading: Promise<void> | undefined;
function load() {
  if (api()) return Promise.resolve();
  return loading ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script'); script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'; script.async = true;
    script.onload = () => resolve(); script.onerror = () => { loading = undefined; script.remove(); reject(new Error('Verification could not load. Check your connection and reopen feedback.')); };
    document.head.append(script);
  });
}
export function Turnstile({ onToken }: { onToken: (token: string) => void }) {
  const el = useRef<HTMLDivElement>(null), [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false, id: string | undefined;
    void load().then(() => {
      if (cancelled || !el.current) return;
      id = api()!.render(el.current, { sitekey: import.meta.env.VITE_TURNSTILE_SITE_KEY, theme: 'dark', callback: onToken,
        'expired-callback': () => onToken(''), 'error-callback': () => { onToken(''); setError('Verification failed. Please reopen feedback to retry.'); } });
    }).catch((e: Error) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; if (id) api()?.remove(id); };
  }, [onToken]);
  return <><div ref={el} />{error && <p role="alert" className="text-alert">{error}</p>}</>;
}
