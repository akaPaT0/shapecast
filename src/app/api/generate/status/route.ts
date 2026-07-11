import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 30; // Quick checks and transitions happen here

const SPACE = "https://tencent-hunyuan3d-2.hf.space";

/**
 * Reads ONE SSE event from the Gradio event stream without keeping the
 * connection open. We fetch the stream, read only until we get the first
 * meaningful event, then abort — so this function returns in milliseconds
 * if the job is done, or quickly if it's still running.
 *
 * Gradio SSE format per line pair:
 *   event: complete | generating | error | heartbeat | process_completed
 *   data: <json>
 */
async function pollGradioSse(
  apiName: string,
  eventId: string
): Promise<
  | { status: "complete"; data: unknown[] }
  | { status: "pending" }
  | { status: "error"; message: string }
> {
  const controller = new AbortController();
  // 8s timeout — if we don't get a complete/error in 8s the job is still running
  const timer = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(`${SPACE}/call/${apiName}/${eventId}`, {
      signal: controller.signal,
      headers: { Accept: "text/event-stream" },
    });

    if (!res.ok || !res.body) {
      clearTimeout(timer);
      const text = await res.text().catch(() => res.statusText);
      return {
        status: "error",
        message: `Lost connection to generation job (HTTP ${res.status}): ${text.slice(0, 200)}`,
      };
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let lastEvent = "";

    while (true) {
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await reader.read();
      } catch {
        // AbortError — stream timed out, job is still running
        clearTimeout(timer);
        return { status: "pending" };
      }

      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });

      // Process complete SSE lines
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith("event:")) {
          lastEvent = trimmed.replace("event:", "").trim();
        } else if (trimmed.startsWith("data:")) {
          const raw = trimmed.replace("data:", "").trim();

          if (lastEvent === "complete" || lastEvent === "process_completed") {
            clearTimeout(timer);
            reader.cancel();
            try {
              const parsed = JSON.parse(raw);
              const data = Array.isArray(parsed) ? parsed : parsed?.data ?? [];
              return { status: "complete", data };
            } catch {
              return { status: "error", message: `Could not parse completion data: ${raw}` };
            }
          }

          if (lastEvent === "error") {
            clearTimeout(timer);
            reader.cancel();
            return { status: "error", message: `Gradio error: ${raw}` };
          }
          // heartbeat / generating → keep reading
        }
      }
    }

    clearTimeout(timer);
    return { status: "pending" };
  } catch (err) {
    clearTimeout(timer);
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("abort") || msg.includes("AbortError")) {
      return { status: "pending" };
    }
    return { status: "error", message: msg };
  }
}

/**
 * Extract a usable URL string from a Gradio FileData object.
 *
 * We always construct directly from the path using the /file= endpoint
 * because the returned .url contains /call/shape/file= which 404s.
 */
function extractUrl(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "object") {
    const v = value as Record<string, unknown>;
    if (typeof v.path === "string" && v.path.length > 0) {
      const cleanPath = v.path.startsWith("/") ? v.path : `/${v.path}`;
      return `${SPACE}/file=${cleanPath}`;
    }
  }
  return null;
}

/**
 * GET /api/generate/status?eventId=...&stage=...&meshResolution=...
 *
 * Stateless poll endpoint.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const eventId = searchParams.get("eventId");
    const stage = searchParams.get("stage") as "preprocessing" | "generating" | null;
    const meshResolution = parseInt(searchParams.get("meshResolution") ?? "256", 10);

    if (!eventId || !stage) {
      return NextResponse.json(
        { error: "Missing eventId or stage query parameters." },
        { status: 400 }
      );
    }

    // ── Preprocessing Stage ────────────────────────────────────────────────
    // In our Hunyuan3D-2 adapter, the preprocessing stage is a fast mock stage.
    // We decode the base64 token from eventId and submit the Hunyuan3D-2 generation.
    if (stage === "preprocessing") {
      let tokenPayload: { path: string; removeBackground: boolean };
      try {
        const decoded = Buffer.from(eventId, "base64").toString("utf-8");
        tokenPayload = JSON.parse(decoded);
      } catch {
        return NextResponse.json({ error: "Invalid event token." }, { status: 400 });
      }

      console.log("[ShapeCast] generation request started");
      console.log("[ShapeCast] Space/API used: https://tencent-hunyuan3d-2.hf.space/call/shape_generation");

      // Submit shape_generation non-blocking
      const generateRes = await fetch(`${SPACE}/call/shape_generation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: [
            null,                                // Text Prompt (caption: str | null)
            { path: tokenPayload.path },        // Image (FileData)
            null,                                // Front (FileData | null)
            null,                                // Back (FileData | null)
            null,                                // Left (FileData | null)
            null,                                // Right (FileData | null)
            30,                                  // Inference Steps (steps: float)
            5.0,                                 // Guidance Scale (guidance_scale: float)
            1234,                                // Seed (seed: float)
            meshResolution,                      // Octree Resolution (octree_resolution: float)
            tokenPayload.removeBackground,       // Remove Background (check_box_rembg: bool)
            8000,                                // Number of Chunks (num_chunks: float)
            true                                 // Randomize seed (randomize_seed: bool)
          ],
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

      return NextResponse.json({
        done: false,
        stage: "generating",
        eventId: generateEventId,
        meshResolution,
        message: "Image preprocessed — shape generation queued…",
      });
    }

    // ── Generating Stage ───────────────────────────────────────────────────
    const result = await pollGradioSse("shape_generation", eventId);

    if (result.status === "error") {
      return NextResponse.json({ error: result.message }, { status: 502 });
    }

    if (result.status === "pending") {
      return NextResponse.json({
        done: false,
        stage: "generating",
        message: "Generating 3D mesh — this takes 30–120 s on the free tier…",
      });
    }

    // complete
    // result.data[0] = GLB file object (white_mesh.glb)
    const glbUrl = extractUrl(result.data[0]);

    if (!glbUrl) {
      return NextResponse.json(
        {
          error: "Hunyuan3D-2 generation returned no files. The Space may be at capacity.",
        },
        { status: 502 }
      );
    }

    // Logging required markers before returning
    console.log("HUNYUAN3D_BACKEND_RUNNING");
    console.log("[ShapeCast] returned file URL:", JSON.stringify(result.data[0]));
    console.log("[ShapeCast] final URL sent to frontend:", glbUrl);

    return NextResponse.json({
      done: true,
      glbUrl,
      objUrl: null, // Hunyuan3D-2 shape_generation returns glb only by default
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[ShapeCast /api/generate/status]", message);
    return NextResponse.json(
      { error: `Status check failed: ${message}` },
      { status: 502 }
    );
  }
}
