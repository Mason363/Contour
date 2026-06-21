"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Plus, Minus, Maximize2, Upload, Scissors, Copy } from "lucide-react";
import type { Artboard, CropRect, BackgroundLayer } from "@/lib/types";
import { activeSrc } from "@/lib/types";

export type Tool = "move" | "crop" | "background" | "brush-include" | "brush-remove";

interface Props {
  artboard: Artboard | null;
  artboards?: Artboard[];
  tool: Tool;
  previewSvg: string | null;
  vectorDisplaySvg: string | null;
  onCropChange: (crop: CropRect) => void;
  onBackgroundChange: (bg: BackgroundLayer) => void;
  onPickFiles: () => void;
  onLoadExample: (file: string) => void;

  brushSize: number;
  showComparisonSlider: boolean;
  isComparing: boolean;
  onBrushStroke: (strokeSrc: string, mode: "remove" | "restore") => void;
  pendingMaskSrc: string | null;
  pendingMode: "remove" | "restore" | null;
  onCopyImage?: () => void;
}

const EXAMPLES = ["bird.jpg", "dog.jpg", "lotus.jpg", "trees.jpg", "canyon.jpg"];

type HandleDir = "nw" | "ne" | "sw" | "se" | "n" | "s" | "w" | "e";

export default function Canvas({
  artboard,
  artboards = [],
  tool,
  previewSvg,
  vectorDisplaySvg,
  onCropChange,
  onBackgroundChange,
  onPickFiles,
  onLoadExample,
  brushSize,
  showComparisonSlider,
  isComparing,
  onBrushStroke,
  pendingMaskSrc,
  pendingMode,
  onCopyImage,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(zoom);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);

  const [spacePressed, setSpacePressed] = useState(false);
  const pan = useRef({ active: false, x: 0, y: 0, sl: 0, st: 0 });
  const pendingScroll = useRef<{ left: number; top: number } | null>(null);

  // Split-Screen comparison states
  const [sliderX, setSliderX] = useState(50);
  const [isAnimatingSlider, setIsAnimatingSlider] = useState(false);
  // Track the (id, bgRemoved) we last saw so the reveal animation only fires on a
  // genuine false -> true transition of the *current* artboard, not when switching
  // between artboards that happen to differ in bgRemoved state.
  const prevBg = useRef<{ id: string | null; bgRemoved: boolean }>({
    id: artboard?.id ?? null,
    bgRemoved: artboard?.bgRemoved ?? false,
  });
  const animRef = useRef<number | null>(null);

  // Brush drawing states
  const brushCanvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);

  // Right-click context menu (copy full-resolution image)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("mousedown", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [menu]);

  const cropMode = tool === "crop" && !!artboard;
  // In crop mode the full image is shown; otherwise the cropped region.
  const displayW = artboard ? (cropMode ? artboard.width : artboard.crop.w) : 1;
  const displayH = artboard ? (cropMode ? artboard.height : artboard.crop.h) : 1;

  // Trigger comparison wipe/sweep animation when background removal finishes.
  // The line sweeps left -> right, progressively revealing the cut-out over the
  // original. Runs regardless of whether the persistent split slider is enabled.
  useEffect(() => {
    const id = artboard?.id ?? null;
    const bgRemoved = artboard?.bgRemoved ?? false;
    const prev = prevBg.current;
    const sameBoard = prev.id === id;
    const justRemoved = sameBoard && !prev.bgRemoved && bgRemoved;
    prevBg.current = { id, bgRemoved };

    if (!justRemoved) return;

    if (animRef.current) cancelAnimationFrame(animRef.current);
    setIsAnimatingSlider(true);
    setSliderX(0);

    let start: number | null = null;
    const duration = 1100;
    // easeInOutCubic for a smooth sweep
    const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

    const animate = (timestamp: number) => {
      if (start === null) start = timestamp;
      const t = Math.min(1, (timestamp - start) / duration);
      setSliderX(ease(t) * 100);
      if (t < 1) {
        animRef.current = requestAnimationFrame(animate);
      } else {
        animRef.current = null;
        setIsAnimatingSlider(false);
        setSliderX(50); // park the divider in the middle for manual comparison
      }
    };
    animRef.current = requestAnimationFrame(animate);

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [artboard?.id, artboard?.bgRemoved]);

  // The brush canvas only ever holds the in-progress stroke; the accumulated pending
  // edit is shown by the preview overlay. Clear it on board/tool/pending change.
  useEffect(() => {
    const canvas = brushCanvasRef.current;
    if (!canvas) return;
    canvas.getContext("2d")!.clearRect(0, 0, canvas.width, canvas.height);
  }, [artboard?.id, tool, pendingMaskSrc]);

  const brushColor = tool === "brush-include" ? "rgb(0, 255, 0)" : "rgb(255, 0, 0)";

  // Map a pointer event to ORIGINAL image pixel coordinates. The brush canvas is the
  // full image positioned at -crop.x/-crop.y, so paint masks line up with the
  // compositing pipeline (which works in original-image space).
  const getMousePos = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = brushCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / zoom,
      y: (e.clientY - rect.top) / zoom,
    };
  };

  const startBrush = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return; // Left click only
    isDrawing.current = true;
    const pos = getMousePos(e);
    lastPos.current = pos;

    const canvas = brushCanvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d")!;
      ctx.clearRect(0, 0, canvas.width, canvas.height); // fresh stroke
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, brushSize / 2, 0, Math.PI * 2);
      ctx.fillStyle = brushColor;
      ctx.fill();
    }
  };

  const drawBrush = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const pos = getMousePos(e);
    setCursorPos(pos);

    if (!isDrawing.current) return;

    const canvas = brushCanvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d")!;
      ctx.beginPath();
      ctx.moveTo(lastPos.current.x, lastPos.current.y);
      ctx.lineTo(pos.x, pos.y);
      ctx.strokeStyle = brushColor;
      ctx.lineWidth = brushSize;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke();
      lastPos.current = pos;
    }
  };

  const endBrush = () => {
    if (!isDrawing.current) return;
    isDrawing.current = false;
    const canvas = brushCanvasRef.current;
    if (canvas) {
      const dataUrl = canvas.toDataURL("image/png");
      onBrushStroke(dataUrl, tool === "brush-remove" ? "remove" : "restore");
      // Hand off to the accumulated pending preview; clear the live stroke layer.
      canvas.getContext("2d")!.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  const startSliderDrag = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const artboardEl = e.currentTarget.parentElement;
    if (!artboardEl) return;
    
    const onMove = (ev: MouseEvent) => {
      const rect = artboardEl.getBoundingClientRect();
      const x = ev.clientX - rect.left;
      const pct = Math.max(0, Math.min(100, (x / rect.width) * 100));
      setSliderX(pct);
    };
    
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  const isBrushingTool = (t: string) => ["brush-include", "brush-remove"].includes(t);

  // ----- Fit to view -----
  const fit = useCallback(() => {
    const c = scrollRef.current;
    if (!c || !artboard) return;
    const pad = 64;
    const zw = (c.clientWidth - pad) / displayW;
    const zh = (c.clientHeight - pad) / displayH;
    const z = Math.max(0.05, Math.min(8, Math.min(zw, zh)));
    setZoom(z);
    pendingScroll.current = {
      left: (displayW * z - c.clientWidth) / 2,
      top: (displayH * z - c.clientHeight) / 2,
    };
  }, [artboard, displayW, displayH]);

  // Re-fit when the displayed artboard or its dimensions change.
  useEffect(() => {
    const id = requestAnimationFrame(() => fit());
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artboard?.id, displayW, displayH, cropMode]);

  useEffect(() => {
    if (pendingScroll.current && scrollRef.current) {
      scrollRef.current.scrollLeft = pendingScroll.current.left;
      scrollRef.current.scrollTop = pendingScroll.current.top;
      pendingScroll.current = null;
    }
  }, [zoom]);

  // ----- Wheel zoom / pan -----
  useEffect(() => {
    const c = scrollRef.current;
    if (!c) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const isPinch = e.ctrlKey || e.metaKey;
      const wdy = (e as WheelEvent & { wheelDeltaY?: number }).wheelDeltaY;
      const isMouseWheel =
        !isPinch && e.deltaX === 0 &&
        (wdy !== undefined && wdy !== 0 ? Math.abs(wdy) % 120 === 0 : e.deltaMode !== 0);
      if (isPinch || isMouseWheel) {
        let factor = 1;
        if (isPinch) factor = Math.exp(-e.deltaY * 0.012);
        else factor = 1 - Math.max(-1.5, Math.min(1.5, e.deltaY / 120)) * 0.1;
        const next = Math.max(0.05, Math.min(8, zoomRef.current * factor));
        const rect = c.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const px = (c.scrollLeft + mx) / zoomRef.current;
        const py = (c.scrollTop + my) / zoomRef.current;
        setZoom(next);
        pendingScroll.current = { left: px * next - mx, top: py * next - my };
      } else {
        c.scrollLeft += e.deltaX;
        c.scrollTop += e.deltaY;
      }
    };
    c.addEventListener("wheel", onWheel, { passive: false });
    return () => c.removeEventListener("wheel", onWheel);
  }, []);

  // ----- Spacebar pan -----
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      const tag = document.activeElement?.tagName.toLowerCase();
      if (tag === "input" || tag === "select" || tag === "textarea") return;
      if (e.code === "Space") { e.preventDefault(); setSpacePressed(true); }
    };
    const up = (e: KeyboardEvent) => { if (e.code === "Space") setSpacePressed(false); };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, []);

  const startPan = (e: React.MouseEvent) => {
    const c = scrollRef.current;
    if (!c) return;
    const onEmpty = !(e.target as HTMLElement).closest(".crop-handle") &&
      !(e.target as HTMLElement).closest(".bg-drag");
    if (e.button === 1 || spacePressed || (e.button === 0 && tool === "move") || (e.button === 0 && onEmpty && tool !== "crop" && tool !== "background")) {
      e.preventDefault();
      pan.current = { active: true, x: e.clientX, y: e.clientY, sl: c.scrollLeft, st: c.scrollTop };
      const mv = (ev: MouseEvent) => {
        if (!pan.current.active) return;
        c.scrollLeft = pan.current.sl - (ev.clientX - pan.current.x);
        c.scrollTop = pan.current.st - (ev.clientY - pan.current.y);
      };
      const upp = () => {
        pan.current.active = false;
        document.removeEventListener("mousemove", mv);
        document.removeEventListener("mouseup", upp);
      };
      document.addEventListener("mousemove", mv);
      document.addEventListener("mouseup", upp);
    }
  };

  // ----- Crop dragging -----
  const cropDrag = useRef<{ dir: HandleDir | "move"; start: CropRect; mx: number; my: number } | null>(null);
  const beginCrop = (e: React.MouseEvent, dir: HandleDir | "move") => {
    if (!artboard) return;
    e.preventDefault();
    e.stopPropagation();
    cropDrag.current = { dir, start: { ...artboard.crop }, mx: e.clientX, my: e.clientY };
    const mv = (ev: MouseEvent) => {
      const cd = cropDrag.current;
      if (!cd || !artboard) return;
      const dx = (ev.clientX - cd.mx) / zoomRef.current;
      const dy = (ev.clientY - cd.my) / zoomRef.current;
      let { x, y, w, h } = cd.start;
      const maxW = artboard.width;
      const maxH = artboard.height;
      const min = 10;
      if (cd.dir === "move") {
        x = Math.max(0, Math.min(maxW - w, x + dx));
        y = Math.max(0, Math.min(maxH - h, y + dy));
      } else {
        if (cd.dir.includes("w")) { const nx = Math.max(0, Math.min(x + w - min, x + dx)); w += x - nx; x = nx; }
        if (cd.dir.includes("e")) { w = Math.max(min, Math.min(maxW - x, w + dx)); }
        if (cd.dir.includes("n")) { const ny = Math.max(0, Math.min(y + h - min, y + dy)); h += y - ny; y = ny; }
        if (cd.dir.includes("s")) { h = Math.max(min, Math.min(maxH - y, h + dy)); }
      }
      onCropChange({ x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) });
    };
    const up = () => {
      cropDrag.current = null;
      document.removeEventListener("mousemove", mv);
      document.removeEventListener("mouseup", up);
    };
    document.addEventListener("mousemove", mv);
    document.addEventListener("mouseup", up);
  };

  // ----- Background dragging -----
  const bgDrag = useRef<{ start: BackgroundLayer; mx: number; my: number } | null>(null);
  const beginBg = (e: React.MouseEvent) => {
    if (!artboard?.background) return;
    e.preventDefault();
    e.stopPropagation();
    bgDrag.current = { start: { ...artboard.background }, mx: e.clientX, my: e.clientY };
    const mv = (ev: MouseEvent) => {
      const bd = bgDrag.current;
      if (!bd) return;
      const dx = (ev.clientX - bd.mx) / zoomRef.current;
      const dy = (ev.clientY - bd.my) / zoomRef.current;
      onBackgroundChange({ ...bd.start, offsetX: bd.start.offsetX + dx, offsetY: bd.start.offsetY + dy });
    };
    const up = () => {
      bgDrag.current = null;
      document.removeEventListener("mousemove", mv);
      document.removeEventListener("mouseup", up);
    };
    document.addEventListener("mousemove", mv);
    document.addEventListener("mouseup", up);
  };

  // ----- Background corner resize (uniform scale, opposite corner anchored) -----
  const beginBgResize = (e: React.MouseEvent, corner: "nw" | "ne" | "sw" | "se") => {
    if (!artboard?.background) return;
    e.preventDefault();
    e.stopPropagation();
    const start = { ...artboard.background };
    const startW = start.naturalWidth * start.scale;
    const startH = start.naturalHeight * start.scale;
    const mx = e.clientX, my = e.clientY;
    const mv = (ev: MouseEvent) => {
      const dx = (ev.clientX - mx) / zoomRef.current;
      const width = corner.includes("e") ? startW + dx : startW - dx;
      const scale = Math.max(0.05, width / start.naturalWidth);
      const nW = start.naturalWidth * scale;
      const nH = start.naturalHeight * scale;
      let offsetX = start.offsetX;
      let offsetY = start.offsetY;
      if (corner.includes("w")) offsetX = start.offsetX + startW - nW; // right edge anchored
      if (corner.includes("n")) offsetY = start.offsetY + startH - nH; // bottom edge anchored
      onBackgroundChange({ ...start, scale, offsetX, offsetY });
    };
    const up = () => {
      document.removeEventListener("mousemove", mv);
      document.removeEventListener("mouseup", up);
    };
    document.addEventListener("mousemove", mv);
    document.addEventListener("mouseup", up);
  };

  // ----- Empty state -----
  if (!artboard) {
    return (
      <div className="stage">
        <div className="empty">
          <div className="drop" onClick={onPickFiles} role="button" tabIndex={0}>
            <Upload size={40} strokeWidth={1.4} />
            <div style={{ fontSize: "1rem", fontWeight: 600 }}>Drop an image to begin</div>
            <div style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
              or click to browse · paste from clipboard · JPG, PNG, WebP, AVIF, HEIC, TIFF & more
            </div>
          </div>
          <div style={{ pointerEvents: "auto", textAlign: "center" }}>
            <div style={{ fontSize: "0.68rem", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
              or try an example
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
              {EXAMPLES.map((ex) => (
                <div className="example" key={ex} style={{ width: 56, height: 56 }} onClick={() => onLoadExample(ex)}>
                  <img src={`/examples/${ex}`} alt={ex} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const showVector = artboard.view === "vector" && artboard.vectorSvg;
  const parentArtboard = artboard.parentId
    ? artboards.find((ab) => ab.id === artboard.parentId)
    : null;

  return (
    <div className="stage">
      <div
        className="stage-scroll"
        ref={scrollRef}
        onMouseDown={startPan}
        onContextMenu={(e) => {
          if (!onCopyImage) return;
          e.preventDefault();
          setMenu({ x: e.clientX, y: e.clientY });
        }}
        style={{ cursor: spacePressed || tool === "move" ? "grab" : "default" }}
      >
        <div className="stage-inner">
          <div style={{ width: displayW * zoom, height: displayH * zoom }}>
            <div
              className="artboard"
              style={{
                width: displayW,
                height: displayH,
                transform: `scale(${zoom})`,
                // In normal view every layer is positioned at -crop.x/-crop.y inside a
                // crop.w x crop.h box, so anything outside the crop must be clipped.
                // In crop mode the full image is shown and the crop handles sit just
                // outside the crop box, so overflow must stay visible.
                overflow: cropMode ? "visible" : "hidden",
              }}
            >
              {/* Comparing state overlay (Compare button held down) */}
              {isComparing && (
                <img
                  className="artboard-img"
                  src={artboard.originalSrc}
                  alt="compare-before"
                  draggable={false}
                  style={{
                    position: "absolute",
                    left: cropMode ? 0 : -artboard.crop.x,
                    top: cropMode ? 0 : -artboard.crop.y,
                    width: artboard.width,
                    height: artboard.height,
                    zIndex: 100,
                  }}
                />
              )}

              {/* A. Comparison split slider view */}
              {(showComparisonSlider || isAnimatingSlider) && !isComparing ? (
                <>
                  {/* Bottom: Original image, clipped to the RIGHT of the divider so the
                      revealed (left) side shows the cut-out on the checkerboard rather
                      than the original peeking through transparent areas. */}
                  <div
                    style={{
                      position: "absolute",
                      inset: 0,
                      overflow: "hidden",
                      zIndex: 1,
                      clipPath: `inset(0 0 0 ${sliderX}%)`,
                    }}
                  >
                    <img
                      className="artboard-img"
                      src={artboard.originalSrc}
                      alt="original-bottom"
                      draggable={false}
                      style={{
                        position: "absolute",
                        left: cropMode ? 0 : -artboard.crop.x,
                        top: cropMode ? 0 : -artboard.crop.y,
                        width: artboard.width,
                        height: artboard.height,
                      }}
                    />
                  </div>
                  
                  {/* Top: Cutout (or vector) with clip-path */}
                  {showVector ? (
                    artboard.visible && (
                      <div
                        className="vector-overlay"
                        style={{
                          zIndex: 2,
                          clipPath: `inset(0 ${100 - sliderX}% 0 0)`,
                        }}
                        dangerouslySetInnerHTML={{ __html: vectorDisplaySvg ?? artboard.vectorSvg! }}
                      />
                    )
                  ) : (
                    artboard.visible && (
                      // Crop-space wrapper so the clip aligns with the divider even
                      // when the crop differs from the full image.
                      <div
                        style={{
                          position: "absolute",
                          inset: 0,
                          overflow: "hidden",
                          zIndex: 2,
                          clipPath: `inset(0 ${100 - sliderX}% 0 0)`,
                        }}
                      >
                        <img
                          className="artboard-img"
                          src={activeSrc(artboard)}
                          alt="processed-top"
                          draggable={false}
                          style={{
                            position: "absolute",
                            left: cropMode ? 0 : -artboard.crop.x,
                            top: cropMode ? 0 : -artboard.crop.y,
                            width: artboard.width,
                            height: artboard.height,
                          }}
                        />
                      </div>
                    )
                  )}

                  {/* Vertical drag divider with a wide invisible grab area */}
                  <div
                    style={{
                      position: "absolute",
                      left: `${sliderX}%`,
                      top: 0,
                      bottom: 0,
                      width: "22px",
                      transform: "translateX(-11px)",
                      cursor: "ew-resize",
                      zIndex: 12,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                    onMouseDown={startSliderDrag}
                  >
                    {/* The visible 2px line */}
                    <div style={{ position: "absolute", top: 0, bottom: 0, left: "50%", width: "2px", transform: "translateX(-1px)", background: "#fff", boxShadow: "0 0 4px rgba(0,0,0,0.5)" }} />
                    {/* Drag handle badge */}
                    <div
                      style={{
                        position: "relative",
                        width: "26px",
                        height: "26px",
                        borderRadius: "50%",
                        background: "#fff",
                        border: "2px solid var(--accent-color)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        boxShadow: "0 2px 6px rgba(0,0,0,0.35)",
                        fontSize: "11px",
                        fontWeight: "bold",
                        color: "var(--accent-color)",
                        userSelect: "none",
                      }}
                    >
                      ↔
                    </div>
                  </div>
                </>
              ) : (
                /* B. Normal rendering layers (no split slider active) */
                <>
                  {/* Blurred original backdrop (Background Effects: blur) */}
                  {artboard.blurBackground && artboard.processedSrc && !showVector && artboard.visible && (
                    <img
                      src={artboard.originalSrc}
                      alt="blur-backdrop"
                      draggable={false}
                      style={{
                        position: "absolute",
                        left: cropMode ? 0 : -artboard.crop.x,
                        top: cropMode ? 0 : -artboard.crop.y,
                        width: artboard.width,
                        height: artboard.height,
                        filter: `blur(${(artboard.blurAmount / 100) * Math.max(artboard.width, artboard.height) * 0.05}px)`,
                        zIndex: 1,
                      }}
                    />
                  )}

                  {/* Imported background, clipped to the artboard region */}
                  {artboard.background && !showVector && artboard.visible && (
                    <div className="artboard-layer" style={{ overflow: "hidden" }}>
                      <img
                        src={artboard.background.src}
                        alt="bg"
                        draggable={false}
                        style={{
                          position: "absolute",
                          left: (cropMode ? artboard.crop.x : 0) + artboard.background.offsetX,
                          top: (cropMode ? artboard.crop.y : 0) + artboard.background.offsetY,
                          width: artboard.background.naturalWidth * artboard.background.scale,
                          height: artboard.background.naturalHeight * artboard.background.scale,
                        }}
                      />
                    </div>
                  )}

                  {/* Parent image layer (if child vector is active and parent image is visible) */}
                  {showVector && parentArtboard && parentArtboard.visible && (
                    <img
                      className="artboard-img parent-img"
                      src={activeSrc(parentArtboard)}
                      alt={parentArtboard.name}
                      draggable={false}
                      style={{
                        position: "absolute",
                        left: cropMode ? 0 : -artboard.crop.x,
                        top: cropMode ? 0 : -artboard.crop.y,
                        width: artboard.width,
                        height: artboard.height,
                        opacity: 0.6,
                        zIndex: 1,
                      }}
                    />
                  )}

                  {/* The image (or vector) */}
                  {showVector ? (
                    artboard.visible && (
                      <div className="vector-overlay" style={{ zIndex: 2 }} dangerouslySetInnerHTML={{ __html: vectorDisplaySvg ?? artboard.vectorSvg! }} />
                    )
                  ) : (
                    artboard.visible && (
                      <img
                        className="artboard-img"
                        src={activeSrc(artboard)}
                        alt={artboard.name}
                        draggable={false}
                        style={{
                          left: cropMode ? 0 : -artboard.crop.x,
                          top: cropMode ? 0 : -artboard.crop.y,
                          width: artboard.width,
                          height: artboard.height,
                          zIndex: 2,
                          // Fade the cut-out while moving/resizing the background.
                          opacity: tool === "background" ? 0.35 : 1,
                          // Drop shadow (Background Effects: shadow).
                          filter: artboard.shadow && artboard.processedSrc
                            ? `drop-shadow(0 ${Math.max(artboard.width, artboard.height) * 0.015}px ${Math.max(artboard.width, artboard.height) * 0.03}px rgba(0,0,0,${Math.max(0, Math.min(1, artboard.shadowOpacity / 100))}))`
                            : undefined,
                        }}
                      />
                    )
                  )}

                  {/* Live cyan vector preview overlay */}
                  {previewSvg && !showVector && !cropMode && artboard.visible && (
                    <div className="vector-overlay" style={{ zIndex: 3 }} dangerouslySetInnerHTML={{ __html: previewSvg }} />
                  )}
                </>
              )}

              {/* Background move/resize surface */}
              {tool === "background" && artboard.background && (
                <div className="bg-drag artboard-layer" style={{ zIndex: 4 }}>
                  {/* Move surface */}
                  <div
                    style={{ position: "absolute", inset: 0, cursor: "move" }}
                    onMouseDown={beginBg}
                  />
                  {/* Outline + corner handles around the background rect (crop space) */}
                  {(() => {
                    const bg = artboard.background!;
                    const left = (cropMode ? artboard.crop.x : 0) + bg.offsetX;
                    const top = (cropMode ? artboard.crop.y : 0) + bg.offsetY;
                    const w = bg.naturalWidth * bg.scale;
                    const h = bg.naturalHeight * bg.scale;
                    const corners: Array<{ d: "nw" | "ne" | "sw" | "se"; x: number; y: number; cur: string }> = [
                      { d: "nw", x: left, y: top, cur: "nwse-resize" },
                      { d: "ne", x: left + w, y: top, cur: "nesw-resize" },
                      { d: "sw", x: left, y: top + h, cur: "nesw-resize" },
                      { d: "se", x: left + w, y: top + h, cur: "nwse-resize" },
                    ];
                    return (
                      <>
                        <div style={{ position: "absolute", left, top, width: w, height: h, border: "1.5px dashed var(--cyan)", pointerEvents: "none" }} />
                        {corners.map((c) => (
                          <div
                            key={c.d}
                            onMouseDown={(e) => beginBgResize(e, c.d)}
                            style={{
                              position: "absolute",
                              left: c.x - 6,
                              top: c.y - 6,
                              width: 12,
                              height: 12,
                              background: "var(--cyan)",
                              border: "2px solid #fff",
                              borderRadius: 2,
                              cursor: c.cur,
                            }}
                          />
                        ))}
                      </>
                    );
                  })()}
                </div>
              )}

              {/* Crop overlay */}
              {cropMode && (
                <CropOverlay
                  crop={artboard.crop}
                  imgW={artboard.width}
                  imgH={artboard.height}
                  onBeginMove={(e) => beginCrop(e, "move")}
                  onBeginHandle={beginCrop}
                />
              )}

              {/* Pending brush preview. For Restore, the original peeks back faintly in
                  the painted area; the coloured stroke shows the region either way. */}
              {isBrushingTool(tool) && pendingMaskSrc && (
                <>
                  {pendingMode === "restore" && (
                    <img
                      src={artboard.originalSrc}
                      alt="restore-preview"
                      draggable={false}
                      style={{
                        position: "absolute",
                        left: cropMode ? 0 : -artboard.crop.x,
                        top: cropMode ? 0 : -artboard.crop.y,
                        width: artboard.width,
                        height: artboard.height,
                        opacity: 0.5,
                        pointerEvents: "none",
                        zIndex: 8,
                        WebkitMaskImage: `url(${pendingMaskSrc})`,
                        maskImage: `url(${pendingMaskSrc})`,
                        WebkitMaskSize: "100% 100%",
                        maskSize: "100% 100%",
                      }}
                    />
                  )}
                  <img
                    src={pendingMaskSrc}
                    alt="brush-region"
                    draggable={false}
                    style={{
                      position: "absolute",
                      left: cropMode ? 0 : -artboard.crop.x,
                      top: cropMode ? 0 : -artboard.crop.y,
                      width: artboard.width,
                      height: artboard.height,
                      opacity: 0.35,
                      pointerEvents: "none",
                      zIndex: 9,
                    }}
                  />
                </>
              )}

              {/* Live brush stroke surface (full image, low opacity) */}
              {isBrushingTool(tool) && artboard.visible && (
                <canvas
                  ref={brushCanvasRef}
                  width={artboard.width}
                  height={artboard.height}
                  style={{
                    position: "absolute",
                    left: cropMode ? 0 : -artboard.crop.x,
                    top: cropMode ? 0 : -artboard.crop.y,
                    width: artboard.width,
                    height: artboard.height,
                    opacity: 0.5,
                    zIndex: 10,
                    cursor: "crosshair",
                    pointerEvents: "auto",
                  }}
                  onMouseDown={startBrush}
                  onMouseMove={drawBrush}
                  onMouseUp={endBrush}
                  onMouseLeave={endBrush}
                />
              )}

              {/* Circular cursor preview showing brush diameter */}
              {isBrushingTool(tool) && cursorPos && (
                <div
                  style={{
                    position: "absolute",
                    left: cursorPos.x - (cropMode ? 0 : artboard.crop.x),
                    top: cursorPos.y - (cropMode ? 0 : artboard.crop.y),
                    width: brushSize,
                    height: brushSize,
                    borderRadius: "50%",
                    border: "1px solid #fff",
                    boxShadow: "0 0 3px rgba(0,0,0,0.8)",
                    transform: "translate(-50%, -50%)",
                    pointerEvents: "none",
                    zIndex: 11,
                  }}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* View toggle (image / vector) is rendered by parent through children? kept here minimal */}

      {/* Zoom island */}
      <div className="zoom-island">
        <button title="Zoom in" onClick={() => setZoom((z) => Math.min(8, z * 1.2))}><Plus size={16} /></button>
        <div className="zoom-val">{Math.round(zoom * 100)}%</div>
        <button title="Zoom out" onClick={() => setZoom((z) => Math.max(0.05, z / 1.2))}><Minus size={16} /></button>
        <button title="Fit to view" onClick={fit} style={{ borderTop: "1px solid var(--border-main)" }}>
          <Maximize2 size={15} />
        </button>
      </div>

      {cropMode && (
        <div className="stage-tools" style={{ left: "50%", transform: "translateX(-50%)", top: 12 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 8px", fontSize: "0.74rem", color: "var(--text-secondary)" }}>
            <Scissors size={13} /> Drag the handles to set the crop bounds
          </span>
        </div>
      )}

      {menu && onCopyImage && (
        <div
          className="ctx-menu"
          style={{ left: menu.x, top: menu.y }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            className="ctx-item"
            onMouseDown={(e) => { e.stopPropagation(); onCopyImage(); setMenu(null); }}
          >
            <Copy size={13} /> Copy image
          </button>
        </div>
      )}
    </div>
  );
}

function CropOverlay({
  crop, imgW, imgH, onBeginMove, onBeginHandle,
}: {
  crop: CropRect; imgW: number; imgH: number;
  onBeginMove: (e: React.MouseEvent) => void;
  onBeginHandle: (e: React.MouseEvent, d: HandleDir) => void;
}) {
  const handles: HandleDir[] = ["nw", "ne", "sw", "se", "n", "s", "w", "e"];
  return (
    <>
      {/* Four shades around the crop box */}
      <div className="crop-shade" style={{ left: 0, top: 0, width: imgW, height: crop.y }} />
      <div className="crop-shade" style={{ left: 0, top: crop.y + crop.h, width: imgW, height: imgH - crop.y - crop.h }} />
      <div className="crop-shade" style={{ left: 0, top: crop.y, width: crop.x, height: crop.h }} />
      <div className="crop-shade" style={{ left: crop.x + crop.w, top: crop.y, width: imgW - crop.x - crop.w, height: crop.h }} />
      <div
        className="crop-box"
        style={{ left: crop.x, top: crop.y, width: crop.w, height: crop.h, cursor: "move", boxShadow: "none" }}
        onMouseDown={onBeginMove}
      >
        {handles.map((d) => (
          <div key={d} className={`crop-handle ${d}`} onMouseDown={(e) => onBeginHandle(e, d)} />
        ))}
      </div>
    </>
  );
}
