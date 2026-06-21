"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Plus, Minus, Maximize2, Upload, Scissors } from "lucide-react";
import type { Artboard, CropRect, BackgroundLayer } from "@/lib/types";
import { activeSrc } from "@/lib/types";

export type Tool = "move" | "crop" | "background";

interface Props {
  artboard: Artboard | null;
  tool: Tool;
  previewSvg: string | null;
  vectorDisplaySvg: string | null;
  onCropChange: (crop: CropRect) => void;
  onBackgroundChange: (bg: BackgroundLayer) => void;
  onPickFiles: () => void;
  onLoadExample: (file: string) => void;
}

const EXAMPLES = ["bird.jpg", "dog.jpg", "lotus.jpg", "trees.jpg", "canyon.jpg"];

type HandleDir = "nw" | "ne" | "sw" | "se" | "n" | "s" | "w" | "e";

export default function Canvas({
  artboard,
  tool,
  previewSvg,
  vectorDisplaySvg,
  onCropChange,
  onBackgroundChange,
  onPickFiles,
  onLoadExample,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const zoomRef = useRef(zoom);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);

  const [spacePressed, setSpacePressed] = useState(false);
  const pan = useRef({ active: false, x: 0, y: 0, sl: 0, st: 0 });
  const pendingScroll = useRef<{ left: number; top: number } | null>(null);

  const cropMode = tool === "crop" && !!artboard;
  // In crop mode the full image is shown; otherwise the cropped region.
  const displayW = artboard ? (cropMode ? artboard.width : artboard.crop.w) : 1;
  const displayH = artboard ? (cropMode ? artboard.height : artboard.crop.h) : 1;

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

  return (
    <div className="stage">
      <div
        className="stage-scroll"
        ref={scrollRef}
        onMouseDown={startPan}
        style={{ cursor: spacePressed || tool === "move" ? "grab" : "default" }}
      >
        <div className="stage-inner">
          <div style={{ width: displayW * zoom, height: displayH * zoom }}>
            <div
              className="artboard"
              style={{ width: displayW, height: displayH, transform: `scale(${zoom})` }}
            >
              {/* Imported background, clipped to the artboard region */}
              {artboard.background && !showVector && (
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

              {/* The image (or vector) */}
              {showVector ? (
                <div className="vector-overlay" dangerouslySetInnerHTML={{ __html: vectorDisplaySvg ?? artboard.vectorSvg! }} />
              ) : (
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
                  }}
                />
              )}

              {/* Live cyan vector preview overlay */}
              {previewSvg && !showVector && !cropMode && (
                <div className="vector-overlay" dangerouslySetInnerHTML={{ __html: previewSvg }} />
              )}

              {/* Background drag surface */}
              {tool === "background" && artboard.background && (
                <div
                  className="bg-drag artboard-layer"
                  style={{ cursor: "move", zIndex: 4 }}
                  onMouseDown={beginBg}
                />
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
