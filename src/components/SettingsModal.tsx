import { useState } from 'react';
import { CHANNELS, DEFAULT_GAME_ROOT, normalizeGameRoot, saveGameFolder, useGameFolder, useGamePaths, type Channel } from '../lib/gameFolder';
import { CopyText } from './CopyButton';
import type { DefaultsMeta } from '../lib/types';
import { GamePathHint } from './GameState';
import { Ico } from './icons';
import { useEscape } from './useEscape';

export interface AppSettings {
  /** pressing an input (while not searching / editing) briefly highlights its bindings: List, Keyboard, Conflicts and Devices */
  highlight: boolean;
  /** …and scrolls the first match into view */
  scroll: boolean;
  /** show the game's hidden / internal actions */
  internal: boolean;
}
export const SETTINGS_KEYS = { highlight: 'sc-mapper:highlight', scroll: 'sc-mapper:highlight-scroll', internal: 'sc-mapper:show-internal' } as const;
export function loadAppSettings(): AppSettings {
  const get = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
  return { highlight: get(SETTINGS_KEYS.highlight) !== '0', scroll: get(SETTINGS_KEYS.scroll) !== '0', internal: get(SETTINGS_KEYS.internal) === '1' };
}
export function saveAppSettings(s: AppSettings) {
  try {
    localStorage.setItem(SETTINGS_KEYS.highlight, s.highlight ? '1' : '0');
    localStorage.setItem(SETTINGS_KEYS.scroll, s.scroll ? '1' : '0');
    localStorage.setItem(SETTINGS_KEYS.internal, s.internal ? '1' : '0');
  } catch { /* ignore */ }
}

/** Settings: behaviour preferences that aren't filters (remembered in this browser) */
export function SettingsModal({ settings, onChange, onClose, meta, versionLabel }: {
  settings: AppSettings; onChange: (s: AppSettings) => void; onClose: () => void; meta: DefaultsMeta; versionLabel: string;
}) {
  const set = (patch: Partial<AppSettings>) => onChange({ ...settings, ...patch });
  useEscape(onClose);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-void/85 p-4 backdrop-blur-sm" onClick={onClose} data-testid="settings-modal">
      <div className="hud-panel hud-corners my-10 w-full max-w-xl rounded-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-edge px-5 py-3">
          <h2 className="font-display text-xl font-bold uppercase tracking-[0.2em] text-hud2 flex items-center gap-2"><Ico name="settings" className="h-5 w-5" /> Settings</h2>
          <button type="button" onClick={onClose} className="ml-auto rounded border border-edge px-2 py-1 text-xs text-slate-400 hover:text-hud2" aria-label="Close"><Ico name="close" /></button>
        </div>
        <div className="space-y-5 p-5 text-sm">
          <section>
            <h3 className="font-display text-xs font-bold uppercase tracking-[0.2em] text-mod">When you press an input</h3>
            <p className="mt-0.5 text-[11px] text-slate-500">Applies to the List, Keyboard, Conflicts and Devices views. List, Keyboard and Conflicts pause it while you search, find by pressing or edit.</p>
            <div className="mt-2 space-y-2">
              <Switch on={settings.highlight} set={(v) => set({ highlight: v })} testid="setting-highlight" label="Highlight on press"
                hint="Briefly lights up the bindings, keys, conflict groups or device callouts of the input you press. Grip photos on the Devices view switch either way." />
              <Switch on={settings.highlight && settings.scroll} set={(v) => set({ scroll: v })} disabled={!settings.highlight} testid="setting-scroll" label="Scroll to it"
                hint="Also brings the first highlighted row, conflict group or device photo into view. Off: it lights up and the page stays put." />
            </div>
          </section>
          <GameFolderSettings />
          <section>
            <h3 className="font-display text-xs font-bold uppercase tracking-[0.2em] text-mod">Advanced</h3>
            <div className="mt-2">
              <Switch on={settings.internal} set={(v) => set({ internal: v })} testid="setting-internal" label="Show internal actions"
                hint="The game's hidden / debug actions that never appear in its own keybinding menu. Off by default." />
            </div>
          </section>
          <section className="border-t border-edge/60 pt-4 text-[11px] text-slate-500">
            <a href={meta.sourceUrl} target="_blank" rel="noreferrer" className="rounded border border-hud/30 bg-hud/5 px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-hud/80 hover:border-hud/60">
              Defaults · {versionLabel} · {meta.version}
            </a>
            <p className="mt-2">Default bindings from {meta.source}, build {meta.version} ({meta.buildDate}), files inside the game archive <DefaultsArchive />. Settings are stored in this browser only.</p>
          </section>
        </div>
      </div>
    </div>
  );
}

