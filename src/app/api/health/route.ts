import { connection } from "next/server";
import { providers } from "@/lib/llm";
import { hasTavilyKey } from "@/lib/tavily";

export const maxDuration = 60;

interface Check {
  name: string;
  ok: boolean;
  ms: number;
  detail?: string;
}

// Cache results briefly so status badges / uptime monitors don't burn credits.
let cache: { at: number; body: unknown } | null = null;
const TTL_MS = 60_000;

async function timed(name: string, fn: () => Promise<string | void>): Promise<Check> {
  const t0 = Date.now();
  try {
    const detail = await fn();
    return { name, ok: true, ms: Date.now() - t0, detail: detail || undefined };
  } catch (e) {
    return { name, ok: false, ms: Date.now() - t0, detail: e instanceof Error ? e.message.slice(0, 200) : String(e) };
  }
}

/**
 * Live health check: pings every configured model provider (smallest Nemotron, 1 token) and Tavily.
 * GET /api/health -> { status: "ok" | "degraded" | "down", checks: [...] }
 * Point an uptime monitor (e.g. UptimeRobot) at this URL for 24/7 monitoring.
 */
export async function GET(req: Request) {
  await connection();
  const fresh = new URL(req.url).searchParams.has("fresh");
  if (!fresh && cache && Date.now() - cache.at < TTL_MS) return Response.json(cache.body);

  const checks = await Promise.all([
    ...providers().map((p) =>
      timed(`${p.name} (${p.models.fast})`, async () => {
        const res = await fetch(`${p.baseUrl}/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${p.key}` },
          body: JSON.stringify({ model: p.models.fast, messages: [{ role: "user", content: "Reply OK" }], max_tokens: 5, chat_template_kwargs: { enable_thinking: false } }),
          signal: AbortSignal.timeout(20_000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 120)}`);
      }),
    ),
    hasTavilyKey()
      ? timed("Tavily search", async () => {
          const res = await fetch("https://api.tavily.com/search", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.TAVILY_API_KEY!.trim()}` },
            body: JSON.stringify({ query: "Medicare physician fee schedule", search_depth: "basic", max_results: 1 }),
            signal: AbortSignal.timeout(20_000),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
        })
      : Promise.resolve<Check>({ name: "Tavily search", ok: false, ms: 0, detail: "TAVILY_API_KEY not set" }),
  ]);

  const models = checks.slice(0, -1);
  const tavily = checks[checks.length - 1];
  // Audits still work if at least one model provider is up; Tavily down only lowers confidence.
  const status = !models.some((c) => c.ok) ? "down" : models.every((c) => c.ok) && tavily.ok ? "ok" : "degraded";
  const body = {
    status,
    primary: providers()[0]?.name ?? null,
    checkedAt: new Date().toISOString(),
    checks,
  };
  cache = { at: Date.now(), body };
  return Response.json(body, { status: status === "down" ? 503 : 200 });
}
