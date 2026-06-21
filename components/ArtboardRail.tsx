"use client";

import React from "react";
import { Plus, X, Eye, EyeOff } from "lucide-react";
import type { Artboard } from "@/lib/types";
import { activeSrc } from "@/lib/types";

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
            <img
              className="thumb-img"
              src={activeSrc(a)}
              alt={a.name}
              draggable={false}
              style={{ opacity: a.visible ? 1 : 0.4 }}
            />
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
