// Usage: npm run check-secrets  — fails if any file git would commit contains something that looks like an API key,
// or contains one of the REAL secret values from .env.local. Also runs automatically before every commit (.githooks/pre-commit).
import { execSync } from "node:child_process";
import fs from "node:fs";

const PATTERNS = [
  [/nvapi-[A-Za-z0-9_-]{20,}/, "NVIDIA API key"],
  [/tvly-[A-Za-z0-9_-]{20,}/, "Tavily API key"],
  [/\b[0-9a-f]{32}\.[A-Za-z0-9]{20,}\b/, "Ollama API key"],
  [/\bsk-[A-Za-z0-9_-]{20,}/, "OpenAI-style secret key"],
  [/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/, "JWT / bearer token"],
  [/(NEBIUS|TAVILY|NVIDIA|OLLAMA)_API_KEY(_\d+)?\s*=\s*['"]?[A-Za-z0-9_.-]{16,}/, "API key assignment"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "private key"],
  [/ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}/, "GitHub token"],
];

// The actual values in .env.local, so a key with an unfamiliar format is still caught.
const realSecrets = fs.existsSync(".env.local")
  ? fs
      .readFileSync(".env.local", "utf8")
      .split(/\r?\n/)
      .map((l) => l.match(/^([A-Z0-9_]+)=(.+)$/))
      .filter((m) => m && /KEY|TOKEN|SECRET|PASSWORD/.test(m[1]))
      .map((m) => [m[1], m[2].trim().replace(/^['"]|['"]$/g, "")])
      .filter(([, v]) => v.length >= 12)
  : [];

// .env files must never be committable, whatever .gitignore says.
const ignored = (f) => {
  try {
    execSync(`git check-ignore -q -- "${f}"`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};
let bad = 0;
for (const f of fs.readdirSync(".").filter((f) => /^\.env/.test(f) && f !== ".env.example")) {
  if (!ignored(f)) {
    bad++;
    console.error(`✘ ${f} is NOT git-ignored`);
  }
}

// Files that are tracked or would be added (respects .gitignore), plus anything staged.
const files = [
  ...new Set(
    execSync("git ls-files --cached --others --exclude-standard", { encoding: "utf8" })
      .split(/\r?\n/)
      .filter((f) => f && fs.existsSync(f) && fs.statSync(f).isFile() && fs.statSync(f).size < 2_000_000),
  ),
];

for (const f of files) {
  if (/\.(png|jpe?g|webp|ico|gif|woff2?)$/i.test(f)) continue;
  const text = fs.readFileSync(f, "utf8");
  for (const [re, label] of PATTERNS) {
    const m = text.match(re);
    if (m) {
      bad++;
      console.error(`✘ ${f}: possible ${label} (${m[0].slice(0, 6)}…)`);
    }
  }
  for (const [name, value] of realSecrets) {
    if (text.includes(value)) {
      bad++;
      console.error(`✘ ${f}: contains the real value of ${name} from .env.local`);
    }
  }
}
if (bad) {
  console.error(`\n${bad} possible secret(s) found. Move them to .env.local (git-ignored) before committing.`);
  process.exit(1);
}
console.log(`✔ No secrets found in ${files.length} committable files (${realSecrets.length} real keys from .env.local checked).`);
