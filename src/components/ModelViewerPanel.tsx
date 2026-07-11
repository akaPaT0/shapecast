"use client";

import React from "react";

interface ModelViewerProps {
  glbUrl: string;
  objUrl?: string | null;
}

export default function ModelViewerPanel({ glbUrl, objUrl }: ModelViewerProps) {
  return (
    <div className="mt-8 space-y-4">
      {/* 3-D viewport */}
      <div
        className="relative w-full rounded-xl overflow-hidden border border-navy-border cyan-glow"
        style={{ height: "420px", background: "#0d1520" }}
      >
        {/* Blueprint corner decorations */}
        <span className="absolute top-0 left-0 w-5 h-5 border-t-2 border-l-2 border-cyan-accent opacity-60 z-10" />
        <span className="absolute top-0 right-0 w-5 h-5 border-t-2 border-r-2 border-cyan-accent opacity-60 z-10" />
        <span className="absolute bottom-0 left-0 w-5 h-5 border-b-2 border-l-2 border-cyan-accent opacity-60 z-10" />
        <span className="absolute bottom-0 right-0 w-5 h-5 border-b-2 border-r-2 border-cyan-accent opacity-60 z-10" />


        <model-viewer
          src={glbUrl}
          alt="Generated 3D model"
          camera-controls=""
          auto-rotate=""
          shadow-intensity="0.6"
          exposure="0.9"
          style={{ width: "100%", height: "100%" }}
        />
      </div>

      {/* Download buttons */}
      <div className="flex flex-wrap gap-3">
        <a
          href={glbUrl}
          download="model.glb"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg border border-cyan-accent text-cyan-accent
                     font-mono text-sm font-medium hover:bg-cyan-glow transition-colors"
        >
          <DownloadIcon />
          Download GLB
        </a>

        {objUrl && (
          <a
            href={objUrl}
            download="model.obj"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg border border-navy-border text-slate-400
                       font-mono text-sm font-medium hover:border-cyan-accent hover:text-cyan-accent transition-colors"
          >
            <DownloadIcon />
            Download OBJ
          </a>
        )}
      </div>
    </div>
  );
}

function DownloadIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}
