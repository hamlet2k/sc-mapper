import { useEffect, useRef, useState } from 'react';
import { MODEL_DOWNLOAD_MB } from '../lib/photoInfo';
import { decodeImage, encodePx, formatForTemplate, removeBackground, type BgEngine, type PrepProgress } from '../lib/photoPrep';
import type { Px } from '../lib/photoFormat';
import { Ico } from './icons';

type Busy = PrepProgress | { phase: 'decode' } | { phase: 'format' };
interface Result { dataUrl: string; w: number; h: number; mode: 'alpha' | 'opaque'; pad: number }
const PREVIEW_BG = 'radial-gradient(ellipse 60% 55% at 50% 48%, rgba(79,216,255,.09), rgba(79,216,255,.025) 55%, rgba(0,0,0,0) 75%), linear-gradient(180deg, #070d16, #04070c)';
const tick = () => new Promise((r) => setTimeout(r, 0));

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

/** after an upload: optionally remove the background (in-browser model) and/or format the picture like the built-in photos,
 * with a before / after preview. "Keep original" stores the picture as uploaded (the previous behaviour). */
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

  const format = async (base: Px, withLook: boolean) => {
    const id = ++run.current;
    setBusy({ phase: 'format' }); await tick();
    try {
      const f = formatForTemplate(base, withLook);
      const enc = encodePx(f.px);
      if (id === run.current) setResult({ ...enc, mode: f.mode, pad: f.pad });
    } catch (e) { setErr((e as Error).message); }
    if (id === run.current) setBusy(null);
  };
  const removeBg = async () => {
    if (!orig) return;
    setErr(null); setResult(null); setMode('cutout');
    try {
      const forced = (window as { __SC_TEST_BG_ENGINE?: BgEngine }).__SC_TEST_BG_ENGINE;
      const c = cut ?? await removeBackground(orig, setBusy, forced ?? 'model');
      setCut(c);
      await format(c.px, look);
    } catch (e) { setErr((e as Error).message); setBusy(null); }
  };
  const formatOnly = async () => { if (!orig) return; setErr(null); setResult(null); setMode('format'); await format(orig, look); };
  const toggleLook = (v: boolean) => { setLook(v); const base = mode === 'cutout' ? cut?.px : mode === 'format' ? orig : null; if (base) void format(base, v); };

  const pct = busy?.phase === 'download' ? Math.round((100 * busy.loaded) / Math.max(1, busy.total)) : undefined;
  const btn = 'rounded border px-2.5 py-1 text-xs disabled:opacity-40';
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4" data-testid="photo-prep" role="dialog" aria-modal="true" aria-label="Prepare the picture"
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }} onDrop={(e) => { e.preventDefault(); e.stopPropagation(); }}>
      <div className="hud-panel flex max-h-full w-full max-w-5xl flex-col gap-3 overflow-auto p-4" style={{ background: 'rgb(8 14 24 / 0.98)' }}>
        <div className="flex items-center gap-2">
          <h3 className="font-display text-sm font-bold uppercase tracking-[0.2em] text-mod"><Ico name="image" /> Prepare the picture</h3>
          <span className="truncate text-xs text-slate-400">for {target} · {file.name}</span>
          <button type="button" onClick={onCancel} aria-label="Cancel" data-testid="photo-prep-cancel" className="ml-auto px-1 text-slate-400 hover:text-slate-100"><Ico name="close" /></button>
        </div>
        <div className="grid min-h-0 grid-cols-1 gap-3 md:grid-cols-2">
          {[['Original', origUrl, 'photo-prep-before'], [mode === 'cutout' ? 'Cut-out' : mode === 'format' ? 'Formatted' : 'Result', result?.dataUrl, 'photo-prep-after']].map(([title, src, tid]) => (
            <figure key={tid} className="flex min-w-0 flex-col gap-1">
              <figcaption className="text-[11px] uppercase tracking-[0.2em] text-slate-500">{title}
                {tid === 'photo-prep-before' && size0 && <span className="ml-2 normal-case tracking-normal">{size0[0]}×{size0[1]}</span>}
                {tid === 'photo-prep-after' && result && <span className="ml-2 normal-case tracking-normal">{result.w}×{result.h}, {result.pad} px margin</span>}
              </figcaption>
              <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden rounded border border-edge/70" style={{ backgroundImage: PREVIEW_BG }}>
                {src ? <img src={src} alt={title} data-testid={tid} draggable={false}
                  {...(tid === 'photo-prep-after' && result ? { 'data-w': result.w, 'data-h': result.h, 'data-mode': result.mode, 'data-engine': mode === 'cutout' ? cut?.engine : 'none' } : {})}
                  className="max-h-full max-w-full object-contain" />
                  : <span className="px-6 text-center text-xs text-slate-500">{busy ? '' : 'Remove the background, or just format the picture (trim + margin) like the built-in photos.'}</span>}
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
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-edge/60 pt-3">
          <button type="button" onClick={onKeep} disabled={busy?.phase === 'decode'} data-testid="photo-prep-keep" className={`${btn} border-edge text-slate-300 hover:border-hud/60`}>Keep original</button>
          <button type="button" disabled={!result || !!busy} onClick={() => result && onUse({ dataUrl: result.dataUrl, w: result.w, h: result.h }, mode === 'cutout' ? 'cutout' : 'format')} data-testid="photo-prep-use"
            className={`${btn} border-ok/60 bg-ok/10 font-semibold text-ok hover:bg-ok/20`}>{mode === 'format' ? 'Use formatted' : 'Use cut-out'}</button>
        </div>
      </div>
    </div>
  );
}
