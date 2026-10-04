import type { AssignSource, PadInfo, PadKind, PadLike } from '../lib/devices';
import { parseProfileProduct } from '../lib/devices';
import type { Group, Profile, ProfileDevice } from '../lib/types';
import { InputTester } from './InputTester';

type OnAssign = (key: string, v: { kind?: PadKind; instance?: number }) => void;
const SOURCE: Record<AssignSource, { text: string; cls: string }> = {
  manual: { text: 'set by you', cls: 'border-mod/50 text-mod' },
  'profile-id': { text: 'matched to profile (USB id)', cls: 'border-ok/50 text-ok' },
  'profile-name': { text: 'matched to profile (name)', cls: 'border-ok/50 text-ok' },
  auto: { text: 'browser order (guess)', cls: 'border-edge text-slate-400' },
};
const devName = (pd: ProfileDevice) => parseProfileProduct(pd.product).name || pd.product.trim();

/** Browser-detected controllers with their joystick/gamepad role and game instance (js1, js2..., gp1) */
export function DeviceList({ pads, group, activity, onAssign, onReset, profileDevices = [], compact }: {
  pads: PadInfo[]; group?: Group; activity?: Record<string, number>; onAssign: OnAssign; onReset?: (key: string) => void;
  profileDevices?: readonly ProfileDevice[]; compact?: boolean;
}) {
  if (!pads.length) return (
    <p className="mt-3 rounded border border-edge/70 bg-black/20 px-3 py-2 text-xs text-slate-500">No controllers visible to the browser yet. Press any button on one to wake it up.</p>
  );
  const maxJs = Math.max(8, ...pads.map((p) => p.instance), ...profileDevices.filter((d) => d.slot === 'js').map((d) => d.instance));
  return (
    <div className={compact ? 'mt-3 space-y-1' : 'space-y-1.5'} data-testid="device-list">
      {compact && <div className="font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-hud/70">Detected controllers</div>}
      {pads.map((p) => {
        const live = activity?.[p.key] && Date.now() - activity[p.key] < 600;
        const src = SOURCE[p.source];
        return (
          <div key={p.key} data-testid="device-row" data-device={p.name} className={`rounded border px-3 py-2 text-xs ${group && p.kind === group ? 'border-hud/50 bg-hud/5' : 'border-edge/70 bg-black/20'}`}>
            <div className="flex flex-wrap items-center gap-2">
              {activity && <span className={`h-2 w-2 rounded-full ${live ? 'bg-ok shadow-[0_0_8px_var(--color-ok)]' : 'bg-slate-600'}`} />}
              <span className="min-w-[10rem] flex-1 font-semibold text-slate-100" title={p.id}>{p.name}</span>
              <span className="flex flex-wrap items-center gap-2">
              <select value={p.kind} onChange={(e) => onAssign(p.key, { kind: e.target.value as PadKind })} aria-label="Use as"
                className="rounded border border-edge bg-panel2 px-1.5 py-0.5 font-mono text-[11px] text-slate-200">
                <option value="js">Joystick / HOTAS (js)</option><option value="gp">Gamepad (gp)</option>
              </select>
              {p.kind === 'js' ? (
                <select value={p.instance} onChange={(e) => onAssign(p.key, { kind: 'js', instance: Number(e.target.value) })} aria-label="Game instance"
                  className="max-w-[14rem] rounded border border-mod/50 bg-panel2 px-1.5 py-0.5 font-mono text-[11px] text-mod">
                  {Array.from({ length: maxJs }, (_, i) => i + 1).map((n) => {
                    const pd = profileDevices.find((d) => d.slot === 'js' && d.instance === n);
                    const other = pads.find((x) => x !== p && x.kind === 'js' && x.instance === n);
                    return <option key={n} value={n}>js{n}{pd ? ` · ${devName(pd)} (profile)` : ''}{other ? ` · used by ${other.name}` : ''}</option>;
                  })}
                </select>
              ) : <span className="rounded border border-edge px-1.5 py-0.5 font-mono text-[11px] text-slate-300">gp1</span>}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-[10px] text-slate-500">
              <span>#{p.index} · {p.mapping || 'raw'} mapping · {p.buttons} btn · {p.axes} axes{p.vendor ? ` · USB ${p.vendor}:${p.productId}` : ''}</span>
              <span className={`rounded border px-1 ${src.cls}`} data-testid="device-source">{src.text}{p.matched && p.source !== 'manual' ? `: ${p.matched}` : ''}</span>
              {!compact && p.source === 'manual' && onReset && (
                <button type="button" onClick={() => onReset(p.key)} className="rounded border border-edge px-1 text-slate-400 hover:border-hud/60 hover:text-hud2">↺ automatic</button>
              )}
            </div>
          </div>
        );
      })}
      {compact && (
        <p className="text-[10px] leading-relaxed text-slate-500">
          The game numbers joysticks in Windows device order (js1, js2…), which may differ from the browser&apos;s. Pick the number the game uses for each stick
          (in game: <code>pp_resortdevices joystick 1 2</code> swaps them). More in <b>🕹 Controllers</b>.
        </p>
      )}
    </div>
  );
}

