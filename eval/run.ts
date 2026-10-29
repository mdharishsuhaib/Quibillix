// Usage: npm run eval [caseId]   (env: EVAL_CONCURRENCY=2)
// Runs every labelled bill through the full pipeline (Nemotron + Tavily + rules) and scores it.
//
// Metrics
//   Recall            planted errors caught: a money-bearing finding on the right line (or bill-level for
//                     bill-level errors) with an accepted issue kind and, where required, the right reason.
//   Precision         money-bearing findings that land on a planted error ÷ money-bearing findings on
//                     labelled lines (planted + known-legit). Findings on unlabelled lines are reported
//                     separately as "unlabelled": the agent may find real issues we didn't plant.
//   Clean-bill FP     money-bearing findings on clean control bills (must be 0).
//   Arithmetic        for planted errors with an exact provable amount, the claimed overcharge is within ±1%.
//   Traceability      AI findings with ≥1 citation, and citations that are URLs actually returned by Tavily.
//   Dispute quality   letters that reference every disputed item (amount or code), request itemization and
//                     contain no unresolved model artefacts.
//   Time              wall-clock per bill vs. a manual baseline of 4 min/line + 30 min letter.
import fs from "node:fs";

for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(0)}%` : "n/a");

async function main() {
  const { runAudit } = await import("../src/lib/pipeline");
  const { providers } = await import("../src/lib/llm");
  const { EVAL_CASES } = await import("./cases");
  type Result = Awaited<ReturnType<typeof runAudit>>;
  type Ev = { query: string; results: { url: string }[] };

  const only = process.argv[2]?.split(",");
  const cases = EVAL_CASES.filter((x) => !only || only.includes(x.id));
  const conc = Number(process.env.EVAL_CONCURRENCY) || 2;
  console.log(`Quibillix eval: ${cases.length} labelled bills · provider chain: ${providers().map((p) => p.name).join(" → ")} · concurrency ${conc}\n`);

  const runs: { c: (typeof cases)[number]; r?: Result; evidence: Ev[]; ms: number; err?: string }[] = [];
  for (let i = 0; i < cases.length; i += conc) {
    const batch = await Promise.all(
      cases.slice(i, i + conc).map(async (c) => {
        const evidence: Ev[] = [];
        const t0 = Date.now();
        try {
          const r = await runAudit({ text: c.text, context: c.context }, (e) => {
            if (e.type === "evidence") evidence.splice(0, evidence.length, ...e.evidence);
          });
          return { c, r, evidence, ms: Date.now() - t0 };
        } catch (e) {
          return { c, evidence, ms: Date.now() - t0, err: e instanceof Error ? e.message : String(e) };
        }
      }),
    );
    runs.push(...batch);
    batch.forEach((b) => console.log(`  ${b.err ? "✘" : "·"} ${b.c.id} (${(b.ms / 1000).toFixed(0)}s)${b.err ? ` ERROR ${b.err.slice(0, 120)}` : ""}`));
  }

  const T = { planted: 0, caught: 0, labelledMoney: 0, onPlanted: 0, unlabelled: 0, cleanBills: 0, cleanBillsClean: 0, cleanFP: 0, legitFP: 0,
    arith: 0, arithOk: 0, aiFindings: 0, aiCited: 0, citations: 0, citationsReal: 0, letters: 0, lettersGood: 0, ms: [] as number[], manualMin: 0, errors: 0 };
  const rows: string[] = [];

  for (const { c, r, evidence, ms, err } of runs) {
    if (!r) {
      T.errors++;
      rows.push(`\n## ${c.id}: PIPELINE ERROR ${err}`);
      continue;
    }
    T.ms.push(ms);
    T.manualMin += r.bill.lineItems.length * 4 + 30;
    const desc = new Map(r.bill.lineItems.map((li) => [li.id, li.description]));
    const isBillLevel = (re: RegExp) => re.source === "^$";
    const onLine = (f: Result["findings"][number], re: RegExp) =>
      isBillLevel(re) ? f.lineItemIds.length === 0 : f.lineItemIds.some((id) => re.test(desc.get(id) || ""));
    const money = r.findings.filter((f) => f.estimatedOvercharge > 0);

    const detected = c.planted.map((p) =>
      money.find((f) => onLine(f, p.match) && p.kinds.includes(f.kind) && (!p.mustMention || p.mustMention.test(`${f.title} ${f.explanation}`))),
    );
    T.planted += c.planted.length;
    T.caught += detected.filter(Boolean).length;
    c.planted.forEach((p, i) => {
      if (p.amount == null || !detected[i]) return;
      T.arith++;
      if (Math.abs(detected[i]!.estimatedOvercharge - p.amount) <= Math.max(0.05, p.amount * 0.01)) T.arithOk++;
    });

    const onPlanted = money.filter((f) => c.planted.some((p) => onLine(f, p.match)));
    const onLegit = money.filter((f) => !onPlanted.includes(f) && c.clean.some((re) => onLine(f, re)));
    const unlabelled = money.filter((f) => !onPlanted.includes(f) && !onLegit.includes(f));
    T.onPlanted += onPlanted.length;
    T.labelledMoney += onPlanted.length + onLegit.length;
    T.legitFP += onLegit.length;
    T.unlabelled += unlabelled.length;
    if (!c.planted.length) {
      T.cleanBills++;
      T.cleanFP += money.length;
      if (!money.length) T.cleanBillsClean++;
    }

    const real = new Set(evidence.flatMap((e) => e.results.map((x) => x.url)));
    const ai = r.findings.filter((f) => f.source === "ai" && f.estimatedOvercharge > 0);
    T.aiFindings += ai.length;
    T.aiCited += ai.filter((f) => f.citations.length > 0).length;
    for (const f of r.findings) for (const ct of f.citations) {
      T.citations++;
      if (real.has(ct.url)) T.citationsReal++;
    }

    const disputed = r.findings.filter((f) => f.certainty !== "needs_info");
    let letterNote = "no letter (nothing to dispute)";
    if (disputed.length) {
      T.letters++;
      const L = r.letter;
      const refs = disputed.filter((f) => {
        const amt = f.estimatedOvercharge;
        const codes = f.lineItemIds.map((id) => r.bill.lineItems.find((li) => li.id === id)?.code).filter(Boolean) as string[];
        const amtRe = new RegExp(amt.toFixed(2).replace(/\.00$/, "(\\.00)?").replace(/^(\d+)(\d{3})/, "$1,?$2").replace(".", "\\."));
        return amtRe.test(L) || codes.some((cd) => L.includes(cd)) || f.lineItemIds.some((id) => L.includes(desc.get(id)!.slice(0, 18)));
      });
      const good = refs.length === disputed.length && /itemi[sz]ed/i.test(L) && !/===|<think>|\{\{/.test(L) && r.phoneScript.length > 50;
      if (good) T.lettersGood++;
      letterNote = `letter references ${refs.length}/${disputed.length} disputed items${good ? " ✔" : " ✘"}`;
    }

    rows.push(
      `\n## ${c.id}  (${(ms / 1000).toFixed(0)}s, ${r.bill.lineItems.length} lines${c.planted.length ? "" : ", CLEAN CONTROL"})\n` +
        c.planted.map((p, i) => `  ${detected[i] ? "✔" : "✘"} ${p.label}${p.amount != null && detected[i] ? ` (claimed ${detected[i]!.estimatedOvercharge}, true ${p.amount})` : ""}`).join("\n") +
        (c.planted.length ? "\n" : "") +
        (c.planted.length ? "" : `  ${money.length ? "✘" : "✔"} clean bill → ${money.length} money-bearing finding(s)\n`) +
        (onLegit.length ? `  ✘ FALSE POSITIVE on known-legit lines: ${onLegit.map((f) => f.title).join("; ")}\n` : "") +
        (unlabelled.length ? `  ~ unlabelled findings: ${unlabelled.map((f) => `${f.title} (${f.estimatedOvercharge})`).join("; ")}\n` : "") +
        `  ${letterNote}`,
    );
  }

  const sorted = [...T.ms].sort((a, b) => a - b);
  const avg = T.ms.reduce((s, x) => s + x, 0) / Math.max(1, T.ms.length);
  const summary = {
    bills: cases.length,
    pipelineErrors: T.errors,
    recall: `${T.caught}/${T.planted} (${pct(T.caught, T.planted)})`,
    precisionOnLabelledLines: `${T.onPlanted}/${T.labelledMoney} (${pct(T.onPlanted, T.labelledMoney)})`,
    falsePositivesOnKnownLegitLines: T.legitFP,
    cleanControlBills: `${T.cleanBillsClean}/${T.cleanBills} came back clean (${T.cleanFP} money-bearing findings)`,
    unlabelledFindings: T.unlabelled,
    arithmeticCorrectness: `${T.arithOk}/${T.arith} (${pct(T.arithOk, T.arith)})`,
    aiFindingsWithCitation: `${T.aiCited}/${T.aiFindings} (${pct(T.aiCited, T.aiFindings)})`,
    citationsFromRealTavilyResults: `${T.citationsReal}/${T.citations} (${pct(T.citationsReal, T.citations)})`,
    disputeLettersComplete: `${T.lettersGood}/${T.letters} (${pct(T.lettersGood, T.letters)})`,
    avgSecondsPerBill: Math.round(avg / 1000),
    medianSecondsPerBill: Math.round((sorted[Math.floor(sorted.length / 2)] ?? 0) / 1000),
    manualBaselineMinutesTotal: T.manualMin,
    agentMinutesTotal: Math.round(T.ms.reduce((s, x) => s + x, 0) / 60000),
    providers: providers().map((p) => p.name),
    ranAt: new Date().toISOString(),
  };

  console.log(rows.join("\n"));
  console.log("\n=== SUMMARY ===");
  for (const [k, v] of Object.entries(summary)) console.log(`${k.padEnd(34)} ${Array.isArray(v) ? v.join(" → ") : v}`);
  if (!only) fs.writeFileSync("eval/results.json", JSON.stringify({ summary, detail: rows.join("\n") }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
