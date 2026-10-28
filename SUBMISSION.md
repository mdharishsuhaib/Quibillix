# Devpost submission kit: Quibillix

> Copy each section into the matching Devpost field. Fill in everything marked **TODO** yourself. The feedback section especially has to describe your own real experience to count.

## Project name
Quibillix: AI-Powered Bill Verification & Dispute Agent

*Every charge questioned. Every dispute supported.*

*(Name = "quibble" + "bill" + "x": challenging a disputed charge, with a modern technical edge.)*

## Tagline (≤ 200 chars)
An AI bill verification and dispute agent: Nemotron on Nebius checks every line, investigates with cited evidence, and drafts the dispute. You approve it and track what you recover.

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
Quibillix turns checking a bill into an agentic workflow with a human in charge of every decision:

1. **Check:** reads a photo or text of a medical, hospital, telecom or utility bill and verifies every line with deterministic checks (arithmetic, duplicates, totals, day counts, tax on exempt services, junk fees).
2. **Investigate:** NVIDIA Nemotron agents research live benchmarks and consumer law through Tavily, then audit for upcoding, unbundling, price outliers, balance billing and services never received. Every claim cites a real retrieved source.
3. **Build the dispute:** drafts an evidence-backed letter and phone script. Errors are stated as errors, suspicions as charges to justify, and gaps as requests for records.
4. **Resolve with oversight:** the user approves or rejects each finding, and the letter is rewritten for only what they approved. The case is then tracked from Draft to Resolved, with the amount actually recovered and a timestamped audit trail of every agent and human decision.

**Honest numbers.** Every finding is labelled **Confirmed error** (provable from the bill's own numbers, decided by code, never by the AI), **Suspected overcharge**, or **Needs info**. The dashboard keeps *flagged*, *confirmed*, *approved* and *actually recovered* money separate, plus estimated review time saved.

**Measured accuracy.** On a ground-truth benchmark of bills with planted errors plus a clean control bill, Quibillix caught **6 of 7 planted errors** with **0 false positives**, and the clean bill came back with **no findings**. Average time is about 1 minute per bill, against an estimated 30–60 minutes of manual review. `npm run eval` reproduces this.

It works across countries and currencies. The samples include a US ER bill, an Indian private-hospital bill (INR, read from a photo) and a US telecom bill.

## How we built it
Quibillix is a six-step agent pipeline that streams each step to the UI as it runs. Each step goes to the right-sized NVIDIA Nemotron model on Nebius Token Factory:
1. **Extract:** Nemotron 3.5 Super VL reads photos of bills, and Nemotron 3 Nano parses pasted text into structured JSON.
2. **Hard checks:** deterministic TypeScript checks for math, duplicates, totals and fees. These never hallucinate, and the audit receives them as given facts.
3. **Plan:** Nemotron 3 Super picks the charges most likely to be wrong and writes targeted search queries.
4. **Research:** Tavily searches the live web in parallel for benchmark prices and consumer-protection rules.
5. **Audit:** Nemotron 3 Ultra reasons over the bill, the hard-check results, the user's account and the evidence. Its findings carry confidence levels and numbered citations. Citations can only point to retrieved sources, and dollar estimates are capped at the line amount.
6. **Dispute:** Nemotron 3 Super writes the letter and the phone script.

Token Factory's OpenAI-compatible API let us route by tier and add an automatic fallback chain (Ultra → Super, Nano → Super). The demo keeps working if a model is busy, and most tokens go through the cheap models.

## Challenges we ran into
- **Getting LLMs to do arithmetic reliably.** We moved the math out of the model entirely into a rules engine and passed those results into the audit as facts. Only code can mark a finding "confirmed".
- **Hallucinated citations.** We give the model a numbered evidence list and map its numbers back to real URLs on the server. If a source wasn't retrieved, it can't be cited.
- **Double counting.** Several findings can hit the same line, so totals are capped per line and never count more than the line itself.
- **Reasoning latency.** With thinking enabled, the Nemotron models took 5+ minutes per audit, and on one run the letter came back empty because reasoning used up the token budget. Disabling thinking (`chat_template_kwargs.enable_thinking=false`) cut a full audit to about 1–2 minutes. On our benchmark, Ultra was *more* thorough in non-thinking mode.
- **"Everything looks fine" noise.** Early runs listed "this charge is within range" as findings. We tightened the prompt and filter zero-value commentary, so the clean control bill now returns zero findings.

## Accomplishments that we're proud of
- **Measured, not claimed:** 6/7 planted errors caught, 0 false positives, and the clean bill came back clean (`npm run eval`).
- **A full loop, not a chatbot:** check → investigate → dispute → human approval → tracking → recovered amount, with an audit trail.
- **US ER sample:** flags the duplicate X-ray, supplies arithmetic (3 × $65 ≠ $235), a level-5 ER code for a sprained ankle and No Surprises Act balance billing, citing sources for each.
- **Indian hospital sample (read from a photo):** flags an ICU charge with no ICU stay, 4 room-days billed for 3 nights, GST on GST-exempt healthcare, platelets priced around 3× the state rate, and a 10% "service charge".

## What we learned
**TODO:** write this in your own words (e.g. which Nemotron model surprised you, and what model routing did to cost and latency).

## What's next for Quibillix
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
| 0:00–0:15 | ER bill, $6,447 | "This is a $6,447 ER bill for a sprained ankle. Most people just pay it. Watch what happens." |
| 0:15–0:35 | Click sample → **Audit my bill**; pipeline lights up step by step | "Quibillix **checks** every line, then NVIDIA Nemotron agents on Nebius Token Factory **investigate**, researching live prices and law with Tavily." |
| 0:35–1:05 | Banner: flagged / **confirmed** / suspected; findings with certainty badges and sources | "A confirmed arithmetic error, which is provable from the bill itself. A duplicate X-ray. A level-5 code for a sprain. Surprise out-of-network billing. Suspicions are labelled as suspicions, and each one cites its source." |
| 1:05–1:35 | **Untick** one finding → "Rewrite letter for approved items" → letter updates | "Nothing goes out without me. I reject what I'm not sure about, and the agent rewrites the dispute for exactly what I approved." |
| 1:35–1:55 | **Approve & track** → My disputes: status, audit trail, log "recovered" | "Then it tracks the case to resolution, with an audit trail of every agent and human decision, and the money I actually got back." |
| 1:55–2:20 | **📷 Photo of a bill** (Indian hospital) → results | "It reads photos with Nemotron Super VL, in any currency. It catches an ICU charge with no ICU stay, extra room-days, and GST on GST-exempt healthcare." |
| 2:20–2:45 | Terminal: `npm run eval` summary; pipeline sidebar model names | "We measured it. On bills with planted errors it caught 6 of 7, with zero false positives, and a clean bill stays clean. Each step uses the right-sized Nemotron, all through one Token Factory API." |
| 2:45–3:00 | Value dashboard | "Billing errors cost people money every day. Quibillix gives everyone a billing advocate. Try it at [URL]." |

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
