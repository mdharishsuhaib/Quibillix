import { chat, chatJson, MODELS, type ChatMessage, type Tier } from "./llm";
import { hasTavilyKey, tavilySearch } from "./tavily";
import { billTotal, runRules } from "./rules";
import type { AuditResult, Evidence, Finding, IssueKind, ParsedBill, StepId, StreamEvent } from "./types";

export interface AuditInput {
  text?: string;
  imageDataUrl?: string;
  context?: string; // user's own notes, e.g. "I was only in the ER for 2 hours, I have Aetna"
}

type Emit = (e: StreamEvent) => void;

const ISSUE_KINDS: IssueKind[] = [
  "duplicate", "math_error", "price_outlier", "upcoding", "unbundling",
  "balance_billing", "not_received", "late_fee", "other",
];

const round = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown): number | undefined => {
  if (typeof v === "number" && isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(/[^0-9.\-]/g, ""));
    return isFinite(n) ? n : undefined;
  }
  return undefined;
};

/** Run a step with timing + streamed status. Falls back to a cheaper/other tier if the model errors. */
async function step<T>(
  emit: Emit,
  id: StepId,
  tiers: Tier[],
  fn: (tier: Tier) => Promise<T>,
): Promise<T> {
  const t0 = Date.now();
  let lastErr: unknown;
  for (const tier of tiers) {
    emit({ type: "step", step: id, status: "running", model: MODELS[tier] });
    try {
      const out = await fn(tier);
      emit({ type: "step", step: id, status: "done", model: MODELS[tier], ms: Date.now() - t0 });
      return out;
    } catch (e) {
      lastErr = e;
      console.error(`[${id}] ${MODELS[tier]} failed:`, e);
    }
  }
  emit({ type: "step", step: id, status: "error", detail: String(lastErr instanceof Error ? lastErr.message : lastErr) });
  throw lastErr;
}

// ---------------------------------------------------------------- 1. extract
const EXTRACT_SYSTEM = `You convert bills (medical, hospital, insurance EOB, utility, telecom) into structured JSON.
Return ONLY a JSON object with this exact shape:
{
  "billType": "medical" | "insurance" | "utility" | "telecom" | "other",
  "provider": string | null,
  "patientOrAccount": string | null,
  "payer": string | null,            // insurer name if shown
  "location": string | null,         // city/state/country of the provider if shown
  "statementDate": string | null,
  "currency": string,                // ISO code, e.g. "USD", "INR"
  "lineItems": [{ "date": string|null, "code": string|null, "description": string, "quantity": number, "unitPrice": number|null, "amount": number }],
  "statedSubtotal": number | null,   // charges before tax
  "statedTaxes": number | null,      // GST / VAT / sales tax / surcharges printed below the subtotal
  "statedAdjustments": number | null, // insurance payments, discounts, write-offs (positive number)
  "statedTotalDue": number | null,
  "notes": string | null
}
Rules: copy every charge line exactly as printed; one entry per printed line (do NOT merge repeated lines); fees printed below the subtotal (late fees, service charges) are ALSO line items, but taxes, insurance payments, discounts and adjustments are NOT; use the printed amount even if it looks wrong; numbers must be plain numbers without currency symbols or thousands separators; quantity defaults to 1.`;

async function extract(input: AuditInput, tier: Tier): Promise<ParsedBill> {
  const userContent: ChatMessage["content"] = input.imageDataUrl
    ? [
        { type: "text", text: "Extract this bill into the JSON schema." + (input.text ? `\nAdditional text from the user:\n${input.text}` : "") },
        { type: "image_url", image_url: { url: input.imageDataUrl } },
      ]
    : `Extract this bill into the JSON schema.\n\n---\n${input.text}\n---`;

  const { data } = await chatJson<Record<string, unknown>>({
    tier,
    temperature: 0,
    maxTokens: 6000,
    messages: [
      { role: "system", content: EXTRACT_SYSTEM },
      { role: "user", content: userContent },
    ],
  });
  return normalizeBill(data);
}

