import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30; // Only uploads + submits happen here — must be fast

const SPACE = "https://stabilityai-triposr.hf.space";

/**
 * POST /api/generate/start
 *
 * 1. Uploads the image to the TripoSR Space's /upload endpoint
 * 2. Submits a non-blocking /preprocess job → gets event_id immediately
 * 3. Returns { eventId, stage: "preprocessing" } to the client
 *
 * The client passes eventId back on each /status poll — fully stateless.
 */
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

    // ── Step 1: Upload the image to the Gradio Space ─────────────────────
    // Gradio requires files to be pre-uploaded; the returned `path` is then
    // passed as a FileData object in the predict payload.
    const uploadForm = new FormData();
    uploadForm.append("files", imageFile, imageFile.name || "upload.png");

    const uploadRes = await fetch(`${SPACE}/upload`, {
      method: "POST",
      body: uploadForm,
    });

    if (!uploadRes.ok) {
      const text = await uploadRes.text().catch(() => uploadRes.statusText);
      return NextResponse.json(
        { error: `Image upload to TripoSR failed (${uploadRes.status}): ${text}` },
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

    // ── Step 2: Submit /preprocess non-blocking ───────────────────────────
    // File inputs must be wrapped as { path } objects per the Gradio REST spec.
    const preprocessRes = await fetch(`${SPACE}/call/preprocess`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data: [
          { path: uploadedPath },   // Input Image (FileData)
          removeBackground,          // Remove Background (bool)
          foregroundRatio,           // Foreground Ratio (float)
        ],
      }),
    });

    if (!preprocessRes.ok) {
      const text = await preprocessRes.text().catch(() => preprocessRes.statusText);
      return NextResponse.json(
        { error: `Preprocess submit failed (${preprocessRes.status}): ${text}` },
        { status: 502 }
      );
    }

    const { event_id: preprocessEventId } = await preprocessRes.json();
    if (!preprocessEventId) {
      return NextResponse.json(
        { error: "Preprocess submit returned no event_id." },
        { status: 502 }
      );
    }

    // Return the event_id + the mesh resolution so /status can kick off
    // /generate once preprocessing completes (stateless — client sends it back).
    return NextResponse.json({
      eventId: preprocessEventId,
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
