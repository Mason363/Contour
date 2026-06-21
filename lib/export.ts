// Export an artboard to any common image format. Everything runs locally.

import type { Artboard } from "./types";
import { renderArtboardCanvas } from "./image";
import { buildVectorSvg } from "./vectorize";

export interface ExportFormat {
  id: string;
  label: string;
  ext: string;
  /** true → format carries an alpha channel; false → flattened onto white. */
  alpha: boolean;
  kind: "raster" | "vector" | "doc";
}

export const EXPORT_FORMATS: ExportFormat[] = [
  { id: "png", label: "PNG", ext: "png", alpha: true, kind: "raster" },
  { id: "webp", label: "WebP", ext: "webp", alpha: true, kind: "raster" },
  { id: "avif", label: "AVIF", ext: "avif", alpha: true, kind: "raster" },
  { id: "tiff", label: "TIFF", ext: "tiff", alpha: true, kind: "raster" },
  { id: "jpeg", label: "JPEG", ext: "jpg", alpha: false, kind: "raster" },
  { id: "bmp", label: "BMP", ext: "bmp", alpha: false, kind: "raster" },
  { id: "svg", label: "SVG (vector)", ext: "svg", alpha: true, kind: "vector" },
  { id: "pdf", label: "PDF", ext: "pdf", alpha: false, kind: "doc" },
];

export const formatById = (id: string) =>
  EXPORT_FORMATS.find((f) => f.id === id) ?? EXPORT_FORMATS[0];

const canvasToBlob = (
  canvas: HTMLCanvasElement,
  mime: string,
  quality?: number,
): Promise<Blob | null> =>
  new Promise((resolve) => canvas.toBlob((b) => resolve(b), mime, quality));

/** Minimal 24-bit BMP encoder (BMP carries no alpha, so the canvas is opaque). */
const encodeBmp = (canvas: HTMLCanvasElement): Blob => {
  const ctx = canvas.getContext("2d")!;
  const { width: w, height: h } = canvas;
  const { data } = ctx.getImageData(0, 0, w, h);
  const rowSize = Math.floor((24 * w + 31) / 32) * 4;
  const pixelArraySize = rowSize * h;
  const fileSize = 54 + pixelArraySize;
  const buf = new ArrayBuffer(fileSize);
  const dv = new DataView(buf);
  // BITMAPFILEHEADER
  dv.setUint16(0, 0x4d42, true);
  dv.setUint32(2, fileSize, true);
  dv.setUint32(10, 54, true);
  // BITMAPINFOHEADER
  dv.setUint32(14, 40, true);
  dv.setInt32(18, w, true);
  dv.setInt32(22, h, true);
  dv.setUint16(26, 1, true);
  dv.setUint16(28, 24, true);
  dv.setUint32(34, pixelArraySize, true);
  dv.setInt32(38, 2835, true);
  dv.setInt32(42, 2835, true);
  let offset = 54;
  for (let y = h - 1; y >= 0; y--) {
    let rowStart = offset;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const a = data[i + 3] / 255;
      // Composite onto white for the alpha-less BMP format.
      const r = Math.round(data[i] * a + 255 * (1 - a));
      const g = Math.round(data[i + 1] * a + 255 * (1 - a));
      const b = Math.round(data[i + 2] * a + 255 * (1 - a));
      dv.setUint8(rowStart++, b);
      dv.setUint8(rowStart++, g);
      dv.setUint8(rowStart++, r);
    }
    offset += rowSize;
  }
  return new Blob([buf], { type: "image/bmp" });
};

const encodeTiff = async (canvas: HTMLCanvasElement): Promise<Blob> => {
  const UTIF = (await import("utif2")).default as any;
  const ctx = canvas.getContext("2d")!;
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const tiff = UTIF.encodeImage(data, canvas.width, canvas.height);
  return new Blob([tiff], { type: "image/tiff" });
};

