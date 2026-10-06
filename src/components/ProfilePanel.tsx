import { useState } from 'react';
import { slotDeviceName, slotId, type GameSlot } from '../lib/slots';
import type { Profile } from '../lib/types';
import { DROP_HINT, GamePathHint } from './GameState';
import { Tip } from './Tooltip';
import { Ico, type IconName } from './icons';
import { useEscape } from './useEscape';

/**
 * The profile, in one place: which profile is active, its file actions (import / export / delete, plus new, duplicate,
 * revert, reset) and its game slots with the way into the Controllers modal.
 */
export function ProfilePanel({ profiles, profile, versionLabel, slots, connected, onSelect, onImport, onExport, onDelete, onNew, onDuplicate, onRevert, onResetAll, onOpenSlots, onRefresh }: {
  profiles: Profile[]; profile: Profile | null; versionLabel: string; slots: GameSlot[]; connected: (gs: GameSlot) => boolean;
  onSelect: (id: string | null) => void; onImport: () => void; onExport: () => void; onDelete: () => void;
  onNew: () => void; onDuplicate: () => void; onRevert?: () => void; onResetAll: () => void; onOpenSlots: () => void; onRefresh: () => void;
}) {
  const [menu, setMenu] = useState(false);
  useEscape(() => setMenu(false), menu);
  return (
    <section className="rounded border border-edge/70 bg-black/25 p-3 text-xs text-slate-400" data-testid="profile-panel">
      <div className="flex items-center gap-2">
        <h2 className="font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-mod">Profile</h2>
        {profile && <span className="ml-auto truncate font-mono text-[10px] text-slate-500" title={`${profile.fileName} · ${new Date(profile.importedAt).toLocaleString()}`}>{profile.rebindCount} bindings</span>}
      </div>
      <label className="sr-only" htmlFor="profile">Active profile</label>
      <select id="profile" value={profile?.id ?? ''} onChange={(e) => onSelect(e.target.value || null)} data-testid="profile-select" title="Active profile"
        className="mt-1.5 w-full rounded border border-edge bg-panel2 px-2 py-1.5 text-sm text-slate-200 outline-none focus:border-hud">
        <option value="">Game defaults ({versionLabel})</option>
        {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      {profile && <div className="mt-1 truncate font-mono text-[10px] text-slate-500" title={profile.fileName}>{profile.fileName} · {new Date(profile.importedAt).toLocaleDateString()}</div>}
      <div className="relative mt-2 flex items-center gap-1.5">
        <IconBtn icon="import" label="Import a profile (actionmaps.xml or an exported layout)" onClick={onImport} testid="profile-import" tone="hud" />
        <IconBtn icon="export" label={profile ? 'Export a file Star Citizen can load' : 'Import or edit bindings first'} onClick={onExport} disabled={!profile} testid="profile-export" tone="ok" />
        <IconBtn icon="trash" label={profile ? `Delete “${profile.name}”` : "The game defaults can't be deleted"} onClick={onDelete} disabled={!profile} testid="profile-delete" tone="alert" />
        <IconBtn icon="more" label="More: new, duplicate, revert, reset" onClick={() => setMenu((v) => !v)} testid="profile-more" pressed={menu} />
        {menu && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setMenu(false)} />
            <div className="absolute left-0 top-full z-50 mt-1 w-56 rounded-md border border-edge bg-panel p-1 shadow-xl" role="menu" data-testid="profile-menu">
              <MenuItem icon="filePlus" label="New profile from the game defaults" onClick={() => { setMenu(false); onNew(); }} />
              {profile && <MenuItem icon="duplicate" label="Duplicate this profile" onClick={() => { setMenu(false); onDuplicate(); }} />}
              {profile && <MenuItem icon="refresh" label="Refresh game state (device order)…" hint={DROP_HINT} onClick={() => { setMenu(false); onRefresh(); }} />}
              {profile && onRevert && <MenuItem icon="undo" label="Revert to the imported file" onClick={() => { setMenu(false); onRevert(); }} />}
              {profile && <MenuItem icon="reset" label="Reset every binding to the defaults" danger disabled={!profile.rebindCount} onClick={() => { setMenu(false); onResetAll(); }} />}
            </div>
          </>
        )}
      </div>
      <div className="mt-3 border-t border-edge/60 pt-2.5">
        <div className="flex items-center gap-2">
          <div className="font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-hud/70">Game slots</div>
          {profile && (
            <button type="button" onClick={onRefresh} data-testid="profile-refresh"
              title="Refresh game state: pick a fresh export of your layout (or drop it on the page) to move your mappings to the device numbers the game uses now"
              className="ml-auto flex items-center gap-1 rounded border border-edge px-1.5 py-0.5 text-[10px] text-slate-300 hover:border-hud/60 hover:text-hud2">
              <Ico name="refresh" className="h-3 w-3" /> Refresh
            </button>
          )}
        </div>
        {profile && <GamePathHint className="mt-1" />}
        {profile && <p className="mt-0.5 text-[10px] text-slate-500" data-testid="profile-drop-hint">Refresh picks the file, {DROP_HINT}.</p>}
        {slots.length ? (
          <ul className="mt-1.5 space-y-0.5" data-testid="sidebar-slots">
            {slots.map((gs) => (
              <li key={slotId(gs)} className="flex items-center gap-2 font-mono text-[10px]">
                <span className="w-7 text-hud/80">{slotId(gs).toUpperCase()}</span>
                <span className={`min-w-0 flex-1 truncate ${gs.gameMissing ? 'text-slate-500 line-through decoration-slate-600' : 'text-slate-300'}`}
                  title={gs.gameMissing ? 'Not in the latest game state: its mappings are kept' : undefined}>{slotDeviceName(gs) ?? (gs.slot === 'kb' ? 'Keyboard' : gs.slot === 'mo' ? 'Mouse' : 'no device')}</span>
                {(gs.slot === 'js' || gs.slot === 'gp') && <span className={`h-1.5 w-1.5 rounded-full ${connected(gs) ? 'bg-ok shadow-[0_0_6px_var(--color-ok)]' : 'bg-slate-600'}`} title={connected(gs) ? 'connected' : 'not connected'} />}
              </li>
            ))}
          </ul>
        ) : <p className="mt-1 text-[11px] text-slate-500">{profile ? 'No game slots yet.' : 'Import a profile to fill these in, or add them by hand.'}</p>}
        <button type="button" onClick={onOpenSlots} data-testid="open-slots" title="Which device is kb1, js1, js2, gp1… in the game, the hardware for each and its template"
          className="mt-2.5 flex w-full items-center justify-center gap-2 rounded border border-hud/50 bg-hud/10 px-2.5 py-1.5 font-display text-xs font-semibold uppercase tracking-wider text-hud2 transition hover:bg-hud/20 hover:shadow-[0_0_14px_-6px_var(--color-hud)]">
          <Ico name="slots" /> Game slots &amp; controllers
        </button>
      </div>
    </section>
  );
}

