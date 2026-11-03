let pending: Promise<boolean> | undefined;
const KEY = 'scm.feedback.configured';
export function feedbackConfigured(): Promise<boolean> {
  if (import.meta.env.VITE_FEEDBACK_CAPTURE === '0') return Promise.resolve(false);
  if (pending) return pending;
  try { const cached = sessionStorage.getItem(KEY); if (cached !== null) return pending = Promise.resolve(cached === 'true'); } catch { /* storage disabled */ }
  pending = (async () => {
    let configured = false;
    try {
      const response = await fetch('/api/feedback', { signal: AbortSignal.timeout(8000) });
      configured = response.ok && (await response.json()).configured === true;
    } catch { /* hide capture if unavailable */ }
    try { sessionStorage.setItem(KEY, String(configured)); } catch { /* storage disabled */ }
    return configured;
  })();
  return pending;
}
