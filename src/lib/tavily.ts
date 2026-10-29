import type { Evidence } from "./types";

/**
 * Live web research for fair-price benchmarks and consumer-protection rules.
 * Chain, tried in order for every query until one answers:
 *   1. Tavily, primary key   (TAVILY_API_KEY)
 *   2. Tavily, backup key    (TAVILY_API_KEY_2)  - when key 1 is out of credits, rate-limited or erroring
 *   3. Ollama web search     (OLLAMA_API_KEY)    - when every Tavily key has failed
 * A key that is out of credits or rejected is skipped for a while, so later queries don't waste a round trip on it.
 * Queries are already stripped of personal identifiers before they reach here (pipeline.ts).
 */

export type SearchEngine = "Tavily" | "Ollama";

/** All configured Tavily keys, primary first. */
export function tavilyKeys(): { name: string; key: string }[] {
  return ["TAVILY_API_KEY", "TAVILY_API_KEY_2"]
    .map((name) => ({ name, key: (process.env[name] || "").trim() }))
    .filter((k) => k.key);
}
export function hasTavilyKey() {
  return tavilyKeys().length > 0;
}
export function hasOllamaKey() {
  return Boolean(process.env.OLLAMA_API_KEY?.trim());
}
export function hasSearchKey() {
  return hasTavilyKey() || hasOllamaKey();
}

const TIMEOUT_MS = Number(process.env.TAVILY_TIMEOUT_MS) || 25_000;
const OLLAMA_TIMEOUT_MS = Number(process.env.OLLAMA_TIMEOUT_MS) || 25_000;

/** Keys that are out of credits (432), rate-limited (429) or rejected (401/403) are rested for this long. */
const COOLDOWN_MS = 10 * 60_000;
const restingUntil = new Map<string, number>();
const isResting = (name: string) => (restingUntil.get(name) ?? 0) > Date.now();

type SearchError = Error & { retryable?: boolean; status?: number };

async function tavilyOnce(query: string, key: string, depth: "advanced" | "basic") {
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ query, search_depth: depth, include_answer: true, max_results: 4 }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    const err: SearchError = new Error(`Tavily ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
    err.status = res.status;
    err.retryable = res.status === 429 || res.status >= 500;
    throw err;
  }
  return res.json();
}

/** One Tavily key: advanced depth first; on a timeout / 429 / 5xx, retry once with the faster "basic" depth. */
export async function tavilySearch(query: string, key = tavilyKeys()[0]?.key): Promise<Evidence> {
  if (!key) throw new Error("TAVILY_API_KEY is not set");
  let data;
  try {
    data = await tavilyOnce(query, key, "advanced");
  } catch (e) {
    const retryable = (e as SearchError).retryable || (e instanceof Error && /timeout|abort|fetch failed/i.test(`${e.name} ${e.message}`));
    if (!retryable) throw e;
    console.warn(`[tavily] retrying with basic depth: ${e instanceof Error ? e.message : e}`);
    data = await tavilyOnce(query, key, "basic");
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

/** Ollama web search (https://docs.ollama.com/capabilities/web-search). Returns results only, no summary answer. */
export async function ollamaSearch(query: string): Promise<Evidence> {
  const key = process.env.OLLAMA_API_KEY?.trim();
  if (!key) throw new Error("OLLAMA_API_KEY is not set");
  const res = await fetch("https://ollama.com/api/web_search", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ query, max_results: 4 }),
    signal: AbortSignal.timeout(OLLAMA_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
  const data = await res.json();
  return {
    query,
    results: (data.results || []).map((r: { title: string; url: string; content: string }) => ({
      title: r.title,
      url: r.url,
      content: (r.content || "").slice(0, 700),
    })),
  };
}

/**
 * Tavily key 1 -> Tavily key 2 -> Ollama. The first engine that answers wins.
 * `backupKey` is true when a Tavily key other than the primary answered.
 */
export async function webSearch(query: string): Promise<Evidence & { engine: SearchEngine; backupKey?: boolean }> {
  const errors: string[] = [];
  const keys = tavilyKeys();
  // Rested keys go last rather than being dropped, in case every key is resting.
  const ordered = [...keys.filter((k) => !isResting(k.name)), ...keys.filter((k) => isResting(k.name))];
  for (const k of ordered) {
    try {
      const out = await tavilySearch(query, k.key);
      restingUntil.delete(k.name);
      return { ...out, engine: "Tavily", backupKey: k.name !== keys[0].name };
    } catch (e) {
      const status = (e as SearchError).status;
      if (status && [401, 403, 429, 432].includes(status)) restingUntil.set(k.name, Date.now() + COOLDOWN_MS);
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${k.name}: ${msg}`);
      console.warn(`[research] ${k.name} failed, trying the next engine: ${msg}`);
    }
  }
  if (hasOllamaKey()) return { ...(await ollamaSearch(query)), engine: "Ollama" };
  throw new Error(errors.join(" | ") || "No web search key set");
}
