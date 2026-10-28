# Quibbill: quibble with your bill

*Quibbill* (quibble + bill) is a second opinion for every bill.

**Quibbill finds overcharges in medical, hospital, telecom and utility bills and writes the dispute for you.** Upload a photo or paste a bill. A pipeline of NVIDIA Nemotron agents running on **Nebius Token Factory** reads each line, runs hard math checks, looks up live fair-price benchmarks and consumer-protection rules with **Tavily**, audits the bill for upcoding, unbundling, duplicates and balance billing, and drafts a dispute letter and phone script you can send right away.

- **Live demo:** `<your-vercel-url>`
- **Demo video:** `<your-youtube-url>`
- **Track:** Best Apps and Agents
- **License:** MIT

## Why

Billing errors are common, but few people have the time or know-how to fight them. Itemized hospital bills use codes like `99285` and `0450` that most patients can't read, and an Explanation of Benefits rarely makes the problem clear. Most people just pay, and this hits hardest for people without a billing advocate, a lawyer or the spare hours to research fair prices. In India, families paying cashless-claim balances get bills full of "consumables", "service charges" and GST lines that they can't check. Quibbill acts as that billing advocate, and it costs a few cents in tokens per bill.

## What it does

1. **Read the bill:** works with photos (Nemotron 3.5 Super VL) or pasted text (Nemotron 3 Nano) and turns them into structured line items, totals, taxes, payer and location.
2. **Hard checks (no LLM):** finds quantity × price errors, duplicate lines, totals that don't reconcile and fees that are usually waived. Because these checks are deterministic, they are always right, and the deep audit receives them as given facts.
3. **Plan research:** Nemotron 3 Super picks the 3–4 charges most likely to be wrong and writes a precise search query for each.
4. **Live research:** Tavily searches fee schedules, published rates, drug prices and laws such as the No Surprises Act or GST exemptions.
5. **Deep audit:** Nemotron 3 Ultra reasons over the bill, the hard-check results, the user's own account ("I was only there 2 hours") and the evidence. It reports price outliers, upcoding, unbundling, balance billing and items that were never received. Each finding includes an estimated amount, a confidence level and numbered citations. Citations must point to the retrieved sources, so the model can't invent URLs.
6. **Write the dispute:** Nemotron 3 Super drafts an editable dispute letter with one paragraph per issue, plus a script for calling billing.

The UI streams each agent step live: which model is running, how long it took, what it found and which sources it used.

## How NVIDIA Nemotron and Nebius Token Factory are used

Each step goes to the cheapest Nemotron model that handles it well, all through one OpenAI-compatible Token Factory endpoint (`src/lib/llm.ts`):

| Step | Model (Token Factory ID) | Why this model |
| --- | --- | --- |
| Bill photo → JSON | `nvidia/Nemotron-3.5-Super-VL` | Reads document images, tables and small print |
| Bill text → JSON | `nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B` | Fast and cheap for structured extraction |
| Research planning, letter, phone script | `nvidia/nemotron-3-super-120b-a12b` | Good writing and planning at mid cost |
| Deep audit | `nvidia/Nemotron-3-Ultra-550b-a55b` | Multi-step reasoning over codes, law and evidence |

Token Factory helped in several ways:
- **One API, four models:** moving a step to a different model is a one-line environment variable change, which let us A/B test models per step during the hackathon.
- **Fallback chain:** if a model is unavailable or returns an error, the step automatically retries on the next tier (Ultra → Super, Nano → Super). The demo keeps working during capacity hiccups.
- **JSON-mode prompts and a self-repair retry:** structured outputs stay reliable without a schema library.
- **Cost:** a full audit is about 5 model calls, and most tokens go through Nano or Super. Ultra handles only the single reasoning-heavy call.

**Other tools:** Tavily Search API (`search_depth: advanced`) supplies live, citable benchmark and legal evidence. It's deployed on Vercel. It could also run on Nebius Serverless Endpoints, since it's a single stateless Node service.

## Run it locally

Requirements: Node.js 20+ and a Nebius Token Factory API key. A Tavily key is optional but recommended.

```bash
git clone <this-repo-url> quibbill
cd quibbill
npm install
cp .env.example .env.local      # then fill in NEBIUS_API_KEY and TAVILY_API_KEY
npm run check-models            # verifies the Nemotron model IDs on your account
npm run dev                     # http://localhost:3000
```

Click a sample bill (US ER visit, Indian hospital stay, telecom bill), then **Audit my bill**. You can also upload a photo of a real bill.

If `check-models` shows a model as `MISSING`, copy the matching NVIDIA ID from its output into `.env.local` (for example `MODEL_DEEP=...`).

### Deploy (Vercel)

1. Import the repo in Vercel.
2. Add `NEBIUS_API_KEY`, `TAVILY_API_KEY` (and optionally the `MODEL_*` variables) under Project → Settings → Environment Variables.
3. Deploy. The `/api/audit` route streams NDJSON and sets `maxDuration = 300`.

`GET /api/audit` returns which keys are configured and the model routing, which is useful for a health check.

## Architecture

```
Browser (Next.js 16, React 19, Tailwind)
   │  POST /api/audit  { text | imageDataUrl, context }      ← image is downscaled client-side
   ▼
/api/audit  ── streams NDJSON events ──►  live pipeline UI
   │
   ├─ extract   → Token Factory: Nemotron Super VL (image) / Nano (text)
   ├─ rules     → deterministic TypeScript checks (src/lib/rules.ts)
   ├─ triage    → Token Factory: Nemotron Super  → search queries
   ├─ research  → Tavily Search (parallel)
   ├─ audit     → Token Factory: Nemotron Ultra (fallback: Super) → findings + citations
   └─ letter    → Token Factory: Nemotron Super  → dispute letter + phone script
```

Key files: `src/lib/pipeline.ts` (orchestrator and prompts), `src/lib/llm.ts` (Token Factory client and model routing), `src/lib/rules.ts`, `src/lib/tavily.ts`, `src/components/*`.

**Privacy:** Quibbill stores nothing. Each bill is processed in memory for one request and sent only to the model API (Nebius Token Factory). Tavily receives only the generated search queries, never the bill itself.

## Feedback on Nebius Token Factory and NVIDIA Nemotron

See [`SUBMISSION.md`](./SUBMISSION.md#feedback).

## Disclaimer

Quibbill gives informational analysis, not legal, medical or financial advice. Check its findings with your provider or insurer.
