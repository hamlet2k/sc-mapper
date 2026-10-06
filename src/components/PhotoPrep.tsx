import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { MODEL_DOWNLOAD_MB } from '../lib/photoInfo';
import { decodeImage, encodePx, formatForTemplate, removeBackground, type BgEngine, type PrepProgress } from '../lib/photoPrep';
import { ASPECT_PRESETS, aspectOf, type AspectChoice, type Px } from '../lib/photoFormat';
import { fitView, panBy, place, zoomAt, type View, type ZRect } from '../lib/zoomView';
import { Ico } from './icons';

type Busy = PrepProgress | { phase: 'decode' } | { phase: 'format' };
/** the stored result, and where it sits on the original picture: `at` = its rect in original (working) px, `product` = the
 * product box inside it (result px), for the margin preview */
interface Result { dataUrl: string; w: number; h: number; mode: 'alpha' | 'opaque'; pad: number; at: ZRect; product: ZRect }
const PREVIEW_BG = 'radial-gradient(ellipse 60% 55% at 50% 48%, rgba(79,216,255,.09), rgba(79,216,255,.025) 55%, rgba(0,0,0,0) 75%), linear-gradient(180deg, #070d16, #04070c)';
const tick = () => new Promise((r) => setTimeout(r, 0));
const ASPECT_KEY = 'sc-mapper:photo-aspect';
const ZOOM_STEP = 1.25;
/** zoom range relative to the fit view, and at most 16 screen px per result pixel */
const MIN_REL = 0.5, MAX_PX = 16;

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
    case 'format': return 'Formatting…';
  }
}

