// Share controller (export) and Import shared controller (preview) dialogs. File format and logic: lib/share.ts.
import { useDeferredValue, useMemo, useState } from 'react';
import { comboLabel, prettyMode } from '../lib/inputs';
import {
  deviceMatch, packController, serializeShared, shareFileName, templatePictures, SHARE_EXT,
  type ImportMode, type ImportPlan, type PackInput, type SharedController, type SlotRef, type TargetOption,
} from '../lib/share';
import { imageSrc, templateViews, useTemplateImage, type DeviceTemplate } from '../lib/templates';
import { Ico } from './icons';
import { useEscape } from './useEscape';

const mb = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);
const plural = (n: number, w: string) => `${n} ${n === 1 ? w : /[^aeiou]y$/.test(w) ? w.slice(0, -1) + 'ies' : w + 's'}`;
const usb = (d: { vendor?: string; product?: string }) => (d.vendor && d.product ? `${d.vendor}:${d.product}` : '');
const BTN = 'rounded border px-4 py-2 font-display text-sm font-semibold uppercase tracking-wider';

function Shell({ title, sub, onClose, testid, children, wide }: { title: string; sub?: string; onClose: () => void; testid: string; children: React.ReactNode; wide?: boolean }) {
  useEscape(onClose);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-void/85 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className={`hud-panel hud-corners flex max-h-[92vh] w-full flex-col overflow-hidden rounded-xl ${wide ? 'max-w-5xl' : 'max-w-xl'}`} onClick={(e) => e.stopPropagation()}
        role="dialog" aria-label={title} data-testid={testid}>
        <div className="flex items-start gap-3 border-b border-edge px-5 py-3">
          <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="font-display text-xl font-bold uppercase tracking-[0.2em] text-hud2">{title}</h2>
            {sub && <span className="min-w-0 font-mono text-[11px] text-slate-500 [overflow-wrap:anywhere]">{sub}</span>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" title="Close (Esc)" className="shrink-0 rounded border border-edge px-2 py-1 text-xs text-slate-400 hover:text-hud2"><Ico name="close" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
function Fact({ label, children, testid }: { label: string; children: React.ReactNode; testid?: string }) {
  return (
    <div className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-2 py-1 text-xs" data-testid={testid}>
      <span className="font-display text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">{label}</span>
      <span className="min-w-0 text-slate-200 [overflow-wrap:anywhere]">{children}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ Share controller */
export function ShareExportDialog({ slotLabel, input, onClose, onSaved }: {
  slotLabel: string;
  /** everything but title / note */
  input: Omit<PackInput, 'title' | 'note'>;
  onClose: () => void;
  onSaved: (fileName: string, pack: SharedController) => void;
}) {
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const dTitle = useDeferredValue(title), dNote = useDeferredValue(note);
  const base = useMemo(() => serializeShared(packController({ ...input, title: '', note: '' })).length, [input]);
  const estimate = base + (dTitle.trim() ? JSON.stringify(dTitle.trim()).length + 12 : 0) + (dNote.trim() ? JSON.stringify(dNote.trim()).length + 11 : 0);
  const { bindings, template, axis, device, game } = input;
  const own = bindings.filter((b) => !b.default).length;
  const actions = new Set(bindings.map((b) => `${b.map}/${b.action}`)).size;
  const cats = new Set(bindings.map((b) => b.category ?? b.map)).size;
  const combos = bindings.filter((b) => b.input.includes('+')).length;
  const pics = template.builtin ? null : templatePictures(template);
  const file = shareFileName({ title: dTitle, device, template: { kind: 'builtin', id: template.id, name: template.name } });
  const download = () => {
    const pack = packController({ ...input, title, note });
    const url = URL.createObjectURL(new Blob([serializeShared(pack)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url; a.download = shareFileName(pack);
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    onSaved(a.download, pack);
  };
  return (
    <Shell title="Share controller" sub={`${slotLabel} · ${device.name ?? template.name}`} onClose={onClose} testid="share-export">
      <div className="min-h-0 space-y-4 overflow-y-auto p-5 scrollbar-thin">
        <p className="text-xs leading-relaxed text-slate-400">One file with this device&apos;s template and every binding on {slotLabel} (all game modes, modifier combos included) and its axis settings. Someone else imports it on their Devices page, onto whatever slot they have this device on.</p>
        <label className="flex flex-col gap-1 text-[10px] uppercase tracking-widest text-slate-500">
          Title <span className="normal-case tracking-normal text-slate-600">(optional)</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder={`e.g. ${device.name ?? template.name} · dogfight layout`} data-testid="share-title"
            className="rounded border border-edge bg-black/40 px-2 py-1.5 text-sm normal-case tracking-normal text-slate-100 outline-none placeholder:text-slate-600 focus:border-hud" />
        </label>
        <label className="flex flex-col gap-1 text-[10px] uppercase tracking-widest text-slate-500">
          Note <span className="normal-case tracking-normal text-slate-600">(optional: what it is for, how to use it)</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} rows={3} data-testid="share-note"
            className="resize-y rounded border border-edge bg-black/40 px-2 py-1.5 text-sm normal-case tracking-normal text-slate-100 outline-none focus:border-hud" />
        </label>
        <div className="rounded border border-edge/70 bg-black/20 px-3 py-2" data-testid="share-summary">
          <Fact label="Bindings" testid="share-sum-bindings"><b className="text-hud2">{bindings.length}</b> on {slotLabel} ({own} yours, {bindings.length - own} game default{bindings.length - own === 1 ? '' : 's'}) · {plural(actions, 'action')} in {plural(cats, 'category')}{combos ? ` · ${combos} with a modifier` : ''}</Fact>
          <Fact label="Template" testid="share-sum-template">{template.name} · <span className="text-slate-400">{template.builtin ? 'built-in, referenced by its id (every copy of the app has it)' : 'your template, included in full (pages, callouts, layout)'}</span></Fact>
          <Fact label="Photos" testid="share-sum-photos">{template.builtin
            ? <span className="text-slate-400">none embedded: the built-in&apos;s pictures come with the app</span>
            : pics!.embedded ? <><b className="text-slate-200">{plural(pics!.embedded, 'photo')} embedded</b> <span className="text-slate-400">({mb(pics!.bytes)})</span></> : <span className="text-slate-400">none embedded</span>}
            {pics?.builtinRefs ? <span className="text-slate-400"> · {plural(pics.builtinRefs, 'built-in photo')} referenced</span> : null}</Fact>
          <Fact label="Axis settings" testid="share-sum-axis">{axis ? `${plural(axis.groups.length, 'tuned control')} (invert / exponent / curve)${axis.axes.length ? `, ${plural(axis.axes.length, 'deadzone / saturation value')}` : ''}` : <span className="text-slate-500">none on {slotLabel} (game defaults)</span>}</Fact>
          <Fact label="Device">{device.name ?? <span className="text-slate-500">unknown</span>}{usb(device) ? <span className="font-mono text-slate-400"> · USB {usb(device)}</span> : ''}</Fact>
          <Fact label="Game build">{[game.branch?.replace('sc-alpha-', 'Alpha '), game.version, game.channel].filter(Boolean).join(' · ')}</Fact>
          <Fact label="File" testid="share-sum-file"><span className="font-mono">{file}</span> · <span data-testid="share-size">≈ {mb(estimate)}</span></Fact>
        </div>
        <p className="text-[11px] text-slate-500">Keyboard and mouse bindings are not included (only this controller&apos;s own inputs). Nothing is uploaded: you send the file yourself.</p>
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onClose} className={`${BTN} border-edge text-slate-300 hover:border-hud/60`}>Cancel</button>
          <button type="button" onClick={download} disabled={!bindings.length && !axis} data-testid="share-download"
            className={`${BTN} border-hud/60 bg-hud/15 text-hud2 shadow-[0_0_18px_-6px_var(--color-hud)] hover:bg-hud/25 disabled:opacity-40`}><Ico name="export" /> Download {SHARE_EXT}</button>
        </div>
      </div>
    </Shell>
  );
}

/* ------------------------------------------------------------------ Import shared controller */
export interface ImportTarget extends TargetOption { label: string; name?: string; isNew?: boolean; axisOk: boolean }
export interface TemplateInfo { status: 'builtin' | 'builtin-missing' | 'custom-new' | 'custom-installed'; template?: DeviceTemplate; installedName?: string }

function Thumb({ t }: { t: DeviceTemplate }) {
  const r = useTemplateImage(t);
  const v = templateViews(r)[0];
  return v?.image
    ? <img src={imageSrc(v.image)} alt={`${t.name} picture`} className="max-h-36 w-full rounded border border-edge/60 bg-black/40 object-contain" data-testid="share-import-thumb" />
    : <div className="flex h-24 items-center justify-center rounded border border-dashed border-edge/60 text-[11px] text-slate-500" data-testid="share-import-thumb">blank canvas · {plural(t.callouts.length, 'callout')}</div>;
}

export function ShareImportDialog({ pack, fileName, targets, initial, plan, templateInfo, gameVersion, onConfirm, onCancel }: {
  pack: SharedController; fileName: string;
  targets: ImportTarget[]; initial: SlotRef | null;
  plan: (t: SlotRef, mode: ImportMode) => ImportPlan;
  templateInfo: TemplateInfo;
  /** the importer's bundled game build */
  gameVersion?: string;
  onConfirm: (t: SlotRef & { isNew?: boolean }, mode: ImportMode) => void;
  onCancel: () => void;
}) {
  const key = (t: SlotRef) => `${t.slot}${t.instance}`;
  const [sel, setSel] = useState(() => (initial ? key(initial) : targets[0] ? key(targets[0]) : ''));
  const [mode, setMode] = useState<ImportMode>('merge');
  const target = targets.find((t) => key(t) === sel) ?? targets[0];
  const p = useMemo(() => (target ? plan({ slot: target.slot, instance: target.instance }, mode) : null), [target, mode, plan]);
  const match = target ? (target.isNew ? 'unknown' : deviceMatch(target.ident, pack.device)) : 'unknown';
  const slotName = target ? key(target).toUpperCase() : '';
  const d = pack.device;
  const skippedKeys = new Set(p?.skipped.map((b) => `${b.map}/${b.action}|${b.input}`) ?? []);
  const own = pack.bindings.filter((b) => !b.default).length;
  // the author's own bindings first, then the game defaults the file carries; by input within each
  const rows = [...pack.bindings].sort((a, b) => Number(!!a.default) - Number(!!b.default) || a.input.localeCompare(b.input, undefined, { numeric: true }) || (a.label ?? a.action).localeCompare(b.label ?? b.action));
  const exported = pack.exportedAt ? new Date(pack.exportedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '';
  const otherBuild = pack.game.version && gameVersion && pack.game.version.split('.').slice(0, 2).join('.') !== gameVersion.split('.').slice(0, 2).join('.');
  const t = templateInfo;
  return (
    <Shell title="Import shared controller" sub={fileName} onClose={onCancel} testid="share-import" wide>
      <div className="grid min-h-0 flex-1 overflow-y-auto scrollbar-thin md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] md:overflow-hidden">
        <div className="min-w-0 space-y-3 border-edge p-5 scrollbar-thin md:min-h-0 md:overflow-y-auto md:border-r">
          <div>
            <div className="font-display text-lg font-bold text-slate-100" data-testid="share-import-title">{pack.title ?? d.name ?? pack.template.name}</div>
            {pack.note && <p className="mt-1 whitespace-pre-wrap text-xs text-slate-300" data-testid="share-import-note">{pack.note}</p>}
            <p className="mt-1 text-[11px] text-slate-500">{d.name ?? 'Unknown device'}{usb(d) ? ` · USB ${usb(d)}` : ''}{d.sourceSlot ? ` · was ${d.sourceSlot} for its author` : ''}{exported ? ` · shared ${exported}` : ''}</p>
          </div>
          <div className="space-y-1.5" data-testid="share-import-template">
            {t.template && <Thumb t={t.template} />}
            <p className="text-[11px] text-slate-300"><b>{pack.template.name}</b>{' '}
              <span className="text-slate-500">{t.status === 'builtin' ? '· built-in template' : t.status === 'builtin-missing' ? '· built-in template this version of the app doesn’t have: the slot keeps its automatic template' : t.status === 'custom-installed' ? `· already in your templates${t.installedName && t.installedName !== pack.template.name ? ` as “${t.installedName}”` : ''}` : '· custom template: added to your templates'}</span></p>
          </div>
          <label className="flex flex-col gap-1 text-[10px] uppercase tracking-widest text-slate-500">
            Put it on
            <select value={sel} onChange={(e) => setSel(e.target.value)} data-testid="share-import-slot"
              className="rounded border border-edge bg-panel2 px-2 py-1.5 font-mono text-xs normal-case tracking-normal text-slate-200 outline-none focus:border-hud">
              {targets.map((o) => <option key={key(o)} value={key(o)}>{o.label}</option>)}
            </select>
          </label>
          {target && <div data-testid="share-import-match" data-match={match} className={`flex items-start gap-1.5 rounded border px-2 py-1.5 text-[11px] ${match === 'none' ? 'border-mod/60 bg-mod/10 text-mod' : match === 'unknown' ? 'border-edge text-slate-400' : 'border-ok/40 text-ok'}`}>
            <Ico name={match === 'none' ? 'alert' : match === 'unknown' ? 'info' : 'check'} className="mt-0.5 h-3.5 w-3.5" />
            <span>{match === 'none' ? <>{slotName} is {target.name ?? 'another device'}{target.ident?.vendor ? ` (${target.ident.vendor}:${target.ident.productId})` : ''}, not {d.name ?? 'this file’s device'}{usb(d) ? ` (${usb(d)})` : ''}. The bindings use that device&apos;s button numbers and may not fit.</>
              : match === 'unknown' ? <>{target.isNew ? `A new slot ${slotName}` : `No device is known on ${slotName} yet`}: it takes the file&apos;s device{d.name ? ` (${d.name})` : ''}, so the export names it.</>
              : <>{slotName} is {target.name ?? d.name}{match === 'usb' ? ' (same USB id)' : ' (same name)'}{target.connected ? ', connected' : ''}.</>}</span>
          </div>}
          <div role="radiogroup" aria-label="How to apply" className="grid grid-cols-2 gap-2" data-testid="share-import-mode">
            {(['merge', 'replace'] as const).map((m) => (
              <button key={m} type="button" role="radio" aria-checked={mode === m} onClick={() => setMode(m)} data-mode={m}
                className={`rounded-lg border p-2.5 text-left transition ${mode === m ? 'border-hud bg-hud/10' : 'border-edge hover:border-hud/50'}`}>
                <div className="font-display text-sm font-semibold uppercase tracking-wider text-slate-100">{m === 'merge' ? 'Merge' : 'Replace'}</div>
                <div className="mt-0.5 text-[11px] leading-snug text-slate-400">{m === 'merge' ? `The file wins on the inputs and actions it uses; the rest of ${slotName} stays.` : `Clear every binding on ${slotName} first, then apply the file.`}</div>
              </button>
            ))}
          </div>
          {p && (
            <div className="rounded border border-edge/70 bg-black/20 px-3 py-2" data-testid="share-import-counts">
              <Fact label="Applied" testid="share-count-applied"><b className="text-hud2">{p.applied.length}</b> binding{p.applied.length === 1 ? '' : 's'} on {slotName} ({p.added} new, {p.unchanged} already there)</Fact>
              <Fact label={mode === 'merge' ? 'Overwritten' : 'Removed'} testid="share-count-removed"><b className={p.removed.length ? 'text-mod' : 'text-slate-300'}>{p.removed.length}</b> existing binding{p.removed.length === 1 ? '' : 's'} on {slotName} {mode === 'merge' ? '(same input or same action)' : '(cleared first)'}</Fact>
              {p.skipped.length > 0 && <Fact label="Skipped" testid="share-count-skipped"><b className="text-alert">{p.skipped.length}</b> skipped (unknown action: not in your game version)</Fact>}
              <Fact label="Axis settings" testid="share-count-axis">{!pack.axis ? <span className="text-slate-500">none in the file</span> : !target?.axisOk ? <span className="text-mod">not applied: the game keeps axis settings for {target?.slot === 'gp' ? 'gp1' : 'js1–js8'} only</span> : `${plural(pack.axis.groups.length, 'tuned control')}${pack.axis.axes.length ? `, ${plural(pack.axis.axes.length, 'deadzone / saturation value')}` : ''} (${mode === 'merge' ? 'merged' : 'replacing'} ${slotName}'s)`}</Fact>
              {otherBuild && <Fact label="Game build"><span className="text-mod">made for {pack.game.version}; yours is {gameVersion}</span></Fact>}
            </div>
          )}
          {p && p.removed.length > 0 && (
            <details className="text-[11px] text-slate-400" data-testid="share-import-removed">
              <summary className="cursor-pointer text-slate-300">Show the {plural(p.removed.length, 'binding')} that go{p.removed.length === 1 ? 'es' : ''} away</summary>
              <ul className="mt-1 max-h-32 space-y-0.5 overflow-y-auto font-mono scrollbar-thin">{p.removed.map((r, i) => <li key={i}>{key(target!)}_{r.input} · <span className="font-sans">{r.action}</span></li>)}</ul>
            </details>
          )}
          <p className="text-[11px] text-slate-500">One undo step (Ctrl+Z) reverts the bindings, the slot&apos;s template and its axis settings. Then export your actionmaps.xml or layout as usual.</p>
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={onCancel} className={`${BTN} border-edge text-slate-300 hover:border-hud/60`}>Cancel</button>
            <button type="button" disabled={!target} onClick={() => target && onConfirm({ slot: target.slot, instance: target.instance, isNew: target.isNew }, mode)} data-testid="share-import-confirm"
              className={`${BTN} border-hud/60 bg-hud/15 text-hud2 shadow-[0_0_18px_-6px_var(--color-hud)] hover:bg-hud/25 disabled:opacity-40`}><Ico name="import" /> {mode === 'merge' ? 'Merge' : 'Replace'} into {slotName}</button>
          </div>
        </div>
        <div className="flex min-h-0 min-w-0 flex-col bg-black/30">
          <div className="flex items-center gap-2 border-b border-edge/60 px-4 py-2 font-mono text-[10px] uppercase tracking-widest text-slate-500">Incoming bindings <span className="ml-auto normal-case tracking-normal">{pack.bindings.length}{own < pack.bindings.length ? ` · ${own} set by the author, ${pack.bindings.length - own} game defaults` : ''}</span></div>
          <div className="min-h-0 flex-1 overflow-auto scrollbar-thin" data-testid="share-import-list">
            <table className="w-full text-left text-[11px]">
              <thead className="sticky top-0 bg-panel text-[10px] uppercase tracking-wider text-slate-500"><tr><th className="px-3 py-1.5 font-semibold">Input</th><th className="px-2 py-1.5 font-semibold">Action</th><th className="px-2 py-1.5 font-semibold">Category</th></tr></thead>
              <tbody>
                {rows.map((b, i) => {
                  const skip = skippedKeys.has(`${b.map}/${b.action}|${b.input}`);
                  return (
                    <tr key={i} className={`border-t border-edge/30 ${skip ? 'text-slate-500' : 'text-slate-200'}`} data-share-row={b.input} data-skipped={skip ? '1' : undefined}>
                      <td className="whitespace-nowrap px-3 py-1 font-mono text-hud/90">{target ? `${key(target)}_` : ''}{b.input}<span className="ml-1.5 font-sans text-[10px] text-slate-500">{comboLabel(b.input, pack.device.kind)}</span></td>
                      <td className="px-2 py-1">{b.label ?? b.action}{b.mode ? <span className="text-[10px] text-slate-500"> · {prettyMode(b.mode)}</span> : null}{b.multiTap ? <span className="text-[10px] text-slate-500"> · {b.multiTap}× tap</span> : null}{skip && <span className="ml-1 rounded border border-alert/50 px-1 text-[10px] text-alert">skipped (unknown action)</span>}</td>
                      <td className="px-2 py-1 text-slate-400">{b.category ?? b.map}{b.default ? <span className="text-[10px] text-slate-600"> · default</span> : null}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Shell>
  );
}
