// Unit tests for deterministic guards (no network). Usage: npm test
import { gatePriceOutliers, redactQuery, splitTotals } from "../src/lib/pipeline";
import { runRules } from "../src/lib/rules";
import type { Finding, ParsedBill } from "../src/lib/types";

let fail = 0;
const check = (ok: boolean, name: string, extra = "") => {
  if (!ok) fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? `  ${extra}` : ""}`);
};

// ---- price gate
const base: Finding = { id: "A1", kind: "price_outlier", title: "", lineItemIds: ["L1"], explanation: "", estimatedOvercharge: 100, confidence: "medium", certainty: "suspected", source: "ai", citations: [{ title: "x", url: "https://x" }] };
const gate = (p: Partial<Finding>) => gatePriceOutliers([{ ...base, ...p }])[0];
check(gate({ explanation: "Charged at 1.8× Medicare" }).estimatedOvercharge === 0, "price gate: 1.8× is downgraded");
check(gate({ explanation: "Charged at 1.8× Medicare" }).certainty === "needs_info", "price gate: weak claim becomes needs_info");
check(gate({ explanation: "billed ~9x the Medicare rate" }).estimatedOvercharge === 100, "price gate: 9× keeps its claim");
check(gate({ explanation: "price exceeds the MRP printed on the strip" }).estimatedOvercharge === 100, "price gate: legal ceiling (MRP) keeps its claim");
check(gate({ explanation: "10× benchmark", citations: [] }).estimatedOvercharge === 0, "price gate: uncited claim is downgraded");
check(gatePriceOutliers([{ ...base, kind: "upcoding", explanation: "1.2x" }])[0].estimatedOvercharge === 100, "price gate: only applies to price_outlier");
check(gatePriceOutliers([{ ...base, explanation: "15× NPPA ceiling price" }], "Prices match the MRP printed on the strips.")[0].estimatedOvercharge === 0, "price gate: user-confirmed MRP overrides benchmark");
check(gatePriceOutliers([{ ...base, kind: "other", title: "Missing mandatory VAT invoice details" }])[0].certainty === "needs_info", "gate: missing paperwork → needs_info");
check(gatePriceOutliers([{ ...base, kind: "other", title: "Tax charged on exempt services" }])[0].estimatedOvercharge === 100, "gate: real 'other' findings untouched");

// ---- rules engine arithmetic
const bill: ParsedBill = {
  billType: "medical", currency: "USD",
  lineItems: [
    { id: "L1", description: "CBC", quantity: 2, unitPrice: 48, amount: 126 },
    { id: "L2", description: "CMP", code: "80053", date: "08/01", quantity: 1, unitPrice: 95, amount: 95 },
    { id: "L3", description: "CMP", code: "80053", date: "08/01", quantity: 1, unitPrice: 95, amount: 95 },
  ],
  statedSubtotal: 316, statedAdjustments: 100, statedTotalDue: 246,
};
const rules = runRules(bill);
const mathL1 = rules.find((r) => r.kind === "math_error" && r.lineItemIds[0] === "L1");
check(mathL1?.estimatedOvercharge === 30 && mathL1.certainty === "confirmed", "rules: 2×48≠126 → confirmed 30");
check(rules.some((r) => r.kind === "duplicate" && r.estimatedOvercharge === 95), "rules: duplicate CMP → 95");
const due = rules.find((r) => /Amount due/.test(r.title));
check(due?.estimatedOvercharge === 30, "rules: amount due 246 vs 216 → 30", String(due?.estimatedOvercharge));

// ---- totals never double count
const t = splitTotals(
  [
    { ...base, id: "a", lineItemIds: ["L1"], estimatedOvercharge: 126, certainty: "suspected" },
    { ...base, id: "b", lineItemIds: ["L1"], estimatedOvercharge: 30, certainty: "confirmed" },
  ],
  bill,
);
check(t.total === 126 && t.confirmed === 30 && t.suspected === 96, "totals: overlapping findings capped at line amount", JSON.stringify(t));

// ---- privacy
check(!/Avery|401773/.test(redactQuery("Jordan Avery acct 88-401773 CPT 99285 2026", { patientOrAccount: "Jordan Avery" })), "redact: name + account stripped");
check(/99285 2026/.test(redactQuery("CPT 99285 2026 fee", { patientOrAccount: undefined })), "redact: codes + year kept");

console.log(fail ? `\n✘ ${fail} failed` : "\n✔ all unit tests passed");
process.exit(fail ? 1 : 0);
