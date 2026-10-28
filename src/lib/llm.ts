/**
 * Thin client for Nebius Token Factory (OpenAI-compatible Chat Completions API).
 * Fairbill routes each step of its pipeline to the cheapest NVIDIA Nemotron model
 * that can do the job well:
 *   - vision : Nemotron 3.5 Super VL  -> read photos / screenshots of bills
 *   - fast   : Nemotron 3 Nano        -> structured extraction from text
 *   - mid    : Nemotron 3 Super       -> triage, research planning, letter writing
 *   - deep   : Nemotron 3 Ultra       -> the actual audit (multi-step reasoning)
 */

export type Tier = "vision" | "fast" | "mid" | "deep";

const BASE_URL = (process.env.NEBIUS_BASE_URL || "https://api.tokenfactory.nebius.com/v1").replace(/\/$/, "");

export const MODELS: Record<Tier, string> = {
  vision: process.env.MODEL_VISION || "nvidia/Nemotron-3.5-Super-VL",
  fast: process.env.MODEL_FAST || "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B",
  mid: process.env.MODEL_MID || "nvidia/nemotron-3-super-120b-a12b",
  deep: process.env.MODEL_DEEP || "nvidia/Nemotron-3-Ultra-550b-a55b",
};

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

export function hasNebiusKey() {
  return Boolean(process.env.NEBIUS_API_KEY);
}

/** Remove <think>…</think> reasoning blocks some Nemotron variants emit. */
function stripReasoning(text: string) {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/^[\s\S]*?<\/think>/i, "").trim();
}

export async function chat({ tier, messages, temperature = 0.2, maxTokens = 4096, json = false }: ChatOptions) {
  const key = process.env.NEBIUS_API_KEY;
  if (!key) throw new Error("NEBIUS_API_KEY is not set");

  const body: Record<string, unknown> = {
    model: MODELS[tier],
    messages,
    temperature,
    max_tokens: maxTokens,
  };
  if (json) body.response_format = { type: "json_object" };

  const call = async (payload: Record<string, unknown>) =>
    fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify(payload),
    });

  let res = await call(body);
  // Some models reject response_format; retry once without it.
  if (!res.ok && json && res.status === 400) {
    delete body.response_format;
    res = await call(body);
  }
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Token Factory ${res.status} (${MODELS[tier]}): ${errText.slice(0, 300)}`);
  }
  const data = await res.json();
  const msg = data?.choices?.[0]?.message;
  const text: string = msg?.content ?? "";
  return { text: stripReasoning(text), model: MODELS[tier], usage: data?.usage };
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
