import { useEffect, useMemo, useRef, useState } from 'react';
import { isHatRest, JS_AXES } from '../lib/capture';
import { clampTo, gamePercent, inRange, RANGES, tidyCurve, WIKI_DEADZONE, type SettingRange } from '../lib/ranges';
import { getPads, parseProfileProduct, type PadInfo } from '../lib/devices';
import {
  axisBlockName, axisValues, blockInstance, blockProduct, blockType, curveAt, groupValues, JOYSTICK_SETTING_INSTANCES, JS_AXIS_INPUTS, optionsBlock,
  resetGroup, response, setAxis, setGroup, type DeviceSettings, type OptionsBlock, type AxisBlock,
} from '../lib/devopts';
import type { OptionTree, OptionTreeGroup, Profile } from '../lib/types';
import { Ico } from './icons';
import { useEscape } from './useEscape';

type Change = (label: string, fn: (s: DeviceSettings) => DeviceSettings) => void;
interface Pt { x: number; y: number }

const shortName = (product?: string) => (product ? parseProfileProduct(product).name || product.trim() : '');

export type SettingsType = 'joystick' | 'gamepad';
const SLOT_OF: Record<SettingsType, 'js' | 'gp'> = { joystick: 'js', gamepad: 'gp' };
/** how many device numbers of a type the game keeps curve / axis settings for (the option tree's instance count; gamepad: 1) */
export const settingsInstances = (type: SettingsType, tree?: OptionTree) => tree?.instances ?? (type === 'joystick' ? JOYSTICK_SETTING_INSTANCES : 1);

/**
 * Per-device settings the game stores in actionmaps.xml / layout exports, for ONE game device (js3, gp1…): invert / exponent /
 * custom curve per option group (<options type="joystick" instance="N">) and, for joysticks, deadzone & saturation per axis
 * (<deviceoptions>, per device model).
 */
