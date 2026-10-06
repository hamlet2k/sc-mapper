/* In-browser background removal: U^2-Net-p (Apache-2.0, 4.6 MB, public/models/u2netp.onnx) on onnxruntime-web (MIT, WASM
 * backend, 14 MB .wasm emitted by Vite into dist/assets). Lazy: this module (and onnxruntime) is only imported when the user
 * clicks "Remove background"; both downloads are same-origin static files (work on Vercel static hosting, no CDN, no server). */
import * as ort from 'onnxruntime-web/wasm';
import wasmUrl from 'onnxruntime-web/ort-wasm-simd-threaded.wasm?url';
import { MODEL_SIDE, modelInput, normalizeMask, type Px } from './photoFormat';
import { MODEL_BYTES, WASM_BYTES } from './photoInfo';

export type ModelProgress = { phase: 'download'; loaded: number; total: number } | { phase: 'init' } | { phase: 'infer' };
const MODEL_URL = `${import.meta.env.BASE_URL}models/u2netp.onnx`;

async function fetchBytes(url: string, onBytes: (n: number, total: number) => void, guess: number): Promise<ArrayBuffer> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Could not download ${url.split('/').pop()} (HTTP ${r.status})`);
  // a compressed response's content-length is the compressed size, while the reader yields decompressed bytes
  const total = (!r.headers.get('content-encoding') && Number(r.headers.get('content-length'))) || guess;
  if (!r.body) { const b = await r.arrayBuffer(); onBytes(b.byteLength, total); return b; }
  const reader = r.body.getReader(), parts: Uint8Array[] = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parts.push(value); n += value.byteLength; onBytes(n, Math.max(total, n));
  }
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.byteLength; }
  return out.buffer;
}

let session: Promise<ort.InferenceSession> | null = null;
function loadSession(onProgress: (p: ModelProgress) => void): Promise<ort.InferenceSession> {
  return (session ??= (async () => {
    const got = [0, 0], tot = [WASM_BYTES, MODEL_BYTES];
    const report = (i: number) => (n: number, t: number) => { got[i] = n; tot[i] = t; onProgress({ phase: 'download', loaded: got[0] + got[1], total: tot[0] + tot[1] }); };
    const [wasm, model] = await Promise.all([fetchBytes(wasmUrl, report(0), WASM_BYTES), fetchBytes(MODEL_URL, report(1), MODEL_BYTES)]);
    onProgress({ phase: 'init' });
    ort.env.wasm.wasmBinary = wasm;
    ort.env.wasm.numThreads = 1; // no SharedArrayBuffer without cross-origin isolation headers
    ort.env.wasm.proxy = false;
    return ort.InferenceSession.create(new Uint8Array(model), { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
  })().catch((e) => { session = null; throw e; }));
}

/** foreground probability (0..1) at MODEL_SIDE x MODEL_SIDE for the picture */
export async function modelMask(px: Px, onProgress: (p: ModelProgress) => void): Promise<{ mask: Float32Array; side: number }> {
  const s = await loadSession(onProgress);
  onProgress({ phase: 'infer' });
  await new Promise((r) => setTimeout(r, 0));
  const input = new ort.Tensor('float32', modelInput(px), [1, 3, MODEL_SIDE, MODEL_SIDE]);
  const out = await s.run({ [s.inputNames[0]]: input });
  const d0 = out[s.outputNames[0]].data as Float32Array;
  return { mask: normalizeMask(d0), side: MODEL_SIDE };
}