/** after an upload: optionally remove the background (in-browser model) and/or format the picture like the built-in photos
 * (canvas shape: auto / stick / throttle / square / custom), with a synced zoomable before / after preview. "Keep original"
 * stores the picture as uploaded (the previous behaviour). */
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
  const [cut, setCut] = useState<{ px: Px; engine: BgEngine; note?: string } | null>(null);
  const [mode, setMode] = useState<'cutout' | 'format' | null>(null);
  const [look, setLook] = useState(true);
  const [aspect, setAspect] = useState<AspectChoice>(loadAspect);
  const [result, setResult] = useState<Result | null>(null);
  const run = useRef(0);
  useEffect(() => () => URL.revokeObjectURL(origUrl), [origUrl]);
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

  const format = async (base: Px, withLook: boolean, shape: AspectChoice) => {
    const id = ++run.current;
    setBusy({ phase: 'format' }); await tick();
    try {
      const f = formatForTemplate(base, withLook, aspectOf(shape));
      const enc = encodePx(f.px);
      const e = enc.w / f.px.width, s = 1 / (f.k * e); // stored px per formatted px; original px per stored px
      if (id === run.current) setResult({ ...enc, mode: f.mode, pad: Math.round(f.pad * e),
        at: { x: f.box.x - f.padX / f.k, y: f.box.y - f.padY / f.k, w: enc.w * s, h: enc.h * s },
        product: { x: f.padX * e, y: f.padY * e, w: f.product.w * e, h: f.product.h * e } });
    } catch (er) { setErr((er as Error).message); }
    if (id === run.current) setBusy(null);
  };
  const baseNow = () => (mode === 'cutout' ? cut?.px : mode === 'format' ? orig : null);
  const removeBg = async () => {
    if (!orig) return;
    setErr(null); setResult(null); setMode('cutout');
    try {
      const forced = (window as { __SC_TEST_BG_ENGINE?: BgEngine }).__SC_TEST_BG_ENGINE;
      const c = cut ?? await removeBackground(orig, setBusy, forced ?? 'model');
      setCut(c);
      await format(c.px, look, aspect);
    } catch (e) { setErr((e as Error).message); setBusy(null); }
  };
  const formatOnly = async () => { if (!orig) return; setErr(null); setResult(null); setMode('format'); await format(orig, look, aspect); };
  const toggleLook = (v: boolean) => { setLook(v); const b = baseNow(); if (b) void format(b, v, aspect); };
  const chooseAspect = (a: AspectChoice) => { setAspect(a); saveAspect(a); const b = baseNow(); if (b) void format(b, look, a); };

  // ---- synced zoom / pan: one camera (original picture coordinates) for both panes; null = fit everything
  const paneRef = useRef<HTMLDivElement>(null);
  const [pane, setPane] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = paneRef.current;
    if (!el) return;
    const m = () => setPane({ w: el.clientWidth, h: el.clientHeight });
    m();
    const ro = new ResizeObserver(m);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const [cam, setCam] = useState<View | null>(null);
  const origRect: ZRect | null = orig ? { x: 0, y: 0, w: orig.width, h: orig.height } : null;
  const fit = fitView([origRect, result?.at].filter(Boolean) as ZRect[], pane.w, pane.h);
  const view = cam ?? fit;
  // percent: screen px per stored result px (what will be kept), or per original file px before there is a result
  const perPx = result ? result.at.w / result.w : orig && size0 ? orig.width / size0[0] : 1;
  const pctOf = (z: number) => Math.round(z * perPx * 100);
  const limits = { min: fit.z * MIN_REL, max: MAX_PX / perPx };
  const viewRef = useRef(view); viewRef.current = view;
  const limRef = useRef(limits); limRef.current = limits;
  const zoomBy = useCallback((factor: number, px?: number, py?: number) => {
    const { w, h } = paneRef.current ? { w: paneRef.current.clientWidth, h: paneRef.current.clientHeight } : { w: 0, h: 0 };
    setCam(zoomAt(viewRef.current, factor, px ?? w / 2, py ?? h / 2, w, h, limRef.current.min, Math.max(limRef.current.min, limRef.current.max)));
  }, []);
  const setPct = (p: number) => zoomBy(p / 100 / (viewRef.current.z * perPx));
  // wheel zoom around the cursor (non-passive listener, so the page does not scroll), drag to pan, on either pane
  const panes = useRef<(HTMLDivElement | null)[]>([]);
  useEffect(() => {
    const els = panes.current.filter(Boolean) as HTMLDivElement[];
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
      zoomBy(Math.pow(ZOOM_STEP, -Math.sign(e.deltaY) * Math.min(3, Math.abs(e.deltaY) / 100 || 1)), e.clientX - r.left, e.clientY - r.top);
    };
    els.forEach((el) => el.addEventListener('wheel', onWheel, { passive: false }));
    return () => els.forEach((el) => el.removeEventListener('wheel', onWheel));
  }, [zoomBy]);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const onDown = (e: React.PointerEvent) => { if (e.button !== 0) return; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY }; };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    setCam(panBy(viewRef.current, e.clientX - d.x, e.clientY - d.y));
    drag.current = { x: e.clientX, y: e.clientY };
  };
  const onUp = () => { drag.current = null; };
  const imgStyle = (r: ZRect, scaleToScreen: number): CSSProperties => {
    const p = place(view, r, pane.w, pane.h);
    return { position: 'absolute', left: p.left, top: p.top, width: p.width, height: p.height, maxWidth: 'none', imageRendering: scaleToScreen >= 2 ? 'pixelated' : 'auto' };
  };

  const pct = busy?.phase === 'download' ? Math.round((100 * busy.loaded) / Math.max(1, busy.total)) : undefined;
  const btn = 'rounded border px-2.5 py-1 text-xs disabled:opacity-40';
  const zbtn = 'rounded border border-edge px-2 py-0.5 text-xs text-slate-300 hover:border-hud/60 disabled:opacity-40';
  const zoomPct = pctOf(view.z);
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4" data-testid="photo-prep" role="dialog" aria-modal="true" aria-label="Prepare the picture"
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }} onDrop={(e) => { e.preventDefault(); e.stopPropagation(); }}>
      <div className="hud-panel flex max-h-full w-full max-w-6xl flex-col gap-3 overflow-auto p-4" style={{ background: 'rgb(8 14 24 / 0.98)' }}>
        <div className="flex items-center gap-2">
          <h3 className="font-display text-sm font-bold uppercase tracking-[0.2em] text-mod"><Ico name="image" /> Prepare the picture</h3>
          <span className="truncate text-xs text-slate-400">for {target} · {file.name}</span>
          <button type="button" onClick={onCancel} aria-label="Cancel" data-testid="photo-prep-cancel" className="ml-auto px-1 text-slate-400 hover:text-slate-100"><Ico name="close" /></button>
        </div>
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-400" data-testid="photo-prep-zoom" data-z={view.z} data-cx={view.cx} data-cy={view.cy}>
          <span className="mr-1 text-[11px] uppercase tracking-[0.2em] text-slate-500">Zoom</span>
          <button type="button" className={zbtn} onClick={() => zoomBy(1 / ZOOM_STEP)} aria-label="Zoom out" data-testid="photo-prep-zoom-out" disabled={!orig}>−</button>
          <span className="w-14 text-center font-mono text-slate-200" data-testid="photo-prep-zoom-pct" aria-live="polite">{zoomPct}%</span>
          <button type="button" className={zbtn} onClick={() => zoomBy(ZOOM_STEP)} aria-label="Zoom in" data-testid="photo-prep-zoom-in" disabled={!orig}>+</button>
          <button type="button" className={`${zbtn} ${cam ? '' : 'border-hud/60 text-hud2'}`} onClick={() => setCam(null)} data-testid="photo-prep-zoom-fit" disabled={!orig}>Fit</button>
          <button type="button" className={zbtn} onClick={() => setPct(100)} data-testid="photo-prep-zoom-100" disabled={!orig}>100%</button>
          <span className="text-[10px] text-slate-500">wheel to zoom at the cursor · drag to pan · both sides move together{result ? ' · 100% = one pixel of the stored picture' : ''}</span>
        </div>
        <div className="grid min-h-0 grid-cols-1 gap-3 md:grid-cols-2">
          {([['Original', 'photo-prep-before'], [mode === 'cutout' ? 'Cut-out' : mode === 'format' ? 'Formatted' : 'Result', 'photo-prep-after']] as const).map(([title, tid], k) => (
            <figure key={tid} className="flex min-w-0 flex-col gap-1">
              <figcaption className="text-[11px] uppercase tracking-[0.2em] text-slate-500">{title}
                {tid === 'photo-prep-before' && size0 && <span className="ml-2 normal-case tracking-normal">{size0[0]}×{size0[1]}</span>}
                {tid === 'photo-prep-after' && result && <span className="ml-2 normal-case tracking-normal">{result.w}×{result.h} ({(result.w / result.h).toFixed(2)}:1), product {Math.round(result.product.w)}×{Math.round(result.product.h)}, ≥ {result.pad} px margin</span>}
              </figcaption>
              <div ref={(el) => { panes.current[k] = el; if (k === 0) paneRef.current = el; }} data-testid={`${tid}-pane`}
                className={`relative aspect-[4/3] touch-none select-none overflow-hidden rounded border border-edge/70 ${orig ? 'cursor-grab active:cursor-grabbing' : ''}`} style={{ backgroundImage: PREVIEW_BG }}
                onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onDoubleClick={() => setCam(null)}>
                {tid === 'photo-prep-before' && origRect && pane.w > 0 && <img src={origUrl} alt={title} data-testid={tid} draggable={false} style={imgStyle(origRect, view.z * (orig!.width / size0![0]))} />}
                {tid === 'photo-prep-after' && result && pane.w > 0 && <>
                  <img src={result.dataUrl} alt={title} data-testid={tid} draggable={false}
                    data-w={result.w} data-h={result.h} data-mode={result.mode} data-engine={mode === 'cutout' ? cut?.engine : 'none'} style={imgStyle(result.at, view.z * perPx)} />
                  {/* margin preview: the stored canvas and the product box inside it */}
                  <div aria-hidden data-testid="photo-prep-canvas-frame" className="pointer-events-none absolute border border-hud/40" style={place(view, result.at, pane.w, pane.h)} />
                  <div aria-hidden data-testid="photo-prep-product-frame" className="pointer-events-none absolute border border-dashed border-mod/50"
                    style={place(view, { x: result.at.x + result.product.x * perPx, y: result.at.y + result.product.y * perPx, w: result.product.w * perPx, h: result.product.h * perPx }, pane.w, pane.h)} />
                </>}
                {tid === 'photo-prep-after' && !result && !busy && <span className="absolute inset-0 flex items-center justify-center px-6 text-center text-xs text-slate-500">Remove the background, or just format the picture (trim + margin) like the built-in photos.</span>}
                {busy && tid === 'photo-prep-after' && (
                  <div className="absolute inset-x-6 bottom-6 space-y-1" data-testid="photo-prep-progress" role="progressbar" aria-label={busyText(busy)} aria-valuemin={0} aria-valuemax={100} {...(pct !== undefined ? { 'aria-valuenow': pct } : {})}>
                    <div className="text-center text-xs text-hud2">{busyText(busy)}</div>
                    <div className="h-1.5 overflow-hidden rounded bg-white/10">
                      <div className={`h-full rounded bg-hud ${pct === undefined ? 'w-1/3 animate-pulse' : ''}`} style={pct !== undefined ? { width: `${pct}%` } : undefined} />
                    </div>
                  </div>
                )}
              </div>
            </figure>
          ))}
        </div>
        {err && <p className="text-xs text-alert" role="alert">{err}</p>}
        {cut?.note && mode === 'cutout' && <p className="text-xs text-mod" data-testid="photo-prep-note">{cut.note}</p>}
        {result?.mode === 'opaque' && <p className="text-[11px] text-slate-500">This picture has no transparent background: trimmed to its plain background colour and padded with it (the glow needs a cut-out).</p>}
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" disabled={!orig || !!busy} onClick={() => void removeBg()} data-testid="photo-prep-remove"
            className={`${btn} ${mode === 'cutout' ? 'border-hud/60 bg-hud/10 text-hud2' : 'border-edge text-slate-200 hover:border-hud/60'}`}>
            Remove background
          </button>
          <button type="button" disabled={!orig || !!busy} onClick={() => void formatOnly()} data-testid="photo-prep-format"
            className={`${btn} ${mode === 'format' ? 'border-hud/60 bg-hud/10 text-hud2' : 'border-edge text-slate-200 hover:border-hud/60'}`}>
            Format only (trim + margin)
          </button>
          <label className="flex items-center gap-1 text-xs text-slate-300"><input type="checkbox" checked={look} disabled={!!busy} onChange={(e) => toggleLook(e.target.checked)} data-testid="photo-prep-look" /> built-in glow</label>
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
          <span className="text-[10px] text-slate-500">{ASPECT_PRESETS.find((p) => p.id === aspect.id)?.hint}; product centred, remembered for next time</span>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-edge/60 pt-3">
          <button type="button" onClick={onKeep} disabled={busy?.phase === 'decode'} data-testid="photo-prep-keep" className={`${btn} border-edge text-slate-300 hover:border-hud/60`}>Keep original</button>
          <button type="button" disabled={!result || !!busy} onClick={() => result && onUse({ dataUrl: result.dataUrl, w: result.w, h: result.h }, mode === 'cutout' ? 'cutout' : 'format')} data-testid="photo-prep-use"
            className={`${btn} border-ok/60 bg-ok/10 font-semibold text-ok hover:bg-ok/20`}>{mode === 'format' ? 'Use formatted' : 'Use cut-out'}</button>
        </div>
      </div>
    </div>
  );
}
