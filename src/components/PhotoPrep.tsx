import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { MODEL_DOWNLOAD_MB } from '../lib/photoInfo';
import { decodeImage, encodePx, frameForTemplate, pxUrl, removeBackground, type BgEngine, type PrepProgress } from '../lib/photoPrep';
import { ASPECT_PRESETS, FRAME_MAX_REL, FRAME_MIN_REL, aspectOf, planFrame, productRect, zoomFraming, type AspectChoice, type FramePlan, type Framing, type Px } from '../lib/photoFormat';
import { fitView, panBy, place, zoomAt, type View } from '../lib/zoomView';
import { Ico } from './icons';

type Busy = PrepProgress | { phase: 'decode' };
/** the rendered output of one framing (`key` = what it was rendered from) */
interface Result { dataUrl: string; w: number; h: number; key: string }
const PREVIEW_BG = 'radial-gradient(ellipse 60% 55% at 50% 48%, rgba(79,216,255,.09), rgba(79,216,255,.025) 55%, rgba(0,0,0,0) 75%), linear-gradient(180deg, #070d16, #04070c)';
const CHECKER = 'repeating-conic-gradient(#0d1520 0% 25%, #090f18 0% 50%) 50% / 16px 16px';
const ASPECT_KEY = 'sc-mapper:photo-aspect';
const ZOOM_STEP = 1.25;
/** inspect zoom: from half the fit view up to 16 screen px per picture pixel */
const MIN_REL = 0.5, MAX_PX = 16;
/** the output is rendered this long after the last framing change (dragging stays fluid) */
const RENDER_DELAY_MS = 140;

function loadAspect(): AspectChoice {
  try {
    const o = JSON.parse(localStorage.getItem(ASPECT_KEY) ?? 'null') as AspectChoice | null;
    if (o && ASPECT_PRESETS.some((p) => p.id === o.id)) return o.id === 'custom' ? { id: 'custom', w: Number(o.w) || 4, h: Number(o.h) || 3 } : { id: o.id };
  } catch { /* ignore */ }
  return { id: 'auto' };
}
const saveAspect = (a: AspectChoice) => { try { localStorage.setItem(ASPECT_KEY, JSON.stringify(a)); } catch { /* ignore */ } };

function busyText(b: Busy): string {
  switch (b.phase) {
    case 'decode': return 'Reading the picture…';
    case 'download': return `Downloading the background model (once): ${(b.loaded / 1e6).toFixed(1)} / ${(b.total / 1e6).toFixed(1)} MB`;
    case 'init': return 'Starting the model…';
    case 'infer': return 'Finding the device…';
    case 'refine': return 'Cleaning the edges…';
  }
}
/** pane size, kept up to date */
function usePaneSize() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const ro = useRef<ResizeObserver | null>(null);
  const attach = useCallback((el: HTMLDivElement | null) => {
    ro.current?.disconnect(); ro.current = null;
    ref.current = el;
    if (!el) return;
    const m = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    m();
    ro.current = new ResizeObserver(m);
    ro.current.observe(el);
  }, []);
  return { ref, attach, size };
}
/** wheel listener that can preventDefault (React's onWheel is passive) */
function useWheel(ref: React.RefObject<HTMLDivElement | null>, fn: (e: WheelEvent, x: number, y: number) => void, ready: boolean) {
  const f = useRef(fn); f.current = fn;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const on = (e: WheelEvent) => { e.preventDefault(); const r = el.getBoundingClientRect(); f.current(e, e.clientX - r.left, e.clientY - r.top); };
    el.addEventListener('wheel', on, { passive: false });
    return () => el.removeEventListener('wheel', on);
  }, [ref, ready]);
}
const wheelFactor = (e: WheelEvent) => Math.pow(ZOOM_STEP, -Math.sign(e.deltaY) * Math.min(3, Math.abs(e.deltaY) / 100 || 1));
/** pointer drag (captured): calls `fn(dx, dy)` with the movement since the last event */
function useDrag(fn: (dx: number, dy: number) => void) {
  const last = useRef<{ x: number; y: number } | null>(null);
  return {
    onPointerDown: (e: React.PointerEvent) => { if (e.button !== 0) return; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); last.current = { x: e.clientX, y: e.clientY }; },
    onPointerMove: (e: React.PointerEvent) => { const l = last.current; if (!l) return; fn(e.clientX - l.x, e.clientY - l.y); last.current = { x: e.clientX, y: e.clientY }; },
    onPointerUp: () => { last.current = null; },
    onPointerCancel: () => { last.current = null; },
  };
}

