import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import defaultsJson from './data/defaults.json';
import { ActionList, columnOf } from './components/ActionList';
import { ConflictsView } from './components/ConflictsView';
import { KeyboardView } from './components/KeyboardView';
import { Sidebar, type MapCount } from './components/Sidebar';
import { findConflicts } from './lib/conflicts';
import { GROUPS } from './lib/groups';
import { comboLabel, normalizeCombo } from './lib/inputs';
import { parseActionMaps, readXmlFile } from './lib/importer';
import { buildRows } from './lib/merge';
import { parseQuery, scoreRow } from './lib/search';
import { load, save, type Persisted } from './lib/storage';
import type { Binding, DefaultsData, Device, Row } from './lib/types';

const DEFAULTS = defaultsJson as DefaultsData;
const ALL_DEVICES: Device[] = ['keyboard', 'mouse', 'joystick', 'gamepad'];
const DEVICE_META: Record<Device, { label: string; icon: string }> = {
  keyboard: { label: 'Keyboard', icon: '⌨' },
  mouse: { label: 'Mouse', icon: '🖱' },
  joystick: { label: 'Joystick / HOTAS', icon: '🕹' },
  gamepad: { label: 'Gamepad', icon: '🎮' },
};
type View = 'list' | 'keyboard' | 'conflicts';

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
    const hasQuery = q.terms.length + q.keyTerms.length > 0;
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
  }, [rows, dq, devices, allDevices, showUnbound, customOnly, conflictOnly, showInternal, conflicts]);

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

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
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

  const pickInput = useCallback((combo: string) => {
    setQuery(`key:${normalizeCombo(combo).replace(/\s/g, '')}`);
    setView('list');
  }, []);
  const onBindingClick = useCallback((b: Binding) => pickInput(b.input), [pickInput]);

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
            <button type="button" onClick={() => setHelp(true)} className="rounded border border-edge px-2.5 py-1.5 font-display text-sm font-bold text-slate-300 hover:border-hud/60 hover:text-hud2" title="Where are my keybind files?">?</button>
            <input ref={fileRef} type="file" accept=".xml,text/xml,application/xml" multiple hidden
              onChange={(e) => { if (e.target.files) importFiles(e.target.files); e.target.value = ''; }} />
          </div>
        </div>
        {/* ---------------- toolbar ---------------- */}
        <div className="flex flex-wrap items-center gap-3 border-t border-edge/60 px-5 py-2.5">
          <div className="relative min-w-[280px] flex-1 lg:max-w-xl">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-hud/70">⌕</span>
            <input ref={searchRef} value={query} onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && setQuery('')}
              placeholder="Search actions, categories or keys…  (try: quantum, lalt+n, mouse2, key:f)"
              className="w-full rounded-md border border-edge2 bg-black/40 py-2 pl-9 pr-16 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-hud focus:shadow-[0_0_0_3px_rgba(79,216,255,.15)]" />
            {query ? (
              <button type="button" onClick={() => setQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-1.5 text-xs text-slate-400 hover:text-hud2">clear</button>
            ) : (
              <kbd className="keycap absolute right-2 top-1/2 -translate-y-1/2 !min-w-0 opacity-60">/</kbd>
            )}
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
          </div>
          <div className="ml-auto flex rounded-md border border-edge p-0.5">
            {(['list', 'keyboard', 'conflicts'] as View[]).map((v) => (
              <button key={v} type="button" onClick={() => setView(v)}
                className={`rounded px-3 py-1 font-display text-sm font-semibold uppercase tracking-wider transition ${view === v ? 'bg-hud/20 text-hud2' : 'text-slate-400 hover:text-slate-200'}`}>
                {v === 'list' ? '☰ List' : v === 'keyboard' ? '⌨ Keyboard' : `⚠ Conflicts${visibleConflicts.length ? ` ${visibleConflicts.length}` : ''}`}
              </button>
            ))}
          </div>
        </div>
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
            <ActionList rows={visible} grouped={!filtered.hasQuery} devices={devices} conflictsOf={conflictsOf} onBindingClick={onBindingClick} />
          )}
          {view === 'keyboard' && <KeyboardView rows={visible} conflictRows={conflicts.byRow} onPick={pickInput} />}
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
      {toast && (
        <div className={`fixed bottom-5 right-5 z-50 max-w-md rounded-lg border px-4 py-3 text-sm shadow-xl backdrop-blur ${toast.kind === 'ok' ? 'border-ok/50 bg-panel/95 text-ok' : 'border-alert/60 bg-panel/95 text-alert'}`}>
          {toast.text}
        </div>
      )}
      {help && <HelpModal onClose={() => setHelp(false)} />}
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
        <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-1 font-mono text-xs text-slate-400">
          <span><span className="text-hud2">quantum</span> fuzzy search names</span>
          <span><span className="text-hud2">lalt+n</span> exact combo</span>
          <span><span className="text-hud2">key:f</span> only bindings on F</span>
          <span><span className="text-hud2">alt / ctrl / shift</span> either side</span>
          <span><span className="text-hud2">lmb · rmb · wheel</span> mouse</span>
          <span><span className="text-hud2">btn3 · hat1</span> joystick</span>
        </div>
        <p className="mt-5 text-xs text-slate-500">
          Default bindings come from the game's own <code>defaultProfile.xml</code> ({DEFAULTS.meta.branch}, build {DEFAULTS.meta.version}, {DEFAULTS.meta.buildDate}) with English labels from <code>global.ini</code>.
        </p>
        <div className="mt-2 text-xs text-slate-500">Example match: {comboLabel('lalt+n', 'kb')}</div>
      </div>
    </div>
  );
}
