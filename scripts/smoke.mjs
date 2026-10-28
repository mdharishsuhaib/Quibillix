// End-to-end smoke test against a running server (default http://localhost:3000).
// Usage: node scripts/smoke.mjs [baseUrl]
// Exercises: health, text audits for every sample, the photo (vision) path, and human-approved letter rewrite.
import fs from "node:fs";

const BASE = (process.argv[2] || "http://localhost:3000").replace(/\/$/, "");
const samplesSrc = fs.readFileSync("src/lib/samples.ts", "utf8");

// Pull sample texts/contexts out of samples.ts without a TS toolchain.
const samples = [...samplesSrc.matchAll(/id:\s*"([^"]+)"[\s\S]*?context:\s*(`[\s\S]*?`|"[\s\S]*?")[\s\S]*?text:\s*`([\s\S]*?)`/g)].map((m) => ({
  id: m[1],
  context: m[2].slice(1, -1),
  text: m[3],
}));

let failures = 0;
const ok = (cond, msg) => {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${msg}`);
  if (!cond) failures++;
};

async function audit(body) {
  const t0 = Date.now();
  const res = await fetch(`${BASE}/api/audit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  const events = (await res.text()).split("\n").filter(Boolean).map((l) => JSON.parse(l));
  return { events, ms: Date.now() - t0 };
}

function report(name, { events, ms }) {
  const result = events.find((e) => e.type === "result")?.result;
  const err = events.find((e) => e.type === "error");
  const steps = {};
  for (const e of events) if (e.type === "step") steps[e.step] = e;
  console.log(`\n▶ ${name}  (${(ms / 1000).toFixed(0)}s)`);
  ok(!err, `no pipeline error${err ? `: ${err.message}` : ""}`);
  ok(Boolean(result), "final result received");
  if (!result) return null;
  for (const [id, s] of Object.entries(steps)) console.log(`        ${s.status.padEnd(7)} ${id.padEnd(8)} ${s.model ?? ""} ${s.detail ? `— ${String(s.detail).slice(0, 70)}` : ""}`);
  ok(result.bill.lineItems.length > 0, `extracted ${result.bill.lineItems.length} line items`);
  ok(steps.research?.status === "done", `Tavily research: ${steps.research?.detail}`);
  ok(result.findings.length > 0, `${result.findings.length} findings (${result.findings.filter((f) => f.certainty === "confirmed").length} confirmed / ${result.findings.filter((f) => f.certainty === "suspected").length} suspected / ${result.findings.filter((f) => f.certainty === "needs_info").length} needs-info)`);
  ok(result.letter.length > 200 && result.phoneScript.length > 50, `letter (${result.letter.length} chars) + phone script (${result.phoneScript.length} chars)`);
  ok(Math.abs(result.confirmedTotal + result.suspectedTotal - result.totalDisputable) < 0.02, `totals reconcile: confirmed ${result.confirmedTotal} + suspected ${result.suspectedTotal} = ${result.totalDisputable} of ${result.totalBilled} billed`);
  ok(result.findings.flatMap((f) => f.citations).every((c) => /^https?:\/\//.test(c.url)), "all citations are real URLs from Tavily results");
  return result;
}

console.log(`Quibillix smoke test → ${BASE}`);
const health = await (await fetch(`${BASE}/api/health?fresh`)).json();
console.log(`\n▶ health: ${health.status} (primary: ${health.primary})`);
for (const c of health.checks) ok(c.ok, `${c.name} ${c.ms}ms ${c.detail ?? ""}`);

let first = null;
// Run audits 2 at a time: realistic load without tripping trial-tier rate limits.
const jobs = samples.map((s) => () => audit({ text: s.text, context: s.context }).then((r) => ({ name: `text: ${s.id}`, r })));
const img = fs.readFileSync("public/samples/india-hospital-bill.png").toString("base64");
const inCtx = samples.find((s) => s.id === "in-hospital")?.context;
jobs.push(() => audit({ imageDataUrl: `data:image/png;base64,${img}`, context: inCtx }).then((r) => ({ name: "photo: india-hospital-bill.png (vision)", r })));
for (let i = 0; i < jobs.length; i += 2) {
  const batch = await Promise.allSettled(jobs.slice(i, i + 2).map((j) => j()));
  for (const b of batch) {
    if (b.status === "rejected") {
      console.log(`\n▶ audit request`);
      ok(false, String(b.reason));
      continue;
    }
    const res = report(b.value.name, b.value.r);
    if (res && !first && res.findings.length > 1) first = res;
  }
}

if (first) {
  console.log("\n▶ human-in-the-loop: rewrite letter for a partial approval");
  const subset = first.findings.slice(0, 1);
  const res = await fetch(`${BASE}/api/letter`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bill: first.bill, findings: subset, total: subset[0].estimatedOvercharge }),
  });
  const j = await res.json();
  ok(res.ok && j.letter?.length > 200, `letter regenerated for 1 approved finding (${j.letter?.length ?? 0} chars)${j.error ? ` ${j.error}` : ""}`);
}

console.log(`\n${failures ? `✘ ${failures} check(s) failed` : "✔ all checks passed"}`);
process.exit(failures ? 1 : 0);