function normalizeBill(raw: Record<string, unknown>): ParsedBill {
  const items = Array.isArray(raw.lineItems) ? raw.lineItems : [];
  const s = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
  const bt = s(raw.billType) as ParsedBill["billType"] | undefined;
  return {
    billType: bt && ["medical", "insurance", "utility", "telecom", "other"].includes(bt) ? bt : "other",
    provider: s(raw.provider),
    patientOrAccount: s(raw.patientOrAccount),
    payer: s(raw.payer),
    location: s(raw.location),
    statementDate: s(raw.statementDate),
    currency: s(raw.currency) || "USD",
    lineItems: items
      .map((li: Record<string, unknown>, i: number) => ({
        id: `L${i + 1}`,
        date: s(li.date),
        code: s(li.code),
        description: s(li.description) || "(no description)",
        quantity: num(li.quantity) || 1,
        unitPrice: num(li.unitPrice),
        amount: num(li.amount) ?? 0,
      }))
      .filter((li) => li.amount !== 0 || li.description !== "(no description)"),
    statedSubtotal: num(raw.statedSubtotal),
    statedTaxes: num(raw.statedTaxes),
    statedAdjustments: num(raw.statedAdjustments) != null ? Math.abs(num(raw.statedAdjustments)!) : undefined,
    statedTotalDue: num(raw.statedTotalDue),
    notes: s(raw.notes),
  };
}

function billForPrompt(bill: ParsedBill) {
  const lines = bill.lineItems
    .map((li) => `${li.id} | ${li.date ?? "-"} | ${li.code ?? "-"} | ${li.description} | qty ${li.quantity} | unit ${li.unitPrice ?? "-"} | ${li.amount.toFixed(2)}`)
    .join("\n");
  return `Bill type: ${bill.billType}
Provider: ${bill.provider ?? "unknown"} | Location: ${bill.location ?? "unknown"} | Payer/insurer: ${bill.payer ?? "none/unknown"}
Currency: ${bill.currency} | Statement date: ${bill.statementDate ?? "unknown"}
Stated subtotal: ${bill.statedSubtotal ?? "-"} | Taxes: ${bill.statedTaxes ?? "-"} | Adjustments: ${bill.statedAdjustments ?? "-"} | Total due: ${bill.statedTotalDue ?? "-"}
Notes: ${bill.notes ?? "-"}
LINE ITEMS (id | date | code | description | qty | unit | amount):
${lines}`;
}

// ---------------------------------------------------------------- 3. triage
interface Triage {
  queries: string[];
}

async function triage(bill: ParsedBill, rules: Finding[], context: string | undefined, tier: Tier): Promise<Triage> {
  const { data } = await chatJson<{ queries?: unknown }>({
    tier,
    temperature: 0.2,
    maxTokens: 1500,
    messages: [
      {
        role: "system",
        content: `You are a billing advocate planning research. Given a bill, pick the 3-4 charges or situations most likely to be overpriced, miscoded or illegal, and write one precise web-search query for each to find (a) fair/benchmark prices (e.g. Medicare fee schedule, FAIR Health, CGHS/state rate cards, regulator tariffs) or (b) the consumer-protection rule that applies (e.g. No Surprises Act, state balance-billing laws, telecom/utility regulator rules). Include codes, the location and the year in queries. Return ONLY JSON: {"queries": ["...", "..."]}`,
      },
      {
        role: "user",
        content: `${billForPrompt(bill)}\n\nAlready-detected rule violations: ${rules.map((r) => r.title).join("; ") || "none"}\nUser context: ${context || "none"}`,
      },
    ],
  });
  const queries = Array.isArray(data.queries) ? data.queries.filter((q): q is string => typeof q === "string").slice(0, 4) : [];
  return { queries };
}

// ---------------------------------------------------------------- 5. audit
interface AuditOut {
  findings?: {
    kind?: string;
    title?: string;
    lineItemIds?: string[];
    explanation?: string;
    estimatedOvercharge?: number | string;
    confidence?: string;
    sources?: number[];
  }[];
  summary?: string;
}

