"use client";

import React, { useState } from "react";
import {
  Scissors, Wand2, Eraser, ImageDown, Crop, Sparkles, Loader2,
  RotateCcw, Image as ImageIcon, Copy, Package, Download,
  AlertCircle, ChevronDown, ChevronUp
} from "lucide-react";
import type { Artboard, TraceSettings, CropRect } from "@/lib/types";
import type { Tool } from "./Canvas";
import { EXPORT_FORMATS } from "@/lib/export";

interface Props {
  artboard: Artboard | null;
  artboardCount: number;
  tool: Tool;
  setTool: (t: Tool) => void;

  livePreview: boolean;
  setLivePreview: (v: boolean) => void;

  bgBusy: boolean;
  bgProgress: number | null;
  vecBusy: boolean;
  exportBusy: boolean;

  exportFormat: string;
  setExportFormat: (f: string) => void;

  onUpdate: (patch: Partial<Artboard>) => void;
  onUpdateTrace: (patch: Partial<TraceSettings>) => void;
  onUpdateCrop: (crop: CropRect) => void;

  onRemoveBg: () => void;
  onRestoreOriginal: () => void;

  onAutoCrop: () => void;
  onResetCrop: () => void;

  onImportBackground: () => void;
  onClearBackground: () => void;

  onGenerateVectors: () => void;
  onClearVector: () => void;

  onExport: () => void;
  onCopy: () => void;
  onExportAll: () => void;

  onPickFiles: () => void;

  brushSize: number;
  setBrushSize: (s: number) => void;
  showComparisonSlider: boolean;
  setShowComparisonSlider: (s: boolean) => void;
  isComparing: boolean;
  setIsComparing: (c: boolean) => void;
  onUpdateBgRemoval: (patch: {
    bgRemovalStrength?: number;
    paintMaskSrc?: string | null;
    objectMaskSrc?: string | null;
    objectSelectionMode?: "keep" | "remove" | null;
    bgRemovalModel?: "isnet" | "isnet_fp16" | "isnet_quint8";
    bgRemovalDevice?: "cpu" | "gpu";
    bgRemovalWorker?: boolean;
  }) => void;
  onClearBrushEdits: () => void;
}

function Slider({
  label, value, min, max, step = 1, onChange,
}: {
  label: string; value: number; min: number; max: number; step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="slider">
      <div className="slider-head">
        <span className="lab">{label}</span>
        <span className="val">{value}</span>
      </div>
      <input
        className="range"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </div>
  );
}

