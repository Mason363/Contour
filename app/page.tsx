"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Upload } from "lucide-react";
import Header from "@/components/Header";
import ArtboardRail from "@/components/ArtboardRail";
import Canvas, { type Tool } from "@/components/Canvas";
import RightPanel from "@/components/RightPanel";
import WelcomeModal from "@/components/WelcomeModal";
import type { Artboard, TraceSettings, CropRect, BackgroundLayer } from "@/lib/types";
import { defaultTrace, activeSrc } from "@/lib/types";
import {
  decodeImageFile, blobToDataUrl, loadImage, isSupportedImageFile,
  autoContentBounds,
} from "@/lib/image";
import { removeImageBackground } from "@/lib/bg";
import { extractAlphaMask, applyBgRemovalMasks, magicExpandSelection, mergeMasks } from "@/lib/mask";
import { buildPreviewSvg, traceToSvg, styleSvg } from "@/lib/vectorize";
import { exportArtboard, exportAllZip, copyArtboardToClipboard, downloadBlob } from "@/lib/export";

const uid = () => Math.random().toString(36).slice(2, 9);

export default function ContourApp() {
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  const [mounted, setMounted] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);

  const [artboards, setArtboards] = useState<Artboard[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>("move");
  const [brushSize, setBrushSize] = useState<number>(20);
  const [magicBrush, setMagicBrush] = useState<boolean>(true);
  const [showComparisonSlider, setShowComparisonSlider] = useState<boolean>(false);
  const [isComparing, setIsComparing] = useState<boolean>(false);

  const [livePreview, setLivePreview] = useState(false);
  const [previewSvg, setPreviewSvg] = useState<string | null>(null);

  const [bgBusy, setBgBusy] = useState(false);
  const [bgProgress, setBgProgress] = useState<number | null>(null);
  const [vecBusy, setVecBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);

  const [exportFormat, setExportFormat] = useState("png");
  const [exportSize, setExportSize] = useState("original");
  const [toast, setToast] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const bgInputRef = useRef<HTMLInputElement>(null);

  const active = artboards.find((a) => a.id === activeId) ?? null;
  const vectorDisplaySvg = active?.vectorSvg ? styleSvg(active.vectorSvg, "display") : null;

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2400);
  }, []);

  // ----- Theme -----
  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem("contour-theme") as "light" | "dark" | null;
    const t = saved ?? "dark";
    setTheme(t);
    document.documentElement.setAttribute("data-theme", t);
    if (localStorage.getItem("contour-welcome-dismissed") !== "1") setShowWelcome(true);
  }, []);

  const closeWelcome = (dontShowAgain: boolean) => {
    if (dontShowAgain) localStorage.setItem("contour-welcome-dismissed", "1");
    setShowWelcome(false);
  };

  const toggleTheme = () => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    localStorage.setItem("contour-theme", next);
    document.documentElement.setAttribute("data-theme", next);
  };

  useEffect(() => {
    const href = theme === "light" ? "/favicon-black.png" : "/favicon-white.png";
    let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.href = href;
  }, [theme]);

  // ----- Artboard creation -----
  const addArtboardFromDataUrl = useCallback((dataUrl: string, name: string, type: string) => {
    const img = new Image();
    img.onload = () => {
      const ab: Artboard = {
        id: uid(),
        name,
        originalSrc: dataUrl,
        width: img.naturalWidth,
        height: img.naturalHeight,
        mimeType: type,
        processedSrc: null,
        bgRemoved: false,
        crop: { x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight },
        background: null,
        trace: defaultTrace(),
        vectorSvg: null,
        view: "image",
        visible: true,
        baseMaskSrc: null,
        paintMaskSrc: null,
        bgRemovalStrength: 50,
        bgRemovalModel: "isnet",
        bgRemovalDevice: "cpu",
        bgRemovalWorker: true,
        blurBackground: false,
        blurAmount: 50,
        shadow: false,
        shadowOpacity: 35,
      };
      setArtboards((prev) => [...prev, ab]);
      setActiveId(ab.id);
    };
    img.src = dataUrl;
  }, []);

  const loadFiles = useCallback(async (files: FileList | File[]) => {
    for (const file of Array.from(files)) {
      if (!isSupportedImageFile(file)) continue;
      try {
        const dataUrl = await decodeImageFile(file);
        addArtboardFromDataUrl(dataUrl, file.name, file.type || "image/png");
      } catch (err) {
        console.error("Decode failed:", file.name, err);
        showToast(`Could not read "${file.name}"`);
      }
    }
  }, [addArtboardFromDataUrl, showToast]);

  const loadExample = useCallback(async (fileName: string) => {
    try {
      const res = await fetch(`/examples/${encodeURIComponent(fileName)}`);
      const blob = await res.blob();
      const dataUrl = await blobToDataUrl(blob);
      addArtboardFromDataUrl(dataUrl, fileName, blob.type || "image/jpeg");
    } catch (err) {
      console.error("Example load failed:", err);
    }
  }, [addArtboardFromDataUrl]);

  // ----- Global drag & drop + paste -----
  useEffect(() => {
    const over = (e: DragEvent) => { e.preventDefault(); setIsDragOver(true); };
    const leave = (e: DragEvent) => {
      if (e.clientX <= 0 || e.clientY <= 0 || e.clientX >= innerWidth || e.clientY >= innerHeight)
        setIsDragOver(false);
    };
    const drop = (e: DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      if (e.dataTransfer?.files?.length) loadFiles(e.dataTransfer.files);
    };
    window.addEventListener("dragover", over);
    window.addEventListener("dragleave", leave);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragover", over);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("drop", drop);
    };
  }, [loadFiles]);

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const tag = document.activeElement?.tagName.toLowerCase();
      if (tag === "input" || tag === "select" || tag === "textarea") return;
      const imgs = Array.from(e.clipboardData?.files ?? []).filter(isSupportedImageFile);
      if (imgs.length) { e.preventDefault(); loadFiles(imgs); }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [loadFiles]);

  // ----- Delete key removes the active artboard -----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = document.activeElement?.tagName.toLowerCase();
      if (tag === "input" || tag === "select" || tag === "textarea") return;
      if ((e.key === "Delete" || e.key === "Backspace") && activeId && tool !== "crop") {
        e.preventDefault();
        removeArtboard(activeId);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, tool]);

  // ----- Mutators -----
  const patchActive = useCallback((patch: Partial<Artboard>) => {
    setArtboards((prev) => prev.map((a) => (a.id === activeId ? { ...a, ...patch } : a)));
  }, [activeId]);

  const patchTrace = useCallback((patch: Partial<TraceSettings>) => {
    setArtboards((prev) => prev.map((a) => (a.id === activeId ? { ...a, trace: { ...a.trace, ...patch } } : a)));
  }, [activeId]);

  const patchCrop = useCallback((crop: CropRect) => {
    setArtboards((prev) => prev.map((a) => {
      if (a.id !== activeId) return a;
      // Adjusting the crop invalidates a committed vector and background framing stays.
      return { ...a, crop };
    }));
  }, [activeId]);

  const removeArtboard = (id: string) => {
    setArtboards((prev) => {
      const next = prev.filter((a) => a.id !== id && a.parentId !== id);
      if (id === activeId) setActiveId(next.length ? next[next.length - 1].id : null);
      return next;
    });
  };

  const toggleArtboardVisibility = useCallback((id: string) => {
    setArtboards((prev) => prev.map((a) => (a.id === id ? { ...a, visible: !a.visible } : a)));
  }, []);

  // ----- Background removal -----
  const onRemoveBg = async () => {
    if (!active) return;
    setBgBusy(true);
    setBgProgress(0);
    try {
      const processed = await removeImageBackground(active.originalSrc, (p) => setBgProgress(p), {
        model: active.bgRemovalModel,
        device: active.bgRemovalDevice,
        proxyToWorker: active.bgRemovalWorker,
      });
      const baseMask = await extractAlphaMask(processed);
      const finalCutout = await applyBgRemovalMasks(
        active.originalSrc,
        baseMask,
        active.paintMaskSrc,
        null,
        active.bgRemovalStrength,
        null
      );
      setArtboards((prev) => prev.map((a) =>
        a.id === active.id ? {
          ...a,
          baseMaskSrc: baseMask,
          processedSrc: finalCutout,
          bgRemoved: true,
          view: "image"
        } : a));
      showToast("Background removed");
    } catch (err) {
      console.error(err);
      showToast("Background removal failed");
    } finally {
      setBgBusy(false);
      setBgProgress(null);
    }
  };

  const onRestoreOriginal = () => patchActive({ processedSrc: null, bgRemoved: false, baseMaskSrc: null });

  const onUpdateBgRemoval = async (patch: {
    bgRemovalStrength?: number;
    paintMaskSrc?: string | null;
    bgRemovalModel?: "isnet" | "isnet_fp16" | "isnet_quint8";
    bgRemovalDevice?: "cpu" | "gpu";
    bgRemovalWorker?: boolean;
  }) => {
    if (!active) return;

    const nextStrength = patch.bgRemovalStrength !== undefined ? patch.bgRemovalStrength : active.bgRemovalStrength;
    const nextPaintMask = patch.paintMaskSrc !== undefined ? patch.paintMaskSrc : active.paintMaskSrc;
    const nextModel = patch.bgRemovalModel !== undefined ? patch.bgRemovalModel : active.bgRemovalModel;
    const nextDevice = patch.bgRemovalDevice !== undefined ? patch.bgRemovalDevice : active.bgRemovalDevice;
    const nextWorker = patch.bgRemovalWorker !== undefined ? patch.bgRemovalWorker : active.bgRemovalWorker;

    let nextProcessed = active.processedSrc;

    if (active.bgRemoved && active.baseMaskSrc && (
      patch.bgRemovalStrength !== undefined ||
      patch.paintMaskSrc !== undefined
    )) {
      try {
        nextProcessed = await applyBgRemovalMasks(
          active.originalSrc,
          active.baseMaskSrc,
          nextPaintMask,
          null,
          nextStrength,
          null
        );
      } catch (err) {
        console.error("Failed to re-composite masks:", err);
      }
    }

    setArtboards((prev) => prev.map((a) =>
      a.id === active.id ? {
        ...a,
        bgRemovalStrength: nextStrength,
        paintMaskSrc: nextPaintMask,
        bgRemovalModel: nextModel,
        bgRemovalDevice: nextDevice,
        bgRemovalWorker: nextWorker,
        processedSrc: nextProcessed,
      } : a
    ));
  };

  // ----- Magic brush stroke (Erase / Restore) -----
  const onBrushStroke = async (strokeSrc: string, mode: "remove" | "restore") => {
    if (!active) return;
    try {
      const region = magicBrush
        ? await magicExpandSelection(active.originalSrc, strokeSrc, mode)
        : strokeSrc;
      const mergedPaint = await mergeMasks(active.paintMaskSrc, region);

      // Recompose. Restore needs an existing base matte; Erase works even before
      // background removal (it simply knocks out the painted pixels of the original).
      let nextProcessed = active.processedSrc;
      if (active.bgRemoved || mode === "remove") {
        nextProcessed = await applyBgRemovalMasks(
          active.originalSrc,
          active.baseMaskSrc,
          mergedPaint,
          null,
          active.bgRemovalStrength,
          null
        );
      }

      setArtboards((prev) => prev.map((a) =>
        a.id === active.id ? { ...a, paintMaskSrc: mergedPaint, processedSrc: nextProcessed } : a
      ));
    } catch (err) {
      console.error("Brush stroke failed:", err);
      showToast("Brush failed");
    }
  };

  const onClearBrushEdits = async () => {
    if (!active) return;

    let nextProcessed = active.processedSrc;
    if (active.bgRemoved && active.baseMaskSrc) {
      try {
        nextProcessed = await applyBgRemovalMasks(
          active.originalSrc,
          active.baseMaskSrc,
          null,
          null,
          active.bgRemovalStrength,
          null
        );
      } catch (err) {
        console.error("Failed to clear brush edits:", err);
      }
    } else {
      // Erase-before-removal edits: clearing returns to the untouched original.
      nextProcessed = null;
    }

    setArtboards((prev) => prev.map((a) =>
      a.id === active.id ? {
        ...a,
        paintMaskSrc: null,
        processedSrc: nextProcessed,
      } : a
    ));
    showToast("Brush edits cleared");
  };

  // ----- Crop helpers -----
  const onAutoCrop = async () => {
    if (!active) return;
    try {
      const img = await loadImage(activeSrc(active));
      const bounds = autoContentBounds(img);
      if (bounds) { patchCrop(bounds); showToast("Cropped to content"); }
      else showToast("No content bounds found");
    } catch { showToast("Auto-crop failed"); }
  };

  const onResetCrop = () => {
    if (!active) return;
    patchCrop({ x: 0, y: 0, w: active.width, h: active.height });
  };

  // ----- Background import -----
  const onImportBackground = () => bgInputRef.current?.click();

  const onBgFileChosen = async (files: FileList | null) => {
    if (!files?.length || !active) return;
    const file = files[0];
    if (!isSupportedImageFile(file)) return;
    try {
      const dataUrl = await decodeImageFile(file);
      const img = await loadImage(dataUrl);
      // Fit (cover) the background to the crop region, centred.
      const scale = Math.max(active.crop.w / img.naturalWidth, active.crop.h / img.naturalHeight);
      const bg: BackgroundLayer = {
        src: dataUrl,
        naturalWidth: img.naturalWidth,
        naturalHeight: img.naturalHeight,
        scale,
        offsetX: (active.crop.w - img.naturalWidth * scale) / 2,
        offsetY: (active.crop.h - img.naturalHeight * scale) / 2,
      };
      patchActive({ background: bg });
      setTool("background");
    } catch { showToast("Could not load background"); }
    if (bgInputRef.current) bgInputRef.current.value = "";
  };

  const onClearBackground = () => { patchActive({ background: null }); if (tool === "background") setTool("move"); };

  // ----- Vectorize -----
  const onGenerateVectors = async () => {
    if (!active) return;
    setVecBusy(true);
    try {
      let working = active;
      if (active.trace.removeBackgroundFirst && !active.processedSrc) {
        setBgProgress(0);
        const processed = await removeImageBackground(active.originalSrc, (p) => setBgProgress(p), {
          model: active.bgRemovalModel,
          device: active.bgRemovalDevice,
          proxyToWorker: active.bgRemovalWorker,
        });
        const baseMask = await extractAlphaMask(processed);
        const finalCutout = await applyBgRemovalMasks(
          active.originalSrc,
          baseMask,
          active.paintMaskSrc,
          null,
          active.bgRemovalStrength,
          null
        );
        working = { ...active, processedSrc: finalCutout, baseMaskSrc: baseMask, bgRemoved: true };
        setBgProgress(null);
      }
      const raw = await traceToSvg(working);
      
      const traceId = uid();
      const newArtboard: Artboard = {
        id: traceId,
        name: active.name.endsWith(" (Trace)") ? active.name : `${active.name} (Trace)`,
        parentId: active.parentId ?? active.id,
        originalSrc: active.originalSrc,
        width: active.width,
        height: active.height,
        mimeType: active.mimeType,
        processedSrc: working.processedSrc,
        bgRemoved: working.processedSrc ? true : active.bgRemoved,
        crop: { ...active.crop },
        background: active.background ? { ...active.background } : null,
        trace: { ...active.trace },
        vectorSvg: raw,
        view: "vector",
        visible: true,
        baseMaskSrc: working.baseMaskSrc ?? null,
        paintMaskSrc: working.paintMaskSrc ?? null,
        bgRemovalStrength: working.bgRemovalStrength ?? 50,
        bgRemovalModel: working.bgRemovalModel ?? "isnet",
        bgRemovalDevice: working.bgRemovalDevice ?? "cpu",
        bgRemovalWorker: working.bgRemovalWorker ?? true,
        blurBackground: active.blurBackground,
        blurAmount: active.blurAmount,
        shadow: active.shadow,
        shadowOpacity: active.shadowOpacity,
      };

      setArtboards((prev) => {
        const idx = prev.findIndex((ab) => ab.id === active.id);
        if (idx === -1) return [...prev, newArtboard];
        const next = [...prev];
        // Turn off parent/original image visibility
        next[idx] = { ...next[idx], visible: false };
        // Insert new trace right after parent
        next.splice(idx + 1, 0, newArtboard);
        return next;
      });

      setActiveId(traceId);
      showToast("Vectors generated");
    } catch (err) {
      console.error(err);
      showToast("Vectorization failed");
    } finally {
      setVecBusy(false);
      setBgProgress(null);
    }
  };

  const onClearVector = () => patchActive({ vectorSvg: null, view: "image" });

  // ----- Live preview (debounced) -----
  useEffect(() => {
    if (!livePreview || !active || tool === "crop" || active.view === "vector") {
      setPreviewSvg(null);
      return;
    }
    let cancelled = false;
    const handle = setTimeout(async () => {
      try {
        // Preview never triggers heavy AI bg removal; it uses the existing layer.
        const previewBoard = { ...active, trace: { ...active.trace, removeBackgroundFirst: false } };
        const svg = await buildPreviewSvg(previewBoard);
        if (!cancelled) setPreviewSvg(svg);
      } catch { /* transient preview errors are ignored */ }
    }, 220);
    return () => { cancelled = true; clearTimeout(handle); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    livePreview, tool, active?.id, active?.view, active?.processedSrc,
    active?.crop.x, active?.crop.y, active?.crop.w, active?.crop.h,
    active?.trace.silhouette, active?.trace.threshold, active?.trace.tolerance,
    active?.trace.cornerSmoothness, active?.trace.pathOptimization,
    active?.trace.colorGrouping, active?.trace.colorGroups,
  ]);

  // ----- Export -----
  const onExport = async () => {
    if (!active) return;
    setExportBusy(true);
    try {
      const { blob, filename } = await exportArtboard(active, exportFormat, exportSize);
      downloadBlob(blob, filename);
    } catch (err) {
      console.error(err);
      showToast("Export failed");
    } finally { setExportBusy(false); }
  };

  const onCopy = async () => {
    if (!active) return;
    try { await copyArtboardToClipboard(active); showToast("Copied to clipboard"); }
    catch (err) { console.error(err); showToast("Copy failed (clipboard blocked)"); }
  };

  const onExportAll = async () => {
    if (!artboards.length) return;
    setExportBusy(true);
    try { await exportAllZip(artboards, exportFormat, exportSize); }
    catch (err) { console.error(err); showToast("Export all failed"); }
    finally { setExportBusy(false); }
  };

  if (!mounted) return null;

  return (
    <div className="app">
      <Header theme={theme} onToggleTheme={toggleTheme} />

      <div className="body">
        <ArtboardRail
          artboards={artboards}
          activeId={activeId}
          onSelect={(id) => { setActiveId(id); setTool("move"); }}
          onRemove={removeArtboard}
          onAdd={() => fileInputRef.current?.click()}
          onToggleVisible={toggleArtboardVisibility}
        />

        <Canvas
          artboard={active}
          artboards={artboards}
          tool={tool}
          previewSvg={previewSvg}
          vectorDisplaySvg={vectorDisplaySvg}
          onCropChange={patchCrop}
          onBackgroundChange={(bg) => patchActive({ background: bg })}
          onPickFiles={() => fileInputRef.current?.click()}
          onLoadExample={loadExample}
          brushSize={brushSize}
          showComparisonSlider={showComparisonSlider}
          isComparing={isComparing}
          onBrushStroke={onBrushStroke}
          onCopyImage={onCopy}
        />

        <RightPanel
          artboard={active}
          artboardCount={artboards.length}
          tool={tool}
          setTool={setTool}
          livePreview={livePreview}
          setLivePreview={setLivePreview}
          bgBusy={bgBusy}
          bgProgress={bgProgress}
          vecBusy={vecBusy}
          exportBusy={exportBusy}
          exportFormat={exportFormat}
          setExportFormat={setExportFormat}
          exportSize={exportSize}
          setExportSize={setExportSize}
          onUpdate={patchActive}
          onUpdateTrace={patchTrace}
          onUpdateCrop={patchCrop}
          onRemoveBg={onRemoveBg}
          onRestoreOriginal={onRestoreOriginal}
          onAutoCrop={onAutoCrop}
          onResetCrop={onResetCrop}
          onImportBackground={onImportBackground}
          onClearBackground={onClearBackground}
          onGenerateVectors={onGenerateVectors}
          onClearVector={onClearVector}
          onExport={onExport}
          onCopy={onCopy}
          onExportAll={onExportAll}
          onPickFiles={() => fileInputRef.current?.click()}
          brushSize={brushSize}
          setBrushSize={setBrushSize}
          magicBrush={magicBrush}
          setMagicBrush={setMagicBrush}
          showComparisonSlider={showComparisonSlider}
          setShowComparisonSlider={setShowComparisonSlider}
          isComparing={isComparing}
          setIsComparing={setIsComparing}
          onUpdateBgRemoval={onUpdateBgRemoval}
          onClearBrushEdits={onClearBrushEdits}
        />
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.heic,.heif,.tif,.tiff,.avif"
        multiple
        style={{ display: "none" }}
        onChange={(e) => { if (e.target.files) loadFiles(e.target.files); e.target.value = ""; }}
      />
      <input
        ref={bgInputRef}
        type="file"
        accept="image/*,.heic,.heif,.tif,.tiff,.avif"
        style={{ display: "none" }}
        onChange={(e) => onBgFileChosen(e.target.files)}
      />

      <div className={`drag-overlay ${isDragOver ? "on" : ""}`}>
        <div className="drag-overlay-box">
          <Upload size={44} />
          <span>Drop images to import into Contour</span>
        </div>
      </div>

      {toast && <div className="toast">{toast}</div>}

      {showWelcome && <WelcomeModal theme={theme} onClose={closeWelcome} />}
    </div>
  );
}
