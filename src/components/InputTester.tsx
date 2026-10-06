import { useEffect, useRef, useState } from 'react';
import { CHROMIUM_AXIS_CAP, CHROMIUM_BUTTON_CAP, GAME_BUTTON_CAP, gamepadInput, GP_AXES, GP_BUTTONS, hatDirection, isHatRest, joystickInput, JS_AXES, PadTracker, snapshot } from '../lib/capture';
import { getPads, padLabel, type PadInfo, type PadLike } from '../lib/devices';
import { formatInput } from '../lib/inputs';
import { browserName } from '../lib/browser';
import { shouldFollowScroll, TesterFollow, type FollowHit } from '../lib/testerFollow';
import { FirefoxCta } from './ChromiumBanner';
import { Ico } from './icons';

interface LivePad { info: PadInfo; timestamp: number; buttons: { p: boolean; v: number }[]; axes: number[]; hats: boolean[]; last?: string; lastAt?: number }
interface Env { api: boolean; secure: boolean; policy?: boolean; focus: boolean; visible: boolean; slots: number; browser: string; chromium: boolean }
interface LogLine { t: number; text: string }

function readEnv(): Env {
  const nav = navigator as Navigator & { getGamepads?: () => (Gamepad | null)[] };
  const doc = document as Document & { featurePolicy?: { allowsFeature(f: string): boolean }; permissionsPolicy?: { allowsFeature(f: string): boolean } };
  let slots = 0;
  try { slots = nav.getGamepads ? Array.from(nav.getGamepads() ?? []).length : 0; } catch { /* blocked */ }
  const pol = doc.permissionsPolicy ?? doc.featurePolicy;
  const b = browserName();
  return {
    api: typeof nav.getGamepads === 'function', secure: window.isSecureContext, policy: pol ? pol.allowsFeature('gamepad') : undefined,
    focus: document.hasFocus(), visible: document.visibilityState === 'visible', slots, browser: b.name, chromium: b.chromium,
  };
}

/** SC input name for an event on a described device, e.g. js1_button5 */
function nameOf(info: PadInfo, e: Parameters<typeof joystickInput>[0]): string | undefined {
  const c = info.kind === 'gp' ? gamepadInput(e) : joystickInput(e);
  if (!c) return info.kind === 'gp' && e.kind === 'button' ? `button ${e.index + 1} (not a standard gamepad button)` : undefined;
  return formatInput(info.kind, info.instance, c.input);
}

/**
 * Live controller diagnostics: everything the browser exposes through the Gamepad API, updated every frame,
 * plus the Star Citizen input name each press/move would be captured as.
 */
