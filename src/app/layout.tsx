import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ShapeCast — Photo to 3D Model",
  description:
    "Upload a photo and get a downloadable 3D model in seconds. Powered by TripoSR on Hugging Face.",
  keywords: ["3D model", "photo to 3D", "TripoSR", "GLB", "OBJ", "ShapeCast"],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        {/* model-viewer web component — must be loaded as a module */}
        <script
          type="module"
          src="https://cdn.jsdelivr.net/npm/@google/model-viewer@3.5.0/dist/model-viewer.min.js"
          async
        />
      </head>
      <body className="blueprint-bg min-h-screen antialiased">{children}</body>
    </html>
  );
}
