import type { Profile } from './types';

const KEY = 'sc-mapper:v1';
export interface Persisted { profiles: Profile[]; activeId: string | null }

export function load(): Persisted {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (v && Array.isArray(v.profiles)) return v;
  } catch { /* ignore */ }
  return { profiles: [], activeId: null };
}
export function save(p: Persisted) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) { console.warn('localStorage save failed', e); }
}
