// Failover drill: simulate Nebius being down/slow and prove calls fail over to NVIDIA Build.
// Usage: npx tsx scripts/failover-test.ts
import fs from "node:fs";

for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

async function main() {
  const { chat, providers } = await import("../src/lib/llm");
  const scenarios: [string, Record<string, string>][] = [
    ["Nebius returns 401 (bad/expired key)", { NEBIUS_API_KEY: "invalid-key", NEBIUS_BASE_URL: "https://api.tokenfactory.nebius.com/v1" }],
    ["Nebius unreachable (DNS/network down)", { NEBIUS_API_KEY: "x", NEBIUS_BASE_URL: "https://nebius-down.invalid/v1" }],
    ["Nebius hangs (timeout)", { NEBIUS_API_KEY: "x", NEBIUS_BASE_URL: "https://10.255.255.1/v1", LLM_TIMEOUT_FAST_MS: "3000" }],
  ];
  let failed = 0;
  for (const [name, env] of scenarios) {
    Object.assign(process.env, env);
    const t0 = Date.now();
    try {
      const chain = providers().map((p) => p.name).join(" → ");
      const r = await chat({ tier: "fast", maxTokens: 10, messages: [{ role: "user", content: "Reply with just: OK" }] });
      const pass = r.provider === "NVIDIA Build";
      if (!pass) failed++;
      console.log(`${pass ? "PASS" : "FAIL"}  ${name}: chain [${chain}] answered by ${r.provider} in ${Date.now() - t0}ms ("${r.text.slice(0, 20)}")`);
    } catch (e) {
      failed++;
      console.log(`FAIL  ${name}: ${e instanceof Error ? e.message : e}`);
    }
  }
  process.exit(failed ? 1 : 0);
}
main();
