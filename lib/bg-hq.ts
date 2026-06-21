// High-quality, in-browser background removal via @huggingface/transformers.
// Uses the `background-removal` pipeline (which wires the processor/model and
// returns the cut-out directly) with a high-quality matting model. Runs on WebGPU
// when available (far more memory + speed) and falls back to WASM. Still 100% local.
//
// Note: full BiRefNet (fp32, ~1GB) reliably OOMs the WASM runtime (std::bad_alloc),
// so we use BEN2 — comparable/again better quality with a lighter footprint.

import { blobToDataUrl } from "./image";
import type { ProgressCb } from "./bg";

const MODEL_ID = "onnx-community/BEN2-ONNX";

let _segmenter: any = null;
let _segDevice: string | null = null;

const hasWebGPU = () =>
  typeof navigator !== "undefined" && !!(navigator as any).gpu;

export const removeBackgroundHQ = async (
  src: string,
  onProgress?: ProgressCb,
  device?: "cpu" | "gpu",
): Promise<string> => {
  const { pipeline } = await import("@huggingface/transformers");
  // Prefer WebGPU whenever it's available (memory + speed); only force WASM if the
  // user explicitly picked CPU and WebGPU isn't there.
  const useDevice = device === "gpu" || hasWebGPU() ? "webgpu" : "wasm";

  if (!_segmenter || _segDevice !== useDevice) {
    const downloaded: Record<string, number> = {};
    const expected: Record<string, number> = {};
    const progress_callback = (p: any) => {
      if (p?.status === "progress" && p.file) {
        downloaded[p.file] = p.loaded || 0;
        if (p.total) expected[p.file] = p.total;
        const d = Object.values(downloaded).reduce((a, b) => a + b, 0);
        const t = Object.values(expected).reduce((a, b) => a + b, 0);
        if (t > 0) onProgress?.(Math.min(99, Math.round((d / t) * 100)));
      }
    };
    _segmenter = await pipeline("background-removal", MODEL_ID, {
      device: useDevice as any,
      progress_callback,
    });
    _segDevice = useDevice;
  }

  // Download done — inference can be slow, so park the bar at 100 ("Processing…").
  onProgress?.(100);

  const output = await _segmenter(src);
  const image = Array.isArray(output) ? output[0] : output;
  const blob = await image.toBlob();
  return blobToDataUrl(blob);
};
