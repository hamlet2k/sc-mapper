import { memo, useState } from 'react';
import { bindKey, columnOfInput } from '../lib/inputs';
import { comboLabel, prettyMode } from '../lib/inputs';
import { groupLabel } from '../lib/groups';
import type { Binding, Device, Row } from '../lib/types';
import { BindingChip } from './BindingChip';
import { Ico } from './icons';

export interface ListProps {
  rows: Row[];
  grouped: boolean;
  devices: Set<Device>;
  conflictsOf: (row: Row, b: Binding) => string[] | undefined;
  onBindingClick: (b: Binding) => void;
  editMode: boolean;
  onCapture: (row: Row, device: Device, replace?: Binding) => void;
  onRemove: (row: Row, b: Binding) => void;
  onEdit: (row: Row) => void;
  /** inputs just pressed (bindKey form): matching chips flash */
  flash?: Set<string> | null;
}

const COLS: { device: Device; label: string }[] = [
  { device: 'keyboard', label: 'Keyboard' },
  { device: 'mouse', label: 'Mouse' },
  { device: 'joystick', label: 'Joystick / HOTAS' },
  { device: 'gamepad', label: 'Gamepad' },
];

/** Which column a binding belongs in */
export function columnOf(b: Binding): Device {
  return columnOfInput(b.slot, b.input);
}

