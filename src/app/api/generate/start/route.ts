import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30; // Only uploads happen here — must be fast

const SPACE = "https://tencent-hunyuan3d-2.hf.space";

/**
 * POST /api/generate/start
 *
 * 1. Uploads the image to the Hunyuan3D-2 Space's /upload endpoint
 * 2. Prepares a stateless token encoding the uploaded path and parameters
 * 3. Returns the token as `eventId` to the client for the mock "preprocessing" stage
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();

    const imageFile = formData.get("image") as File | null;
    if (!imageFile) {
      return NextResponse.json({ error: "No image provided." }, { status: 400 });
    }

    const removeBackground = formData.get("removeBackground") === "true";
    const meshResolution = parseInt(
      (formData.get("meshResolution") as string) ?? "256",
      10
    );

    // ── Step 1: Upload the image to the Hunyuan3D-2 Gradio Space ─────────
    const uploadForm = new FormData();
    uploadForm.append("files", imageFile, imageFile.name || "upload.png");

    const uploadRes = await fetch(`${SPACE}/upload`, {
      method: "POST",
      body: uploadForm,
    });

    if (!uploadRes.ok) {
      const text = await uploadRes.text().catch(() => uploadRes.statusText);
      return NextResponse.json(
        { error: `Image upload to Hunyuan3D-2 failed (${uploadRes.status}): ${text}` },
        { status: 502 }
      );
    }

    // Response is an array of uploaded file paths, e.g. ["/tmp/gradio/abc/upload.png"]
    const uploadedPaths: string[] = await uploadRes.json();
    const uploadedPath = uploadedPaths[0];
    if (!uploadedPath) {
      return NextResponse.json(
        { error: "Upload returned no file path." },
        { status: 502 }
      );
    }

    // ── Step 2: Prepare stateless base64 token ────────────────────────────
    const tokenPayload = {
      path: uploadedPath,
      removeBackground,
    };
    const eventId = Buffer.from(JSON.stringify(tokenPayload)).toString("base64");

    // Return the token as eventId + the mesh resolution. The /status route
    // will decode it and trigger the actual Hunyuan3D-2 generation on status poll.
    return NextResponse.json({
      eventId,
      stage: "preprocessing",
      meshResolution,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[ShapeCast /api/generate/start]", message);
    return NextResponse.json(
      { error: `Failed to start generation: ${message}` },
      { status: 502 }
    );
  }
}
