import { effectiveGroup } from '../lib/edit';
import { bindKey, comboLabel, formatInput, GROUP_LABEL, keyLabel, normalizeCombo, prettyMode, tokens } from '../lib/inputs';
import type { DefaultAction, Group, Rebind, Row } from '../lib/types';
import { ACTIVATION_MODES } from './CaptureDialog';
import { Ico, type IconName } from './icons';
import { useEscape } from './useEscape';

interface Props {
  row: Row;
  action?: DefaultAction;
  rebinds?: Rebind[];
  canUndo: boolean;
  onSetGroup: (g: Group, list: Rebind[]) => void;
  onCapture: (g: Group, replace?: Rebind) => void;
  onUndo: () => void;
  onReset: () => void;
  onClose: () => void;
}

const GROUPS: { g: Group; icon: IconName }[] = [{ g: 'km', icon: 'keyboard' }, { g: 'js', icon: 'joystick' }, { g: 'gp', icon: 'gamepad' }];

export function ActionEditor({ row, action, rebinds, canUndo, onSetGroup, onCapture, onUndo, onReset, onClose }: Props) {
  const customized = !!rebinds?.length;
  useEscape(onClose);
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-void/60 backdrop-blur-[2px]" onClick={onClose} data-testid="action-editor">
      <aside className="hud-panel flex h-full w-full max-w-xl flex-col border-l-2 border-l-hud/60" onClick={(e) => e.stopPropagation()}>
        <div className="border-b border-edge px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="font-display text-[11px] font-semibold uppercase tracking-[0.25em] text-hud/70">Edit action</div>
              <h2 className="mt-1 font-display text-2xl font-bold uppercase leading-tight tracking-wider text-hud2">{row.label}</h2>
              <div className="mt-1 font-mono text-[10px] text-slate-500">{row.mapLabel} · {row.map}/{row.action}{row.mode ? ` · ${prettyMode(row.mode)}` : ''}</div>
              {row.desc && <p className="mt-2 text-xs text-slate-400">{row.desc}</p>}
            </div>
            <button type="button" onClick={onClose} aria-label="Close" title="Close (Esc)" className="rounded border border-edge px-2 py-1 text-xs text-slate-400 hover:text-hud2"><Ico name="close" /></button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" disabled={!canUndo} onClick={onUndo} className="rounded border border-edge px-2.5 py-1 text-xs text-slate-300 hover:border-hud/60 disabled:opacity-40"><Ico name="undo" /> Undo last change</button>
            <button type="button" disabled={!customized} onClick={onReset} className="rounded border border-edge px-2.5 py-1 text-xs text-slate-300 hover:border-mod hover:text-mod disabled:opacity-40">⟲ Reset to game default</button>
            {customized && <span className="self-center rounded bg-mod/15 px-1.5 font-mono text-[10px] uppercase text-mod">customized</span>}
          </div>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4 scrollbar-thin">
          {GROUPS.map(({ g, icon }) => {
            const list = effectiveGroup(action, rebinds, g);
            const own = (rebinds ?? []).some((r) => (g === 'km' ? r.slot === 'kb' || r.slot === 'mo' : r.slot === g));
            const defs = (action?.d ?? []).filter((d) => (g === 'km' ? d.slot === 'kb' || d.slot === 'mo' : d.slot === g));
            const update = (i: number, patch: Partial<Rebind>) => onSetGroup(g, list.map((r, j) => (j === i ? { ...r, ...patch } : r)));
            return (
              <section key={g} className="rounded-lg border border-edge/70 bg-black/20 p-3" data-testid={`editor-${g}`}>
                <div className="flex items-center gap-2">
                  <Ico name={icon} className="h-4 w-4" />
                  <h3 className="font-display text-sm font-bold uppercase tracking-widest text-hud2">{GROUP_LABEL[g]}</h3>
                  {own && <span className="font-mono text-[9px] uppercase text-mod">overridden</span>}
                  <button type="button" onClick={() => onCapture(g)} className="ml-auto rounded border border-hud/50 bg-hud/10 px-2 py-0.5 text-xs text-hud2 hover:bg-hud/20">+ Add binding</button>
                </div>
                {list.length ? (
                  <ul className="mt-2 space-y-1.5">
                    {list.map((r, i) => (
                      <li key={bindKey(r.slot, r.instance, r.input)} className="flex flex-wrap items-center gap-2 rounded border border-edge/60 bg-panel2/60 px-2 py-1.5">
                        <button type="button" onClick={() => onCapture(g, r)} title="Click to rebind (listen for a new input)" className="flex flex-wrap items-center gap-1 rounded px-1 hover:bg-hud/10">
                          {(r.slot === 'js' || r.slot === 'gp') && <span className="font-mono text-[9px] font-bold text-hud/70">{r.slot.toUpperCase()}{r.instance}</span>}
                          {tokens(normalizeCombo(r.input)).map((t, k) => <span key={k} className="flex items-center gap-1">{k > 0 && <span className="text-[10px] text-slate-500">+</span>}<kbd className="keycap">{keyLabel(t, r.slot)}</kbd></span>)}
                        </button>
                        <code className="font-mono text-[10px] text-slate-500">{formatInput(r.slot, r.instance, r.input)}</code>
                        <select value={r.mode ?? ''} onChange={(e) => update(i, { mode: e.target.value || undefined })} aria-label="Activation mode"
                          className="ml-auto rounded border border-edge bg-panel2 px-1 py-0.5 font-mono text-[10px] text-slate-300">
                          <option value="">default{row.mode ? ` (${prettyMode(row.mode)})` : ''}</option>
                          {ACTIVATION_MODES.map((m) => <option key={m} value={m}>{prettyMode(m)}</option>)}
                        </select>
                        <select value={r.multiTap ?? 1} onChange={(e) => update(i, { multiTap: Number(e.target.value) > 1 ? Number(e.target.value) : undefined })} aria-label="Taps"
                          className="rounded border border-edge bg-panel2 px-1 py-0.5 font-mono text-[10px] text-slate-300">
                          <option value={1}>1×</option><option value={2}>2× tap</option><option value={3}>3× tap</option>
                        </select>
                        <button type="button" onClick={() => onCapture(g, r)} className="rounded border border-edge px-1.5 py-0.5 text-[11px] text-slate-300 hover:border-hud/60 hover:text-hud2">Rebind</button>
                        <button type="button" onClick={() => onSetGroup(g, list.filter((_, j) => j !== i))} title="Unbind" className="rounded border border-edge px-1.5 py-0.5 text-[11px] text-slate-400 hover:border-alert hover:text-alert"><Ico name="close" /></button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 font-mono text-[11px] text-slate-600">{own ? 'Cleared: the default is unbound in this profile.' : 'Unbound.'}</p>
                )}
                <p className="mt-2 font-mono text-[10px] text-slate-500">
                  Game default: {defs.length ? defs.map((d) => `${comboLabel(d.input, d.slot)}${d.mode ? ` (${prettyMode(d.mode)})` : ''}`).join(' · ') : 'unbound'}
                </p>
              </section>
            );
          })}
          <p className="text-[10px] leading-relaxed text-slate-500">
            Keyboard and mouse are a single device in Star Citizen: once you change either, the file stores the full keyboard + mouse set for this action.
            Edits are saved to the active profile in this browser right away.
          </p>
        </div>
      </aside>
    </div>
  );
}