const exportPdf = async (
  canvas: HTMLCanvasElement,
  name: string,
): Promise<{ blob: Blob; filename: string }> => {
  const { jsPDF } = await import("jspdf");
  const orientation = canvas.width >= canvas.height ? "landscape" : "portrait";
  const pdf = new jsPDF({ orientation, unit: "px", format: [canvas.width, canvas.height] });
  const png = canvas.toDataURL("image/png");
  pdf.addImage(png, "PNG", 0, 0, canvas.width, canvas.height);
  return { blob: pdf.output("blob"), filename: `${name}.pdf` };
};

const baseName = (a: Artboard) => a.name.replace(/\.[^.]+$/, "") || "contour";

/** Maps an export-size choice to a maximum output dimension (undefined = original). */
export const EXPORT_SIZES: { id: string; label: string; maxDim?: number }[] = [
  { id: "original", label: "Original" },
  { id: "large", label: "Large (2048px)", maxDim: 2048 },
  { id: "medium", label: "Medium (1024px)", maxDim: 1024 },
  { id: "small", label: "Small (512px)", maxDim: 512 },
];

const maxDimForSize = (sizeId?: string) =>
  EXPORT_SIZES.find((s) => s.id === sizeId)?.maxDim;

/** Produce a downloadable Blob + filename for one artboard in the given format. */
export const exportArtboard = async (
  a: Artboard,
  formatId: string,
  sizeId?: string,
): Promise<{ blob: Blob; filename: string }> => {
  const fmt = formatById(formatId);
  const name = baseName(a);

  if (fmt.kind === "vector") {
    // SVG is resolution-independent; export size does not apply.
    const svg = a.vectorSvg ?? (await buildVectorSvg(a));
    return {
      blob: new Blob([svg], { type: "image/svg+xml" }),
      filename: `${name}.svg`,
    };
  }

  // Raster + doc formats need a flat canvas. Opaque formats flatten onto white.
  const canvas = await renderArtboardCanvas(a, {
    flattenWhite: !fmt.alpha,
    maxDim: maxDimForSize(sizeId),
  });

  if (fmt.kind === "doc") return exportPdf(canvas, name);

  let blob: Blob | null = null;
  switch (fmt.id) {
    case "png":
      blob = await canvasToBlob(canvas, "image/png");
      break;
    case "webp":
      blob = await canvasToBlob(canvas, "image/webp", 0.95);
      break;
    case "avif":
      blob = await canvasToBlob(canvas, "image/avif", 0.9);
      break;
    case "jpeg":
      blob = await canvasToBlob(canvas, "image/jpeg", 0.95);
      break;
    case "bmp":
      blob = encodeBmp(canvas);
      break;
    case "tiff":
      blob = await encodeTiff(canvas);
      break;
  }
  // Fallback if the browser cannot encode the requested mime (e.g. AVIF).
  if (!blob) blob = await canvasToBlob(canvas, "image/png");
  return { blob: blob!, filename: `${name}.${fmt.ext}` };
};

export const downloadBlob = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

/** Export every artboard into a single zip. */
export const exportAllZip = async (artboards: Artboard[], formatId: string, sizeId?: string) => {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  const used: Record<string, number> = {};
  for (const a of artboards) {
    const { blob, filename } = await exportArtboard(a, formatId, sizeId);
    let fn = filename;
    if (used[fn] !== undefined) {
      used[fn] += 1;
      const dot = filename.lastIndexOf(".");
      fn = `${filename.slice(0, dot)}-${used[fn]}${filename.slice(dot)}`;
    } else {
      used[fn] = 0;
    }
    zip.file(fn, blob);
  }
  const out = await zip.generateAsync({ type: "blob" });
  downloadBlob(out, `contour-export-${formatId}.zip`);
};

/** Copy the active artboard to the clipboard as a PNG image. */
export const copyArtboardToClipboard = async (a: Artboard) => {
  const canvas = await renderArtboardCanvas(a, { flattenWhite: false });
  const blob = await canvasToBlob(canvas, "image/png");
  if (!blob) throw new Error("Could not render image");
  await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
};
