import { useCallback, useEffect, useRef, useState } from 'react';
import { GP_AXES, GP_BUTTONS, JS_AXES } from '../lib/capture';
import { padLabel, type PadInfo, type PadLike } from '../lib/devices';
import { usePadHits, type PressHit } from '../lib/listen';
import {
  BLANK_ASPECT, CALLOUT_KINDS, HAT_DIRS, calloutFor, calloutTitle, coveredInputs, exportTemplates, freeBoxSpot, hatInputs, inputRole, inputsForKind,
  calloutView, loadImageFile, matchFor, matchScore, shortInput, templateViews, uid, usedInputs, viewTemplate, type Callout, type CalloutKind, type DeviceIdentity, type DeviceTemplate, type Pt,
} from '../lib/templates';
import { CalloutBody, DeviceCanvas, useLiveInputs, type CalloutState, type Entry } from './DeviceCanvas';
import { Ico } from './icons';

interface Props {
  initial: DeviceTemplate;
  describe: (l: readonly PadLike[]) => PadInfo[];
  /** the device picked in the Devices view (for "link to this device", press-to-place and live highlight) */
  device: { ident: DeviceIdentity; pad?: PadInfo };
  slotInstance: { slot: 'js' | 'gp'; instance: number };
  entriesFor: (input: string) => Entry[];
  onSave: (t: DeviceTemplate) => void;
  onCancel: () => void;
  onDelete?: () => void;
  notify: (kind: 'ok' | 'err', text: string) => void;
}
const INPUT_RE = /^[a-z][a-z0-9_]{0,24}$/;
/** typed input name: a bare number means that button ("7" -> button7) */
const numIn = (v: string) => { const t = v.trim().toLowerCase(); return /^\d{1,3}$/.test(t) && Number(t) > 0 ? `button${Number(t)}` : t; };
const field = 'min-w-0 rounded border border-edge bg-panel2 px-1.5 py-0.5 text-xs text-slate-200';