export function DeviceSettingsEditor({ profile, settings, tree, pads, onChange, type, instance: inst, product: knownProduct }: {
  profile: Profile | null; settings: DeviceSettings; tree?: OptionTree; pads: PadInfo[]; onChange: Change;
  type: SettingsType; instance: number; product?: string;
}) {
  const slot = SLOT_OF[type];
  const isJs = type === 'joystick';
  const [sel, setSel] = useState<string>('flight_move_pitch');
  const [filter, setFilter] = useState('');
  const [previewAxis, setPreviewAxis] = useState('');
  const maxInst = settingsInstances(type, tree);

  const block0 = optionsBlock(settings, type, inst);
  const pd = profile?.devices.find((d) => d.slot === slot && d.instance === inst);
  const product = (block0 && blockProduct(block0)) || pd?.rawProduct || pd?.product || knownProduct || pads.find((p) => p.kind === slot && p.instance === inst)?.product;
  const pad = pads.find((p) => p.kind === slot && p.instance === inst);
  const groups = useMemo(() => (tree?.groups ?? []).filter((g) => g.showCurve !== 0 || g.showInvert !== 0), [tree]);
  const byName = useMemo(() => new Map((tree?.groups ?? []).map((g) => [g.name, g])), [tree]);
  const pathOf = (g: OptionTreeGroup) => {
    const out: string[] = [];
    for (let p = g.parent ? byName.get(g.parent) : undefined; p && p.depth >= 3; p = p.parent ? byName.get(p.parent) : undefined) out.unshift(p.label);
    return out.join(' › ');
  };
  const block = block0;
  const unknown = (block?.groups ?? []).filter((g) => !byName.has(g.name));
  const q = filter.trim().toLowerCase();
  const shown = groups.filter((g) => !q || `${g.label} ${g.name} ${pathOf(g)}`.toLowerCase().includes(q));
  const selTree = byName.get(sel);
  const vals = groupValues(settings, type, inst, sel);
  const axes = isJs && product ? axisValues(settings, product) : {};
  const others = settings.blocks.filter((b) => (b.tag === 'deviceoptions' ? !isJs || !product || shortName(axisBlockName(b)) !== shortName(product) : blockType(b) !== type || blockInstance(b) !== inst));
  const set = (label: string, fn: (s: DeviceSettings) => DeviceSettings) => onChange(`${label} (${slot}${inst})`, fn);

  return (
    <div className="space-y-4" data-testid="device-settings" data-instance={`${slot}${inst}`}>
      <div className="rounded border border-hud/30 bg-hud/5 p-3 text-xs leading-relaxed text-slate-300">
        The settings Star Citizen saves for <b className="font-mono text-hud2">{slot}{inst}</b> in <code>actionmaps.xml</code> and exported layouts, read from your imported file and written back on export.
        <b> Invert</b>, <b>exponent</b> and <b>custom curves</b> are set per control (pitch, yaw, strafe…) and only change this device.
        {isJs
          ? <> <b>Deadzone</b> and <b>saturation</b> are set per axis of a device <i>model</i>: the game stores them by product name, so identical devices share them.
            {' '}The game keeps these settings for <b>js1–js{maxInst}</b> only.</>
          : <> The game keeps gamepad settings for <b>gp1</b> only, and has no per-axis deadzone table for gamepads here.</>}
        {' '}The chart is an approximation: the game&apos;s exact maths isn&apos;t published.
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
        <section className="space-y-3">
          <div className="text-xs text-slate-400">
            <span className="font-mono font-bold text-hud2">{slot}{inst}</span>{' '}
            {product ? <span className="text-slate-100">{shortName(product)}</span> : <span className="text-slate-500">{isJs ? 'no device known for this number (import a profile or connect it)' : 'no device name known (fine: gamepad settings don\'t need one)'}</span>}
            {pad && <span className="ml-2 rounded border border-ok/40 px-1 font-mono text-[10px] text-ok">connected: {pad.name}</span>}
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <h4 className="font-display text-xs font-bold uppercase tracking-[0.2em] text-mod">Controls</h4>
              <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="filter: pitch, strafe, turret…"
                className="ml-auto w-48 rounded border border-edge bg-black/40 px-2 py-0.5 text-[11px] text-slate-200 outline-none focus:border-hud" />
            </div>
            <ul className="mt-2 max-h-[420px] space-y-0.5 overflow-y-auto pr-1 scrollbar-thin" data-testid="settings-groups">
              {shown.map((g) => {
                const v = groupValues(settings, type, inst, g.name);
                const head = g.showCurve === -1 || g.showInvert === -1;
                return (
                  <li key={g.name}>
                    <button type="button" onClick={() => setSel(g.name)} data-group={g.name}
                      className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left text-xs ${sel === g.name ? 'bg-hud/15 text-hud2' : 'text-slate-300 hover:bg-white/5'}`}
                      style={{ paddingLeft: 8 + Math.max(0, g.depth - 3) * 12 }}>
                      <span className={head ? 'font-semibold uppercase tracking-wide text-slate-400' : ''}>{g.label}</span>
                      <span className="font-mono text-[9px] text-slate-600">{g.name}</span>
                      <span className="ml-auto flex gap-1 font-mono text-[9px]">
                        {v?.invert !== undefined && <span className={`rounded px-1 ${v.invert ? 'bg-mod/25 text-mod' : 'bg-white/5 text-slate-400'}`}>{v.invert ? 'inverted' : 'not inv.'}</span>}
                        {v?.exponent !== undefined && <span className="rounded bg-hud/20 px-1 text-hud2">exp {v.exponent}</span>}
                        {v?.curve && <span className="rounded bg-hud/20 px-1 text-hud2">curve {v.curve.length}pt</span>}
                      </span>
                    </button>
                  </li>
                );
              })}
              {unknown.map((g) => (
                <li key={`u-${g.name}`} className="flex items-center gap-2 rounded px-2 py-1 text-xs text-slate-500" title="Kept as imported">
                  <span className="font-mono text-[10px]">{g.name}</span><span className="text-[10px]">not in this game version&apos;s option tree (kept as is)</span>
                  <button type="button" onClick={() => set(`Remove ${g.name}`, (s) => resetGroup(s, type, inst, g.name))} className="ml-auto text-[10px] text-slate-500 hover:text-alert">remove</button>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="rounded-lg border border-edge/70 bg-black/25 p-3">
          {selTree ? (
            <GroupEditor key={`${inst}:${sel}`} g={selTree} path={pathOf(selTree)} vals={vals} axes={axes} pad={isJs ? pad : undefined} axis={isJs ? previewAxis : ''} setAxis={setPreviewAxis} preview={isJs}
              onPatch={(label, patch) => set(label, (s) => setGroup(s, type, inst, sel, patch.curve ? { ...patch, curve: tidyCurve(patch.curve) } : patch, product))}
              onReset={() => set(`Reset ${sel}`, (s) => resetGroup(s, type, inst, sel))} />
          ) : <p className="text-xs text-slate-500">Pick a control on the left.</p>}
        </section>
      </div>
      {isJs && <AxisTable product={product} axes={axes} pad={pad} selected={previewAxis} onSelect={setPreviewAxis}
        onSet={(input, key, v) => product && set(`${key} ${input}`, (s) => setAxis(s, product, input, key, v))} />}
      <RangesInfo />

      {others.length > 0 && (
        <details className="rounded border border-edge/60 bg-black/20 p-3 text-xs text-slate-400">
          <summary className="cursor-pointer font-display text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Other settings in this profile ({others.length}) · kept unchanged on export</summary>
          <ul className="mt-2 space-y-1 font-mono text-[10px]">
            {others.map((b, i) => <li key={i}>{describeBlock(b)}</li>)}
          </ul>
        </details>
      )}
    </div>
  );
}

function describeBlock(b: OptionsBlock | AxisBlock): string {
  if (b.tag === 'deviceoptions') {
    const name = b.attrs.find((a) => a[0] === 'name')?.[1] ?? '';
    return `deviceoptions “${shortName(name)}”: ${b.entries.map((e) => e.filter(([k]) => k !== 'input').map(([k, v]) => `${e.find((x) => x[0] === 'input')?.[1]} ${k}=${v}`).join(' ')).filter((x, i, a) => a.indexOf(x) === i).join(', ') || 'empty'}`;
  }
  return `${blockType(b)}${blockInstance(b)} ${shortName(blockProduct(b))}: ${b.groups.map((g) => `${g.name}${g.attrs.map(([k, v]) => ` ${k}=${v}`).join('')}${g.curve?.points.length ? ` curve(${g.curve.points.length})` : ''}`).join(', ') || 'no settings'}`;
}

function AxisTable({ product, axes, pad, selected, onSelect, onSet }: {
  product?: string; axes: Record<string, { deadzone?: number; saturation?: number }>; pad?: PadInfo; selected: string; onSelect: (a: string) => void;
  onSet: (input: string, key: 'deadzone' | 'saturation', v: number | null) => void;
}) {
  const inputs = [...JS_AXIS_INPUTS, ...Object.keys(axes).filter((k) => !JS_AXIS_INPUTS.includes(k))];
  const live = useLiveAxes(pad);
  return (
    <section className="rounded-lg border border-edge/70 bg-black/25 p-3" data-testid="axis-table">
      <div className="flex flex-wrap items-baseline gap-2">
        <h4 className="font-display text-xs font-bold uppercase tracking-[0.2em] text-mod">Axis deadzone &amp; saturation</h4>
        {product && <span className="text-[10px] text-slate-500">for every “{shortName(product)}” (the game stores these by product name) · empty = game default · click a row to preview it on the curve</span>}
      </div>
      {!product ? <p className="mt-1 text-[11px] text-slate-500">Needs the device&apos;s product name: import a profile that lists this joystick, or connect it and assign it to this number.</p> : (
        <table className="mt-2 w-full text-[11px]">
          <thead>
            <tr className="text-left font-mono text-[9px] uppercase tracking-widest text-slate-500">
              <th className="py-0.5">Axis</th>
              <th title={RANGES.deadzone.note}>Deadzone <span className="normal-case tracking-normal text-slate-600">{RANGES.deadzone.min}–{RANGES.deadzone.max}{RANGES.deadzone.confirmed ? '' : ' (conservative)'}</span></th>
              <th title={RANGES.saturation.note}>Saturation <span className="normal-case tracking-normal text-slate-600">{RANGES.saturation.min}–{RANGES.saturation.max}{RANGES.saturation.confirmed ? '' : ' (conservative)'}, default {RANGES.saturation.def}</span></th>
              <th>Live {pad ? '' : <span className="normal-case tracking-normal text-slate-600">(connect &amp; assign the device)</span>}</th>
            </tr>
          </thead>
          <tbody>
            {inputs.map((a) => {
              const idx = JS_AXES.indexOf(a);
              const raw = idx >= 0 ? live?.[idx] : undefined;
              const v = axes[a] ?? {};
              return (
                <tr key={a} data-axis={a} onClick={(e) => { if (!(e.target as HTMLElement).closest('input,button')) onSelect(a); }}
                  className={`cursor-pointer border-t border-edge/40 ${selected === a ? 'bg-hud/10' : 'hover:bg-white/[0.03]'}`}>
                  <td className="py-1 font-mono text-slate-300">{a}{selected === a && <span className="ml-1 text-[9px] text-hud"><Ico name="eye" /> preview</span>}</td>
                  {(['deadzone', 'saturation'] as const).map((k) => (
                    <td key={k} className="pr-3">
                      <SliderField key={product} range={RANGES[k]} value={v[k]} label={`${k} ${a}`} sliderLabel={`${a} ${k} slider`}
                        hint={k === 'deadzone' && v.deadzone === undefined && WIKI_DEADZONE[a] !== undefined ? `default (2.x wiki: ${WIKI_DEADZONE[a]})` : undefined}
                        onSet={(x) => onSet(a, k, x)} />
                    </td>
                  ))}
                  <td><AxisBar raw={raw !== undefined && !isHatRest(raw) ? raw : undefined} dz={v.deadzone} sat={v.saturation} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}

/** slider (coarse) + number field (precise) for one setting, clamped to its range; an unset value shows the default greyed out */
function SliderField({ range, value, label, sliderLabel, hint, onSet }: {
  range: SettingRange; value?: number; label: string; sliderLabel: string; hint?: string; onSet: (v: number | null) => void;
}) {
  const shown = value ?? range.def ?? range.min;
  const out = value !== undefined && !inRange(range, value);
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <input type="range" min={range.min} max={range.max} step={range.step} value={clampTo(range, shown)} aria-label={sliderLabel}
        data-unset={value === undefined ? '1' : undefined} onChange={(e) => onSet(Number(e.target.value))}
        className={`w-28 accent-[var(--color-hud)] ${value === undefined ? 'opacity-40' : ''}`} />
      <NumField value={value} min={range.min} max={range.max} step={range.step} label={label} onSet={onSet} />
      {value !== undefined && (range.key === 'deadzone' || range.key === 'saturation') && <span className="font-mono text-[9px] text-slate-500" title="value ÷ 0.0099: the game writes these in 1 % slider steps scaled by 0.99 (inferred from real files)">≈{gamePercent(value)}%</span>}
      {out && <span className="text-[9px] text-mod" title={range.note}>outside {range.min}–{range.max}: kept as imported</span>}
      {hint && <span className="text-[9px] text-slate-600">{hint}</span>}
    </span>
  );
}

/** live raw axis position with the deadzone / saturation zones and the resulting output */
function AxisBar({ raw, dz = 0, sat }: { raw?: number; dz?: number; sat?: number }) {
  const W = 150, H = 16, X = (v: number) => ((v + 1) / 2) * W;
  const s = sat && sat > dz ? sat : 1;
  const outV = raw === undefined ? undefined : response(raw, { deadzone: dz, saturation: s });
  return (
    <svg width={W} height={H} className="rounded bg-black/40" data-testid="axis-bar" data-raw={raw === undefined ? undefined : raw.toFixed(3)} data-out={outV === undefined ? undefined : outV.toFixed(3)}>
      <rect x={X(-dz)} y={0} width={X(dz) - X(-dz)} height={H} fill="rgba(148,163,184,.25)"><title>deadzone</title></rect>
      <rect x={0} y={0} width={X(-s)} height={H} fill="rgba(255,176,32,.18)"><title>saturated (full output)</title></rect>
      <rect x={X(s)} y={0} width={W - X(s)} height={H} fill="rgba(255,176,32,.18)" />
      <line x1={W / 2} y1={0} x2={W / 2} y2={H} stroke="rgba(148,163,184,.5)" />
      {outV !== undefined && <rect x={Math.min(X(0), X(outV))} y={H / 2 - 2} width={Math.abs(X(outV) - X(0))} height={4} fill="var(--color-hud)"><title>output</title></rect>}
      {raw !== undefined && <line x1={X(raw)} y1={1} x2={X(raw)} y2={H - 1} stroke="var(--color-ok)" strokeWidth={2}><title>raw input</title></line>}
    </svg>
  );
}

function RangesInfo() {
  return (
    <details className="rounded border border-edge/60 bg-black/20 p-3 text-xs text-slate-400" data-testid="ranges-info">
      <summary className="cursor-pointer font-display text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Value ranges &amp; where they come from</summary>
      <ul className="mt-2 space-y-1.5">
        {Object.values(RANGES).map((r) => (
          <li key={r.key}>
            <b className="text-slate-200">{r.label}</b>{' '}
            <span className="font-mono text-hud2">{r.min}–{r.max}</span>{' '}
            <span className={`rounded px-1 text-[9px] ${r.confirmed ? 'bg-ok/15 text-ok' : 'bg-mod/15 text-mod'}`}>{r.confirmed ? 'confirmed' : 'conservative (game limit not documented)'}</span>
            {r.def !== undefined && <span className="ml-1 text-slate-500">default {r.def}</span>}
            {r.observed && <span className="ml-1 text-slate-500">· seen in real files {r.observed[0]}–{r.observed[1]}</span>}
            <div className="text-[10px] text-slate-500">{r.note}</div>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[10px] text-slate-500">Sources: the game&apos;s defaultProfile.xml (4.10.2 LIVE), its shipped layouts, real game-written exports (pinned in the app&apos;s tests), and the Star Citizen Wiki &quot;Game Options&quot; defaults table. Deadzones written by the game are multiples of 0.0099 (1 % slider steps × 0.99).</p>
    </details>
  );
}

/** live axes of a connected device (~30 fps) */
function useLiveAxes(pad: PadInfo | undefined): number[] | undefined {
  const [v, setV] = useState<number[] | undefined>(undefined);
  useEffect(() => {
    if (!pad) { setV(undefined); return; }
    let raf = 0, last = 0, prev = '';
    const loop = (now: number) => {
      if (now - last > 33) {
        last = now;
        const p = getPads().find((g) => g.index === pad.index);
        const a = p ? p.axes.map((x) => Math.round(x * 1000) / 1000) : undefined;
        const k = a ? a.join(',') : '';
        if (k !== prev) { prev = k; setV(a); }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [pad]);
  return v;
}

function NumField({ value, min, max, step, label, onSet }: { value?: number; min: number; max: number; step: number; label: string; onSet: (v: number | null) => void }) {
  const [text, setText] = useState(value === undefined ? '' : String(value));
  useEffect(() => setText(value === undefined ? '' : String(value)), [value]);
  const commit = () => {
    const t = text.trim();
    if (!t) { if (value !== undefined) onSet(null); return; }
    const n = Number(t);
    if (!Number.isFinite(n)) { setText(value === undefined ? '' : String(value)); return; }
    const c = Math.max(min, Math.min(max, n));
    if (c !== value) onSet(c);
  };
  return (
    <span className="flex items-center gap-1">
      <input aria-label={label} value={text} inputMode="decimal" placeholder="default" onChange={(e) => setText(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        className="w-20 rounded border border-edge bg-black/40 px-1.5 py-0.5 font-mono text-[11px] text-slate-100 outline-none placeholder:text-slate-600 focus:border-hud" />
      {value !== undefined && <button type="button" title="Back to game default" onClick={() => onSet(null)} className="text-[10px] text-slate-500 hover:text-alert"><Ico name="close" /></button>}
      <span className="sr-only">{step}</span>
    </span>
  );
}

type Patch = Parameters<typeof setGroup>[4];
function GroupEditor({ g, path, vals, axes, pad, axis, setAxis: setAxisSel, preview = true, onPatch, onReset }: {
  g: OptionTreeGroup; path: string; vals: ReturnType<typeof groupValues>; axes: Record<string, { deadzone?: number; saturation?: number }>; pad?: PadInfo;
  axis: string; setAxis: (a: string) => void; preview?: boolean;
  onPatch: (label: string, p: Patch) => void; onReset: () => void;
}) {
  const mode: 'default' | 'exponent' | 'curve' = vals?.curve ? 'curve' : vals?.exponent !== undefined ? 'exponent' : 'default';
  const defExp = g.exponent !== undefined ? Number(g.exponent) : undefined;
  const defCurve = g.curve?.map(([x, y]) => ({ x, y }));
  const [draft, setDraft] = useState<Pt[] | null>(null);
  const points = draft ?? vals?.curve ?? null;
  const live = useLiveAxis(pad, axis);
  const shape = {
    exponent: mode === 'exponent' ? vals?.exponent : mode === 'default' ? defExp : undefined,
    curve: mode === 'curve' ? points ?? undefined : mode === 'default' ? defCurve : undefined,
    ...(axis ? axes[axis] ?? {} : {}),
  };
  const canCurve = g.showCurve !== 0;
  const canInvert = g.showInvert !== 0;
  const toPoints = (exp: number) => Array.from({ length: 9 }, (_, i) => ({ x: (i + 1) / 10, y: Math.pow((i + 1) / 10, exp) }));

  return (
    <div className="space-y-3" data-testid="group-editor">
      <div className="flex flex-wrap items-baseline gap-2">
        <h4 className="font-display text-base font-bold uppercase tracking-wider text-hud2">{g.label}</h4>
        <code className="font-mono text-[10px] text-slate-500">{g.name}</code>
        {path && <span className="text-[10px] text-slate-500">{path}</span>}
        {(vals?.invert !== undefined || vals?.exponent !== undefined || vals?.curve || vals?.emptyCurve) && (
          <button type="button" onClick={onReset} className="ml-auto rounded border border-edge px-2 py-0.5 text-[10px] text-slate-400 hover:border-alert hover:text-alert"><Ico name="reset" /> game default</button>
        )}
      </div>
      {(g.showCurve === -1 || g.showInvert === -1) && <p className="text-[10px] text-slate-500">Group heading: in game this setting is shown for the whole group; whether it overrides the controls below it is not documented.</p>}
      <div className="flex flex-wrap items-center gap-4 text-xs">
        {canInvert && (
          <label className="flex items-center gap-2">
            <span className="text-slate-400">Invert</span>
            <select aria-label="Invert" value={vals?.invert === undefined ? '' : vals.invert ? '1' : '0'}
              onChange={(e) => onPatch(`Invert ${g.name}`, { invert: e.target.value === '' ? null : e.target.value === '1' })}
              className="rounded border border-edge bg-panel2 px-1.5 py-0.5 font-mono text-[11px] text-slate-200">
              <option value="">game default ({g.invert === '1' ? 'inverted' : 'not inverted'})</option>
              <option value="1">inverted (invert=&quot;1&quot;)</option>
              <option value="0">not inverted (invert=&quot;0&quot;)</option>
            </select>
          </label>
        )}
        {canCurve && (
          <span className="flex items-center gap-1" role="radiogroup" aria-label="Response">
            <span className="mr-1 text-slate-400">Response</span>
            {(['default', 'exponent', 'curve'] as const).map((m) => (
              <button key={m} type="button" role="radio" aria-checked={mode === m}
                onClick={() => {
                  if (m === mode) return;
                  if (m === 'default') onPatch(`Response ${g.name}`, { exponent: null, curve: null });
                  else if (m === 'exponent') onPatch(`Exponent ${g.name}`, { exponent: vals?.exponent ?? defExp ?? 1.5, curve: null });
                  else onPatch(`Curve ${g.name}`, { curve: vals?.exponent !== undefined ? toPoints(vals.exponent) : defCurve ?? toPoints(defExp ?? 1.5) });
                }}
                className={`rounded border px-2 py-0.5 font-mono text-[11px] ${mode === m ? 'border-hud bg-hud/15 text-hud2' : 'border-edge text-slate-400 hover:border-hud/60'}`}>
                {m === 'default' ? 'game default' : m === 'exponent' ? 'exponent' : 'custom curve'}
              </button>
            ))}
          </span>
        )}
      </div>
      {canCurve && mode === 'exponent' && (
        <label className="flex items-center gap-3 text-xs">
          <span className="text-slate-400">Exponent</span>
          <input type="range" min={RANGES.exponent.min} max={RANGES.exponent.max} step={RANGES.exponent.step} value={clampTo(RANGES.exponent, vals?.exponent ?? 1)} aria-label="Exponent slider"
            onChange={(e) => onPatch(`Exponent ${g.name}`, { exponent: Number(e.target.value) })} className="w-56 accent-[var(--color-hud)]" />
          <NumField value={vals?.exponent} min={RANGES.exponent.min} max={RANGES.exponent.max} step={RANGES.exponent.step} label="Exponent" onSet={(v) => onPatch(`Exponent ${g.name}`, { exponent: v })} />
          <span className="text-[10px] text-slate-500" title={RANGES.exponent.note}>1 = linear, &gt;1 = finer near centre · {RANGES.exponent.min}–{RANGES.exponent.max} (conservative)</span>
          {vals?.exponent !== undefined && !inRange(RANGES.exponent, vals.exponent) && <span className="text-[10px] text-mod">imported {vals.exponent} is outside that range: kept until you change it</span>}
        </label>
      )}
      <div className="flex flex-wrap gap-4">
        <CurveChart shape={shape} invert={vals?.invert ?? g.invert === '1'} editable={canCurve && mode === 'curve'} points={points ?? []}
          defaultShape={{ exponent: defExp, curve: defCurve }} live={live}
          onDrag={(p) => setDraft(p)} onCommit={(p) => { setDraft(null); onPatch(`Curve ${g.name}`, { curve: p }); }} />
        <div className="min-w-[200px] flex-1 space-y-2 text-xs">
          {preview && <label className="flex items-center gap-2 text-[11px] text-slate-400">
            Preview with axis
            <select value={axis} onChange={(e) => setAxisSel(e.target.value)} aria-label="Preview axis" className="rounded border border-edge bg-panel2 px-1 py-0.5 font-mono text-[11px] text-slate-200">
              <option value="">— (curve only)</option>
              {JS_AXIS_INPUTS.map((a) => <option key={a} value={a}>{a}{axes[a] ? ` · dz ${axes[a].deadzone ?? '-'} / sat ${axes[a].saturation ?? '-'}` : ''}</option>)}
            </select>
          </label>}
          {axis && <p className="text-[10px] text-slate-500">{pad ? `Move ${axis} on ${pad.name} to see it on the curve.` : 'Connect and assign the device to see its live position.'}</p>}
          {canCurve && mode === 'curve' && points && (
            <div data-testid="curve-points">
              <div className="flex items-center gap-2">
                <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500">Points (in → out)</span>
                <button type="button" onClick={() => onPatch(`Curve ${g.name}`, { curve: addPoint(points) })} className="rounded border border-edge px-1.5 text-[10px] text-slate-300 hover:border-hud/60">+ point</button>
                <button type="button" onClick={() => onPatch(`Curve ${g.name}`, { curve: [{ x: 0, y: 0 }, { x: 1, y: 1 }] })} className="rounded border border-edge px-1.5 text-[10px] text-slate-300 hover:border-hud/60">linear</button>
              </div>
              <ul className="mt-1 max-h-48 space-y-0.5 overflow-y-auto pr-1 scrollbar-thin">
                {points.map((p, i) => (
                  <li key={i} className="flex items-center gap-1">
                    <PtField v={p.x} label={`point ${i + 1} in`} onSet={(x) => onPatch(`Curve ${g.name}`, { curve: points.map((q, j) => (j === i ? { ...q, x } : q)) })} />
                    <span className="text-slate-600">→</span>
                    <PtField v={p.y} label={`point ${i + 1} out`} onSet={(y) => onPatch(`Curve ${g.name}`, { curve: points.map((q, j) => (j === i ? { ...q, y } : q)) })} />
                    <input type="range" min={0} max={1} step={RANGES.point.step} value={p.y} aria-label={`point ${i + 1} out slider`} className="w-24 accent-[var(--color-mod)]"
                      onChange={(e) => onPatch(`Curve ${g.name}`, { curve: points.map((q, j) => (j === i ? { ...q, y: Number(e.target.value) } : q)) })} />
                    {points.length > 1 && <button type="button" title="Remove point" onClick={() => onPatch(`Curve ${g.name}`, { curve: points.filter((_, j) => j !== i) })} className="text-[10px] text-slate-500 hover:text-alert"><Ico name="close" /></button>}
                  </li>
                ))}
              </ul>
              <p className="mt-1 text-[10px] text-slate-500">Drag points on the chart, double-click it to add one. Written as &lt;nonlinearity_curve&gt;&lt;point in out/&gt;.</p>
            </div>
          )}
          {mode === 'default' && canCurve && <p className="text-[10px] text-slate-500">Game default: {defCurve ? `curve with ${defCurve.length} points` : defExp !== undefined ? `exponent ${defExp}` : 'linear'} (from defaultProfile.xml).</p>}
        </div>
      </div>
    </div>
  );
}

const addPoint = (pts: Pt[]): Pt[] => {
  const s = [...pts].sort((a, b) => a.x - b.x);
  const all = [{ x: 0, y: 0 }, ...s, { x: 1, y: 1 }];
  let gi = 0, gap = 0;
  for (let i = 1; i < all.length; i++) if (all[i].x - all[i - 1].x > gap) { gap = all[i].x - all[i - 1].x; gi = i; }
  const x = (all[gi].x + all[gi - 1].x) / 2;
  return [...s, { x, y: curveAt(s, x) }].sort((a, b) => a.x - b.x);
};

function PtField({ v, label, onSet }: { v: number; label: string; onSet: (n: number) => void }) {
  const [t, setT] = useState(String(v));
  useEffect(() => setT(String(Math.round(v * 1e4) / 1e4)), [v]);
  return (
    <input aria-label={label} value={t} onChange={(e) => setT(e.target.value)} inputMode="decimal"
      onBlur={() => { const n = Number(t); if (Number.isFinite(n) && n !== v) onSet(Math.max(0, Math.min(1, n))); else setT(String(v)); }}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      className="w-16 rounded border border-edge bg-black/40 px-1 py-0.5 font-mono text-[10px] text-slate-100 outline-none focus:border-hud" />
  );
}

/** live value of one joystick axis (by Star Citizen axis name) of a connected device */
function useLiveAxis(pad: PadInfo | undefined, axis: string): number | undefined {
  const [v, setV] = useState<number | undefined>(undefined);
  useEffect(() => {
    const idx = JS_AXES.indexOf(axis);
    if (!pad || idx < 0) { setV(undefined); return; }
    let raf = 0, last = 0;
    const loop = (now: number) => {
      if (now - last > 33) {
        last = now;
        const p = getPads().find((g) => g.index === pad.index);
        setV(p ? p.axes[idx] : undefined);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [pad, axis]);
  return v;
}

const W = 260, PAD = 22;
function CurveChart({ shape, defaultShape, invert, editable, points, live, onDrag, onCommit }: {
  shape: Parameters<typeof response>[1]; defaultShape: Parameters<typeof response>[1]; invert: boolean; editable: boolean; points: Pt[]; live?: number;
  onDrag: (p: Pt[]) => void; onCommit: (p: Pt[]) => void;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ i: number; pts: Pt[] } | null>(null);
  const S = W - PAD * 2;
  const X = (x: number) => PAD + x * S, Y = (y: number) => PAD + (1 - y) * S;
  const path = (o: Parameters<typeof response>[1]) => Array.from({ length: 101 }, (_, i) => `${i ? 'L' : 'M'}${X(i / 100).toFixed(1)},${Y(response(i / 100, o)).toFixed(1)}`).join(' ');
  const toPt = (e: { clientX: number; clientY: number }) => {
    const r = svg.current!.getBoundingClientRect();
    return { x: Math.max(0, Math.min(1, (e.clientX - r.left - PAD * (r.width / W)) / (S * (r.width / W)))), y: Math.max(0, Math.min(1, 1 - (e.clientY - r.top - PAD * (r.height / W)) / (S * (r.height / W)))) };
  };
  const lx = live === undefined ? undefined : Math.min(1, Math.abs(live));
  return (
    <div>
      <svg ref={svg} viewBox={`0 0 ${W} ${W}`} width={W} height={W} data-testid="curve-chart" className="select-none rounded border border-edge/70 bg-black/40"
        onDoubleClick={(e) => { if (editable) onCommit([...points, toPt(e)].sort((a, b) => a.x - b.x)); }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const p = toPt(e);
          const s = d.pts.map((q, j) => (j === d.i ? p : q));
          d.pts = s;
          onDrag(s);
        }}
        onPointerUp={() => { const d = drag.current; drag.current = null; if (d) onCommit(d.pts); }}>
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <g key={t}>
            <line x1={X(t)} y1={Y(0)} x2={X(t)} y2={Y(1)} stroke="rgba(148,163,184,.15)" />
            <line x1={X(0)} y1={Y(t)} x2={X(1)} y2={Y(t)} stroke="rgba(148,163,184,.15)" />
          </g>
        ))}
        <line x1={X(0)} y1={Y(0)} x2={X(1)} y2={Y(1)} stroke="rgba(148,163,184,.35)" strokeDasharray="4 4" />
        <path d={path(defaultShape)} fill="none" stroke="rgba(148,163,184,.45)" strokeWidth={1.2} />
        <path d={path(shape)} fill="none" stroke="var(--color-hud)" strokeWidth={2.2} data-testid="curve-path" />
        {editable && points.map((p, i) => (
          <circle key={i} data-pt={i} cx={X(p.x)} cy={Y(p.y)} r={5.5} fill="var(--color-mod)" stroke="#000" strokeWidth={1} className="cursor-grab"
            onPointerDown={(e) => { (e.target as Element).setPointerCapture?.(e.pointerId); drag.current = { i, pts: points }; }}
            onDoubleClick={(e) => { e.stopPropagation(); if (points.length > 1) onCommit(points.filter((_, j) => j !== i)); }} />
        ))}
        {lx !== undefined && (
          <g data-testid="curve-live">
            <line x1={X(lx)} y1={Y(0)} x2={X(lx)} y2={Y(1)} stroke="var(--color-ok)" strokeOpacity={0.4} />
            <circle cx={X(lx)} cy={Y(Math.abs(response(lx, shape)))} r={4.5} fill="var(--color-ok)" />
          </g>
        )}
        <text x={X(1)} y={W - 5} fill="#64748b" fontSize="9" textAnchor="end">input →</text>
        <text x={6} y={PAD - 8} fill="#64748b" fontSize="9">output{invert ? ' (inverted)' : ''}</text>
      </svg>
      <div className="mt-1 flex gap-3 font-mono text-[9px] text-slate-500">
        <span><span className="mr-1 inline-block h-0.5 w-3 bg-hud align-middle" />this setting</span>
        <span><span className="mr-1 inline-block h-0.5 w-3 bg-slate-500 align-middle" />game default</span>
        {lx !== undefined && <span className="text-ok"><span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-ok align-middle" />live {live!.toFixed(3)}</span>}
      </div>
    </div>
  );
}

/** "Axis settings & curves" for one game slot, opened from that slot in the Devices view */
export function AxisSettingsModal({ slotLabel, deviceName, onClose, ...rest }: {
  slotLabel: string; deviceName?: string; onClose: () => void;
} & Parameters<typeof DeviceSettingsEditor>[0]) {
  useEscape(onClose);
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-void/85 p-4 backdrop-blur-sm" onClick={onClose} data-testid="axis-settings-modal">
      <div className="hud-panel hud-corners my-4 w-full max-w-6xl rounded-xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`Axis settings & curves for ${slotLabel}`}>
        <div className="flex flex-wrap items-center gap-3 border-b border-edge px-5 py-3">
          <h2 className="flex items-center gap-2 font-display text-xl font-bold uppercase tracking-[0.2em] text-hud2"><Ico name="curve" className="h-5 w-5" /> Axis settings &amp; curves</h2>
          <span className="rounded border border-hud/50 bg-hud/10 px-2 py-0.5 font-mono text-sm font-bold text-hud2">{slotLabel}</span>
          {deviceName && <span className="text-sm text-slate-300">{deviceName}</span>}
          <button type="button" onClick={onClose} className="ml-auto rounded border border-edge px-2 py-1 text-xs text-slate-400 hover:text-hud2" aria-label="Close"><Ico name="close" /></button>
        </div>
        <div className="p-5"><DeviceSettingsEditor {...rest} /></div>
      </div>
    </div>
  );
}
