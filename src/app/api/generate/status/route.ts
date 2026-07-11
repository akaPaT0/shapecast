import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const maxDuration = 20; // Just a quick status check — must be fast

const SPACE = "https://stabilityai-triposr.hf.space";

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
      // Surface non-JSON/non-200 responses as a clear error instead of
      // letting the caller try to parse a crash page as JSON.
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
 * Prefers .url (absolute), falls back to constructing from .path.
 */
function extractUrl(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    const v = value as Record<string, unknown>;
    if (typeof v.url === "string" && v.url) return v.url;
    if (typeof v.path === "string" && v.path) {
      // path is a server-relative path; prepend the Space base URL
      return `${SPACE}/file=${v.path}`;
    }
  }
  return null;
}

/**
 * GET /api/generate/status?eventId=...&stage=...&meshResolution=...
 *
 * Stateless poll endpoint. The client sends back whatever the previous
 * /start or /status response returned:
 *   - eventId      — the Gradio event_id for the current stage
 *   - stage        — "preprocessing" | "generating"
 *   - meshResolution — needed to kick off /generate after preprocessing
 *
 * Responses:
 *   { done: false, stage: "...", message: "..." }       — still running
 *   { done: false, stage: "generating", eventId: "..." } — just transitioned
 *   { done: true, glbUrl: "...", objUrl: "..." }         — finished
 *   { error: "..." }                                     — something went wrong
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

    const apiName = stage === "preprocessing" ? "preprocess" : "generate";
    const result = await pollGradioSse(apiName, eventId);

    if (result.status === "error") {
      return NextResponse.json({ error: result.message }, { status: 502 });
    }

    if (result.status === "pending") {
      const messages: Record<string, string> = {
        preprocessing: "Preprocessing image — removing background…",
        generating: "Generating 3D mesh — this takes 30–120 s on the free tier…",
      };
      return NextResponse.json({ done: false, stage, message: messages[stage] });
    }

    // ── complete ──────────────────────────────────────────────────────────
    if (stage === "preprocessing") {
      // data[0] = processed image (FileData object)
      const processedImage = result.data[0];
      if (!processedImage) {
        return NextResponse.json(
          { error: "Preprocessing returned no image. The Space may be busy — please retry." },
          { status: 502 }
        );
      }

      // Submit /generate non-blocking with the processed image FileData
      const generateRes = await fetch(`${SPACE}/call/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: [
            processedImage,    // Processed Image (FileData, passed through as-is)
            meshResolution,    // Marching Cubes Resolution (float)
          ],
        }),
      });

      if (!generateRes.ok) {
        const text = await generateRes.text().catch(() => generateRes.statusText);
        return NextResponse.json(
          { error: `Generate submit failed (${generateRes.status}): ${text}` },
          { status: 502 }
        );
      }

      const { event_id: generateEventId } = await generateRes.json();
      if (!generateEventId) {
        return NextResponse.json(
          { error: "Generate submit returned no event_id." },
          { status: 502 }
        );
      }

      return NextResponse.json({
        done: false,
        stage: "generating",
        eventId: generateEventId,
        meshResolution,
        message: "Preprocessing complete — 3D generation queued…",
      });
    }

    // stage === "generating"
    // data[0] = OBJ (FileData), data[1] = GLB (FileData)
    const objUrl = extractUrl(result.data[0]);
    const glbUrl = extractUrl(result.data[1]);

    if (!glbUrl && !objUrl) {
      return NextResponse.json(
        {
          error:
            "Generation returned no files. The free Space may be at capacity — wait a minute and retry.",
        },
        { status: 502 }
      );
    }

    return NextResponse.json({ done: true, glbUrl, objUrl });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[ShapeCast /api/generate/status]", message);
    return NextResponse.json(
      { error: `Status check failed: ${message}` },
      { status: 502 }
    );
  }
}
