// "Refresh game state": read the game's current device order from a fresh export and move the mappings to it.
import { useState } from 'react';
import { rematchParts, type Rematch } from '../lib/rematch';
import { Ico } from './icons';
import { useEscape } from './useEscape';

/** where Star Citizen writes exported layouts (Options → Keybindings → Control Profiles → Save) */
export const GAME_MAPPINGS_PATH = 'StarCitizen\\LIVE\\user\\client\\0\\controls\\mappings\\';

/** the usual folder, with a copy button (browsers can't open a folder by path) */
export function GamePathHint({ className = '' }: { className?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(GAME_MAPPINGS_PATH); } catch { /* clipboard blocked: the path is still selectable */ }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };
  return (
    <span className={`inline-flex min-w-0 items-center gap-1 ${className}`} data-testid="game-path">
      <code className="min-w-0 select-all break-words font-mono text-[10px] text-slate-400" title="Usual folder of the game's exported layouts (paste it into the file picker's address bar)">
        {GAME_MAPPINGS_PATH.split('\\').filter(Boolean).map((part, i) => <span key={i}>{part}\<wbr /></span>)}
      </code>
      <button type="button" onClick={() => void copy()} data-testid="game-path-copy" aria-label="Copy the folder path" title="Copy the folder path"
        className="shrink-0 rounded border border-edge p-0.5 text-slate-400 hover:border-hud/60 hover:text-hud2">
        <Ico name={copied ? 'check' : 'copy'} className={`h-3 w-3 ${copied ? 'text-ok' : ''}`} />
      </button>
    </span>
  );
}

/** "Refresh game state" button (opens the file picker) */
export function RefreshGameButton({ onClick, disabled, compact, testid = 'refresh-game-state' }: { onClick: () => void; disabled?: boolean; compact?: boolean; testid?: string }) {
  const title = disabled
    ? 'Import a profile first: refreshing maps its mappings to the game\'s current device order'
    : 'Refresh game state: pick a fresh export of your layout (or drop it anywhere on the page). Only its device list is read, to move your mappings to the numbers the game uses now.';
  return (
    <button type="button" onClick={onClick} disabled={disabled} data-testid={testid} title={title}
      className={`flex items-center gap-1.5 rounded border border-hud/50 px-2 py-1 text-[11px] text-hud2 hover:bg-hud/10 disabled:cursor-not-allowed disabled:border-edge disabled:text-slate-500 ${compact ? '' : 'font-display font-semibold uppercase tracking-wider'}`}>
      <Ico name="refresh" className="h-3.5 w-3.5" /> Refresh game state
    </button>
  );
}

/** the detected moves after a refresh, with Apply (one undo step) and Dismiss */
export function RematchBanner({ r, file, onApply, onDismiss }: { r: Rematch; file: string; onApply: () => void; onDismiss: () => void }) {
  const parts = rematchParts(r);
  return (
    <div className="rounded-lg border border-mod/60 bg-mod/[0.08] px-3 py-2 text-xs text-slate-200 shadow-[0_0_18px_-8px_var(--color-mod)]" data-testid="rematch-banner" role="status">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Ico name="devices" className="h-4 w-4 text-mod" />
        <b className="font-display text-[11px] uppercase tracking-wider text-mod">{r.moves.length ? 'The game renumbered your devices' : 'Game devices changed'}</b>
        <span className="min-w-0 flex-1" data-testid="rematch-summary">
          {parts.map((p, i) => (
            <span key={i} data-testid="rematch-move">{i ? <span className="mx-1.5 text-slate-500">·</span> : null}<span className="font-mono text-[11px]">{p}</span></span>
          ))}
        </span>
        <span className="ml-auto flex shrink-0 gap-1.5">
          <button type="button" onClick={onApply} data-testid="rematch-apply" title="Move your mappings (bindings, hardware, template, axis settings) to these numbers and take the game's device list. One undo step."
            className="rounded border border-mod/70 bg-mod/20 px-2.5 py-1 font-semibold text-mod hover:bg-mod/30">Apply</button>
          <button type="button" onClick={onDismiss} data-testid="rematch-dismiss" className="rounded border border-edge px-2.5 py-1 text-slate-300 hover:border-hud/60">Dismiss</button>
        </span>
      </div>
      <div className="mt-1 text-[10px] text-slate-400">
        From <span className="font-mono">{file}</span>: only its device list was read. Apply moves your mappings to the game&apos;s numbers; the game&apos;s order itself can&apos;t be changed here.
        {r.ambiguous.map((a) => (
          <span key={`${a.slot}${a.name}`} className="ml-1 text-mod" data-testid="rematch-ambiguous">
            <Ico name="alert" className="h-3 w-3" /> {a.from.length} × {a.name} ({a.from.map((n) => `${a.slot}${n}`).join(', ')} → {a.to.map((n) => `${a.slot}${n}`).join(', ')}): identical devices can&apos;t be told apart, their order is assumed (?). If it is wrong, swap them with the arrows in Game slots &amp; controllers.
          </span>
        ))}
      </div>
    </div>
  );
}

