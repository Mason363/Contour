<div align="center">

<img src="public/favicon.png" alt="Contour" width="84" height="84" />

# Contour

**Background removal & image vectorization that runs entirely in your browser.**

`100% local` · `100% private` · `free` · `open source`

</div>

---

Contour is a Photoshop-style web tool for cutting subjects out of photos and turning
images into clean vector paths. Every pixel is processed on your own machine —
nothing is ever uploaded. The background-removal model runs locally via
**WebAssembly (ONNX Runtime)** and tracing happens in-browser too, so your images
never leave your device.

> 🖨️ **Check out [Planar](https://github.com/Mason363/Planar)** — my companion tool to
> scale, crop, and arrange images onto sheets of paper for easy printing (also 100% local).

---

## ✨ Features

### Background removal
- **One-click local removal** — high-quality matting with the ISNet model, executed in
  your browser through WebAssembly. The model downloads once, then works offline.
- **Magic brushes — Erase & Restore** — brush over something and Contour auto-detects the
  whole object and removes or brings it back. Got two people and only want one? Brush the
  other away. Lost someone in the cut-out? Restore them with a quick scribble.
  - **Auto-detect** toggle (on by default) expands a stroke to the whole object; turn it
    off to act on exactly the pixels you paint.
  - **Live preview + confirm** — strokes are previewed (Restore shows the background
    peeking back) and applied only when you hit **Apply** (Enter/Esc to apply/cancel).
  - **Erase** works before *and* after removal; **Restore** after removal. Adjustable
    brush size.
- **Sensitivity** — tighten or loosen the cut-out edge without re-running the model.
- **Invert** — keep the background and drop the subject in one click.
- **Model quality** — Fast, Balanced, High Quality, or **Best** (a higher-quality matting
  model that runs in-browser via WebGPU, with automatic fallback). CPU or WebGPU.
- **Compare** — hold to flip before/after, or drag a split-screen slider.

### Background & effects
- **Import a background** — place a custom backdrop behind the cut-out. Enter
  **Move background** to drag it around and resize it from the corners; zoom from centre.
- **Background effects** — **blur** the photo's own background behind a sharp subject, and
  add a **drop shadow**, each with its own amount/opacity.

### Cropping
- Drag handles to crop manually, type exact pixel dimensions, **reset to full**, or
  **auto-crop** to the smallest rectangle containing the content. Cropped pixels are
  clipped cleanly on the canvas and in every export.

### Vectorization (tracing)
- Convert any photo or graphic into scalable vector paths:
  **Silhouette** mode · **Remove background before tracing** · **Threshold**,
  **Tolerance / Detail**, **Corner Smoothness**, **Path Optimization**, **Color grouping**
  — with a **live cyan preview** that updates as you tune.

### Workflow, import & export
- **Artboards** — work on many images at once, each with its own settings. Thumbnails show
  the true composite (crop, background, effects, cut-out / vector).
- **Right-click → Copy image** — grab the full-resolution result anywhere on the canvas.
- **Universal import** — JPG, PNG, WebP, AVIF, GIF, BMP, SVG, **HEIC/HEIF**, **TIFF**, ICO,
  plus paste-from-clipboard and drag-and-drop.
- **Universal export** — PNG, WebP, AVIF, TIFF (alpha), JPEG, BMP, **SVG (vector)**, PDF,
  with an **export size** selector (Original / Large / Medium / Small). Export the active
  artboard, **Copy** it, or **Export All** as a zip.
- **Light & dark themes** with polished, minimal micro-interactions.

---

## 🚀 Getting started

**Prerequisites:** [Node.js](https://nodejs.org/) 18+.

```bash
git clone https://github.com/Mason363/Contour.git
cd Contour
npm install
npm run dev
```
Open [http://localhost:3000](http://localhost:3000).

**Production build:**
```bash
npm run build
npm start
```

---

## 🧭 How to use

1. **Import** an image — drag it in, click the drop zone, paste from your clipboard, or pick an example.
2. **Remove the background** — one click runs the local matting model.
3. **Refine with magic brushes** — **Erase** what you don't want, **Restore** what got cut; adjust **Sensitivity** for the edge.
4. **Crop** — manually, by exact dimensions, or **Auto**.
5. **Background & effects** — import a backdrop and move/resize it, or blur the background and add a shadow.
6. **Trace to vectors** *(optional)* — tune the sliders with live preview, then **Generate Vectors** and switch Image / Vector views.
7. **Export** — pick a format and size, **Copy**, right-click → **Copy image**, or **Export All** as a zip.

The **artboard rail** on the left adds and switches between images — each keeps its own settings.

---

## 🛠️ Tech stack

| | |
|---|---|
| **Framework** | Next.js (App Router) + React + TypeScript |
| **Styling** | Vanilla CSS with theme variables |
| **Background removal** | [`@imgly/background-removal`](https://github.com/imgly/background-removal-js) — ONNX Runtime Web (WebAssembly) |
| **Magic brushes** | In-browser colour-similarity region growing seeded by the brush stroke |
| **Vectorization** | [`imagetracerjs`](https://github.com/jankovicsandras/imagetracerjs) — in-browser raster→SVG tracing |
| **Decoding / export** | `heic2any`, `utif2` (TIFF), `jspdf` (PDF), `jszip` (batch export) |
| **Icons** | `lucide-react` + inline SVG |

---

## 🔒 Privacy

Contour is fully serverless. Decoding, background removal, brushing, tracing, cropping and
export all happen in your browser's memory. No image data is uploaded anywhere. The only
network request is a one-time download of the background-removal model weights from a CDN —
after which it runs entirely offline.

---

## 📄 License

[MIT](LICENSE) © Mason Chen