function IconBtn({ icon, label, onClick, disabled, testid, tone, pressed }: { icon: IconName; label: string; onClick: () => void; disabled?: boolean; testid: string; tone?: 'hud' | 'ok' | 'alert'; pressed?: boolean }) {
  const hover = tone === 'ok' ? 'hover:border-ok/70 hover:text-ok' : tone === 'alert' ? 'hover:border-alert/70 hover:text-alert' : 'hover:border-hud/70 hover:text-hud2';
  return (
    <Tip label={label}>
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} data-testid={testid} aria-pressed={pressed}
      className={`flex h-8 flex-1 items-center justify-center rounded border transition disabled:opacity-35 disabled:hover:border-edge disabled:hover:text-slate-400 ${pressed ? 'border-hud/70 bg-hud/15 text-hud2' : `border-edge text-slate-300 ${hover}`}`}>
      <Ico name={icon} className="h-4 w-4" />
    </button>
    </Tip>
  );
}

function MenuItem({ icon, label, hint, onClick, danger, disabled }: { icon: IconName; label: string; hint?: string; onClick: () => void; danger?: boolean; disabled?: boolean }) {
  return (
    <button type="button" role="menuitem" onClick={onClick} disabled={disabled}
      className={`flex w-full items-start gap-2 rounded px-2 py-1.5 text-left text-xs transition disabled:opacity-40 ${danger ? 'text-slate-300 hover:bg-alert/10 hover:text-alert' : 'text-slate-300 hover:bg-hud/10 hover:text-hud2'}`}>
      <Ico name={icon} className="mt-px h-3.5 w-3.5 shrink-0" />
      <span>{label}{hint && <span className="block text-[10px] text-slate-500">{hint}</span>}</span>
    </button>
  );
}

/** confirmation before a profile is deleted: names it and what goes with it */
export function DeleteProfileDialog({ profile, slotCount, onCancel, onConfirm, onExport }: { profile: Profile; slotCount: number; onCancel: () => void; onConfirm: () => void; onExport: () => void }) {
  useEscape(onCancel);
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-void/80 p-4 backdrop-blur-sm" onClick={onCancel}>
      <div className="hud-panel hud-corners w-full max-w-lg rounded-xl border border-alert/50 p-5 text-sm text-slate-300" onClick={(e) => e.stopPropagation()} data-testid="profile-delete-warning" role="alertdialog" aria-labelledby="del-title">
        <h3 id="del-title" className="flex items-center gap-2 font-display text-lg font-bold uppercase tracking-[0.2em] text-alert"><Ico name="alert" className="h-5 w-5" /> Delete profile?</h3>
        <div className="mt-1 text-base text-slate-100">{profile.name}</div>
        <div className="font-mono text-[10px] text-slate-500">{profile.fileName}</div>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-xs">
          <li><b className="text-alert">{profile.rebindCount} binding{profile.rebindCount === 1 ? '' : 's'}</b> of yours{profile.original ? ', including your edits since the import,' : ''} are removed from this app.</li>
          <li>Its game slots{slotCount ? ` (${slotCount})` : ''}, hardware and template picks, axis settings and undo history go too.</li>
          <li>The file on your disk isn&apos;t touched, and the game defaults stay available.</li>
        </ul>
        <p className="mt-2 text-[11px] text-slate-500">This can&apos;t be undone. Export it first if you may want it back.</p>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onExport} className="mr-auto flex items-center gap-1.5 rounded border border-ok/50 px-3 py-1.5 text-xs text-ok hover:bg-ok/10"><Ico name="export" /> Export first</button>
          <button type="button" onClick={onCancel} className="rounded border border-edge px-3 py-1.5 text-xs text-slate-300 hover:border-hud/60">Cancel</button>
          <button type="button" onClick={onConfirm} data-testid="profile-delete-confirm" className="flex items-center gap-1.5 rounded border border-alert/70 bg-alert/15 px-3 py-1.5 text-xs font-semibold text-alert hover:bg-alert/25">
            <Ico name="trash" /> Delete “{profile.name}”
          </button>
        </div>
      </div>
    </div>
  );
}
