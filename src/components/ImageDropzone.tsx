"use client";

import React, { useCallback, useState } from "react";

interface ImageDropzoneProps {
  onFileSelected: (file: File) => void;
  disabled?: boolean;
}

export default function ImageDropzone({ onFileSelected, disabled }: ImageDropzoneProps) {
  const [preview, setPreview] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith("image/")) return;
      const reader = new FileReader();
      reader.onload = (e) => setPreview(e.target?.result as string);
      reader.readAsDataURL(file);
      onFileSelected(file);
    },
    [onFileSelected]
  );

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  return (
    <label
      htmlFor="image-input"
      className={[
        "relative flex flex-col items-center justify-center w-full rounded-xl border-2 border-dashed cursor-pointer",
        "transition-colors duration-200",
        isDragging
          ? "border-cyan-accent bg-cyan-glow"
          : "border-navy-border bg-[#0d1520] hover:border-cyan-dim",
        disabled ? "opacity-50 pointer-events-none" : "",
      ].join(" ")}
      style={{ minHeight: "200px" }}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={onDrop}
    >
      <input
        id="image-input"
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={onInputChange}
        disabled={disabled}
      />

      {preview ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={preview}
          alt="Preview"
          className="max-h-48 max-w-full rounded-lg object-contain p-2"
        />
      ) : (
        <div className="flex flex-col items-center gap-3 p-8 text-center">
          <UploadIcon />
          <p className="font-mono text-sm text-slate-400">
            Drop an image here or{" "}
            <span className="text-cyan-accent underline underline-offset-2">browse</span>
          </p>
          <p className="font-mono text-xs text-slate-500">PNG, JPG, WEBP — single object works best</p>
        </div>
      )}

      {/* Replace hint overlay when preview exists */}
      {preview && (
        <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity rounded-xl bg-navy-DEFAULT/70">
          <span className="font-mono text-xs text-cyan-accent">Click to replace</span>
        </div>
      )}
    </label>
  );
}

function UploadIcon() {
  return (
    <svg
      width="36"
      height="36"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#7fe7e0"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="opacity-60"
    >
      <polyline points="16 16 12 12 8 16" />
      <line x1="12" y1="12" x2="12" y2="21" />
      <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
    </svg>
  );
}
