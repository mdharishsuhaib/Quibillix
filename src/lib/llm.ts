/**
 * Model client for NVIDIA Nemotron (open models) over OpenAI-compatible Chat Completions.
 *
 * Provider chain, tried in order for every call:
 *   1. Nebius Token Factory  (NEBIUS_API_KEY)  - primary, the hackathon infrastructure
 *   2. NVIDIA Build / NIM API (NVIDIA_API_KEY) - automatic fallback (same Nemotron family)
 * Each call has a per-tier timeout and one retry on transient errors (429/5xx/timeout/network)
 * before failing over to the next provider, so a single slow or down endpoint can't stall an audit.
 *
 * Tiers, routed to the cheapest Nemotron that can do the job well:
 *   - vision : Nemotron 3.5 Super VL  -> read photos / screenshots of bills
 *   - fast   : Nemotron Nano          -> structured extraction from text
 *   - mid    : Nemotron Super         -> triage, research planning, letter writing
 *   - deep   : Nemotron 3 Ultra       -> the actual audit (multi-step reasoning)
 */
import { AsyncLocalStorage } from "node:async_hooks";

export type Tier = "vision" | "fast" | "mid" | "deep";

export interface Provider {
  id: "nebius" | "nvidia";
  name: string;
  baseUrl: string;
  key: string;
  models: Record<Tier, string>;
}

const env = (k: string) => (process.env[k] || "").trim();
const isNvidiaUrl = (u: string) => /nvidia\.com/i.test(u);

/** Resolve the configured providers (re-read each call so env changes apply without a code change). */
export function providers(): Provider[] {
  const out: Provider[] = [];
  const nebiusUrl = (env("NEBIUS_BASE_URL") || "https://api.tokenfactory.nebius.com/v1").replace(/\/$/, "");
  // Back-compat: an NVIDIA URL in NEBIUS_BASE_URL means that key is really an NVIDIA key.
  const legacyNvidia = isNvidiaUrl(nebiusUrl);
  if (env("NEBIUS_API_KEY") && !legacyNvidia) {
    out.push({
      id: "nebius",
      name: "Nebius Token Factory",
      baseUrl: nebiusUrl,
      key: env("NEBIUS_API_KEY"),
      models: {
        vision: env("MODEL_VISION") || "nvidia/Nemotron-3.5-Super-VL",
        fast: env("MODEL_FAST") || "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B",
        mid: env("MODEL_MID") || "nvidia/nemotron-3-super-120b-a12b",
        deep: env("MODEL_DEEP") || "nvidia/Nemotron-3-Ultra-550b-a55b",
      },
    });
  }
  const nvidiaKey = env("NVIDIA_API_KEY") || (legacyNvidia ? env("NEBIUS_API_KEY") : "");
  if (nvidiaKey) {
    const m = (k: string, legacy: string, d: string) => env(k) || (legacyNvidia ? env(legacy) : "") || d;
    out.push({
      id: "nvidia",
      name: "NVIDIA Build",
      baseUrl: (env("NVIDIA_BASE_URL") || (legacyNvidia ? nebiusUrl : "") || "https://integrate.api.nvidia.com/v1").replace(/\/$/, ""),
      key: nvidiaKey,
      models: {
        vision: m("NVIDIA_MODEL_VISION", "MODEL_VISION", "nvidia/nemotron-3.5-super-vl-120b-a12b"),
        fast: m("NVIDIA_MODEL_FAST", "MODEL_FAST", "nvidia/nemotron-3.5-lightning-30b-a3b"),
        mid: m("NVIDIA_MODEL_MID", "MODEL_MID", "nvidia/nemotron-3.5-super-vl-120b-a12b"),
        deep: m("NVIDIA_MODEL_DEEP", "MODEL_DEEP", "nvidia/nemotron-3-ultra-550b-a55b"),
      },
    });
  }
  return out;
}

export function hasModelProvider() {
  return providers().length > 0;
}

/** Model IDs of the primary provider, used for the "running" label before a call completes. */
export function primaryModel(tier: Tier) {
  return providers()[0]?.models[tier] ?? tier;
}

/** Records which provider/model actually answered inside a pipeline step. */
const trace = new AsyncLocalStorage<{ used?: string }>();
export async function traced<T>(fn: () => Promise<T>): Promise<{ out: T; used?: string }> {
  const store: { used?: string } = {};
  const out = await trace.run(store, fn);
  return { out, used: store.used };
}

type Content = string | ({ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } })[];
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: Content;
}

export interface ChatOptions {
  tier: Tier;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  json?: boolean;
}

/** Remove <think>…</think> reasoning blocks some Nemotron variants emit. */
function stripReasoning(text: string) {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/^[\s\S]*?<\/think>/i, "").trim();
}

