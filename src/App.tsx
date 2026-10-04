import { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import defaultsJson from './data/defaults.json';
import { ActionList, columnOf } from './components/ActionList';
import { ActionEditor } from './components/ActionEditor';
import { CaptureDialog, type CaptureRequest } from './components/CaptureDialog';
import { ConflictsView } from './components/ConflictsView';
import { ControllersPanel } from './components/ControllersPanel';
import { ExportDialog } from './components/ExportDialog';
import { KeyboardView } from './components/KeyboardView';
import { DeviceView } from './components/DeviceView';
import { Sidebar, type MapCount } from './components/Sidebar';
import { findConflicts } from './lib/conflicts';
import { GROUPS } from './lib/groups';
import { usePads } from './lib/devices';
import { settingsOf, type DeviceSettings } from './lib/devopts';
import { hitKeys, hitLabel, hitSpecs, useKeyHits, usePadHits, type PressHit } from './lib/listen';
import { comboFrom, scMouseButton, scWheel } from './lib/capture';
import { ChromiumBanner } from './components/ChromiumBanner';
import { effectiveGroup, indexDefaults, newProfile, setAction, setGroup, withRebinds, type CaptureConflict } from './lib/edit';
import { bindKey, comboLabel, groupOfDevice, groupOfSlot, searchSpec } from './lib/inputs';
import { parseActionMaps, readXmlFile } from './lib/importer';
import { buildRows } from './lib/merge';
import { parseQuery, scoreRow } from './lib/search';
import { load, save, type Persisted } from './lib/storage';
import type { Binding, DefaultsData, Device, Group, Rebind, RebindMap, Row } from './lib/types';

const DEFAULTS = defaultsJson as DefaultsData;
const IDX = indexDefaults(DEFAULTS);
interface UndoEntry { profileId: string; label: string; before: { map: string; action: string; value?: Rebind[] }[] }
const keyOf = (r: { slot: Rebind['slot']; instance: number; input: string }) => bindKey(r.slot, r.instance, r.input);
const uniqueName = (names: string[], base: string) => { let n = base, i = 2; while (names.includes(n)) n = `${base} ${i++}`; return n; };
const ALL_DEVICES: Device[] = ['keyboard', 'mouse', 'joystick', 'gamepad'];
const DEVICE_META: Record<Device, { label: string; icon: string }> = {
  keyboard: { label: 'Keyboard', icon: '⌨' },
  mouse: { label: 'Mouse', icon: '🖱' },
  joystick: { label: 'Joystick / HOTAS', icon: '🕹' },
  gamepad: { label: 'Gamepad', icon: '🎮' },
};
type View = 'list' | 'keyboard' | 'conflicts' | 'devices';

export default function App() {
  const [store, setStore] = useState<Persisted>(() => load());
  useEffect(() => save(store), [store]);
  const profile = store.profiles.find((p) => p.id === store.activeId) ?? null;

  const [query, setQuery] = useState('');
  const dq = useDeferredValue(query);
  const [devices, setDevices] = useState<Set<Device>>(new Set(ALL_DEVICES));
  const [showUnbound, setShowUnbound] = useState(false);
  const [customOnly, setCustomOnly] = useState(false);
  const [conflictOnly, setConflictOnly] = useState(false);
  const [showInternal, setShowInternal] = useState(false);
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
  const [devicesOpen, setDevicesOpen] = useState<false | 'devices' | 'settings'>(false);
  const [undo, setUndo] = useState<UndoEntry[]>([]);
  // ---- press-to-search and live highlight
  const [pressMode, setPressMode] = useState(false);
  const [chip, setChip] = useState<PressHit | null>(null);
  const [flash, setFlash] = useState<{ hit: PressHit; keys: Set<string>; at: number } | null>(null);
  const [highlightOn, setHighlightOn] = useState(() => localStorage.getItem('sc-mapper:highlight') !== '0');
  const [scrollOn, setScrollOn] = useState(() => localStorage.getItem('sc-mapper:highlight-scroll') !== '0');
  useEffect(() => { localStorage.setItem('sc-mapper:highlight', highlightOn ? '1' : '0'); localStorage.setItem('sc-mapper:highlight-scroll', scrollOn ? '1' : '0'); }, [highlightOn, scrollOn]);
  const { pads, update: assignPad, reset: resetPads, describe: describePads } = usePads(!!capture || exportOpen || !!devicesOpen || pressMode || view === 'devices', profile?.devices);
  const storeRef = useRef(store);
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
  const allDevices = devices.size === ALL_DEVICES.length;
  const filtered = useMemo(() => {
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
  }, [rows, dq, chip, devices, allDevices, showUnbound, customOnly, conflictOnly, showInternal, conflicts]);

  const counts: MapCount[] = useMemo(() => {
    const m = new Map<string, MapCount>();
    for (const r of rows) {
      if (r.hidden && !showInternal) continue;
      if (!m.has(r.map)) m.set(r.map, { map: r.map, label: r.mapLabel, group: r.group, count: 0 });
    }
    for (const r of filtered.list) m.get(r.map)!.count++;
    const order = GROUPS.flatMap((g) => g.maps);
    return [...m.values()].sort((a, b) => (order.indexOf(a.map) + 1 || 999) - (order.indexOf(b.map) + 1 || 999));
  }, [rows, filtered, showInternal]);

  const visible = useMemo(
    () => filtered.list.filter((r) => (!selGroup || r.group === selGroup) && (!selMap || r.map === selMap)),
    [filtered, selGroup, selMap],
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
  const applyEdit = useCallback((label: string, touched: { map: string; action: string }[], fn: (r: RebindMap) => RebindMap) => {
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
    setUndo((u) => [...u.slice(-199), { profileId: next.id, label, before }]);
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
    for (; i >= 0; i--) if (u[i].profileId === s.activeId && (!rowId || u[i].before.some((b) => `${b.map}/${b.action}` === rowId))) break;
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
    const rest = rowId ? entry.before.filter((b) => `${b.map}/${b.action}` !== rowId) : [];
    setUndo([...u.slice(0, i), ...(rest.length ? [{ ...entry, before: rest }] : []), ...u.slice(i + 1)]);
    setToast({ kind: 'ok', text: `Undone: ${entry.label}` });
  }, []);
  const canUndoRow = (rowId: string) => undo.some((e) => e.profileId === store.activeId && e.before.some((b) => `${b.map}/${b.action}` === rowId));
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
    setToast({ kind: 'ok', text: `Created “${p.name}”${copy ? '' : ' from the game defaults'}` });
  };
  const hot = useRef({ capture: false, undo: undoLast });
  useLayoutEffect(() => { hot.current = { capture: !!capture || !!editorId || exportOpen || !!devicesOpen, undo: undoLast }; }, [capture, editorId, exportOpen, devicesOpen, undoLast]);

  // ---- press-to-search: the next controller input / key / mouse button becomes an exact input filter
  const onPressHit = useCallback((h: PressHit) => {
    setChip(h);
    setPressMode(false);
    setView((v) => (v === 'conflicts' ? 'list' : v));
  }, []);
  const stopPress = useCallback(() => setPressMode(false), []);
  usePadHits(pressMode, describePads, onPressHit);
  useKeyHits(pressMode, 'capture', onPressHit, stopPress);
  // ---- live highlight: when nothing else is listening, pressing an input flashes its bindings
  const passiveOn = view !== 'devices' && highlightOn && !query && !chip && !pressMode && !editMode && !capture && !editorId && !exportOpen && !devicesOpen && !help;
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
  const flashCount = useMemo(() => (flash ? visible.filter((r) => r.bindings.some((b) => flash.keys.has(bindKey(b.slot, b.instance, b.input)))).length : 0), [flash, visible]);

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
  const pickKey = useCallback((combo: string) => pickInput(searchSpec('kb', 1, combo)), [pickInput]);

  const toggleDevice = (d: Device) => setDevices((s) => {
    const n = new Set(s);
    if (n.has(d) && n.size > 1) n.delete(d); else n.add(d);
    return n;
  });
  const soloDevice = (d: Device) => setDevices((s) => (s.size === 1 && s.has(d) ? new Set(ALL_DEVICES) : new Set([d])));

  const removeProfile = (id: string) => setStore((s) => {
    const profiles = s.profiles.filter((p) => p.id !== id);
    return { profiles, activeId: s.activeId === id ? profiles[profiles.length - 1]?.id ?? null : s.activeId };
  });

  const editorRow = editorId ? rows.find((r) => r.id === editorId) ?? null : null;
  const meta = DEFAULTS.meta;
  const versionLabel = `${meta.branch?.replace('sc-alpha-', 'Alpha ') ?? 'Star Citizen'} ${meta.channel ?? ''}`.trim();

  return (
    <div className="relative flex h-full flex-col">
      <div className="scanline" />
      {/* ---------------- header ---------------- */}
      <header className="relative z-30 border-b border-edge bg-panel/80 backdrop-blur">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-3">
          <div className="flex items-center gap-3">
            <svg viewBox="0 0 40 40" className="h-9 w-9 text-hud drop-shadow-[0_0_8px_rgba(79,216,255,.6)]" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M20 2 36 11v18L20 38 4 29V11z" />
              <path d="M20 9l9 5v12l-9 5-9-5V14z" opacity=".5" />
              <path d="M14 20h12M20 14v12" />
            </svg>
            <div>
              <h1 className="glow-text font-display text-2xl font-bold uppercase leading-none tracking-[0.25em] text-hud2">SC Keymap</h1>
              <div className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.3em] text-slate-500">Star Citizen binding console</div>
            </div>
          </div>
          <a href={meta.sourceUrl} target="_blank" rel="noreferrer" title={`Defaults from ${meta.source}\nBuild ${meta.version} (${meta.buildDate})`}
            className="rounded border border-hud/30 bg-hud/5 px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-hud/80 hover:border-hud/60">
            Defaults · {versionLabel} · {meta.version}
          </a>
          <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
            <Stat label="actions" value={stats.actions} />
            <Stat label="bound" value={stats.bound} />
            <Stat label="customized" value={stats.custom} tone="mod" />
            <Stat label="conflicts" value={stats.conflicts} tone="alert" onClick={() => setView('conflicts')} />
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <label className="font-mono text-[10px] uppercase tracking-widest text-slate-500" htmlFor="profile">Profile</label>
            <select id="profile" value={store.activeId ?? ''} onChange={(e) => setStore((s) => ({ ...s, activeId: e.target.value || null }))}
              className="max-w-56 rounded border border-edge bg-panel2 px-2 py-1.5 text-sm text-slate-200 outline-none focus:border-hud">
              <option value="">Game defaults ({versionLabel})</option>
              {store.profiles.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.rebindCount} binds</option>)}
            </select>
            {profile && (
              <button type="button" onClick={() => removeProfile(profile.id)} title="Remove this imported profile"
                className="rounded border border-edge px-2 py-1.5 text-xs text-slate-400 hover:border-alert hover:text-alert">✕</button>
            )}
            <button type="button" onClick={() => fileRef.current?.click()}
              className="rounded border border-hud/60 bg-hud/15 px-3 py-1.5 font-display text-sm font-semibold uppercase tracking-wider text-hud2 shadow-[0_0_18px_-6px_var(--color-hud)] hover:bg-hud/25">
              ⇪ Import XML
            </button>
            <button type="button" onClick={loadSample} className="rounded border border-edge px-3 py-1.5 font-display text-sm font-semibold uppercase tracking-wider text-slate-300 hover:border-hud/60 hover:text-hud2">
              Sample
            </button>
            <button type="button" onClick={() => setEditMode((v) => !v)} aria-pressed={editMode} title="Edit bindings: click any binding to rebind it"
              className={`rounded border px-3 py-1.5 font-display text-sm font-semibold uppercase tracking-wider transition ${editMode ? 'border-mod bg-mod/20 text-mod shadow-[0_0_18px_-6px_var(--color-mod)]' : 'border-mod/50 text-mod/90 hover:bg-mod/10'}`}>
              ✎ {editMode ? 'Editing' : 'Edit'}
            </button>
            <button type="button" onClick={() => setExportOpen(true)} disabled={!profile} title={profile ? 'Export a file Star Citizen can load' : 'Import or edit bindings first'}
              className="rounded border border-ok/50 px-3 py-1.5 font-display text-sm font-semibold uppercase tracking-wider text-ok hover:bg-ok/10 disabled:opacity-40">
              ⇩ Export
            </button>
            <button type="button" onClick={() => setDevicesOpen('devices')} title="Controllers: map joysticks/gamepads to js1, js2, gp1 and test their inputs live"
              className="rounded border border-edge px-3 py-1.5 font-display text-sm font-semibold uppercase tracking-wider text-slate-300 hover:border-hud/60 hover:text-hud2">
              🕹 Controllers
            </button>
            <button type="button" onClick={() => setHelp(true)} className="rounded border border-edge px-2.5 py-1.5 font-display text-sm font-bold text-slate-300 hover:border-hud/60 hover:text-hud2" title="Where are my keybind files?">?</button>
            <input ref={fileRef} type="file" accept=".xml,text/xml,application/xml" multiple hidden
              onChange={(e) => { if (e.target.files) importFiles(e.target.files); e.target.value = ''; }} />
          </div>
        </div>
        {/* ---------------- toolbar ---------------- */}
        <div className="flex flex-wrap items-center gap-3 border-t border-edge/60 px-5 py-2.5">
          <div className="flex min-w-[min(100%,460px)] flex-1 items-center gap-1.5 lg:max-w-2xl">
            <div className="relative flex min-w-0 flex-1 items-center gap-1.5 rounded-md border border-edge2 bg-black/40 pl-3 pr-2 focus-within:border-hud focus-within:shadow-[0_0_0_3px_rgba(79,216,255,.15)]">
              <span className="pointer-events-none text-hud/70">⌕</span>
              {chip && (
                <span data-testid="press-chip" title={`Exact input${chip.inputs.length > 1 ? 's' : ''}: ${hitSpecs(chip).join(' or ')}${chip.device ? `\n${chip.device}` : ''}${chip.note ? `\n⚠ ${chip.note}` : ''}`}
                  className="flex shrink-0 items-center gap-1 rounded border border-mod/60 bg-mod/15 px-1.5 py-0.5 font-mono text-[11px] text-mod">
                  🎯 {hitSpecs(chip)[0]}{chip.inputs.length > 1 ? ` +${chip.inputs.length - 1}` : ''}
                  {chip.device && <span className="max-w-[9rem] truncate font-sans text-[10px] text-mod/70">· {chip.device}</span>}
                  <button type="button" aria-label="Remove input filter" onClick={() => setChip(null)} className="ml-0.5 text-mod/80 hover:text-white">✕</button>
                </span>
              )}
              <input ref={searchRef} value={query} onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Escape') { setQuery(''); setChip(null); } else if (e.key === 'Backspace' && !query && chip) setChip(null); }}
                placeholder={chip ? 'refine: type to search within these…' : 'Search actions, categories or inputs…  (try: quantum, lalt+n, mouse2, js1_button5, js2 btn5)'}
                className="min-w-[7rem] flex-1 bg-transparent py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500" />
              {query || chip ? (
                <button type="button" onClick={() => { setQuery(''); setChip(null); }} className="rounded px-1.5 text-xs text-slate-400 hover:text-hud2">clear</button>
              ) : (
                <kbd className="keycap !min-w-0 opacity-60">/</kbd>
              )}
            </div>
            <button type="button" onClick={() => setPressMode((v) => !v)} aria-pressed={pressMode} data-testid="press-search"
              title="Find by pressing: press a controller button, hat or axis (or a key / mouse button) to list every action bound to that exact input"
              className={`shrink-0 rounded-md border px-2.5 py-2 font-display text-xs font-semibold uppercase tracking-wider transition ${pressMode ? 'animate-pulse border-mod bg-mod/20 text-mod' : 'border-edge2 text-slate-300 hover:border-mod/60 hover:text-mod'}`}>
              🎯 {pressMode ? 'Listening…' : 'Find by pressing'}
            </button>
          </div>
          <div className="flex items-center gap-1" role="group" aria-label="Devices">
            {ALL_DEVICES.map((d) => (
              <button key={d} type="button" onClick={() => toggleDevice(d)} onDoubleClick={() => soloDevice(d)}
                title="Click to toggle · double-click to show only this device"
                className={`flex items-center gap-1.5 rounded border px-2.5 py-1.5 text-xs transition ${devices.has(d) ? 'border-hud/60 bg-hud/10 text-hud2' : 'border-edge text-slate-500 hover:text-slate-300'}`}>
                <span>{DEVICE_META[d].icon}</span>{DEVICE_META[d].label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1">
            <Toggle on={showUnbound} set={setShowUnbound} label="Show unbound" />
            <Toggle on={customOnly} set={setCustomOnly} label="Customized only" tone="mod" disabled={!profile} />
            <Toggle on={conflictOnly} set={setConflictOnly} label="Conflicts only" tone="alert" />
            <Toggle on={showInternal} set={setShowInternal} label="Internal actions" />
            <span title="When you're not searching or editing, pressing a key or controller input briefly highlights its bindings">
              <Toggle on={highlightOn} set={setHighlightOn} label="Highlight on press" tone="mod" />
            </span>
            {highlightOn && <Toggle on={scrollOn} set={setScrollOn} label="scroll to it" />}
          </div>
          <div className="ml-auto flex rounded-md border border-edge p-0.5">
            {(['list', 'keyboard', 'devices', 'conflicts'] as View[]).map((v) => (
              <button key={v} type="button" onClick={() => setView(v)}
                className={`rounded px-3 py-1 font-display text-sm font-semibold uppercase tracking-wider transition ${view === v ? 'bg-hud/20 text-hud2' : 'text-slate-400 hover:text-slate-200'}`}>
                {v === 'list' ? '☰ List' : v === 'keyboard' ? '⌨ Keyboard' : v === 'devices' ? '🕹 Devices' : `⚠ Conflicts${visibleConflicts.length ? ` ${visibleConflicts.length}` : ''}`}
              </button>
            ))}
          </div>
        </div>
        {editMode && (
          <div className="flex flex-wrap items-center gap-2 border-t border-mod/40 bg-mod/[0.06] px-5 py-2 text-xs" data-testid="edit-bar">
            <span className="font-display text-sm font-bold uppercase tracking-[0.2em] text-mod">✎ Edit mode</span>
            <span className="text-slate-400">
              Click a binding to rebind it, <b className="text-slate-200">+</b> to add one, hover ✕ to unbind, or click an action name for the full editor.
              Saved to <b className="text-mod">{profile ? profile.name : 'a new profile (created on first edit)'}</b>.
            </span>
            <span className="ml-auto flex flex-wrap items-center gap-1.5">
              <button type="button" onClick={() => undoLast()} disabled={!undoCount} title="Undo (Ctrl+Z)" className="rounded border border-edge px-2 py-1 text-slate-300 hover:border-hud/60 disabled:opacity-40">↶ Undo{undoCount ? ` (${undoCount})` : ''}</button>
              <button type="button" onClick={() => setDevicesOpen('devices')} className="rounded border border-edge px-2 py-1 text-slate-300 hover:border-hud/60">🕹 Controllers</button>
              <button type="button" onClick={() => setDevicesOpen('settings')} data-testid="open-curves" className="rounded border border-edge px-2 py-1 text-slate-300 hover:border-hud/60">📈 Axis settings &amp; curves</button>
              <button type="button" onClick={() => createLayout(false)} className="rounded border border-edge px-2 py-1 text-slate-300 hover:border-hud/60">New from defaults</button>
              {profile && <button type="button" onClick={() => createLayout(true)} className="rounded border border-edge px-2 py-1 text-slate-300 hover:border-hud/60">Duplicate</button>}
              {profile?.original && <button type="button" onClick={revertImported} className="rounded border border-edge px-2 py-1 text-slate-300 hover:border-mod hover:text-mod">Revert to imported</button>}
              <button type="button" onClick={resetAll} disabled={!profile?.rebindCount} className="rounded border border-edge px-2 py-1 text-slate-300 hover:border-alert hover:text-alert disabled:opacity-40">Reset all</button>
            </span>
          </div>
        )}
        {pressMode && (
          <div className="flex flex-wrap items-center gap-3 border-t border-mod/50 bg-mod/[0.08] px-5 py-2 text-xs" data-testid="press-bar">
            <span className="font-display text-sm font-bold uppercase tracking-[0.2em] text-mod">🎯 Find by pressing</span>
            <span className="text-slate-300">
              Press a <b>controller button</b>, push a <b>hat</b>, move an <b>axis</b>, or press a <b>key</b>: the list shows every action bound to that exact input
              (device number included, using your <button type="button" onClick={() => setDevicesOpen('devices')} className="text-hud underline-offset-2 hover:underline">controller numbering</button>). <b>Esc</b> cancels.
              {!pads.length && <span className="text-mod"> No controller visible yet: the first press wakes it up and already counts.</span>}
            </span>
            <span data-testid="press-mouse-pad" role="button" tabIndex={-1}
              onMouseDown={(e) => { e.preventDefault(); const n = scMouseButton(e.button); if (n) onPressHit({ slot: 'mo', instance: 1, inputs: [comboFrom([], n)] }); }}
              onWheel={(e) => { const n = scWheel(e.deltaY); if (n) onPressHit({ slot: 'mo', instance: 1, inputs: [n] }); }}
              onContextMenu={(e) => e.preventDefault()}
              className="cursor-crosshair rounded border border-dashed border-mod/60 px-3 py-1 font-mono text-[11px] text-mod hover:bg-mod/10">🖱 click / scroll here for a mouse input</span>
            <button type="button" onClick={stopPress} className="ml-auto rounded border border-edge px-2 py-1 text-slate-300 hover:border-hud/60">Cancel</button>
            <div className="w-full"><ChromiumBanner detected={pads.length} compact /></div>
          </div>
        )}
      </header>

      {/* ---------------- body ---------------- */}
      <div className="relative z-10 flex min-h-0 flex-1">
        <aside className="hidden w-72 shrink-0 overflow-y-auto border-r border-edge bg-panel/60 p-3 scrollbar-thin md:block">
          <Sidebar counts={counts} total={filtered.list.length} selGroup={selGroup} selMap={selMap} onSelect={(g, m) => { setSelGroup(g); setSelMap(m); }} />
          {profile && (
            <div className="mt-4 rounded border border-edge/70 bg-black/20 p-3 text-xs text-slate-400">
              <div className="font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-mod">Active profile</div>
              <div className="mt-1 truncate text-slate-200" title={profile.fileName}>{profile.name}</div>
              <div className="font-mono text-[10px] text-slate-500">{profile.fileName} · {new Date(profile.importedAt).toLocaleString()}</div>
              {profile.devices.length > 0 && (
                <ul className="mt-2 space-y-0.5">
                  {profile.devices.map((d, i) => (
                    <li key={i} className="flex gap-2 font-mono text-[10px]"><span className="w-8 text-hud/70">{d.slot.toUpperCase()}{d.instance}</span><span className="truncate">{d.product}</span></li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <p className="mt-4 px-1 text-[10px] leading-relaxed text-slate-600">
            Defaults: {meta.source} from build {meta.version} ({meta.buildDate}). Unofficial fan tool; not affiliated with Cloud Imperium Games.
          </p>
        </aside>
        <main className="min-w-0 flex-1 overflow-y-auto p-4 scrollbar-thin" id="main">
          {!profile && !filtered.hasQuery && view === 'list' && (
            <div className="hud-panel hud-corners mb-4 flex flex-wrap items-center gap-4 rounded-lg px-4 py-3">
              <div className="flex-1 text-sm text-slate-300">
                <span className="font-display font-semibold uppercase tracking-wider text-hud2">Showing game defaults.</span>{' '}
                Drop your <code className="text-hud/90">actionmaps.xml</code> or an exported <code className="text-hud/90">layout_*_exported.xml</code> anywhere on this page to overlay your own bindings.
              </div>
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
          {view === 'keyboard' && <KeyboardView rows={visible} conflictRows={conflicts.byRow} onPick={pickKey}
            flash={flash && (flash.hit.slot === 'kb' || flash.hit.slot === 'mo') ? { combo: flash.hit.inputs[0], at: flash.at } : null} />}
          {view === 'devices' && <DeviceView rows={rows} conflictRows={conflicts.byRow} pads={pads} describe={describePads} profileDevices={profile?.devices ?? []}
            onEdit={onEditRow} onRemove={onRemoveCell} onBind={onBindInput} onShowInList={pickInput} notify={(kind, text) => setToast({ kind, text })} />}
          {view === 'conflicts' && <ConflictsView groups={visibleConflicts} onPick={pickInput} includeDefault={includeDefaultOverlaps} setIncludeDefault={setIncludeDefaultOverlaps} hasProfile={!!profile} />}
        </main>
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
          <span className="ml-2 text-slate-200">→ {flashCount ? `${flashCount} action${flashCount === 1 ? '' : 's'}` : 'not bound in this view'}</span>
          {flash.hit.note && <div className="mt-1 text-[10px] text-alert">⚠ {flash.hit.note}</div>}
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
          describe={describePads} profileDevices={profile?.devices}
          onCommit={commitCapture} onClear={capture.replace ? clearCapture : undefined} onCancel={() => setCapture(null)} />
      )}
      {exportOpen && profile && <ExportDialog defaults={DEFAULTS} profile={profile} pads={pads} onClose={() => setExportOpen(false)} />}
      {devicesOpen && (
        <ControllersPanel profile={profile} pads={pads} describe={describePads} onAssign={assignPad} onReset={resetPads} onClose={() => setDevicesOpen(false)}
          settings={settingsOf(profile)} tree={DEFAULTS.optionTrees?.joystick} onSettings={applySettings} initialTab={devicesOpen === 'settings' ? 'settings' : 'devices'} />
      )}
    </div>
  );
}

function Stat({ label, value, tone, onClick }: { label: string; value: number; tone?: 'mod' | 'alert'; onClick?: () => void }) {
  const c = tone === 'mod' ? 'text-mod' : tone === 'alert' ? 'text-alert' : 'text-hud2';
  return (
    <button type="button" onClick={onClick} disabled={!onClick} className="rounded border border-edge/80 bg-black/30 px-2 py-1 enabled:hover:border-hud/50">
      <span className={`font-semibold ${c}`}>{value}</span> <span className="uppercase tracking-wider text-slate-500">{label}</span>
    </button>
  );
}

function Toggle({ on, set, label, tone, disabled }: { on: boolean; set: (v: boolean) => void; label: string; tone?: 'mod' | 'alert'; disabled?: boolean }) {
  const onCls = tone === 'mod' ? 'border-mod/70 bg-mod/10 text-mod' : tone === 'alert' ? 'border-alert/70 bg-alert/10 text-alert' : 'border-hud/60 bg-hud/10 text-hud2';
  return (
    <button type="button" disabled={disabled} onClick={() => set(!on)} aria-pressed={on}
      className={`flex items-center gap-1.5 rounded border px-2.5 py-1.5 text-xs transition disabled:opacity-40 ${on ? onCls : 'border-edge text-slate-400 hover:text-slate-200'}`}>
      <span className={`h-2.5 w-2.5 rounded-sm border ${on ? 'border-current bg-current' : 'border-slate-500'}`} />
      {label}
    </button>
  );
}

function HelpModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-void/80 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="hud-panel hud-corners max-w-2xl rounded-xl p-6 text-sm text-slate-300" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl font-bold uppercase tracking-[0.2em] text-hud2">Importing your keybinds</h2>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-hud2">✕</button>
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
          <li><b className="text-slate-200">✎ Edit</b>: click any binding to rebind it, <b>+</b> to add one, ✕ to unbind, or an action name for the full editor (activation mode, taps, reset). Ctrl+Z undoes.</li>
          <li>Keyboard, mouse, gamepads and joysticks/HOTAS are captured live. Controllers use the browser&apos;s Gamepad API; press a button first so the browser reveals them. <b className="text-slate-200">🕹 Controllers</b> maps each device to its game number (js1, js2…, gp1) and has a live input tester.</li>
          <li><b className="text-slate-200">🎯 Find by pressing</b> (next to the search box): press a controller button, hat or axis, or a key, and the list shows everything bound to that exact input. With <b>Highlight on press</b> on, pressing an input while you&apos;re not searching or editing briefly highlights its bindings.</li>
          <li><b className="text-slate-200">📈 Axis settings &amp; curves</b> (🕹 Controllers → second tab): invert, exponent and custom response curves per control, and deadzone / saturation per axis, read from and written back to your file.</li>
          <li><b className="text-slate-200">⇩ Export</b> writes <code>layout_&lt;name&gt;_exported.xml</code> for <code>…\user\client\0\Controls\Mappings</code> (load via Options → Keybindings → Control Profiles, or <code>pp_RebindKeys</code>) or a full <code>actionmaps.xml</code>. Only changes from the defaults are written.</li>
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
