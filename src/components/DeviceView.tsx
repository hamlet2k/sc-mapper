import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ChromiumBanner, ChromiumButtonNotice } from './ChromiumBanner';
import { createPortal } from 'react-dom';
import { padLabel, type PadInfo, type PadLike } from '../lib/devices';
import { isController, slotDeviceName, slotId, type GameSlot, type SlotMap } from '../lib/slots';
import { AUTO_TEMPLATE, autoSlotTemplate, resolveSlotTemplate } from '../lib/slotTemplates';
import { formatInput, searchSpec } from '../lib/inputs';
import type { PressHit } from '../lib/listen';
import { parseQuery, scoreRow } from '../lib/search';
import {
  DUP_ORDER_GUESSES, calloutFor, calloutTitle, cloneTemplate, coveredInputs, exportTemplates, identityKey, inputRole, matchFor, matchScore, maxButton, newTemplate,
  calloutView, imageSrc, parseTemplates, resolveTemplateImage, templateViews, shortInput, splitCombo, templateGroups, unassignedCount, useTemplateImage, useTemplates,
  type Callout, type DeviceIdentity, type DeviceTemplate,
} from '../lib/templates';
import type { Binding, Row, Slot } from '../lib/types';
import { CalloutBody, DeviceCanvas, TONE_STROKE, useLiveInputs, type CalloutState, type Entry, type Live, type Tone } from './DeviceCanvas';
import { Ico } from './icons';
import { TemplateEditor } from './TemplateEditor';
import { useFocusPressedView } from './useFocusPressedView';
import { useSwapViews } from './useSwapViews';

/** a game slot of the active profile (slots.ts) with the connected controller filling it, if any */
export interface SlotOption { gs: GameSlot; pad?: PadInfo }
interface DevOption { key: string; slot: Slot; instance: number; label: string; name?: string; pad?: PadInfo; gs: GameSlot }
interface Props {
  rows: Row[];
  conflictRows: Map<string, Set<string>>;
  /** every detected controller (only for the Chromium notice; the slot picker lists the game slots) */
  pads: PadInfo[];
  describe: (l: readonly PadLike[]) => PadInfo[];
  /** the profile's game slots (kb, mo, js, gp): what the export will contain */
  slots: SlotOption[];
  slotMap: SlotMap;
  /** remember a template for a slot (null = automatic) */
  onPickTemplate: (slot: GameSlot, templateId: string | null) => void;
  onOpenControllers: () => void;
  /** Settings → Highlight on press / Scroll to it */
  highlight: boolean;
  scroll: boolean;
  /** the search box, applied to this view: dims the controls whose actions don't match */
  query: string;
  /** find by pressing: selects that slot and the control */
  chip: PressHit | null;
  /** open "Axis settings & curves" for one joystick / gamepad slot */
  onOpenAxis: (gs: GameSlot) => void;
  /** how many device numbers per kind the game keeps axis / curve settings for (js: 8, gp: 1) */
  axisLimit: Record<'js' | 'gp', number>;
  /** "Refresh game state": pick a fresh export to rematch the mappings to the game's device numbers */
  onRefresh: () => void;
  onEdit: (row: Row) => void;
  onRemove: (row: Row, b: Binding) => void;
  onBind: (row: Row, slot: Slot, instance: number, input: string) => void;
  onShowInList: (spec: string) => void;
  notify: (kind: 'ok' | 'err', text: string) => void;
}

const SEL_KEY = 'sc-mapper:device-view';
const download = (name: string, href: string) => { const a = document.createElement('a'); a.href = href; a.download = name; document.body.appendChild(a); a.click(); a.remove(); };
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'device';
const ICON_BTN = 'flex h-7 w-7 items-center justify-center text-slate-300 transition hover:bg-hud/10 hover:text-hud2 focus-visible:outline focus-visible:outline-1 focus-visible:outline-hud';
const ICON_GROUP = 'flex items-stretch divide-x divide-edge overflow-hidden rounded border border-edge';
const LABEL = 'font-display text-[10px] font-semibold uppercase tracking-[0.25em] text-slate-500';
/** an icon-only toolbar button: tooltip (title) and accessible name both carry the full label */
function IconButton({ icon, label, onClick, testid }: { icon: Parameters<typeof Ico>[0]['name']; label: string; onClick: () => void; testid?: string }) {
  return <button type="button" onClick={onClick} title={label} aria-label={label} data-testid={testid} className={ICON_BTN}><Ico name={icon} className="h-4 w-4" /></button>;
}

