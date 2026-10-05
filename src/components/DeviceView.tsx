import { useMemo, useRef, useState } from 'react';
import { ChromiumBanner, ChromiumButtonNotice } from './ChromiumBanner';
import { createPortal } from 'react-dom';
import { padLabel, parseProfileProduct, type PadInfo, type PadLike } from '../lib/devices';
import { formatInput, searchSpec } from '../lib/inputs';
import {
  DUP_ORDER_GUESSES, calloutFor, calloutTitle, cloneTemplate, coveredInputs, exportTemplates, identityKey, inputRole, matchFor, matchScore, maxButton, newTemplate,
  calloutView, imageSrc, parseTemplates, pickTemplate, resolveTemplateImage, templateViews, shortInput, splitCombo, templateGroups, unassignedCount, useTemplateImage, useTemplates,
  type Callout, type DeviceIdentity, type DeviceTemplate,
} from '../lib/templates';
import type { Binding, ProfileDevice, Row, Slot } from '../lib/types';
import { CalloutBody, DeviceCanvas, TONE_STROKE, useLiveInputs, type CalloutState, type Entry, type Live, type Tone } from './DeviceCanvas';
import { TemplateEditor } from './TemplateEditor';
import { useFocusPressedView } from './useFocusPressedView';
import { useSwapViews } from './useSwapViews';

interface DevOption { key: string; slot: 'js' | 'gp'; instance: number; label: string; pad?: PadInfo; ident: DeviceIdentity }
interface Props {
  rows: Row[];
  conflictRows: Map<string, Set<string>>;
  pads: PadInfo[];
  describe: (l: readonly PadLike[]) => PadInfo[];
  profileDevices: ProfileDevice[];
  onEdit: (row: Row) => void;
  onRemove: (row: Row, b: Binding) => void;
  onBind: (row: Row, slot: Slot, instance: number, input: string) => void;
  onShowInList: (spec: string) => void;
  notify: (kind: 'ok' | 'err', text: string) => void;
}

const SEL_KEY = 'sc-mapper:device-view';
const download = (name: string, href: string) => { const a = document.createElement('a'); a.href = href; a.download = name; document.body.appendChild(a); a.click(); a.remove(); };
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'device';

