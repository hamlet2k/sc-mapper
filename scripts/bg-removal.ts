// Background removal, end to end in Node: the same U^2-Net-p model file and onnxruntime-web build the browser uses
// (src/lib/bgModel.ts), the same pre/post-processing (src/lib/photoFormat.ts), on a fixture product photo with a known mask.
//   npx tsx scripts/bg-removal.ts        (also run by npm run test:unit)
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as ort from 'onnxruntime-web';
import { MODEL_SIDE, alphaBox, applyMask, floodFillMask, formatPhoto, formatSize, modelInput, normalizeMask, resizeMask, type Px } from '../src/lib/photoFormat';
import { readPng } from './png';

const root = new URL('..', import.meta.url).pathname;
const photo = readPng(`${root}scripts/fixtures/photos/stick-on-white.png`);
const truth = readPng(`${root}scripts/fixtures/photos/stick-on-white-mask.png`);
const iou = (px: Px) => {
  let i = 0, u = 0;
  for (let p = 0; p < px.width * px.height; p++) { const a = px.data[p * 4 + 3] > 127, b = truth.data[p * 4] > 127; if (a && b) i++; if (a || b) u++; }
  return i / u;
};
const at = (px: Px, x: number, y: number) => px.data[(Math.round(y * (px.height - 1)) * px.width + Math.round(x * (px.width - 1))) * 4 + 3];

const t0 = Date.now();
ort.env.wasm.numThreads = 1;
const session = await ort.InferenceSession.create(readFileSync(`${root}public/models/u2netp.onnx`), { executionProviders: ['wasm'] });
const out = await session.run({ [session.inputNames[0]]: new ort.Tensor('float32', modelInput(photo), [1, 3, MODEL_SIDE, MODEL_SIDE]) });
const mask = normalizeMask(out[session.outputNames[0]].data as Float32Array);
const cut = applyMask(photo, resizeMask(mask, MODEL_SIDE, MODEL_SIDE, photo.width, photo.height), { crisp: true });
const modelIou = iou(cut);
const flood = applyMask(photo, floodFillMask(photo), { crisp: false });
const floodIou = iou(flood);
console.log(`[bg] model IoU ${modelIou.toFixed(3)}, flood-fill IoU ${floodIou.toFixed(3)} (${Date.now() - t0} ms)`);
assert.ok(modelIou > 0.9, `model cut-out matches the product (IoU ${modelIou})`);
assert.ok(floodIou > 0.85, `flood fill matches the product (IoU ${floodIou})`);
for (const [x, y] of [[0, 0], [1, 0], [0, 1], [1, 1], [0.03, 0.5], [0.97, 0.5]]) assert.equal(at(cut, x, y), 0, `background transparent at ${x},${y}`);
assert.ok(at(cut, 0.45, 0.85) > 240, 'the base is opaque');
// then the built-in format: trimmed to the product, 5 % margin, glow baked in around it
const box = alphaBox(cut)!;
const f = formatPhoto(cut, { look: true });
const want = formatSize(box.w, box.h);
assert.deepEqual([f.px.width, f.px.height, f.pad, f.mode], [want.W, want.H, want.pad, 'alpha']);
assert.ok(Math.abs(f.k - Math.min(1.7, 900 / Math.max(box.w, box.h))) < 1e-9, 'small product upscaled like the built-ins (to 900 px, at most 1.7x)');
assert.ok(at(f.px, 0.5, 0.5) > 200 && at(f.px, 0.5, 0.02) < 60, 'product opaque, faint glow in the margin');
console.log(`[bg] ok: formatted ${f.px.width}x${f.px.height} (product ${want.w}x${want.h}, margin ${want.pad} px)`);