/** create / edit a device template: image, callouts (click or press to place, drag anchor and label), device link, export */
export function TemplateEditor({ initial, describe, device, slotInstance, entriesFor, onSave, onCancel, onDelete, notify }: Props) {
  const [t, setT] = useState<DeviceTemplate>(initial);
  const histRef = useRef<DeviceTemplate[]>([]);
  const [histLen, setHistLen] = useState(0);
  const [sel, setSel] = useState<string | null>(null);
  const [placeKind, setPlaceKind] = useState<CalloutKind>('button');
  const [clickPlace, setClickPlace] = useState(true);
  const [pressPlace, setPressPlace] = useState(false);
  const [pressTarget, setPressTarget] = useState<{ id: string; idx: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const tRef = useRef(t);
  useEffect(() => { tRef.current = t; }, [t]);
  const live = useLiveInputs(device.pad);
  // multi-view templates: the view shown (tabs); new callouts go on it. Single-view templates have no tabs.
  const multi = !!t.views?.length;
  const [viewSel, setViewSel] = useState<string>(() => templateViews(initial)[0].id);
  const activeView = multi && t.views!.some((v) => v.id === viewSel) ? viewSel : templateViews(t)[0].id;
  const viewRef = useRef(activeView);
  useEffect(() => { viewRef.current = activeView; }, [activeView]);

  const pushHist = useCallback(() => { histRef.current = [...histRef.current.slice(-99), tRef.current]; setHistLen(histRef.current.length); }, []);
  const commit = useCallback((next: DeviceTemplate) => { pushHist(); tRef.current = next; setT(next); }, [pushHist]);
  const undo = useCallback(() => {
    const h = histRef.current;
    if (!h.length) return;
    const prev = h[h.length - 1];
    histRef.current = h.slice(0, -1);
    setHistLen(histRef.current.length);
    tRef.current = prev; setT(prev);
    setSel((s) => (s && prev.callouts.some((c) => c.id === s) ? s : null));
  }, []);
  const patchCallout = (id: string, p: Partial<Callout>) => commit({ ...tRef.current, callouts: tRef.current.callouts.map((c) => (c.id === id ? { ...c, ...p } : c)) });
  const removeCallout = useCallback((id: string) => { commit({ ...tRef.current, callouts: tRef.current.callouts.filter((c) => c.id !== id) }); setSel(null); }, [commit]);
  const addCallout = useCallback((kind: CalloutKind, inputs: string[], anchor: Pt) => {
    const cur = tRef.current;
    const onView = cur.views?.length ? viewRef.current : undefined;
    const c: Callout = { id: uid(), kind, inputs, anchor, box: freeBoxSpot(onView ? viewTemplate(cur, onView) : cur, anchor), ...(onView ? { view: onView } : {}) };
    commit({ ...cur, callouts: [...cur.callouts, c] });
    setSel(c.id);
    return c;
  }, [commit]);

  // keyboard: Ctrl+Z undo, Delete removes the selected callout (captured before the app's own shortcuts)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const typing = tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA';
      if (e.key.toLowerCase() === 'z' && (e.ctrlKey || e.metaKey) && !typing) { e.preventDefault(); e.stopImmediatePropagation(); undo(); }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && !typing && sel) { e.preventDefault(); e.stopImmediatePropagation(); removeCallout(sel); }
      else if (e.key === 'Escape') { e.stopImmediatePropagation(); if (pressTarget) setPressTarget(null); else if (pressPlace) setPressPlace(false); else setSel(null); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [undo, removeCallout, sel, pressTarget, pressPlace]);

  // press to place / press to assign an input
  const onHit = useCallback((h: PressHit) => {
    const cur = tRef.current;
    if (h.slot !== cur.slot) { notify('err', `That was a ${h.slot === 'gp' ? 'gamepad' : 'joystick'} input; this template is for a ${cur.slot === 'gp' ? 'gamepad' : 'joystick'}.`); return; }
    if (device.pad && h.instance !== slotInstance.instance) { notify('err', `That press came from ${h.slot.toUpperCase()}${h.instance}${h.device ? ` (${h.device})` : ''}; this editor listens to ${slotInstance.slot.toUpperCase()}${slotInstance.instance}.`); return; }
    const input = h.inputs[0];
    if (pressTarget) {
      const c = cur.callouts.find((x) => x.id === pressTarget.id);
      if (c) {
        const next = c.kind === 'hat' && /^hat\d_/.test(input) && pressTarget.idx < 4 ? calloutFor(input).inputs.concat(c.inputs.slice(4)) : c.inputs.map((x, i) => (i === pressTarget.idx ? input : x));
        patchCallout(c.id, { inputs: next });
      }
      setPressTarget(null);
      return;
    }
    const existing = cur.callouts.find((c) => coveredInputs(c).includes(input));
    if (existing) { setSel(existing.id); notify('ok', `${shortInput(input)} is already on the template (${calloutTitle(existing)}): drag it into place.`); return; }
    const { kind, inputs } = calloutFor(input);
    const n = cur.callouts.length;
    addCallout(kind, inputs, { x: 0.42 + (n % 5) * 0.04, y: 0.42 + (Math.floor(n / 5) % 5) * 0.04 });
  }, [device.pad, slotInstance, pressTarget, notify, addCallout]); // eslint-disable-line react-hooks/exhaustive-deps
  usePadHits(pressPlace || !!pressTarget, describe, onHit);

  const setImage = async (f: File) => {
    setBusy(true);
    try {
      const img = await loadImageFile(f);
      const cur = tRef.current;
      if (cur.views?.length) { // multi-view: replaces the picture of the shown view (canvas widened for the label columns, as the built-ins)
        const views = cur.views.map((v) => (v.id === viewRef.current ? { ...v, image: img.dataUrl, width: Math.round(img.w + 0.68 * img.h), height: img.h } : v));
        commit({ ...cur, views, aspect: views[0].width / views[0].height });
        notify('ok', `Image loaded (${img.w}×${img.h}, ${(img.dataUrl.length / 1024).toFixed(0)} KB stored)`);
        setBusy(false);
        return;
      }
      commit({ ...tRef.current, image: img.dataUrl, aspect: img.w / img.h, callouts: tRef.current.callouts.map(({ region: _r, inputRegions: _ir, ...c }) => c) });
      notify('ok', `Image loaded (${img.w}×${img.h}, ${(img.dataUrl.length / 1024).toFixed(0)} KB stored)`);
    } catch (e) { notify('err', (e as Error).message); }
    setBusy(false);
  };
  const selC = t.callouts.find((c) => c.id === sel);
  const selView = selC && multi ? calloutView(t, selC) : null;
  // selecting a callout (e.g. by pressing its control) shows its view (state adjusted while rendering, not in an effect)
  const [seenSelView, setSeenSelView] = useState(selView);
  if (selView !== seenSelView) { setSeenSelView(selView); if (selView) setViewSel(selView); }
  const groups = [...new Set(t.callouts.map((c) => c.group).filter(Boolean))] as string[];
  const stateOf = (c: Callout): CalloutState => {
    const es = coveredInputs(c).flatMap(entriesFor);
    return { tone: es.some((e) => e.conflict) ? 'conflict' : es.some((e) => e.b.custom) ? 'custom' : es.length ? 'bound' : 'unbound', active: coveredInputs(c).some((i) => live.active.has(i)), ...(c.inputRegions ? { inputActive: c.inputs.map((i) => live.active.has(i)) } : {}) };
  };
  const canSave = t.name.trim().length > 0;
  const linked = matchScore(t, device.ident) > 0;
  const devName = device.pad ? padLabel(device.pad) : device.ident.name;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-void/95 backdrop-blur" data-testid="template-editor"
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
      onDrop={(e) => { e.preventDefault(); e.stopPropagation(); const f = e.dataTransfer.files?.[0]; if (f) void setImage(f); }}>
      <div className="flex flex-wrap items-center gap-2 border-b border-edge bg-panel/90 px-4 py-2">
        <span className="font-display text-sm font-bold uppercase tracking-[0.2em] text-mod"><Ico name="edit" /> Device template</span>
        <input value={t.name} onChange={(e) => { const next = { ...tRef.current, name: e.target.value }; tRef.current = next; setT(next); }} aria-label="Template name" className={`${field} w-56`} />
        <select value={t.slot} onChange={(e) => commit({ ...t, slot: e.target.value as 'js' | 'gp' })} aria-label="Device type" className={field}>
          <option value="js">Joystick / HOTAS</option><option value="gp">Gamepad</option>
        </select>
        <button type="button" disabled={busy} onClick={() => fileRef.current?.click()} data-testid="tpl-upload" className="rounded border border-edge px-2 py-1 text-xs text-slate-300 hover:border-hud/60"><Ico name="image" /> {t.image || t.views?.find((v) => v.id === activeView)?.image ? 'Replace image' : 'Upload image'}</button>
        {t.image && !multi && <button type="button" onClick={() => commit({ ...t, image: undefined, aspect: BLANK_ASPECT, callouts: t.callouts.map(({ region: _r, inputRegions: _ir, ...c }) => c) })} className="rounded border border-edge px-2 py-1 text-xs text-slate-300 hover:border-hud/60">Blank canvas</button>}
        {!t.image && !multi && (
          <label className="flex items-center gap-1 text-[11px] text-slate-400">Canvas
            <select value={String(t.aspect)} onChange={(e) => commit({ ...t, aspect: Number(e.target.value) })} aria-label="Canvas shape" className={field}>
              {[[BLANK_ASPECT, 'wide 16:10'], [4 / 3, '4:3'], [1, 'square'], [0.75, 'tall 3:4']].map(([v, l]) => <option key={String(v)} value={String(v)}>{l}</option>)}
            </select>
          </label>
        )}
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif" className="hidden" data-testid="tpl-upload-file"
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void setImage(f); }} />
        <span className="ml-auto flex flex-wrap items-center gap-1.5">
          <button type="button" onClick={undo} disabled={!histLen} title="Undo (Ctrl+Z)" data-testid="tpl-undo" className="rounded border border-edge px-2 py-1 text-xs text-slate-300 hover:border-hud/60 disabled:opacity-40"><Ico name="undo" /> Undo{histLen ? ` (${histLen})` : ''}</button>
          <button type="button" onClick={() => { const a = document.createElement('a'); a.href = `data:application/json;charset=utf-8,${encodeURIComponent(exportTemplates([t]))}`; a.download = `${t.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'device'}.sc-template.json`; document.body.appendChild(a); a.click(); a.remove(); }}
            className="rounded border border-edge px-2 py-1 text-xs text-slate-300 hover:border-hud/60"><Ico name="export" /> Export JSON</button>
          {onDelete && <button type="button" onClick={() => { if (confirm(`Delete the template “${t.name}”?`)) onDelete(); }} className="rounded border border-edge px-2 py-1 text-xs text-slate-400 hover:border-alert hover:text-alert">Delete template</button>}
          <button type="button" onClick={onCancel} className="rounded border border-edge px-2 py-1 text-xs text-slate-300 hover:border-hud/60">Cancel</button>
          <button type="button" disabled={!canSave} onClick={() => onSave({ ...t, name: t.name.trim() })} data-testid="tpl-save" className="rounded border border-ok/60 bg-ok/10 px-3 py-1 text-xs font-semibold text-ok hover:bg-ok/20 disabled:opacity-40">Save</button>
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-b border-edge/60 bg-black/30 px-4 py-1.5 text-[11px] text-slate-400">
        <label className="flex items-center gap-1"><input type="checkbox" checked={clickPlace} onChange={(e) => setClickPlace(e.target.checked)} /> Click the picture to add a</label>
        <select value={placeKind} onChange={(e) => setPlaceKind(e.target.value as CalloutKind)} aria-label="New callout type" className={field}>
          {CALLOUT_KINDS.map((k) => <option key={k.kind} value={k.kind}>{k.label}</option>)}
        </select>
        <button type="button" onClick={() => { setPressPlace((v) => !v); setPressTarget(null); }} aria-pressed={pressPlace} data-testid="tpl-press"
          className={`rounded border px-2 py-1 ${pressPlace ? 'border-mod bg-mod/15 text-mod' : 'border-edge text-slate-300 hover:border-hud/60'}`}>
          <Ico name="target" /> {pressPlace ? `Listening on ${slotInstance.slot.toUpperCase()}${slotInstance.instance}: press controls to add them (Esc stops)` : 'Press to place'}
        </button>
        <span className="text-slate-500">Drag an anchor dot onto the control and the label where it should go · Delete removes · Ctrl+Z undoes</span>
        {!device.pad && <span className="text-mod">Connect the device for press-to-place and live highlight.</span>}
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 overflow-auto p-4 scrollbar-thin">
          {multi && (
            <div role="tablist" aria-label="Views" data-testid="tpl-views" className="mb-2 flex flex-wrap gap-1">
              {t.views!.map((v) => (
                <button key={v.id} type="button" role="tab" aria-selected={v.id === activeView} data-view-tab={v.id} onClick={() => { setViewSel(v.id); if (selC && calloutView(t, selC) !== v.id) setSel(null); }}
                  className={`rounded border px-2.5 py-1 text-xs ${v.id === activeView ? 'border-hud/60 bg-hud/10 text-hud2' : 'border-edge text-slate-400 hover:border-hud/40'}`}>
                  {v.label || v.id} <span className="text-slate-500">({t.callouts.filter((c) => calloutView(t, c) === v.id).length})</span>
                </button>
              ))}
            </div>
          )}
          <DeviceCanvas template={t} view={multi ? activeView : undefined} editable stateOf={stateOf} selected={sel} onSelect={setSel}
            onDragStart={pushHist}
            onMove={(id, part, p) => {
              // labels stay (mostly) inside the canvas; anchors can go anywhere on it
              const q = part === 'box' ? { x: Math.min(0.94, Math.max(0.06, p.x)), y: Math.min(0.97, Math.max(0.03, p.y)) } : p;
              const cur = tRef.current;
              const next = { ...cur, callouts: cur.callouts.map((c) => (c.id === id ? { ...c, [part]: q } : c)) };
              tRef.current = next; setT(next);
            }}
            onCanvasClick={clickPlace ? (p) => addCallout(placeKind, inputsForKind(placeKind, [], tRef.current.slot, usedInputs(tRef.current)), p) : undefined}
            renderLabel={(c, s) => <CalloutBody c={c} s={s} entriesFor={entriesFor} live={live} />} />
          {!t.callouts.length && <p className="mt-2 text-xs text-slate-500">No callouts yet: click on the picture, or use “Press to place” and press each control of your device.</p>}
        </div>
        <aside className="w-80 shrink-0 space-y-3 overflow-y-auto border-l border-edge bg-panel/60 p-3 text-xs scrollbar-thin">
          {selC ? (
            <section className="space-y-2 rounded border border-mod/40 bg-black/30 p-2.5" data-testid="callout-props">
              <div className="flex items-center gap-2">
                <b className="font-mono text-hud2">{calloutTitle(selC)}</b>
                <button type="button" onClick={() => { const cur = tRef.current; const c = { ...structuredClone(selC), id: uid(), anchor: { x: Math.min(1, selC.anchor.x + 0.03), y: Math.min(1, selC.anchor.y + 0.03) }, box: freeBoxSpot(viewTemplate(cur, calloutView(cur, selC)), selC.anchor) }; commit({ ...cur, callouts: [...cur.callouts, c] }); setSel(c.id); }} className="ml-auto rounded border border-edge px-1.5 text-[10px] text-slate-300 hover:border-hud/60">Duplicate</button>
                <button type="button" onClick={() => removeCallout(selC.id)} data-testid="callout-delete" className="rounded border border-edge px-1.5 text-[10px] text-slate-400 hover:border-alert hover:text-alert">Delete</button>
              </div>
              <label className="flex items-center gap-2">Type
                <select value={selC.kind} onChange={(e) => { const k = e.target.value as CalloutKind; const used = usedInputs({ callouts: t.callouts.filter((c) => c.id !== selC.id) }); patchCallout(selC.id, { kind: k, inputs: inputsForKind(k, selC.inputs, t.slot, used) }); }} aria-label="Callout type" className={field}>
                  {CALLOUT_KINDS.map((k) => <option key={k.kind} value={k.kind} title={k.hint}>{k.label}</option>)}
                </select>
              </label>
              {multi && (
                <label className="flex items-center gap-2">View
                  <select value={calloutView(t, selC)} onChange={(e) => patchCallout(selC.id, { view: e.target.value })} aria-label="Callout view" className={field}>
                    {t.views!.map((v) => <option key={v.id} value={v.id}>{v.label || v.id}</option>)}
                  </select>
                </label>
              )}
              <InputsEditor c={selC} slot={t.slot} pressTarget={pressTarget} setPressTarget={setPressTarget} canPress={!!device.pad} onChange={(inputs) => patchCallout(selC.id, { inputs })} />
              <label className="flex items-center gap-2">Name
                <input value={selC.label ?? ''} placeholder={calloutTitle({ ...selC, label: undefined })} aria-label="Callout name"
                  onChange={(e) => patchCallout(selC.id, { label: e.target.value || undefined })} className={`${field} flex-1`} />
              </label>
              <label className="flex items-center gap-2">Group
                <input value={selC.group ?? ''} list="tpl-groups" placeholder="e.g. Grip, Base" aria-label="Callout group"
                  onChange={(e) => patchCallout(selC.id, { group: e.target.value || undefined })} className={`${field} flex-1`} />
              </label>
              <datalist id="tpl-groups">{groups.map((g) => <option key={g} value={g} />)}</datalist>
            </section>
          ) : <p className="rounded border border-edge/60 bg-black/20 p-2.5 text-slate-400">Select a callout to change its type, inputs, name and group.</p>}
          <section className="space-y-1.5 rounded border border-edge/60 bg-black/20 p-2.5" data-testid="tpl-link">
            <h4 className="font-display text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Applies automatically to</h4>
            {!t.match.length && <p className="text-[11px] text-slate-500">No device linked: pick it by hand in the Devices view, or link it here.</p>}
            {t.match.map((m, i) => (
              <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-1 rounded bg-white/[0.03] p-1.5">
                <input value={m.vendor ?? ''} placeholder="vendor id" aria-label={`Rule ${i + 1} vendor id`} onChange={(e) => commit({ ...t, match: t.match.map((x, j) => (j === i ? { ...x, vendor: e.target.value.trim() || undefined } : x)) })} className={`${field} font-mono`} />
                <input value={m.product ?? ''} placeholder="product id" aria-label={`Rule ${i + 1} product id`} onChange={(e) => commit({ ...t, match: t.match.map((x, j) => (j === i ? { ...x, product: e.target.value.trim() || undefined } : x)) })} className={`${field} font-mono`} />
                <button type="button" onClick={() => commit({ ...t, match: t.match.filter((_, j) => j !== i) })} aria-label={`Remove rule ${i + 1}`} className="px-1 text-slate-500 hover:text-alert"><Ico name="close" /></button>
                <input value={m.name ?? ''} placeholder="name contains" aria-label={`Rule ${i + 1} name`} onChange={(e) => commit({ ...t, match: t.match.map((x, j) => (j === i ? { ...x, name: e.target.value || undefined } : x)) })} className={`${field} col-span-2`} />
                <span />
                <input value={m.buttons ?? ''} placeholder="button count (optional)" inputMode="numeric" aria-label={`Rule ${i + 1} buttons`} onChange={(e) => commit({ ...t, match: t.match.map((x, j) => (j === i ? { ...x, buttons: Number(e.target.value) || undefined } : x)) })} className={`${field} col-span-2`} />
              </div>
            ))}
            {(device.ident.vendor || device.ident.name) && (
              <div className="flex flex-wrap gap-1">
                <button type="button" onClick={() => commit({ ...t, slot: slotInstance.slot, match: [...t.match, matchFor(device.ident, false)] })} data-testid="tpl-link-device" className="rounded border border-edge px-1.5 py-0.5 text-[11px] text-slate-300 hover:border-hud/60"><Ico name="plus" /> Link to {devName}</button>
                {device.ident.buttons && <button type="button" onClick={() => commit({ ...t, slot: slotInstance.slot, match: [...t.match, matchFor(device.ident, true)] })} title="Use this when several devices share one USB id (e.g. two MOZA bases with 128 and 133 buttons)" className="rounded border border-edge px-1.5 py-0.5 text-[11px] text-slate-300 hover:border-hud/60"><Ico name="plus" /> only with {device.ident.buttons} buttons</button>}
              </div>
            )}
            <p className={`text-[10px] ${linked ? 'text-ok' : 'text-slate-500'}`}>{linked ? `matches ${devName ?? 'the selected device'}` : `does not match ${devName ?? 'the selected device'}${device.ident.vendor ? ` (USB ${device.ident.vendor}:${device.ident.productId}${device.ident.buttons ? `, ${device.ident.buttons} buttons` : ''})` : ''}`}</p>
          </section>
          <section className="rounded border border-edge/60 bg-black/20 p-2.5">
            <h4 className="font-display text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Callouts ({t.callouts.length})</h4>
            <ul className="mt-1 max-h-72 space-y-0.5 overflow-y-auto scrollbar-thin" data-testid="tpl-callouts">
              {t.callouts.map((c) => (
                <li key={c.id}>
                  <button type="button" onClick={() => setSel(c.id)} className={`flex w-full items-center gap-2 rounded px-1.5 py-0.5 text-left ${sel === c.id ? 'bg-mod/15 text-mod' : 'hover:bg-white/5'}`}>
                    <span className="font-mono">{calloutTitle(c)}</span>
                    <span className="truncate text-[10px] text-slate-500">{c.kind}{c.group ? ` · ${c.group}` : ''} · {c.inputs.map(shortInput).join(' ')}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </div>
  );
}

function InputsEditor({ c, slot, pressTarget, setPressTarget, canPress, onChange }: {
  c: Callout; slot: 'js' | 'gp'; pressTarget: { id: string; idx: number } | null; setPressTarget: (p: { id: string; idx: number } | null) => void; canPress: boolean;
  onChange: (inputs: string[]) => void;
}) {
  const axes = slot === 'gp' ? [...GP_AXES, 'triggerl', 'triggerr'] : JS_AXES;
  const set = (i: number, v: string) => onChange(c.inputs.map((x, j) => (j === i ? v : x)));
  const pressBtn = (i: number) => canPress && (
    <button type="button" onClick={() => setPressTarget(pressTarget?.id === c.id && pressTarget.idx === i ? null : { id: c.id, idx: i })} title="Press the control on the device to set this input"
      className={`rounded border px-1 text-[10px] ${pressTarget?.id === c.id && pressTarget.idx === i ? 'border-mod bg-mod/20 text-mod' : 'border-edge text-slate-400 hover:border-hud/60'}`}>
      {pressTarget?.id === c.id && pressTarget.idx === i ? 'press…' : <Ico name="press" />}
    </button>
  );
  if (c.kind === 'hat') {
    const n = Number(/^hat(\d)_/.exec(c.inputs[0] ?? '')?.[1] ?? 0);
    const dpad = /^dpad_/.test(c.inputs[0] ?? '');
    // a joystick hat is either a POV hat (hatN_up...) or four buttons (many grips report their 4-way hats as buttons)
    const asButtons = slot === 'js' && !n;
    return (
      <div className="space-y-1">
        {slot === 'js' && (
          <label className="flex items-center gap-2">Reports as
            <select value={asButtons ? 'b' : String(n)} aria-label="Hat number"
              onChange={(e) => onChange(e.target.value === 'b' ? ['', '', '', '', ...c.inputs.slice(4)] : [...hatInputs(Number(e.target.value)), ...c.inputs.slice(4)])} className={field}>
              {[1, 2, 3, 4].map((k) => <option key={k} value={k}>POV hat {k}</option>)}
              <option value="b">4 buttons</option>
            </select>
            {!asButtons && pressBtn(0)}
          </label>
        )}
        {asButtons ? HAT_DIRS.map((d, k) => (
          <label key={d} className="flex items-center gap-2"><span className="w-28 shrink-0">{inputRole(c, k)} {d}</span>
            <input defaultValue={c.inputs[k] ?? ''} key={`${c.id}:${k}:${c.inputs[k]}`} placeholder="not set, e.g. button7" aria-label={`Hat ${d} input`}
              onBlur={(e) => { const v = numIn(e.target.value); if (v === '' || INPUT_RE.test(v)) { if (v !== (c.inputs[k] ?? '')) onChange(HAT_DIRS.map((_, j) => (j === k ? v : c.inputs[j] ?? '')).concat(c.inputs.slice(4))); } else e.target.value = c.inputs[k] ?? ''; }}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} className={`${field} min-w-0 flex-1 font-mono`} />
            {pressBtn(k)}
          </label>
        )) : !dpad && <div className="font-mono text-[10px] text-slate-500">{c.inputs.slice(0, 4).map((i, k) => `${inputRole(c, k)} ${i}`).join('  ')}</div>}
        {dpad && <div className="font-mono text-[10px] text-slate-500">{c.inputs.slice(0, 4).map((i, k) => `${inputRole(c, k)} ${i}`).join('  ')}</div>}
        <label className="flex items-center gap-2">Push button
          <input value={c.inputs[4] ?? ''} placeholder="optional, e.g. button5" aria-label="Hat push button"
            onChange={(e) => { const v = e.target.value.trim().toLowerCase(); onChange(v && INPUT_RE.test(v) ? [...c.inputs.slice(0, 4), v] : c.inputs.slice(0, 4)); }} className={`${field} min-w-0 flex-1 font-mono`} />
          {c.inputs[4] !== undefined && pressBtn(4)}
        </label>
      </div>
    );
  }
  if (c.kind === 'axis') {
    return (
      <div className="space-y-1">
        {c.inputs.map((a, i) => (
          <label key={i} className="flex items-center gap-2">{c.inputs.length > 1 ? (i ? 'Axis 2' : 'Axis 1') : 'Axis'}
            <select value={a} onChange={(e) => set(i, e.target.value)} aria-label={`Axis ${i + 1}`} className={`${field} font-mono`}>
              {[...new Set([a, ...axes])].map((x) => <option key={x} value={x}>{x || '— not set —'}</option>)}
            </select>
            {pressBtn(i)}
            {i > 0 && <button type="button" onClick={() => onChange(c.inputs.slice(0, 1))} className="text-slate-500 hover:text-alert" aria-label="Remove second axis"><Ico name="close" /></button>}
          </label>
        ))}
        {c.inputs.length < 2 && <button type="button" onClick={() => onChange([...c.inputs, axes.find((x) => !c.inputs.includes(x)) ?? axes[0]])} className="text-[11px] text-hud hover:underline"><Ico name="plus" /> second axis (mini-stick)</button>}
      </div>
    );
  }
  const labels = c.kind === 'encoder' ? ['Clockwise', 'Counter-clockwise', 'Push'] : c.kind === 'switch' ? c.inputs.map((_, i) => `Position ${i + 1}`) : c.kind === 'buttons' ? c.inputs.map((_, i) => `Button ${i + 1}`) : ['Input'];
  return (
    <div className="space-y-1">
      {c.inputs.map((x, i) => (
        <label key={i} className="flex items-center gap-2"><span className="w-28 shrink-0">{labels[i] ?? `Input ${i + 1}`}</span>
          <input defaultValue={x} key={`${c.id}:${i}:${x}`} list={slot === 'gp' ? 'tpl-gp-buttons' : undefined} aria-label={`${labels[i] ?? `Input ${i + 1}`} input`} placeholder="not set, e.g. button5"
            onBlur={(e) => { const v = numIn(e.target.value); if (v !== x && (v === '' || INPUT_RE.test(v))) set(i, v); else e.target.value = x; }}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} className={`${field} min-w-0 flex-1 font-mono`} />
          {pressBtn(i)}
          {c.kind === 'encoder' && i === 2 && <button type="button" onClick={() => onChange(c.inputs.slice(0, 2))} className="text-slate-500 hover:text-alert" aria-label="Remove push"><Ico name="close" /></button>}
          {(c.kind === 'switch' || c.kind === 'buttons') && c.inputs.length > 2 && <button type="button" onClick={() => onChange(c.inputs.filter((_, j) => j !== i))} className="text-slate-500 hover:text-alert" aria-label={`Remove ${c.kind === 'buttons' ? 'button' : 'position'} ${i + 1}`}><Ico name="close" /></button>}
        </label>
      ))}
      {(c.kind === 'switch' || c.kind === 'buttons') && c.inputs.length < 8 && <button type="button" onClick={() => { const n = Math.max(0, ...c.inputs.map((x) => Number(/^button(\d+)$/.exec(x)?.[1] ?? 0))); onChange([...c.inputs, slot === 'gp' ? GP_BUTTONS[0] : `button${n + 1}`]); }} className="text-[11px] text-hud hover:underline"><Ico name="plus" /> {c.kind === 'buttons' ? 'button' : 'position'}</button>}
      {c.kind === 'encoder' && c.inputs.length === 2 && <button type="button" onClick={() => { const n = Math.max(0, ...c.inputs.map((x) => Number(/^button(\d+)$/.exec(x)?.[1] ?? 0))); onChange([...c.inputs, slot === 'gp' ? GP_BUTTONS[0] : `button${n + 1}`]); }} className="text-[11px] text-hud hover:underline"><Ico name="plus" /> push</button>}
      {slot === 'gp' && <datalist id="tpl-gp-buttons">{GP_BUTTONS.map((b) => <option key={b} value={b} />)}</datalist>}
    </div>
  );
}
