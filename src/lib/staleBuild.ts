import { useSyncExternalStore } from 'react';

let stale = false, listening = false;
const listeners = new Set<() => void>();
export const getStaleBuild = () => stale;
export const subscribeStaleBuild = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export function flagStaleBuild() {
  if (stale) return;
  stale = true;
  listeners.forEach((listener) => listener());
}
export const useStaleBuild = () => useSyncExternalStore(subscribeStaleBuild, getStaleBuild, () => false);

export function listenForStaleBuild() {
  if (listening) return;
  listening = true;
  window.addEventListener('vite:preloadError', (event) => { event.preventDefault(); flagStaleBuild(); });
}
