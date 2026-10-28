# Devpost submission kit: Fairbill

> Copy each section into the matching Devpost field. Fill in everything marked **TODO** yourself. The feedback section especially has to describe your own real experience to count.

## Project name
Fairbill: a second opinion for every bill

## Tagline (≤ 200 chars)
Snap a photo of a medical, hospital or phone bill. Nemotron agents on Nebius find the overcharges, cite the rule, and write your dispute letter.

## Track
Best Apps and Agents

## Built with
nvidia-nemotron, nebius-token-factory, tavily, next.js, react, typescript, tailwindcss, vercel

## Links
- Demo: **TODO** Vercel URL
- Repo: **TODO** GitHub URL
- Video: **TODO** YouTube URL

---

## Inspiration
Billing errors are common, and the people who can least afford them are the ones who pay them anyway. Itemized bills come in a language patients don't speak (CPT codes, revenue codes, "consumables", "service charge 10%"). Fighting them takes hours of research that most people don't have. Hospitals and carriers have billing departments; patients have nobody. We wanted to give everyone a billing advocate for the price of a few API calls.

## What it does
Fairbill takes a photo, a screenshot or pasted text of a bill, plus an optional sentence about what actually happened. It returns:
- **The amount you can credibly dispute**, broken down by issue: duplicates, math errors, price outliers, upcoding, unbundling, balance billing, junk fees and items never received.
- **Evidence:** each AI finding cites the live web sources it relied on (fee schedules, laws, regulator rules).
- **A ready-to-send dispute letter** (editable, downloadable) and a **phone script** for calling the billing office.

It works across countries and currencies. The samples include a US ER bill, an Indian private-hospital bill in INR and a US telecom bill.

## How we built it
Fairbill is a six-step agent pipeline that streams each step to the UI as it runs. Each step goes to the right-sized NVIDIA Nemotron model on Nebius Token Factory:
1. **Extract:** Nemotron 3.5 Super VL reads photos of bills, and Nemotron 3 Nano parses pasted text into structured JSON.
2. **Hard checks:** deterministic TypeScript checks for math, duplicates, totals and fees. These never hallucinate, and the audit receives them as given facts.
3. **Plan:** Nemotron 3 Super picks the charges most likely to be wrong and writes targeted search queries.
4. **Research:** Tavily searches the live web in parallel for benchmark prices and consumer-protection rules.
5. **Audit:** Nemotron 3 Ultra reasons over the bill, the hard-check results, the user's account and the evidence. Its findings carry confidence levels and numbered citations. Citations can only point to retrieved sources, and dollar estimates are capped at the line amount.
6. **Dispute:** Nemotron 3 Super writes the letter and the phone script.

Token Factory's OpenAI-compatible API let us route by tier and add an automatic fallback chain (Ultra → Super, Nano → Super). The demo keeps working if a model is busy, and most tokens go through the cheap models.

## Challenges we ran into
- **Getting LLMs to do arithmetic reliably.** We moved the math out of the model entirely into a rules engine and passed those results into the audit as facts.
- **Hallucinated citations.** We give the model a numbered evidence list and map its numbers back to real URLs on the server. If a source wasn't retrieved, it can't be cited.
- **Double counting.** Several findings can hit the same line, so the disputable total spreads each line's amount across its findings and never counts more than the line itself.
- **TODO:** add anything real you hit (rate limits, a JSON-mode quirk, deployment issues).

## Accomplishments that we're proud of
- On the US ER sample it finds the duplicate X-ray, a supplies line that doesn't add up (3 × $65 ≠ $235), the late fee, a level-5 ER visit for a sprained ankle (upcoding) and surprise out-of-network physician billing, then writes a complete letter. **TODO:** replace this with your actual result numbers.
- Sources are shown for every AI claim.
- It works on a phone photo.

## What we learned
**TODO:** write this in your own words (e.g. which Nemotron model surprised you, and what model routing did to cost and latency).