const NO_ACTIVE: Live = { active: new Set<string>(), values: {} };

/** visual view of one game slot: a controller's picture with every control's bindings (live highlight, click to edit), or the keyboard */
export function DeviceView(props: Props) {
  const { slots, chip, onOpenControllers } = props;
  const T = useTemplates();
  // the profile's joystick / gamepad slots (what goes into the export); keyboard and mouse live in the Keyboard view
  const options = useMemo(() => slots.filter(({ gs }) => isController(gs)).map(({ gs, pad }): DevOption => {
    const name = pad ? padLabel(pad) : slotDeviceName(gs);
    return { key: `slot:${slotId(gs)}`, slot: gs.slot, instance: gs.instance, gs, pad, name, label: `${slotId(gs).toUpperCase()} · ${name ?? 'no device assigned'}` };
  }), [slots]);
  const [selKey, setSelKey] = useState<string>(() => localStorage.getItem(SEL_KEY) ?? '');
  const pick = (k: string) => { setSelKey(k); localStorage.setItem(SEL_KEY, k); };
  // find by pressing on this view: the pressed device's slot comes up (and the control gets selected below)
  useEffect(() => {
    if (!chip) return;
    const o = options.find((x) => x.slot === chip.slot && x.instance === chip.instance);
    if (o) { setSelKey(o.key); localStorage.setItem(SEL_KEY, o.key); }
  }, [chip]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!options.length) return <NoSlots onOpenControllers={onOpenControllers} hasKm={slots.length > 0} />;
  const opt = options.find((o) => o.key === selKey) ?? options.find((o) => o.pad && o.slot === 'js') ?? options[0];
  const chosen = resolveSlotTemplate(T.templates, props.slotMap, opt.gs, opt.pad, T.picks);
  const strip = (
    <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Game slot" data-testid="device-slot-strip">
      <span className={`mr-1 ${LABEL}`}>Game slot</span>
      {options.map((o) => {
        const on = o.key === opt.key;
        return (
          <button key={o.key} type="button" role="tab" aria-selected={on} onClick={() => pick(o.key)} data-slot-chip={slotId(o.gs)} title={o.label}
            className={`flex max-w-[15rem] items-center gap-1.5 rounded border px-2 py-1 text-xs transition ${on ? 'border-hud/70 bg-hud/15 text-hud2 shadow-[0_0_14px_-6px_var(--color-hud)]' : 'border-edge text-slate-400 hover:border-hud/40 hover:text-slate-200'}`}>
            <Ico name={o.slot === 'gp' ? 'gamepad' : 'joystick'} className="h-3.5 w-3.5" />
            <span className="font-mono font-bold">{slotId(o.gs).toUpperCase()}</span>
            <span className="min-w-0 truncate">{o.name ?? 'no device'}</span>
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${o.pad ? 'bg-ok shadow-[0_0_6px_var(--color-ok)]' : 'bg-slate-600'}`} />
          </button>
        );
      })}
    </div>
  );
  return (
    <div className="flex min-h-full flex-col gap-3" data-testid="device-view">
      <SlotDeviceView key={opt.key} {...props} opt={opt} chosen={chosen} T={T} strip={strip} />
    </div>
  );
}

function NoSlots({ onOpenControllers, hasKm }: { onOpenControllers: () => void; hasKm: boolean }) {
  return (
    <div className="hud-panel hud-corners mx-auto mt-8 max-w-xl rounded-lg p-8 text-center" data-testid="device-view-empty">
      <div className="font-display text-xl font-bold uppercase tracking-[0.2em] text-hud2">No joysticks or gamepads yet</div>
      <p className="mt-2 text-sm text-slate-400">This view shows the joysticks, HOTAS and gamepads that go into your export, each on its game slot (js1, js2, gp1…).
        {hasKm ? ' Keyboard and mouse bindings are in the Keyboard view.' : ''} Import your <code>actionmaps.xml</code> to have them matched for you, or add slots by hand.</p>
      <button type="button" onClick={onOpenControllers} data-testid="open-controllers" className="mt-4 inline-flex items-center gap-2 rounded border border-hud/60 bg-hud/15 px-4 py-2 font-display text-sm font-semibold uppercase tracking-wider text-hud2 hover:bg-hud/25"><Ico name="slots" className="h-4 w-4" /> Game slots &amp; controllers</button>
    </div>
  );
}

type Chosen = ReturnType<typeof resolveSlotTemplate>;
function SlotDeviceView({ opt, chosen, T, strip, rows, conflictRows, pads, describe, onPickTemplate, onOpenControllers, onOpenAxis, axisLimit, onRefresh, highlight, scroll, query, chip, onEdit, onRemove, onBind, onShowInList, notify }:
  Props & { opt: DevOption; chosen: Chosen; T: ReturnType<typeof useTemplates>; strip: ReactNode }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [group, setGroup] = useState<string | null>(null);
  const [editing, setEditing] = useState<DeviceTemplate | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const slot = opt.slot as 'js' | 'gp';
  const { instance } = opt;
  const ident = chosen.ident;
  const idKey = identityKey(ident);
  const tpl = useTemplateImage(chosen.template); // built-in device templates: the picture arrives on demand
  const tplMax = maxButton(tpl);
  const unassigned = tpl.callouts.reduce((n, c) => n + unassignedCount(c), 0);
  const rawLive = useLiveInputs(opt.pad);
  // Settings → Highlight on press off: presses don't light callouts or move the panel (the editor has its own capture)
  const live = highlight ? rawLive : NO_ACTIVE;
  // find by pressing aimed at this slot: the pressed input(s)
  const chipInputs = useMemo(() => (chip && chip.slot === slot && chip.instance === instance ? chip.inputs.map((i) => splitCombo(i).main) : []), [chip, slot, instance]);
  // multi-view photo templates: a pressed control brings the photo with its marker into sight (not while the editor is open)
  const canvasRef = useRef<HTMLDivElement>(null);
  const pulse = useFocusPressedView(tpl, live.active, canvasRef, !editing, scroll);
  // swappable views (e.g. the MTQ's grips): only the one in use shows; a press on another one's control switches to it, always
  // (whatever the highlight setting), and so does a find-by-pressing hit
  const swapActive = useMemo(() => (chipInputs.length ? new Set([...rawLive.active, ...chipInputs]) : rawLive.active), [rawLive.active, chipInputs]);
  const swap = useSwapViews(tpl, swapActive, idKey);
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
  // the search box on this view: controls whose title or bound actions match stay lit, the others dim
  const q = useMemo(() => parseQuery(query), [query]);
  const searching = q.terms.length + q.keyTerms.length > 0;
  const matches = (c: Callout) => {
    if (chipInputs.length) return coveredInputs(c).some((i) => chipInputs.includes(i));
    if (!searching) return true;
    const title = calloutTitle(c).toLowerCase();
    return q.terms.every((t) => title.includes(t)) || entriesOf(coveredInputs(c)).some((e) => scoreRow(e.row, q) > 0);
  };
  const filtering = searching || chipInputs.length > 0;
  const matchCount = filtering ? shownTpl.callouts.filter(matches).length : 0;
  const stateOf = (c: Callout): CalloutState => {
    const cov = coveredInputs(c);
    const es = entriesOf(cov);
    const tone: Tone = es.some((e) => e.conflict) ? 'conflict' : es.some((e) => e.b.custom) ? 'custom' : es.length ? 'bound' : 'unbound';
    return { tone, active: cov.some((i) => live.active.has(i)), dim: (!!group && c.group !== group) || (filtering && !matches(c)), ...(c.inputRegions ? { inputActive: c.inputs.map((i) => live.active.has(i)) } : {}) };
  };
  // find by pressing: select the pressed control and bring it into view (or its entry in "not on the picture")
  useEffect(() => {
    if (!chipInputs.length) return;
    const c = tpl.callouts.find((x) => coveredInputs(x).some((i) => chipInputs.includes(i)));
    setSelected(c ? c.id : `input:${chipInputs[0]}`);
    if (!c) return;
    const t = window.setTimeout(() => document.querySelector(`[data-callout="${CSS.escape(c.id)}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 120);
    return () => window.clearTimeout(t);
  }, [chipInputs, tpl]);
  const selCallout: Callout | undefined = selected?.startsWith('input:')
    ? { id: selected, ...calloutFor(selected.slice(6)), inputs: [selected.slice(6)], anchor: { x: 0, y: 0 }, box: { x: 0, y: 0 } }
    : tpl.callouts.find((c) => c.id === selected);

  const withLink = (t: DeviceTemplate): DeviceTemplate => (ident.vendor || ident.name ? { ...t, slot, match: [matchFor(ident, !!opt.pad?.dup)] } : { ...t, slot });
  const saveTemplate = async (t: DeviceTemplate) => {
    try {
      const v = await T.save(t);
      // (identical devices can't be told apart by a match rule: the copy is picked for this one explicitly)
      if (!matchScore(v, ident) || ident.dup || (chosen.pick && chosen.pick !== v.id)) onPickTemplate(opt.gs, v.id);
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
  const axisLocked = instance > axisLimit[slot];
  const exportJson = async () => {
    try { download(`${slug(tpl.name)}.sc-template.json`, `data:application/json;charset=utf-8,${encodeURIComponent(exportTemplates([await resolveTemplateImage(tpl)]))}`); }
    catch (e) { notify('err', `Template export failed: ${(e as Error).message}`); }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3" data-testid="device-slot-view" data-slot={`${slot}${instance}`}>
      {/* ---- slot bar: slot chips, then hardware · template (+ template tools) · axis settings for the selected slot ---- */}
      <section className="hud-panel rounded-lg px-3 py-2.5 print:hidden" data-testid="device-slot-bar">
        {strip}
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-edge/50 pt-2 text-xs" data-testid="device-slot-line">
          <span className="flex min-w-0 items-center gap-1.5 text-slate-400" data-testid="device-hardware">
            <span className={LABEL}>Hardware</span>
            {opt.gs.hw ? <span className="max-w-[16rem] truncate text-slate-200" title={opt.pad ? padLabel(opt.pad) : opt.gs.hw.name}>{opt.pad ? padLabel(opt.pad) : opt.gs.hw.name}</span> : <span className="text-slate-500">none assigned</span>}
            {opt.gs.hw && (opt.pad
              ? <span className="rounded border border-ok/40 px-1 font-mono text-[10px] text-ok">connected</span>
              : <span className="rounded border border-edge px-1 font-mono text-[10px] text-slate-500">not connected</span>)}
          </span>
          <span className="flex flex-wrap items-center gap-2" data-testid="template-line">
            <label className="flex items-center gap-1.5 text-slate-400">
              <span className={LABEL}>Template</span>
              <select value={chosen.pick} onChange={(e) => onPickTemplate(opt.gs, e.target.value || (chosen.legacy ? AUTO_TEMPLATE : null))} data-testid="template-select" aria-label={`Template for ${slot}${instance}`}
                className="max-w-[18rem] rounded border border-edge bg-panel2 px-2 py-1 text-xs text-slate-200 outline-none focus:border-hud">
                <option value="">Automatic ({autoSlotTemplate(T.templates, opt.gs, opt.pad).name})</option>
                {templateGroups(T.templates).map((g) => (
                  <optgroup key={g.label} label={g.label} data-group={g.label}>
                    {g.templates.map((t) => <option key={t.id} value={t.id}>{t.name}{t.slot !== opt.slot ? ` · ${t.slot}` : ''}{maxButton(t) > 32 ? ` · ${maxButton(t)} buttons` : ''}</option>)}
                  </optgroup>
                ))}
              </select>
            </label>
            <span className={ICON_GROUP} role="group" aria-label="Template" data-testid="template-tools">
              {tpl.builtin
                ? <IconButton icon="edit" label="Customize a copy of this template" onClick={() => void customize()} testid="template-customize" />
                : <IconButton icon="edit" label="Edit this template" onClick={() => setEditing(structuredClone(tpl))} testid="template-edit" />}
              <IconButton icon="filePlus" label="New template (draw your own device)" onClick={() => setEditing(withLink(newTemplate(slot, ident.name ?? 'My device')))} testid="template-new" />
              <IconButton icon="import" label="Import templates (.json)" onClick={() => importRef.current?.click()} testid="template-import" />
              <IconButton icon="export" label="Export this template (.json)" onClick={() => void exportJson()} testid="template-export" />
            </span>
            <span className="h-5 w-px bg-edge" aria-hidden="true" />
            <span className={ICON_GROUP} role="group" aria-label="Picture" data-testid="picture-tools">
              <IconButton icon="image" label="Save the picture with its bindings as PNG" onClick={() => void exportPng()} testid="device-png" />
              <IconButton icon="print" label="Print the picture with its bindings" onClick={() => window.print()} testid="device-print" />
            </span>
            <input ref={importRef} type="file" accept=".json,application/json" className="hidden" data-testid="template-import-file"
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void importFile(f); }} />
          </span>
          <button type="button" onClick={() => !axisLocked && onOpenAxis(opt.gs)} disabled={axisLocked} data-testid="slot-axis-settings"
            aria-label={`Axis settings & curves for ${slot}${instance}`} aria-describedby={axisLocked ? 'axis-locked-msg' : undefined}
            title={axisLocked ? `Not available for ${slot}${instance}: see below` : `Invert, exponent, custom response curves${slot === 'js' ? ' and deadzone / saturation' : ''} for ${slot}${instance} only`}
            className="ml-auto flex items-center gap-1.5 rounded border border-hud/50 bg-hud/10 px-2.5 py-1 font-display text-[11px] font-semibold uppercase tracking-wider text-hud2 transition hover:bg-hud/20 disabled:cursor-not-allowed disabled:border-edge disabled:bg-transparent disabled:text-slate-500">
            <Ico name="curve" className="h-3.5 w-3.5" /> Axis settings &amp; curves <span className="font-mono normal-case">· {slot}{instance}</span>
          </button>
        </div>
        {axisLocked && (
          <div id="axis-locked-msg" className="mt-2 flex flex-wrap items-center gap-2 rounded border border-mod/40 bg-mod/5 px-3 py-1.5 text-[11px] text-slate-300" data-testid="axis-locked">
            <Ico name="info" className="text-mod" />
            <span className="min-w-0 flex-1">{slot === 'js'
              ? <>The game lists this device as {slot}{instance}; Star Citizen only allows axis, inversion and curve tuning on js1–js{axisLimit.js}. The order comes from the game and Windows USB order, not this app. To tune it, change which devices connect first, then refresh game state here.</>
              : <>The game lists this device as {slot}{instance}; Star Citizen only allows gamepad axis, inversion and curve tuning on gp1. The order comes from the game and Windows USB order, not this app. To tune it, change which devices connect first, then refresh game state here.</>}</span>
            <span className="ml-auto flex shrink-0 gap-1.5">
              <button type="button" onClick={onRefresh} data-testid="axis-refresh" className="flex items-center gap-1 rounded border border-mod/60 px-2 py-0.5 font-semibold text-mod hover:bg-mod/20"><Ico name="refresh" className="h-3 w-3" /> Refresh game state</button>
              <button type="button" onClick={onOpenControllers} data-testid="axis-reorder" className="flex items-center gap-1 rounded border border-edge px-2 py-0.5 text-slate-300 hover:border-mod/60 hover:text-mod"><Ico name="slots" className="h-3 w-3" /> Game slots &amp; controllers</button>
            </span>
          </div>
        )}
      </section>
      <div className="print:hidden"><ChromiumBanner detected={pads.length} compact /></div>
      <ChromiumButtonNotice templateMax={tplMax} deviceButtons={opt.pad?.buttons} device={ident.name ?? `${slot.toUpperCase()}${instance}`} />
      {unassigned > 0 && (
        <div data-testid="template-unassigned" className="flex flex-wrap items-center gap-2 rounded border border-mod/50 bg-mod/10 px-3 py-1.5 text-[11px] text-slate-200 print:hidden">
          <span><b className="text-mod">{unassigned} input{unassigned === 1 ? '' : 's'} on this picture have no number yet</b> (marked “?”): this device numbers its buttons the way you configured it.
            {tpl.builtin ? <> Customize a copy, select a callout and type its number or use “pick by pressing” and then press the control.</> : <> Edit the template, select a callout and type its number or use “pick by pressing” and then press the control.</>}</span>
          {tpl.builtin
            ? <button type="button" onClick={() => void customize()} className="flex items-center gap-1 rounded border border-mod/60 px-2 py-0.5 font-semibold text-mod hover:bg-mod/20"><Ico name="edit" className="h-3 w-3" /> Assign numbers</button>
            : <button type="button" onClick={() => setEditing(structuredClone(tpl))} className="flex items-center gap-1 rounded border border-mod/60 px-2 py-0.5 font-semibold text-mod hover:bg-mod/20"><Ico name="edit" className="h-3 w-3" /> Assign numbers</button>}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500 print:hidden" data-testid="device-status">
        <span>Template <b className="text-slate-300">{tpl.name}</b>: {chosen.how === 'chosen' ? `picked by you for ${opt.gs.hw ? 'this device' : `${slot}${instance}`}` : chosen.how === 'guessed' ? `guessed: device ${ident.dup!.n} of ${ident.dup!.of} identical ${guessLabel(ident)} (the last is taken as the stick, the others as the throttle plugged into the base; pick another template if it is not)` : chosen.how === 'matched' ? `linked to this device (${describeMatch(tpl, ident)})` : 'generic (no template linked to this device yet: customize a copy to place the callouts on your own device)'}</span>
        {tpl.notes && <span className="flex items-center gap-1 text-slate-400" data-testid="template-notes"><Ico name="info" className="h-3 w-3" /> {tpl.notes}</span>}
        <span className="flex items-center gap-1.5">{!opt.pad ? 'Connect the device (and press a button) for live highlight.' : highlight ? <><span className="h-1.5 w-1.5 rounded-full bg-ok" /><span className="text-ok">live: press or move a control and it lights up</span></> : <><span className="h-1.5 w-1.5 rounded-full bg-slate-500" />connected · highlight on press is off (Settings); grips still switch</>}</span>
        {filtering && <span className="text-mod" data-testid="device-search-status">{chipInputs.length ? `Pressed ${formatInput(slot, instance, chipInputs[0])}: ${matchCount ? 'selected below' : 'not on this picture (see the list on the right)'}` : `${matchCount} control${matchCount === 1 ? '' : 's'} match “${query.trim()}”`}</span>}
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
        <button type="button" onClick={onClose} className="ml-auto text-slate-500 hover:text-slate-200" aria-label="Close"><Ico name="close" /></button>
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
                        <span className={`block truncate ${e.conflict ? 'text-alert' : e.b.custom ? 'text-mod' : 'text-slate-200'}`}>{e.conflict && <Ico name="alert" className="mr-0.5" />}{e.prefix && <span className="font-mono text-[10px] text-hud/70">{e.prefix}+ </span>}{e.row.label}</span>
                        <span className="block truncate text-[10px] text-slate-500">{e.row.mapLabel}{e.b.mode ? ` · ${e.b.mode}` : ''}{e.b.custom ? ' · customized' : ''}</span>
                      </span>
                      <button type="button" onClick={() => onEdit(e.row)} className="rounded border border-edge px-1.5 text-[10px] text-slate-300 hover:border-hud/60">Edit</button>
                      <button type="button" onClick={() => onRemove(e.row, e.b)} title="Unbind" aria-label={`Unbind ${e.row.label}`} className="rounded border border-edge px-1.5 text-[10px] text-slate-400 hover:border-alert hover:text-alert"><Ico name="close" /></button>
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