/** after an upload: optionally remove the background (in-browser model), then frame the product on the canvas (aspect preset:
 * auto / stick / throttle / square / custom) like a profile-photo cropper: the canvas is a fixed frame, zoom and drag move the
 * product inside it, what is outside is cut off (shown dimmed). The output is exactly the frame's content at the canvas
 * resolution, with the built-in glow added after framing. The left pane is for inspecting the picture (own zoom, original or
 * cut-out). "Keep original" stores the picture as uploaded. */
export function PhotoPrep({ file, target, onUse, onKeep, onCancel }: {
  file: File; target: string;
  onUse: (img: { dataUrl: string; w: number; h: number }, how: 'cutout' | 'format') => void;
  onKeep: () => void; onCancel: () => void;
}) {
  const [orig, setOrig] = useState<Px | null>(null);
  const [size0, setSize0] = useState<[number, number] | null>(null);
  const [origUrl] = useState(() => URL.createObjectURL(file));
  const [busy, setBusy] = useState<Busy | null>({ phase: 'decode' });
  const [err, setErr] = useState<string | null>(null);
  const [cut, setCut] = useState<{ px: Px; url: string; engine: BgEngine; note?: string } | null>(null);
  const [mode, setMode] = useState<'cutout' | 'format' | null>(null);
  const [look, setLook] = useState(true);
  const [aspect, setAspect] = useState<AspectChoice>(loadAspect);
  const [result, setResult] = useState<Result | null>(null);
  const [rendering, setRendering] = useState(false);
  useEffect(() => () => URL.revokeObjectURL(origUrl), [origUrl]);
  useEffect(() => () => { if (cut) URL.revokeObjectURL(cut.url); }, [cut]);
  useEffect(() => {
    let live = true;
    decodeImage(file).then((d) => { if (live) { setOrig(d.px); setSize0([d.w0, d.h0]); setBusy(null); } }, (e) => { if (live) { setErr((e as Error).message); setBusy(null); } });
    return () => { live = false; };
  }, [file]);
  // Escape cancels (captured before the editor's own keys)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); e.preventDefault(); onCancel(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onCancel]);

  const removeBg = async () => {
    if (!orig) return;
    setErr(null);
    try {
      if (!cut) {
        const forced = (window as { __SC_TEST_BG_ENGINE?: BgEngine }).__SC_TEST_BG_ENGINE;
        const c = await removeBackground(orig, setBusy, forced ?? 'model');
        setCut({ ...c, url: await pxUrl(c.px) });
        setInspect('cutout');
      }
      setBusy(null); setMode('cutout');
    } catch (e) { setErr((e as Error).message); setBusy(null); }
  };
  const chooseAspect = (a: AspectChoice) => { setAspect(a); saveAspect(a); };

  // ---- framing: the plan (trimmed product, canvas W × H, initial framing = Fit) and the current framing (null = Fit)
  const base = mode === 'cutout' ? cut?.px : mode === 'format' ? orig : null;
  const baseUrl = mode === 'cutout' ? cut?.url : origUrl;
  const ratio = aspectOf(aspect);
  const plan = useMemo<FramePlan | null>(() => (base ? planFrame(base, ratio) : null), [base, ratio]);
  const [framed, setFramed] = useState<{ plan: FramePlan; f: Framing } | null>(null);
  const fr = plan ? (framed?.plan === plan ? framed.f : plan.framing) : null;
  const setFr = (f: Framing | null) => plan && setFramed(f ? { plan, f } : null);
  const key = plan && fr ? `${mode}|${plan.W}x${plan.H}|${fr.k.toFixed(6)},${fr.x.toFixed(2)},${fr.y.toFixed(2)}|${look}` : '';
  const stale = !result || result.key !== key;
  // render the output shortly after the last change (only the newest run is kept)
  const run = useRef(0);
  useEffect(() => {
    if (!base || !plan || !fr) return;
    const id = ++run.current;
    const t = window.setTimeout(() => {
      setRendering(true);
      try {
        const px = frameForTemplate(base, plan, fr, look);
        const enc = encodePx(px);
        if (id === run.current) setResult({ ...enc, key });
      } catch (e) { setErr((e as Error).message); }
      if (id === run.current) setRendering(false);
    }, result ? RENDER_DELAY_MS : 0);
    return () => window.clearTimeout(t);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  // frame pane: the canvas drawn as a fixed frame, scaled to fit with room around it for the cut-off (dimmed) parts
  const fp = usePaneSize();
  const frameBox = plan && fp.size.w ? (() => {
    const m = 0.12 * Math.min(fp.size.w, fp.size.h);
    const d = Math.min((fp.size.w - 2 * m) / plan.W, (fp.size.h - 2 * m) / plan.H);
    return { d, left: (fp.size.w - plan.W * d) / 2, top: (fp.size.h - plan.H * d) / 2 };
  })() : null;
  const frRef = useRef(fr); frRef.current = fr;
  const frameZoom = (factor: number, px?: number, py?: number) => {
    const f = frRef.current;
    if (!plan || !f || !frameBox) return;
    const ox = px === undefined ? plan.W / 2 : (px - frameBox.left) / frameBox.d, oy = py === undefined ? plan.H / 2 : (py - frameBox.top) / frameBox.d;
    setFr(zoomFraming(plan, f, factor, ox, oy));
  };
  useWheel(fp.ref, (e, x, y) => frameZoom(wheelFactor(e), x, y), !!plan);
  const frameDrag = useDrag((dx, dy) => { const f = frRef.current; if (f && frameBox) setFr({ ...f, x: f.x + dx / frameBox.d, y: f.y + dy / frameBox.d }); });
  const rect = plan && fr ? productRect(plan, fr) : null;
  const scalePct = plan && fr ? Math.round((fr.k / plan.framing.k) * 100) : 100;
  const margin = rect && plan ? Math.min(rect.x, rect.y, plan.W - rect.x - rect.w, plan.H - rect.y - rect.h) : 0;

  // ---- inspect pane: the original or the cut-out, with its own zoom / pan (to check the cut-out edges)
  const [inspect, setInspect] = useState<'original' | 'cutout'>('original');
  const showCut = inspect === 'cutout' && !!cut;
  const ip = usePaneSize();
  const [cam, setCam] = useState<View | null>(null);
  const fit = orig && ip.size.w ? fitView([{ x: 0, y: 0, w: orig.width, h: orig.height }], ip.size.w, ip.size.h) : { z: 1, cx: 0, cy: 0 };
  const view = cam ?? fit;
  const viewRef = useRef(view); viewRef.current = view;
  // percent: screen px per pixel of the shown picture (the uploaded file, or the cut-out at working size)
  const perPx = orig && size0 && !showCut ? orig.width / size0[0] : 1;
  const zoomPct = Math.round(view.z * perPx * 100);
  const inspectZoom = (factor: number, px?: number, py?: number) => {
    const w = ip.size.w, h = ip.size.h;
    setCam(zoomAt(viewRef.current, factor, px ?? w / 2, py ?? h / 2, w, h, fit.z * MIN_REL, Math.max(fit.z * MIN_REL, MAX_PX / perPx)));
  };
  useWheel(ip.ref, (e, x, y) => inspectZoom(wheelFactor(e), x, y), !!orig);
  const inspectDrag = useDrag((dx, dy) => setCam(panBy(viewRef.current, dx, dy)));
  const inspectStyle = (): CSSProperties => {
    const p = place(view, { x: 0, y: 0, w: orig!.width, h: orig!.height }, ip.size.w, ip.size.h);
    return { position: 'absolute', left: p.left, top: p.top, width: p.width, height: p.height, maxWidth: 'none', imageRendering: view.z * perPx >= 2 ? 'pixelated' : 'auto' };
  };

  const pct = busy?.phase === 'download' ? Math.round((100 * busy.loaded) / Math.max(1, busy.total)) : undefined;
  const btn = 'rounded border px-2.5 py-1 text-xs disabled:opacity-40';
  const zbtn = 'rounded border border-edge px-2 py-0.5 text-xs text-slate-300 hover:border-hud/60 disabled:opacity-40';
  const head = 'flex min-h-6 flex-wrap items-center gap-1.5 text-xs text-slate-400';
  const cap = 'text-[11px] uppercase tracking-[0.2em] text-slate-500';
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4" data-testid="photo-prep" role="dialog" aria-modal="true" aria-label="Prepare the picture"
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }} onDrop={(e) => { e.preventDefault(); e.stopPropagation(); }}>
      <div className="hud-panel flex max-h-full w-full max-w-6xl flex-col gap-3 overflow-auto p-4" style={{ background: 'rgb(8 14 24 / 0.98)' }}>
        <div className="flex items-center gap-2">
          <h3 className="font-display text-sm font-bold uppercase tracking-[0.2em] text-mod"><Ico name="image" /> Prepare the picture</h3>
          <span className="truncate text-xs text-slate-400">for {target} · {file.name}</span>
          <button type="button" onClick={onCancel} aria-label="Cancel" data-testid="photo-prep-cancel" className="ml-auto px-1 text-slate-400 hover:text-slate-100"><Ico name="close" /></button>
        </div>
        <div className="grid min-h-0 grid-cols-1 gap-3 md:grid-cols-2">
          {/* inspect: original / cut-out with its own zoom */}
          <figure className="flex min-w-0 flex-col gap-1">
            <div className={head} data-testid="photo-prep-zoom" data-z={view.z} data-cx={view.cx} data-cy={view.cy}>
              <span className={`${cap} mr-1`}>Inspect</span>
              {cut && (
                <span className="mr-1 inline-flex overflow-hidden rounded border border-edge" role="radiogroup" aria-label="Picture to inspect">
                  {(['original', 'cutout'] as const).map((k) => (
                    <button key={k} type="button" role="radio" aria-checked={inspect === k} data-testid={`photo-prep-inspect-${k}`} onClick={() => setInspect(k)}
                      className={`px-2 py-0.5 text-[11px] ${inspect === k ? 'bg-hud/15 text-hud2' : 'text-slate-400 hover:text-slate-200'}`}>{k === 'original' ? 'Original' : 'Cut-out'}</button>
                  ))}
                </span>
              )}
              <button type="button" className={zbtn} onClick={() => inspectZoom(1 / ZOOM_STEP)} aria-label="Zoom out" data-testid="photo-prep-zoom-out" disabled={!orig}>−</button>
              <span className="w-12 text-center font-mono text-slate-200" data-testid="photo-prep-zoom-pct" aria-live="polite">{zoomPct}%</span>
              <button type="button" className={zbtn} onClick={() => inspectZoom(ZOOM_STEP)} aria-label="Zoom in" data-testid="photo-prep-zoom-in" disabled={!orig}>+</button>
              <button type="button" className={`${zbtn} ${cam ? '' : 'border-hud/60 text-hud2'}`} onClick={() => setCam(null)} data-testid="photo-prep-zoom-fit" disabled={!orig}>Fit</button>
              <button type="button" className={zbtn} onClick={() => inspectZoom(1 / (viewRef.current.z * perPx))} data-testid="photo-prep-zoom-100" disabled={!orig}>100%</button>
            </div>
            <div ref={ip.attach} data-testid="photo-prep-before-pane" onDoubleClick={() => setCam(null)} {...inspectDrag}
              className={`relative aspect-[4/3] touch-none select-none overflow-hidden rounded border border-edge/70 ${orig ? 'cursor-grab active:cursor-grabbing' : ''}`} style={{ background: showCut ? CHECKER : PREVIEW_BG }}>
              {orig && ip.size.w > 0 && <img src={showCut ? cut!.url : origUrl} alt={showCut ? 'Cut-out' : 'Original'} data-testid="photo-prep-before" data-shown={showCut ? 'cutout' : 'original'} draggable={false} style={inspectStyle()} />}
              {busy?.phase === 'decode' && <span className="absolute inset-0 flex items-center justify-center text-xs text-slate-500">{busyText(busy)}</span>}
            </div>
            <figcaption className="text-[10px] text-slate-500">{size0 ? `${showCut ? 'cut-out' : 'original'} ${size0[0]}×${size0[1]}` : ''} · wheel to zoom at the cursor, drag to pan, double-click to fit · does not change the output</figcaption>
          </figure>
          {/* framing: the canvas is a fixed frame; zoom / drag move the product inside it */}
          <figure className="flex min-w-0 flex-col gap-1">
            <div className={head}>
              <span className={`${cap} mr-1`}>{mode === 'cutout' ? 'Frame the cut-out' : mode === 'format' ? 'Frame the picture' : 'Result'}</span>
              <button type="button" className={zbtn} onClick={() => frameZoom(1 / ZOOM_STEP)} aria-label="Make the product smaller" data-testid="photo-prep-frame-out" disabled={!plan || scalePct <= FRAME_MIN_REL * 100}>−</button>
              <span className="w-12 text-center font-mono text-slate-200" data-testid="photo-prep-frame-pct" title="Product size relative to Fit (the built-in scale)">{scalePct}%</span>
              <button type="button" className={zbtn} onClick={() => frameZoom(ZOOM_STEP)} aria-label="Make the product bigger" data-testid="photo-prep-frame-in" disabled={!plan || scalePct >= FRAME_MAX_REL * 100}>+</button>
              <button type="button" className={`${zbtn} ${plan && !framed ? 'border-hud/60 text-hud2' : ''}`} onClick={() => setFr(null)} data-testid="photo-prep-frame-fit" disabled={!plan}
                title="Back to the initial framing: product centred at the built-in scale with the 5 % margin">Fit</button>
              {(rendering || (plan && stale)) && <span className="text-[10px] text-hud2" data-testid="photo-prep-rendering">rendering…</span>}
            </div>
            <div ref={fp.attach} data-testid="photo-prep-after-pane" onDoubleClick={() => setFr(null)} {...(plan ? frameDrag : {})}
              className={`relative aspect-[4/3] touch-none select-none overflow-hidden rounded border border-edge/70 ${plan ? 'cursor-move' : ''}`} style={{ background: CHECKER }}>
              {plan && fr && frameBox && baseUrl && base && <>
                {/* the whole product, live (follows every drag / zoom); parts outside the frame stay visible, dimmed */}
                <img src={baseUrl} alt="" aria-hidden draggable={false} data-testid="photo-prep-frame-live"
                  style={{ position: 'absolute', left: frameBox.left + fr.x * frameBox.d, top: frameBox.top + fr.y * frameBox.d, width: base.width * fr.k * frameBox.d, height: base.height * fr.k * frameBox.d, maxWidth: 'none' }} />
                {/* the rendered output (exactly the frame's content, glow included), on top once it is up to date */}
                {result && <img src={result.dataUrl} alt="Result" data-testid="photo-prep-after" draggable={false} data-w={result.w} data-h={result.h} data-mode={plan.mode}
                  data-engine={mode === 'cutout' ? cut?.engine : 'none'} data-stale={stale ? '1' : undefined}
                  style={{ position: 'absolute', left: frameBox.left, top: frameBox.top, width: plan.W * frameBox.d, height: plan.H * frameBox.d, maxWidth: 'none', opacity: stale ? 0 : 1, background: plan.mode === 'opaque' ? undefined : PREVIEW_BG }} />}
                <div aria-hidden data-testid="photo-prep-canvas-frame" data-w={plan.W} data-h={plan.H} data-k={fr.k} data-x={fr.x} data-y={fr.y} data-cropped={rect?.cropped ? '1' : undefined}
                  className="pointer-events-none absolute border border-hud/70"
                  style={{ left: frameBox.left, top: frameBox.top, width: plan.W * frameBox.d, height: plan.H * frameBox.d, boxShadow: '0 0 0 9999px rgba(3,6,11,0.72)' }} />
                {rect && <div aria-hidden data-testid="photo-prep-product-frame" className="pointer-events-none absolute border border-dashed border-mod/50"
                  style={{ left: frameBox.left + rect.x * frameBox.d, top: frameBox.top + rect.y * frameBox.d, width: rect.w * frameBox.d, height: rect.h * frameBox.d }} />}
              </>}
              {!plan && !busy && <span className="absolute inset-0 flex items-center justify-center px-6 text-center text-xs text-slate-500">Remove the background, or just format the picture, then frame it on the canvas: drag to move the product, wheel or +/− to resize it.</span>}
              {busy && busy.phase !== 'decode' && (
                <div className="absolute inset-x-6 bottom-6 space-y-1" data-testid="photo-prep-progress" role="progressbar" aria-label={busyText(busy)} aria-valuemin={0} aria-valuemax={100} {...(pct !== undefined ? { 'aria-valuenow': pct } : {})}>
                  <div className="text-center text-xs text-hud2">{busyText(busy)}</div>
                  <div className="h-1.5 overflow-hidden rounded bg-white/10">
                    <div className={`h-full rounded bg-hud ${pct === undefined ? 'w-1/3 animate-pulse' : ''}`} style={pct !== undefined ? { width: `${pct}%` } : undefined} />
                  </div>
                </div>
              )}
            </div>
            <figcaption className="min-h-[2.6em] text-[10px] leading-[1.3] text-slate-500" data-testid="photo-prep-output">
              {plan && rect ? <>Output {plan.W}×{plan.H} ({(plan.W / plan.H).toFixed(2)}:1){result && (result.w !== plan.W || result.h !== plan.H) ? `, stored at ${result.w}×${result.h}` : ''} · product {rect.w}×{rect.h}
                {rect.cropped ? <span className="text-mod"> · cut off at the frame edge</span> : ` · ≥ ${margin} px margin`} · drag to move, wheel to resize, double-click to fit</> : 'The frame is the stored picture: what is inside it is kept, the dimmed rest is cut off.'}
            </figcaption>
          </figure>
        </div>
        {err && <p className="text-xs text-alert" role="alert">{err}</p>}
        {cut?.note && mode === 'cutout' && <p className="text-xs text-mod" data-testid="photo-prep-note">{cut.note}</p>}
        {plan?.mode === 'opaque' && <p className="text-[11px] text-slate-500">This picture has no transparent background: trimmed to its plain background colour, and the canvas around it is filled with that colour (the glow needs a cut-out).</p>}
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" disabled={!orig || !!busy} onClick={() => void removeBg()} data-testid="photo-prep-remove"
            className={`${btn} ${mode === 'cutout' ? 'border-hud/60 bg-hud/10 text-hud2' : 'border-edge text-slate-200 hover:border-hud/60'}`}>
            Remove background
          </button>
          <button type="button" disabled={!orig || !!busy} onClick={() => { setErr(null); setMode('format'); }} data-testid="photo-prep-format"
            className={`${btn} ${mode === 'format' ? 'border-hud/60 bg-hud/10 text-hud2' : 'border-edge text-slate-200 hover:border-hud/60'}`}>
            Format only (trim + margin)
          </button>
          <label className="flex items-center gap-1 text-xs text-slate-300"><input type="checkbox" checked={look} disabled={!!busy} onChange={(e) => setLook(e.target.checked)} data-testid="photo-prep-look" /> built-in glow</label>
          <span className="text-[10px] text-slate-500">Runs in your browser; the model (~{MODEL_DOWNLOAD_MB} MB) downloads on first use and the picture never leaves this device.</span>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-xs" role="radiogroup" aria-label="Canvas shape" data-testid="photo-prep-aspect">
          <span className="mr-1 text-[11px] uppercase tracking-[0.2em] text-slate-500">Canvas</span>
          {ASPECT_PRESETS.map((p) => (
            <button key={p.id} type="button" role="radio" aria-checked={aspect.id === p.id} title={p.hint} disabled={!!busy} data-testid={`photo-prep-aspect-${p.id}`}
              onClick={() => chooseAspect(p.id === 'custom' ? { id: 'custom', w: aspect.w ?? 4, h: aspect.h ?? 3 } : { id: p.id })}
              className={`rounded border px-2 py-0.5 ${aspect.id === p.id ? 'border-hud/60 bg-hud/10 text-hud2' : 'border-edge text-slate-300 hover:border-hud/40'} disabled:opacity-40`}>
              {p.label}{'w' in p && p.id !== 'square' ? <span className="ml-1 text-[10px] text-slate-500">{(p.w / p.h).toFixed(2)}:1</span> : null}
            </button>
          ))}
          {aspect.id === 'custom' && (
            <span className="flex items-center gap-1 text-slate-400">
              <input type="number" min={1} max={100} value={aspect.w ?? 4} aria-label="Canvas width ratio" data-testid="photo-prep-aspect-w" disabled={!!busy}
                onChange={(e) => chooseAspect({ id: 'custom', w: Math.max(1, Number(e.target.value) || 1), h: aspect.h ?? 3 })} className="w-14 rounded border border-edge bg-panel2 px-1 py-0.5 text-slate-200" />
              :
              <input type="number" min={1} max={100} value={aspect.h ?? 3} aria-label="Canvas height ratio" data-testid="photo-prep-aspect-h" disabled={!!busy}
                onChange={(e) => chooseAspect({ id: 'custom', w: aspect.w ?? 4, h: Math.max(1, Number(e.target.value) || 1) })} className="w-14 rounded border border-edge bg-panel2 px-1 py-0.5 text-slate-200" />
            </span>
          )}
          <span className="text-[10px] text-slate-500">{ASPECT_PRESETS.find((p) => p.id === aspect.id)?.hint}; a new shape starts from Fit (product centred), remembered for next time</span>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-edge/60 pt-3">
          <button type="button" onClick={onKeep} disabled={busy?.phase === 'decode'} data-testid="photo-prep-keep" className={`${btn} border-edge text-slate-300 hover:border-hud/60`}>Keep original</button>
          <button type="button" disabled={!result || stale || rendering || !!busy} onClick={() => result && onUse({ dataUrl: result.dataUrl, w: result.w, h: result.h }, mode === 'cutout' ? 'cutout' : 'format')} data-testid="photo-prep-use"
            className={`${btn} border-ok/60 bg-ok/10 font-semibold text-ok hover:bg-ok/20`}>{mode === 'format' ? 'Use formatted' : 'Use cut-out'}</button>
        </div>
      </div>
    </div>
  );
}
