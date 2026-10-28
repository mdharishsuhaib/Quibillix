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

export interface Finding {
  id: string;
  kind: IssueKind;
  title: string;
  lineItemIds: string[];
  explanation: string;
  estimatedOvercharge: number;
  confidence: "high" | "medium" | "low";
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
  summary: string;
  letter: string;
  phoneScript: string;
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
