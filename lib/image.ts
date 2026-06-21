// Image decoding, loading, bounding-box detection, compositing and export.

import type { Artboard, CropRect } from "./types";
import { activeSrc } from "./types";

export const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

export const loadImage = (src: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

export const dataUrlToBlob = async (dataUrl: string): Promise<Blob> => {
  if (dataUrl.startsWith("data:")) {
    const [head, body] = dataUrl.split(",");
    const mime = head.match(/:(.*?);/)?.[1] || "image/png";
    const bstr = atob(body);
    let n = bstr.length;
    const u8 = new Uint8Array(n);
    while (n--) u8[n] = bstr.charCodeAt(n);
    return new Blob([u8], { type: mime });
  }
  const res = await fetch(dataUrl);
  return res.blob();
};

/** Heuristic: does this file look like an image we can handle? */
export const isSupportedImageFile = (file: File): boolean => {
  if (file.type.startsWith("image/")) return true;
  const name = file.name.toLowerCase();
  return /\.(jpe?g|png|gif|webp|avif|bmp|svg|heic|heif|tiff?|ico)$/.test(name);
};

/**
 * Decode any image file (including HEIC/HEIF/TIFF which browsers cannot render
 * natively) into a PNG/JPEG data URL that an <img> can load.
 */
export const decodeImageFile = async (file: File): Promise<string> => {
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();

  const isHeic =
    type === "image/heic" ||
    type === "image/heif" ||
    name.endsWith(".heic") ||
    name.endsWith(".heif");

  const isTiff =
    type === "image/tiff" ||
    type === "image/tif" ||
    name.endsWith(".tif") ||
    name.endsWith(".tiff");

  if (isHeic) {
    const heic2any = (await import("heic2any")).default as (opts: {
      blob: Blob;
      toType?: string;
      quality?: number;
    }) => Promise<Blob | Blob[]>;
    const converted = await heic2any({ blob: file, toType: "image/png" });
    const blob = Array.isArray(converted) ? converted[0] : converted;
    return blobToDataUrl(blob);
  }

  if (isTiff) {
    const UTIF = (await import("utif2")).default as any;
    const buffer = await file.arrayBuffer();
    const ifds = UTIF.decode(buffer);
    UTIF.decodeImage(buffer, ifds[0]);
    const rgba = UTIF.toRGBA8(ifds[0]);
    const canvas = document.createElement("canvas");
    canvas.width = ifds[0].width;
    canvas.height = ifds[0].height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unavailable for TIFF decode");
    const imageData = ctx.createImageData(canvas.width, canvas.height);
    imageData.data.set(rgba);
    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL("image/png");
  }

  // JPEG, PNG, WebP, AVIF, GIF, BMP, SVG, etc. — handled natively.
  return blobToDataUrl(file);
};

/**
 * Smallest bounding rectangle (in source px) that contains all non-transparent
 * pixels. Returns null if the image is fully transparent.
 */
export const alphaBounds = (
  img: HTMLImageElement,
  alphaCutoff = 10,
): CropRect | null => {
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0);
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const w = canvas.width;
  const h = canvas.height;
  let minX = w, maxX = -1, minY = h, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > alphaCutoff) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX || maxY < minY) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
};

/**
 * Auto-crop to content. For images with transparency this uses the alpha
 * bounding box; for opaque images it trims a uniform border colour (sampled
 * from the corners), which handles white/solid backdrops.
 */
export const autoContentBounds = (img: HTMLImageElement): CropRect | null => {
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0);
  const w = canvas.width;
  const h = canvas.height;
  const { data } = ctx.getImageData(0, 0, w, h);

  // If there is meaningful transparency, prefer alpha bounds.
  let transparentPixels = 0;
  for (let i = 3; i < data.length; i += 4) if (data[i] < 250) transparentPixels++;
  if (transparentPixels > w * h * 0.005) {
    return alphaBounds(img);
  }

  // Otherwise trim a uniform border colour sampled from the top-left corner.
  const bg = [data[0], data[1], data[2]];
  const tol = 18;
  const matchesBg = (x: number, y: number) => {
    const i = (y * w + x) * 4;
    return (
      Math.abs(data[i] - bg[0]) <= tol &&
      Math.abs(data[i + 1] - bg[1]) <= tol &&
      Math.abs(data[i + 2] - bg[2]) <= tol
    );
  };
  let minX = w, maxX = -1, minY = h, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!matchesBg(x, y)) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX || maxY < minY) return null;
  return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
};

/**
 * Render an artboard's raster output into a fresh canvas at native crop
 * resolution. Layers, bottom-to-top: imported background (clipped), then the
 * (possibly bg-removed) image. Optionally flattens onto an opaque white sheet.
 */
export const renderArtboardCanvas = async (
  a: Artboard,
  opts: { flattenWhite?: boolean } = {},
): Promise<HTMLCanvasElement> => {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(a.crop.w));
  canvas.height = Math.max(1, Math.round(a.crop.h));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D unavailable");

  if (opts.flattenWhite && !a.background) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // Imported background, framed within the crop region.
  if (a.background) {
    const bgImg = await loadImage(a.background.src);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, canvas.width, canvas.height);
    ctx.clip();
    ctx.drawImage(
      bgImg,
      a.background.offsetX,
      a.background.offsetY,
      a.background.naturalWidth * a.background.scale,
      a.background.naturalHeight * a.background.scale,
    );
    ctx.restore();
  }

  // The image itself, translated so the crop origin sits at (0,0).
  const img = await loadImage(activeSrc(a));
  ctx.drawImage(img, -a.crop.x, -a.crop.y);

  return canvas;
};
