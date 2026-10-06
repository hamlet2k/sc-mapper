// Where the user's Star Citizen install lives (Settings → Star Citizen folder): the mappings folder shown next to every
// "Refresh game state" / import entry is derived from it. Stored in this browser only.
import { useSyncExternalStore } from 'react';

export const CHANNELS = ['LIVE', 'PTU', 'EPTU', 'TECH-PREVIEW'] as const;
export type Channel = (typeof CHANNELS)[number];
export const DEFAULT_GAME_ROOT = 'C:\\Program Files\\Roberts Space Industries\\StarCitizen';
export interface GameFolder { root: string; channel: Channel }
export const GAME_FOLDER_KEY = 'sc-mapper:game-folder';

/**
 * Windows path of the game root as typed or pasted: quotes and spaces trimmed, "/" turned into "\", repeated separators
 * collapsed (a leading "\\" UNC prefix kept), no trailing separator. A pasted path that goes into a channel folder
 * (…\StarCitizen\PTU\user\client\0\…) is cut back to the root and its channel returned too.
 */
export function normalizeGameRoot(input: string): { root: string; channel?: Channel } {
  let s = input.trim().replace(/^["']+|["']+$/g, '').trim().replace(/\//g, '\\');
  const unc = s.startsWith('\\\\');
  s = s.replace(/\\{2,}/g, '\\');
  if (unc) s = `\\${s}`;
  s = s.replace(/\\+$/, '');
  if (/^[a-z]:$/i.test(s)) s = s.toUpperCase();
  else s = s.replace(/^([a-z]):/, (_, d: string) => `${d.toUpperCase()}:`);
  const parts = s.split('\\');
  const at = parts.findIndex((p, i) => i > 0 && CHANNELS.includes(p.toUpperCase() as Channel));
  if (at > 0) return { root: parts.slice(0, at).join('\\'), channel: parts[at].toUpperCase() as Channel };
  return { root: s };
}

/** <root>\<channel>\user\client\0\controls\mappings\ */
export function mappingsPath(f: GameFolder): string {
  return `${f.root || DEFAULT_GAME_ROOT}\\${f.channel}\\user\\client\\0\\controls\\mappings\\`;
}

export function loadGameFolder(): GameFolder {
  try {
    const v = JSON.parse(localStorage.getItem(GAME_FOLDER_KEY) ?? 'null') as Partial<GameFolder> | null;
    const channel = CHANNELS.includes(v?.channel as Channel) ? (v!.channel as Channel) : 'LIVE';
    const root = typeof v?.root === 'string' && v.root.trim() ? normalizeGameRoot(v.root).root : DEFAULT_GAME_ROOT;
    return { root, channel };
  } catch { return { root: DEFAULT_GAME_ROOT, channel: 'LIVE' }; }
}

let current: GameFolder | null = null;
const subs = new Set<() => void>();
const snapshot = () => (current ??= loadGameFolder());
export function saveGameFolder(f: GameFolder) {
  current = { root: f.root || DEFAULT_GAME_ROOT, channel: f.channel };
  try { localStorage.setItem(GAME_FOLDER_KEY, JSON.stringify(current)); } catch { /* storage blocked: kept for this session */ }
  subs.forEach((fn) => fn());
}
/** the saved folder, live (every path hint updates when Settings change it) */
export function useGameFolder(): GameFolder {
  return useSyncExternalStore((fn) => { subs.add(fn); return () => subs.delete(fn); }, snapshot, snapshot);
}