async function audit(
  bill: ParsedBill,
  rules: Finding[],
  evidence: Evidence[],
  context: string | undefined,
  tier: Tier,
): Promise<{ findings: Finding[]; summary: string }> {
  const sources = evidence.flatMap((e) => e.results);
  const evidenceText = evidence.length
    ? evidence
        .map((e) => {
          const header = `QUERY: ${e.query}\nSUMMARY: ${e.answer ?? "-"}`;
          const rs = e.results.map((r) => `[${sources.indexOf(r) + 1}] ${r.title} — ${r.url}\n${r.content}`).join("\n");
          return `${header}\n${rs}`;
        })
        .join("\n\n")
    : "No web evidence available. Rely on well-established billing knowledge and mark price-based findings as low confidence.";

  const { data } = await chatJson<AuditOut>({
    tier,
    temperature: 0.1,
    maxTokens: 8000,
    messages: [
      {
        role: "system",
        content: `You are a meticulous, skeptical billing auditor working for the consumer. Find charges the consumer can credibly dispute.
Issue kinds: ${ISSUE_KINDS.join(", ")}.
- price_outlier: charge far above benchmark prices found in the evidence (state the benchmark and the multiple).
- upcoding: a higher-severity code than the documented situation supports (e.g. ER level 5 for a minor visit).
- unbundling: components billed separately that should be included in a bundled/global code or room charge.
- balance_billing: billing the patient for amounts the law or the insurer contract says they shouldn't owe.
- not_received: items the user context suggests were never provided.
Rules:
- Do NOT repeat the already-detected rule findings (they are listed for context).
- Only flag what you can justify. Reference sources by their [number] from the evidence. Never invent URLs.
- estimatedOvercharge = the realistic amount that should come off the bill (≤ the line amount), in the bill's currency.
- Be concrete: cite the line id, the code, the benchmark and why.
Return ONLY JSON:
{"findings":[{"kind":"...","title":"short title","lineItemIds":["L3"],"explanation":"2-4 sentences","estimatedOvercharge":123.45,"confidence":"high|medium|low","sources":[1,3]}],
 "summary":"2-3 sentence plain-English verdict for the consumer"}`,
      },
      {
        role: "user",
        content: `${billForPrompt(bill)}

USER CONTEXT: ${context || "none"}

ALREADY-DETECTED RULE FINDINGS:
${rules.map((r) => `- ${r.title}: ${r.explanation}`).join("\n") || "none"}

EVIDENCE FROM LIVE WEB SEARCH:
${evidenceText}`,
      },
    ],
  });

  const lineAmount = new Map(bill.lineItems.map((li) => [li.id, li.amount]));
  const findings: Finding[] = (data.findings || [])
    .filter((f) => f && f.title && f.explanation)
    .map((f, i) => {
      const ids = (f.lineItemIds || []).filter((x) => lineAmount.has(x));
      const cap = ids.length ? ids.reduce((s, x) => s + (lineAmount.get(x) || 0), 0) : Infinity;
      const kind = (ISSUE_KINDS.includes(f.kind as IssueKind) ? f.kind : "other") as IssueKind;
      const conf = (["high", "medium", "low"].includes(f.confidence || "") ? f.confidence : "low") as Finding["confidence"];
      return {
        id: `A${i + 1}`,
        kind,
        title: f.title!,
        lineItemIds: ids,
        explanation: f.explanation!,
        estimatedOvercharge: round(Math.max(0, Math.min(num(f.estimatedOvercharge) ?? 0, cap))),
        confidence: conf,
        source: "ai" as const,
        citations: (f.sources || [])
          .map((n) => sources[Number(n) - 1])
          .filter(Boolean)
          .map((r) => ({ title: r.title, url: r.url })),
      };
    });
  return { findings, summary: data.summary || "" };
}

// ---------------------------------------------------------------- 6. letter
async function writeLetter(bill: ParsedBill, findings: Finding[], totalDisputable: number, context: string | undefined, tier: Tier) {
  const { text } = await chat({
    tier,
    temperature: 0.4,
    maxTokens: 3000,
    messages: [
      {
        role: "system",
        content: `You write firm, polite, specific billing dispute letters for consumers, plus a short phone script.
Format your reply EXACTLY as:
===LETTER===
(the letter: date placeholder, addressed to the provider's billing department, account/reference line, one numbered paragraph per disputed item citing line, code, amount and reason, a request for an itemized bill and a hold on collections while under review, a clear requested corrected balance, placeholders like [Your Name] where needed)
===PHONE===
(a 6-10 line script the consumer can read when calling billing, including what to ask for and what to write down)`,
      },
      {
        role: "user",
        content: `${billForPrompt(bill)}
USER CONTEXT: ${context || "none"}
DISPUTED ITEMS (total ${bill.currency} ${totalDisputable.toFixed(2)}):
${findings.map((f, i) => `${i + 1}. [${f.kind}] ${f.title} — lines ${f.lineItemIds.join(", ") || "n/a"} — ${bill.currency} ${f.estimatedOvercharge.toFixed(2)} — ${f.explanation}`).join("\n")}`,
      },
    ],
  });
  const letter = text.split("===PHONE===")[0].replace("===LETTER===", "").trim();
  const phoneScript = (text.split("===PHONE===")[1] || "").trim();
  return { letter, phoneScript };
}

