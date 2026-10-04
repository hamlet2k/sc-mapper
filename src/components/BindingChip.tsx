import { keyLabel, normalizeCombo, prettyMode, SLOT_TAG, tokens } from '../lib/inputs';
import type { Binding } from '../lib/types';

interface Props {
  b: Binding;
  conflict?: string[];
  onClick?: (b: Binding) => void;
  showTag?: boolean;
}

export function BindingChip({ b, conflict, onClick, showTag }: Props) {
  const tag = b.slot === 'js' ? `JS${b.instance}` : b.slot === 'gp' && b.instance > 1 ? `GP${b.instance}` : showTag ? SLOT_TAG[b.slot] : null;
  const mode = prettyMode(b.mode);
  const showMode = mode && !['Press', 'Press/Hold'].includes(mode);
  const cls = conflict?.length
    ? 'border-alert/70 bg-alert/10 shadow-[0_0_12px_-4px_var(--color-alert)]'
    : b.custom
      ? 'border-mod/60 bg-mod/10 shadow-[0_0_12px_-5px_var(--color-mod)]'
      : 'border-edge2/70 bg-panel2/80 hover:border-hud/60';
  const title = [
    b.custom ? 'Customized binding' : 'Default binding',
    b.mode ? `Activation: ${b.mode}` : '',
    b.multiTap ? `Multi-tap: ${b.multiTap}` : '',
    conflict?.length ? `⚠ Possible conflict with: ${conflict.join(', ')}` : '',
    'Click to find everything on this input',
  ].filter(Boolean).join('\n');
  return (
    <button
      type="button"
      title={title}
      onClick={() => onClick?.(b)}
      className={`group inline-flex max-w-full items-center gap-1 rounded-md border px-1.5 py-0.5 text-left transition ${cls}`}
    >
      {conflict?.length ? <span className="text-[10px] text-alert">⚠</span> : b.custom ? <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-mod" /> : null}
      {tag && <span className="font-mono text-[9px] font-bold tracking-wider text-hud/70">{tag}</span>}
      <span className="flex flex-wrap items-center gap-0.5">
        {tokens(normalizeCombo(b.input)).map((t, i) => (
          <span key={i} className="flex items-center gap-0.5">
            {i > 0 && <span className="text-[10px] text-slate-500">+</span>}
            <kbd className="keycap">{keyLabel(t, b.slot)}</kbd>
          </span>
        ))}
      </span>
      {(showMode || b.multiTap) && (
        <span className="ml-0.5 rounded bg-white/5 px-1 font-mono text-[9px] uppercase tracking-wide text-slate-400">
          {b.multiTap ? `${b.multiTap}× tap` : mode}
        </span>
      )}
    </button>
  );
}
