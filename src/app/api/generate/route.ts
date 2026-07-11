import { NextRequest, NextResponse } from "next/server";
import { Client } from "@gradio/client";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Extract a usable URL or path string from whatever the Gradio API returns
 * for a file output. Different versions/spaces return different shapes.
 */
function extractUrl(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    const v = value as Record<string, unknown>;
    if (typeof v.url === "string") return v.url;
    if (typeof v.path === "string") return v.path;
    if (typeof v.name === "string") return v.name;
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();

    const imageFile = formData.get("image") as File | null;
    if (!imageFile) {
      return NextResponse.json({ error: "No image provided." }, { status: 400 });
    }

    const removeBackground = formData.get("removeBackground") === "true";
    const foregroundRatio = parseFloat(
      (formData.get("foregroundRatio") as string) ?? "0.85"
    );
    const meshResolution = parseInt(
      (formData.get("meshResolution") as string) ?? "256",
      10
    );

    // File already extends Blob — pass it directly so the filename is preserved.
    // Re-wrapping via arrayBuffer() + new Blob() would drop the filename, which
    // some Gradio upload paths check.

    // ── Connect to the free TripoSR Gradio Space ──────────────────────────
    const client = await Client.connect("stabilityai/TripoSR");

    // ── Step 1: preprocess (background removal + crop) ────────────────────
    const preprocessResult = await client.predict("/preprocess", [
      imageFile,
      removeBackground,
      foregroundRatio,
    ]);

    const processedImage = (preprocessResult as { data: unknown[] }).data[0];
    if (!processedImage) {
      return NextResponse.json(
        { error: "Preprocessing returned no image. The Space may be busy — try again." },
        { status: 502 }
      );
    }

    // ── Step 2: generate mesh ─────────────────────────────────────────────
    const generateResult = await client.predict("/generate", [
      processedImage,
      meshResolution,
    ]);

    const data = (generateResult as { data: unknown[] }).data;
    // data[0] = OBJ file, data[1] = GLB file  (order per TripoSR app.py)
    const objUrl = extractUrl(data[0]);
    const glbUrl = extractUrl(data[1]);

    if (!glbUrl && !objUrl) {
      return NextResponse.json(
        {
          error:
            "The 3D generation step returned no files. The free Space may be " +
            "sleeping or at capacity — wait a minute and try again.",
        },
        { status: 502 }
      );
    }

    return NextResponse.json({ glbUrl, objUrl });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[ShapeCast /api/generate]", message);
    return NextResponse.json(
      {
        error:
          "Failed to generate 3D model: " +
          message +
          ". The free Hugging Face Space may be asleep — please retry.",
      },
      { status: 502 }
    );
  }
}
