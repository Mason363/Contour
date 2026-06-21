// Local, private background removal via @imgly/background-removal (ONNX + WASM).
// The neural inference runs entirely in the browser; only the model weights are
// fetched once from a CDN. No image data ever leaves the device.

import { dataUrlToBlob, blobToDataUrl } from "./image";

export type ProgressCb = (pct: number) => void;

export interface BgRemovalOptions {
  model?: "isnet" | "isnet_fp16" | "isnet_quint8";
  device?: "cpu" | "gpu";
  proxyToWorker?: boolean;
}

export const removeImageBackground = async (
  src: string,
  onProgress?: ProgressCb,
  options?: BgRemovalOptions,
): Promise<string> => {
  const { removeBackground } = await import("@imgly/background-removal");

  const modelType = options?.model || "isnet";
  const deviceType = options?.device || "cpu";
  const proxyWorker = options?.proxyToWorker !== undefined ? options.proxyToWorker : true;

  const modelFileName = modelType === "isnet" ? "isnet.onnx" : `${modelType}.onnx`;
  const expectedSizes: Record<string, number> = {
    "ort-wasm-simd-threaded.wasm": 2.5 * 1024 * 1024,
    "isnet.onnx": 44 * 1024 * 1024,
    "isnet_fp16.onnx": 22 * 1024 * 1024,
    "isnet_quint8.onnx": 11 * 1024 * 1024,
  };

  const downloaded: Record<string, number> = {};
  const expected: Record<string, number> = {
    "ort-wasm-simd-threaded.wasm": expectedSizes["ort-wasm-simd-threaded.wasm"],
    [modelFileName]: expectedSizes[modelFileName] || 11 * 1024 * 1024,
  };

  const config: any = {
    publicPath: "https://staticimgly.com/@imgly/background-removal-data/1.7.0/dist/",
    model: modelType,
    device: deviceType,
    proxyToWorker: proxyWorker,
    progress: (key: string, current: number, total: number) => {
      const fileKey = key.split("/").pop() || key;
      downloaded[fileKey] = current;
      if (total > 0) expected[fileKey] = total;
      const totalDownloaded = Object.values(downloaded).reduce((a, b) => a + b, 0);
      const totalExpected =
        (expected["ort-wasm-simd-threaded.wasm"] || 0) + (expected[modelFileName] || 0);
      const pct = totalExpected
        ? Math.min(100, Math.round((totalDownloaded / totalExpected) * 100))
        : 0;
      onProgress?.(isNaN(pct) ? 0 : pct);
    },
  };

  const inputBlob = await dataUrlToBlob(src);
  const outBlob = await removeBackground(inputBlob, config);
  return blobToDataUrl(outBlob);
};
