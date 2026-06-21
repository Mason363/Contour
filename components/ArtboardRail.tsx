"use client";

import React, { useEffect, useState } from "react";
import { Plus, X, Eye, EyeOff } from "lucide-react";
import type { Artboard } from "@/lib/types";
import { renderArtboardCanvas } from "@/lib/image";
import { styleSvg } from "@/lib/vectorize";

/**
 * A composite thumbnail that mirrors what the canvas actually shows for an
 * artboard: crop, imported background, background effects and the cut-out (or the
 * vector for traced boards). Recomputed only when a relevant field changes.
 */
function Thumb({ a }: { a: Artboard }) {
  const [src, setSrc] = useState<string | null>(null);

  const isVector = a.view === "vector" && !!a.vectorSvg;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (isVector) {
          const svg = styleSvg(a.vectorSvg!, "display");
          if (!cancelled) setSrc(`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`);
          return;
        }
        const canvas = await renderArtboardCanvas(a, { maxDim: 220 });
        if (!cancelled) setSrc(canvas.toDataURL("image/png"));
      } catch {
        if (!cancelled) setSrc(null);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isVector, a.processedSrc, a.originalSrc, a.vectorSvg, a.view,
    a.crop.x, a.crop.y, a.crop.w, a.crop.h, a.background,
    a.blurBackground, a.blurAmount, a.shadow, a.shadowOpacity, a.bgRemoved,
  ]);

  return (
    <img
      className="thumb-img"
      src={src ?? a.originalSrc}
      alt={a.name}
      draggable={false}
      style={{ opacity: a.visible ? 1 : 0.4 }}
    />
  );
}

export default function ArtboardRail({
  artboards,
  activeId,
  onSelect,
  onRemove,
  onAdd,
  onToggleVisible,
}: {
  artboards: Artboard[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onAdd: () => void;
  onToggleVisible: (id: string) => void;
}) {
  return (
    <div className="rail">
      <div className="rail-head">
        <span>Artboards</span>
        <span>{artboards.length}</span>
      </div>
      <div className="rail-list">
        {artboards.map((a, i) => (
          <div
            key={a.id}
            className={`thumb ${a.id === activeId ? "active" : ""}`}
            onClick={() => onSelect(a.id)}
            title={a.name}
            style={{ marginLeft: a.parentId ? 16 : 0 }}
          >
            <Thumb a={a} />
            <span className="thumb-badge">
              {a.view === "vector" && a.vectorSvg ? "VEC" : a.bgRemoved ? "BG" : i + 1}
            </span>
            <button
              className={`thumb-eye ${!a.visible ? "visible" : ""}`}
              onClick={(e) => { e.stopPropagation(); onToggleVisible(a.id); }}
              title={a.visible ? "Hide artboard" : "Show artboard"}
            >
              {a.visible ? <Eye size={12} /> : <EyeOff size={12} />}
            </button>
            <button
              className="thumb-x"
              onClick={(e) => { e.stopPropagation(); onRemove(a.id); }}
              title="Remove artboard"
            >
              <X size={12} />
            </button>
          </div>
        ))}
      </div>
      <button className="rail-add" onClick={onAdd}>
        <Plus size={18} />
        <span>Add</span>
      </button>
    </div>
  );
}
