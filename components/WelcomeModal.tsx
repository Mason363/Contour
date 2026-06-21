"use client";

import React, { useState } from "react";
import { ArrowUpRight } from "lucide-react";

/**
 * First-run welcome dialog (styled after Planar's). Appears once; dismissal is
 * remembered in localStorage when "Don't show again" is checked.
 */
export default function WelcomeModal({
  theme,
  onClose,
}: {
  theme: "light" | "dark";
  onClose: (dontShowAgain: boolean) => void;
}) {
  const [dontShow, setDontShow] = useState(true);
  const icon = theme === "light" ? "/favicon-black.png" : "/favicon-white.png";

  return (
    <div className="welcome-overlay" onMouseDown={() => onClose(dontShow)}>
      <div
        className="welcome-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="welcome-brand">
          <img src={icon} alt="Contour" width={34} height={34} />
          <span className="badge-pill">100% local</span>
        </div>

        <h2 className="welcome-title" id="welcome-title">Welcome to Contour</h2>

        <p className="welcome-body">
          Contour helps you <u>remove backgrounds</u>, <u>refine</u> cut-outs with magic
          brushes, and <u>vectorize</u> images — entirely in your browser.
        </p>
        <p className="welcome-body">
          Erase or restore anything by brushing, tune the cut-out, blur or shadow the
          background, then export anywhere. Every pixel is processed on your device —
          nothing is ever uploaded.
        </p>

        <a
          className="welcome-planar"
          href="https://github.com/Mason363/Planar"
          target="_blank"
          rel="noreferrer"
        >
          <span>
            Check out <strong>Planar</strong> — scale, crop &amp; arrange images onto
            sheets of paper for easy printing.
          </span>
          <ArrowUpRight size={15} />
        </a>

        <div className="welcome-divider" />

        <div className="welcome-foot">
          <label className="check" style={{ padding: 0, margin: 0 }}>
            <input
              type="checkbox"
              checked={dontShow}
              onChange={(e) => setDontShow(e.target.checked)}
            />
            Don&apos;t show again
          </label>
          <button className="btn btn-primary welcome-ok" onClick={() => onClose(dontShow)}>
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
