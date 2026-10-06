/** download sizes of the background-removal model (see bgModel.ts): onnxruntime-web 1.30 .wasm + U^2-Net-p, uncompressed */
export const WASM_BYTES = 14_239_897;
export const MODEL_BYTES = 4_574_861;
export const MODEL_DOWNLOAD_MB = Math.round((WASM_BYTES + MODEL_BYTES) / 1e6);