/** visual view of one device: its picture with every control's bindings, live highlight, click to edit */
export function DeviceView({ rows, conflictRows, pads, describe, profileDevices, onEdit, onRemove, onBind, onShowInList, notify }: Props) {
  const T = useTemplates();
  const [selKey, setSelKey] = useState<string>(() => localStorage.getItem(SEL_KEY) ?? '');
  const [selected, setSelected] = useState<string | null>(null);
  const [group, setGroup] = useState<string | null>(null);
  const [editing, setEditing] = useState<DeviceTemplate | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  // devices: connected ones (with their game numbers), the profile's, and any js/gp number that has bindings
  const options = useMemo(() => {
    const out: DevOption[] = [];
    for (const p of pads) out.push({ key: `pad:${p.key}`, slot: p.kind, instance: p.instance, label: `${p.kind.toUpperCase()}${p.instance} · ${padLabel(p)}`, pad: p, ident: { name: p.name, vendor: p.vendor, productId: p.productId, buttons: p.buttons, slot: p.kind, ...(p.dup ? { dup: p.dup } : {}) } });
    for (const d of profileDevices) {
      if ((d.slot !== 'js' && d.slot !== 'gp') || out.some((o) => o.slot === d.slot && o.instance === d.instance)) continue;
      const pp = parseProfileProduct(d.rawProduct ?? d.product);
      out.push({ key: `prof:${d.slot}${d.instance}`, slot: d.slot, instance: d.instance, label: `${d.slot.toUpperCase()}${d.instance} · ${pp.name || d.product} (profile, not connected)`, ident: { ...pp, slot: d.slot } });
    }
    const seen = new Set<string>();
    for (const r of rows) for (const b of r.bindings) if ((b.slot === 'js' || b.slot === 'gp') && !seen.has(`${b.slot}${b.instance}`)) seen.add(`${b.slot}${b.instance}`);
    for (const k of ['js1', 'gp1', ...seen]) {
      const slot = k.slice(0, 2) as 'js' | 'gp', instance = Number(k.slice(2));
      if (!out.some((o) => o.slot === slot && o.instance === instance)) out.push({ key: `num:${k}`, slot, instance, label: `${k.toUpperCase()} (no device info)`, ident: { slot } });
    }
    return out.sort((a, b) => a.slot.localeCompare(b.slot) * -1 || a.instance - b.instance || (a.pad ? -1 : 1));
  }, [pads, profileDevices, rows]);
  const opt = options.find((o) => o.key === selKey) ?? options.find((o) => o.pad && o.slot === 'js') ?? options[0];
  const { slot, instance, ident } = opt;
  const idKey = identityKey(ident);
  const chosen = pickTemplate(T.templates, ident, T.picks[idKey]);
  const tpl = useTemplateImage(chosen.template); // built-in device templates: the picture arrives on demand
  const tplMax = maxButton(tpl);
  const unassigned = tpl.callouts.reduce((n, c) => n + unassignedCount(c), 0);
  const live = useLiveInputs(opt.pad);
  // multi-view photo templates: a pressed control brings the photo with its marker into sight (not while the editor is open)
  const canvasRef = useRef<HTMLDivElement>(null);
  const pulse = useFocusPressedView(tpl, live.active, canvasRef, !editing);
  // swappable views (e.g. the MTQ's grips): only the one in use shows; a press on another one's control switches to it
  const swap = useSwapViews(tpl, live.active, idKey);
  const shownTpl = swap.shown;

  // bindings of this device by physical input
  const index = useMemo(() => {
    const m = new Map<string, Entry[]>();
    for (const r of rows) {
      if (r.hidden) continue;
      for (const b of r.bindings) {
        if (b.slot !== slot || b.instance !== instance) continue;
        const { main, prefix } = splitCombo(b.input);
        if (!m.has(main)) m.set(main, []);
        m.get(main)!.push({ row: r, b, prefix, conflict: !!conflictRows.get(r.id)?.has(b.phys) });
      }
    }
    return m;
  }, [rows, slot, instance, conflictRows]);
  const covered = useMemo(() => new Set(tpl.callouts.flatMap(coveredInputs)), [tpl]);
  const overflow = [...index.keys()].filter((k) => !covered.has(k)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const groups = [...new Set(shownTpl.callouts.map((c) => c.group).filter((g): g is string => !!g))];

  const entriesOf = (inputs: string[]) => inputs.flatMap((i) => index.get(i) ?? []);
  const stateOf = (c: Callout): CalloutState => {
    const cov = coveredInputs(c);
    const es = entriesOf(cov);
    const tone: Tone = es.some((e) => e.conflict) ? 'conflict' : es.some((e) => e.b.custom) ? 'custom' : es.length ? 'bound' : 'unbound';
    return { tone, active: cov.some((i) => live.active.has(i)), dim: !!group && c.group !== group, ...(c.inputRegions ? { inputActive: c.inputs.map((i) => live.active.has(i)) } : {}) };
  };
  const selCallout: Callout | undefined = selected?.startsWith('input:')
    ? { id: selected, ...calloutFor(selected.slice(6)), inputs: [selected.slice(6)], anchor: { x: 0, y: 0 }, box: { x: 0, y: 0 } }
    : tpl.callouts.find((c) => c.id === selected);

  const pickDevice = (k: string) => { setSelKey(k); localStorage.setItem(SEL_KEY, k); setSelected(null); setGroup(null); };
  const withLink = (t: DeviceTemplate): DeviceTemplate => (ident.vendor || ident.name ? { ...t, slot, match: [matchFor(ident, !!opt.pad?.dup)] } : { ...t, slot });
  const saveTemplate = async (t: DeviceTemplate) => {
    try {
      const v = await T.save(t);
      // (identical devices can't be told apart by a match rule: the copy is picked for this one explicitly)
      if (!matchScore(v, ident) || ident.dup || (T.picks[idKey] && T.picks[idKey] !== v.id)) T.pick(idKey, v.id);
      setEditing(null);
      notify('ok', `Saved template “${v.name}”`);
    } catch (e) { notify('err', `Could not save the template: ${(e as Error).message}`); }
  };
  const importFile = async (f: File) => {
    try {
      const list = parseTemplates(await f.text());
      for (const t of list) await T.save(t);
      notify('ok', `Imported ${list.length} template${list.length === 1 ? '' : 's'}: ${list.map((t) => t.name).join(', ')}`);
    } catch (e) { notify('err', `Template import failed: ${(e as Error).message}`); }
  };
  const labelInfo = (c: Callout) => {
    const lines = c.inputs.flatMap((i, k) => {
      const es = coveredInputs({ inputs: [i] }).flatMap((x) => index.get(x) ?? []);
      const role = inputRole(c, k) || (c.inputs.length > 1 ? shortInput(i) : '');
      return es.slice(0, 3).map((e) => `${role ? `${role} ` : ''}${e.prefix ? `${e.prefix}+` : ''}${e.row.label}`);
    });
    return { title: `${calloutTitle(c)}${c.label ? ` (${c.inputs.map(shortInput).join(' ')})` : ''}`, lines: lines.length ? lines : ['—'], tone: stateOf(c).tone };
  };
  const exportPng = async () => {
    try { download(`${slug(opt.label)}-${slot}${instance}.png`, await renderPng(await resolveTemplateImage(shownTpl), labelInfo, `${slot.toUpperCase()}${instance} · ${ident.name ?? tpl.name}`)); }
    catch (e) { notify('err', `PNG export failed: ${(e as Error).message}`); }
  };
  const customize = async () => {
    try { setEditing(withLink(cloneTemplate(await resolveTemplateImage(tpl), ident.name ?? `${tpl.name} (copy)`))); }
    catch (e) { notify('err', `Could not load the template picture: ${(e as Error).message}`); }
  };
  const exportJson = async () => {
    try { download(`${slug(tpl.name)}.sc-template.json`, `data:application/json;charset=utf-8,${encodeURIComponent(exportTemplates([await resolveTemplateImage(tpl)]))}`); }
    catch (e) { notify('err', `Template export failed: ${(e as Error).message}`); }
  };

  return (
    <div className="flex min-h-full flex-col gap-3" data-testid="device-view">
      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <label className="flex items-center gap-1.5 text-xs text-slate-400">Device
          <select value={opt.key} onChange={(e) => pickDevice(e.target.value)} data-testid="device-select"
            className="max-w-[22rem] rounded border border-edge bg-panel2 px-2 py-1 text-xs text-slate-200">
            {options.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-xs text-slate-400">Template
          <select value={T.picks[idKey] && T.templates.some((t) => t.id === T.picks[idKey]) ? T.picks[idKey] : ''} onChange={(e) => T.pick(idKey, e.target.value || null)} data-testid="template-select"
            className="max-w-[20rem] rounded border border-edge bg-panel2 px-2 py-1 text-xs text-slate-200">
            <option value="">Automatic ({pickTemplate(T.templates, ident).template.name})</option>
            {templateGroups(T.templates).map((g) => (
              <optgroup key={g.label} label={g.label} data-group={g.label}>
                {g.templates.map((t) => <option key={t.id} value={t.id}>{t.name}{t.slot !== slot ? ` · ${t.slot}` : ''}{maxButton(t) > 32 ? ` · ${maxButton(t)} buttons` : ''}</option>)}
              </optgroup>
            ))}
          </select>
        </label>
        {tpl.builtin
          ? <button type="button" onClick={() => void customize()} data-testid="template-customize" className="rounded border border-edge px-2 py-1 text-xs text-slate-300 hover:border-hud/60">✎ Customize a copy</button>
          : <button type="button" onClick={() => setEditing(structuredClone(tpl))} data-testid="template-edit" className="rounded border border-edge px-2 py-1 text-xs text-slate-300 hover:border-hud/60">✎ Edit template</button>}
        <button type="button" onClick={() => setEditing(withLink(newTemplate(slot, ident.name ?? 'My device')))} data-testid="template-new" className="rounded border border-edge px-2 py-1 text-xs text-slate-300 hover:border-hud/60">＋ New template</button>
        <span className="ml-auto flex flex-wrap gap-1.5">
          <button type="button" onClick={() => importRef.current?.click()} data-testid="template-import" className="rounded border border-edge px-2 py-1 text-xs text-slate-300 hover:border-hud/60">⇪ Import template</button>
          <button type="button" onClick={() => void exportJson()} data-testid="template-export" className="rounded border border-edge px-2 py-1 text-xs text-slate-300 hover:border-hud/60">⇩ Export template</button>
          <button type="button" onClick={exportPng} data-testid="device-png" className="rounded border border-edge px-2 py-1 text-xs text-slate-300 hover:border-hud/60">🖼 PNG</button>
          <button type="button" onClick={() => window.print()} className="rounded border border-edge px-2 py-1 text-xs text-slate-300 hover:border-hud/60">🖨 Print</button>
        </span>
        <input ref={importRef} type="file" accept=".json,application/json" className="hidden" data-testid="template-import-file"
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void importFile(f); }} />
      </div>
      <div className="print:hidden"><ChromiumBanner detected={pads.length} compact /></div>
      <ChromiumButtonNotice templateMax={tplMax} deviceButtons={opt.pad?.buttons} device={ident.name ?? `${slot.toUpperCase()}${instance}`} />
      {unassigned > 0 && (
        <div data-testid="template-unassigned" className="flex flex-wrap items-center gap-2 rounded border border-mod/50 bg-mod/10 px-3 py-1.5 text-[11px] text-slate-200 print:hidden">
          <span><b className="text-mod">{unassigned} input{unassigned === 1 ? '' : 's'} on this picture have no number yet</b> (marked “?”): this device numbers its buttons the way you configured it.
            {tpl.builtin ? <> Customize a copy, select a callout and type its number or press ⦿ and then the control.</> : <> Edit the template, select a callout and type its number or press ⦿ and then the control.</>}</span>
          {tpl.builtin
            ? <button type="button" onClick={() => void customize()} className="rounded border border-mod/60 px-2 py-0.5 font-semibold text-mod hover:bg-mod/20">✎ Assign numbers</button>
            : <button type="button" onClick={() => setEditing(structuredClone(tpl))} className="rounded border border-mod/60 px-2 py-0.5 font-semibold text-mod hover:bg-mod/20">✎ Assign numbers</button>}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500 print:hidden" data-testid="device-status">
        <span>Template <b className="text-slate-300">{tpl.name}</b>: {chosen.how === 'chosen' ? 'picked by you for this device' : chosen.how === 'guessed' ? `guessed: device ${ident.dup!.n} of ${ident.dup!.of} identical ${guessLabel(ident)} (the 1st is taken as the stick, the others as the throttle plugged into the base; pick another template if it is not)` : chosen.how === 'matched' ? `linked to this device (${describeMatch(tpl, ident)})` : 'generic (no template linked to this device yet: customize a copy to place the callouts on your own device)'}</span>
        {tpl.notes && <span className="text-slate-400" data-testid="template-notes">ⓘ {tpl.notes}</span>}
        <span>{opt.pad ? <span className="text-ok">● live: press or move a control and it lights up</span> : 'Connect the device (and press a button) for live highlight.'}</span>
        <Legend />
      </div>
      {groups.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 text-[11px] print:hidden">
          <span className="text-slate-500">Groups:</span>
          {[null, ...groups].map((g) => (
            <button key={g ?? '*'} type="button" onClick={() => setGroup(g)} className={`rounded border px-2 py-0.5 ${group === g ? 'border-hud/60 bg-hud/10 text-hud2' : 'border-edge text-slate-400'}`}>{g ?? 'All'}</button>
          ))}
        </div>
      )}
      {[...swap.groups].map(([g, ids]) => (
        <div key={g} className="flex flex-wrap items-center gap-1 text-[11px] print:hidden" data-testid="swap-views" data-swap={g}>
          <span className="text-slate-500">{g}:</span>
          {ids.map((id) => {
            const v = tpl.views!.find((x) => x.id === id)!;
            return <button key={id} type="button" data-swap-view={id} aria-pressed={swap.current[g] === id} onClick={() => swap.choose({ [g]: id })}
              className={`rounded border px-2 py-0.5 ${swap.current[g] === id ? 'border-hud/60 bg-hud/10 text-hud2' : 'border-edge text-slate-400'}`}>{v.label}</button>;
          })}
          <span className="text-slate-600">switches by itself when you press a control that only the other one has</span>
        </div>
      ))}
      <div className="flex min-h-0 flex-1 gap-3">
        <div ref={canvasRef} className="min-w-0 flex-1 overflow-auto scrollbar-thin" data-print-area>
          <div className="mb-1 hidden font-display text-lg font-bold text-black print:block">{slot.toUpperCase()}{instance} · {ident.name ?? tpl.name}</div>
          <DeviceCanvas template={shownTpl} stateOf={stateOf} selected={selected} onSelect={(id) => setSelected(id)} pulse={pulse}
            renderLabel={(c, s) => <CalloutBody c={c} s={s} entriesFor={(i) => index.get(i) ?? []} live={live} />} />
        </div>
        <aside className="w-80 shrink-0 space-y-3 overflow-y-auto scrollbar-thin print:hidden">
          {selCallout ? (
            <InputPanel key={selCallout.id} c={selCallout} slot={slot} instance={instance} index={index} rows={rows} live={live}
              onEdit={onEdit} onRemove={onRemove} onBind={onBind} onShowInList={onShowInList} onClose={() => setSelected(null)} />
          ) : <p className="rounded border border-edge/60 bg-black/20 p-3 text-xs text-slate-400">Click a callout to see and change what that control does.</p>}
          <section className="rounded border border-edge/60 bg-black/20 p-3" data-testid="device-overflow">
            <h4 className="font-display text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Bound, not on the picture ({overflow.length})</h4>
            {!overflow.length ? <p className="mt-1 text-[11px] text-slate-500">Every bound input of {slot.toUpperCase()}{instance} has a callout.</p> : (
              <ul className="mt-1.5 space-y-1">
                {overflow.map((i) => {
                  const es = index.get(i)!;
                  const tone: Tone = es.some((e) => e.conflict) ? 'conflict' : es.some((e) => e.b.custom) ? 'custom' : 'bound';
                  return (
                    <li key={i}>
                      <button type="button" data-overflow={i} onClick={() => setSelected(`input:${i}`)} className={`w-full rounded border px-2 py-1 text-left text-[11px] hover:border-hud/60 ${live.active.has(i) ? 'border-hud bg-hud/20' : 'border-edge/60'} ${selected === `input:${i}` ? 'ring-1 ring-mod/70' : ''}`}>
                        <span className="font-mono font-bold" style={{ color: TONE_STROKE[tone] === TONE_STROKE.bound ? '#8be9ff' : TONE_STROKE[tone] }}>{shortInput(i)}</span>
                        <span className="ml-2 text-slate-300">{es.map((e) => e.row.label).join(', ')}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </aside>
      </div>
      {editing && createPortal(
        <TemplateEditor initial={editing} describe={describe} device={opt.pad ? { ident, pad: opt.pad } : { ident }} slotInstance={{ slot, instance }}
          entriesFor={(i) => index.get(i) ?? []} onSave={saveTemplate} onCancel={() => setEditing(null)}
          onDelete={T.user.some((t) => t.id === editing.id) ? async () => { await T.remove(editing.id); setEditing(null); notify('ok', `Deleted template “${editing.name}”`); } : undefined}
          notify={notify} />,
        document.body,
      )}
    </div>
  );
}

const guessLabel = (d: DeviceIdentity) => DUP_ORDER_GUESSES.find((g) => g.vendor === (d.vendor ?? '').toUpperCase().padStart(4, '0') && g.product === (d.productId ?? '').toUpperCase().padStart(4, '0'))?.label ?? 'devices';
function describeMatch(t: DeviceTemplate, d: DeviceIdentity) {
  const best = t.match.map((m) => ({ m, s: matchScore({ ...t, match: [m] }, d) })).sort((a, b) => b.s - a.s)[0]?.m;
  if (!best) return 'linked';
  return [best.vendor || best.product ? `USB ${best.vendor ?? '*'}:${best.product ?? '*'}` : '', best.name ? `name “${best.name}”` : '', best.buttons ? `${best.buttons} buttons` : ''].filter(Boolean).join(' + ');
}

function Legend() {
  const item = (c: string, t: string) => <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm" style={{ background: c }} />{t}</span>;
  return <span className="ml-auto flex gap-2">{item('#4fd8ff', 'active')}{item(TONE_STROKE.custom, 'customized')}{item(TONE_STROKE.conflict, 'conflict')}{item(TONE_STROKE.bound, 'default')}{item(TONE_STROKE.unbound, 'unbound')}</span>;
}

function InputPanel({ c, slot, instance, index, rows, live, onEdit, onRemove, onBind, onShowInList, onClose }: {
  c: Callout; slot: 'js' | 'gp'; instance: number; index: Map<string, Entry[]>; rows: Row[]; live: Live;
  onEdit: (row: Row) => void; onRemove: (row: Row, b: Binding) => void; onBind: (row: Row, slot: Slot, instance: number, input: string) => void;
  onShowInList: (spec: string) => void; onClose: () => void;
}) {
  const own = c.inputs.filter(Boolean), missing = c.inputs.length - own.length;
  const inputs = [...own, ...coveredInputs(c).slice(own.length).filter((i) => index.has(i))];
  const [target, setTarget] = useState(own[0] ?? '');
  const [q, setQ] = useState('');
  const results = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (t.length < 2) return [];
    return rows.filter((r) => !r.hidden && `${r.label} ${r.action} ${r.mapLabel}`.toLowerCase().includes(t)).slice(0, 8);
  }, [q, rows]);
  return (
    <section className="rounded border border-hud/40 bg-black/30 p-3 text-xs" data-testid="input-panel">
      <div className="flex items-baseline gap-2">
        <h4 className="font-display text-sm font-bold uppercase tracking-wider text-hud2">{calloutTitle(c)}</h4>
        <span className="font-mono text-[10px] text-slate-500">{slot.toUpperCase()}{instance} · {c.kind}</span>
        <button type="button" onClick={onClose} className="ml-auto text-slate-500 hover:text-slate-200" aria-label="Close">✕</button>
      </div>
      {missing > 0 && <p className="mt-1 text-[11px] text-mod" data-testid="input-panel-unassigned">{missing === c.inputs.length ? 'This control has' : `${missing} of its inputs have`} no button number yet: customize a copy of the template to set {missing === 1 ? 'it' : 'them'}.</p>}
      <ul className="mt-2 space-y-2">
        {inputs.map((i) => {
          const es = index.get(i) ?? [];
          return (
            <li key={i} data-input={i}>
              <div className="flex items-center gap-1.5">
                <code className={`rounded px-1 ${live.active.has(i) ? 'bg-hud text-black' : 'bg-black/40 text-hud/90'}`}>{formatInput(slot, instance, i)}</code>
                <button type="button" onClick={() => onShowInList(searchSpec(slot, instance, i))} className="ml-auto text-[10px] text-hud hover:underline">show in list</button>
              </div>
              {!es.length ? <div className="mt-0.5 text-[11px] text-slate-600">not bound</div> : (
                <ul className="mt-1 space-y-0.5">
                  {es.map((e, k) => (
                    <li key={k} className="flex items-center gap-1.5 rounded bg-white/[0.03] px-1.5 py-1">
                      <span className="min-w-0 flex-1">
                        <span className={`block truncate ${e.conflict ? 'text-alert' : e.b.custom ? 'text-mod' : 'text-slate-200'}`}>{e.conflict && '⚠ '}{e.prefix && <span className="font-mono text-[10px] text-hud/70">{e.prefix}+ </span>}{e.row.label}</span>
                        <span className="block truncate text-[10px] text-slate-500">{e.row.mapLabel}{e.b.mode ? ` · ${e.b.mode}` : ''}{e.b.custom ? ' · customized' : ''}</span>
                      </span>
                      <button type="button" onClick={() => onEdit(e.row)} className="rounded border border-edge px-1.5 text-[10px] text-slate-300 hover:border-hud/60">Edit</button>
                      <button type="button" onClick={() => onRemove(e.row, e.b)} title="Unbind" aria-label={`Unbind ${e.row.label}`} className="rounded border border-edge px-1.5 text-[10px] text-slate-400 hover:border-alert hover:text-alert">✕</button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
      {own.length > 0 && <div className="mt-3 border-t border-edge/50 pt-2">
        <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
          Bind an action to
          {own.length > 1 ? (
            <select value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Input to bind" className="rounded border border-edge bg-panel2 px-1 py-0.5 font-mono text-[11px] text-slate-200">
              {own.map((i) => <option key={i} value={i}>{i}</option>)}
            </select>
          ) : <code className="text-hud/90">{target}</code>}
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="search actions…" aria-label="Search actions to bind"
          className="mt-1 w-full rounded border border-edge bg-panel2 px-2 py-1 text-xs text-slate-200 placeholder:text-slate-600" />
        {results.length > 0 && (
          <ul className="mt-1 space-y-0.5" data-testid="bind-results">
            {results.map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => { onBind(r, slot, instance, target); setQ(''); }} className="w-full truncate rounded px-1.5 py-1 text-left hover:bg-hud/10">
                  <span className="text-slate-200">{r.label}</span> <span className="text-[10px] text-slate-500">{r.mapLabel}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>}
    </section>
  );
}

/** the device picture(s) with the callouts and bound actions as a PNG data URL (2000 px wide; multi-view templates side by side) */
async function renderPng(t: DeviceTemplate, info: (c: Callout) => { title: string; lines: string[]; tone: Tone }, heading: string): Promise<string> {
  const views = templateViews(t), multi = !!t.views?.length;
  const sum = views.reduce((n, v) => n + v.width / v.height, 0);
  const W = 2000, top = 80, IH = Math.round(W / sum), H = IH + top;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const g = cv.getContext('2d')!;
  g.fillStyle = '#04070c'; g.fillRect(0, 0, W, H);
  g.fillStyle = '#8be9ff'; g.font = 'bold 36px sans-serif'; g.fillText(heading, 30, 54);
  // each view: its x offset and width on the sheet
  const frame = new Map<string, { x: number; w: number }>();
  let x0 = 0;
  for (const v of views) { const w = (W * v.width) / v.height / sum; frame.set(v.id, { x: x0, w }); x0 += w; }
  for (const v of views) {
    const f = frame.get(v.id)!;
    if (!v.image) continue;
    const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('image')); i.src = imageSrc(v.image!); });
    if (!multi) { g.drawImage(img, f.x, top, f.w, IH); continue; }
    const k = Math.min(f.w / img.naturalWidth, IH / img.naturalHeight), iw = img.naturalWidth * k, ih = img.naturalHeight * k; // aspect kept, centred
    g.drawImage(img, f.x + (f.w - iw) / 2, top + (IH - ih) / 2, iw, ih);
    if (views.length > 1 && v.label) { g.fillStyle = '#4fd8ff'; g.font = 'bold 22px sans-serif'; g.fillText(v.label.toUpperCase(), f.x + 16, top + 30); }
  }
  const P = (c: Callout, p: { x: number; y: number }) => { const f = frame.get(calloutView(t, c))!; return [f.x + p.x * f.w, top + p.y * IH] as const; };
  for (const c of t.callouts) {
    const col = TONE_STROKE[info(c).tone];
    const [ax, ay] = P(c, c.anchor), [bx, by] = P(c, c.box);
    g.strokeStyle = col; g.lineWidth = 3; g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx, by); g.stroke();
    g.fillStyle = col; g.beginPath(); g.arc(ax, ay, 8, 0, Math.PI * 2); g.fill();
  }
  const fit = (s: string, max: number) => { let x = s; while (x.length > 1 && g.measureText(x).width > max) x = x.slice(0, -2) + '…'; return x; };
  for (const c of t.callouts) {
    const { title, lines, tone } = info(c);
    const shown = lines.slice(0, 5);
    g.font = '22px sans-serif';
    const wTxt = Math.min(360, Math.max(...shown.map((l) => g.measureText(l).width), (g.font = 'bold 24px monospace', g.measureText(title).width)));
    const bw = wTxt + 24, bh = 36 + shown.length * 26;
    const [bx, by] = P(c, c.box);
    const x = Math.min(W - bw - 4, Math.max(4, bx - bw / 2)), y = Math.min(H - bh - 4, Math.max(top, by - bh / 2));
    g.fillStyle = 'rgba(8,17,29,0.96)'; g.strokeStyle = TONE_STROKE[tone]; g.lineWidth = 2;
    g.beginPath(); if (g.roundRect) g.roundRect(x, y, bw, bh, 8); else g.rect(x, y, bw, bh); g.fill(); g.stroke();
    g.fillStyle = '#8be9ff'; g.font = 'bold 24px monospace'; g.fillText(fit(title, 360), x + 12, y + 28);
    g.font = '22px sans-serif';
    shown.forEach((l, k) => { g.fillStyle = tone === 'conflict' ? '#ff8da1' : tone === 'custom' ? '#ffcb7d' : '#cfe6f5'; g.fillText(fit(l, 360), x + 12, y + 56 + k * 26); });
  }
  return cv.toDataURL('image/png');
}
