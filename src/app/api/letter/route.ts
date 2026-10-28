import { writeLetter } from "@/lib/pipeline";
import { hasNebiusKey } from "@/lib/llm";
import type { Finding, ParsedBill } from "@/lib/types";

export const maxDuration = 120;

/**
 * Human-in-the-loop: regenerate the dispute letter from ONLY the findings the user approved.
 * Body: { bill, findings, total, context }
 */
export async function POST(req: Request) {
  if (!hasNebiusKey()) return Response.json({ error: "Server is missing NEBIUS_API_KEY" }, { status: 500 });
  let bill: ParsedBill, findings: Finding[], total: number, context: string | undefined;
  try {
    const b = await req.json();
    bill = b.bill;
    findings = Array.isArray(b.findings) ? b.findings.slice(0, 40) : [];
    total = Number(b.total) || 0;
    context = typeof b.context === "string" ? b.context.slice(0, 2000) : undefined;
    if (!bill?.lineItems || !findings.length) throw new Error();
  } catch {
    return Response.json({ error: "Provide bill and at least one approved finding" }, { status: 400 });
  }
  try {
    const out = await writeLetter(bill, findings, total, context, "mid").catch(() =>
      writeLetter(bill, findings, total, context, "fast"),
    );
    return Response.json(out);
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