/** Edit → Controllers: devices declared in the profile, devices the browser sees, the mapping between them, and a live tester */
export function ControllersPanel({ profile, pads, describe, onAssign, onReset, onClose }: {
  profile: Profile | null; pads: PadInfo[]; describe: (l: readonly PadLike[]) => PadInfo[]; onAssign: OnAssign; onReset: (key?: string) => void; onClose: () => void;
}) {
  const declared = (profile?.devices ?? []).slice().sort((a, b) => 'kbmogpjs'.indexOf(a.slot) - 'kbmogpjs'.indexOf(b.slot) || a.instance - b.instance);
  const ctrl = declared.filter((d) => d.slot === 'js' || d.slot === 'gp');
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-void/85 p-4 backdrop-blur-sm" onClick={onClose} data-testid="controllers-panel">
      <div className="hud-panel hud-corners my-4 w-full max-w-6xl rounded-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-edge px-5 py-3">
          <h2 className="font-display text-xl font-bold uppercase tracking-[0.2em] text-hud2">🕹 Controllers &amp; input tester</h2>
          <button type="button" onClick={onClose} className="ml-auto rounded border border-edge px-2 py-1 text-xs text-slate-400 hover:text-hud2">✕</button>
        </div>
        <div className="space-y-4 p-5">
          <div className="rounded border border-hud/30 bg-hud/5 p-3 text-xs leading-relaxed text-slate-300">
            Star Citizen refers to controllers by <b>instance number</b>: <code className="text-hud2">js1_</code>, <code className="text-hud2">js2_</code>… for joysticks, throttles and pedals,
            <code className="text-hud2"> gp1_</code> for a gamepad (<code>kb1_</code>/<code>mo1_</code> are keyboard and mouse). Every binding, and the file you export, uses those numbers.
            This panel tells the app <b>which physical device is which number</b>, so inputs you capture get the right prefix. Devices are matched to the ones declared in your
            profile by USB id or name when possible; otherwise they&apos;re numbered in the order the browser lists them, which can differ from the game&apos;s Windows order, so check and
            correct it here. In game, <code>pp_resortdevices joystick 1 2</code> swaps js1 and js2.
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <section data-testid="profile-devices">
              <h3 className="font-display text-sm font-bold uppercase tracking-[0.2em] text-mod">In the profile {profile ? <span className="normal-case tracking-normal text-slate-400">· {profile.name}</span> : null}</h3>
              {!profile ? (
                <p className="mt-2 text-xs text-slate-500">You&apos;re viewing the game defaults, which don&apos;t list devices. Import your <code>actionmaps.xml</code> or an exported layout to see the controllers it was made with.</p>
              ) : !declared.length ? (
                <p className="mt-2 text-xs text-slate-500">This profile doesn&apos;t declare any devices. It gets them when you capture joystick inputs or export with controllers connected.</p>
              ) : (
                <ul className="mt-2 space-y-1.5">
                  {declared.map((d, i) => {
                    const pad = pads.find((p) => p.kind === d.slot && p.instance === d.instance);
                    const isCtl = d.slot === 'js' || d.slot === 'gp';
                    return (
                      <li key={i} className="flex flex-wrap items-center gap-2 rounded border border-edge/70 bg-black/20 px-3 py-2 text-xs">
                        <span className="w-9 font-mono text-[11px] font-bold text-hud2">{d.slot}{d.instance}</span>
                        <span className="min-w-0 flex-1 truncate text-slate-100" title={d.product}>{devName(d)}</span>
                        {isCtl && (pad
                          ? <span className="rounded border border-ok/40 px-1.5 font-mono text-[10px] text-ok">↔ {pad.name}</span>
                          : <span className="rounded border border-edge px-1.5 font-mono text-[10px] text-slate-500">not detected in browser</span>)}
                      </li>
                    );
                  })}
                </ul>
              )}
              {profile && ctrl.length > 0 && <p className="mt-2 text-[10px] text-slate-500">From the <code>&lt;options type=&quot;joystick|gamepad&quot; instance=… Product=…&gt;</code> entries in the imported file.</p>}
            </section>
            <section>
              <div className="flex items-center gap-2">
                <h3 className="font-display text-sm font-bold uppercase tracking-[0.2em] text-hud">Detected by this browser</h3>
                {pads.some((p) => p.source === 'manual') && <button type="button" onClick={() => onReset()} className="ml-auto rounded border border-edge px-1.5 py-0.5 text-[10px] text-slate-400 hover:text-hud2">↺ reset all to automatic</button>}
              </div>
              <div className="mt-2"><DeviceList pads={pads} onAssign={onAssign} onReset={onReset} profileDevices={profile?.devices} /></div>
            </section>
          </div>
          <section>
            <h3 className="font-display text-sm font-bold uppercase tracking-[0.2em] text-hud">Live input tester</h3>
            <p className="mb-2 mt-0.5 text-[11px] text-slate-500">Everything the browser reports, live. &quot;last&quot; shows the Star Citizen input a press or move would be captured as. If a device or button doesn&apos;t show up here, the browser can&apos;t see it.</p>
            <InputTester describe={describe} />
          </section>
        </div>
      </div>
    </div>
  );
}
