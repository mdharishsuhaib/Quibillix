import type { Evidence } from "./types";

export function hasTavilyKey() {
  return Boolean(process.env.TAVILY_API_KEY);
}

/** Search the live web with Tavily for fair-price benchmarks and consumer-protection rules. */
export async function tavilySearch(query: string): Promise<Evidence> {
  const key = process.env.TAVILY_API_KEY;
  if (!key) throw new Error("TAVILY_API_KEY is not set");
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      query,
      search_depth: "advanced",
      include_answer: true,
      max_results: 4,
    }),
  });
  if (!res.ok) throw new Error(`Tavily ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
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