/** Disputable total, never counting more than a line's amount across overlapping findings. */
function disputableTotal(findings: Finding[], bill: ParsedBill) {
  const lineAmount = new Map(bill.lineItems.map((li) => [li.id, li.amount]));
  const used = new Map<string, number>();
  let total = 0;
  for (const f of findings) {
    if (!f.lineItemIds.length) {
      total += f.estimatedOvercharge;
      continue;
    }
    const room = f.lineItemIds.reduce((s, id) => s + Math.max(0, (lineAmount.get(id) || 0) - (used.get(id) || 0)), 0);
    const take = Math.min(f.estimatedOvercharge, room);
    total += take;
    let left = take;
    for (const id of f.lineItemIds) {
      const r = Math.max(0, (lineAmount.get(id) || 0) - (used.get(id) || 0));
      const t = Math.min(r, left);
      used.set(id, (used.get(id) || 0) + t);
      left -= t;
    }
  }
  return round(total);
}

// ---------------------------------------------------------------- orchestrator
export async function runAudit(input: AuditInput, emit: Emit): Promise<AuditResult> {
  // 1. Extract — vision model for photos, Nano for text (falls back to Super).
  const bill = await step(emit, "extract", input.imageDataUrl ? ["vision"] : ["fast", "mid"], (t) => extract(input, t));
  if (!bill.lineItems.length) throw new Error("Couldn't find any line items on this bill. Try a clearer photo or paste the text.");
  emit({ type: "bill", bill });

  // 2. Deterministic rules (no model).
  const t0 = Date.now();
  emit({ type: "step", step: "rules", status: "running", model: "deterministic checks" });
  const rules = runRules(bill);
  emit({ type: "step", step: "rules", status: "done", model: "deterministic checks", ms: Date.now() - t0, detail: `${rules.length} issue(s)` });
  emit({ type: "findings", findings: rules });

  // 3 + 4. Triage with Super, then research with Tavily.
  let evidence: Evidence[] = [];
  if (hasTavilyKey()) {
    const plan = await step(emit, "triage", ["mid", "fast"], (t) => triage(bill, rules, input.context, t)).catch(() => ({ queries: [] }));
    if (plan.queries.length) {
      const t1 = Date.now();
      emit({ type: "step", step: "research", status: "running", model: "Tavily search", detail: plan.queries.join(" · ") });
      const settled = await Promise.allSettled(plan.queries.map(tavilySearch));
      evidence = settled.flatMap((s) => (s.status === "fulfilled" ? [s.value] : []));
      emit({ type: "step", step: "research", status: "done", model: "Tavily search", ms: Date.now() - t1, detail: `${evidence.reduce((s, e) => s + e.results.length, 0)} sources` });
      emit({ type: "evidence", evidence });
    } else {
      emit({ type: "step", step: "research", status: "skipped", detail: "no queries planned" });
    }
  } else {
    emit({ type: "step", step: "triage", status: "skipped", detail: "TAVILY_API_KEY not set" });
    emit({ type: "step", step: "research", status: "skipped", detail: "TAVILY_API_KEY not set" });
  }

  // 5. Deep audit with Ultra (falls back to Super if Ultra is unavailable).
  const { findings: aiFindings, summary } = await step(emit, "audit", ["deep", "mid"], (t) =>
    audit(bill, rules, evidence, input.context, t),
  );
  const findings = [...rules, ...aiFindings];
  emit({ type: "findings", findings });

  const totalBilled = billTotal(bill);
  const totalDisputable = disputableTotal(findings, bill);

  // 6. Letter + phone script with Super.
  let letter = "";
  let phoneScript = "";
  if (findings.length) {
    ({ letter, phoneScript } = await step(emit, "letter", ["mid", "fast"], (t) =>
      writeLetter(bill, findings, totalDisputable, input.context, t),
    ));
  } else {
    emit({ type: "step", step: "letter", status: "skipped", detail: "nothing to dispute" });
  }

  return {
    bill,
    findings,
    totalBilled,
    totalDisputable,
    summary: summary || (findings.length ? "We found charges worth disputing." : "This bill looks clean — we didn't find anything worth disputing."),
    letter,
    phoneScript,
  };
}
