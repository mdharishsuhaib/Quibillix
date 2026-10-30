<div align="center">
<br/>

<img src="public/logo-icon.png" alt="Quibillix" width="120"/>

# Quibillix

**Quibillix: Bill Verification & Dispute Agent**

*Every charge questioned. Every dispute supported.*

**Live:** [quibillix.mdharishsuhaib.workers.dev](https://quibillix.mdharishsuhaib.workers.dev)

[![GitHub Stars](https://img.shields.io/github/stars/mdharishsuhaib/Quibillix?style=flat-square&logo=github&color=1f6feb&label=stars)](https://github.com/mdharishsuhaib/Quibillix/stargazers) [![GitHub Forks](https://img.shields.io/github/forks/mdharishsuhaib/Quibillix?style=flat-square&logo=github&color=f0883e&label=forks)](https://github.com/mdharishsuhaib/Quibillix/network/members)

[![Next.js](https://img.shields.io/badge/Framework-Next.js_16-000000?style=flat-square&logo=nextdotjs&logoColor=white)](https://nextjs.org/) [![React](https://img.shields.io/badge/UI-React_19-149ECA?style=flat-square&logo=react&logoColor=white)](https://react.dev/) [![TypeScript](https://img.shields.io/badge/Language-TypeScript_5-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org/) [![Tailwind CSS](https://img.shields.io/badge/Styling-Tailwind_CSS_4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/) [![NVIDIA Nemotron](https://img.shields.io/badge/Models-NVIDIA_Nemotron-76B900?style=flat-square&logo=nvidia&logoColor=white)](https://build.nvidia.com/) [![Cloudflare Workers](https://img.shields.io/badge/Hosting-Cloudflare_Workers-F38020?style=flat-square&logo=cloudflare&logoColor=white)](https://workers.cloudflare.com/)
</div>

---

## About the Project

*Quibble + bill + x: a billing advocate that questions every charge.*

Quibillix is an AI-powered bill verification and dispute agent for anyone who has been handed
a bill they cannot check: **patients and families** facing medical or hospital bills full of
codes such as `99285` and `0450`, and **households and small businesses** paying telecom,
utility and B2B invoices.

It reads a bill the way a professional billing advocate would. It re-checks the math, prices
each charge against live benchmarks and consumer law, separates proven errors from suspicions,
and drafts an evidence-backed dispute letter. Nothing is sent until you approve each item, and
you can track the case through to the money you actually recover.

---

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [System Architecture](#system-architecture)
- [Repository Structure](#repository-structure)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Backend Setup](#backend-setup)
- [Frontend Setup](#frontend-setup)
- [API Reference](#api-reference)
- [Database Schema](#database-schema)
- [Security and Privacy Model](#security-and-privacy-model)
- [Operational Limits and Constraints](#operational-limits-and-constraints)
- [Deployment](#deployment)
- [Running Tests](#running-tests)
- [Troubleshooting](#troubleshooting)
- [Learning Guide](#learning-guide)
- [Tech Stack](#tech-stack)

---

## Overview

1. A user opens the app. There is **no account and no sign-up**.
2. They **upload a bill** (PDF, photo, TXT, CSV or MD) or **paste the text**, and can add a
   short note such as "I was only in the ER for an hour" or "the plan was quoted at $45".
   Digital PDFs are read in the browser; scanned PDFs and photos are downscaled in the browser
   and sent as one image.
3. **Read the bill:** NVIDIA Nemotron turns it into structured line items (Nemotron 3.5 Super
   VL for images, fast Nemotron for text).
4. **Hard checks:** deterministic TypeScript code re-checks quantity x price, duplicates,
   subtotal and total due, day counts against the stay or billing period, tax on exempt
   healthcare, and junk fees. Only these checks can mark an error as **confirmed**.
5. **Plan research:** Nemotron Super picks the 3 to 4 charges most likely to be wrong and writes
   a search query for each. Personal identifiers are stripped from the queries.
6. **Live research:** **Tavily** fetches fee schedules, rate caps and consumer law. If the first
   Tavily key fails or runs out of credits, the same query tries the **second Tavily key**, then
   **Ollama web search**, automatically.
7. **Deep audit:** **Nemotron 3 Ultra** looks for upcoding, unbundling, price outliers, balance
   billing and services never received. Every claim must cite a retrieved source.
8. **Write the dispute:** Nemotron Super drafts a dispute letter and a phone script, one
   paragraph per item, worded by certainty.
9. **Resolve with oversight:** the user **approves or rejects each finding**, the letter is
   rewritten for exactly what they approved, and the case is tracked (Draft, Sent, Responded,
   Resolved) with the amount actually recovered and a timestamped audit trail.

The whole run streams live to the screen, step by step, in about **42 seconds** on average.

---

## Key Features

- **Six-step agent pipeline** -- Read, Hard checks, Plan research, Live research, Deep audit
  and Write dispute, each streamed live with the model that answered it.
- **Confirmed, suspected and needs info, never mixed up** -- Arithmetic that is provable from
  the bill is *confirmed*. Benchmark-backed claims are *suspected*. Missing records become a
  *request*, with no money claimed.
- **The model proposes, code decides** -- A price claim keeps its amount only if it cites a
  retrieved source **and** is at least 3x the benchmark or breaks a legal ceiling (MRP, NPPA,
  regulated cap). Weaker claims are downgraded to "needs info".
- **The user's word wins** -- If you say a price was quoted, contracted or matches the MRP,
  benchmark-based price claims on it are dropped.
- **No double counting** -- Overlapping findings are capped per line, so totals never exceed
  what was billed.
- **Real citations only** -- The audit can only cite URLs that research actually returned; the
  model cannot invent sources.
- **Human approval per finding** -- Toggle each item on or off, then the letter is rewritten
  (`/api/letter`) from approved items only. You can edit it, copy it or download it.
- **Case tracker and value dashboard** -- Flagged, confirmed, in dispute, recovered and review
  time saved, with a full agent-and-human audit trail. Stored only in your browser.
- **Built to stay up** -- Nebius Token Factory first, NVIDIA Build as automatic backup, per-tier
  timeouts, retries and tier fallback; Tavily key 1, then Tavily key 2, then Ollama web search.
- **Polished, accessible UI** -- Light mode by default (Payne's Grey on Vellum) with a dark mode
  toggle, an interactive 3D bill journey in the hero, `Ctrl + Enter` (or `⌘ + Enter`) to jump to
  the bill box or run the audit, and motion that respects reduced-motion settings.
- **Works in many countries** -- US, UK and India medical and hospital bills, utility, telecom
  and B2B invoices, in any currency.

---

## System Architecture

```mermaid
flowchart TD
    subgraph Client["Browser"]
        UI["Next.js 16 UI<br/>upload, live pipeline, results, cases"]
        PDF["pdf.ts<br/>PDF text layer or scan to image"]
        Store[("localStorage<br/>cases + theme")]
    end

    subgraph Server["Next.js API routes (Cloudflare Workers)"]
        Audit["/api/audit<br/>streams NDJSON events"]
        Letter["/api/letter<br/>letter from approved items"]
        Health["/api/health<br/>live provider status"]
        Pipeline["pipeline.ts<br/>orchestrator and prompts"]
        Rules["rules.ts<br/>deterministic checks"]
        LLM["llm.ts<br/>model routing + failover"]
        Search["tavily.ts<br/>web search + failover"]
    end

    subgraph Models["Model providers"]
        Nebius[("Nebius Token Factory<br/>primary")]
        NVIDIA[("NVIDIA Build<br/>fallback")]
    end

    subgraph Web["Live research"]
        Tavily[("Tavily<br/>primary key")]
        Tavily2[("Tavily<br/>backup key")]
        Ollama[("Ollama web search<br/>last fallback")]
    end

    UI --> PDF
    UI -- "POST bill text or image" --> Audit
    UI -- "POST approved findings" --> Letter
    Audit --> Pipeline
    Letter --> Pipeline
    Pipeline --> Rules
    Pipeline --> LLM
    Pipeline -- "redacted queries only" --> Search
    LLM --> Nebius
    LLM -. "on error or timeout" .-> NVIDIA
    Search --> Tavily
    Search -. "on error or no credits" .-> Tavily2
    Search -. "if both keys fail" .-> Ollama
    Audit -- "step, bill, findings, evidence, result" --> UI
    UI --> Store
```

- **Frontend** -- Next.js 16 (App Router) + React 19 + TypeScript + Tailwind CSS 4. PDFs are
  parsed in the browser with `pdfjs-dist`, and photos are downscaled before upload.
- **Backend** -- Next.js API routes on Node. `/api/audit` streams newline-delimited JSON
  (NDJSON) so the UI shows each step as it finishes.
- **Models** -- Every step goes to the cheapest Nemotron model that does it well, through one
  OpenAI-compatible endpoint. If Nebius Token Factory fails, the same call goes to NVIDIA Build.
- **No database** -- Bills are processed in memory. Cases live in the user's browser only.

### Project Pipeline

Every audit runs the same six steps in `runAudit` (`src/lib/pipeline.ts`). Each step is streamed
to the browser as it starts and finishes, with the model or engine that answered it.

```mermaid
flowchart LR
    A["1. Read the bill<br/>extract"] --> B["2. Hard checks<br/>rules"]
    B --> C["3. Plan research<br/>triage"]
    C --> D["4. Live research<br/>research"]
    D --> E["5. Deep audit<br/>audit"]
    E --> F["6. Write dispute<br/>letter"]
    F --> G["You approve<br/>each finding"]
    G -- "/api/letter" --> H["Letter rewritten<br/>for approved items"]
    H --> I["Case tracker<br/>Draft to Resolved"]
```

| # | Step (event id) | What happens | Model or engine (fallback) | Output |
|---|---|---|---|---|
| 1 | Read the bill (`extract`) | Turns the photo, PDF text or pasted text into structured line items: codes, dates, quantities, prices, stated totals, stay or billing period | Photo: Nemotron 3.5 Super VL. Text: Nemotron Nano (falls back to Super) | `bill` event |
| 2 | Hard checks (`rules`) | Runs the 8 deterministic checks (math, duplicates, subtotal, total due, fees, stay days, billing-period days, tax on healthcare) | No model: TypeScript code | **Confirmed** findings |
| 3 | Plan research (`triage`) | Picks the 3 to 4 charges most likely to be wrong and writes one search query each. Queries then pass through `redactQuery` | Nemotron Super (falls back to Nano) | Search queries |
| 4 | Live research (`research`) | Runs every query in parallel | Tavily key 1, then Tavily key 2, then Ollama web search, per query | `evidence` event with sources |
| 5 | Deep audit (`audit`) | Looks for upcoding, unbundling, price outliers, balance billing and services not received, citing only retrieved sources. `gatePriceOutliers` then downgrades weak price claims, findings are merged with the rule results, and totals are capped per line | Nemotron 3 Ultra (falls back to Super) | **Suspected** and **needs info** findings, totals by certainty |
| 6 | Write dispute (`letter`) | Drafts a dispute letter and phone script for every finding except "needs info" | Nemotron Super (falls back to Nano) | Letter and phone script |

**After the run:**

- **Human review:** you switch each finding on or off. If the selection changes, **Rewrite to
  match** sends only the approved findings to `/api/letter`, which rewrites the letter.
- **Case tracking:** the case is saved in your browser with an audit trail of every agent step and
  every decision you make, through Draft, Sent, Responded and Resolved, plus the amount recovered.

**When something fails:**

- If no search key is set, steps 3 and 4 are skipped and price findings are marked lower confidence.
- If the letter step fails, the findings are kept and **Write the letter** retries it.
- If a whole model tier is down, the step moves to the fallback tier. If Nebius Token Factory is
  down, every call goes to NVIDIA Build.
- If no line items are found, the run stops with "Couldn't find any line items on this bill".

---

## Repository Structure

```text
Quibillix/
├── src/
│   ├── app/
│   │   ├── layout.tsx           # Fonts, metadata, theme boot script (no flash on load)
│   │   ├── page.tsx             # Landing hero, 3D journey, proof figures, workspace
│   │   ├── globals.css          # Light and dark theme tokens, animations
│   │   ├── icon.png, apple-icon.png, favicon.ico
│   │   └── api/
│   │       ├── audit/route.ts   # POST: run the audit, streams NDJSON; GET: provider chain
│   │       ├── letter/route.ts  # POST: rewrite the letter from approved findings
│   │       └── health/route.ts  # GET: live status of every provider and search engine
│   ├── components/
│   │   ├── AuditApp.tsx         # Upload, paste, samples, run, results and cases tabs
│   │   ├── Pipeline.tsx         # Live six-step progress
│   │   ├── Receipt.tsx          # The bill as a till receipt with highlighted lines
│   │   ├── Results.tsx          # Findings, approve switches, letter and phone script
│   │   ├── Verdict.tsx          # Summary totals by certainty
│   │   ├── Cases.tsx            # Case tracker, value dashboard, audit trail
│   │   ├── ThemeToggle.tsx      # Light / dark switch
│   │   └── fx/                  # BillJourney3D, CountUp, Icon, ShortcutKeys
│   └── lib/
│       ├── pipeline.ts          # Orchestrator, prompts, query redaction, price gate
│       ├── llm.ts               # Nemotron client, tier routing, provider failover
│       ├── rules.ts             # Deterministic checks
│       ├── tavily.ts            # Search chain: Tavily key 1, Tavily key 2, Ollama web search
│       ├── pdf.ts               # In-browser PDF reading (text layer or scan)
│       ├── cases.ts             # Case tracker storage (localStorage)
│       ├── samples.ts           # The three bundled sample bills
│       └── types.ts             # Shared types and stream events
├── public/
│   ├── logo-icon.png            # App logo (header, README), built from Logo.png
│   ├── pdf.worker.min.mjs       # PDF.js worker (required for PDF upload)
│   └── samples/                 # india-hospital-bill.png, utility-bill.pdf
├── eval/                        # 21-bill benchmark: cases, runner, results.json
├── scripts/
│   ├── unit.ts, test-redact.ts  # Offline unit tests (npm test)
│   ├── smoke.mjs                # End-to-end test against a running server
│   ├── e2e.ts                   # Full pipeline from the command line
│   ├── failover-test.ts         # Simulates Nebius failures
│   ├── check-models.mjs         # Verifies model IDs on each provider
│   ├── check-secrets.mjs        # Blocks commits that contain API keys
│   ├── make-icons.py            # Builds the app icons from Logo.png
│   └── make-sample-pdf.py       # Builds public/samples/utility-bill.pdf
├── .githooks/pre-commit         # Runs check-secrets before every commit
├── .env.example                 # Every setting documented (no values)
├── cloudflare.config.ts         # Cloudflare Worker settings (name, compatibility, assets)
├── vite.config.ts               # vinext build for Cloudflare Workers
├── postcss.config.mjs           # Tailwind CSS for the Vite build
├── .node-version                # Node 24 for Cloudflare builds
├── Logo.png                     # Source logo (run scripts/make-icons.py after changing it)
├── DESIGN.md                    # Colour, type and motion system
├── LICENSE                      # MIT
└── README.md
```

---

## Prerequisites

- **Node.js 22.23+** and `npm` (Node 24 LTS recommended; the Cloudflare deploy tools need it).
- At least one NVIDIA Nemotron key: [Nebius Token Factory](https://tokenfactory.nebius.com)
  (primary) and/or [NVIDIA Build](https://build.nvidia.com) (fallback). Using both gives
  automatic failover.
- Recommended: a [Tavily](https://app.tavily.com) key for live research, and an
  [Ollama](https://ollama.com/settings/keys) key as the research fallback. Without either, the
  audit still runs and price findings are marked lower confidence.
- Optional: Python 3, only to rebuild the icons (Pillow, NumPy, SciPy) or the sample PDF
  (reportlab).

---

## Quick Start

One process, one terminal (Windows cmd shown).

```bat
cd /d C:\path\to\Quibillix
npm install
copy .env.example .env.local
:: Open .env.local and fill in NEBIUS_API_KEY and/or NVIDIA_API_KEY, TAVILY_API_KEY, OLLAMA_API_KEY
npm run check-models
npm run dev
```

Open:

- App: `http://localhost:3000`
- Live status: `http://localhost:3000/api/health`
- Provider chain and model routing: `http://localhost:3000/api/audit`

Click a sample bill (US emergency room visit, India private hospital, mobile and broadband
bill, or the hospital photo or utility PDF), then **Check my bill**. Press `Ctrl + Enter` to jump
to the bill box, or to run the audit once a bill is loaded.

`npm install` also turns on the pre-commit secret check (`.githooks/pre-commit`). On macOS or
Linux, use `cp` instead of `copy`.

---

## Backend Setup

The backend is the Next.js API routes in `src/app/api/` (`/api/audit`, `/api/letter`,
`/api/health`). They run in the same process as the UI, so there is no separate server to
start.

**Model and search keys.** Add to `.env.local` in the project root (git-ignored; every setting
is described in `.env.example`):

```env
# Main AI: NVIDIA Nemotron on Nebius Token Factory
NEBIUS_API_KEY=your-key-here
# Backup, used automatically when Nebius is missing, slow or erroring
NVIDIA_API_KEY=your-key-here
# Live research, with Ollama web search as the automatic backup
TAVILY_API_KEY=your-key-here
OLLAMA_API_KEY=your-key-here
RATE_LIMIT_PER_HOUR=20
```

**All settings:**

| Variable | Required | Purpose |
|---|---|---|
| `NEBIUS_API_KEY` | One of the two | Nebius Token Factory key (primary provider) |
| `NEBIUS_BASE_URL` | No | Defaults to `https://api.tokenfactory.nebius.com/v1` |
| `MODEL_VISION`, `MODEL_FAST`, `MODEL_MID`, `MODEL_DEEP` | No | Nemotron model ID per tier on Token Factory |
| `NVIDIA_API_KEY` | One of the two | NVIDIA Build key (automatic fallback) |
| `NVIDIA_BASE_URL` | No | Defaults to `https://integrate.api.nvidia.com/v1` |
| `NVIDIA_MODEL_VISION`, `_FAST`, `_MID`, `_DEEP` | No | Nemotron model ID per tier on NVIDIA Build |
| `TAVILY_API_KEY` | Recommended | Live fair-price and consumer-law research |
| `TAVILY_API_KEY_2` | No | Second Tavily key, tried when the first fails or runs out of credits |
| `OLLAMA_API_KEY` | Recommended | Last research fallback, when every Tavily key has failed |
| `RATE_LIMIT_PER_HOUR` | No | Audits per visitor IP per hour (default `20`) |
| `THINK_TIERS` | No | Turn on Nemotron reasoning mode per tier, for example `deep` |
| `LLM_TIMEOUT_<TIER>_MS` | No | Per-attempt timeout before retry and failover |
| `TAVILY_TIMEOUT_MS`, `OLLAMA_TIMEOUT_MS` | No | Search timeouts (default 25 s each) |

Check that every model ID exists on its provider:

```bat
npm run check-models
```

If a model shows as `MISSING`, copy the matching ID from the output into `.env.local`. Restart
the server after any change to `.env.local`; it is read only at start-up.

---

## Frontend Setup

```bat
npm install
npm run dev
```

Open `http://localhost:3000`. The UI calls the API routes on the same address, so there is no
backend URL or CORS to configure. For a production build, run `npm run build`, then
`npm start`.

PDF reading uses `public/pdf.worker.min.mjs`, which must stay in `public/`. The theme (light by
default) is set before the first paint by a small script in `src/app/layout.tsx`, so the page
never flashes the wrong colours.

---

## API Reference

Base URL: `http://localhost:3000` (local). No authentication; audits are rate limited per IP.

### `POST /api/audit`

Runs the full pipeline and streams one JSON event per line (`application/x-ndjson`).

```json
{ "text": "bill text (or omit and send imageDataUrl)", "imageDataUrl": "data:image/jpeg;base64,...", "context": "optional note from the user" }
```

| Event `type` | Payload |
|---|---|
| `step` | `step` (`extract`, `rules`, `triage`, `research`, `audit`, `letter`), `status` (`running`, `done`, `skipped`, `error`), `model`, `detail`, `ms` |
| `bill` | The parsed bill: line items, dates, currency, stated totals |
| `findings` | Findings so far, each with `certainty`, `estimatedOvercharge` and `citations` |
| `evidence` | Research results per query |
| `result` | Final result: totals by certainty, summary, letter, phone script, models used, duration |
| `error` | A message, if the run failed |

### `GET /api/audit`

The configured provider chain, model IDs per tier, and whether Tavily and Ollama keys are set.

### `POST /api/letter`

Rewrites the dispute letter from only the findings the user approved.

```json
{ "bill": { "...": "parsed bill" }, "findings": [ "approved findings" ], "total": 652, "context": "optional" }
```

Returns `{ "letter": "...", "phoneScript": "..." }`.

### `GET /api/health`

Pings every model provider (1 token on the smallest model), Tavily and Ollama. Cached for 60 s;
add `?fresh` to bypass the cache.

```json
{ "status": "ok", "primary": "Nebius Token Factory", "checkedAt": "2026-10-29T17:42:41.000Z", "checks": [ { "name": "Tavily search", "ok": true, "ms": 412 } ] }
```

`status` is `ok` (everything up), `degraded` (a provider or both search engines down) or `down`
(no model provider up, HTTP `503`).

**Example:**

```bash
curl -N -X POST http://localhost:3000/api/audit -H "Content-Type: application/json" -d "{\"text\":\"ER visit 99285 x1 2400.00\nX-ray 71046 x1 612.00\nX-ray 71046 x1 612.00\"}"
```

---

## Database Schema

Quibillix has **no server database and no accounts**. Nothing about a bill is saved on the
server. The only persistent data is in the user's own browser (`localStorage`), so each person
sees only their own cases.

| Store | Purpose and key fields |
|---|---|
| `quibillix.cases.v1` | Up to 50 dispute cases: `id` (`QB-...`), `createdAt`, `provider`, `currency`, `totalBilled`, `confirmedTotal`, `suspectedTotal`, `approvedTotal`, `approvedIds`, `status` (`draft`, `sent`, `responded`, `resolved`), `recovered`, `durationMs`, `findingsCount`, `result` (full audit), `letter`, `trail` |
| `trail[]` (inside each case) | Audit trail events: `at` (ISO timestamp), `actor` (`agent` or `user`), `action`, `detail` |
| `quibillix-theme` | `light` (default) or `dark` |
| Server memory (not persisted) | Rate limiter: request timestamps per visitor IP for the last hour, reset on restart |

Every agent step and every human decision (approve, reject, status change, amount recovered) is
added to the case's audit trail. Deleting a case removes it and its trail; clearing your
browser's site data deletes all cases.

---

## Security and Privacy Model

- **Bills are processed in memory.** They are sent only to the model provider (Nebius Token
  Factory, or NVIDIA Build on failover) and never written to disk.
- **PDFs are read in your browser.** Digital PDFs never leave the device as files; only their
  extracted text is sent when you click **Check my bill**.
- **Search engines never see the bill.** Tavily and Ollama receive only the generated search
  queries, after `redactQuery` removes names, account, member, policy, claim and UHID numbers,
  emails, phone numbers and long numeric IDs. Billing codes and years are kept.
- **No invented sources.** The audit may only cite URLs that research actually returned.
- **Human in the loop.** Nothing is disputed until you approve each finding; the letter is
  rebuilt from approved items only.
- **Input validation.** Text is capped at 20,000 characters, the note at 2,000, the letter
  request at 40 findings, and images must be `data:image/` URLs.
- **Rate limiting per visitor** -- `RATE_LIMIT_PER_HOUR` audits per IP (HTTP `429` beyond that),
  so a public demo cannot drain API credits.
- **Secrets stay out of git** -- API keys live only in `.env.local` locally and as encrypted
  Secrets in the Cloudflare Worker settings. `.gitignore` excludes every `.env` variant,
  `.dev.vars`, keys, certificates,
  credentials and CLI token folders. `npm run check-secrets` scans every committable file for
  key patterns and for the real values in `.env.local`, and the pre-commit hook blocks any
  commit that fails it.

---

## Operational Limits and Constraints

| Constraint | Value | Where |
|---|---|---|
| Bill text | 20,000 characters | `src/app/api/audit/route.ts` |
| User note (context) | 2,000 characters | `src/app/api/audit/route.ts` |
| Photo size sent | Longest side 1,800 px, JPEG 85% | `src/components/AuditApp.tsx` |
| PDF pages read | 4 (text), 2 (scanned, rendered as one image) | `src/lib/pdf.ts` |
| Audits per IP | 20 per hour (configurable) | `RATE_LIMIT_PER_HOUR` |
| Audit request duration | No wall-clock limit on Cloudflare Workers while the stream is open; 300 s on Node hosts | `maxDuration` in `/api/audit` and `/api/letter` |
| Worker CPU time | 10 ms per request on the Workers Free plan, 30 s on Workers Paid (waiting on model and search APIs does not count) | Cloudflare plan |
| Model timeouts | fast 60 s, mid 90 s, vision 90 s, deep 120 s | `LLM_TIMEOUT_<TIER>_MS` |
| Retries per model call | 1 (on 429, 5xx, timeout or network error) | `src/lib/llm.ts` |
| Search timeout | 25 s per query | `TAVILY_TIMEOUT_MS`, `OLLAMA_TIMEOUT_MS` |
| Research queries per audit | 3 to 4 | `src/lib/pipeline.ts` |
| Results per search query | 4 | `src/lib/tavily.ts` |
| Findings per letter rewrite | 40 | `src/app/api/letter/route.ts` |
| Stored cases | 50 most recent | `src/lib/cases.ts` |
| Health check cache | 60 s | `src/app/api/health/route.ts` |
| Manual baseline for time saved | 4 min per line | `src/components/Cases.tsx` |

---

## Deployment

**Live setup:** the whole app (UI and API routes) runs as one **Cloudflare Worker**, built with
[vinext](https://github.com/cloudflare/vinext) (Cloudflare's Vite-based Next.js runtime). There
is no separate backend or database to deploy. Worker settings live in `cloudflare.config.ts`
and the build in `vite.config.ts`.

> **Workers, not Pages.** Quibillix has server API routes that stream results, so it needs a
> Worker. Cloudflare Pages is only for static sites, and Cloudflare now recommends Workers for
> all new full-stack apps.

### Cloudflare Workers

**Needs Node.js 22.23 or newer** (Node 24 LTS recommended) and a free Cloudflare account.

1. Install dependencies: `npm install`
2. Deploy: `npm run deploy`. The first time, a browser opens so you can sign in to Cloudflare.
   It builds the app and prints your live URL: `https://quibillix.<your-subdomain>.workers.dev`.
3. Add your API keys as encrypted secrets. In the [Cloudflare dashboard](https://dash.cloudflare.com),
   go to **Workers & Pages > quibillix > Settings > Variables and Secrets > Add**. Choose type
   **Secret** for each of `NEBIUS_API_KEY`, `NVIDIA_API_KEY`, `TAVILY_API_KEY`,
   `TAVILY_API_KEY_2` and `OLLAMA_API_KEY`, and add any `MODEL_*` / `NVIDIA_MODEL_*` overrides
   from `.env.example` as type **Text**. Click **Deploy** to apply.
4. Check `https://quibillix.<your-subdomain>.workers.dev/api/health`; it should return `"status":"ok"`.
5. Run `npm run smoke -- https://quibillix.<your-subdomain>.workers.dev`, then add the
   `/api/health` URL to a free uptime monitor (for example UptimeRobot, every 5 minutes).

To ship changes later, run `npm run deploy` again. For automatic deploys on every push, open
the Worker in the dashboard: **Settings > Build > Connect** to your GitHub repository, with
build command `npm run build:vinext` and deploy command `npx vinext-cloudflare deploy`.

Local preview of the real Worker: copy `.env.local` to `.dev.vars` (git-ignored), then run
`npm run build:vinext` and `npm run start:vinext`.

### Other options

- **Any Node host** -- `npm run build` then `npm start` (port 3000, or set `PORT`).
- **Nebius Serverless Endpoints** -- it is a single stateless Node service, so it can run
  there unchanged.
- **Instant public link** -- `cloudflared tunnel --url http://localhost:3000` shares your local
  copy (works only while your computer is running).

---

## Running Tests

```bat
npm test
npm run lint
npm run check-secrets
```

With a server running (`npm run dev`) and API keys set:

```bat
npm run smoke
npm run eval
npm run e2e -- us-er
npm run failover-test
npm run check-models
```

| Command | Covers | Needs keys |
|---|---|---|
| `npm test` | Rules engine, totals capping, price gate (`scripts/unit.ts`) and the search privacy redactor (`scripts/test-redact.ts`) | No |
| `npm run lint` | ESLint (Next.js config) | No |
| `npm run check-secrets` | No API key or real secret value in any committable file | No |
| `npm run smoke [url]` | Health, every sample bill, the photo (vision) path and the approved-letter rewrite against a running server | Yes |
| `npm run eval` | The 21-bill accuracy benchmark; writes `eval/results.json` | Yes |
| `npm run e2e -- <id or path>` | Full pipeline from the command line (`us-er`, `in-hospital`, `telecom` or an image path) | Yes |
| `npm run failover-test` | Nebius returning 401, unreachable and hanging; all answered by NVIDIA Build | Yes |
| `npm run check-models` | Every configured model ID exists on its provider | Yes |

---

## Troubleshooting

### "Server has no model provider configured"

Neither `NEBIUS_API_KEY` nor `NVIDIA_API_KEY` is set. Add at least one to `.env.local` (or as a
Secret in the Cloudflare Worker settings, then redeploy) and restart `npm run dev`. Environment
changes are read only when the server starts.

### A model shows as `MISSING` in `npm run check-models`

That provider uses a different ID for the model. Copy the matching ID from the command's output
into `.env.local`, for example `MODEL_DEEP=...` or `NVIDIA_MODEL_DEEP=...`.

### Live research says Tavily failed (HTTP 432 or 429)

A Tavily key is out of credits or rate limited. Each query automatically tries
`TAVILY_API_KEY_2`, then Ollama web search (`OLLAMA_API_KEY`), and the audit continues; the step
shows which engine answered, including "(used backup Tavily key)". A key that runs out of credits
is skipped for 10 minutes. `/api/health` shows each key's status separately. Without any search
key, price findings are marked lower confidence.

### `/api/health` returns `degraded`

One model provider is down, or both search engines are. Audits still run on whatever is up.
Open `/api/health?fresh` to re-check now instead of waiting for the 60 s cache.

### "Rate limit reached, please try again in a bit"

More than `RATE_LIMIT_PER_HOUR` audits came from one IP in the last hour. Raise the limit in
`.env.local`, or wait. The counter resets when the server restarts.

### Uploading a PDF fails or shows an empty bill

The PDF.js worker could not load, or the PDF is password protected. Make sure
`public/pdf.worker.min.mjs` exists. For a protected or unusual PDF, upload a screenshot instead.

### The audit stops before the letter

The letter step failed (the model was busy), but the findings are kept. Click **Write the
letter** to try again. If you change which findings are approved, click **Rewrite to match**.

### Port 3000 already in use (Windows)

```bat
for /f "tokens=5" %a in ('netstat -ano ^| findstr :3000 ^| findstr LISTENING') do taskkill /PID %a /F
```

Or start on another port: `npx next dev -p 3100`.

### A commit is blocked by "a secret would be committed"

The pre-commit hook found an API key in a staged or committable file. Move it into `.env.local`
(git-ignored), then commit again. Run `npm run check-secrets` to see the file and the key name.

### Cloudflare deploy problems

| Problem | Fix |
|---|---|
| `Unknown file extension ".ts"` for `cloudflare.config.ts` | Node is older than 22.23; install Node 24 LTS from [nodejs.org](https://nodejs.org) |
| Live site's `/api/health` says a key is "not set" | Add it under **Workers & Pages > quibillix > Settings > Variables and Secrets** as type **Secret**, then click **Deploy** |
| Audit stops with "Worker exceeded CPU time limit" | Free plan CPU limit; upgrade to Workers Paid ($5/month, 30 s CPU) |
| `npm run deploy` asks you to log in again | Run `npx cf auth login`, then deploy again |

### Other common issues

| Problem | Fix |
|---|---|
| My cases disappeared | Cases are stored in this browser only; another browser, a private window or clearing site data shows none |
| Frontend changes do not appear after `npm start` | `npm start` serves the last build; run `npm run build` first |
| Tab still shows an old icon | Press `Ctrl + Shift + R` (browsers cache tab icons) |
| `.next` folder is large | Disposable build cache; delete it any time (stop the dev server first) |
| `AGENTS.md` keeps coming back | `next dev` writes it on purpose; commit it with your work |

---

## Learning Guide

Suggested reading order:

1. `src/lib/types.ts` -- the bill, finding, certainty and stream event shapes everything shares.
2. `src/app/api/audit/route.ts` -- input checks, rate limiting and the NDJSON stream.
3. `src/lib/pipeline.ts` -- `runAudit` from extraction to letter, `redactQuery` and
   `gatePriceOutliers`.
4. `src/lib/rules.ts` -- the deterministic checks that alone can confirm an error.
5. `src/lib/llm.ts` -- tier routing, timeouts, retries and Nebius to NVIDIA failover.
6. `src/lib/tavily.ts` -- the search chain: two Tavily keys, then Ollama web search.
7. `src/components/AuditApp.tsx` -- reading uploads, calling the API and rendering the stream.
8. `src/components/Results.tsx` and `src/app/api/letter/route.ts` -- human approval and the
   rewritten letter.
9. `src/lib/cases.ts` and `src/components/Cases.tsx` -- the case tracker and audit trail.
10. `eval/run.ts` -- how accuracy is scored.

**Glossary:** **CPT / HCPCS** -- US codes for medical procedures and supplies. **Upcoding** --
billing a more expensive service than the one provided. **Unbundling** -- billing separately
for parts of a procedure that should be charged as one. **Balance billing** -- charging a
patient the difference an insurer did not pay, often illegal under the US No Surprises Act.
**Cramming** -- unauthorized add-on charges on a phone bill. **MRP / NPPA** -- India's maximum
retail price and the regulator that caps drug prices. **NDJSON** -- one JSON object per line,
used to stream events. **Failover** -- switching to a backup service automatically when the
main one fails.

---

## Tech Stack

Next.js 16 · React 19 · TypeScript 5 · Tailwind CSS 4 · PDF.js (`pdfjs-dist`) ·
NVIDIA Nemotron (Nano, Super, Super VL, Ultra) · Nebius Token Factory · NVIDIA Build ·
Tavily Search · Ollama web search · NDJSON streaming · Browser localStorage · tsx ·
ESLint · Vite · vinext · Cloudflare Workers

---

<p align="center"><strong>Quibillix © 2026</strong></p>
