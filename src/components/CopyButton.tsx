// Copy-to-clipboard for paths and console commands: one small icon button (tooltip "Copy …", then a "Copied" tag for a moment),
// and CopyText = the text in a wrapping code box + that button. Shared by every place the app shows a file path or a console
// command (Settings, profile card, Game slots strip, Export, Help, the js9+ note, the controllers note).
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Tip } from './Tooltip';
import { Ico } from './icons';

/** copy text: the Clipboard API, else a hidden textarea + execCommand (non-secure pages, older browsers) */
export async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* fall back */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch { return false; }
}

export function CopyButton({ text, label = 'Copy', testid, className = '' }: { text: string; label?: string; testid?: string; className?: string }) {
  const [state, setState] = useState<'idle' | 'ok' | 'fail'>('idle');
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const copy = async () => {
    const ok = await copyText(text);
    setState(ok ? 'ok' : 'fail');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setState('idle'), 1500);
  };
  return (
    <span className="relative inline-flex shrink-0 align-middle">
      <Tip label={state === 'ok' ? 'Copied' : state === 'fail' ? 'Copy blocked: select the text instead' : label}>
        <button type="button" onClick={() => void copy()} data-testid={testid} data-copied={state === 'ok' ? '1' : undefined} aria-label={label}
          className={`rounded border p-0.5 leading-none ${state === 'ok' ? 'border-ok/60 text-ok' : 'border-edge text-slate-400 hover:border-hud/60 hover:text-hud2'} ${className}`}>
          <Ico name={state === 'ok' ? 'check' : 'copy'} className="h-3 w-3" />
        </button>
      </Tip>
      {state !== 'idle' && (
        <span role="status" className={`pointer-events-none absolute bottom-full left-1/2 z-40 mb-1 -translate-x-1/2 whitespace-nowrap rounded border px-1.5 py-0.5 font-sans text-[10px] normal-case tracking-normal shadow ${state === 'ok' ? 'border-ok/50 bg-panel text-ok' : 'border-alert/50 bg-panel text-alert'}`}>
          {state === 'ok' ? 'Copied' : 'Copy blocked'}
        </span>
      )}
    </span>
  );
}

/** a path or console command in a code box that wraps anywhere (after each backslash first), with a copy button. `kind` picks
 * the tooltip; `children` may replace the shown text (e.g. a shortened path) while the full `text` is copied. */
export function CopyText({ text, kind, testid, className = '', block = false, children }: {
  text: string; kind: 'path' | 'folder' | 'command'; testid?: string; className?: string; block?: boolean; children?: ReactNode;
}) {
  const label = kind === 'command' ? 'Copy the command' : kind === 'folder' ? 'Copy the folder path' : 'Copy the path';
  return (
    <span className={`${block ? 'flex' : 'inline-flex'} min-w-0 max-w-full items-start gap-1 ${className}`} data-testid={testid} data-copy-kind={kind}>
      <code className="min-w-0 select-all font-mono [overflow-wrap:anywhere]" data-testid={testid ? `${testid}-text` : undefined}>
        {children ?? (kind === 'command' ? text : text.split('\\').map((part, i, all) => <span key={i}>{part}{i < all.length - 1 ? '\\' : ''}<wbr /></span>))}
      </code>
      <CopyButton text={text} label={label} testid={testid ? `${testid}-copy` : undefined} />
    </span>
  );
}
