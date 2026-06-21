# Contour

**100% local · 100% private · 100% free · 100% open source** background removal and image vectorization — running entirely in your browser.

Contour is a Photoshop-style web tool for cutting subjects out of photos and turning images into clean vector paths. Every pixel is processed on your own machine. Nothing is ever uploaded to a server: the AI background-removal model runs locally via **WebAssembly (ONNX Runtime)**, and tracing happens in-browser too. Your images never leave your device.

![Contour](public/favicon.png)

---

## ✨ Features

- **Local AI background removal** — high-quality matting with the ISNet model, executed in your browser through WebAssembly. The model downloads once, then works offline.
- **Image vectorization (tracing)** — convert any photo or graphic into scalable vector paths, with the full Pathstitch control set:
  - **Silhouette tracing** (backgroundless) · **Remove background before tracing**
  - **Threshold**, **Tolerance / Detail**, **Corner Smoothness**, **Path Optimization**
  - **Live cyan preview** that updates as you tune the sliders.
- **Photoshop-style canvas** — the artboard molds to fit your image (blank when empty), with smooth trackpad pinch-zoom, mouse-wheel zoom, spacebar/drag panning, and fit-to-view.
- **Cropping & bounds** — drag handles to crop manually, type exact pixel dimensions, **reset to full**, or **auto-crop** to the smallest rectangle containing the content.
- **Import a background** — drop a custom backdrop behind your cut-out. Zoom and frame it; it's clipped to the crop bounds.
- **Batch mode (artboards)** — work on many images at once, each with its own settings, like Photoshop artboards. **Export All** to a zip, or **Copy** the active artboard straight to your clipboard.
- **Universal import** — JPG, PNG, WebP, AVIF, GIF, BMP, SVG, **HEIC/HEIF**, **TIFF**, ICO, plus paste-from-clipboard and drag-and-drop.
- **Universal export** — PNG, WebP, AVIF, TIFF (with alpha), JPEG, BMP, **SVG (vector)**, and PDF. Opaque formats are flattened onto white unless you've imported a background.
- **Light & dark themes** with polished, minimal micro-interactions.

---

## 🚀 Getting started

### Prerequisites
[Node.js](https://nodejs.org/) 18+.

### Installation
```bash
git clone https://github.com/Mason363/Contour.git
cd Contour
npm install
npm run dev
```
Open [http://localhost:3000](http://localhost:3000).

### Production build
```bash
npm run build
npm start
```

---

## 🧭 How to use

1. **Import** an image — drag it in, click the drop zone, paste from your clipboard, or pick an example.
2. **Remove the background** (section 1) — one click runs the local AI matting model.
3. **Crop** (section 2) — crop manually, enter exact dimensions, or hit **Auto** for a tight bounding box.
4. **Add a background** (section 3, optional) — place and frame a custom backdrop behind the cut-out.
5. **Trace to vectors** (section 4) — toggle **Live cyan preview**, tune the sliders, then **Generate Vectors**. Switch between the **Image** and **Vector** views.
6. **Export** (section 5) — pick a format and export the artboard, **Copy** it to the clipboard, or **Export All** artboards as a zip.

Use the **artboard rail** on the left to add and switch between images — each keeps its own settings.

---

## 🛠️ Tech stack

| | |
|---|---|
| **Framework** | Next.js (App Router) + React 19 + TypeScript |
| **Styling** | Vanilla CSS with theme variables |
| **Background removal** | [`@imgly/background-removal`](https://github.com/imgly/background-removal-js) — ONNX Runtime Web (WebAssembly) |
| **Vectorization** | [`imagetracerjs`](https://github.com/jankovicsandras/imagetracerjs) — in-browser raster→SVG tracing |
| **Decoding / export** | `heic2any`, `utif2` (TIFF), `jspdf` (PDF), `jszip` (batch export) |
| **Icons** | `lucide-react` + inline SVG |

The vectorization pipeline mirrors the desktop **Pathstitch** tracer (threshold + silhouette modes mapped to detail, corner smoothness and path optimization), reimplemented for the browser.

---

## 🔒 Privacy

Contour is fully serverless. Decoding, background removal, tracing, cropping and export all happen in your browser's memory. No image data is uploaded anywhere. The only network request is a one-time download of the background-removal model weights from a CDN — after which it runs entirely offline.

---

## 📄 License

[MIT](LICENSE) © Mason Chen