/**
 * Nemotron 3.x models can "think" before answering. In our tests on billing audits, the
 * non-thinking mode of Ultra was ~2x faster AND more thorough, so thinking is off by default.
 * Enable it per tier with THINK_TIERS (comma-separated), e.g. THINK_TIERS=deep
 */
const THINK_TIERS = new Set((process.env.THINK_TIERS ?? "none").split(",").map((s) => s.trim()));

/** Per-attempt timeouts (ms). Override with LLM_TIMEOUT_<TIER>_MS. */
const TIMEOUT: Record<Tier, number> = {
  fast: Number(env("LLM_TIMEOUT_FAST_MS")) || 60_000,
  mid: Number(env("LLM_TIMEOUT_MID_MS")) || 90_000,
  vision: Number(env("LLM_TIMEOUT_VISION_MS")) || 90_000,
  deep: Number(env("LLM_TIMEOUT_DEEP_MS")) || 120_000,
};

class ModelError extends Error {
  constructor(message: string, readonly retryable: boolean) {
    super(message);
  }
}

async function callOnce(p: Provider, opts: ChatOptions, minimal: boolean) {
  const { tier, messages, temperature = 0.2, maxTokens = 4096, json = false } = opts;
  const thinking = THINK_TIERS.has(tier);
  const body: Record<string, unknown> = {
    model: p.models[tier],
    messages,
    temperature,
    // Reasoning tokens count against max_tokens, so leave headroom when thinking is on.
    max_tokens: thinking ? maxTokens + 8000 : maxTokens,
  };
  if (!minimal) {
    body.chat_template_kwargs = { enable_thinking: thinking };
    if (json) body.response_format = { type: "json_object" };
  }
  let res: Response;
  try {
    res = await fetch(`${p.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${p.key}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT[tier]),
    });
  } catch (e) {
    const timeout = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    throw new ModelError(`${p.name} ${timeout ? `timed out after ${TIMEOUT[tier] / 1000}s` : "network error"} (${p.models[tier]})`, true);
  }
  if (!res.ok) {
    const errText = (await res.text().catch(() => "")).slice(0, 300);
    // Some deployments reject optional params; signal the caller to retry with a minimal payload.
    if (res.status === 400 && !minimal) throw new ModelError("400-optional-params", true);
    const retryable = res.status === 408 || res.status === 429 || res.status >= 500;
    throw new ModelError(`${p.name} ${res.status} (${p.models[tier]}): ${errText}`, retryable);
  }
  const data = await res.json().catch(() => null);
  const text = stripReasoning(data?.choices?.[0]?.message?.content ?? "");
  if (!text) throw new ModelError(`Empty response from ${p.models[tier]} (finish_reason=${data?.choices?.[0]?.finish_reason})`, true);
  return text;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function chat(opts: ChatOptions) {
  const chain = providers();
  if (!chain.length) throw new Error("No model provider configured: set NEBIUS_API_KEY and/or NVIDIA_API_KEY");
  const errors: string[] = [];
  for (const p of chain) {
    let minimal = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const text = await callOnce(p, opts, minimal);
        const store = trace.getStore();
        if (store) store.used = `${p.models[opts.tier]} · ${p.name}`;
        return { text, model: p.models[opts.tier], provider: p.name };
      } catch (e) {
        const err = e instanceof ModelError ? e : new ModelError(String(e), false);
        if (err.message === "400-optional-params") {
          minimal = true;
          continue;
        }
        errors.push(err.message);
        console.warn(`[llm] ${opts.tier} attempt ${attempt + 1} on ${p.name} failed: ${err.message}`);
        // One retry on the same provider for transient errors, then fail over.
        if (!err.retryable || attempt >= 1) break;
        await sleep(1500 + Math.random() * 1000);
      }
    }
  }
  throw new Error(`All model providers failed for ${opts.tier}: ${errors.join(" | ")}`);
}

/** Extract the first JSON object from a model response (tolerates code fences / prose). */
export function parseJson<T>(text: string): T {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("Model did not return JSON");
  return JSON.parse(candidate.slice(start, end + 1)) as T;
}

/** chat() + JSON parsing with one self-repair retry. */
export async function chatJson<T>(opts: Omit<ChatOptions, "json">): Promise<{ data: T; model: string }> {
  const first = await chat({ ...opts, json: true });
  try {
    return { data: parseJson<T>(first.text), model: first.model };
  } catch {
    const retry = await chat({
      ...opts,
      json: true,
      messages: [
        ...opts.messages,
        { role: "assistant", content: first.text.slice(0, 6000) },
        { role: "user", content: "That was not valid JSON. Reply with ONLY the corrected JSON object, nothing else." },
      ],
    });
    return { data: parseJson<T>(retry.text), model: retry.model };
  }
}