export function InputTester({ describe, compact, only, follow = !compact }: {
  describe: (l: readonly PadLike[]) => PadInfo[]; compact?: boolean; only?: (p: PadInfo) => boolean;
  /** a press or move scrolls its device card (and the button / axis) into sight and flashes it */
  follow?: boolean;
}) {
  const [live, setLive] = useState<LivePad[]>([]);
  const [flash, setFlash] = useState<{ key: string; hit: FollowHit; n: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const followRef = useRef(follow);
  useEffect(() => { followRef.current = follow; }, [follow]);
  const [env, setEnv] = useState<Env>(() => readEnv());
  const [log, setLog] = useState<LogLine[]>([]);
  const describeRef = useRef(describe);
  useEffect(() => { describeRef.current = describe; }, [describe]);

  useEffect(() => {
    const tracker = new PadTracker();
    const follower = new TesterFollow();
    const last = new Map<string, { name: string; at: number }>();
    let raf = 0, lastPaint = 0, lastEnv = 0, lastScrollAt = 0, userScrollAt = 0, flashN = 0, pending: { key: string; hit: FollowHit } | null = null;
    // the user scrolling by hand (wheel, touch, keys, scrollbar drag) pauses following for a moment
    const userScrolled = () => { userScrollAt = performance.now(); };
    const keyScroll = (e: KeyboardEvent) => { if (['PageUp', 'PageDown', 'Home', 'End', 'ArrowUp', 'ArrowDown', ' '].includes(e.key)) userScrolled(); };
    const scrollbarDown = (e: PointerEvent) => { const el = e.target as HTMLElement | null; if (el && el.scrollHeight > el.clientHeight && e.offsetX > el.clientWidth) userScrolled(); };
    window.addEventListener('wheel', userScrolled, { passive: true });
    window.addEventListener('touchmove', userScrolled, { passive: true });
    window.addEventListener('keydown', keyScroll);
    window.addEventListener('pointerdown', scrollbarDown);
    /** after the cards re-rendered: bring the hit into sight (throttled) */
    const goTo = (key: string, hit: FollowHit, now: number) => {
      const card = rootRef.current?.querySelector<HTMLElement>(`[data-tester-key="${CSS.escape(key)}"]`);
      if (!card) return;
      const part = card.querySelector<HTMLElement>(hit.kind === 'button' ? `[data-tester-button="${hit.index}"]` : `[data-tester-axis="${hit.index}"]`) ?? card;
      const scroller = scrollParent(card);
      const view = scroller ? scroller.getBoundingClientRect() : { top: 0, bottom: window.innerHeight };
      const r = part.getBoundingClientRect(), c = card.getBoundingClientRect();
      const fits = c.height <= view.bottom - view.top;
      // the card when it fits (its header names the device), else the pressed button / axis row
      const visible = fits ? c.top >= view.top - 1 && c.bottom <= view.bottom + 1 : r.top >= view.top && r.bottom <= view.bottom;
      if (!shouldFollowScroll({ now, visible, lastScrollAt, userScrollAt })) return;
      lastScrollAt = now;
      (fits ? card : part).scrollIntoView({ block: fits ? 'nearest' : 'center', behavior: 'smooth' });
    };
    const loop = (now: number) => {
      const list = getPads();
      const infos = describeRef.current(list);
      const states = list.map((p) => snapshot(p));
      const evs = tracker.update(infos.map((d, i) => ({ key: d.key, state: states[i] })), now);
      infos.forEach((d, i) => {
        const e = evs.get(d.key)?.[0];
        const n = e && nameOf(d, e);
        if (n) last.set(d.key, { name: n, at: Date.now() });
        const st = states[i];
        const hit = follower.update(d.key, st.buttons, st.axes, tracker.restOf(d.key)?.axes);
        if (hit && followRef.current) pending = { key: d.key, hit };
      });
      if (pending) {
        const p = pending; pending = null;
        setFlash({ ...p, n: ++flashN });
        requestAnimationFrame(() => goTo(p.key, p.hit, performance.now()));
      }
      if (now - lastPaint > 60) {
        lastPaint = now;
        setLive(list.map((p, i) => ({
          info: infos[i], timestamp: p.timestamp, axes: [...p.axes], hats: p.axes.map((v, j) => isHatRest(v) || isHatRest(tracker.restOf(infos[i].key)?.axes[j] ?? 0)),
          buttons: p.buttons.map((b) => ({ p: b.pressed || b.value > 0.5, v: b.value })),
          last: last.get(infos[i].key)?.name, lastAt: last.get(infos[i].key)?.at,
        })));
      }
      if (now - lastEnv > 500) { lastEnv = now; setEnv(readEnv()); }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const add = (text: string) => setLog((l) => [{ t: Date.now(), text }, ...l].slice(0, 6));
    const on = (e: Event) => { const g = (e as GamepadEvent).gamepad; add(`${e.type === 'gamepadconnected' ? 'connected' : 'disconnected'} #${g?.index}: ${g?.id}`); };
    window.addEventListener('gamepadconnected', on);
    window.addEventListener('gamepaddisconnected', on);
    return () => {
      cancelAnimationFrame(raf); window.removeEventListener('gamepadconnected', on); window.removeEventListener('gamepaddisconnected', on);
      window.removeEventListener('wheel', userScrolled); window.removeEventListener('touchmove', userScrolled); window.removeEventListener('keydown', keyScroll); window.removeEventListener('pointerdown', scrollbarDown);
    };
  }, []);

  const shown = only ? live.filter((l) => only(l.info)) : live;
  const ok = (v: boolean | undefined, yes: string, no: string, title?: string) => (
    <span title={title} className={`rounded border px-1.5 py-0.5 ${v === false ? 'border-alert/60 text-alert' : v ? 'border-ok/40 text-ok' : 'border-edge text-slate-400'}`}>{v === false ? <Ico name="close" /> : v ? <Ico name="check" /> : '?'} {v === false ? no : yes}</span>
  );

  return (
    <div ref={rootRef} className="space-y-2" data-testid="input-tester">
      {!compact && (
        <div className="flex flex-wrap items-center gap-1.5 font-mono text-[10px]" data-testid="tester-env">
          <span className="rounded border border-edge px-1.5 py-0.5 text-slate-300">{env.browser}</span>
          {ok(env.api, 'Gamepad API', 'no Gamepad API in this browser')}
          {ok(env.secure, 'secure context', 'not a secure context (needs https)')}
          {env.policy !== undefined && ok(env.policy, 'permission policy allows gamepad', 'gamepad blocked by permissions policy')}
          {ok(env.focus, 'page focused', 'page not focused: click here first', 'Browsers only deliver controller input to the focused tab')}
          {ok(env.visible, 'tab visible', 'tab hidden')}
          <span className="rounded border border-edge px-1.5 py-0.5 text-slate-400" title="navigator.getGamepads() entries (null until a device is revealed)">getGamepads(): {env.slots} slot{env.slots === 1 ? '' : 's'}, {live.length} connected</span>
        </div>
      )}
      {!shown.length && (
        <div className="rounded-lg border-2 border-dashed border-mod/60 bg-mod/5 p-4 text-center" data-testid="tester-empty">
          <div className="flex items-center justify-center gap-2 font-display text-base font-bold uppercase tracking-widest text-mod">
            <span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-mod opacity-75" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-mod" /></span>
            Press any button on your controller to wake it up
          </div>
          {!compact && (
            <ul className="mx-auto mt-2 max-w-xl list-disc space-y-0.5 pl-5 text-left text-xs text-slate-400">
              <li>Browsers hide controllers until a <b>button</b> is pressed while this tab is focused. Click this page first, then press a button.</li>
              <li>Still nothing? Check the device works in Windows (<code>joy.cpl</code>, &quot;Set up USB game controllers&quot;), close tools that grab it exclusively, replug it, or try another browser (Chrome, Edge, Firefox).</li>
            </ul>
          )}
        </div>
      )}
      {shown.map((l) => {
        const d = l.info;
        const tag = d.kind === 'gp' ? `gp${d.instance}` : `js${d.instance}`;
        const fresh = l.lastAt && Date.now() - l.lastAt < 2500;
        const fl = flash?.key === d.key ? flash : null;
        return (
          <div key={d.key} className="relative rounded-lg border border-edge/70 bg-black/30 p-3" data-testid="tester-device" data-tester-key={d.key} data-flash={fl ? fl.n : undefined}>
            {fl && <span key={fl.n} aria-hidden className="tester-flash pointer-events-none absolute inset-0 rounded-lg" />}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-mono text-[10px] text-slate-500">#{d.index}</span>
              <span className="font-semibold text-slate-100">{padLabel(d)}</span>
              <span className="rounded bg-hud/15 px-1.5 font-mono text-[10px] font-bold text-hud2">→ {tag}</span>
              <span className="font-mono text-[10px] text-slate-500">mapping: {d.mapping || '(none / raw)'} · {d.buttons} buttons · {d.axes} axes{d.vendor ? ` · USB ${d.vendor}:${d.productId}` : ''}</span>
              <span className={`ml-auto rounded border px-2 py-0.5 font-mono text-[11px] ${fresh ? 'border-mod bg-mod/15 text-mod' : 'border-edge text-slate-500'}`} data-testid="tester-last">
                {l.last ? `last: ${l.last}` : 'press or move something'}
              </span>
            </div>
            {!compact && <div className="mt-0.5 break-all font-mono text-[9px] text-slate-600">id: {d.id}</div>}
            {env.chromium && d.kind === 'js' && d.buttons >= CHROMIUM_BUTTON_CAP && (
              <p className="mt-1 flex items-start gap-2 text-[10px] text-mod"><FirefoxCta size="sm" /><span><Ico name="alert" /> {env.browser.replace(/\s*\d+$/, '')} reports at most {CHROMIUM_BUTTON_CAP} buttons per device. Buttons above {CHROMIUM_BUTTON_CAP} (common on VKB/Virpil) can&apos;t be seen here: type them in manual entry (e.g. js1_button40), or try Firefox.</span></p>
            )}
            {d.buttons > GAME_BUTTON_CAP && (
              <p className="mt-1 text-[10px] text-alert" data-testid="tester-over-cap"><Ico name="alert" /> This device reports {d.buttons} buttons. Star Citizen reads joysticks through DirectInput, which has {GAME_BUTTON_CAP} buttons per device, so buttons {GAME_BUTTON_CAP + 1}–{d.buttons} (outlined red) most likely can&apos;t be bound in game. Remap them in the device&apos;s software if you need them.</p>
            )}
            {env.chromium && d.axes >= CHROMIUM_AXIS_CAP && <p className="mt-1 flex items-start gap-2 text-[10px] text-mod"><FirefoxCta size="sm" /><span><Ico name="alert" /> Only the first {CHROMIUM_AXIS_CAP} axes are visible in this browser.</span></p>}
            <div className="mt-2 flex flex-wrap gap-[3px]">
              {l.buttons.map((b, i) => (
                <span key={fl?.hit.kind === 'button' && fl.hit.index === i ? `f${fl.n}` : i} data-tester-button={i} title={`${d.kind === 'gp' ? GP_BUTTONS[i] ?? `button ${i + 1}` : `button${i + 1}`}: ${b.v.toFixed(2)}`}
                  className={`flex h-5 min-w-[1.6rem] items-center justify-center rounded-sm border font-mono text-[9px] ${fl?.hit.kind === 'button' && fl.hit.index === i ? 'tester-flash-chip ' : ''}${b.p ? 'border-mod bg-mod/40 text-white' : b.v > 0.02 ? 'border-hud/50 bg-hud/15 text-hud2' : i >= GAME_BUTTON_CAP && d.kind === 'js' ? 'border-dashed border-alert/70 text-alert/80' : 'border-edge/70 text-slate-500'}`}>
                  {i + 1}
                </span>
              ))}
            </div>
            <div className={`mt-2 grid gap-x-4 gap-y-0.5 ${compact ? 'grid-cols-2' : 'grid-cols-2 lg:grid-cols-3'}`}>
              {l.axes.map((v, i) => {
                const hat = l.hats[i];
                const label = hat ? `hat ${isHatRest(v) ? 'centred' : hatDirection(v) ?? 'diagonal'}` : d.kind === 'gp' ? GP_AXES[i] ?? `axis ${i}` : JS_AXES[i] ?? `axis ${i}`;
                return (
                  <div key={fl && fl.hit.kind !== 'button' && fl.hit.index === i ? `f${fl.n}` : i} data-tester-axis={i} className={`flex items-center gap-2 rounded font-mono text-[10px] ${fl && fl.hit.kind !== 'button' && fl.hit.index === i ? 'tester-flash-chip' : ''}`}>
                    <span className="w-24 shrink-0 truncate text-slate-500" title={`browser axis ${i}`}>A{i} {label}</span>
                    <span className="relative h-2 flex-1 rounded bg-edge/60">
                      <span className="absolute top-0 h-2 w-px bg-slate-500" style={{ left: '50%' }} />
                      {!hat && <span className="absolute top-0 h-2 rounded bg-hud" style={{ left: `${Math.min(50, 50 + v * 50)}%`, width: `${Math.abs(Math.max(-1, Math.min(1, v))) * 50}%` }} />}
                    </span>
                    <span className="w-12 text-right text-slate-300">{v.toFixed(3)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
      {!compact && log.length > 0 && (
        <div className="font-mono text-[10px] text-slate-500" data-testid="tester-log">
          {log.map((x, i) => <div key={i}>{new Date(x.t).toLocaleTimeString()} {x.text}</div>)}
        </div>
      )}
    </div>
  );
}

/** nearest scrolling ancestor (the modal's overlay, or the page) */
function scrollParent(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY;
    if ((o === 'auto' || o === 'scroll') && p.scrollHeight > p.clientHeight) return p;
  }
  return null;
}
