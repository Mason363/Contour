"use client";

import React from "react";
import { Plus, X } from "lucide-react";
import type { Artboard } from "@/lib/types";
import { activeSrc } from "@/lib/types";

export default function ArtboardRail({
  artboards,
  activeId,
  onSelect,
  onRemove,
  onAdd,
}: {
  artboards: Artboard[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onAdd: () => void;
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
          >
            <img className="thumb-img" src={activeSrc(a)} alt={a.name} draggable={false} />
            <span className="thumb-badge">
              {a.view === "vector" && a.vectorSvg ? "VEC" : a.bgRemoved ? "BG" : i + 1}
            </span>
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
