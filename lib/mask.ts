import { loadImage } from "./image";

/**
 * Extracts the alpha channel of a transparent cutout image and returns it
 * as a grayscale PNG data URL.
 */
export const extractAlphaMask = async (cutoutSrc: string): Promise<string> => {
  const img = await loadImage(cutoutSrc);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imgData.data;
  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3];
    data[i] = data[i + 1] = data[i + 2] = alpha; // grayscale
    data[i + 3] = 255; // opaque mask
  }
  ctx.putImageData(imgData, 0, 0);
  return canvas.toDataURL("image/png");
};

/**
 * Separable grayscale morphology (erode = local min, dilate = local max) used to
 * choke/spread the matte edge. Borders clamp so subjects touching the frame are
 * handled correctly.
 */
const morph = (
  src: Uint8ClampedArray,
  w: number,
  h: number,
  radius: number,
  type: "min" | "max",
): Uint8ClampedArray => {
  if (radius <= 0) return src;
  const tmp = new Uint8ClampedArray(src.length);
  const out = new Uint8ClampedArray(src.length);
  // Horizontal pass
  for (let y = 0; y < h; y++) {
    const base = y * w;
    for (let x = 0; x < w; x++) {
      let v = type === "min" ? 255 : 0;
      const lo = Math.max(0, x - radius);
      const hi = Math.min(w - 1, x + radius);
      for (let xx = lo; xx <= hi; xx++) {
        const val = src[base + xx];
        v = type === "min" ? (val < v ? val : v) : (val > v ? val : v);
      }
      tmp[base + x] = v;
    }
  }
  // Vertical pass
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let v = type === "min" ? 255 : 0;
      const lo = Math.max(0, y - radius);
      const hi = Math.min(h - 1, y + radius);
      for (let yy = lo; yy <= hi; yy++) {
        const val = tmp[yy * w + x];
        v = type === "min" ? (val < v ? val : v) : (val > v ? val : v);
      }
      out[y * w + x] = v;
    }
  }
  return out;
};

const readMaskData = (
  img: HTMLImageElement | null,
  w: number,
  h: number,
): Uint8ClampedArray | null => {
  if (!img) return null;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const cx = c.getContext("2d")!;
  cx.drawImage(img, 0, 0, w, h);
  return cx.getImageData(0, 0, w, h).data;
};

/**
 * Composites the original image, the AI base matte, and the user paint mask into a
 * single cutout image.
 *
 * `strength` (0..100) is the removal **sensitivity**: 50 leaves the matte as-is,
 * below 50 chokes (erodes) the edge for a tighter cut, above 50 spreads (dilates)
 * it for a looser cut that keeps more of the subject's fringe.
 *
 * `objectMaskSrc`/`objectMode` are retained for signature compatibility and ignored.
 */
export const applyBgRemovalMasks = async (
  originalSrc: string,
  baseMaskSrc: string | null,
  paintMaskSrc: string | null,
  objectMaskSrc: string | null,
  strength: number, // 0..100
  objectMode: "keep" | "remove" | null
): Promise<string> => {
  void objectMaskSrc;
  void objectMode;
  const originalImg = await loadImage(originalSrc);
  const baseMaskImg = baseMaskSrc ? await loadImage(baseMaskSrc) : null;
  const paintMaskImg = paintMaskSrc ? await loadImage(paintMaskSrc) : null;

  const w = originalImg.naturalWidth;
  const h = originalImg.naturalHeight;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(originalImg, 0, 0);
  const imgData = ctx.getImageData(0, 0, w, h);
  const pixels = imgData.data;

  const baseData = readMaskData(baseMaskImg, w, h);
  const paintData = readMaskData(paintMaskImg, w, h);

  // Build the base matte as a single-channel alpha array.
  const N = w * h;
  let alpha = new Uint8ClampedArray(N);
  if (baseData) {
    for (let p = 0; p < N; p++) {
      const i = p * 4;
      alpha[p] = baseData[i + 3] > 0 ? baseData[i] : 0;
    }
    // Sensitivity: choke (<50) or spread (>50) the matte by a radius that scales
    // with image size so the effect is visible across resolutions.
    if (strength !== 50) {
      const maxR = Math.min(14, Math.max(2, Math.round(Math.min(w, h) * 0.012)));
      const radius = Math.round((Math.abs(strength - 50) / 50) * maxR);
      alpha = new Uint8ClampedArray(morph(alpha, w, h, radius, strength < 50 ? "min" : "max"));
    }
  } else {
    alpha.fill(255);
  }

  for (let p = 0; p < N; p++) {
    const i = p * 4;
    let a = alpha[p];

    // User paint override (highest priority): red = remove, green = restore.
    if (paintData) {
      const paintAlpha = paintData[i + 3];
      if (paintAlpha > 0) {
        if (paintData[i] > 128) a = 0;
        else if (paintData[i + 1] > 128) a = 255;
      }
    }

    pixels[i + 3] = Math.round(pixels[i + 3] * (a / 255));
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas.toDataURL("image/png");
};
