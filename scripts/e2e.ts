// Usage: npx tsx scripts/e2e.ts [sampleId]   — runs the full pipeline from the CLI (reads .env.local)
import fs from "node:fs";

for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

async function main() {
  const { runAudit } = await import("../src/lib/pipeline");
  const { SAMPLES } = await import("../src/lib/samples");
  const arg = process.argv[2] || "us-er";
  const s = SAMPLES.find((x) => x.id === arg) ?? SAMPLES.find((x) => x.id === "in-hospital")!;
  const input = /\.(png|jpe?g|webp)$/i.test(arg)
    ? { imageDataUrl: `data:image/${arg.split(".").pop()!.replace("jpg", "jpeg")};base64,${fs.readFileSync(arg).toString("base64")}`, context: s.context }
    : { text: s.text, context: s.context };
  const t0 = Date.now();
  const result = await runAudit(input, (e) => {
    if (e.type === "step") console.log(`[${e.step}] ${e.status} ${e.model ?? ""} ${e.ms ? (e.ms / 1000).toFixed(1) + "s" : ""} ${e.detail ?? ""}`);
    if (e.type === "bill") console.log(`  parsed ${e.bill.lineItems.length} lines, ${e.bill.currency}, subtotal ${e.bill.statedSubtotal}, due ${e.bill.statedTotalDue}`);
  });
  console.log(`\nTOTAL ${result.totalBilled} | DISPUTABLE ${result.totalDisputable} | ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  for (const f of result.findings) console.log(` - [${f.source}/${f.kind}/${f.confidence}] ${f.estimatedOvercharge} ${f.title} (${f.lineItemIds.join(",")}) cites=${f.citations.length}`);
  console.log(`\nSUMMARY: ${result.summary}\n\nLETTER (${result.letter.length} chars, first 300):\n${result.letter.slice(0, 300)}\n\nPHONE (${result.phoneScript.length} chars):\n${result.phoneScript.slice(0, 200)}`);
}
main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
