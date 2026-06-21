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
 * "Magic" expansion of a brush stroke into the whole object the user is pointing
 * at. Runs a colour-similarity region grow (magic-wand / flood fill) seeded by the
 * stroke: it spreads across smoothly-coloured neighbours and stops at strong edges,
 * bounded to colours close to the seed's mean so it can't flood the whole frame.
 *
 * Returns a paint mask (red = remove, green = restore) at the original resolution.
 * Runs on a downscaled copy for speed, then upsamples the result.
 */
export const magicExpandSelection = async (
  originalSrc: string,
  strokeSrc: string,
  mode: "remove" | "restore",
): Promise<string> => {
  const orig = await loadImage(originalSrc);
  const W = orig.naturalWidth;
  const H = orig.naturalHeight;
  const MAXWORK = 560;
  const scale = Math.min(1, MAXWORK / Math.max(W, H));
  const w = Math.max(1, Math.round(W * scale));
  const h = Math.max(1, Math.round(H * scale));

  const oc = document.createElement("canvas");
  oc.width = w; oc.height = h;
  const octx = oc.getContext("2d", { willReadFrequently: true })!;
  octx.drawImage(orig, 0, 0, w, h);
  const od = octx.getImageData(0, 0, w, h).data;

  const strokeImg = await loadImage(strokeSrc);
  const sc = document.createElement("canvas");
  sc.width = w; sc.height = h;
  const sctx = sc.getContext("2d", { willReadFrequently: true })!;
  sctx.drawImage(strokeImg, 0, 0, w, h);
  const sd = sctx.getImageData(0, 0, w, h).data;

  const N = w * h;
  const visited = new Uint8Array(N);
  const queue = new Int32Array(N);
  let qlen = 0;

  // Seeds: where the stroke painted. Also accumulate the seed mean colour.
  let sr = 0, sg = 0, sb = 0, seedCount = 0;
  for (let p = 0; p < N; p++) {
    if (sd[p * 4 + 3] > 40) {
      visited[p] = 1;
      queue[qlen++] = p;
      const i = p * 4;
      sr += od[i]; sg += od[i + 1]; sb += od[i + 2];
      seedCount++;
    }
  }
  if (seedCount === 0) return strokeSrc; // nothing painted; return as-is
  sr /= seedCount; sg /= seedCount; sb /= seedCount;

  const LOCAL_TOL = 30;   // adjacency gradient tolerance (stops at edges)
  const SEED_TOL = 72;    // max distance from the seed mean colour (bounds the grow)
  const seedTolSq = SEED_TOL * SEED_TOL;
  const localTolSq = LOCAL_TOL * LOCAL_TOL;

  let head = 0;
  while (head < qlen) {
    const p = queue[head++];
    const x = p % w;
    const y = (p - x) / w;
    const i = p * 4;
    const r = od[i], g = od[i + 1], b = od[i + 2];
    // 4-connected neighbours
    const neigh = [
      x > 0 ? p - 1 : -1,
      x < w - 1 ? p + 1 : -1,
      y > 0 ? p - w : -1,
      y < h - 1 ? p + w : -1,
    ];
    for (let k = 0; k < 4; k++) {
      const np = neigh[k];
      if (np < 0 || visited[np]) continue;
      const j = np * 4;
      const dr = od[j] - r, dg = od[j + 1] - g, db = od[j + 2] - b;
      if (dr * dr + dg * dg + db * db > localTolSq) continue;
      const mr = od[j] - sr, mg = od[j + 1] - sg, mb = od[j + 2] - sb;
      if (mr * mr + mg * mg + mb * mb > seedTolSq) continue;
      visited[np] = 1;
      queue[qlen++] = np;
    }
  }

  // Paint the grown region in the correct channel.
  const out = octx.createImageData(w, h);
  const oData = out.data;
  const cr = mode === "remove" ? 255 : 0;
  const cg = mode === "remove" ? 0 : 255;
  for (let p = 0; p < N; p++) {
    if (visited[p]) {
      const i = p * 4;
      oData[i] = cr; oData[i + 1] = cg; oData[i + 2] = 0; oData[i + 3] = 255;
    }
  }
  sc.getContext("2d")!.clearRect(0, 0, w, h);
  sctx.putImageData(out, 0, 0);

  // Upsample the small region mask to full resolution.
  const full = document.createElement("canvas");
  full.width = W; full.height = H;
  const fctx = full.getContext("2d")!;
  fctx.imageSmoothingEnabled = false;
  fctx.drawImage(sc, 0, 0, W, H);
  return full.toDataURL("image/png");
};

/** Composite a new paint region on top of the accumulated paint mask (latest wins). */
export const mergeMasks = async (
  baseSrc: string | null,
  addSrc: string,
): Promise<string> => {
  const add = await loadImage(addSrc);
  const W = add.naturalWidth;
  const H = add.naturalHeight;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  if (baseSrc) {
    const base = await loadImage(baseSrc);
    ctx.drawImage(base, 0, 0, W, H);
  }
  ctx.drawImage(add, 0, 0, W, H);
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
