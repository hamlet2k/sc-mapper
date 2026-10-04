import { GROUPS } from '../lib/groups';
import { Icon } from './Icon';

export interface MapCount { map: string; label: string; group: string; count: number }
interface Props {
  counts: MapCount[];
  total: number;
  selGroup: string | null;
  selMap: string | null;
  onSelect: (group: string | null, map: string | null) => void;
}

export function Sidebar({ counts, total, selGroup, selMap, onSelect }: Props) {
  return (
    <nav className="space-y-1 text-sm">
      <button type="button" onClick={() => onSelect(null, null)}
        className={`flex w-full items-center justify-between rounded px-2 py-1.5 font-display text-sm font-semibold uppercase tracking-wider transition ${!selGroup ? 'bg-hud/15 text-hud2' : 'text-slate-300 hover:bg-white/5'}`}>
        <span>All categories</span><span className="font-mono text-[11px] text-slate-400">{total}</span>
      </button>
      {GROUPS.map((g) => {
        const maps = counts.filter((c) => c.group === g.id);
        const n = maps.reduce((a, b) => a + b.count, 0);
        if (!maps.length) return null;
        const active = selGroup === g.id;
        return (
          <div key={g.id}>
            <button type="button" onClick={() => onSelect(active && !selMap ? null : g.id, null)}
              className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left font-display text-[13px] font-semibold uppercase tracking-wider transition
                ${active && !selMap ? 'bg-hud/15 text-hud2' : active ? 'text-hud2' : n ? 'text-slate-300 hover:bg-white/5' : 'text-slate-600 hover:bg-white/5'}`}>
              <span className="text-hud/70"><Icon name={g.id} /></span>
              <span className="flex-1 truncate">{g.label}</span>
              <span className="font-mono text-[11px] font-normal text-slate-400">{n}</span>
            </button>
            {active && (
              <div className="ml-4 border-l border-edge pl-2">
                {maps.map((m) => (
                  <button key={m.map} type="button" onClick={() => onSelect(g.id, selMap === m.map ? null : m.map)}
                    className={`flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left text-xs transition ${selMap === m.map ? 'bg-hud/10 text-hud2' : m.count ? 'text-slate-400 hover:text-slate-200' : 'text-slate-600'}`}>
                    <span className="truncate">{m.label}</span><span className="font-mono text-[10px]">{m.count}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}