export function ActionList({ rows, grouped, devices, conflictsOf, onBindingClick, editMode, onCapture, onRemove, onEdit, flash }: ListProps) {
  const cols = COLS.filter((c) => devices.has(c.device));
  const template = `minmax(240px, 1.35fr) ${cols.map(() => 'minmax(120px, 1fr)').join(' ')}`;

  if (!rows.length) {
    return (
      <div className="hud-panel hud-corners mt-6 rounded-lg p-10 text-center">
        <div className="font-display text-2xl tracking-widest text-hud">NO SIGNAL</div>
        <p className="mt-2 text-sm text-slate-400">No actions match the current search and filters.</p>
      </div>
    );
  }

  const sections: { key: string; title: string; sub?: string; rows: Row[] }[] = [];
  if (grouped) {
    for (const r of rows) {
      const last = sections[sections.length - 1];
      const k = `${r.group}:${r.map}`;
      if (last && last.key === k) last.rows.push(r);
      else sections.push({ key: k, title: r.mapLabel, sub: groupLabel(r.group), rows: [r] });
    }
  } else sections.push({ key: 'results', title: `${rows.length} matching actions`, sub: 'Sorted by relevance', rows });

  return (
    <div className="hud-panel rounded-lg">
      <div className="sticky top-0 z-20 grid gap-3 border-b border-edge bg-panel/95 px-4 py-2 font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-hud/70 backdrop-blur" style={{ gridTemplateColumns: template }}>
        <div>Action</div>
        {cols.map((c) => <div key={c.device}>{c.label}</div>)}
      </div>
      {sections.map((s, si) => (
        <section key={`${s.key}#${si}`}>
          <div className="sticky top-[33px] z-10 flex items-baseline gap-3 border-b border-edge/60 bg-gradient-to-r from-panel2 via-panel/95 to-panel/80 px-4 py-1.5 backdrop-blur">
            <h3 className="font-display text-base font-bold uppercase tracking-wider text-hud2">{s.title}</h3>
            {s.sub && <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500">{s.sub}</span>}
            <span className="ml-auto font-mono text-[10px] text-slate-500">{s.rows.length}</span>
          </div>
          {s.rows.map((r) => (
            <ActionRow key={r.id} row={r} cols={cols.map((c) => c.device)} template={template} showMap={!grouped} conflictsOf={conflictsOf} onBindingClick={onBindingClick}
              editMode={editMode} onCapture={onCapture} onRemove={onRemove} onEdit={onEdit}
              flash={flash && r.bindings.some((b) => flash.has(bindKey(b.slot, b.instance, b.input))) ? flash : undefined} />
          ))}
        </section>
      ))}
    </div>
  );
}

interface RowProps {
  row: Row; cols: Device[]; template: string; showMap: boolean;
  conflictsOf: ListProps['conflictsOf']; onBindingClick: ListProps['onBindingClick'];
  editMode: boolean; onCapture: ListProps['onCapture']; onRemove: ListProps['onRemove']; onEdit: ListProps['onEdit'];
  flash?: Set<string>;
}

const ActionRow = memo(function ActionRow({ row, cols, template, showMap, conflictsOf, onBindingClick, editMode, onCapture, onRemove, onEdit, flash }: RowProps) {
  const [open, setOpen] = useState(false);
  const mode = prettyMode(row.mode);
  return (
    <div className={`row-cv border-b border-edge/30 hover:bg-hud/[0.03] ${flash ? 'flash-row' : ''}`} data-flash-row={flash ? '1' : undefined}>
      <div className="grid items-start gap-3 px-4 py-2" style={{ gridTemplateColumns: template }}>
        <button type="button" onClick={() => (editMode ? onEdit(row) : setOpen((o) => !o))} className="min-w-0 text-left" title={editMode ? 'Open the action editor' : 'Show details'}>
          <div className="flex items-center gap-2">
            {row.customized && <span className="h-2 w-2 shrink-0 rotate-45 bg-mod" title="Customized" />}
            <span className="truncate text-sm font-medium text-slate-100">{row.label}</span>
            {mode && mode !== 'Press' && <span className="shrink-0 rounded border border-edge px-1 font-mono text-[9px] uppercase text-slate-400">{mode}</span>}
          </div>
          <div className="mt-0.5 flex min-w-0 items-center gap-2 font-mono text-[10px] text-slate-500">
            <span className="truncate">{row.action}</span>
            {showMap && <span className="truncate text-hud/50">· {row.mapLabel}</span>}
          </div>
        </button>
        {cols.map((c) => {
          const bs = row.bindings.filter((b) => columnOf(b) === c);
          const cleared = row.cleared.includes(c);
          return (
            <div key={c} className="flex min-w-0 flex-wrap items-center gap-1">
              {bs.map((b, i) => (
                <BindingChip key={i} b={b} conflict={conflictsOf(row, b)} flash={!!flash?.has(bindKey(b.slot, b.instance, b.input))}
                  onClick={editMode ? (x) => onCapture(row, c, x) : onBindingClick} onRemove={editMode ? (x) => onRemove(row, x) : undefined} />
              ))}
              {!bs.length && cleared && <span className="rounded border border-dashed border-mod/40 px-1.5 font-mono text-[10px] text-mod/70 line-through" title="Default binding removed in your profile">cleared</span>}
              {!bs.length && !cleared && !editMode && <span className="font-mono text-[11px] text-slate-700">—</span>}
              {editMode && (
                <button type="button" onClick={() => onCapture(row, c)} title={`Add a ${c} binding (listen for input)`} aria-label={`Add ${c} binding`}
                  className="rounded-md border border-dashed border-edge2 px-1.5 py-0.5 font-mono text-[11px] text-slate-500 transition hover:border-mod hover:bg-mod/10 hover:text-mod">+</button>
              )}
            </div>
          );
        })}
      </div>
      {open && (
        <div className="mx-4 mb-2 rounded border border-edge/60 bg-black/30 px-3 py-2 text-xs text-slate-400">
          {row.desc && <p className="mb-1 text-slate-300">{row.desc}</p>}
          <div className="flex flex-wrap gap-x-6 gap-y-1 font-mono text-[11px]">
            <span>map: <span className="text-hud/80">{row.map}</span></span>
            <span>action: <span className="text-hud/80">{row.action}</span></span>
            {row.mode && <span>activation: <span className="text-hud/80">{row.mode}</span></span>}
            <span>
              game default:{' '}
              <span className="text-slate-200">
                {row.defaults.length ? row.defaults.map((d) => `${d.slot.toUpperCase()} ${comboLabel(d.input, d.slot)}`).join(' · ') : 'unbound'}
              </span>
            </span>
            {row.unlisted && <span className="text-mod">Not present in the bundled defaults (renamed or new action?)</span>}
          </div>
          <button type="button" onClick={() => onEdit(row)} className="mt-2 rounded border border-hud/50 bg-hud/10 px-2 py-0.5 text-[11px] text-hud2 hover:bg-hud/20"><Ico name="edit" /> Edit bindings</button>
        </div>
      )}
    </div>
  );
});
