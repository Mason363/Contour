// Local, private background removal via @imgly/background-removal (ONNX + WASM).
// The neural inference runs entirely in the browser; only the model weights are
// fetched once from a CDN. No image data ever leaves the device.

import { dataUrlToBlob, blobToDataUrl } from "./image";

export type ProgressCb = (pct: number) => void;

export const removeImageBackground = async (
  src: string,
  onProgress?: ProgressCb,
): Promise<string> => {
  const { removeBackground } = await import("@imgly/background-removal");

  const downloaded: Record<string, number> = {};
  const expected: Record<string, number> = {
    "ort-wasm-simd-threaded.wasm": 2.5 * 1024 * 1024,
    "isnet.onnx": 44 * 1024 * 1024,
  };

  const config: any = {
    publicPath: "https://staticimgly.com/@imgly/background-removal-data/1.7.0/dist/",
    model: "isnet", // high-quality full model for clean edges
    progress: (key: string, current: number, total: number) => {
      const fileKey = key.split("/").pop() || key;
      downloaded[fileKey] = current;
      if (total > 0) expected[fileKey] = total;
      const totalDownloaded = Object.values(downloaded).reduce((a, b) => a + b, 0);
      const totalExpected =
        (expected["ort-wasm-simd-threaded.wasm"] || 0) + (expected["isnet.onnx"] || 0);
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
