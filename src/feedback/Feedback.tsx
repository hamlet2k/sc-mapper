import { useCallback, useEffect, useReducer, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { Ico } from '../components/icons';
import { annoReducer, EMPTY_ANNO, rectFrom, simplify } from './annotations';
import { collectContext, elementAt } from './context';
import { useFeedbackConfigured } from './useConfigured';
import { blankSnapshot, captureViewport, flatten, preloadSnapshot, withTimeout } from './snapshot';
import { Dictation } from './Dictation';
import { Turnstile } from './Turnstile';
import type { FeedbackKind } from './types';

type Phase = 'idle' | 'capturing' | 'open' | 'sending' | 'done' | 'error';
type Mode = 'pin' | 'draw' | 'redact';
const PREF = 'scm.feedback.includeScreenshot';
const PANEL_POSITION = 'scm.feedback.panelPosition';
const button = 'rounded border border-edge bg-panel px-3 py-1.5 text-sm text-slate-200 hover:border-hud hover:text-hud2 disabled:opacity-50';
const path = (points: [number, number][]) => points.map(([x, y], i) => `${i ? 'L' : 'M'}${x},${y}`).join(' ');

type Snapshot = { canvas: HTMLCanvasElement; w: number; h: number; capturedAt: string; failed: boolean };
type Drag = { start: [number, number]; points: [number, number][]; pin?: number; redact?: number; offset?: [number, number] };
type PanelPosition = { x: number; y: number };
const rememberPanel = (position: PanelPosition | null) => {
  try { if (position) sessionStorage.setItem(PANEL_POSITION, JSON.stringify(position)); else sessionStorage.removeItem(PANEL_POSITION); } catch { /* storage disabled */ }
};

export function Feedback() {
  const configured = useFeedbackConfigured();
  const [phase, setPhase] = useState<Phase>('idle');
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [anno, dispatch] = useReducer(annoReducer, EMPTY_ANNO);
  const [mode, setMode] = useState<Mode>('pin'), [draftPoints, setDraftPoints] = useState<[number, number][]>([]);
  const [kind, setKind] = useState<FeedbackKind>('bug'), [body, setBody] = useState(''), [email, setEmail] = useState(''), [hp, setHp] = useState('');
  const [error, setError] = useState(''), [token, setToken] = useState(''), [verification, setVerification] = useState(0);
  const [include, setInclude] = useState(() => { try { return localStorage.getItem(PREF) !== 'false'; } catch { return true; } });
  const layer = useRef<HTMLDivElement>(null), background = useRef<HTMLDivElement>(null), field = useRef<HTMLTextAreaElement>(null);
  const launch = useRef<HTMLButtonElement>(null), phaseRef = useRef<Phase>('idle'), generation = useRef(0), sending = useRef<AbortController | null>(null);
  const drag = useRef<Drag | null>(null);
  const panel = useRef<HTMLElement>(null), panelDrag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const [panelPosition, setPanelPosition] = useState<PanelPosition | null>(() => {
    try { const p = JSON.parse(sessionStorage.getItem(PANEL_POSITION) ?? 'null'); return p && Number.isFinite(p.x) && Number.isFinite(p.y) ? p : null; } catch { return null; }
  });
  const [panelDragging, setPanelDragging] = useState(false);
  phaseRef.current = phase;
  const opened = !['idle', 'capturing'].includes(phase);
  useEffect(() => {
    if (!configured) return;
    const preload = () => { void preloadSnapshot().catch(() => undefined); };
    if ('requestIdleCallback' in window) { const id = window.requestIdleCallback(preload); return () => window.cancelIdleCallback(id); }
    const id = setTimeout(preload, 1000); return () => clearTimeout(id);
  }, [configured]);
  const open = useCallback(async () => {
    if (!configured || phaseRef.current !== 'idle') return;
    const id = ++generation.current;
    const w = innerWidth, h = innerHeight, capturedAt = new Date().toISOString();
    // Arm the overall deadline before starting capture, including import and geometry work.
    const pending = withTimeout(Promise.resolve().then(captureViewport));
    phaseRef.current = 'capturing'; setPhase('capturing');
    let canvas: HTMLCanvasElement, failed = false;
    try { canvas = await pending; } catch { canvas = blankSnapshot(w, h); failed = true; }
    if (generation.current !== id) return;
    dispatch({ type: 'reset' }); setDraftPoints([]); setError(''); setToken(''); setMode('pin');
    setSnapshot({ canvas, w, h, capturedAt, failed }); setPhase('open');
  }, [configured]);
  const close = useCallback(() => { generation.current++; sending.current?.abort(); drag.current = null; panelDrag.current = null; setPanelDragging(false); setDraftPoints([]); phaseRef.current = 'idle'; setPhase('idle'); }, []);
  useEffect(() => {
    if (!configured) return;
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && phaseRef.current !== 'idle') { e.preventDefault(); e.stopImmediatePropagation(); close(); }
      else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'f') { e.preventDefault(); e.stopImmediatePropagation(); void open(); }
      else if (opened && phaseRef.current !== 'sending' && (e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') { e.preventDefault(); e.stopImmediatePropagation(); dispatch({ type: 'undo' }); }
    };
    window.addEventListener('keydown', key, true); return () => window.removeEventListener('keydown', key, true);
  }, [configured, opened, open, close]);
  useEffect(() => {
    if (!opened) return;
    const el = layer.current!;
    el.showPopover();
    const root = document.getElementById('root')!, wasInert = root.inert;
    root.inert = true;
    field.current?.focus();
    return () => { if (el.matches(':popover-open')) el.hidePopover(); root.inert = wasInert; launch.current?.focus(); };
  }, [opened]);
  useEffect(() => {
    if (!opened || !snapshot || !background.current) return;
    const c = snapshot.canvas;
    c.style.width = `${snapshot.w}px`; c.style.height = `${snapshot.h}px`;
    background.current.replaceChildren(c);
  }, [opened, snapshot]);
  useEffect(() => () => { generation.current++; sending.current?.abort(); }, []);
  useEffect(() => {
    if (!opened) return;
    const resetOutside = () => {
      const r = panel.current?.getBoundingClientRect();
      if (r && (r.left < 0 || r.top < 0 || r.right > innerWidth || r.bottom > innerHeight)) {
        panelDrag.current = null; setPanelDragging(false); setPanelPosition(null); rememberPanel(null);
      }
    };
    resetOutside();
    const observer = new ResizeObserver(resetOutside);
    if (panel.current) observer.observe(panel.current);
    window.addEventListener('resize', resetOutside);
    return () => { observer.disconnect(); window.removeEventListener('resize', resetOutside); };
  }, [opened]);
  const movePanel = (e: ReactPointerEvent) => {
    const d = panelDrag.current, r = panel.current?.getBoundingClientRect();
    if (!d || !r) return;
    const position = { x: Math.max(0, Math.min(innerWidth - r.width, d.left + e.clientX - d.x)),
      y: Math.max(0, Math.min(innerHeight - r.height, d.top + e.clientY - d.y)) };
    setPanelPosition(position); rememberPanel(position);
  };
  const bounded = (e: ReactPointerEvent): [number, number] => [Math.max(0, Math.min(snapshot!.w, e.clientX)), Math.max(0, Math.min(snapshot!.h, e.clientY))];
  const start = (e: ReactPointerEvent, pin?: number, redact?: number) => {
    if (phase === 'sending' || phase === 'done' || e.button !== 0 || !include) return;
    e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId);
    const point = bounded(e), r = anno.current.redactions.find((v) => v.id === redact);
    drag.current = { start: point, points: [point], pin, redact, offset: r ? [point[0] - r.x, point[1] - r.y] : undefined };
    setDraftPoints([point]);
  };
  const move = (e: ReactPointerEvent) => {
    const d = drag.current; if (!d) return;
    const p = bounded(e); d.points = simplify([...d.points, p]); setDraftPoints(d.points);
  };
  const finish = (e: ReactPointerEvent) => {
    const d = drag.current; if (!d) return;
    drag.current = null; setDraftPoints([]);
    const [x, y] = bounded(e);
    if (d.pin !== undefined) dispatch({ type: 'movePin', n: d.pin, x, y, element: elementAt(x, y) });
    else if (d.redact !== undefined) {
      const r = anno.current.redactions.find((v) => v.id === d.redact)!;
      dispatch({ type: 'moveRedaction', id: d.redact, x: Math.max(0, Math.min(snapshot!.w - r.w, x - d.offset![0])), y: Math.max(0, Math.min(snapshot!.h - r.h, y - d.offset![1])) });
    } else if (mode === 'pin') dispatch({ type: 'addPin', x, y, element: elementAt(x, y) });
    else if (mode === 'draw') dispatch({ type: 'addStroke', stroke: { points: simplify([...d.points, [x, y]]) } });
    else dispatch({ type: 'addRedaction', ...rectFrom(...d.start, x, y) });
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); if (!body.trim() || phaseRef.current === 'sending') return;
    const id = generation.current;
    phaseRef.current = 'sending'; setPhase('sending'); setError('');
    const controller = new AbortController(); sending.current = controller;
    try {
      const form = new FormData();
      form.append('payload', JSON.stringify({ kind, body, ...(email ? { email } : {}), pins: include ? anno.current.pins : [],
        context: collectContext(snapshot!.capturedAt), ...(token ? { turnstileToken: token } : {}), hp }));
      if (include && !snapshot!.failed) {
        const blob = await flatten(snapshot!.canvas, anno.current, snapshot!.w);
        form.append('image', blob, blob.type === 'image/webp' ? 'screenshot.webp' : 'screenshot.png');
      }
      const response = await fetch('/api/feedback', { method: 'POST', body: form, signal: controller.signal });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || 'Feedback could not be sent. Please retry.');
      if (id !== generation.current) return;
      setPhase('done'); setBody(''); setEmail(''); dispatch({ type: 'reset' });
    } catch (e) {
      if (id !== generation.current) return;
      setError(e instanceof Error ? e.message : 'Could not send feedback. Please retry.'); setPhase('error'); setToken(''); setVerification((v) => v + 1);
    }
  };
  if (!configured || import.meta.env.VITE_FEEDBACK_CAPTURE === '0') return null;
  const busy = phase === 'sending';
  const pinPosition = (n: number, x: number, y: number) => {
    const p = drag.current?.pin === n ? draftPoints.at(-1) : undefined;
    return { left: p?.[0] ?? x, top: p?.[1] ?? y };
  };
  const redactionPosition = (r: typeof anno.current.redactions[number]) => {
    const d = drag.current, p = d?.redact === r.id ? draftPoints.at(-1) : undefined;
    return { left: p ? Math.max(0, Math.min(snapshot!.w - r.w, p[0] - d!.offset![0])) : r.x,
      top: p ? Math.max(0, Math.min(snapshot!.h - r.h, p[1] - d!.offset![1])) : r.y, width: r.w, height: r.h };
  };
  return <>
    <button ref={launch} data-feedback-ui data-testid="feedback-open" type="button" onClick={() => void open()} disabled={phase === 'capturing'} aria-label="Send feedback" title="Send feedback (Ctrl/Cmd+Shift+F)"
      className="flex h-8 min-w-8 items-center justify-center gap-1.5 rounded border border-edge px-1.5 text-slate-300 hover:border-hud/60 hover:text-hud2 sm:px-2">
      <Ico name="feedback" className="h-4 w-4" /><span className={`${phase === 'capturing' ? '' : 'hidden lg:inline'} font-display text-xs font-semibold uppercase tracking-wider`}>{phase === 'capturing' ? 'Capturing…' : 'Feedback'}</span>
    </button>
    {opened && createPortal(<div ref={layer} popover="manual" data-feedback-ui data-testid="feedback-layer" data-phase={phase} role="dialog" aria-modal="true" aria-label="Send feedback"
      className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none overflow-hidden border-0 bg-[#08111e] p-0 text-slate-200"
      onKeyDown={(e) => { if (e.key !== 'Tab') return; const items = [...layer.current!.querySelectorAll<HTMLElement>('button:not(:disabled),textarea,input:not([tabindex="-1"])')].filter((el) => el.getClientRects().length); const first = items[0], last = items.at(-1); if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); } }}>
      <div ref={background} className="pointer-events-none absolute inset-0" aria-hidden="true" />
      <div data-testid="feedback-surface" aria-label="Screenshot annotation area" className={`absolute inset-0 touch-none ${include ? 'cursor-crosshair' : 'pointer-events-none'}`}
        onPointerDown={(e) => start(e)} onPointerMove={move} onPointerUp={finish} onPointerCancel={() => { drag.current = null; setDraftPoints([]); }}>
        {include && <>
          {anno.current.redactions.map((r) => <button key={r.id} type="button" aria-label={`Redaction ${r.id}; drag to move, Delete to remove`} disabled={busy || phase === 'done'} data-testid="feedback-redaction"
            className="absolute cursor-move border border-slate-600 bg-black" style={redactionPosition(r)}
            onPointerDown={(e) => { e.stopPropagation(); start(e, undefined, r.id); }} onKeyDown={(e) => { if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); dispatch({ type: 'deleteRedaction', id: r.id }); } }} />)}
          {drag.current && mode === 'redact' && !drag.current.redact && !drag.current.pin && draftPoints.length > 1 && <div className="pointer-events-none absolute bg-black" style={{ ...(() => { const r = rectFrom(...drag.current!.start, ...draftPoints.at(-1)!); return { left: r.x, top: r.y, width: r.w, height: r.h }; })() }} />}
          <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
            {anno.current.strokes.map((s, i) => <path key={i} data-testid="feedback-stroke" d={path(s.points)} fill="none" stroke="rgba(250,204,21,0.95)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />)}
            {mode === 'draw' && !drag.current?.pin && !drag.current?.redact && <path d={path(draftPoints)} fill="none" stroke="rgba(250,204,21,0.95)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />}
          </svg>
          {anno.current.pins.map((p) => <button key={p.n} type="button" data-testid="feedback-pin" disabled={busy || phase === 'done'} aria-label={`Pin ${p.n}; drag to move, Delete to remove`} className="absolute flex h-[28px] w-[28px] -translate-x-1/2 -translate-y-1/2 cursor-move items-center justify-center rounded-full border-2 border-white bg-rose-600 text-sm font-bold text-white shadow"
            style={pinPosition(p.n, p.x, p.y)} onPointerDown={(e) => { e.stopPropagation(); start(e, p.n); }}
            onKeyDown={(e) => { if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); dispatch({ type: 'deletePin', n: p.n }); } else if (e.key.startsWith('Arrow')) { e.preventDefault(); const x = Math.max(0, Math.min(snapshot!.w, p.x + (e.key === 'ArrowRight' ? 5 : e.key === 'ArrowLeft' ? -5 : 0))), y = Math.max(0, Math.min(snapshot!.h, p.y + (e.key === 'ArrowDown' ? 5 : e.key === 'ArrowUp' ? -5 : 0))); dispatch({ type: 'movePin', n: p.n, x, y, element: elementAt(x, y) }); } }}>{p.n}</button>)}
        </>}
      </div>
      <div className="absolute left-3 top-3 flex max-w-[calc(100%-24px)] flex-wrap gap-1 rounded-lg border border-edge bg-panel p-2 shadow-xl" role="toolbar" aria-label="Annotation tools">
        {(['pin', 'draw', 'redact'] as const).map((m) => <button type="button" key={m} className={`${button} ${mode === m ? 'border-hud text-hud2' : ''}`} disabled={busy || phase === 'done' || !include} aria-pressed={mode === m} data-testid={`feedback-mode-${m}`} onClick={() => setMode(m)}>{m[0].toUpperCase() + m.slice(1)}</button>)}
        <button type="button" className={button} disabled={!anno.past.length || busy} data-testid="feedback-undo" onClick={() => dispatch({ type: 'undo' })}>Undo</button>
      </div>
      <section ref={panel} data-feedback-ui data-testid="feedback-panel" style={panelPosition ? { left: panelPosition.x, top: panelPosition.y, bottom: 'auto', right: 'auto' } : undefined}
        className="absolute bottom-3 right-3 max-h-[calc(100dvh-88px)] w-[360px] max-w-[calc(100%-24px)] overflow-y-auto rounded-lg border border-edge bg-panel/55 p-4 shadow-2xl backdrop-blur-[2px] transition-colors hover:bg-panel/80 focus-within:bg-panel/80">
        <div data-testid="feedback-panel-handle" className={`mb-3 flex touch-none select-none items-center justify-between ${panelDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
          onPointerDown={(e) => {
            if (e.button !== 0 || (e.target as Element).closest('button,input,textarea,select,a')) return;
            e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId);
            const r = panel.current!.getBoundingClientRect(); panelDrag.current = { x: e.clientX, y: e.clientY, left: r.left, top: r.top }; setPanelDragging(true);
          }} onPointerMove={movePanel} onPointerUp={(e) => { if (!panelDrag.current) return; movePanel(e); panelDrag.current = null; setPanelDragging(false); e.currentTarget.releasePointerCapture(e.pointerId); }}
          onPointerCancel={() => { panelDrag.current = null; setPanelDragging(false); }} onLostPointerCapture={() => { panelDrag.current = null; setPanelDragging(false); }}>
          <h2 className="font-display text-lg text-hud2">Send feedback</h2><button type="button" className={button} onClick={close} aria-label="Close feedback">Close</button></div>
        {phase === 'done' ? <p data-testid="feedback-done" role="status" className="py-6 text-hud2">Thanks! Your feedback has been sent.</p> : <form onSubmit={(e) => void submit(e)} className="space-y-3">
          <fieldset disabled={busy} className="space-y-3">
            <legend className="sr-only">Feedback details</legend>
            <div className="flex gap-1" role="group" aria-label="Feedback kind">{(['bug', 'enhancement', 'question'] as const).map((k) => <button key={k} type="button" aria-pressed={kind === k} className={`${button} flex-1 px-1 ${kind === k ? 'border-hud text-hud2' : ''}`} onClick={() => setKind(k)}>{k[0].toUpperCase() + k.slice(1)}</button>)}</div>
            <label className="block text-sm">Message<textarea ref={field} required maxLength={8000} rows={4} value={body} onChange={(e) => setBody(e.target.value)} data-testid="feedback-body" className="mt-1 block w-full resize-y rounded border border-edge bg-black/30 p-2 text-sm" placeholder="What happened, or what would help?" /></label>
            <Dictation field={field} value={body} onChange={setBody} disabled={busy} />
            <label className="block text-sm">Reply-to email (optional)<input type="email" maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} data-testid="feedback-email" className="mt-1 block w-full rounded border border-edge bg-black/30 p-2" /></label>
            <div hidden aria-hidden="true"><label>Leave empty<input name="hp" tabIndex={-1} autoComplete="off" value={hp} onChange={(e) => setHp(e.target.value)} /></label></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" role="switch" checked={include} data-testid="feedback-include" onChange={(e) => { setInclude(e.target.checked); try { localStorage.setItem(PREF, String(e.target.checked)); } catch { /* storage disabled */ } }} />Include screenshot</label>
          </fieldset>
          {snapshot?.failed && <p role="status" data-testid="feedback-capture-skipped" className="text-xs text-amber-300">Screenshot took too long, so it was skipped. You can still pin and describe the issue.</p>}
          <p className="text-xs text-slate-400">{include ? 'Pin, draw or cover private details with Redact. ' : ''}Your message and browser context will be emailed to the SC Mapper maintainer.</p>
          {include && anno.current.pins.length > 0 && <ul className="space-y-1 text-xs text-slate-400">{anno.current.pins.map((p) => <li key={p.n} className="flex items-center justify-between gap-2"><span>{p.n}. {p.element?.ariaLabel || p.element?.text || p.element?.tag || 'Screenshot'}</span><button type="button" aria-label={`Delete pin ${p.n}`} disabled={busy} onClick={() => dispatch({ type: 'deletePin', n: p.n })}>Remove</button></li>)}</ul>}
          {import.meta.env.VITE_TURNSTILE_SITE_KEY && <Turnstile key={verification} onToken={setToken} />}
          {error && <p role="alert" data-testid="feedback-error" className="text-sm text-alert">{error}</p>}
          <button type="submit" data-testid="feedback-send" disabled={busy || !body.trim() || Boolean(import.meta.env.VITE_TURNSTILE_SITE_KEY && !token)} className={`${button} w-full border-hud/50 bg-hud/10 text-hud2`}>{busy ? 'Sending…' : phase === 'error' ? 'Retry send' : 'Send feedback'}</button>
        </form>}
      </section>
    </div>, document.body)}
  </>;
}