/** importing a file whose device order differs from the current game state: offer to shift it */
export function ImportShiftDialog({ file, r, onShift, onAsIs, onCancel }: { file: string; r: Rematch; onShift: () => void; onAsIs: () => void; onCancel: () => void }) {
  useEscape(onCancel);
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-void/80 p-4 backdrop-blur-sm" onClick={onCancel}>
      <div className="hud-panel hud-corners w-full max-w-xl rounded-xl p-5 text-sm text-slate-300" onClick={(e) => e.stopPropagation()} data-testid="import-shift" role="dialog" aria-label="Device order differs">
        <h3 className="font-display text-lg font-bold uppercase tracking-[0.2em] text-hud2">Device order differs</h3>
        <p className="mt-2 text-xs"><span className="font-mono">{file}</span> was made when the game numbered your devices differently than it does now (your current profile&apos;s game state):</p>
        <ul className="mt-2 space-y-0.5 font-mono text-[11px] text-slate-200" data-testid="import-shift-moves">
          {rematchParts(r).map((p, i) => <li key={i}>{p}</li>)}
        </ul>
        {r.ambiguous.length > 0 && <p className="mt-2 text-[11px] text-mod">Identical devices ({r.ambiguous.map((a) => a.name).join(', ')}) can&apos;t be told apart: their order is assumed.</p>}
        <p className="mt-2 text-[11px] text-slate-500">Shifting moves that file&apos;s bindings and axis settings to the current numbers, so they land on the right devices.</p>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded border border-edge px-3 py-1.5 text-xs text-slate-300 hover:border-hud/60">Cancel</button>
          <button type="button" onClick={onAsIs} data-testid="import-as-is" className="rounded border border-edge px-3 py-1.5 text-xs text-slate-300 hover:border-hud/60">Import as is</button>
          <button type="button" onClick={onShift} data-testid="import-shift-apply" className="rounded border border-hud/60 bg-hud/15 px-3 py-1.5 text-xs font-semibold text-hud2 hover:bg-hud/25">Shift to the current game order</button>
        </div>
      </div>
    </div>
  );
}

export type DropZone = 'refresh' | 'import';
/** full-page drop overlay: with a profile active, "Refresh game state" (default, large) vs "Import as profile" */
export function DropOverlay({ withRefresh, zone }: { withRefresh: boolean; zone: DropZone }) {
  const box = (on: boolean) => `hud-corners flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-8 py-10 text-center transition ${on ? 'border-hud bg-hud/10 ring-2 ring-hud/40 shadow-[0_0_40px_-10px_var(--color-hud)]' : 'border-edge bg-panel/80 opacity-60'}`;
  if (!withRefresh) return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-void/80 backdrop-blur-sm" data-testid="drop-overlay">
      <div className={box(true)} data-drop-zone="import">
        <div className="glow-text font-display text-3xl font-bold uppercase tracking-[0.3em] text-hud2">Drop to import</div>
        <div className="mt-2 font-mono text-xs text-slate-400">actionmaps.xml · layout_*_exported.xml</div>
      </div>
    </div>
  );
  return (
    <div className="fixed inset-0 z-50 grid grid-cols-[2fr_1fr] gap-6 bg-void/85 p-10 backdrop-blur-sm" data-testid="drop-overlay">
      <div className={box(zone === 'refresh')} data-drop-zone="refresh" data-testid="drop-refresh">
        <Ico name="refresh" className="h-10 w-10 text-hud" />
        <div className="glow-text mt-3 font-display text-3xl font-bold uppercase tracking-[0.25em] text-hud2">Refresh game state</div>
        <p className="mt-3 max-w-md text-sm text-slate-300">Reads only the device list of a fresh export and moves your mappings to the numbers the game uses now. Your bindings stay yours; the file&apos;s bindings are ignored.</p>
        <p className="mt-2 font-mono text-[11px] text-slate-500">{GAME_MAPPINGS_PATH}layout_*_exported.xml</p>
      </div>
      <div className={box(zone === 'import')} data-drop-zone="import" data-testid="drop-import">
        <Ico name="import" className="h-8 w-8 text-slate-300" />
        <div className="mt-3 font-display text-xl font-bold uppercase tracking-[0.2em] text-slate-200">Import as profile</div>
        <p className="mt-2 text-xs text-slate-400">Adds the file&apos;s bindings as a new profile.</p>
      </div>
    </div>
  );
}