export default function RightPanel(p: Props) {
  const a = p.artboard;
  const [isTracingExpanded, setIsTracingExpanded] = useState(false);

  if (!a) {
    return (
      <aside className="panel">
        <div className="panel-inner" style={{ minHeight: "100%", display: "flex", flexDirection: "column" }}>
          <div className="section" style={{ flex: 1 }}>
            <div className="section-head">
              <Sparkles size={16} />
              <span className="section-title">Welcome to Contour</span>
            </div>
            <p className="section-desc" style={{ margin: "0 0 14px" }}>
              Remove backgrounds and vectorize images — entirely in your browser
              via WebAssembly. Nothing is ever uploaded.
            </p>
            <button className="btn btn-primary btn-block" onClick={p.onPickFiles}>
              <ImageDown size={15} /> Import image
            </button>
          </div>

          <footer className="save-warning-footer" style={{ marginTop: "auto" }}>
            <AlertCircle size={14} style={{ color: "var(--text-muted)", flexShrink: 0, marginTop: "2px" }} />
            <div className="save-warning-text">
              Contour runs entirely in your browser. Work is not saved to a server. Leaving or refreshing this page will discard your layout.
            </div>
          </footer>

          <footer className="about-footer">
            <div className="about-author">Made with ❤️ by Mason Chen</div>
            <div className="about-links">
              <a href="https://github.com/Mason363" target="_blank" rel="noopener noreferrer" className="about-link">
                <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: "middle" }}><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path></svg>
                <span>GitHub</span>
              </a>
              <a href="https://buymeacoffee.com/masonchen" target="_blank" rel="noopener noreferrer" className="about-link">
                <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: "middle" }}><path d="M18 8h1a4 4 0 0 1 0 8h-1"></path><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"></path><line x1="6" y1="1" x2="6" y2="4"></line><line x1="10" y1="1" x2="10" y2="4"></line><line x1="14" y1="1" x2="14" y2="4"></line></svg>
                <span>Buy Me a Coffee</span>
              </a>
            </div>
          </footer>
        </div>
      </aside>
    );
  }

  const vectorReady = !!a.vectorSvg;

  return (
    <aside className="panel">
      <div className="panel-inner">
        {/* 1. Background removal — front and centre */}
        <section className="section">
          <div className="section-head">
            <Eraser size={16} />
            <span className="section-title">Background Removal</span>
            <span className="section-num">1</span>
          </div>

          {p.bgProgress !== null ? (
            <div className="progress">
              <div className="progress-bar">
                <div className="progress-fill" style={{ width: `${p.bgProgress}%` }} />
              </div>
              <div className="progress-label">
                {p.bgProgress < 100 ? `Loading model… ${p.bgProgress}%` : "Processing…"}
              </div>
            </div>
          ) : (
            <div className="stack">
              <button
                className="btn btn-primary btn-block btn-huge"
                onClick={p.onRemoveBg}
                disabled={p.bgBusy}
              >
                {p.bgBusy ? <Loader2 size={15} className="spin" /> : <Wand2 size={15} />}
                {a.bgRemoved ? "Re-run Removal" : "Remove Background"}
              </button>
              {a.bgRemoved && (
                <button className="btn btn-block" onClick={p.onRestoreOriginal}>
                  <RotateCcw size={14} /> Restore Original
                </button>
              )}
            </div>
          )}

          {/* AI Model Settings */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8, background: "var(--hover-bg)", padding: "10px 12px", borderRadius: 6, border: "1px solid var(--border-main)", marginTop: 12 }}>
            <div style={{ fontSize: "0.74rem", fontWeight: 600, color: "var(--text-main)", display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--cyan)" }} />
              AI Model Settings
            </div>
            
            <div className="field" style={{ marginBottom: 0 }}>
              <label className="field-label">Model Quality</label>
              <select
                className="select"
                value={a.bgRemovalModel || "isnet"}
                onChange={(e) => p.onUpdateBgRemoval({ bgRemovalModel: e.target.value as any })}
              >
                <option value="isnet">High Quality (44MB)</option>
                <option value="isnet_fp16">Balanced (22MB)</option>
                <option value="isnet_quint8">Fast / Quantized (11MB)</option>
              </select>
            </div>

            <div className="field" style={{ marginBottom: 0 }}>
              <label className="field-label">Device Hardware</label>
              <div className="segmented" style={{ background: "var(--active-bg)", borderRadius: 6, padding: 2 }}>
                <span
                  className={`segment ${a.bgRemovalDevice === "cpu" ? "active" : ""}`}
                  style={{ flex: 1, textAlign: "center", fontSize: "0.68rem", cursor: "pointer", padding: "4px 0", borderRadius: 4 }}
                  onClick={() => p.onUpdateBgRemoval({ bgRemovalDevice: "cpu" })}
                >
                  CPU
                </span>
                <span
                  className={`segment ${a.bgRemovalDevice === "gpu" ? "active" : ""}`}
                  style={{ flex: 1, textAlign: "center", fontSize: "0.68rem", cursor: "pointer", padding: "4px 0", borderRadius: 4 }}
                  onClick={() => p.onUpdateBgRemoval({ bgRemovalDevice: "gpu" })}
                >
                  GPU (WebGPU)
                </span>
              </div>
            </div>

            <label className="check" style={{ fontSize: "0.72rem", display: "flex", alignItems: "center", gap: 6, cursor: "pointer", marginTop: 2, marginBottom: 0 }}>
              <input
                type="checkbox"
                checked={a.bgRemovalWorker}
                onChange={(e) => p.onUpdateBgRemoval({ bgRemovalWorker: e.target.checked })}
              />
              Run in background (Web Worker)
            </label>
          </div>

          {/* Brushing & Fine Tuning Tools */}
          <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
            {/* Tool Selection */}
            <div className="field" style={{ marginBottom: 4 }}>
              <label className="field-label">Active Tool</label>
              <div className="segmented" style={{ background: "var(--active-bg)", borderRadius: 6, padding: 2 }}>
                <span
                  className={`segment ${p.tool === "move" ? "active" : ""}`}
                  style={{ flex: 1, textAlign: "center", fontSize: "0.68rem", cursor: "pointer", padding: "4px 0", borderRadius: 4 }}
                  onClick={() => p.setTool("move")}
                >
                  Move
                </span>
                <span
                  className={`segment ${p.tool === "brush-object" ? "active" : ""}`}
                  style={{ flex: 1, textAlign: "center", fontSize: "0.68rem", cursor: "pointer", padding: "4px 0", borderRadius: 4 }}
                  onClick={() => p.setTool("brush-object")}
                >
                  Select Obj
                </span>
                <span
                  className={`segment ${p.tool === "brush-include" ? "active" : ""} ${!a.bgRemoved ? "disabled" : ""}`}
                  style={{ flex: 1, textAlign: "center", fontSize: "0.68rem", cursor: a.bgRemoved ? "pointer" : "default", padding: "4px 0", borderRadius: 4, opacity: a.bgRemoved ? 1 : 0.4, pointerEvents: a.bgRemoved ? "auto" : "none" }}
                  onClick={() => a.bgRemoved && p.setTool("brush-include")}
                >
                  Restore
                </span>
                <span
                  className={`segment ${p.tool === "brush-remove" ? "active" : ""} ${!a.bgRemoved ? "disabled" : ""}`}
                  style={{ flex: 1, textAlign: "center", fontSize: "0.68rem", cursor: a.bgRemoved ? "pointer" : "default", padding: "4px 0", borderRadius: 4, opacity: a.bgRemoved ? 1 : 0.4, pointerEvents: a.bgRemoved ? "auto" : "none" }}
                  onClick={() => a.bgRemoved && p.setTool("brush-remove")}
                >
                  Erase
                </span>
              </div>
            </div>

            {/* Object Selection Mode (Only when Select Obj tool is active) */}
            {p.tool === "brush-object" && (
              <div className="field" style={{ marginBottom: 4 }}>
                <label className="field-label">Object Selection Mode</label>
                <select
                  className="select"
                  value={a.objectSelectionMode || "keep"}
                  onChange={(e) => p.onUpdateBgRemoval({ objectSelectionMode: e.target.value as any })}
                >
                  <option value="keep">Keep Selected Object</option>
                  <option value="remove">Remove Selected Object</option>
                </select>
              </div>
            )}

            {/* Brush Size Slider (Only when a brush is active) */}
            {["brush-include", "brush-remove", "brush-object"].includes(p.tool) && (
              <Slider
                label="Brush Diameter"
                value={p.brushSize}
                min={5}
                max={100}
                step={1}
                onChange={p.setBrushSize}
              />
            )}

            {/* Removal Strength Slider */}
            {a.bgRemoved && (
              <Slider
                label="Removal Strength"
                value={a.bgRemovalStrength}
                min={0}
                max={100}
                step={1}
                onChange={(v) => p.onUpdateBgRemoval({ bgRemovalStrength: v })}
              />
            )}

            {/* Clear Brush Edits */}
            {(a.paintMaskSrc || a.objectMaskSrc) && (
              <button
                className="btn btn-danger btn-block"
                onClick={p.onClearBrushEdits}
                style={{ fontSize: "0.7rem", padding: "6px 0", marginTop: 4 }}
              >
                Clear Brush Edits
              </button>
            )}

            {/* Compare Tools */}
            {a.bgRemoved && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6, borderTop: "1px solid var(--border-main)", paddingTop: 10 }}>
                <button
                  className="btn btn-secondary btn-block"
                  style={{ userSelect: "none" }}
                  onMouseDown={() => p.setIsComparing(true)}
                  onMouseUp={() => p.setIsComparing(false)}
                  onMouseLeave={() => p.setIsComparing(false)}
                  onTouchStart={() => p.setIsComparing(true)}
                  onTouchEnd={() => p.setIsComparing(false)}
                >
                  Hold to Compare Before/After
                </button>
                <label className="check" style={{ fontSize: "0.72rem", display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={p.showComparisonSlider}
                    onChange={(e) => p.setShowComparisonSlider(e.target.checked)}
                  />
                  Comparison split slider
                </label>
              </div>
            )}
          </div>

          <p className="hint" style={{ marginTop: 12 }}>
            Local AI matting (ISNet). Brush before to select an object, or after to restore/erase edges.
          </p>
        </section>

        {/* 2. Crop & bounds */}
        <section className="section">
          <div className="section-head">
            <Crop size={16} />
            <span className="section-title">Crop & Bounds</span>
            <span className="section-num">2</span>
          </div>
          <div className="stack">
            <button
              className={`btn btn-block ${p.tool === "crop" ? "btn-primary" : ""}`}
              onClick={() => p.setTool(p.tool === "crop" ? "move" : "crop")}
            >
              <Scissors size={14} /> {p.tool === "crop" ? "Finish Cropping" : "Crop Manually"}
            </button>
            <div className="btn-row">
              <button className="btn" onClick={p.onAutoCrop} title="Find the smallest rectangle containing the content">
                <Sparkles size={13} /> Auto
              </button>
              <button className="btn" onClick={p.onResetCrop}>
                <RotateCcw size={13} /> Reset
              </button>
            </div>
          </div>
          <div className="row2" style={{ marginTop: 12 }}>
            <div className="field" style={{ marginBottom: 0 }}>
              <label className="field-label">Width (px)</label>
              <input
                className="input" type="number" min={1} value={Math.round(a.crop.w)}
                onChange={(e) => {
                  const w = Math.max(1, Math.min(a.width - a.crop.x, parseInt(e.target.value) || 1));
                  p.onUpdateCrop({ ...a.crop, w });
                }}
              />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label className="field-label">Height (px)</label>
              <input
                className="input" type="number" min={1} value={Math.round(a.crop.h)}
                onChange={(e) => {
                  const h = Math.max(1, Math.min(a.height - a.crop.y, parseInt(e.target.value) || 1));
                  p.onUpdateCrop({ ...a.crop, h });
                }}
              />
            </div>
          </div>
        </section>

        {/* 3. Background image */}
        <section className="section">
          <div className="section-head">
            <ImageIcon size={16} />
            <span className="section-title">Import Background</span>
            <span className="section-num">3</span>
          </div>
          <p className="section-desc">
            Place a custom backdrop behind the cut-out. It is clipped to the crop bounds.
          </p>
          {a.background ? (
            <>
              <Slider
                label="Background zoom"
                value={Math.round(a.background.scale * 100)}
                min={10} max={400}
                onChange={(v) =>
                  p.onUpdate({ background: { ...a.background!, scale: v / 100 } })
                }
              />
              <div className="btn-row">
                <button
                  className={`btn ${p.tool === "background" ? "btn-primary" : ""}`}
                  onClick={() => p.setTool(p.tool === "background" ? "move" : "background")}
                >
                  Frame
                </button>
                <button className="btn btn-danger" onClick={p.onClearBackground}>Remove</button>
              </div>
            </>
          ) : (
            <button className="btn btn-block" onClick={p.onImportBackground}>
              <ImageDown size={14} /> Choose background image
            </button>
          )}
        </section>

        {/* 4. Vectorize */}
        <section className="section">
          <div
            className="section-head"
            style={{ cursor: "pointer", userSelect: "none" }}
            onClick={() => {
              const next = !isTracingExpanded;
              setIsTracingExpanded(next);
              p.setLivePreview(next);
            }}
          >
            <Wand2 size={16} />
            <span className="section-title">Image Tracing</span>
            <span className="section-num" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              4 {isTracingExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </span>
          </div>

          {isTracingExpanded && (
            <div className="section-content" style={{ marginTop: 12 }}>
              <p className="section-desc">
                Auto-vectorize to crisp vector paths. Previews are drawn in cyan.
              </p>

              <label className="check">
                <input
                  type="checkbox"
                  checked={a.trace.silhouette}
                  onChange={(e) => p.onUpdateTrace({ silhouette: e.target.checked })}
                />
                Silhouette tracing (backgroundless)
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={a.trace.removeBackgroundFirst}
                  onChange={(e) => p.onUpdateTrace({ removeBackgroundFirst: e.target.checked })}
                />
                Remove background before tracing
              </label>
              <label className="check" style={{ marginBottom: 6 }}>
                <input
                  type="checkbox"
                  checked={a.trace.colorGrouping}
                  onChange={(e) => p.onUpdateTrace({ colorGrouping: e.target.checked })}
                />
                Color grouping (multi-color)
              </label>

              <div style={{ height: 1, background: "var(--border-main)", margin: "8px 0 14px" }} />

              {!a.trace.silhouette && !a.trace.colorGrouping && (
                <Slider
                  label="Threshold" value={a.trace.threshold} min={0} max={255}
                  onChange={(v) => p.onUpdateTrace({ threshold: v })}
                />
              )}
              {a.trace.colorGrouping && (
                <Slider
                  label="Color Groups" value={a.trace.colorGroups} min={2} max={16} step={1}
                  onChange={(v) => p.onUpdateTrace({ colorGroups: v })}
                />
              )}
              <Slider
                label="Tolerance / Detail" value={a.trace.tolerance} min={1} max={100}
                onChange={(v) => p.onUpdateTrace({ tolerance: v })}
              />
              <Slider
                label="Corner Smoothness" value={a.trace.cornerSmoothness} min={0} max={100}
                onChange={(v) => p.onUpdateTrace({ cornerSmoothness: v })}
              />
              <Slider
                label="Path Optimization" value={a.trace.pathOptimization} min={0} max={100}
                onChange={(v) => p.onUpdateTrace({ pathOptimization: v })}
              />

              <button
                className="btn btn-ok btn-block"
                onClick={p.onGenerateVectors}
                disabled={p.vecBusy}
                style={{ marginTop: 4 }}
              >
                {p.vecBusy ? <Loader2 size={15} className="spin" /> : <Sparkles size={15} />}
                Generate Vectors
              </button>

              {vectorReady && (
                <>
                  <div className="segmented" style={{ marginTop: 12 }}>
                    <span
                      className={`segment ${a.view === "image" ? "active" : ""}`}
                      style={{ flex: 1, textAlign: "center" }}
                      onClick={() => p.onUpdate({ view: "image" })}
                    >
                      Image
                    </span>
                    <span
                      className={`segment ${a.view === "vector" ? "active" : ""}`}
                      style={{ flex: 1, textAlign: "center" }}
                      onClick={() => p.onUpdate({ view: "vector" })}
                    >
                      Vector
                    </span>
                  </div>
                  <button className="btn btn-danger btn-block" style={{ marginTop: 8 }} onClick={p.onClearVector}>
                    Clear vector
                  </button>
                </>
              )}
            </div>
          )}
        </section>

        {/* 5. Export */}
        <section className="section">
          <div className="section-head">
            <Download size={16} />
            <span className="section-title">Export</span>
            <span className="section-num">5</span>
          </div>
          <div className="field">
            <label className="field-label">Format</label>
            <select
              className="select"
              value={p.exportFormat}
              onChange={(e) => p.setExportFormat(e.target.value)}
            >
              {EXPORT_FORMATS.map((f) => (
                <option key={f.id} value={f.id}>{f.label}</option>
              ))}
            </select>
          </div>
          <p className="hint">
            Opaque formats (JPEG, BMP, PDF) fill transparent areas with white
            unless a background is imported.
          </p>
          <div className="stack">
            <button className="btn btn-primary btn-block" onClick={p.onExport} disabled={p.exportBusy}>
              {p.exportBusy ? <Loader2 size={15} className="spin" /> : <Download size={15} />}
              Export this artboard
            </button>
            <div className="btn-row">
              <button className="btn" onClick={p.onCopy}>
                <Copy size={14} /> Copy
              </button>
              <button className="btn" onClick={p.onExportAll} disabled={p.artboardCount < 1}>
                <Package size={14} /> Export all ({p.artboardCount})
              </button>
            </div>
          </div>
        </section>

        <footer className="save-warning-footer" style={{ marginTop: "auto" }}>
          <AlertCircle size={14} style={{ color: "var(--text-muted)", flexShrink: 0, marginTop: "2px" }} />
          <div className="save-warning-text">
            Contour runs entirely in your browser. Work is not saved to a server. Leaving or refreshing this page will discard your layout.
          </div>
        </footer>

        <footer className="about-footer">
          <div className="about-author">Made with ❤️ by Mason Chen</div>
          <div className="about-links">
            <a href="https://github.com/Mason363" target="_blank" rel="noopener noreferrer" className="about-link">
              <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: "middle" }}><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path></svg>
              <span>GitHub</span>
            </a>
            <a href="https://buymeacoffee.com/masonchen" target="_blank" rel="noopener noreferrer" className="about-link">
              <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: "middle" }}><path d="M18 8h1a4 4 0 0 1 0 8h-1"></path><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"></path><line x1="6" y1="1" x2="6" y2="4"></line><line x1="10" y1="1" x2="10" y2="4"></line><line x1="14" y1="1" x2="14" y2="4"></line></svg>
              <span>Buy Me a Coffee</span>
            </a>
          </div>
        </footer>
      </div>
    </aside>
  );
}
