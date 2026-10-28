export type BillType = "medical" | "insurance" | "utility" | "telecom" | "other";

export interface LineItem {
  id: string;
  date?: string;
  code?: string; // CPT / HCPCS / revenue code / tariff code
  description: string;
  quantity: number;
  unitPrice?: number;
  amount: number;
}

export interface ParsedBill {
  billType: BillType;
  provider?: string;
  patientOrAccount?: string;
  payer?: string; // insurer, if any
  location?: string; // city / state / country, used for fair-price research
  statementDate?: string;
  admissionDate?: string; // inpatient stays only (ISO yyyy-mm-dd)
  dischargeDate?: string;
  periodStart?: string; // service/billing period (utilities, telecom) ISO yyyy-mm-dd
  periodEnd?: string;
  currency: string;
  lineItems: LineItem[];
  statedSubtotal?: number;
  statedTaxes?: number;
  statedAdjustments?: number;
  statedTotalDue?: number;
  notes?: string;
}

export type IssueKind =
  | "duplicate"
  | "math_error"
  | "price_outlier"
  | "upcoding"
  | "unbundling"
  | "balance_billing"
  | "not_received"
  | "late_fee"
  | "other";

/**
 * How sure we are, in plain terms:
 *  - confirmed  : provable from the bill itself (arithmetic) — this is an error, not an opinion
 *  - suspected  : likely overcharge backed by rules/benchmarks/evidence, but the provider could justify it
 *  - needs_info : can't be judged without itemization or records — we ask, we don't claim money
 */
export type Certainty = "confirmed" | "suspected" | "needs_info";

export interface Finding {
  id: string;
  kind: IssueKind;
  title: string;
  lineItemIds: string[];
  explanation: string;
  estimatedOvercharge: number;
  confidence: "high" | "medium" | "low";
  certainty: Certainty;
  source: "rule" | "ai";
  citations: { title: string; url: string }[];
}

export interface Evidence {
  query: string;
  answer?: string;
  results: { title: string; url: string; content: string }[];
}

export interface AuditResult {
  bill: ParsedBill;
  findings: Finding[];
  totalBilled: number;
  totalDisputable: number;
  confirmedTotal: number;
  suspectedTotal: number;
  summary: string;
  letter: string;
  phoneScript: string;
  models: Partial<Record<StepId, string>>;
  durationMs: number;
}

/** Events streamed (NDJSON) from /api/audit to the UI. */
export type StreamEvent =
  | { type: "step"; step: StepId; status: "running" | "done" | "skipped" | "error"; model?: string; detail?: string; ms?: number }
  | { type: "bill"; bill: ParsedBill }
  | { type: "findings"; findings: Finding[] }
  | { type: "evidence"; evidence: Evidence[] }
  | { type: "result"; result: AuditResult }
  | { type: "error"; message: string };

export type StepId = "extract" | "rules" | "triage" | "research" | "audit" | "letter";
