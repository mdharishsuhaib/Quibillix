import type { Finding, ParsedBill } from "./types";

const round = (n: number) => Math.round(n * 100) / 100;
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Deterministic checks. These never hallucinate, so they run before (and are
 * passed into) the Nemotron Ultra audit as hard facts.
 */
export function runRules(bill: ParsedBill): Finding[] {
  const findings: Finding[] = [];
  const items = bill.lineItems;
  let n = 0;
  const id = () => `R${++n}`;

  // 1. Line math: quantity × unit price ≠ amount
  for (const li of items) {
    if (li.unitPrice != null && li.quantity > 0) {
      const expected = round(li.unitPrice * li.quantity);
      const diff = round(li.amount - expected);
      if (diff > 0.5) {
        findings.push({
          id: id(),
          kind: "math_error",
          title: `Line total doesn't match quantity × price`,
          lineItemIds: [li.id],
          explanation: `"${li.description}" is billed at ${li.amount.toFixed(2)}, but ${li.quantity} × ${li.unitPrice.toFixed(2)} = ${expected.toFixed(2)}.`,
          estimatedOvercharge: diff,
          confidence: "high",
          source: "rule",
          citations: [],
        });
      }
    }
  }

  // 2. Exact / near-exact duplicates (same code or description, same date, same amount)
  const seen = new Map<string, string>();
  for (const li of items) {
    const key = `${li.code ? norm(li.code) : norm(li.description)}|${li.date || ""}|${li.amount.toFixed(2)}`;
    const prev = seen.get(key);
    if (prev) {
      findings.push({
        id: id(),
        kind: "duplicate",
        title: `Possible duplicate charge`,
        lineItemIds: [prev, li.id],
        explanation: `"${li.description}"${li.code ? ` (${li.code})` : ""} appears more than once${li.date ? ` on ${li.date}` : ""} for the same amount (${li.amount.toFixed(2)}). Ask the provider to confirm it was delivered twice or remove it.`,
        estimatedOvercharge: li.amount,
        confidence: "medium",
        source: "rule",
        citations: [],
      });
    } else seen.set(key, li.id);
  }

  // 3. Subtotal check
  const sum = round(items.reduce((s, li) => s + li.amount, 0));
  if (bill.statedSubtotal != null && round(bill.statedSubtotal - sum) > 0.5) {
    findings.push({
      id: id(),
      kind: "math_error",
      title: `Subtotal is higher than the sum of the line items`,
      lineItemIds: [],
      explanation: `The line items add up to ${sum.toFixed(2)}, but the bill states a subtotal of ${bill.statedSubtotal.toFixed(2)}.`,
      estimatedOvercharge: round(bill.statedSubtotal - sum),
      confidence: "high",
      source: "rule",
      citations: [],
    });
  }

  // 4. Total due check (subtotal - adjustments)
  if (bill.statedTotalDue != null) {
    // Fees printed below the subtotal are sometimes extracted as line items, so use whichever is larger.
    const base = Math.max(bill.statedSubtotal ?? 0, sum);
    const taxes = bill.statedTaxes ?? 0;
    const adj = bill.statedAdjustments ?? 0;
    const expected = round(base + taxes - adj);
    const diff = round(bill.statedTotalDue - expected);
    if (diff > 0.5) {
      findings.push({
        id: id(),
        kind: "math_error",
        title: `Amount due doesn't reconcile`,
        lineItemIds: [],
        explanation: `Charges ${base.toFixed(2)}${taxes ? ` + taxes ${taxes.toFixed(2)}` : ""} − adjustments/payments ${adj.toFixed(2)} = ${expected.toFixed(2)}, but the bill asks for ${bill.statedTotalDue.toFixed(2)}.`,
        estimatedOvercharge: diff,
        confidence: "high",
        source: "rule",
        citations: [],
      });
    }
  }

  // 5. Fees worth challenging
  for (const li of items) {
    if (/late\s*(payment\s*)?(fee|charge)|penalty|admin(istrative)?\s*fee|convenience\s*fee|paper\s*(bill|statement)\s*fee/i.test(li.description)) {
      findings.push({
        id: id(),
        kind: "late_fee",
        title: `Discretionary fee — often waived on request`,
        lineItemIds: [li.id],
        explanation: `"${li.description}" (${li.amount.toFixed(2)}) is a discretionary fee. Providers routinely waive these, especially if the underlying bill is in dispute.`,
        estimatedOvercharge: li.amount,
        confidence: "medium",
        source: "rule",
        citations: [],
      });
    }
  }

  return findings;
}

export function billTotal(bill: ParsedBill) {
  return round(bill.lineItems.reduce((s, li) => s + li.amount, 0));
}
