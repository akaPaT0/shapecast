"use client";

import React, { useState } from "react";
import ImageDropzone from "@/components/ImageDropzone";
import StatusLog from "@/components/StatusLog";
import ModelViewerPanel from "@/components/ModelViewerPanel";

interface GenerateResult {
  glbUrl: string | null;
  objUrl: string | null;
}

export default function Home() {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [removeBackground, setRemoveBackground] = useState(true);
  const [foregroundRatio, setForegroundRatio] = useState(0.85);
  const [meshResolution, setMeshResolution] = useState(256);

  const [isLoading, setIsLoading] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerateResult | null>(null);

  const addLog = (msg: string) => setLogs((prev) => [...prev, msg]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!imageFile) return;

    setIsLoading(true);
    setError(null);
    setResult(null);
    setLogs([]);

    try {
      addLog("Connecting to TripoSR on Hugging Face…");

      const fd = new FormData();
      fd.append("image", imageFile);
      fd.append("removeBackground", String(removeBackground));
      fd.append("foregroundRatio", String(foregroundRatio));
      fd.append("meshResolution", String(meshResolution));

      // Stagger log messages to reflect real pipeline stages
      const preprocessTimer = setTimeout(
        () => addLog("Preprocessing image — removing background…"),
        1200
      );
      const generateTimer = setTimeout(
        () =>
          addLog(
            "Generating 3D mesh — free queue may take 30–120 s, please wait…"
          ),
        4000
      );
      const waitTimer = setTimeout(
        () => addLog("Still working — mesh resolution " + meshResolution + " vertices…"),
        30000
      );
      const longTimer = setTimeout(
        () => addLog("Almost there — finalising geometry…"),
        70000
      );

      const res = await fetch("/api/generate", {
        method: "POST",
        body: fd,
      });

      clearTimeout(preprocessTimer);
      clearTimeout(generateTimer);
      clearTimeout(waitTimer);
      clearTimeout(longTimer);

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error ?? "Unknown server error.");
      }

      addLog("✓ Generation complete!");
      setResult({ glbUrl: json.glbUrl, objUrl: json.objUrl });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      addLog("✗ Error: " + msg);
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const canSubmit = !!imageFile && !isLoading;

  return (
    <div className="min-h-screen flex flex-col">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="border-b border-navy-border bg-[#0d1520]/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-5 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <HexLogo />
            <div>
              <h1 className="font-grotesk font-bold text-lg text-white leading-none tracking-tight">
                Shape<span className="text-cyan-accent">Cast</span>
              </h1>
              <p className="font-mono text-[10px] text-slate-500 tracking-widest uppercase mt-0.5">
                Photo → 3D Model
              </p>
            </div>
          </div>
          <div className="hidden sm:flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse-slow" />
            <span className="font-mono text-xs text-slate-400">TripoSR · free tier</span>
          </div>
        </div>
      </header>

      {/* ── Main ───────────────────────────────────────────────────────── */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-5 py-10">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-10 items-start">
          {/* ── Left column — upload + result ── */}
          <div>
            <SectionLabel text="01 / Upload" />
            <form onSubmit={handleSubmit} className="space-y-6 mt-3">
              <ImageDropzone onFileSelected={setImageFile} disabled={isLoading} />

              {/* ── Options ── */}
              <SectionLabel text="02 / Options" />

              {/* Remove background */}
              <div className="flex items-center justify-between rounded-lg border border-navy-border bg-[#0d1520] px-4 py-3">
                <div>
                  <p className="font-mono text-sm text-slate-200">Remove background</p>
                  <p className="font-mono text-xs text-slate-500 mt-0.5">
                    Auto-crop subject with rembg
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={removeBackground}
                  onClick={() => setRemoveBackground((v) => !v)}
                  disabled={isLoading}
                  className={[
                    "relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors duration-200",
                    removeBackground ? "bg-cyan-accent" : "bg-navy-border",
                    isLoading ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
                  ].join(" ")}
                >
                  <span
                    className={[
                      "inline-block h-5 w-5 rounded-full bg-navy-DEFAULT shadow transform transition-transform duration-200 mt-0.5",
                      removeBackground ? "translate-x-5" : "translate-x-0.5",
                    ].join(" ")}
                  />
                </button>
              </div>

              {/* Foreground ratio */}
              <SliderField
                label="Foreground ratio"
                hint={`${foregroundRatio.toFixed(2)} — larger = more of frame filled`}
                min={0.5}
                max={1.0}
                step={0.01}
                value={foregroundRatio}
                onChange={setForegroundRatio}
                disabled={isLoading || !removeBackground}
              />

              {/* Mesh resolution */}
              <SliderField
                label="Mesh resolution"
                hint={`${meshResolution} — higher = more detail, slower`}
                min={32}
                max={320}
                step={32}
                value={meshResolution}
                onChange={setMeshResolution}
                disabled={isLoading}
              />

              {/* Submit */}
              <button
                type="submit"
                disabled={!canSubmit}
                className={[
                  "w-full py-3.5 rounded-xl font-grotesk font-semibold text-base tracking-wide transition-all duration-200",
                  canSubmit
                    ? "bg-cyan-accent text-navy-DEFAULT hover:brightness-110 cyan-glow"
                    : "bg-navy-border text-slate-500 cursor-not-allowed",
                ].join(" ")}
              >
                {isLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <Spinner />
                    Generating…
                  </span>
                ) : (
                  "Generate 3D Model →"
                )}
              </button>
            </form>

            {/* Status log */}
            <StatusLog messages={logs} isRunning={isLoading} />

            {/* Error */}
            {error && !isLoading && (
              <div className="mt-4 rounded-lg border border-red-900 bg-red-950/40 px-4 py-3">
                <p className="font-mono text-xs text-red-400">{error}</p>
              </div>
            )}

            {/* 3-D viewer */}
            {result?.glbUrl && (
              <ModelViewerPanel glbUrl={result.glbUrl} objUrl={result.objUrl} />
            )}
          </div>

          {/* ── Right column — how it works ── */}
          <aside className="hidden lg:block space-y-5 sticky top-24">
            <SectionLabel text="How it works" />
            <div className="space-y-3 mt-3">
              {HOW_IT_WORKS.map((step, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-navy-border bg-[#0d1520] p-4 flex gap-3"
                >
                  <span className="font-mono text-cyan-accent text-sm shrink-0 mt-0.5">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <p className="font-mono text-sm text-slate-200 leading-snug">{step.title}</p>
                    <p className="font-mono text-xs text-slate-500 mt-1 leading-relaxed">{step.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-lg border border-navy-border bg-[#0d1520] p-4 mt-4">
              <p className="font-mono text-[10px] text-slate-500 leading-relaxed">
                ⚡ Powered by{" "}
                <span className="text-cyan-accent">stabilityai/TripoSR</span> on Hugging Face.
                <br />
                Free-tier cold starts can take 30–120 s.
                <br />
                Best results: single object, plain or white background.
              </p>
            </div>
          </aside>
        </div>
      </main>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer className="border-t border-navy-border py-5">
        <p className="text-center font-mono text-[11px] text-slate-600">
          ShapeCast · free infrastructure · no file stored on our servers
        </p>
      </footer>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionLabel({ text }: { text: string }) {
  return (
    <p className="font-mono text-[11px] text-cyan-accent tracking-[0.15em] uppercase mb-2">
      {text}
    </p>
  );
}

interface SliderFieldProps {
  label: string;
  hint: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}

function SliderField({ label, hint, min, max, step, value, onChange, disabled }: SliderFieldProps) {
  return (
    <div
      className={[
        "rounded-lg border border-navy-border bg-[#0d1520] px-4 py-3 space-y-2",
        disabled ? "opacity-40" : "",
      ].join(" ")}
    >
      <div className="flex items-center justify-between">
        <label className="font-mono text-sm text-slate-200">{label}</label>
        <span className="font-mono text-xs text-cyan-accent">{hint.split(" — ")[0]}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        disabled={disabled}
        className="w-full"
      />
      <p className="font-mono text-[11px] text-slate-500">{hint.split(" — ")[1]}</p>
    </div>
  );
}

function Spinner() {
  return (
    <svg
      className="animate-spin h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v8H4z"
      />
    </svg>
  );
}

function HexLogo() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <polygon
        points="16,2 28,9 28,23 16,30 4,23 4,9"
        stroke="#7fe7e0"
        strokeWidth="1.5"
        fill="rgba(127,231,224,0.06)"
      />
      <polygon
        points="16,8 22,11.5 22,18.5 16,22 10,18.5 10,11.5"
        fill="#7fe7e0"
        opacity="0.35"
      />
    </svg>
  );
}

const HOW_IT_WORKS = [
  {
    title: "Upload your photo",
    desc: "Choose any image with a clearly visible object. Simpler backgrounds work best.",
  },
  {
    title: "Background removal",
    desc: "rembg isolates the subject so TripoSR reconstructs only the object.",
  },
  {
    title: "3D reconstruction",
    desc: "Stability AI's TripoSR infers a full 3D mesh from a single image in under 2 minutes.",
  },
  {
    title: "Download & use",
    desc: "Grab the GLB (for game engines / AR) or the OBJ (for Blender / CAD).",
  },
];
