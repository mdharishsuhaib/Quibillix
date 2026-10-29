import { connection } from "next/server";
import { runAudit, type AuditInput } from "@/lib/pipeline";
import { hasModelProvider, providers } from "@/lib/llm";
import { hasOllamaKey, tavilyKeys } from "@/lib/tavily";
import type { StreamEvent } from "@/lib/types";

export const maxDuration = 300;

// Tiny in-memory rate limiter so a public demo can't drain credits.
const hits = new Map<string, number[]>();
const LIMIT = Number(process.env.RATE_LIMIT_PER_HOUR || 20);

function rateLimited(ip: string) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < 3600_000);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > LIMIT;
}

export async function GET() {
  await connection(); // always evaluate at request time
  return Response.json({
    providers: providers().map((p) => ({ id: p.id, name: p.name, models: p.models })),
    tavily: tavilyKeys().length > 0,
    tavilyKeys: tavilyKeys().length,
    ollamaFallback: hasOllamaKey(),
  });
}

export async function POST(req: Request) {
  if (!hasModelProvider()) {
    return Response.json({ error: "Server has no model provider configured (NEBIUS_API_KEY or NVIDIA_API_KEY)" }, { status: 500 });
  }
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  if (rateLimited(ip)) {
    return Response.json({ error: "Rate limit reached — please try again in a bit." }, { status: 429 });
  }

  let input: AuditInput;
  try {
    const body = await req.json();
    input = {
      text: typeof body.text === "string" ? body.text.slice(0, 20000) : undefined,
      imageDataUrl: typeof body.imageDataUrl === "string" && body.imageDataUrl.startsWith("data:image/") ? body.imageDataUrl : undefined,
      context: typeof body.context === "string" ? body.context.slice(0, 2000) : undefined,
    };
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!input.text?.trim() && !input.imageDataUrl) {
    return Response.json({ error: "Provide bill text or an image." }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: StreamEvent) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
      try {
        const result = await runAudit(input, emit);
        emit({ type: "result", result });
      } catch (e) {
        emit({ type: "error", message: e instanceof Error ? e.message : String(e) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
