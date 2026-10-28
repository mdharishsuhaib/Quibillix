// Usage: node scripts/check-models.mjs   (reads NEBIUS_API_KEY from .env.local or env)
// Lists the NVIDIA models your Token Factory key can access and verifies Quibillix's configured IDs.
import fs from "node:fs";

if (fs.existsSync(".env.local")) {
  for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const base = (process.env.NEBIUS_BASE_URL || "https://api.tokenfactory.nebius.com/v1").replace(/\/$/, "");
const key = process.env.NEBIUS_API_KEY;
if (!key) {
  console.error("NEBIUS_API_KEY not set");
  process.exit(1);
}

const res = await fetch(`${base}/models`, { headers: { Authorization: `Bearer ${key}` } });
if (!res.ok) {
  console.error(res.status, await res.text());
  process.exit(1);
}
const ids = (await res.json()).data.map((m) => m.id);
console.log("NVIDIA models available:\n  " + ids.filter((i) => /nvidia|nemotron/i.test(i)).join("\n  "));

const wanted = {
  MODEL_VISION: process.env.MODEL_VISION || "nvidia/Nemotron-3.5-Super-VL",
  MODEL_FAST: process.env.MODEL_FAST || "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B",
  MODEL_MID: process.env.MODEL_MID || "nvidia/nemotron-3-super-120b-a12b",
  MODEL_DEEP: process.env.MODEL_DEEP || "nvidia/Nemotron-3-Ultra-550b-a55b",
};
console.log("\nQuibillix configuration:");
for (const [k, v] of Object.entries(wanted)) console.log(`  ${ids.includes(v) ? "OK     " : "MISSING"} ${k}=${v}`);
