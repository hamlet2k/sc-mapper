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

/** every game path the app shows, from the Settings folder + channel (the one place they are built):
 *  channel  <root>\<channel>
 *  mappings <channel>\user\client\0\Controls\Mappings\      (exported layouts: layout_<name>_exported.xml)
 *  actionmaps <channel>\user\client\0\Profiles\default\actionmaps.xml (the live bindings file) */
export interface GamePaths { root: string; channel: Channel; channelDir: string; mappings: string; actionmaps: string; p4k: string }
export function gamePaths(f: GameFolder): GamePaths {
  const root = f.root || DEFAULT_GAME_ROOT, channelDir = `${root}\\${f.channel}`, client = `${channelDir}\\user\\client\\0`;
  return { root, channel: f.channel, channelDir, mappings: `${client}\\Controls\\Mappings\\`, actionmaps: `${client}\\Profiles\\default\\actionmaps.xml`, p4k: `${channelDir}\\Data.p4k` };
}
/** the mappings folder (with a trailing backslash) */
export const mappingsPath = (f: GameFolder): string => gamePaths(f).mappings;
/** a file in the mappings folder (e.g. an exported layout) */
export const layoutPath = (f: GameFolder, file: string): string => gamePaths(f).mappings + file;

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
/** the game paths for the saved folder, live */
export const useGamePaths = (): GamePaths => gamePaths(useGameFolder());
