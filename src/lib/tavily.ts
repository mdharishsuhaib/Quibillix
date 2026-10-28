import type { Evidence } from "./types";

export function hasTavilyKey() {
  return Boolean(process.env.TAVILY_API_KEY?.trim());
}

const TIMEOUT_MS = Number(process.env.TAVILY_TIMEOUT_MS) || 25_000;

async function searchOnce(query: string, key: string, depth: "advanced" | "basic") {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ query, search_depth: depth, include_answer: true, max_results: 4 }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    const err = new Error(`Tavily ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
    (err as Error & { retryable?: boolean }).retryable = res.status === 429 || res.status >= 500;
    throw err;
  }
  return res.json();
}

/**
 * Search the live web with Tavily for fair-price benchmarks and consumer-protection rules.
 * Advanced depth first; on a timeout / 429 / 5xx, retry once with the faster "basic" depth.
 */
export async function tavilySearch(query: string): Promise<Evidence> {
  const key = process.env.TAVILY_API_KEY?.trim();
  if (!key) throw new Error("TAVILY_API_KEY is not set");
  let data;
  try {
    data = await searchOnce(query, key, "advanced");
  } catch (e) {
    const retryable = (e as { retryable?: boolean }).retryable || (e instanceof Error && /timeout|abort|fetch failed/i.test(`${e.name} ${e.message}`));
    if (!retryable) throw e;
    console.warn(`[tavily] retrying with basic depth: ${e instanceof Error ? e.message : e}`);
    data = await searchOnce(query, key, "basic");
  }
  return {
    query,
    answer: data.answer,
    results: (data.results || []).map((r: { title: string; url: string; content: string }) => ({
      title: r.title,
      url: r.url,
      content: (r.content || "").slice(0, 700),
    })),
  };
}
