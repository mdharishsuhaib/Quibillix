// Usage: npx tsx eval/run.ts   — runs every eval case through the full pipeline and scores it.
// Recall    = planted errors detected (finding on the right line with an accepted kind, or bill-level for bill-level issues)
// Precision = money-bearing findings that hit a planted error ÷ all money-bearing findings
//             (findings on lines not covered by ground truth are counted as "unplanned" and reported, not auto-failed,
//              because the agent may legitimately find real issues we didn't plant; the clean bill is the strict test)
import fs from "node:fs";

for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

async function main() {
  const { runAudit } = await import("../src/lib/pipeline");
  const { EVAL_CASES } = await import("./cases");
  const only = process.argv[2];
  const rows: string[] = [];
  let planted = 0, found = 0, moneyFindings = 0, hits = 0, cleanFalsePos = 0, totalMs = 0;

  for (const c of EVAL_CASES.filter((x) => !only || x.id === only)) {
    const t0 = Date.now();
    const r = await runAudit({ text: c.text, context: c.context }, () => {});
    const ms = Date.now() - t0;
    totalMs += ms;
    const desc = new Map(r.bill.lineItems.map((li) => [li.id, li.description]));
    const onLine = (f: (typeof r.findings)[number], re: RegExp) => f.lineItemIds.some((id) => re.test(desc.get(id) || ""));

    // STRICT: a planted error counts as caught only if a money-bearing finding sits on that line with an accepted kind.
    const detected = c.planted.map((p) =>
      r.findings.some(
        (f) =>
          onLine(f, p.match) &&
          p.kinds.includes(f.kind) &&
          f.estimatedOvercharge > 0 &&
          (!p.mustMention || p.mustMention.test(`${f.title} ${f.explanation}`)),
      ),
    );
    planted += c.planted.length;
    found += detected.filter(Boolean).length;

    const money = r.findings.filter((f) => f.estimatedOvercharge > 0);
    const hit = money.filter((f) => c.planted.some((p) => onLine(f, p.match)));
    const cleanHits = money.filter((f) => c.clean.some((re) => onLine(f, re)));
    moneyFindings += money.length;
    hits += hit.length;
    cleanFalsePos += cleanHits.length;

    const noise = r.findings.filter((f) => f.estimatedOvercharge === 0 && c.clean.some((re) => onLine(f, re)));
    rows.push(
      `\n## ${c.id}  (${(ms / 1000).toFixed(0)}s, ${r.bill.lineItems.length} lines)\n` +
        c.planted.map((p, i) => `  ${detected[i] ? "✔" : "✘"} planted: ${p.label}`).join("\n") +
        `\n  findings: ${r.findings.map((f) => `[${f.certainty}/${f.kind}] ${f.title} ${f.estimatedOvercharge}`).join(" | ")}` +
        (cleanHits.length ? `\n  ✘ FALSE POSITIVE on legit lines: ${cleanHits.map((f) => f.title).join("; ")}` : "\n  ✔ no money-bearing flags on known-legit lines") +
        (noise.length ? `\n  ~ ${noise.length} zero-value note(s) on legit lines` : ""),
    );
  }

  console.log(rows.join("\n"));
  console.log(`\n=== SUMMARY ===`);
  console.log(`Recall (planted errors caught): ${found}/${planted} = ${((found / Math.max(1, planted)) * 100).toFixed(0)}%`);
  console.log(`Money-bearing findings on planted lines: ${hits}/${moneyFindings}`);
  console.log(`False positives on known-legit lines: ${cleanFalsePos}`);
  console.log(`Avg time per bill: ${(totalMs / 1000 / Math.max(1, rows.length)).toFixed(0)}s`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