## What's next for Fairbill
- PDF upload and multi-page EOB + itemized-bill reconciliation
- Insurer-specific appeal templates and deadline tracking
- Running background follow-ups as Nebius Serverless Jobs (e.g. re-checking a corrected bill)
- A hosted Nebius Serverless Endpoint deployment

---

## Feedback
> The judges reward specific, honest feedback, and there's a separate $100 prize for it. Replace every bullet with what YOU actually saw. Leave out anything you didn't experience.

**Nebius Token Factory**
- *Used for:* all LLM inference. Four Nemotron models behind one OpenAI-compatible endpoint, routed per pipeline step.
- *What worked well:* **TODO** (e.g. time from signup to the first successful call, the OpenAI compatibility, latency of Nano and Super, how easy model switching was)
- *What needs work:* **TODO** (e.g. model IDs differing between the docs and `/v1/models`, `response_format` support per model, unclear rate limits, how errors are reported, how billing and credits are shown)
- *Onboarding (zero to hello world):* **TODO** minutes, with any friction points
- *Would we build with it again?* **TODO**, and why

**NVIDIA Nemotron (Nano / Super / Ultra / Super VL)**
- *Nano:* **TODO**: JSON extraction quality and speed
- *Super:* **TODO**: letter-writing quality
- *Ultra:* **TODO**: reasoning quality on billing codes, latency, any `<think>` output we had to strip
- *Super VL:* **TODO**: accuracy reading phone photos of bills

**Tavily**
- **TODO**: relevance of results for fee-schedule and legal queries; usefulness of `include_answer`

---

## Demo video script (≤ 3:00): get to the aha moment within 30 s

| Time | Show | Say |
| --- | --- | --- |
| 0:00–0:15 | Real-looking ER bill, $6,447 | "This is a $6,447 ER bill for a sprained ankle. Most people just pay it. Watch what happens." |
| 0:15–0:35 | Click sample → **Audit my bill**; pipeline lights up | "Fairbill sends it through a team of NVIDIA Nemotron agents on Nebius Token Factory." |
| 0:35–1:05 | Green banner with the disputable $, findings list | "Duplicate X-ray. Supplies that don't add up. A level-5 ER code for a sprain. Surprise out-of-network billing. Each finding cites its source." |
| 1:05–1:30 | Letter tab → phone script → download | "It writes the dispute letter and the script for calling billing. Done in under a minute." |
| 1:30–2:00 | Upload a **phone photo** of a bill (Indian hospital sample, printed) | "It reads photos with Nemotron Super VL, in any currency. Here it flags an ICU charge on a patient who was never in the ICU, plus a 10% service charge." |
| 2:00–2:40 | Pipeline sidebar showing model names/timings; quick view of `llm.ts` routing table | "Every step runs on the right-sized Nemotron: Nano for extraction, Super for planning and writing, Ultra for the deep audit, and Tavily for live research. All through one Token Factory API, with automatic fallbacks." |
| 2:40–3:00 | Back to the banner | "Billing errors cost people money every day. Fairbill gives everyone a billing advocate. Try it at [URL]." |

Recording tips: use 1080p, zoom the browser to 110–125%, and do one dry run first so the Ultra step isn't cold. Use no copyrighted music (YouTube Audio Library is safe). Set the video to **Public**.

---

## Final checklist
- [ ] `NEBIUS_API_KEY` works and `npm run check-models` shows all four models `OK`
- [ ] Tavily key added (needed for the **Best Use of Tavily** bonus prize)
- [ ] All three samples tested end to end locally
- [ ] Repo pushed to GitHub, **public**, MIT license showing in the About sidebar
- [ ] Deployed to Vercel with env vars, demo URL tested in an incognito window
- [ ] Video uploaded to YouTube as **Public**, under 3:00
- [ ] Devpost: track = Best Apps and Agents, all fields filled, feedback written, **Submit** clicked before **Oct 30, 10:30 PM IST**
