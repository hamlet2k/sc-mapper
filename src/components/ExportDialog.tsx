import { useMemo, useState } from 'react';
import { buildExport, exportFileName, safeName, usedInstances, type ExportDevice, type ExportFormat } from '../lib/exporter';
import type { DefaultsData, Profile } from '../lib/types';
import { useGamePaths } from '../lib/gameFolder';
import { CopyText } from './CopyButton';
import { Ico } from './icons';
import { useEscape } from './useEscape';

/** a game slot as listed in the export (slots.ts): "js2", device name */
export interface ExportSlot { id: string; name?: string }
interface Props {
  defaults: DefaultsData; profile: Profile;
  /** the profile's game slots to declare in <options> (with their product names) */
  devices: ExportDevice[];
  slots: ExportSlot[];
  onClose: () => void;
}

export function ExportDialog({ defaults, profile, devices, slots, onClose }: Props) {
  const [format, setFormat] = useState<ExportFormat>('layout');
  const [name, setName] = useState(() => safeName(profile.name.replace(/\(actionmaps\.xml\)/i, '').replace(/^layout_|_exported$/g, '')));
  const [copied, setCopied] = useState(false);
  const paths = useGamePaths();
  useEscape(onClose);
  const used = useMemo(() => usedInstances(profile), [profile]);
  const opts = { format, name, devices };
  const xml = useMemo(() => buildExport(defaults, profile, opts), [defaults, profile, format, name, devices]); // eslint-disable-line react-hooks/exhaustive-deps
  const file = exportFileName(opts);
  const actions = Object.values(profile.rebinds).reduce((n, a) => n + Object.keys(a).length, 0);
  const lines = xml.split('\n');

  const download = () => {
    const url = URL.createObjectURL(new Blob([xml], { type: 'application/xml' }));
    const a = document.createElement('a');
    a.href = url; a.download = file;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };
  const copy = async () => { try { await navigator.clipboard.writeText(xml); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ } };
  const unmapped = used.js.filter((i) => !slots.some((s) => s.id === `js${i}`));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-void/85 p-4 backdrop-blur-sm" onClick={onClose} data-testid="export-dialog">
      <div className="hud-panel hud-corners flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3 border-b border-edge px-5 py-3">
          <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="font-display text-xl font-bold uppercase tracking-[0.2em] text-hud2">Export for Star Citizen</h2>
            <span className="min-w-0 font-mono text-[11px] text-slate-500 [overflow-wrap:anywhere]">{profile.name} · {actions} actions changed · {profile.rebindCount} rebinds</span>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" title="Close (Esc)" className="shrink-0 rounded border border-edge px-2 py-1 text-xs text-slate-400 hover:text-hud2"><Ico name="close" /></button>
        </div>
        <div className="grid min-h-0 flex-1 gap-0 overflow-y-auto scrollbar-thin md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] md:overflow-hidden">
          <div className="min-w-0 space-y-4 border-edge p-5 scrollbar-thin md:min-h-0 md:overflow-y-auto md:border-r">
            <div className="grid gap-2">
              <FormatOption on={format === 'layout'} onClick={() => setFormat('layout')} title="Control profile (recommended)"
                file="layout_<name>_exported.xml" text="Load it in game without touching your current settings file. Same format the game writes from Control Profiles → Save Control Settings." />
              <FormatOption on={format === 'actionmaps'} onClick={() => setFormat('actionmaps')} title="Replace actionmaps.xml"
                file="actionmaps.xml" text="The live bindings file the game reads at start-up. Only use this with the game closed, and back up the original first." />
            </div>
            {format === 'layout' && (
              <label className="flex flex-col gap-1 text-[10px] uppercase tracking-widest text-slate-500">
                Profile name
                <input value={name} onChange={(e) => setName(e.target.value)} data-testid="export-name"
                  className="rounded border border-edge bg-black/40 px-2 py-1.5 font-mono text-sm normal-case tracking-normal text-slate-100 outline-none focus:border-hud" />
                <span className="font-mono normal-case tracking-normal text-slate-400 [overflow-wrap:anywhere]" data-testid="export-file">→ {file}</span>
              </label>
            )}
            <div className="rounded border border-edge/70 bg-black/20 p-3 text-xs text-slate-400">
              <div className="font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-hud/70">Devices in this file</div>
              <ul className="mt-1 space-y-0.5 font-mono text-[11px]" data-testid="export-slots">
                {!slots.some((s) => s.id === 'kb1') && <li>kb1 / mo1 · keyboard &amp; mouse</li>}
                {slots.map((s) => <li key={s.id} className={s.name || /^(kb|mo)/.test(s.id) ? '' : 'text-mod'}>{s.id} · {s.name ?? (/^kb/.test(s.id) ? 'keyboard' : /^mo/.test(s.id) ? 'mouse' : 'no device name known (fine; the game maps by instance number)')}</li>)}
                {unmapped.map((i) => <li key={i} className="text-mod">js{i} · used by bindings, not mapped to a slot</li>)}
              </ul>
              <p className="mt-2 text-[10px] text-slate-500">Only bindings that differ from the {defaults.meta.branch} defaults are written. Cleared defaults are written as an empty input (e.g. <code>kb1_ </code>), as the game does.</p>
            </div>
            <div className="rounded border border-hud/30 bg-hud/5 p-3 text-xs leading-relaxed text-slate-300" data-testid="export-guide">
              <div className="font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-hud">How to load it</div>
              {format === 'layout' ? (
                <ol className="mt-1 list-decimal space-y-1.5 pl-4">
                  <li>Save <code className="text-hud2 [overflow-wrap:anywhere]">{file}</code> into
                    <CopyText text={paths.mappings} kind="folder" testid="export-path-mappings" block className="mt-0.5 rounded bg-black/40 px-1.5 py-1 text-[11px] text-hud2" />
                    <span className="text-slate-500">Your folder and channel ({paths.channel}) from Settings → Star Citizen folder. RSI Launcher → gear icon → Show in Explorer opens the install folder.</span></li>
                  <li>In game: <b>Options → Keybindings → Control Profiles</b>, then pick <b>{safeName(name)}</b>.</li>
                  <li>Or open the console (<kbd className="keycap">~</kbd>) and run
                    <CopyText text={`pp_RebindKeys ${file}`} kind="command" testid="export-cmd-rebind" block className="mt-0.5 rounded bg-black/40 px-1.5 py-1 text-[11px] text-hud2" />
                    If it isn&apos;t found, try the bare name
                    <CopyText text={`pp_RebindKeys ${safeName(name)}`} kind="command" testid="export-cmd-rebind-bare" block className="mt-0.5 rounded bg-black/40 px-1.5 py-1 text-[11px] text-hud2" /></li>
                  <li>If your sticks come up swapped, run
                    <CopyText text="pp_resortdevices joystick 1 2" kind="command" testid="export-cmd-resort" block className="mt-0.5 rounded bg-black/40 px-1.5 py-1 text-[11px] text-hud2" /></li>
                </ol>
              ) : (
                <ol className="mt-1 list-decimal space-y-1.5 pl-4">
                  <li>Close Star Citizen completely.</li>
                  <li>Back up
                    <CopyText text={paths.actionmaps} kind="path" testid="export-path-actionmaps" block className="mt-0.5 rounded bg-black/40 px-1.5 py-1 text-[11px] text-hud2" />
                    <span className="text-slate-500">({paths.channel}, from Settings → Star Citizen folder)</span></li>
                  <li>Replace it with the downloaded <code className="text-hud2">actionmaps.xml</code> and start the game.</li>
                </ol>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={download} data-testid="export-download" className="rounded border border-hud/60 bg-hud/15 px-4 py-2 font-display text-sm font-semibold uppercase tracking-wider text-hud2 shadow-[0_0_18px_-6px_var(--color-hud)] hover:bg-hud/25"><Ico name="export" /> Download {file}</button>
              <button type="button" onClick={copy} className="rounded border border-edge px-3 py-2 font-display text-sm font-semibold uppercase tracking-wider text-slate-300 hover:border-hud/60">{copied ? <><Ico name="check" /> Copied</> : <><Ico name="copy" /> Copy XML</>}</button>
            </div>
          </div>
          <div className="flex h-72 min-h-0 min-w-0 flex-col bg-black/40 md:h-auto">
            <div className="flex items-center gap-2 border-b border-edge/60 px-4 py-2 font-mono text-[10px] uppercase tracking-widest text-slate-500">Preview <span className="ml-auto">{lines.length - 1} lines · {(xml.length / 1024).toFixed(1)} KB</span></div>
            <pre className="min-h-0 flex-1 overflow-auto p-4 font-mono text-[11px] leading-relaxed text-slate-300 scrollbar-thin" data-testid="export-preview">{lines.slice(0, 400).join('\n')}{lines.length > 400 ? `\n… ${lines.length - 400} more lines` : ''}</pre>
          </div>
        </div>
      </div>
    </div>
  );
}

function FormatOption({ on, onClick, title, file, text }: { on: boolean; onClick: () => void; title: string; file: string; text: string }) {
  return (
    <button type="button" onClick={onClick} className={`rounded-lg border p-3 text-left transition ${on ? 'border-hud bg-hud/10' : 'border-edge hover:border-hud/50'}`}>
      <div className="flex min-w-0 items-center gap-2">
        <span className={`h-3 w-3 shrink-0 rounded-full border ${on ? 'border-hud bg-hud' : 'border-slate-500'}`} />
        <span className="font-display text-sm font-bold uppercase tracking-wider text-slate-100">{title}</span>
        <code className="ml-auto min-w-0 text-right font-mono text-[10px] text-hud/80 [overflow-wrap:anywhere]">{file}</code>
      </div>
      <p className="mt-1 pl-5 text-xs text-slate-400">{text}</p>
    </button>
  );
}
