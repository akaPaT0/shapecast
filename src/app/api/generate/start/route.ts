import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30; // Only uploads + submits happen here — must be fast

const SPACE = "https://tencent-hunyuan3d-2.hf.space";

/**
 * POST /api/generate/start
 *
 * 1. Uploads the image to the Hunyuan3D-2 Space's /upload endpoint
 * 2. Submits the shape_generation job non-blocking -> gets event_id
 * 3. Logs HUNYUAN3D_BACKEND_RUNNING and returns the eventId to the client
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
    const sessionHash = formData.get("sessionHash") as string | null;

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

    const uploadedPaths: string[] = await uploadRes.json();
    const uploadedPath = uploadedPaths[0];
    if (!uploadedPath) {
      return NextResponse.json(
        { error: "Upload returned no file path." },
        { status: 502 }
      );
    }

    // ── Step 2: Submit job non-blocking ──────────────────────────────────
    const generateRes = await fetch(`${SPACE}/call/shape_generation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        data: [
          null,                                // Text Prompt (caption: str | null)
          { path: uploadedPath },              // Image (FileData)
          null,                                // Front (FileData | null)
          null,                                // Back (FileData | null)
          null,                                // Left (FileData | null)
          null,                                // Right (FileData | null)
          30,                                  // Inference Steps (steps: float)
          5.0,                                 // Guidance Scale (guidance_scale: float)
          1234,                                // Seed (seed: float)
          meshResolution,                      // Octree Resolution (octree_resolution: float)
          removeBackground,                    // Remove Background (check_box_rembg: bool)
          8000,                                // Number of Chunks (num_chunks: float)
          true                                 // Randomize seed (randomize_seed: bool)
        ],
        session_hash: sessionHash || undefined,
      }),
    });

    if (!generateRes.ok) {
      const text = await generateRes.text().catch(() => generateRes.statusText);
      return NextResponse.json(
        { error: `Hunyuan3D-2 shape generation submit failed (${generateRes.status}): ${text}` },
        { status: 502 }
      );
    }

    const { event_id: generateEventId } = await generateRes.json();
    if (!generateEventId) {
      return NextResponse.json(
        { error: "Hunyuan3D-2 submit returned no event_id." },
        { status: 502 }
      );
    }

    // Server-side logs
    console.log("HUNYUAN3D_BACKEND_RUNNING");
    console.log("[ShapeCast] event_id created:", generateEventId);

    return NextResponse.json({
      eventId: generateEventId,
      spaceUrl: SPACE,
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
