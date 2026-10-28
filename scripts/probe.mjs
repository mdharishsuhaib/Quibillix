// Usage: node scripts/probe.mjs <model>  — checks latency / reasoning behaviour of a model (reads .env.local)
import fs from "node:fs";

for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}
const base = process.env.NEBIUS_BASE_URL.replace(/\/$/, "");
const model = process.argv[2] || process.env.MODEL_FAST;
const variants = [
  {},
  { chat_template_kwargs: { enable_thinking: false } },
  { reasoning_effort: "low" },
  { system: "/no_think" },
];

for (const v of variants) {
  const { system, ...extra } = v;
  const messages = [
    ...(system ? [{ role: "system", content: system }] : []),
    { role: "user", content: 'Return JSON {"a":1,"b":[2,3]} and nothing else.' },
  ];
  const t0 = Date.now();
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.NEBIUS_API_KEY}` },
    body: JSON.stringify({ model, messages, max_tokens: 800, ...extra }),
  });
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  if (!res.ok) {
    console.log(JSON.stringify(v), res.status, (await res.text()).slice(0, 150));
    continue;
  }
  const d = await res.json();
  const msg = d.choices[0].message;
  console.log(
    JSON.stringify(v),
    `${secs}s`,
    `tokens=${d.usage?.completion_tokens}`,
    `content=${JSON.stringify((msg.content || "").slice(0, 80))}`,
    `reasoning=${(msg.reasoning_content || msg.reasoning || "").length}`,
  );
}