function Switch({ on, set, label, hint, disabled, testid }: { on: boolean; set: (v: boolean) => void; label: string; hint: string; disabled?: boolean; testid: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} disabled={disabled} onClick={() => set(!on)} data-testid={testid}
      className="flex w-full items-start gap-3 rounded border border-edge/70 bg-black/20 px-3 py-2 text-left transition hover:border-hud/50 disabled:opacity-40">
      <span className={`mt-0.5 flex h-4 w-7 shrink-0 items-center rounded-full border transition ${on ? 'justify-end border-mod bg-mod/30' : 'justify-start border-slate-600 bg-black/40'}`}>
        <span className={`mx-0.5 h-2.5 w-2.5 rounded-full ${on ? 'bg-mod' : 'bg-slate-500'}`} />
      </span>
      <span>
        <span className="block text-slate-100">{label}</span>
        <span className="block text-[11px] text-slate-500">{hint}</span>
      </span>
    </button>
  );
}

/** Star Citizen folder + channel: the mappings folder shown next to "Refresh game state" and the import entries */
function GameFolderSettings() {
  const folder = useGameFolder();
  const [draft, setDraft] = useState(folder.root);
  const commit = () => {
    const n = normalizeGameRoot(draft);
    const root = n.root || DEFAULT_GAME_ROOT;
    setDraft(root);
    if (root !== folder.root || (n.channel && n.channel !== folder.channel)) saveGameFolder({ root, channel: n.channel ?? folder.channel });
  };
  return (
    <section data-testid="settings-game-folder">
      <h3 className="font-display text-xs font-bold uppercase tracking-[0.2em] text-mod">Star Citizen folder</h3>
      <p className="mt-0.5 text-[11px] text-slate-500">Where the game is installed on your PC. The browser can&apos;t open it by itself: the paths below are shown with a copy button next to “Refresh game state”, import and Export, to paste into the file picker or Explorer.</p>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-[11px] text-slate-400">
          Game folder (Windows path)
          <input value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } }}
            spellCheck={false} placeholder={DEFAULT_GAME_ROOT} data-testid="setting-game-root"
            className="w-full rounded border border-edge bg-panel2 px-2 py-1.5 font-mono text-xs text-slate-200 outline-none focus:border-hud" />
        </label>
        <label className="flex flex-col gap-1 text-[11px] text-slate-400">
          Channel
          <select value={folder.channel} onChange={(e) => saveGameFolder({ root: folder.root, channel: e.target.value as Channel })} data-testid="setting-game-channel"
            className="rounded border border-edge bg-panel2 px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-hud">
            {CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        {folder.root !== DEFAULT_GAME_ROOT && (
          <button type="button" onClick={() => { setDraft(DEFAULT_GAME_ROOT); saveGameFolder({ root: DEFAULT_GAME_ROOT, channel: folder.channel }); }}
            className="rounded border border-edge px-2 py-1.5 text-[11px] text-slate-400 hover:border-hud/60 hover:text-hud2">Default</button>
        )}
      </div>
      <div className="mt-2 space-y-1.5 rounded border border-edge/70 bg-black/20 px-2.5 py-1.5 text-[11px] text-slate-400" data-testid="settings-game-paths">
        <div>
          <div className="mb-0.5 text-[10px] uppercase tracking-widest text-slate-500">Exported layouts (mappings folder)</div>
          <GamePathHint />
        </div>
        <div>
          <div className="mb-0.5 text-[10px] uppercase tracking-widest text-slate-500">Live bindings file</div>
          <GamePathHint file="actionmaps" />
        </div>
        <p className="text-[10px] text-slate-500">Every path in the app (Export, Help, Refresh game state, the profile card) is built from this folder and channel.</p>
      </div>
    </section>
  );
}

/** the game archive the defaults come from (Data.p4k in the Settings folder + channel), with copy */
function DefaultsArchive() {
  return <CopyText text={useGamePaths().p4k} kind="path" testid="settings-path-p4k" className="text-slate-400" />;
}
