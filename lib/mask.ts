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
 * Composites the original image, base mask, user paint mask, and object selection mask
 * into a single cutout image.
 */
export const applyBgRemovalMasks = async (
  originalSrc: string,
  baseMaskSrc: string | null,
  paintMaskSrc: string | null,
  objectMaskSrc: string | null,
  strength: number, // 0..100
  objectMode: "keep" | "remove" | null
): Promise<string> => {
  const originalImg = await loadImage(originalSrc);
  const baseMaskImg = baseMaskSrc ? await loadImage(baseMaskSrc) : null;
  const paintMaskImg = paintMaskSrc ? await loadImage(paintMaskSrc) : null;
  const objectMaskImg = objectMaskSrc ? await loadImage(objectMaskSrc) : null;

  const canvas = document.createElement("canvas");
  canvas.width = originalImg.naturalWidth;
  canvas.height = originalImg.naturalHeight;
  const ctx = canvas.getContext("2d")!;

  ctx.drawImage(originalImg, 0, 0);
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = imgData.data;

  // Prepare mask canvas readers
  let baseData: Uint8ClampedArray | null = null;
  if (baseMaskImg) {
    const c = document.createElement("canvas");
    c.width = canvas.width;
    c.height = canvas.height;
    const cx = c.getContext("2d")!;
    cx.drawImage(baseMaskImg, 0, 0);
    baseData = cx.getImageData(0, 0, c.width, c.height).data;
  }

  let paintData: Uint8ClampedArray | null = null;
  if (paintMaskImg) {
    const c = document.createElement("canvas");
    c.width = canvas.width;
    c.height = canvas.height;
    const cx = c.getContext("2d")!;
    cx.drawImage(paintMaskImg, 0, 0);
    paintData = cx.getImageData(0, 0, c.width, c.height).data;
  }

  let objectData: Uint8ClampedArray | null = null;
  if (objectMaskImg) {
    const c = document.createElement("canvas");
    c.width = canvas.width;
    c.height = canvas.height;
    const cx = c.getContext("2d")!;
    cx.drawImage(objectMaskImg, 0, 0);
    objectData = cx.getImageData(0, 0, c.width, c.height).data;
  }

  // Threshold mapping (0..100) -> (0..255)
  // Strength 50 is default (threshold = 128)
  const threshold = (strength / 100) * 255;

  for (let i = 0; i < pixels.length; i += 4) {
    let alpha = 255;

    // A. Apply base mask if present
    if (baseData) {
      const baseAlpha = baseData[i + 3];
      const baseVal = baseData[i]; // red channel of grayscale
      const maskVal = baseAlpha > 0 ? baseVal : 0;
      
      if (maskVal < threshold) {
        alpha = 0;
      } else {
        alpha = maskVal;
      }
    }

    // B. Apply object selection if present
    if (objectData && objectMode) {
      const objectAlpha = objectData[i + 3];
      if (objectMode === "keep") {
        if (objectAlpha <= 10) {
          alpha = 0;
        }
      } else if (objectMode === "remove") {
        if (objectAlpha > 10) {
          alpha = 0;
        }
      }
    }

    // C. Apply user paint override (include/remove)
    if (paintData) {
      const paintAlpha = paintData[i + 3];
      if (paintAlpha > 0) {
        const removeVal = paintData[i];      // red channel
        const includeVal = paintData[i + 1];  // green channel
        
        if (removeVal > 128) {
          alpha = 0;
        } else if (includeVal > 128) {
          alpha = 255;
        }
      }
    }

    // Blend alpha channel
    pixels[i + 3] = Math.round(pixels[i + 3] * (alpha / 255));
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas.toDataURL("image/png");
};
