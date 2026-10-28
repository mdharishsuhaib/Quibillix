import { chat, chatJson, primaryModel, providers, traced, type ChatMessage, type Tier } from "./llm";
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

/**
 * Run a step with timing + streamed status. Each tier already fails over across providers
 * (Nebius -> NVIDIA); if a whole tier fails, fall back to the next tier.
 * The streamed label shows the model AND provider that actually answered.
 */
async function step<T>(
  emit: Emit,
  id: StepId,
  tiers: Tier[],
  fn: (tier: Tier) => Promise<T>,
): Promise<T> {
  const t0 = Date.now();
  let lastErr: unknown;
  for (const tier of tiers) {
    const p = providers()[0];
    emit({ type: "step", step: id, status: "running", model: `${primaryModel(tier)}${p ? ` · ${p.name}` : ""}` });
    try {
      const { out, used } = await traced(() => fn(tier));
      emit({ type: "step", step: id, status: "done", model: used || primaryModel(tier), ms: Date.now() - t0 });
      return out;
    } catch (e) {
      lastErr = e;
      console.error(`[${id}] tier ${tier} failed:`, e);
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
  "admissionDate": string | null,    // inpatient stays only, ISO yyyy-mm-dd
  "dischargeDate": string | null,    // inpatient stays only, ISO yyyy-mm-dd
  "periodStart": string | null,      // billing/service period start (utilities, telecom), ISO yyyy-mm-dd
  "periodEnd": string | null,        // billing/service period end, ISO yyyy-mm-dd
  "currency": string,                // ISO code, e.g. "USD", "INR"
  "lineItems": [{ "date": string|null, "code": string|null, "description": string, "quantity": number, "unitPrice": number|null, "amount": number }],
  "statedSubtotal": number | null,   // charges before tax
  "statedTaxes": number | null,      // GST / VAT / sales tax / surcharges printed below the subtotal
  "statedAdjustments": number | null, // insurance payments, discounts, write-offs, deposits / amounts already paid, credits (positive number)
  "statedTotalDue": number | null,
  "notes": string | null
}
Rules: copy every charge line exactly as printed; one entry per printed line (do NOT merge repeated lines); fees printed below the subtotal (late fees, service charges) are ALSO line items, but taxes, insurance payments, deposits, amounts already paid, discounts and adjustments are NOT (sum those into statedAdjustments); use the printed amount even if it looks wrong; numbers must be plain numbers without currency symbols or thousands separators; quantity defaults to 1.`;

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
    admissionDate: s(raw.admissionDate),
    dischargeDate: s(raw.dischargeDate),
    periodStart: s(raw.periodStart),
    periodEnd: s(raw.periodEnd),
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
        content: `You are a billing advocate planning research. Given a bill, pick the 3-4 charges or situations most likely to be overpriced, miscoded or illegal, and write one precise web-search query for each to find (a) fair/benchmark prices (e.g. Medicare fee schedule, FAIR Health, CGHS/state rate cards, regulator tariffs) or (b) the consumer-protection rule that applies (e.g. No Surprises Act, state balance-billing laws, telecom/utility regulator rules). Include codes, the location and the year in queries. NEVER include personal data (patient/customer names, account, member, policy or claim numbers, addresses, phone numbers): queries go to a public search engine. Return ONLY JSON: {"queries": ["...", "..."]}`,
      },
      {
        role: "user",
        content: `${billForPrompt(bill)}\n\nAlready-detected rule violations: ${rules.map((r) => r.title).join("; ") || "none"}\nUser context: ${context || "none"}`,
      },
    ],
  });
  const queries = Array.isArray(data.queries) ? data.queries.filter((q): q is string => typeof q === "string").slice(0, 4) : [];
  return { queries: queries.map((q) => redactQuery(q, bill)).filter((q) => q.length > 8) };
}

/**
 * Privacy guard: Tavily is a public web search, so queries must never carry personal identifiers.
 * Strips the patient/account holder, account/member/claim numbers, emails, phone numbers and long digit runs.
 * Billing codes (CPT 99285, HCPCS A4570, HSN etc.) and years are kept since they're needed for research.
 */
export function redactQuery(q: string, bill: Pick<ParsedBill, "patientOrAccount">) {
  let out = q;
  const who = bill.patientOrAccount?.trim();
  if (who) {
    for (const part of who.split(/[\s,/#:]+/).filter((p) => p.length >= 3)) {
      out = out.replace(new RegExp(`\\b${part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi"), "");
    }
  }
  out = out
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "") // emails
    .replace(/\+?\d[\d\s().-]{8,}\d/g, (m) =>
      // keep runs of short tokens (billing codes, years, e.g. "99285 2026"); drop phone/account-like runs
      m.trim().split(/\s+/).every((t) => /^\d{1,5}$/.test(t)) ? m : " ",
    )
    .replace(/\b(account|acct|member|policy|claim|patient|mrn|uhid|ip\s*no|invoice)\s*(no\.?|number|#|id)?\s*[:#]?\s*[A-Z0-9-]{4,}\b/gi, "")
    .replace(/\b\d{7,}\b/g, "") // long numeric identifiers
    .replace(/\s{2,}/g, " ")
    .trim();
  return out;
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
Expert checklist — actively test every one of these against the bill:
- Day counts: room/nursing/monitoring/consultation days vs. the actual admission→discharge nights (discharge day is usually not billable).
- Services the user context says didn't happen (e.g. ICU, extra visits, tests).
- Severity/level codes vs. what actually happened (ER levels 99281-99285, E/M levels).
- Routine supplies, consumables, PPE, gloves, admission/registration, documentation and "service charges" that are normally bundled into room/facility fees or are non-payable/non-chargeable (e.g. IRDAI non-payable items list in India).
- Taxes applied to exempt services (e.g. healthcare services are GST-exempt in India; medical care is generally not sales-taxed in the US).
- Percentage surcharges stacked on top of other charges.
- Drug and consumable prices vs. MRP / retail / ceiling prices.
- Out-of-network or balance billing that consumer law prohibits (No Surprises Act, state laws, insurer cashless agreements).
- Third-party add-ons and "cramming" in telecom/utility bills; fees after on-time autopay/direct debit.
- Utility meter readings: ESTIMATED readings vs. an actual reading the user reports (recompute usage from the actual read), and billing-period day counts.
Output discipline:
- Output ONLY real problems. Never output a finding to say a charge is fair, normal, or within range.
- If nothing is wrong, return {"findings": [], "summary": "..."}; a clean bill is a valid answer.
- Price outliers need a strong case: commercial and self-pay prices are routinely 1.5–3× Medicare, and "above average" or "top of the range" is NOT disputable. Only flag price_outlier when the evidence shows the charge is at least 3× a cited benchmark (or above a legal ceiling/MRP/regulated cap), and state the multiple as "N×".
- If the user says the prices were quoted, agreed, contracted, chosen by them or match the MRP, do NOT flag those prices.
Rules:
- Do NOT repeat the already-detected rule findings (they are listed for context).
- Only flag what you can justify. Reference sources by their [number] from the evidence. Never invent URLs.
- estimatedOvercharge = the realistic amount that should come off the bill (≤ the line amount), in the bill's currency. Be conservative and credible: for a price outlier, it's the excess over a fair price, not the whole line. For items that merely need itemization or verification (e.g. a lump-sum "misc" line), use confidence "low" and estimatedOvercharge 0 — the letter will still request itemization.
- Check the stated taxes too: if tax is charged on exempt services or at a higher rate than applies, flag it with lineItemIds [] and the excess tax as estimatedOvercharge.
- Pick the most accurate kind (a service never provided is "not_received", not "price_outlier").
- Be concrete: cite the line id, the code, the benchmark and why.
Return ONLY JSON:
{"findings":[{"kind":"...","title":"short title","lineItemIds":["L3"],"explanation":"2-4 sentences","estimatedOvercharge":123.45,"confidence":"high|medium|low","sources":[1,3]}],
 "summary":"2-3 sentence plain-English verdict for the consumer (do NOT state a combined total — the app computes it)"}`,
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
      const amount = round(Math.max(0, Math.min(num(f.estimatedOvercharge) ?? 0, cap)));
      // The AI never "confirms" — only arithmetic does. Zero-value or low-confidence items need more info.
      const certainty: Finding["certainty"] = amount === 0 || conf === "low" ? "needs_info" : "suspected";
      return {
        id: `A${i + 1}`,
        kind,
        title: f.title!,
        lineItemIds: ids,
        explanation: f.explanation!,
        estimatedOvercharge: amount,
        confidence: conf,
        certainty,
        source: "ai" as const,
        citations: (f.sources || [])
          .map((n) => sources[Number(n) - 1])
          .filter(Boolean)
          .map((r) => ({ title: r.title, url: r.url })),
      };
    });
  return { findings: dropNoise(gatePriceOutliers(findings, context)), summary: data.summary || "" };
}

/**
 * Deterministic gate on AI price claims (the model proposes, code decides):
 * a price_outlier keeps its money claim only if it cites a retrieved source AND states a multiple
 * of at least 3× the benchmark (or invokes a hard legal ceiling: MRP, regulated cap, NPPA, rate card).
 * Anything weaker is downgraded to "needs info" with no amount (and dropped as noise if it has nothing to ask).
 */
export function gatePriceOutliers(findings: Finding[], context?: string): Finding[] {
  // The consumer's own statement that prices were agreed beats a web benchmark (unit mix-ups are common, e.g. per tablet vs per strip).
  const userAgreedPrices = /\b(quoted|agreed|contract(ed)?|as per (our )?contract|chose|match(es|ed)? (the )?(MRP|quote|price))/i.test(context || "");
  return findings.map((f) => {
    const downgrade = { ...f, estimatedOvercharge: 0, certainty: "needs_info" as const, confidence: "low" as const };
    // Missing paperwork (registration numbers, invoice details) is a request for information, not an overcharge.
    if (f.kind === "other" && /\bmissing\b.*\b(detail|number|information|registration|reg\.? no)/i.test(f.title)) return downgrade;
    if (f.kind !== "price_outlier") return f;
    if (userAgreedPrices) return downgrade;
    const text = `${f.title} ${f.explanation}`;
    const multiples = [...text.matchAll(/(\d+(?:\.\d+)?)\s*(?:[×x]\b|times\b)/gi)].map((m) => parseFloat(m[1]));
    const maxMult = multiples.length ? Math.max(...multiples) : 0;
    const legalCeiling = /\b(MRP|ceiling price|price cap|NPPA|DPCO|regulated (rate|tariff)|rate card|statutory)\b/i.test(text);
    const strong = f.citations.length > 0 && (maxMult >= 3 || legalCeiling);
    return strong ? f : downgrade;
  });
}

/** A "price outlier" with no excess isn't an issue, it's commentary. Keep zero-value items only when they request itemization/records. */
function dropNoise(findings: Finding[]) {
  return findings.filter(
    (f) => f.estimatedOvercharge > 0 || (/itemi[sz]|breakdown|records|justif|clarif|verify/i.test(`${f.title} ${f.explanation}`) && f.kind !== "price_outlier"),
  );
}

// ---------------------------------------------------------------- 6. letter
export async function writeLetter(bill: ParsedBill, findings: Finding[], totalDisputable: number, context: string | undefined, tier: Tier) {
  const { text } = await chat({
    tier,
    temperature: 0.4,
    maxTokens: 6000,
    messages: [
      {
        role: "system",
        content: `You write firm, polite, specific billing dispute letters for consumers, plus a short phone script.
Format your reply EXACTLY as:
===LETTER===
(the letter: date placeholder, addressed to the provider's billing department, account/reference line, one numbered paragraph per disputed item citing line, code, amount and reason — state CONFIRMED items as errors to be corrected, SUSPECTED items as charges to be justified or reduced, NEEDS-INFO items as requests for itemization/records — then a request for an itemized bill and a hold on collections while under review, a clear requested corrected balance, placeholders like [Your Name] where needed)
===PHONE===
(a 6-10 line script the consumer can read when calling billing, including what to ask for and what to write down)`,
      },
      {
        role: "user",
        content: `${billForPrompt(bill)}
USER CONTEXT: ${context || "none"}
DISPUTED ITEMS (total ${bill.currency} ${totalDisputable.toFixed(2)}):
${findings.map((f, i) => `${i + 1}. [${f.certainty.toUpperCase()} · ${f.kind}] ${f.title} — lines ${f.lineItemIds.join(", ") || "n/a"} — ${bill.currency} ${f.estimatedOvercharge.toFixed(2)} — ${f.explanation}`).join("\n")}`,
      },
    ],
  });
  return splitLetter(text);
}

/** Robustly split "===LETTER=== … ===PHONE=== …" (models sometimes reorder or restyle the markers). */
export function splitLetter(text: string) {
  const L = /=+\s*LETTER\s*=+/i;
  const P = /=+\s*PHONE(\s*SCRIPT)?\s*=+/i;
  const li = text.search(L);
  const pi = text.search(P);
  const strip = (s: string) => s.replace(L, "").replace(P, "").trim();
  let letter = "";
  let phoneScript = "";
  if (pi === -1) {
    letter = strip(text);
  } else if (li === -1 || li < pi) {
    letter = strip(text.slice(0, pi));
    phoneScript = strip(text.slice(pi));
  } else {
    phoneScript = strip(text.slice(pi, li));
    letter = strip(text.slice(li));
  }
  if (!letter) throw new Error("Letter step returned no letter");
  return { letter, phoneScript };
}

/**
 * Combine rule + AI findings:
 *  - drop AI findings that merely restate a deterministic one (math/duplicate/tax/day-count);
 *  - for soft rule findings (junk fees), prefer the AI's version when it covers the same line —
 *    it usually carries the user-specific reason ("despite on-time direct debit").
 */
function mergeFindings(rules: Finding[], ai: Finding[]) {
  const sameLines = (a: Finding, b: Finding) =>
    a.lineItemIds.length > 0 && a.lineItemIds.length === b.lineItemIds.length && a.lineItemIds.every((id) => b.lineItemIds.includes(id));
  const aiKept = dedupeAgainstRules(ai, rules);
  const replacedBy = (r: Finding) => aiKept.find((f) => sameLines(f, r) && f.estimatedOvercharge > 0);
  const rulesKept = rules.filter((r) => !(r.kind === "late_fee" && replacedBy(r)));
  // An AI finding that replaces a junk-fee rule keeps the rule's classification (it's still a discretionary fee).
  const aiFinal = aiKept.map((f) =>
    rules.some((r) => r.kind === "late_fee" && replacedBy(r) === f) && f.kind !== "not_received" ? { ...f, kind: "late_fee" as const } : f,
  );
  return [...rulesKept, ...aiFinal];
}

/** Drop AI findings that merely restate a deterministic rule finding (same kind, same lines). */
function dedupeAgainstRules(ai: Finding[], rules: Finding[]) {
  const RULE_KINDS = new Set(["math_error", "duplicate"]);
  return ai.filter((f) => {
    // Bill-level AI finding restating a bill-level rule finding (same amount) — e.g. "balance due exceeds reconciled amount"
    if (!f.lineItemIds.length && rules.some((r) => !r.lineItemIds.length && Math.abs(r.estimatedOvercharge - f.estimatedOvercharge) < 0.01)) return false;
    // Restating a subtotal / amount-due reconciliation the rules engine already proved
    if (/sub-?total|amount due|balance due|total due|reconcil/i.test(f.title) && rules.some((r) => !r.lineItemIds.length && r.kind === "math_error")) return false;
    const isTax = /\b(tax|gst|vat)\b/i.test(f.title);
    if (isTax && rules.some((r) => /tax/i.test(r.title))) return false;
    // Same per-day over-count already caught by the stay-length rule
    if (rules.some((r) => /days, but the stay/.test(r.title) && f.lineItemIds.some((id) => r.lineItemIds.includes(id)) && /day|night/i.test(f.title))) return false;
    if (!RULE_KINDS.has(f.kind)) return true;
    return !rules.some(
      (r) =>
        r.kind === f.kind &&
        (f.lineItemIds.length === 0
          ? r.lineItemIds.length === 0
          : f.lineItemIds.some((id) => r.lineItemIds.includes(id))),
    );
  });
}

/** Disputable total, never counting more than a line's amount across overlapping findings. */
export function disputableTotal(findings: Finding[], bill: ParsedBill) {
  return splitTotals(findings, bill).total;
}

/** Totals by certainty, with per-line caps so overlapping findings never double count. */
export function splitTotals(findings: Finding[], bill: ParsedBill) {
  const order = { confirmed: 0, suspected: 1, needs_info: 2 } as const;
  const sorted = [...findings].sort((a, b) => order[a.certainty] - order[b.certainty]);
  const lineAmount = new Map(bill.lineItems.map((li) => [li.id, li.amount]));
  const used = new Map<string, number>();
  const out = { confirmed: 0, suspected: 0, total: 0 };
  for (const f of sorted) {
    let take = f.estimatedOvercharge;
    if (f.lineItemIds.length) {
      const room = f.lineItemIds.reduce((s, id) => s + Math.max(0, (lineAmount.get(id) || 0) - (used.get(id) || 0)), 0);
      take = Math.min(take, room);
      let left = take;
      for (const id of f.lineItemIds) {
        const r = Math.max(0, (lineAmount.get(id) || 0) - (used.get(id) || 0));
        const t = Math.min(r, left);
        used.set(id, (used.get(id) || 0) + t);
        left -= t;
      }
    }
    if (f.certainty === "confirmed") out.confirmed += take;
    else if (f.certainty === "suspected") out.suspected += take;
    out.total += take;
  }
  return { confirmed: round(out.confirmed), suspected: round(out.suspected), total: round(out.total) };
}

// ---------------------------------------------------------------- orchestrator
export async function runAudit(input: AuditInput, rawEmit: Emit): Promise<AuditResult> {
  const started = Date.now();
  const models: AuditResult["models"] = {};
  const emit: Emit = (e) => {
    if (e.type === "step" && e.status === "done" && e.model) models[e.step] = e.model;
    rawEmit(e);
  };
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
      const failed = settled.filter((s) => s.status === "rejected").length;
      settled.forEach((s) => s.status === "rejected" && console.warn("[research]", s.reason));
      const nSources = evidence.reduce((s, e) => s + e.results.length, 0);
      emit({
        type: "step",
        step: "research",
        status: evidence.length ? "done" : "error",
        model: "Tavily search",
        ms: Date.now() - t1,
        detail: evidence.length
          ? `${nSources} sources${failed ? ` (${failed} search${failed > 1 ? "es" : ""} failed)` : ""}`
          : "Web research unavailable, so price findings will be marked lower confidence",
      });
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
  const findings = mergeFindings(rules, aiFindings);
  emit({ type: "findings", findings });

  const totalBilled = billTotal(bill);
  const totals = splitTotals(findings, bill);
  const totalDisputable = totals.total;

  // 6. Letter + phone script with Super — drafted for the default-approved set (everything except
  //    "needs info" items); the user reviews and can rewrite it for their own selection.
  let letter = "";
  let phoneScript = "";
  const draftSet = findings.filter((f) => f.certainty !== "needs_info");
  if (draftSet.length) {
    // Non-fatal: if every model is down for the letter, the user still gets the audit and can retry the letter.
    try {
      ({ letter, phoneScript } = await step(emit, "letter", ["mid", "fast"], (t) =>
        writeLetter(bill, draftSet, splitTotals(draftSet, bill).total, input.context, t),
      ));
    } catch {
      /* step() already emitted the error status */
    }
  } else {
    emit({ type: "step", step: "letter", status: "skipped", detail: "nothing to dispute" });
  }

  return {
    bill,
    findings,
    totalBilled,
    totalDisputable,
    confirmedTotal: totals.confirmed,
    suspectedTotal: totals.suspected,
    summary: summary || (findings.length ? "We found charges worth disputing." : "This bill looks clean — we didn't find anything worth disputing."),
    letter,
    phoneScript,
    models,
    durationMs: Date.now() - started,
  };
}
