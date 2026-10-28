// Usage: npm run check-models
// Verifies every configured provider (Nebius Token Factory, NVIDIA Build) lists the Nemotron model IDs Quibillix uses.
import fs from "node:fs";

if (fs.existsSync(".env.local")) {
  for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}
const e = (k) => (process.env[k] || "").trim();

const providers = [
  {
    name: "Nebius Token Factory (primary)",
    base: e("NEBIUS_BASE_URL") || "https://api.tokenfactory.nebius.com/v1",
    key: e("NEBIUS_API_KEY"),
    models: {
      MODEL_VISION: e("MODEL_VISION") || "nvidia/Nemotron-3.5-Super-VL",
      MODEL_FAST: e("MODEL_FAST") || "nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B",
      MODEL_MID: e("MODEL_MID") || "nvidia/nemotron-3-super-120b-a12b",
      MODEL_DEEP: e("MODEL_DEEP") || "nvidia/Nemotron-3-Ultra-550b-a55b",
    },
  },
  {
    name: "NVIDIA Build (fallback)",
    base: e("NVIDIA_BASE_URL") || "https://integrate.api.nvidia.com/v1",
    key: e("NVIDIA_API_KEY"),
    models: {
      NVIDIA_MODEL_VISION: e("NVIDIA_MODEL_VISION") || "nvidia/nemotron-3.5-super-vl-120b-a12b",
      NVIDIA_MODEL_FAST: e("NVIDIA_MODEL_FAST") || "nvidia/nemotron-3.5-lightning-30b-a3b",
      NVIDIA_MODEL_MID: e("NVIDIA_MODEL_MID") || "nvidia/nemotron-3.5-super-vl-120b-a12b",
      NVIDIA_MODEL_DEEP: e("NVIDIA_MODEL_DEEP") || "nvidia/nemotron-3-ultra-550b-a55b",
    },
  },
];

let anyOk = false;
for (const p of providers) {
  console.log(`\n== ${p.name} — ${p.base}`);
  if (!p.key) {
    console.log("   (no API key set, skipped)");
    continue;
  }
  const res = await fetch(`${p.base.replace(/\/$/, "")}/models`, { headers: { Authorization: `Bearer ${p.key}` } });
  if (!res.ok) {
    console.log(`   ERROR ${res.status}: ${(await res.text()).slice(0, 200)}`);
    continue;
  }
  const ids = new Set((await res.json()).data.map((m) => m.id));
  for (const [k, v] of Object.entries(p.models)) {
    const ok = ids.has(v);
    anyOk ||= ok;
    console.log(`   ${ok ? "OK     " : "MISSING"} ${k}=${v}`);
  }
}
if (!anyOk) process.exit(1);
