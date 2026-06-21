// Image → vector tracing, entirely in the browser.
//
// Mirrors Pathstitch's trace pipeline (threshold + silhouette modes, with
// tolerance, corner smoothness and path optimization). We binarize the cropped
// image ourselves — exactly like Pathstitch did before handing the bitmap to
// potrace — then trace the black regions into SVG paths with ImageTracer.js.

import type { Artboard, TraceSettings } from "./types";
import { loadImage } from "./image";
import { activeSrc } from "./types";

// Largest dimension fed to the tracer. Output is resolution-independent, so a
// cap keeps tracing fast; commits trace at higher fidelity than live previews.
const MAX_TRACE_DIM_COMMIT = 2000;
const MAX_TRACE_DIM_PREVIEW = 900;

let tracerPromise: Promise<any> | null = null;
const getTracer = async () => {
  if (!tracerPromise) {
    tracerPromise = import("imagetracerjs").then((m: any) => m.default ?? m);
  }
  return tracerPromise;
};

/** Map the friendly 0..100 trace settings onto ImageTracer's parameters. */
const tracerOptions = (t: TraceSettings) => {
  const common = {
    mincolorratio: 0,
    // Detail: higher detail keeps smaller specks (lower pathomit).
    pathomit: Math.round((100 - t.tolerance) / 100 * 12),
    // Path optimization → straight-line error tolerance (simplifies polylines).
    ltres: 0.01 + (t.pathOptimization / 100) * 4,
    // Corner smoothness → spline (quadratic) error tolerance (rounds corners).
    qtres: 0.01 + (t.cornerSmoothness / 100) * 4,
    rightangleenhance: t.cornerSmoothness < 25,
    linefilter: t.cornerSmoothness > 50,
    roundcoords: 2,
    strokewidth: 0,
    scale: 1,
    viewbox: true,
    desc: false,
  };

  if (t.colorGrouping) {
    return {
      ...common,
      numberofcolors: t.colorGroups || 8,
      colorsampling: 2,
    };
  }

  return {
    ...common,
    numberofcolors: 2,
    colorsampling: 0,
    pal: [
      { r: 0, g: 0, b: 0, a: 255 },
      { r: 255, g: 255, b: 255, a: 255 },
    ],
  };
};

/**
 * Build the binary (black-on-white) ImageData fed to the tracer for one
 * artboard. Silhouette mode keys off alpha; otherwise the image is composited
 * on white, converted to luminance and thresholded.
 */
const buildTraceBitmap = async (a: Artboard, maxDim: number): Promise<ImageData> => {
  const img = await loadImage(activeSrc(a));
  const cw = Math.max(1, Math.round(a.crop.w));
  const ch = Math.max(1, Math.round(a.crop.h));
  const scale = Math.min(1, maxDim / Math.max(cw, ch));
  const w = Math.max(1, Math.round(cw * scale));
  const h = Math.max(1, Math.round(ch * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(img, a.crop.x, a.crop.y, cw, ch, 0, 0, w, h);
  const src = ctx.getImageData(0, 0, w, h);
  const data = src.data;
  const t = a.trace;

  if (t.colorGrouping) {
    // Keep colors, but composite transparent pixels on a white background with alpha=255.
    for (let i = 0; i < data.length; i += 4) {
      const alpha = data[i + 3];
      const af = alpha / 255;
      data[i] = Math.round(data[i] * af + 255 * (1 - af));
      data[i + 1] = Math.round(data[i + 1] * af + 255 * (1 - af));
      data[i + 2] = Math.round(data[i + 2] * af + 255 * (1 - af));
      data[i + 3] = 255;
    }
    return src;
  }

  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3];
    let black: boolean;
    if (t.silhouette) {
      black = alpha > 10;
    } else {
      const af = alpha / 255;
      const r = data[i] * af + 255 * (1 - af);
      const g = data[i + 1] * af + 255 * (1 - af);
      const b = data[i + 2] * af + 255 * (1 - af);
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      black = lum < t.threshold;
    }
    const v = black ? 0 : 255;
    data[i] = data[i + 1] = data[i + 2] = v;
    data[i + 3] = 255;
  }
  return src;
};

/** Keep only the dark (foreground) paths; drop the white background layer. */
const keepForegroundPaths = (svg: string, isColor: boolean): string =>
  svg.replace(/<path\b[^>]*\/>/g, (tag) => {
    const fill = /fill="rgb\((\d+),(\d+),(\d+)\)"/.exec(tag);
    if (fill) {
      const r = +fill[1];
      const g = +fill[2];
      const b = +fill[3];
      if (isColor) {
        // Discard background if it is near-white (background of composite)
        if (r > 248 && g > 248 && b > 248) return "";
      } else {
        const lum = (r + g + b) / 3;
        if (lum > 200) return ""; // background → discard
      }
    }
    return tag;
  });

/** Normalized trace SVG for an artboard (only foreground paths). */
export const traceToSvg = async (a: Artboard, preview = false): Promise<string> => {
  let board = a;
  // Optional AI background removal pass before tracing (commit only).
  if (a.trace.removeBackgroundFirst && !a.processedSrc) {
    const { removeImageBackground } = await import("./bg");
    const processed = await removeImageBackground(a.originalSrc);
    board = { ...a, processedSrc: processed };
  }
  const maxDim = preview ? MAX_TRACE_DIM_PREVIEW : MAX_TRACE_DIM_COMMIT;
  const bitmap = await buildTraceBitmap(board, maxDim);
  const tracer = await getTracer();
  const raw: string = tracer.imagedataToSVG(bitmap, tracerOptions(a.trace));
  return keepForegroundPaths(raw, a.trace.colorGrouping);
};

export type SvgMode = "preview" | "display" | "export";

/**
 * Re-style a trace SVG for a given context:
 *  - "preview"  cyan, fill-less outlines stretched to overlay the artboard;
 *  - "display"  solid black fills stretched to fill the artboard's vector view;
 *  - "export"   solid black fills at the SVG's native dimensions.
 */
export const styleSvg = (svg: string, mode: SvgMode, isColor = false, fill = "#000"): string => {
  const style =
    mode === "preview"
      ? "path{fill:none !important;stroke:#22d3ee;stroke-width:1.25px;vector-effect:non-scaling-stroke}"
      : isColor
        ? "path{stroke:none}"
        : `path{fill:${fill} !important;stroke:none}`;
  const stretch = mode !== "export";
  return svg.replace(/<svg([^>]*)>/, (_m, attrs) => {
    let a = attrs;
    if (stretch) {
      a = a.replace(/\swidth="[^"]*"/, "").replace(/\sheight="[^"]*"/, "");
      a += ' width="100%" height="100%" preserveAspectRatio="none"';
    }
    return `<svg${a}><style>${style}</style>`;
  });
};

/** Committed/export SVG: solid black fills at native size. */
export const buildVectorSvg = async (a: Artboard): Promise<string> => {
  const svg = a.vectorSvg ?? (await traceToSvg(a));
  return styleSvg(svg, "export", a.trace.colorGrouping);
};

/** Live preview SVG: cyan outlines, stretched to overlay the artboard. */
export const buildPreviewSvg = async (a: Artboard): Promise<string> => {
  const svg = await traceToSvg(a, true);
  return styleSvg(svg, "preview", a.trace.colorGrouping);
};
