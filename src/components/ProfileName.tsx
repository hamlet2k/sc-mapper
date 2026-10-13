import { useEffect, useRef, useState } from 'react';
import { trimProfileName } from '../lib/profileNames';
import { useEscape } from './useEscape';

/** Shared name editor: select the derived/current name, and reject whitespace-only edits. */
export function ProfileNameInput({ initial, onSave, onCancel, saveOnBlur = false, testId }: {
  initial: string; onSave: (name: string) => void; onCancel: () => void; saveOnBlur?: boolean; testId: string;
}) {
  const [name, setName] = useState(initial);
  const [invalid, setInvalid] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  const finished = useRef(false);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  const cancel = () => { finished.current = true; onCancel(); };
  const save = () => {
    if (finished.current) return;
    const next = trimProfileName(name);
    if (!next) { setInvalid(true); return; }
    finished.current = true;
    onSave(next);
  };
  return <>
    <input ref={ref} value={name} onChange={(e) => { setName(e.target.value); setInvalid(false); }}
      aria-label="Profile name" aria-invalid={invalid || undefined} data-testid={testId}
      className="mt-1.5 w-full rounded border border-edge bg-panel2 px-2 py-1.5 text-sm text-slate-200 outline-none focus:border-hud"
      onBlur={() => { if (saveOnBlur) save(); }} onKeyDown={(e) => {
        if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); save(); }
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancel(); }
      }} />
    {invalid && <p className="mt-1 text-xs text-alert" role="alert">Enter a profile name.</p>}
    {!saveOnBlur && <button type="button" onClick={save} data-testid="import-name-accept"
      className="mt-3 rounded border border-hud/60 bg-hud/15 px-3 py-1.5 text-xs font-semibold text-hud2 hover:bg-hud/25">Import</button>}
  </>;
}

export function ImportNameDialog({ initial, file, onSave, onCancel }: {
  initial: string; file: string; onSave: (name: string) => void; onCancel: () => void;
}) {
  useEscape(onCancel);
  return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-void/80 p-4 backdrop-blur-sm" onClick={onCancel}>
    <div className="hud-panel w-full max-w-sm rounded-xl p-5 text-sm text-slate-300" onClick={(e) => e.stopPropagation()}
      role="dialog" aria-label="Name imported profile" data-testid="import-name-dialog">
      <h3 className="font-display text-lg font-semibold text-hud2">Name your profile</h3>
      <p className="mt-1 truncate text-xs text-slate-500" title={file}>{file}</p>
      <ProfileNameInput initial={initial} onSave={onSave} onCancel={onCancel} testId="import-profile-name" />
      <button type="button" onClick={onCancel} className="ml-2 rounded border border-edge px-3 py-1.5 text-xs hover:border-hud/60">Cancel</button>
    </div>
  </div>;
}
