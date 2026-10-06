import { bindKey, comboLabel, searchSpec, prettyMode } from '../lib/inputs';
import type { ConflictGroup } from '../lib/conflicts';

interface Props {
  groups: ConflictGroup[]; onPick: (combo: string) => void;
  /** "Default overlaps" filter (in the Conflicts filter bar) */
  includeDefault: boolean; hasProfile: boolean;
  /** inputs just pressed (bindKey form, Settings → Highlight on press): the groups on them flash */
  flash?: Set<string> | null;
}

export function ConflictsView({ groups, onPick, includeDefault, hasProfile, flash }: Props) {
  if (!groups.length) {
    return (
      <div className="hud-panel hud-corners rounded-lg p-10 text-center">
        <div className="font-display text-2xl tracking-widest text-ok">ALL CLEAR</div>
        <p className="mt-2 text-sm text-slate-400">
          {includeDefault ? 'No overlapping bindings found in the current view.' : hasProfile ? 'None of your customized bindings collide with another active action.' : 'Import your actionmaps.xml to check your custom bindings for collisions.'}
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="hud-panel rounded-lg px-4 py-3 text-xs text-slate-400">
        <span className="font-display text-sm font-semibold uppercase tracking-widest text-alert">{groups.length} possible conflicts</span>
        <span className="ml-3">
          Same physical input bound to different actions that are active in the same context (e.g. flight + weapons, or on-foot) with a
          clashing activation mode. Star Citizen deliberately overloads some keys (tap vs. hold, mode-specific maps), so treat these as
          things to review rather than definite errors. Groups with customized bindings are listed first.
        </span>
      </div>
      <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
        {groups.map((g) => {
          const first = g.entries[0].binding;
          const custom = g.entries.some((e) => e.binding.custom);
          const dev = first.slot === 'js' ? `JS${first.instance}` : first.slot === 'gp' ? 'Gamepad' : first.devices.includes('mouse') ? 'Mouse' : 'Keyboard';
          const lit = !!flash && g.entries.some((e) => flash.has(bindKey(e.binding.slot, e.binding.instance, e.binding.input)));
          return (
            <div key={g.phys} data-flash-row={lit ? '1' : undefined} data-conflict-group={g.phys}
              className={`hud-panel rounded-lg border-l-2 p-3 ${custom ? 'border-l-mod' : 'border-l-alert'} ${lit ? 'flash-card' : ''}`}>
              <button type="button" onClick={() => onPick(searchSpec(first.slot, first.instance, first.input))} className="flex w-full items-center gap-2 text-left" title="Show these actions in the list">
                <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500">{dev}</span>
                <span className="keycap !text-sm">{comboLabel(first.input, first.slot)}</span>
                {custom && <span className="rounded bg-mod/15 px-1.5 font-mono text-[10px] uppercase text-mod">customized</span>}
                <span className="ml-auto font-mono text-xs text-alert">{g.entries.length}×</span>
              </button>
              <ul className="mt-2 space-y-1">
                {g.entries.map((e, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${e.binding.custom ? 'bg-mod' : 'bg-hud/60'}`} />
                    <span className="min-w-0">
                      <span className="block text-slate-100">{e.row.label}{e.binding.custom && <span className="ml-2 font-mono text-[9px] uppercase text-mod">yours</span>}</span>
                      <span className="block font-mono text-[10px] text-slate-500">{e.row.mapLabel}{e.binding.mode ? ` · ${prettyMode(e.binding.mode)}` : ''}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
