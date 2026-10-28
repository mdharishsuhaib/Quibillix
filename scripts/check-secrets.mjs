// Usage: npm run check-secrets  — fails if any file git would commit contains something that looks like an API key.
import { execSync } from "node:child_process";
import fs from "node:fs";

const PATTERNS = [
  [/nvapi-[A-Za-z0-9_-]{20,}/, "NVIDIA API key"],
  [/tvly-[A-Za-z0-9_-]{20,}/, "Tavily API key"],
  [/\bsk-[A-Za-z0-9_-]{20,}/, "OpenAI-style secret key"],
  [/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/, "JWT / bearer token"],
  [/(NEBIUS|TAVILY|NVIDIA)_API_KEY\s*=\s*['"]?[A-Za-z0-9_-]{16,}/, "API key assignment"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "private key"],
  [/ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}/, "GitHub token"],
];

// Files that are tracked or would be added (respects .gitignore).
const files = execSync("git ls-files --cached --others --exclude-standard", { encoding: "utf8" })
  .split(/\r?\n/)
  .filter((f) => f && fs.existsSync(f) && fs.statSync(f).size < 2_000_000);

let bad = 0;
for (const f of files) {
  if (/\.(png|jpe?g|webp|ico|gif|woff2?)$/i.test(f)) continue;
  const text = fs.readFileSync(f, "utf8");
  for (const [re, label] of PATTERNS) {
    const m = text.match(re);
    if (m) {
      bad++;
      console.error(`✘ ${f}: possible ${label} (${m[0].slice(0, 12)}…)`);
    }
  }
}
if (bad) {
  console.error(`\n${bad} possible secret(s) found. Move them to .env.local (git-ignored) before committing.`);
  process.exit(1);
}
console.log(`✔ No secrets found in ${files.length} committable files.`);
