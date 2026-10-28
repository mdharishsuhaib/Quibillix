import type { Finding, ParsedBill } from "./types";

const round = (n: number) => Math.round(n * 100) / 100;
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/**
 * Deterministic checks. These never hallucinate, so they run before (and are
 * passed into) the Nemotron Ultra audit as hard facts.
 */
export function runRules(bill: ParsedBill): Finding[] {
  const findings: Omit<Finding, "certainty">[] = [];
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

  // 6. Per-day charges billed for more days than the stay (discharge day is normally not billable)
  const nights = stayNights(bill);
  if (nights != null && nights > 0) {
    for (const li of items) {
      if (/room|bed|ward|nursing|icu|monitor|daily|per\s*day/i.test(li.description) && li.quantity > nights && li.quantity <= nights + 3) {
        const unit = li.unitPrice ?? li.amount / li.quantity;
        const extra = round(unit * (li.quantity - nights));
        findings.push({
          id: id(),
          kind: "math_error",
          title: `Billed for ${li.quantity} days, but the stay was ${nights} night${nights === 1 ? "" : "s"}`,
          lineItemIds: [li.id],
          explanation: `Admission ${bill.admissionDate} to discharge ${bill.dischargeDate} is ${nights} night(s), but "${li.description}" is charged for ${li.quantity} day(s). The discharge day is normally not billable.`,
          estimatedOvercharge: extra,
          confidence: "medium",
          source: "rule",
          citations: [],
        });
      }
    }
  }

  // 6b. Daily charges (standing charge, per-day rental) billed for more days than the billing period
  const periodDays = inclusiveDays(bill.periodStart, bill.periodEnd);
  if (periodDays != null) {
    for (const li of items) {
      if (/standing\s*charge|\(days?\)|per\s*day|daily/i.test(li.description) && li.quantity > periodDays && li.quantity <= periodDays + 5) {
        const unit = li.unitPrice ?? li.amount / li.quantity;
        findings.push({
          id: id(),
          kind: "math_error",
          title: `Charged for ${li.quantity} days in a ${periodDays}-day billing period`,
          lineItemIds: [li.id],
          explanation: `The billing period ${bill.periodStart} – ${bill.periodEnd} has ${periodDays} days, but "${li.description}" is charged for ${li.quantity}.`,
          estimatedOvercharge: round(unit * (li.quantity - periodDays)),
          confidence: "high",
          source: "rule",
          citations: [],
        });
      }
    }
  }

  // 7. Tax on healthcare services (exempt in most countries, e.g. GST-exempt in India)
  if (bill.billType === "medical" && bill.statedTaxes && bill.statedTaxes > 0) {
    // India: non-ICU rooms above ₹5,000/day legitimately attract 5% GST; everything else clinical is exempt.
    const legit =
      bill.currency === "INR"
        ? round(
            items
              .filter((li) => /room|ward|bed/i.test(li.description) && !/icu/i.test(li.description))
              .filter((li) => (li.unitPrice ?? li.amount / li.quantity) > 5000)
              .reduce((s, li) => s + li.amount * 0.05, 0),
          )
        : 0;
    const excess = round(bill.statedTaxes - legit);
    if (excess > 0.5)
    findings.push({
      id: id(),
      kind: "other",
      title: `Tax charged on healthcare services`,
      lineItemIds: [],
      explanation:
        bill.currency === "INR"
          ? `The bill adds ₹${bill.statedTaxes.toFixed(2)} of GST. Healthcare services by a clinical establishment are GST-exempt in India; only a non-ICU room costing over ₹5,000/day attracts 5% GST${legit ? ` (≈ ₹${legit.toFixed(2)} here)` : ""}. The remaining ₹${excess.toFixed(2)} looks unjustified — ask exactly which items GST was applied to.`
          : `The bill adds ${bill.statedTaxes.toFixed(2)} in tax. Medical services are generally tax-exempt — ask which items the tax was applied to and on what legal basis.`,
      estimatedOvercharge: excess,
      confidence: "medium",
      source: "rule",
      citations: [],
    });
  }

  // Arithmetic is provable from the bill itself → confirmed. Everything else is a well-founded suspicion.
  return findings.map((f) => ({
    ...f,
    certainty: f.kind === "math_error" && f.confidence === "high" ? "confirmed" : "suspected",
  }));
}

function inclusiveDays(start?: string, end?: string): number | null {
  if (!start || !end) return null;
  const a = Date.parse(start);
  const b = Date.parse(end);
  if (isNaN(a) || isNaN(b) || b < a) return null;
  return Math.round((b - a) / 86_400_000) + 1;
}

function stayNights(bill: ParsedBill): number | null {
  if (!bill.admissionDate || !bill.dischargeDate) return null;
  const a = Date.parse(bill.admissionDate);
  const d = Date.parse(bill.dischargeDate);
  if (isNaN(a) || isNaN(d) || d < a) return null;
  return Math.round((d - a) / 86_400_000);
}

export function billTotal(bill: ParsedBill) {
  return round(bill.lineItems.reduce((s, li) => s + li.amount, 0) + (bill.statedTaxes ?? 0));
}
