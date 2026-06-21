// High-quality, in-browser background removal with BiRefNet (state of the art),
// via @huggingface/transformers. Larger one-time model download and slower than
// ISNet, but materially better edges. Still 100% local — no image leaves the device.

import { loadImage } from "./image";
import type { ProgressCb } from "./bg";

// Cache the loaded model/processor across calls so the big download happens once.
let _model: any = null;
let _processor: any = null;
let _loadedDevice: string | null = null;

const MODEL_ID = "onnx-community/BiRefNet-ONNX";

export const removeBackgroundBiRefNet = async (
  src: string,
  onProgress?: ProgressCb,
  device?: "cpu" | "gpu",
): Promise<string> => {
  const { AutoModel, AutoProcessor, RawImage } = await import("@huggingface/transformers");
  const useDevice = device === "gpu" ? "webgpu" : "wasm";

  if (!_model || _loadedDevice !== useDevice) {
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
    _model = await AutoModel.from_pretrained(MODEL_ID, {
      dtype: "fp32",
      device: useDevice as any,
      progress_callback,
    });
    _processor = await AutoProcessor.from_pretrained(MODEL_ID, { progress_callback });
    _loadedDevice = useDevice;
  }

  // Download finished — inference can take a while, so park the bar at 100 ("Processing…").
  onProgress?.(100);

  const image = await RawImage.fromURL(src);
  const { pixel_values } = await _processor(image);
  const { output_image } = await _model({ input_image: pixel_values });
  const mask = await RawImage.fromTensor(
    output_image[0].sigmoid().mul(255).to("uint8"),
  ).resize(image.width, image.height);

  // Composite the predicted alpha matte onto the original image.
  const orig = await loadImage(src);
  const canvas = document.createElement("canvas");
  canvas.width = orig.naturalWidth;
  canvas.height = orig.naturalHeight;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(orig, 0, 0);
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = imgData.data;
  const md = mask.data as Uint8Array;
  const ch = (mask as any).channels || 1;
  const count = canvas.width * canvas.height;
  for (let p = 0; p < count; p++) {
    px[p * 4 + 3] = md[p * ch];
  }
  ctx.putImageData(imgData, 0, 0);
  return canvas.toDataURL("image/png");
};
