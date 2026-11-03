let pending: Promise<boolean> | undefined;
const KEY = 'scm.feedback.configured';
export function feedbackConfigured(): Promise<boolean> {
  if (import.meta.env.VITE_FEEDBACK_CAPTURE === '0') return Promise.resolve(false);
  if (pending) return pending;
  try { const cached = sessionStorage.getItem(KEY); if (cached === 'true') return pending = Promise.resolve(true); } catch { /* storage disabled */ }
  pending = (async () => {
    let configured = false;
    try {
      const response = await fetch('/api/feedback', { signal: AbortSignal.timeout(8000) });
      configured = response.ok && (await response.json()).configured === true;
    } catch { /* hide capture if unavailable */ }
    // Only remember a positive answer, so a temporary outage never hides capture for the rest of the session.
    if (configured) { try { sessionStorage.setItem(KEY, 'true'); } catch { /* storage disabled */ } }
    else pending = undefined;
    return configured;
  })();
  return pending;
}
