// Core data model for Contour.

export interface TraceSettings {
  /** Trace only the silhouette of non-transparent pixels (ignores colour/threshold). */
  silhouette: boolean;
  /** Run AI background removal before tracing. */
  removeBackgroundFirst: boolean;
  /** Luminance cutoff 0..255 — pixels darker than this become path fill. */
  threshold: number;
  /** Detail 1..100 — higher keeps finer specks (maps to potrace turdsize inversely). */
  tolerance: number;
  /** Corner smoothness 0..100 — higher rounds corners (maps to alphamax). */
  cornerSmoothness: number;
  /** Path optimization 0..100 — higher simplifies curves (maps to opttolerance). */
  pathOptimization: number;
  /** Group similar colors together. */
  colorGrouping: boolean;
  /** Number of color groups (2 to 16). */
  colorGroups: number;
}

export interface BackgroundLayer {
  /** Imported background image as a data URL. */
  src: string;
  naturalWidth: number;
  naturalHeight: number;
  /** Uniform scale applied to the background image. */
  scale: number;
  /** Offset of the background's top-left within the crop region (crop-pixel space). */
  offsetX: number;
  offsetY: number;
}

export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** What the canvas currently shows for an artboard. */
export type ViewMode = "image" | "vector";

export interface Artboard {
  id: string;
  name: string;

  /** Decoded, browser-renderable source image (PNG/JPEG data URL). */
  originalSrc: string;
  width: number; // natural px of original
  height: number;
  mimeType: string;

  /** Background-removed transparent PNG (data URL), if computed. */
  processedSrc: string | null;
  bgRemoved: boolean;

  /** Crop rectangle in ORIGINAL pixel coordinates. The artboard size = crop.w x crop.h. */
  crop: CropRect;

  /** Optional imported background, clipped to the crop region. */
  background: BackgroundLayer | null;

  /** Vectorization settings. */
  trace: TraceSettings;

  /** Committed vector result as an SVG string (paths in crop-pixel space). */
  vectorSvg: string | null;

  /** Current display layer. */
  view: ViewMode;

  /** Whether the artboard rendering is visible on the canvas. */
  visible: boolean;

  /** Parent artboard ID if this is a trace. */
  parentId?: string;

  /** The raw AI background removal confidence mask (alpha) as a PNG data URL. */
  baseMaskSrc: string | null;

  /** Magic-brush edits from user painting (green = restore, red = remove) as a PNG data URL. */
  paintMaskSrc: string | null;

  /** Removal sensitivity, 0 to 100 (50 = neutral; lower chokes, higher spreads). */
  bgRemovalStrength: number;

  /** Invert the cut-out: keep the background and drop the subject. */
  invert: boolean;

  /** Background removal model size/version. */
  bgRemovalModel: "isnet" | "isnet_fp16" | "isnet_quint8" | "best";

  /** Background removal execution hardware. */
  bgRemovalDevice: "cpu" | "gpu";

  /** Whether background removal runs in a Web Worker thread. */
  bgRemovalWorker: boolean;

  /** Background effect: blur the original photo behind the cut-out subject. */
  blurBackground: boolean;
  /** Blur radius, 0..100 (mapped to px). */
  blurAmount: number;
  /** Background effect: drop a shadow behind the cut-out subject. */
  shadow: boolean;
  /** Shadow opacity, 0..100. */
  shadowOpacity: number;
}

export const defaultTrace = (): TraceSettings => ({
  silhouette: false,
  removeBackgroundFirst: false,
  threshold: 128,
  tolerance: 50,
  cornerSmoothness: 50,
  pathOptimization: 50,
  colorGrouping: false,
  colorGroups: 8,
});

/** The image source actually displayed/processed (bg-removed if available). */
export const activeSrc = (a: Artboard): string => a.processedSrc ?? a.originalSrc;
