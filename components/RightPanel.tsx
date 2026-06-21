"use client";

import React from "react";
import {
  Scissors, Wand2, Eraser, ImageDown, Crop, Sparkles, Loader2,
  RotateCcw, Image as ImageIcon, Copy, Package, Download,
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

  if (!a) {
    return (
      <aside className="panel">
        <div className="panel-inner">
          <div className="section">
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
                className="btn btn-primary btn-block"
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
          <p className="hint" style={{ marginTop: 10 }}>
            Local AI matting (ISNet). The first run downloads the model once.
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
          <div className="section-head">
            <Wand2 size={16} />
            <span className="section-title">Image Tracing</span>
            <span className="section-num">4</span>
          </div>
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
              checked={p.livePreview}
              onChange={(e) => p.setLivePreview(e.target.checked)}
            />
            Live cyan preview
          </label>

          <div style={{ height: 1, background: "var(--border-main)", margin: "8px 0 14px" }} />

          {!a.trace.silhouette && (
            <Slider
              label="Threshold" value={a.trace.threshold} min={0} max={255}
              onChange={(v) => p.onUpdateTrace({ threshold: v })}
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
      </div>
    </aside>
  );
}
