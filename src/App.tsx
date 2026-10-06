import { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import defaultsJson from './data/defaults.json';
import { ActionList, columnOf } from './components/ActionList';
import { ActionEditor } from './components/ActionEditor';
import { CaptureDialog, type CaptureRequest } from './components/CaptureDialog';
import { ConflictsView } from './components/ConflictsView';
import { ControllersPanel, type SlotActions } from './components/ControllersPanel';
import { ExportDialog, type ExportSlot } from './components/ExportDialog';
import { SettingsModal, loadAppSettings, saveAppSettings, type AppSettings } from './components/SettingsModal';
import { KeyboardView } from './components/KeyboardView';
import { DeviceView, type SlotOption } from './components/DeviceView';
import { AxisSettingsModal, settingsInstances } from './components/DeviceSettings';
import { Sidebar, type MapCount } from './components/Sidebar';
import { findConflicts } from './lib/conflicts';
import { GROUPS } from './lib/groups';
import { getPads, loadAssign, usePads, type PadKind } from './lib/devices';
import { blockInstance, blockType, settingsOf, swapOptionInstances, type DeviceSettings } from './lib/devopts';
import type { ExportDevice } from './lib/exporter';
import {
  DEFAULTS_SLOT_KEY, addSlot, assignHardware, autoMatchHardware, copySlotBindings, dropSlotBindings, emptySlotMap, ensureUsedSlots, hardwareOf,
  isController, knownHardware, loadSlotStore, neighbourSlot, padAssign, planCopy, removeSlot, reservedJs, saveSlotStore, seedSlots, setSlotTemplate, slotBindingCount,
  slotDeviceName, slotId, slotProduct, swapProfileDevices, swapSlotBindings, swapSlots, type GameSlot, type SlotMap, type SlotStore,
} from './lib/slots';
import { hitKeys, hitLabel, hitSpecs, useKeyHits, usePadHits, type PressHit } from './lib/listen';
import { comboFrom, scMouseButton, scWheel } from './lib/capture';
import { ChromiumBanner } from './components/ChromiumBanner';
import { Ico, type IconName } from './components/icons';
import { DeleteProfileDialog, ProfilePanel } from './components/ProfilePanel';
import { useEscape } from './components/useEscape';
import { effectiveGroup, indexDefaults, newProfile, setAction, setGroup, withRebinds, type CaptureConflict } from './lib/edit';
import { bindKey, comboLabel, groupOfDevice, groupOfSlot, searchSpec } from './lib/inputs';
import { parseActionMaps, readXmlFile } from './lib/importer';
import { buildRows } from './lib/merge';
import { parseQuery, scoreRow } from './lib/search';
import { load, save, type Persisted } from './lib/storage';
import type { Binding, DefaultsData, Device, Group, Rebind, RebindMap, Row, Slot } from './lib/types';

const DEFAULTS = defaultsJson as DefaultsData;
const IDX = indexDefaults(DEFAULTS);
/** device numbers the game keeps axis / curve settings for, per kind (the option trees' instance counts; gamepad: gp1 only) */
const AXIS_LIMIT = { js: settingsInstances('joystick', DEFAULTS.optionTrees?.joystick), gp: settingsInstances('gamepad', DEFAULTS.optionTrees?.gamepad) };
interface UndoEntry {
  profileId: string; label: string; before: { map: string; action: string; value?: Rebind[] }[];
  /** a slot reorder: undoing it also swaps the slot map, device list and axis settings back (the swap is its own inverse) */
  swap?: { slot: Slot; a: number; b: number };
}
const keyOf = (r: { slot: Rebind['slot']; instance: number; input: string }) => bindKey(r.slot, r.instance, r.input);
const uniqueName = (names: string[], base: string) => { let n = base, i = 2; while (names.includes(n)) n = `${base} ${i++}`; return n; };
const ALL_DEVICES: Device[] = ['keyboard', 'mouse', 'joystick', 'gamepad'];
const DEVICE_META: Record<Device, { label: string; icon: IconName }> = {
  keyboard: { label: 'Keyboard', icon: 'keyboard' },
  mouse: { label: 'Mouse', icon: 'mouse' },
  joystick: { label: 'Joystick / HOTAS', icon: 'joystick' },
  gamepad: { label: 'Gamepad', icon: 'gamepad' },
};
type View = 'list' | 'keyboard' | 'conflicts' | 'devices';
const VIEWS: View[] = ['list', 'keyboard', 'devices', 'conflicts'];
const VIEW_META: Record<View, { label: string; icon: IconName }> = {
  list: { label: 'List', icon: 'list' }, keyboard: { label: 'Keyboard', icon: 'keyboard' }, devices: { label: 'Devices', icon: 'joystick' }, conflicts: { label: 'Conflicts', icon: 'alert' },
};
/** the search box works on the current view: what it searches there */
const SEARCH_HINT: Record<View, string> = {
  list: 'Search actions, categories or inputs…  (quantum, lalt+n, js1_button5)',
  keyboard: 'Search: the keyboard shows only matching actions…',
  devices: "Search this device's controls and their actions…",
  conflicts: 'Search conflicts by action or input…',
};
const PRESS_HINT: Record<View, string> = {
  list: 'the list shows every action bound to that exact input',
  keyboard: 'the keyboard shows only what is bound to that exact input',
  devices: 'the view jumps to that control on its device and selects it',
  conflicts: 'only the conflicts on that exact input stay',
};
/**
 * Which filters each view shows (and applies): views are first class, a filter only appears where it changes the result.
 * Devices has none of these (its own device / template / group controls); search and find-by-pressing are global.
 */
const VIEW_FILTERS: Record<View, { input: boolean; unbound: boolean; custom: boolean; conflictOnly: boolean; categories: boolean; defaultOverlaps: boolean; edit: boolean }> = {
  list: { input: true, unbound: true, custom: true, conflictOnly: true, categories: true, defaultOverlaps: false, edit: true },
  keyboard: { input: false, unbound: false, custom: true, conflictOnly: true, categories: true, defaultOverlaps: false, edit: false },
  conflicts: { input: true, unbound: false, custom: true, conflictOnly: false, categories: true, defaultOverlaps: true, edit: false },
  devices: { input: false, unbound: false, custom: false, conflictOnly: false, categories: false, defaultOverlaps: false, edit: false },
};
const NO_FILTERS = new Set<Device>(ALL_DEVICES);
const EXPORT_TYPE: Record<GameSlot['slot'], ExportDevice['type']> = { kb: 'keyboard', mo: 'mouse', js: 'joystick', gp: 'gamepad' };

/** md breakpoint: the profile panel renders once, in the sidebar (wide) or atop the content (narrow) */
function useWide() {
  const q = '(min-width: 768px)';
  const [wide, setWide] = useState(() => typeof window === 'undefined' || !window.matchMedia || window.matchMedia(q).matches);
  useEffect(() => {
    if (!window.matchMedia) return;
    const m = window.matchMedia(q), on = () => setWide(m.matches);
    m.addEventListener('change', on); return () => m.removeEventListener('change', on);
  }, []);
  return wide;
}

export default function App() {
  const wide = useWide();
  const [store, setStore] = useState<Persisted>(() => load());
  useEffect(() => save(store), [store]);
  const profile = store.profiles.find((p) => p.id === store.activeId) ?? null;

  const [query, setQuery] = useState('');
  const dq = useDeferredValue(query);
  const [devices, setDevices] = useState<Set<Device>>(new Set(ALL_DEVICES));
  const [showUnbound, setShowUnbound] = useState(false);
  const [customOnly, setCustomOnly] = useState(false);
  const [conflictOnly, setConflictOnly] = useState(false);
  const [appSettings, setAppSettings] = useState<AppSettings>(() => loadAppSettings());
  useEffect(() => saveAppSettings(appSettings), [appSettings]);
  const { highlight: highlightOn, scroll: scrollOn, internal: showInternal } = appSettings;
  const [settingsOpen, setSettingsOpen] = useState(false);
  /** "Axis settings & curves" open for one joystick / gamepad slot (Devices view) */
  const [axisFor, setAxisFor] = useState<{ slot: 'js' | 'gp'; instance: number } | null>(null);
  const [selGroup, setSelGroup] = useState<string | null>(null);
  const [selMap, setSelMap] = useState<string | null>(null);
  const [view, setView] = useState<View>('list');
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [help, setHelp] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // ---- editing state
  const [editMode, setEditMode] = useState(false);
  const [capture, setCapture] = useState<CaptureRequest | null>(null);
  const [editorId, setEditorId] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [devicesOpen, setDevicesOpen] = useState<false | 'slots'>(false);
  const [deleting, setDeleting] = useState(false);
  // which keyboard / mouse slot (kb1, kb2… / mo1, mo2…) the Keyboard view shows and captures go to, when there are several
  const [kbInst, setKbInst] = useState(1);
  const [moInst, setMoInst] = useState(1);
  const [undo, setUndo] = useState<UndoEntry[]>([]);
  // ---- press-to-search and live highlight
  const [pressMode, setPressMode] = useState(false);
  const [chip, setChip] = useState<PressHit | null>(null);
  const [flash, setFlash] = useState<{ hit: PressHit; keys: Set<string>; at: number } | null>(null);
  // ---- game slots (kb1, mo1, js1…, gp1…) of the active profile: which hardware fills each and its template (slots.ts)
  const [slotStore, setSlotStore] = useState<SlotStore>(() => loadSlotStore());
  useEffect(() => saveSlotStore(slotStore), [slotStore]);
  const slotKey = profile?.id ?? DEFAULTS_SLOT_KEY;
  const slotMap: SlotMap = useMemo(() => slotStore[slotKey] ?? (profile ? seedSlots(profile) : emptySlotMap()), [slotStore, slotKey, profile]);
  // profiles imported before slots existed: seed (and remember) their map the first time they're shown
  useEffect(() => { if (profile && !slotStore[profile.id]) setSlotStore((s) => (s[profile.id] ? s : { ...s, [profile.id]: seedSlots(profile) })); }, [profile, slotStore]);
  /** change the active profile's slot map (read at call time, so several updates in a row compose) */
  const updateSlots = useCallback((fn: (m: SlotMap) => SlotMap) => setSlotStore((s) => {
    const st = storeRef.current;
    const prof = st.profiles.find((p) => p.id === st.activeId) ?? null;
    const key = prof?.id ?? DEFAULTS_SLOT_KEY;
    const cur = s[key] ?? (prof ? seedSlots(prof) : emptySlotMap());
    const next = fn(cur);
    return next === cur && s[key] ? s : { ...s, [key]: next };
  }), []);
  useEffect(() => {
    if (kbInst > 1 && !slotMap.slots.some((s) => s.slot === 'kb' && s.instance === kbInst)) setKbInst(1);
    if (moInst > 1 && !slotMap.slots.some((s) => s.slot === 'mo' && s.instance === moInst)) setMoInst(1);
  }, [slotMap, kbInst, moInst]);
  const slotPads = useMemo(() => ({ assign: padAssign(slotMap), reserved: reservedJs(slotMap) }), [slotMap]);
  const { pads, describe: describePads } = usePads(!!capture || exportOpen || !!devicesOpen || pressMode || view === 'devices' || !!slotMap.pendingMatch, profile?.devices, slotPads);
  const storeRef = useRef(store);
  // hardware auto-match of a fresh import: runs once, as soon as the browser shows controllers (they appear after a press)
  useEffect(() => {
    if (!slotMap.pendingMatch || !pads.length) return;
    updateSlots((m) => (m.pendingMatch ? autoMatchHardware(m, pads, loadAssign()) : m));
  }, [slotMap.pendingMatch, pads, updateSlots]);
  // a binding on a joystick / gamepad number no slot has (e.g. captured from an unmapped controller) adds that slot
  useEffect(() => {
    if (!profile) return;
    updateSlots((m) => ensureUsedSlots(m, profile.rebinds, pads));
  }, [profile, pads, updateSlots]);
  const undoRef = useRef(undo);
  useLayoutEffect(() => { storeRef.current = store; undoRef.current = undo; }, [store, undo]);

  const rows = useMemo(() => buildRows(DEFAULTS, profile), [profile]);
  const [includeDefaultOverlaps, setIncludeDefaultOverlaps] = useState(false);
  const conflicts = useMemo(() => findConflicts(rows, includeDefaultOverlaps), [rows, includeDefaultOverlaps]);

  const conflictsOf = useCallback((row: Row, b: Binding) => {
    if (!conflicts.byRow.get(row.id)?.has(b.phys)) return undefined;
    const g = conflicts.groups.find((x) => x.phys === b.phys);
    return g?.entries.filter((e) => e.row.id !== row.id).map((e) => `${e.row.label} (${e.row.mapLabel})`);
  }, [conflicts]);

  // ---- filtering pipeline ---------------------------------------------------
  // only the filters the current view shows apply to it (the others keep their state for when you come back)
  const vf = VIEW_FILTERS[view];
  const effDevices = vf.input ? devices : NO_FILTERS;
  const effUnbound = vf.unbound && showUnbound;
  const effCustom = vf.custom && customOnly;
  const effConflict = vf.conflictOnly && conflictOnly;
  const allDevices = effDevices.size === ALL_DEVICES.length;
  const filtered = useMemo(() => {
    const devices = effDevices, showUnbound = effUnbound, customOnly = effCustom, conflictOnly = effConflict;
    const q = parseQuery(dq);
    if (chip) q.anyOf = hitSpecs(chip);
    const hasQuery = q.terms.length + q.keyTerms.length > 0 || !!chip;
    const out: { row: Row; score: number }[] = [];
    let hiddenUnbound = 0;
    for (const r of rows) {
      if (r.hidden && !showInternal) continue;
      const bindings = allDevices ? r.bindings : r.bindings.filter((b) => devices.has(columnOf(b)));
      const row = bindings === r.bindings ? r : { ...r, bindings };
      if (!showUnbound && !row.bindings.length && !row.cleared.length) {
        if (hasQuery && !customOnly && !conflictOnly && scoreRow(row, q)) hiddenUnbound++;
        continue;
      }
      if (customOnly && !row.customized) continue;
      if (conflictOnly && !conflicts.byRow.has(row.id)) continue;
      const score = hasQuery ? scoreRow(row, q) : 1;
      if (!score) continue;
      out.push({ row, score });
    }
    if (hasQuery) out.sort((a, b) => b.score - a.score || a.row.order - b.row.order);
    return { list: out.map((x) => x.row), hasQuery, hiddenUnbound };
  }, [rows, dq, chip, effDevices, allDevices, effUnbound, effCustom, effConflict, showInternal, conflicts]);

  const counts: MapCount[] = useMemo(() => {
    const m = new Map<string, MapCount>();
    for (const r of rows) {
      if (r.hidden && !showInternal) continue;
      if (!m.has(r.map)) m.set(r.map, { map: r.map, label: r.mapLabel, group: r.group, count: 0 });
    }
    // Conflicts: a category counts its actions that are in a conflict (what that view lists), elsewhere every matching action
    for (const r of filtered.list) if (view !== 'conflicts' || conflicts.byRow.has(r.id)) m.get(r.map)!.count++;
    const order = GROUPS.flatMap((g) => g.maps);
    return [...m.values()].sort((a, b) => (order.indexOf(a.map) + 1 || 999) - (order.indexOf(b.map) + 1 || 999));
  }, [rows, filtered, showInternal, view, conflicts]);

  const visible = useMemo(
    () => (vf.categories ? filtered.list.filter((r) => (!selGroup || r.group === selGroup) && (!selMap || r.map === selMap)) : filtered.list),
    [filtered, selGroup, selMap, vf.categories],
  );
  const visibleConflicts = useMemo(() => {
    const ids = new Set(visible.map((r) => r.id));
    return conflicts.groups.filter((g) => g.entries.some((e) => ids.has(e.row.id)));
  }, [visible, conflicts]);

  const stats = useMemo(() => {
    const shown = rows.filter((r) => !r.hidden);
    return {
      actions: shown.length,
      bound: shown.filter((r) => r.bindings.length).length,
      custom: rows.filter((r) => r.customized).length,
      conflicts: conflicts.groups.length,
    };
  }, [rows, conflicts]);

  // ---- import ---------------------------------------------------------------
  const importFiles = useCallback(async (files: FileList | File[]) => {
    for (const f of Array.from(files)) {
      try {
        const text = await readXmlFile(f);
        const p = parseActionMaps(text, f.name);
        setStore((s) => ({ profiles: [...s.profiles, p], activeId: p.id }));
        setSlotStore((s) => ({ ...s, [p.id]: seedSlots(p) })); // fresh import: hardware is auto-matched once controllers show
        setToast({ kind: 'ok', text: `Imported “${p.name}” · ${p.rebindCount} bindings${p.devices.length ? ` · ${p.devices.length} devices` : ''}` });
      } catch (e) {
        setToast({ kind: 'err', text: `${f.name}: ${(e as Error).message}` });
      }
    }
  }, []);
  const loadSample = async () => {
    const res = await fetch(`${import.meta.env.BASE_URL}samples/actionmaps.xml`);
    const blob = await res.blob();
    await importFiles([new File([blob], 'sample-hosas-actionmaps.xml')]);
  };

  // ---- editing --------------------------------------------------------------
  /** Apply a change to the active profile's rebinds (creating a profile from the defaults if needed) and record undo */
  const applyEdit = useCallback((label: string, touched: { map: string; action: string }[], fn: (r: RebindMap) => RebindMap, extra?: Pick<UndoEntry, 'swap'>) => {
    const s = storeRef.current;
    let prof = s.profiles.find((p) => p.id === s.activeId) ?? null;
    let profiles = s.profiles;
    const created = !prof;
    if (!prof) {
      prof = newProfile(uniqueName(s.profiles.map((p) => p.name), 'My layout'));
      profiles = [...profiles, prof];
    }
    const seen = new Set<string>();
    const before = touched.filter((t) => !seen.has(`${t.map}/${t.action}`) && seen.add(`${t.map}/${t.action}`))
      .map((t) => ({ ...t, value: prof!.rebinds[t.map]?.[t.action] }));
    const next = withRebinds(prof, fn(prof.rebinds));
    const ns = { profiles: profiles.map((p) => (p.id === next.id ? next : p)), activeId: next.id };
    storeRef.current = ns;
    setStore(ns);
    setUndo((u) => [...u.slice(-199), { profileId: next.id, label, before, ...extra }]);
    if (created) setSlotStore((st) => ({ ...st, [next.id]: st[DEFAULTS_SLOT_KEY] ?? emptySlotMap() })); // the slots set up on the defaults move along
    if (created) setToast({ kind: 'ok', text: `Created profile “${next.name}” from the game defaults. Edits are saved there.` });
  }, []);

  /** Edit the active profile's device settings (creating a profile from the defaults if needed) */
  const applySettings = useCallback((label: string, fn: (s: DeviceSettings) => DeviceSettings) => {
    const s = storeRef.current;
    let prof = s.profiles.find((p) => p.id === s.activeId) ?? null;
    let profiles = s.profiles;
    if (!prof) {
      prof = newProfile(uniqueName(s.profiles.map((p) => p.name), 'My layout'));
      profiles = [...profiles, prof];
      const id = prof.id;
      setSlotStore((st) => ({ ...st, [id]: st[DEFAULTS_SLOT_KEY] ?? emptySlotMap() }));
      setToast({ kind: 'ok', text: `Created profile “${prof.name}” from the game defaults. Settings are saved there.` });
    }
    const { optionsXml: _legacy, ...rest } = prof;
    void _legacy;
    const next = { ...rest, settings: fn(settingsOf(prof)), editedAt: new Date().toISOString() };
    const ns = { profiles: profiles.map((p) => (p.id === next.id ? next : p)), activeId: next.id };
    storeRef.current = ns;
    setStore(ns);
    void label;
  }, []);

  const rebindsNow = (row: Row) => storeRef.current.profiles.find((p) => p.id === storeRef.current.activeId)?.rebinds[row.map]?.[row.action];
  const setGroupFor = useCallback((row: Row, g: Group, list: Rebind[], label = `Edit ${row.label}`) =>
    applyEdit(label, [row], (r) => setGroup(r, IDX.get(row.id), row.map, row.action, g, list)), [applyEdit]);
  const rebindOf = (row: Row, b: Binding) =>
    effectiveGroup(IDX.get(row.id), rebindsNow(row), groupOfSlot(b.slot)).find((r) => keyOf(r) === keyOf(b));

  const undoLast = useCallback((rowId?: string) => {
    const s = storeRef.current;
    const u = undoRef.current;
    let i = u.length - 1;
    // (a slot reorder is undone as a whole only, never per action)
    for (; i >= 0; i--) if (u[i].profileId === s.activeId && (!rowId || (!u[i].swap && u[i].before.some((b) => `${b.map}/${b.action}` === rowId)))) break;
    if (i < 0) return;
    const entry = u[i];
    const items = rowId ? entry.before.filter((b) => `${b.map}/${b.action}` === rowId) : entry.before;
    const prof = s.profiles.find((p) => p.id === entry.profileId);
    if (!prof) return;
    let r = prof.rebinds;
    for (const b of items) r = setAction(r, b.map, b.action, b.value);
    const next = withRebinds(prof, r);
    const ns = { ...s, profiles: s.profiles.map((p) => (p.id === next.id ? next : p)) };
    storeRef.current = ns;
    setStore(ns);
    if (entry.swap && !rowId) swapMetaRef.current(entry.swap.slot, entry.swap.a, entry.swap.b);
    const rest = rowId ? entry.before.filter((b) => `${b.map}/${b.action}` !== rowId) : [];
    setUndo([...u.slice(0, i), ...(rest.length ? [{ ...entry, before: rest }] : []), ...u.slice(i + 1)]);
    setToast({ kind: 'ok', text: `Undone: ${entry.label}` });
  }, []);
  const canUndoRow = (rowId: string) => undo.some((e) => e.profileId === store.activeId && !e.swap && e.before.some((b) => `${b.map}/${b.action}` === rowId));
  const undoCount = undo.filter((e) => e.profileId === store.activeId).length;

  const onCaptureCell = useCallback((row: Row, device: Device, b?: Binding) => {
    setCapture({ row, group: groupOfDevice(device), replace: b ? rebindOf(row, b) : undefined, focus: device === 'mouse' ? 'mouse' : 'keyboard' });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const onRemoveCell = useCallback((row: Row, b: Binding) => {
    const g = groupOfSlot(b.slot);
    setGroupFor(row, g, effectiveGroup(IDX.get(row.id), rebindsNow(row), g).filter((r) => keyOf(r) !== keyOf(b)), `Unbind ${comboLabel(b.input, b.slot)} from ${row.label}`);
  }, [setGroupFor]); // eslint-disable-line react-hooks/exhaustive-deps
  const onEditRow = useCallback((row: Row) => setEditorId(row.id), []);
  const onBindInput = useCallback((row: Row, slot: Rebind['slot'], instance: number, input: string) => {
    const g = groupOfSlot(slot);
    const eff = effectiveGroup(IDX.get(row.id), rebindsNow(row), g);
    if (eff.some((r) => r.slot === slot && r.instance === instance && r.input === input)) return;
    setGroupFor(row, g, [...eff, { slot, instance, input }], `Bind ${comboLabel(input, slot)} to ${row.label}`);
    setToast({ kind: 'ok', text: `Bound ${slot}${instance}_${input} to ${row.label}` });
  }, [setGroupFor]); // eslint-disable-line react-hooks/exhaustive-deps

  const commitCapture = (r: Rebind, removeFrom: CaptureConflict[]) => {
    if (!capture) return;
    const { row, group, replace } = capture;
    const eff = effectiveGroup(IDX.get(row.id), rebindsNow(row), group);
    const list = replace && eff.some((x) => keyOf(x) === keyOf(replace)) ? eff.map((x) => (keyOf(x) === keyOf(replace) ? r : x)) : [...eff, r];
    const byRow = new Map<string, CaptureConflict[]>();
    for (const c of removeFrom) byRow.set(c.row.id, [...(byRow.get(c.row.id) ?? []), c]);
    applyEdit(`Bind ${comboLabel(r.input, r.slot)} to ${row.label}`, [row, ...removeFrom.map((c) => c.row)], (rb) => {
      let out = setGroup(rb, IDX.get(row.id), row.map, row.action, group, list);
      for (const items of byRow.values()) {
        const cr = items[0].row;
        const cg = groupOfSlot(items[0].binding.slot);
        const keep = effectiveGroup(IDX.get(cr.id), out[cr.map]?.[cr.action], cg).filter((x) => !items.some((c) => keyOf(c.binding) === keyOf(x)));
        out = setGroup(out, IDX.get(cr.id), cr.map, cr.action, cg, keep);
      }
      return out;
    });
    // captured from a controller that sits in no slot yet: that controller becomes the slot's hardware, so the numbering stays put
    if (r.slot === 'js' || r.slot === 'gp') {
      // read the controllers fresh: the press that was just captured may have been the one that revealed them
      const pad = describePads(getPads()).find((p) => p.kind === r.slot && p.instance === r.instance && !slotMap.slots.some((s) => s.hw?.key === p.key));
      if (pad) updateSlots((m) => {
        const gs = m.slots.find((s) => s.slot === r.slot && s.instance === r.instance);
        if (gs?.hw || m.slots.some((s) => s.hw?.key === pad.key)) return m;
        return gs ? assignHardware(m, gs, hardwareOf(pad), true) : addSlot(m, r.slot, r.instance, hardwareOf(pad));
      });
    }
    if (removeFrom.length) setToast({ kind: 'ok', text: `Bound ${comboLabel(r.input, r.slot)} and removed it from ${removeFrom.length} other action${removeFrom.length === 1 ? '' : 's'}` });
    setCapture(null);
  };
  const clearCapture = () => {
    if (!capture?.replace) return;
    const { row, group, replace } = capture;
    setGroupFor(row, group, effectiveGroup(IDX.get(row.id), rebindsNow(row), group).filter((x) => keyOf(x) !== keyOf(replace)));
    setCapture(null);
  };
  const resetRow = (row: Row) => applyEdit(`Reset ${row.label}`, [row], (r) => setAction(r, row.map, row.action, undefined));
  const resetAll = () => {
    if (!profile || !window.confirm(`Reset every binding in “${profile.name}” to the game defaults? (You can undo this.)`)) return;
    const touched = Object.entries(profile.rebinds).flatMap(([map, acts]) => Object.keys(acts).map((action) => ({ map, action })));
    applyEdit('Reset all', touched, () => ({}));
  };
  const revertImported = () => {
    if (!profile?.original) return;
    const keys = (r: RebindMap) => Object.entries(r).flatMap(([map, acts]) => Object.keys(acts).map((action) => ({ map, action })));
    applyEdit('Revert to imported file', [...keys(profile.rebinds), ...keys(profile.original)], () => JSON.parse(JSON.stringify(profile.original)));
  };
  const createLayout = (copy: boolean) => {
    const base = copy && profile ? `${profile.name} (copy)` : 'My layout';
    const p = { ...newProfile(uniqueName(store.profiles.map((x) => x.name), base), copy && profile ? JSON.parse(JSON.stringify(profile.rebinds)) : {}), ...(copy && profile ? { settings: JSON.parse(JSON.stringify(settingsOf(profile))), devices: profile.devices } : {}) };
    setStore((s) => ({ profiles: [...s.profiles, p], activeId: p.id }));
    // same desk, same controllers: the new layout starts with the current slot map (a copy, edited separately)
    setSlotStore((s) => ({ ...s, [p.id]: JSON.parse(JSON.stringify(slotMap)) }));
    setToast({ kind: 'ok', text: `Created “${p.name}”${copy ? '' : ' from the game defaults'}` });
  };
  // ---- game slot operations (Controllers modal, capture dialog, Devices view) ------------------------------
  const curProfile = () => storeRef.current.profiles.find((p) => p.id === storeRef.current.activeId) ?? null;
  const removeSlotNow = useCallback((gs: GameSlot) => {
    const prof = storeRef.current.profiles.find((p) => p.id === storeRef.current.activeId) ?? null;
    let dropped = 0;
    if (prof) {
      const r = dropSlotBindings(prof.rebinds, IDX, gs);
      dropped = r.dropped;
      if (r.touched.length) applyEdit(`Remove ${slotId(gs)} and its ${r.dropped} binding${r.dropped === 1 ? '' : 's'}`, r.touched, () => r.rebinds);
      // its device entry (<options type=… instance=…>, with its axis settings) leaves the export too
      const type = EXPORT_TYPE[gs.slot];
      if (settingsOf(prof).blocks.some((b) => b.tag === 'options' && blockType(b) === type && blockInstance(b) === gs.instance))
        applySettings(`Remove ${slotId(gs)}`, (st) => ({ ...st, blocks: st.blocks.filter((b) => !(b.tag === 'options' && blockType(b) === type && blockInstance(b) === gs.instance)) }));
    }
    updateSlots((m) => removeSlot(m, gs));
    setToast({ kind: 'ok', text: `Removed ${slotId(gs)}${dropped ? ` and dropped ${dropped} binding${dropped === 1 ? '' : 's'} (Undo restores them)` : ''}` });
  }, [applyEdit, applySettings, updateSlots]);
  const copySlotNow = useCallback((from: GameSlot, to: GameSlot, o: { clash: 'replace' | 'keep'; move: boolean; skip: Set<string> }) => {
    const prof = storeRef.current.profiles.find((p) => p.id === storeRef.current.activeId) ?? null;
    const r = copySlotBindings(prof?.rebinds ?? {}, IDX, from, to, o);
    if (!r.touched.length) return;
    applyEdit(`${o.move ? 'Move' : 'Copy'} ${slotId(from)} bindings to ${slotId(to)}`, r.touched, () => r.rebinds);
    setToast({ kind: 'ok', text: `${o.move ? 'Moved' : 'Copied'} ${r.copied} binding${r.copied === 1 ? '' : 's'} from ${slotId(from)} to ${slotId(to)}${r.replaced ? `, replaced ${r.replaced}` : ''}` });
  }, [applyEdit]);
  /** the non-binding half of a slot swap on the active profile (its own inverse): slot map, imported device list, axis-settings blocks */
  const swapSlotMeta = useCallback((slot: Slot, a: number, b: number) => {
    const s = storeRef.current;
    const prof = s.profiles.find((p) => p.id === s.activeId);
    if (prof) {
      const { optionsXml: _legacy, ...rest } = prof;
      void _legacy;
      const next = { ...rest, devices: swapProfileDevices(prof.devices, slot, a, b), settings: swapOptionInstances(settingsOf(prof), EXPORT_TYPE[slot], a, b) };
      const ns = { ...s, profiles: s.profiles.map((p) => (p.id === next.id ? next : p)) };
      storeRef.current = ns;
      setStore(ns);
    }
    updateSlots((m) => swapSlots(m, slot, a, b));
  }, [updateSlots]);
  const swapMetaRef = useRef(swapSlotMeta);
  useLayoutEffect(() => { swapMetaRef.current = swapSlotMeta; }, [swapSlotMeta]);
  /** move a js / gp slot up or down: it swaps numbers with its neighbour, bindings, hardware, template and axis settings included */
  const moveSlotNow = useCallback((gs: GameSlot, dir: -1 | 1) => {
    const other = neighbourSlot(slotMap, gs, dir);
    if (!other) return;
    const { slot } = gs, a = gs.instance, b = other.instance;
    const prof = curProfile();
    const r = swapSlotBindings(prof?.rebinds ?? {}, IDX, slot, a, b);
    const label = `Swap ${slot}${a} and ${slot}${b}`;
    if (prof || r.touched.length) applyEdit(label, r.touched, () => r.rebinds, { swap: { slot, a, b } });
    swapSlotMeta(slot, a, b);
    setToast({ kind: 'ok', text: `${label}: ${slotDeviceName(gs) ?? `${slot}${a}`} is now ${slot}${b}${r.moved ? `, ${r.moved} binding${r.moved === 1 ? '' : 's'} moved with it` : ''} (Undo reverts it)` });
  }, [slotMap, applyEdit, swapSlotMeta]); // eslint-disable-line react-hooks/exhaustive-deps
  const lastSwap = undo.length && undo[undo.length - 1].profileId === store.activeId && undo[undo.length - 1].swap ? undo[undo.length - 1].label : undefined;
  const slotActions: SlotActions = useMemo(() => ({
    map: slotMap,
    known: knownHardware(slotStore),
    assign: (gs, hw) => updateSlots((m) => assignHardware(m, gs, hw, true)),
    pickTemplate: (gs, id) => updateSlots((m) => setSlotTemplate(m, gs, id)),
    add: (slot, hw) => updateSlots((m) => addSlot(m, slot, undefined, hw)),
    remove: removeSlotNow,
    count: (gs) => slotBindingCount(curProfile()?.rebinds ?? {}, gs),
    plan: (from, to) => planCopy(curProfile()?.rebinds ?? {}, IDX, from, to),
    copy: copySlotNow,
    move: moveSlotNow,
    lastMove: lastSwap,
    undoMove: () => undoLast(),
  }), [slotMap, slotStore, updateSlots, removeSlotNow, copySlotNow, moveSlotNow, lastSwap, undoLast]); // eslint-disable-line react-hooks/exhaustive-deps
  /** the capture dialog's "this controller is js n" picker: puts the controller into that slot (adding it if needed) */
  const assignPad = useCallback((key: string, v: { kind?: PadKind; instance?: number }) => {
    const pad = pads.find((p) => p.key === key);
    if (!pad) return;
    const kind = v.kind ?? pad.kind;
    updateSlots((m) => {
      const inst = v.instance ?? m.slots.find((s) => s.slot === kind && !s.hw)?.instance;
      if (inst && m.slots.some((s) => s.slot === kind && s.instance === inst)) return assignHardware(m, { slot: kind, instance: inst }, hardwareOf(pad), true);
      return addSlot(m, kind, inst, hardwareOf(pad));
    });
  }, [pads, updateSlots]);
  /** slots as the capture dialog's device list labels them */
  const slotDevices = useMemo(() => slotMap.slots.filter(isController).map((s) => ({ slot: s.slot, instance: s.instance, product: slotDeviceName(s) ?? '' })), [slotMap]);
  /** the joystick / gamepad slots the main page shows (what the export will contain), with the controller filling each */
  const deviceSlots: SlotOption[] = useMemo(() => slotMap.slots.map((gs) => ({ gs, ...(gs.hw ? { pad: pads.find((p) => p.key === gs.hw!.key) } : {}) })), [slotMap, pads]);
  const exportDevices: ExportDevice[] = useMemo(() => slotMap.slots
    .filter((s) => isController(s) || s.instance > 1)
    .map((s) => ({ type: EXPORT_TYPE[s.slot], instance: s.instance, product: slotProduct(s, s.hw ? pads.find((p) => p.key === s.hw!.key) : undefined) })), [slotMap, pads]);
  const exportSlots: ExportSlot[] = useMemo(() => slotMap.slots.map((s) => ({ id: slotId(s), name: slotDeviceName(s) })), [slotMap]);
  const onPickSlotTemplate = useCallback((gs: GameSlot, id: string | null) => updateSlots((m) => setSlotTemplate(m, gs, id)), [updateSlots]);

  const hot = useRef({ capture: false, undo: undoLast });
  useLayoutEffect(() => { hot.current = { capture: !!capture || !!editorId || exportOpen || !!devicesOpen || settingsOpen || !!axisFor, undo: undoLast }; }, [capture, editorId, exportOpen, devicesOpen, settingsOpen, axisFor, undoLast]);

  // ---- press-to-search: the next controller input / key / mouse button becomes an exact input filter
  const onPressHit = useCallback((h: PressHit) => {
    setChip(h);
    setPressMode(false); // stays on the current view: each view applies the pressed input its own way
  }, []);
  const stopPress = useCallback(() => setPressMode(false), []);
  usePadHits(pressMode, describePads, onPressHit);
  useKeyHits(pressMode, 'capture', onPressHit, stopPress);
  // ---- live highlight: when nothing else is listening, pressing an input flashes its bindings
  const passiveOn = view !== 'devices' && highlightOn && !query && !chip && !pressMode && !(editMode && vf.edit) && !capture && !editorId && !exportOpen && !devicesOpen && !settingsOpen && !axisFor && !help;
  const onFlash = useCallback((h: PressHit) => {
    setFlash(null);
    requestAnimationFrame(() => setFlash({ hit: h, keys: hitKeys(h), at: Date.now() }));
  }, []);
  usePadHits(passiveOn, describePads, onFlash);
  useKeyHits(passiveOn, 'passive', onFlash);
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 2600);
    if (scrollOn) requestAnimationFrame(() => document.querySelector('#main [data-flash-row="1"]')?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
    return () => clearTimeout(t);
  }, [flash, scrollOn]);
  const flashCount = useMemo(() => {
    if (!flash) return 0;
    if (view === 'conflicts') return visibleConflicts.filter((g) => g.entries.some((e) => flash.keys.has(bindKey(e.binding.slot, e.binding.instance, e.binding.input)))).length;
    return visible.filter((r) => r.bindings.some((b) => flash.keys.has(bindKey(b.slot, b.instance, b.input)))).length;
  }, [flash, visible, visibleConflicts, view]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (hot.current.capture) return;
      if (e.key.toLowerCase() === 'z' && (e.ctrlKey || e.metaKey) && tag !== 'INPUT') { e.preventDefault(); hot.current.undo(); return; }
      if ((e.key === '/' && tag !== 'INPUT') || (e.key.toLowerCase() === 'k' && (e.ctrlKey || e.metaKey))) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    let depth = 0;
    const enter = (e: DragEvent) => { if (e.dataTransfer?.types.includes('Files')) { depth++; setDragging(true); } };
    const leave = () => { depth = Math.max(0, depth - 1); if (!depth) setDragging(false); };
    const over = (e: DragEvent) => e.preventDefault();
    const drop = (e: DragEvent) => {
      e.preventDefault(); depth = 0; setDragging(false);
      if (e.dataTransfer?.files.length) importFiles(e.dataTransfer.files);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('dragenter', enter);
    window.addEventListener('dragleave', leave);
    window.addEventListener('dragover', over);
    window.addEventListener('drop', drop);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('dragenter', enter);
      window.removeEventListener('dragleave', leave);
      window.removeEventListener('dragover', over);
      window.removeEventListener('drop', drop);
    };
  }, [importFiles]);

  /** filter the list by one exact input, e.g. "js1_button5" or "kb1_lalt+n" (device + instance + full combo) */
  const pickInput = useCallback((spec: string) => {
    setQuery(`key:${spec.replace(/\s/g, '')}`);
    setView('list');
  }, []);
  const onBindingClick = useCallback((b: Binding) => pickInput(searchSpec(b.slot, b.instance, b.input)), [pickInput]);
  const pickKey = useCallback((combo: string) => pickInput(searchSpec('kb', kbInst, combo)), [pickInput, kbInst]);

  const toggleDevice = (d: Device) => setDevices((s) => {
    const n = new Set(s);
    if (n.has(d) && n.size > 1) n.delete(d); else n.add(d);
    return n;
  });
  const soloDevice = (d: Device) => setDevices((s) => (s.size === 1 && s.has(d) ? new Set(ALL_DEVICES) : new Set([d])));

  const removeProfile = (id: string) => {
    setStore((s) => {
      const profiles = s.profiles.filter((p) => p.id !== id);
      return { profiles, activeId: s.activeId === id ? profiles[profiles.length - 1]?.id ?? null : s.activeId };
    });
    setSlotStore((s) => { const n = { ...s }; delete n[id]; return n; });
  };

  const editorRow = editorId ? rows.find((r) => r.id === editorId) ?? null : null;
  const meta = DEFAULTS.meta;
  const versionLabel = `${meta.branch?.replace('sc-alpha-', 'Alpha ') ?? 'Star Citizen'} ${meta.channel ?? ''}`.trim();

  const kmSlots = { kb: slotMap.slots.filter((s) => s.slot === 'kb').map((s) => s.instance), mo: slotMap.slots.filter((s) => s.slot === 'mo').map((s) => s.instance) };
  const profilePanel = (
    <ProfilePanel profiles={store.profiles} profile={profile} versionLabel={versionLabel} slots={slotMap.slots}
      connected={(gs) => !!gs.hw && pads.some((p) => p.key === gs.hw!.key)}
      onSelect={(id) => setStore((s) => ({ ...s, activeId: id }))} onImport={() => fileRef.current?.click()} onExport={() => setExportOpen(true)}
      onDelete={() => setDeleting(true)} onNew={() => createLayout(false)} onDuplicate={() => createLayout(true)} onRevert={profile?.original ? revertImported : undefined}
      onResetAll={resetAll} onOpenSlots={() => setDevicesOpen('slots')} />
  );

  return (
    <div className="relative flex h-full flex-col">
      <div className="scanline" />
      {/* ---------------- header: title, then the views (first class) ---------------- */}
      <header className="relative z-30 border-b border-edge bg-panel/80 backdrop-blur">
        <div className="flex items-center gap-3 px-5 pb-1.5 pt-2.5">
          <svg viewBox="0 0 40 40" className="h-7 w-7 text-hud drop-shadow-[0_0_8px_rgba(79,216,255,.6)]" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
            <path d="M20 2 36 11v18L20 38 4 29V11z" />
            <path d="M20 9l9 5v12l-9 5-9-5V14z" opacity=".5" />
            <path d="M14 20h12M20 14v12" />
          </svg>
          <h1 className="glow-text font-display text-xl font-bold uppercase leading-none tracking-[0.25em] text-hud2" data-testid="app-title">SC Keymap</h1>
          <span className="hidden font-mono text-[10px] uppercase tracking-[0.2em] text-slate-500 sm:inline">Star Citizen binding console · {versionLabel}</span>
          <div className="ml-auto flex items-center gap-1.5">
            <button type="button" onClick={() => setSettingsOpen(true)} data-testid="open-settings" title="Settings" aria-label="Settings"
              className="flex h-8 w-8 items-center justify-center rounded border border-edge text-slate-300 hover:border-hud/60 hover:text-hud2"><Ico name="settings" className="h-4 w-4" /></button>
            <button type="button" onClick={() => setHelp(true)} data-testid="open-help" title="Help: where are my keybind files?" aria-label="Help"
              className="flex h-8 w-8 items-center justify-center rounded border border-edge text-slate-300 hover:border-hud/60 hover:text-hud2"><Ico name="help" className="h-4 w-4" /></button>
            <input ref={fileRef} type="file" accept=".xml,text/xml,application/xml" multiple hidden
              onChange={(e) => { if (e.target.files) importFiles(e.target.files); e.target.value = ''; }} />
          </div>
        </div>
        <nav className="flex gap-1 px-4" aria-label="Views" data-testid="view-tabs">
          {VIEWS.map((v) => (
            <button key={v} type="button" onClick={() => setView(v)} aria-current={view === v ? 'page' : undefined} data-view-tab={v}
              className={`-mb-px flex items-center gap-2 border-b-2 px-3 py-2 font-display text-sm font-semibold uppercase tracking-wider transition ${view === v ? 'border-hud text-hud2 [text-shadow:0_0_12px_rgba(79,216,255,.45)]' : 'border-transparent text-slate-400 hover:text-slate-200'}`}>
              <Ico name={VIEW_META[v].icon} className="h-4 w-4" />{VIEW_META[v].label}
              {v === 'conflicts' && stats.conflicts ? <span className="rounded bg-alert/20 px-1 font-mono text-[11px] text-alert">{stats.conflicts}</span> : null}
            </button>
          ))}
        </nav>
      </header>

      {/* ---------------- body ---------------- */}
      <div className="relative z-10 flex min-h-0 flex-1">
        <aside className="hidden w-72 shrink-0 overflow-y-auto border-r border-edge bg-panel/60 p-3 scrollbar-thin md:block" data-testid="sidebar">
          {wide && profilePanel}
          {vf.categories && (
            <div className="mt-4" data-testid="categories">
              <Sidebar counts={counts} total={counts.reduce((n, c) => n + c.count, 0)} selGroup={selGroup} selMap={selMap} onSelect={(g, m) => { setSelGroup(g); setSelMap(m); }} />
            </div>
          )}
          <p className="mt-4 px-1 text-[10px] leading-relaxed text-slate-600">
            Defaults: {meta.source} from build {meta.version} ({meta.buildDate}). Unofficial fan tool; not affiliated with Cloud Imperium Games.
          </p>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          {!wide && <div className="border-b border-edge/60 p-3 md:hidden">{profilePanel}</div>}
          {/* ---------------- the view's own toolbar: search (contextual), what to show, filters, actions ---------------- */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-edge/60 bg-panel/40 px-4 py-2" data-testid="filter-bar" data-view={view}>
            <div className="relative flex min-w-[min(100%,340px)] flex-1 items-center gap-1.5 rounded-md border border-edge2 bg-black/40 pl-2.5 pr-1 focus-within:border-hud focus-within:shadow-[0_0_0_3px_rgba(79,216,255,.15)] lg:max-w-lg">
              <Ico name="search" className="pointer-events-none h-4 w-4 text-hud/70" />
              {chip && (
                <span data-testid="press-chip" title={`Exact input${chip.inputs.length > 1 ? 's' : ''}: ${hitSpecs(chip).join(' or ')}${chip.device ? `\n${chip.device}` : ''}${chip.note ? `\n${chip.note}` : ''}`}
                  className="flex shrink-0 items-center gap-1 rounded border border-mod/60 bg-mod/15 px-1.5 py-0.5 font-mono text-[11px] text-mod">
                  <Ico name="target" className="h-3 w-3" /> {hitSpecs(chip)[0]}{chip.inputs.length > 1 ? ` +${chip.inputs.length - 1}` : ''}
                  {chip.device && <span className="max-w-[9rem] truncate font-sans text-[10px] text-mod/70">· {chip.device}</span>}
                  <button type="button" aria-label="Remove input filter" onClick={() => setChip(null)} className="ml-0.5 text-mod/80 hover:text-white"><Ico name="close" className="h-3 w-3" /></button>
                </span>
              )}
              <input ref={searchRef} value={query} onChange={(e) => setQuery(e.target.value)} data-testid="search"
                onKeyDown={(e) => { if (e.key === 'Escape') { setQuery(''); setChip(null); } else if (e.key === 'Backspace' && !query && chip) setChip(null); }}
                placeholder={chip ? 'refine: type to search within these…' : SEARCH_HINT[view]}
                className="min-w-[7rem] flex-1 bg-transparent py-1.5 text-sm text-slate-100 outline-none placeholder:text-slate-500" />
              {query || chip ? (
                <button type="button" onClick={() => { setQuery(''); setChip(null); }} className="rounded px-1.5 text-xs text-slate-400 hover:text-hud2">clear</button>
              ) : (
                <kbd className="keycap !min-w-0 opacity-60">/</kbd>
              )}
              <button type="button" onClick={() => setPressMode((v) => !v)} aria-pressed={pressMode} data-testid="press-search" aria-label="Find by pressing"
                title={`Find by pressing: press a controller button, hat or axis (or a key / mouse button) to ${view === 'devices' ? 'jump to that control on its device' : view === 'conflicts' ? 'list the conflicts on that exact input' : view === 'keyboard' ? 'show only what is bound to that exact input' : 'list every action bound to that exact input'}`}
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded border transition ${pressMode ? 'animate-pulse border-mod bg-mod/25 text-mod' : 'border-transparent text-slate-400 hover:border-mod/50 hover:text-mod'}`}>
                <Ico name="target" className="h-4 w-4" />
              </button>
            </div>
            {(vf.input || (view === 'keyboard' && (kmSlots.kb.length > 1 || kmSlots.mo.length > 1))) && (
              <FilterGroup label="View" testid="section-view">
                {vf.input && (
                  <div className="flex items-center gap-0.5 rounded-md border border-edge p-0.5" role="group" aria-label="Input types" data-filter="input">
                    {ALL_DEVICES.map((d) => (
                      <button key={d} type="button" onClick={() => toggleDevice(d)} onDoubleClick={() => soloDevice(d)} aria-pressed={devices.has(d)} aria-label={DEVICE_META[d].label} data-device-filter={d}
                        title={`${DEVICE_META[d].label}: click to show or hide · double-click to show only this one`}
                        className={`flex h-7 w-8 items-center justify-center rounded transition ${devices.has(d) ? 'bg-hud/15 text-hud2 shadow-[inset_0_0_0_1px_rgba(79,216,255,.45)]' : 'text-slate-600 hover:text-slate-300'}`}>
                        <Ico name={DEVICE_META[d].icon} className="h-[18px] w-[18px]" />
                      </button>
                    ))}
                  </div>
                )}
                {view === 'keyboard' && kmSlots.kb.length > 1 && <SlotPick label="Keyboard" slot="kb" list={kmSlots.kb} value={kbInst} set={setKbInst} />}
                {view === 'keyboard' && kmSlots.mo.length > 1 && <SlotPick label="Mouse" slot="mo" list={kmSlots.mo} value={moInst} set={setMoInst} />}
              </FilterGroup>
            )}
            {(vf.unbound || vf.custom || vf.conflictOnly || vf.defaultOverlaps || (vf.categories && (selGroup || selMap))) && (
              <FilterGroup label="Filters" testid="section-filters">
                {vf.unbound && <Toggle on={showUnbound} set={setShowUnbound} label="Show unbound" testid="filter-unbound" />}
                {vf.custom && <Toggle on={customOnly} set={setCustomOnly} label="Customized only" tone="mod" disabled={!profile} testid="filter-custom" />}
                {vf.conflictOnly && <Toggle on={conflictOnly} set={setConflictOnly} label="Conflicts only" tone="alert" testid="filter-conflicts" />}
                {vf.defaultOverlaps && <span title="Also list overlaps between two game-default bindings (not only ones involving your changes)"><Toggle on={includeDefaultOverlaps} set={setIncludeDefaultOverlaps} label="Default overlaps" testid="filter-default-overlaps" /></span>}
                {vf.categories && (selGroup || selMap) && (
                  <button type="button" onClick={() => { setSelGroup(null); setSelMap(null); }} className="flex items-center gap-1 rounded border border-hud/50 bg-hud/10 px-2 py-1 text-xs text-hud2" title="Category (sidebar): click to clear">
                    <Ico name="layers" className="h-3.5 w-3.5" /> {selMap ? counts.find((c) => c.map === selMap)?.label : GROUPS.find((g) => g.id === selGroup)?.label} <Ico name="close" className="h-3 w-3" />
                  </button>
                )}
              </FilterGroup>
            )}
            <div className="ml-auto flex items-center gap-3">
              {view === 'list' && (
                <span className="font-mono text-[10px] uppercase tracking-wider text-slate-500" data-testid="list-stats">
                  <span className="text-hud2">{stats.actions}</span> actions · <span className="text-hud2">{stats.bound}</span> bound · <span className="text-mod">{stats.custom}</span> customized
                </span>
              )}
              {vf.edit && (
                <button type="button" onClick={() => setEditMode((v) => !v)} aria-pressed={editMode} data-testid="edit-toggle" title="Edit these bindings: click any binding to rebind it"
                  className={`flex items-center gap-1.5 rounded border px-2.5 py-1.5 font-display text-sm font-semibold uppercase tracking-wider transition ${editMode ? 'border-mod bg-mod/20 text-mod shadow-[0_0_18px_-6px_var(--color-mod)]' : 'border-mod/50 text-mod/90 hover:bg-mod/10'}`}>
                  <Ico name="edit" className="h-4 w-4" /> {editMode ? 'Done' : 'Edit'}
                </button>
              )}
            </div>
          </div>
          {editMode && vf.edit && (
            <div className="flex flex-wrap items-center gap-2 border-b border-mod/40 bg-mod/[0.06] px-4 py-2 text-xs" data-testid="edit-bar">
              <span className="flex items-center gap-1.5 font-display text-sm font-bold uppercase tracking-[0.2em] text-mod"><Ico name="edit" className="h-4 w-4" /> Editing</span>
              <span className="text-slate-400">
                Click a binding to rebind it, <b className="text-slate-200">+</b> to add one, hover <Ico name="close" className="h-3 w-3" /> to unbind, or click an action name for the full editor.
                Saved to <b className="text-mod">{profile ? profile.name : 'a new profile (created on first edit)'}</b>.
              </span>
              <button type="button" onClick={() => undoLast()} disabled={!undoCount} title="Undo (Ctrl+Z)" data-testid="undo"
                className="ml-auto flex items-center gap-1.5 rounded border border-edge px-2 py-1 text-slate-300 hover:border-hud/60 disabled:opacity-40"><Ico name="undo" /> Undo{undoCount ? ` (${undoCount})` : ''}</button>
            </div>
          )}
          {pressMode && (
            <div className="flex flex-wrap items-center gap-3 border-b border-mod/50 bg-mod/[0.08] px-4 py-2 text-xs" data-testid="press-bar">
              <span className="flex items-center gap-1.5 font-display text-sm font-bold uppercase tracking-[0.2em] text-mod"><Ico name="target" className="h-4 w-4" /> Find by pressing</span>
              <span className="text-slate-300">
                Press a <b>controller button</b>, push a <b>hat</b>, move an <b>axis</b>, or press a <b>key</b>: {PRESS_HINT[view]}
                {' '}(device number included, using your <button type="button" onClick={() => setDevicesOpen('slots')} className="text-hud underline-offset-2 hover:underline">game slots</button>). <b>Esc</b> cancels.
                {!pads.length && <span className="text-mod"> No controller visible yet: the first press wakes it up and already counts.</span>}
              </span>
              <span data-testid="press-mouse-pad" role="button" tabIndex={-1}
                onMouseDown={(e) => { e.preventDefault(); const n = scMouseButton(e.button); if (n) onPressHit({ slot: 'mo', instance: moInst, inputs: [comboFrom([], n)] }); }}
                onWheel={(e) => { const n = scWheel(e.deltaY); if (n) onPressHit({ slot: 'mo', instance: moInst, inputs: [n] }); }}
                onContextMenu={(e) => e.preventDefault()}
                className="flex cursor-crosshair items-center gap-1.5 rounded border border-dashed border-mod/60 px-3 py-1 font-mono text-[11px] text-mod hover:bg-mod/10"><Ico name="mouse" className="h-3.5 w-3.5" /> click / scroll here for a mouse input</span>
              <button type="button" onClick={stopPress} className="ml-auto rounded border border-edge px-2 py-1 text-slate-300 hover:border-hud/60">Cancel</button>
              <div className="w-full"><ChromiumBanner detected={pads.length} compact /></div>
            </div>
          )}
        <main className="min-w-0 flex-1 overflow-y-auto p-4 scrollbar-thin" id="main">
          {!profile && !filtered.hasQuery && view === 'list' && (
            <div className="hud-panel hud-corners mb-4 flex flex-wrap items-center gap-4 rounded-lg px-4 py-3">
              <div className="flex-1 text-sm text-slate-300">
                <span className="font-display font-semibold uppercase tracking-wider text-hud2">Showing game defaults.</span>{' '}
                Drop your <code className="text-hud/90">actionmaps.xml</code> or an exported <code className="text-hud/90">layout_*_exported.xml</code> anywhere on this page to overlay your own bindings.
              </div>
              <button type="button" onClick={loadSample} data-testid="try-sample" className="rounded border border-edge px-2.5 py-1 font-display text-xs font-semibold uppercase tracking-wider text-slate-300 hover:border-hud/60 hover:text-hud2">Try a sample</button>
              <button type="button" onClick={() => setHelp(true)} className="text-xs text-hud underline-offset-2 hover:underline">Where do I find these files?</button>
            </div>
          )}
          {view === 'list' && filtered.hiddenUnbound > 0 && (
            <div className="mb-3 flex items-center gap-3 rounded-md border border-edge/70 bg-black/30 px-3 py-2 text-xs text-slate-400">
              <span>+{filtered.hiddenUnbound} unbound action{filtered.hiddenUnbound === 1 ? '' : 's'} also match{filtered.hiddenUnbound === 1 ? 'es' : ''} this search.</span>
              <button type="button" onClick={() => setShowUnbound(true)} className="text-hud hover:underline">Show unbound</button>
            </div>
          )}
          {view === 'list' && (
            <ActionList rows={visible} grouped={!filtered.hasQuery} devices={devices} conflictsOf={conflictsOf} onBindingClick={onBindingClick}
              editMode={editMode} onCapture={onCaptureCell} onRemove={onRemoveCell} onEdit={onEditRow} flash={flash?.keys} />
          )}
          {view === 'keyboard' && <KeyboardView rows={visible} conflictRows={conflicts.byRow} onPick={pickKey} kb={kbInst} mo={moInst}
            flash={flash && (flash.hit.slot === 'kb' || flash.hit.slot === 'mo') ? { combo: flash.hit.inputs[0], at: flash.at } : null} />}
          {view === 'devices' && <DeviceView rows={rows} conflictRows={conflicts.byRow} pads={pads} describe={describePads}
            slots={deviceSlots} slotMap={slotMap} onPickTemplate={onPickSlotTemplate} onOpenControllers={() => setDevicesOpen('slots')} highlight={highlightOn} scroll={highlightOn && scrollOn}
            query={dq} chip={chip} onOpenAxis={(gs) => setAxisFor({ slot: gs.slot as 'js' | 'gp', instance: gs.instance })} axisLimit={AXIS_LIMIT}
            onEdit={onEditRow} onRemove={onRemoveCell} onBind={onBindInput} onShowInList={pickInput} notify={(kind, text) => setToast({ kind, text })} />}
          {view === 'conflicts' && <ConflictsView groups={visibleConflicts} onPick={pickInput} includeDefault={includeDefaultOverlaps} hasProfile={!!profile} flash={flash?.keys} />}
        </main>
        </div>
      </div>

      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-void/80 backdrop-blur-sm">
          <div className="hud-panel hud-corners rounded-xl border-2 border-dashed border-hud px-16 py-12 text-center">
            <div className="glow-text font-display text-3xl font-bold uppercase tracking-[0.3em] text-hud2">Drop to import</div>
            <div className="mt-2 font-mono text-xs text-slate-400">actionmaps.xml · layout_*_exported.xml</div>
          </div>
        </div>
      )}
      {flash && (
        <div data-testid="flash-badge" className="pointer-events-none fixed bottom-5 left-5 z-40 max-w-md rounded-lg border border-mod/60 bg-panel/95 px-3 py-2 text-xs shadow-xl backdrop-blur">
          <span className="font-mono font-bold text-mod">{hitSpecs(flash.hit)[0]}</span>
          <span className="ml-2 text-slate-300">{hitLabel(flash.hit)}</span>
          {flash.hit.device && <span className="ml-2 text-slate-500">{flash.hit.device}</span>}
          <span className="ml-2 text-slate-200">→ {flashCount ? (view === 'conflicts' ? `${flashCount} conflict group${flashCount === 1 ? '' : 's'}` : `${flashCount} action${flashCount === 1 ? '' : 's'}`) : view === 'conflicts' ? 'no conflict on this input' : 'not bound in this view'}</span>
          {flash.hit.note && <div className="mt-1 flex items-center gap-1 text-[10px] text-alert"><Ico name="alert" className="h-3 w-3" /> {flash.hit.note}</div>}
        </div>
      )}
      {toast && (
        <div className={`fixed bottom-5 right-5 z-50 max-w-md rounded-lg border px-4 py-3 text-sm shadow-xl backdrop-blur ${toast.kind === 'ok' ? 'border-ok/50 bg-panel/95 text-ok' : 'border-alert/60 bg-panel/95 text-alert'}`}>
          {toast.text}
        </div>
      )}
      {help && <HelpModal onClose={() => setHelp(false)} />}
      {editorRow && (
        <ActionEditor row={editorRow} action={IDX.get(editorRow.id)} rebinds={profile?.rebinds[editorRow.map]?.[editorRow.action]}
          canUndo={canUndoRow(editorRow.id)} onUndo={() => undoLast(editorRow.id)} onReset={() => resetRow(editorRow)}
          onSetGroup={(g, list) => setGroupFor(editorRow, g, list)} onCapture={(g, replace) => setCapture({ row: editorRow, group: g, replace })}
          onClose={() => setEditorId(null)} />
      )}
      {capture && (
        <CaptureDialog key={`${capture.row.id}:${capture.group}:${capture.replace?.input ?? '+'}`} {...capture} rows={rows} pads={pads} onAssign={assignPad}
          describe={describePads} profileDevices={slotDevices} kmSlots={kmSlots} kmDefault={{ kb: kbInst, mo: moInst }}
          onCommit={commitCapture} onClear={capture.replace ? clearCapture : undefined} onCancel={() => setCapture(null)} />
      )}
      {exportOpen && profile && <ExportDialog defaults={DEFAULTS} profile={profile} devices={exportDevices} slots={exportSlots} onClose={() => setExportOpen(false)} />}
      {devicesOpen && (
        <ControllersPanel profile={profile} pads={pads} describe={describePads} slots={slotActions} onClose={() => setDevicesOpen(false)} />
      )}
      {deleting && profile && (
        <DeleteProfileDialog profile={profile} slotCount={slotMap.slots.length} onCancel={() => setDeleting(false)} onExport={() => { setDeleting(false); setExportOpen(true); }}
          onConfirm={() => { const name = profile.name; removeProfile(profile.id); setDeleting(false); setToast({ kind: 'ok', text: `Deleted “${name}”` }); }} />
      )}
      {axisFor && (() => {
        const gs = slotMap.slots.find((x) => x.slot === axisFor.slot && x.instance === axisFor.instance);
        const pad = gs?.hw ? pads.find((p) => p.key === gs.hw!.key) : undefined;
        const type = axisFor.slot === 'gp' ? 'gamepad' : 'joystick';
        return <AxisSettingsModal slotLabel={`${axisFor.slot}${axisFor.instance}`} deviceName={pad?.name ?? (gs ? slotDeviceName(gs) : undefined)} onClose={() => setAxisFor(null)}
          profile={profile} settings={settingsOf(profile)} tree={DEFAULTS.optionTrees?.[type]} pads={pads} onChange={applySettings}
          type={type} instance={axisFor.instance} product={gs?.gameRawProduct ?? gs?.gameProduct ?? pad?.product} />;
      })()}
      {settingsOpen && <SettingsModal settings={appSettings} onChange={setAppSettings} onClose={() => setSettingsOpen(false)} meta={meta} versionLabel={versionLabel} />}
    </div>
  );
}

/** a labelled section of the view toolbar ("View", "Filters") */
function FilterGroup({ label, testid, children }: { label: string; testid: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2" data-testid={testid} role="group" aria-label={label}>
      <span className="font-display text-[10px] font-semibold uppercase tracking-[0.25em] text-slate-500">{label}</span>
      <div className="flex flex-wrap items-center gap-1">{children}</div>
    </div>
  );
}

/** keyboard / mouse slot picker (kb1 · kb2…) for the Keyboard view */
function SlotPick({ label, slot, list, value, set }: { label: string; slot: 'kb' | 'mo'; list: number[]; value: number; set: (n: number) => void }) {
  return (
    <div className="flex items-center gap-0.5 rounded-md border border-edge p-0.5" role="group" aria-label={`${label} slot`} data-testid={`km-slot-${slot}`}>
      <Ico name={slot === 'kb' ? 'keyboard' : 'mouse'} className="mx-1 h-4 w-4 text-slate-500" />
      {list.map((n) => (
        <button key={n} type="button" onClick={() => set(n)} aria-pressed={value === n} data-km-slot={`${slot}${n}`}
          className={`rounded px-1.5 py-0.5 font-mono text-[11px] ${value === n ? 'bg-hud/15 text-hud2' : 'text-slate-500 hover:text-slate-200'}`}>{slot}{n}</button>
      ))}
    </div>
  );
}

function Toggle({ on, set, label, tone, disabled, testid }: { on: boolean; set: (v: boolean) => void; label: string; tone?: 'mod' | 'alert'; disabled?: boolean; testid?: string }) {
  const onCls = tone === 'mod' ? 'border-mod/70 bg-mod/10 text-mod' : tone === 'alert' ? 'border-alert/70 bg-alert/10 text-alert' : 'border-hud/60 bg-hud/10 text-hud2';
  return (
    <button type="button" disabled={disabled} onClick={() => set(!on)} aria-pressed={on} data-testid={testid}
      className={`flex items-center gap-1.5 rounded border px-2.5 py-1 text-xs transition disabled:opacity-40 ${on ? onCls : 'border-edge text-slate-400 hover:text-slate-200'}`}>
      <span className={`h-2.5 w-2.5 rounded-sm border ${on ? 'border-current bg-current' : 'border-slate-500'}`} />
      {label}
    </button>
  );
}

function HelpModal({ onClose }: { onClose: () => void }) {
  useEscape(onClose);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-void/80 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="hud-panel hud-corners max-w-2xl rounded-xl p-6 text-sm text-slate-300" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-bold uppercase tracking-[0.2em] text-hud2">Importing your keybinds</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-hud2" aria-label="Close"><Ico name="close" className="h-4 w-4" /></button>
        </div>
        <ol className="mt-4 list-decimal space-y-3 pl-5">
          <li>
            <b className="text-slate-100">Your live bindings</b> — the game stores every change you make in
            <code className="mt-1 block rounded bg-black/40 px-2 py-1 font-mono text-xs text-hud/90">…\StarCitizen\LIVE\user\client\0\Profiles\default\actionmaps.xml</code>
          </li>
          <li>
            <b className="text-slate-100">An exported layout</b> — in game: Options → Keybindings → Advanced Controls Customization → Control Profiles → Save Control Settings. Files land in
            <code className="mt-1 block rounded bg-black/40 px-2 py-1 font-mono text-xs text-hud/90">…\StarCitizen\LIVE\user\client\0\Controls\Mappings\layout_&lt;name&gt;_exported.xml</code>
          </li>
          <li>Drag the file onto this page (or use <b>Import XML</b>). It is parsed locally in your browser and saved in localStorage — nothing is uploaded.</li>
        </ol>
        <h3 className="mt-5 font-display text-sm font-bold uppercase tracking-[0.2em] text-mod">Editing &amp; exporting</h3>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-slate-400">
          <li><b className="text-slate-200">Edit</b> (List view toolbar): click any binding to rebind it, <b>+</b> to add one, the cross to unbind, or an action name for the full editor (activation mode, taps, reset). Ctrl+Z undoes.</li>
          <li>Keyboard, mouse, gamepads and joysticks/HOTAS are captured live. Controllers use the browser&apos;s Gamepad API; press a button first so the browser reveals them. <b className="text-slate-200">Game slots &amp; controllers</b> (in the profile panel) lists the game slots (kb1, mo1, js1, js2…, gp1) with the hardware and template for each, and has a live input tester.</li>
          <li><b className="text-slate-200">Find by pressing</b> (the target icon inside the search box): press a controller button, hat or axis, or a key, and the current view narrows to that exact input (on Devices it jumps to that control). With <b>Highlight on press</b> on (Settings), pressing an input while you&apos;re not searching or editing briefly highlights its bindings, keys, conflict groups or device callouts.</li>
          <li><b className="text-slate-200">Axis settings &amp; curves</b> (the button on each joystick / gamepad slot in the Devices view): invert, exponent and custom response curves per control, and deadzone / saturation per axis, read from and written back to your file.</li>
          <li><b className="text-slate-200">Export</b> (profile panel) writes <code>layout_&lt;name&gt;_exported.xml</code> for <code>…\user\client\0\Controls\Mappings</code> (load via Options → Keybindings → Control Profiles, or <code>pp_RebindKeys</code>) or a full <code>actionmaps.xml</code>. Only changes from the defaults are written.</li>
        </ul>
        <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-1 font-mono text-xs text-slate-400">
          <span><span className="text-hud2">quantum</span> fuzzy search names</span>
          <span><span className="text-hud2">lalt+n</span> exact combo</span>
          <span><span className="text-hud2">key:f</span> only bindings on F</span>
          <span><span className="text-hud2">alt / ctrl / shift</span> either side</span>
          <span><span className="text-hud2">lmb · rmb · wheel</span> mouse</span>
          <span><span className="text-hud2">js1_button5 · js2 btn5</span> exact joystick input</span>
        </div>
        <p className="mt-5 text-xs text-slate-500">
          Default bindings come from the game's own <code>defaultProfile.xml</code> ({DEFAULTS.meta.branch}, build {DEFAULTS.meta.version}, {DEFAULTS.meta.buildDate}) with English labels from <code>global.ini</code>.
        </p>
        <div className="mt-2 text-xs text-slate-500">Example match: {comboLabel('lalt+n', 'kb')}</div>
      </div>
    </div>
  );
}
