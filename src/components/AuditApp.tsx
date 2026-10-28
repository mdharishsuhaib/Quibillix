"use client";

import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import { SAMPLES } from "@/lib/samples";
import { agentTrail, loadCases, newCaseId, now, serverCases, subscribeCases, upsertCase, type DisputeCase } from "@/lib/cases";
import type { AuditResult, Evidence, Finding, ParsedBill, StepId, StreamEvent } from "@/lib/types";
import Pipeline, { STEPS, type StepState } from "./Pipeline";
import { FindingCard, LetterPanel, LineItems, money } from "./Results";
import Cases, { manualMinutes } from "./Cases";
import { readPdf } from "@/lib/pdf";

/** Client-side mirror of the server's per-line capped total, for approved subsets. */
function cappedTotal(findings: Finding[], bill: ParsedBill) {
  const order = { confirmed: 0, suspected: 1, needs_info: 2 } as const;
  const lineAmount = new Map(bill.lineItems.map((li) => [li.id, li.amount]));
  const used = new Map<string, number>();
  let total = 0;
  for (const f of [...findings].sort((a, b) => order[a.certainty] - order[b.certainty])) {
    let take = f.estimatedOvercharge;
    if (f.lineItemIds.length) {
      const room = f.lineItemIds.reduce((s, id) => s + Math.max(0, (lineAmount.get(id) || 0) - (used.get(id) || 0)), 0);
      take = Math.min(take, room);
      let left = take;
      for (const id of f.lineItemIds) {
        const r = Math.max(0, (lineAmount.get(id) || 0) - (used.get(id) || 0));
        const t = Math.min(r, left);
        used.set(id, (used.get(id) || 0) + t);
        left -= t;
      }
    }
    total += take;
  }
  return Math.round(total * 100) / 100;
}

const initialSteps = () =>
  Object.fromEntries(STEPS.map((s) => [s.id, { status: "pending" } as StepState])) as Record<StepId, StepState>;

/** Downscale images in the browser so uploads stay small and fast. */
async function fileToDataUrl(file: File, maxSide = 1800): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.85);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function AuditApp() {
  const [text, setText] = useState("");
  const [context, setContext] = useState("");
  const [image, setImage] = useState<{ name: string; dataUrl: string } | null>(null);
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState(initialSteps);
  const [bill, setBill] = useState<ParsedBill | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [result, setResult] = useState<AuditResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Human-in-the-loop review state
  const [approved, setApproved] = useState<Set<string>>(new Set());
  const [letter, setLetter] = useState("");
  const [phoneScript, setPhoneScript] = useState("");
  const [letterFor, setLetterFor] = useState(""); // approval signature the current letter was written for
  const [regenerating, setRegenerating] = useState(false);
  const [caseId, setCaseId] = useState<string | null>(null);
  const [tab, setTab] = useState<"audit" | "cases">("audit");
  const fileRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  const cases = useSyncExternalStore(subscribeCases, loadCases, serverCases);
  const refreshCases = () => {}; // store notifies subscribers on save

  const approvedFindings = useMemo(() => findings.filter((f) => approved.has(f.id)), [findings, approved]);
  const approvedTotal = useMemo(() => (bill ? cappedTotal(approvedFindings, bill) : 0), [approvedFindings, bill]);
  const signature = [...approved].sort().join(",");
  const letterStale = Boolean(result && letter && signature !== letterFor);
  const needsLetter = Boolean(result && !letter && approved.size > 0);

  const toggle = (id: string) =>
    setApproved((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const regenerate = async () => {
    if (!bill || !approvedFindings.length) return;
    setRegenerating(true);
    try {
      const res = await fetch("/api/letter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bill, findings: approvedFindings, total: approvedTotal, context }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Letter failed");
      setLetter(j.letter);
      setPhoneScript(j.phoneScript);
      setLetterFor(signature);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRegenerating(false);
    }
  };

  const approveAndTrack = () => {
    if (!result || !bill) return;
    const existing = caseId ? cases.find((c) => c.id === caseId) : undefined;
    const id = existing?.id ?? newCaseId();
    const rejected = findings.filter((f) => !approved.has(f.id));
    const c: DisputeCase = {
      id,
      createdAt: existing?.createdAt ?? now(),
      provider: bill.provider || "Unknown provider",
      currency: bill.currency,
      totalBilled: result.totalBilled,
      confirmedTotal: result.confirmedTotal,
      suspectedTotal: result.suspectedTotal,
      approvedTotal,
      approvedIds: [...approved],
      status: existing?.status ?? "draft",
      recovered: existing?.recovered ?? 0,
      durationMs: result.durationMs,
      findingsCount: findings.length,
      result,
      letter,
      trail: [
        ...(existing?.trail ?? agentTrail(result)),
        {
          at: now(),
          actor: "user",
          action: existing ? "Updated approved findings" : "Reviewed & approved dispute",
          detail: `${approved.size} approved (${money(approvedTotal, bill.currency)})${rejected.length ? ` · ${rejected.length} rejected: ${rejected.map((f) => f.title).join("; ").slice(0, 200)}` : ""}`,
        },
      ],
    };
    upsertCase(c);
    setCaseId(id);
    refreshCases();
  };

  const openCase = (c: DisputeCase) => {
    setTab("audit");
    setBill(c.result.bill);
    setFindings(c.result.findings);
    setResult(c.result);
    setEvidence([]);
    setApproved(new Set(c.approvedIds));
    setLetter(c.letter);
    setPhoneScript(c.result.phoneScript);
    setLetterFor([...c.approvedIds].sort().join(","));
    setCaseId(c.id);
    setError(null);
    setSteps(Object.fromEntries(STEPS.map((s) => [s.id, { status: "done", model: c.result.models[s.id] } as StepState])) as Record<StepId, StepState>);
  };

  const loadSample = (id: string) => {
    const s = SAMPLES.find((x) => x.id === id)!;
    setText(s.text);
    setContext(s.context);
    setImage(null);
  };

  const onFile = async (file?: File) => {
    if (!file) return;
    setError(null);
    if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
      try {
        const pdf = await readPdf(file);
        if (pdf.kind === "text") {
          setText(pdf.text);
          setImage(null);
        } else {
          setImage({ name: `${file.name} (scanned, ${pdf.pages} page${pdf.pages > 1 ? "s" : ""})`, dataUrl: pdf.dataUrl });
        }
      } catch (e) {
        setError(`Couldn't read that PDF (${e instanceof Error ? e.message : e}). Try a screenshot instead.`);
      }
    } else if (file.type.startsWith("image/")) {
      setImage({ name: file.name, dataUrl: await fileToDataUrl(file) });
    } else if (file.type.startsWith("text/") || /\.(txt|csv|md)$/i.test(file.name)) {
      setText(await file.text());
      setImage(null);
    } else {
      setError("Please upload a PDF, a photo/screenshot (JPG, PNG, WebP) or a text file.");
    }
  };

  const run = async () => {
    setRunning(true);
    setSteps(initialSteps());
    setBill(null);
    setFindings([]);
    setEvidence([]);
    setResult(null);
    setError(null);
    setApproved(new Set());
    setLetter("");
    setPhoneScript("");
    setLetterFor("");
    setCaseId(null);
    setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);

    try {
      const res = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text || undefined, imageDataUrl: image?.dataUrl, context: context || undefined }),
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || `Request failed (${res.status})`);
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() || "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const ev = JSON.parse(line) as StreamEvent;
          switch (ev.type) {
            case "step":
              setSteps((s) => ({ ...s, [ev.step]: { status: ev.status, model: ev.model, detail: ev.detail, ms: ev.ms } }));
              break;
            case "bill":
              setBill(ev.bill);
              break;
            case "findings":
              setFindings(ev.findings);
              break;
            case "evidence":
              setEvidence(ev.evidence);
              break;
            case "result": {
              const r = ev.result;
              setResult(r);
              setFindings(r.findings);
              // Default review: approve everything except "needs info" (those go in as itemization requests only if the user ticks them).
              const ids = r.findings.filter((f) => f.certainty !== "needs_info").map((f) => f.id);
              setApproved(new Set(ids));
              setLetter(r.letter);
              setPhoneScript(r.phoneScript);
              // The agent's draft was written for exactly this default selection.
              setLetterFor([...ids].sort().join(","));
              break;
            }
            case "error":
              setError(ev.message);
              break;
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  };

  const started = running || bill || error || result;
  const currency = bill?.currency || "USD";

  return (
    <div className="space-y-8">
      <nav className="no-print flex gap-1 rounded-xl border border-steel bg-carbon p-1 text-sm">
        {(
          [
            ["audit", "Audit a bill"],
            ["cases", `My disputes${cases.length ? ` (${cases.length})` : ""}`],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex-1 rounded-lg px-3 py-2 ${tab === id ? "bg-raised font-medium text-frost shadow-[inset_0_-2px_0_var(--glacier)]" : "text-mist hover:text-frost"}`}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === "cases" && (
        <section>
          <h2 className="mb-1 text-lg font-semibold">My disputes</h2>
          <p className="mb-4 text-sm text-mist">
            Track each dispute from draft to resolution. Everything here is stored only in this browser.
          </p>
          <Cases cases={cases} onChange={refreshCases} onOpen={openCase} />
        </section>
      )}

      {tab === "audit" && (
      <>
      {/* ---------------- input ---------------- */}
      <section className="no-print panel p-5">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-sm text-mist">Try a sample:</span>
          {SAMPLES.map((s) => (
            <button
              key={s.id}
              onClick={() => loadSample(s.id)}
              disabled={running}
              className="rounded-full border border-steel px-3 py-1 text-sm text-frost transition hover:border-glacier/60 hover:bg-glacier/10 disabled:opacity-40"
              title={s.blurb}
            >
              {s.label}
            </button>
          ))}
          <button
            onClick={async () => {
              const blob = await (await fetch("/samples/india-hospital-bill.png")).blob();
              await onFile(new File([blob], "india-hospital-bill.png", { type: "image/png" }));
              setContext(SAMPLES.find((x) => x.id === "in-hospital")!.context);
            }}
            disabled={running}
            className="rounded-full border border-dashed border-cobalt/60 px-3 py-1 text-sm text-cobalt transition hover:bg-cobalt/10 disabled:opacity-40"
            title="Tests the vision path (Nemotron 3.5 Super VL)"
          >
            📷 Photo of a bill
          </button>
          <button
            onClick={async () => {
              const blob = await (await fetch("/samples/utility-bill.pdf")).blob();
              await onFile(new File([blob], "utility-bill.pdf", { type: "application/pdf" }));
              setContext("Single-person flat. I submitted an actual meter reading of 14,250 on 30 Sept. I pay by direct debit on time every month.");
            }}
            disabled={running}
            className="rounded-full border border-dashed border-cobalt/60 px-3 py-1 text-sm text-cobalt transition hover:bg-cobalt/10 disabled:opacity-40"
            title="Tests PDF upload (text layer read in your browser)"
          >
            📄 PDF utility bill
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-[1fr_320px]">
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              onFile(e.dataTransfer.files?.[0]);
            }}
          >
            <label className="mb-1 block text-sm font-medium text-frost">Your bill</label>
            {image ? (
              <div className="flex items-start gap-3 rounded-lg border border-dashed border-steel bg-ink/50 p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image.dataUrl} alt="bill" className="h-40 w-auto rounded border border-steel object-contain" />
                <div className="text-sm">
                  <p className="font-medium">{image.name}</p>
                  <p className="text-mist">Will be read by <span className="text-uv">Nemotron 3.5 Super VL</span>.</p>
                  <button onClick={() => setImage(null)} className="mt-2 text-coral underline">
                    Remove
                  </button>
                </div>
              </div>
            ) : (
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Paste the text of your bill / EOB here, or drop a photo of it…"
                className="field h-64 w-full resize-y p-3 font-mono text-xs"
              />
            )}
            <div className="mt-2 flex items-center gap-3 text-sm">
              <button onClick={() => fileRef.current?.click()} className="btn-ghost px-3 py-1.5">
                Upload PDF / photo
              </button>
              <span className="text-xs text-mist/70">PDF, JPG, PNG, WebP or .txt. Drag & drop works too</span>
              <input
                ref={fileRef}
                type="file"
                accept="application/pdf,.pdf,image/*,.txt,.csv,.md"
                className="hidden"
                onChange={(e) => onFile(e.target.files?.[0])}
              />
            </div>
          </div>

          <div className="flex flex-col">
            <label className="mb-1 block text-sm font-medium text-frost">What happened? (optional, but it helps)</label>
            <textarea
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder="e.g. I was only in the ER for 2 hours for a sprained ankle. I have Aetna PPO; the hospital is in-network."
              className="field h-40 w-full resize-y p-3 text-sm"
            />
            <button
              onClick={run}
              disabled={running || (!text.trim() && !image)}
              className="btn-primary mt-4 px-4 py-3"
            >
              {running ? "Auditing…" : "Audit my bill"}
            </button>
          </div>
        </div>
      </section>

      {/* ---------------- output ---------------- */}
      {started && (
        <section ref={resultsRef} className="grid gap-6 lg:grid-cols-[260px_1fr]">
          <aside className="no-print panel h-fit p-4 lg:sticky lg:top-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-uv">Agent pipeline</h3>
            <Pipeline steps={steps} />
          </aside>

          <div className="min-w-0 space-y-6">
            {error && <div className="rounded-xl border border-coral/40 bg-coral/10 p-4 text-sm text-coral">{error}</div>}

            {result && (
              <div className="prism-border relative overflow-hidden rounded-2xl p-6 text-frost shadow-[0_20px_60px_-30px_rgba(71,123,255,0.6)]">
                <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
                  <div>
                    <p className="text-sm text-mist">Flagged for review</p>
                    <p className="prism-text text-4xl font-bold tabular-nums">{money(result.totalDisputable, currency)}</p>
                    <p className="mt-1 text-sm text-mist">
                      of {money(result.totalBilled, currency)} billed ·{" "}
                      {result.totalBilled > 0 ? Math.round((result.totalDisputable / result.totalBilled) * 100) : 0}%
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
                    <Stat tone="text-coral" label="Confirmed errors" value={money(result.confirmedTotal, currency)} />
                    <Stat tone="text-warn" label="Suspected" value={money(result.suspectedTotal, currency)} />
                    <Stat tone="text-mist" label="Needs info" value={`${result.findings.filter((f) => f.certainty === "needs_info").length} item(s)`} />
                    <Stat
                      tone="text-glacier"
                      label="Time"
                      value={`${Math.round(result.durationMs / 1000)}s vs ~${Math.round(manualMinutes(result.bill.lineItems.length) / 60 * 10) / 10}h`}
                    />
                  </div>
                </div>
                <p className="mt-4 max-w-3xl text-[15px] leading-relaxed text-frost/90">{result.summary}</p>
              </div>
            )}

            {findings.length > 0 && (
              <div>
                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="font-semibold text-frost">
                    {result ? "Review findings" : "Issues found"}{" "}
                    {!result && <span className="text-sm font-normal text-uv">(deep audit in progress…)</span>}
                  </h3>
                  {result && (
                    <p className="text-sm text-mist">
                      Untick anything you don&apos;t want to dispute. <b className="text-glacier">{approved.size}</b> approved ·{" "}
                      <b className="text-glacier">{money(approvedTotal, currency)}</b>
                    </p>
                  )}
                </div>
                <div className="grid gap-3">
                  {[...findings]
                    .sort((a, b) => {
                      const o = { confirmed: 0, suspected: 1, needs_info: 2 } as const;
                      return o[a.certainty] - o[b.certainty] || b.estimatedOvercharge - a.estimatedOvercharge;
                    })
                    .map((f) => (
                      <FindingCard
                        key={f.id}
                        f={f}
                        bill={bill ?? undefined}
                        currency={currency}
                        approved={result ? approved.has(f.id) : undefined}
                        onToggle={result ? () => toggle(f.id) : undefined}
                      />
                    ))}
                </div>
              </div>
            )}

            {result && (letter || needsLetter) && (
              <div>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold text-frost">Dispute letter</h3>
                  <div className="flex flex-wrap gap-2">
                    {(letterStale || needsLetter) && (
                      <button
                        onClick={regenerate}
                        disabled={regenerating || !approved.size}
                        className="rounded-md border border-uv/50 bg-uv/10 px-3 py-1.5 text-sm text-uv transition hover:bg-uv/20 disabled:opacity-40"
                      >
                        {regenerating ? "Writing…" : needsLetter ? "Write letter for approved items" : "Rewrite letter for approved items"}
                      </button>
                    )}
                    <button
                      onClick={approveAndTrack}
                      disabled={!approved.size || !letter || letterStale || regenerating}
                      title={letterStale ? "Rewrite the letter first so it matches your approvals" : ""}
                      className="btn-primary px-3 py-1.5 text-sm"
                    >
                      {caseId ? "Update tracked case" : "Approve & track dispute"}
                    </button>
                  </div>
                </div>
                {caseId && (
                  <p className="mb-2 text-sm text-mint">
                    Tracking as case <b>{caseId}</b>.{" "}
                    <button className="underline" onClick={() => setTab("cases")}>
                      Open My disputes →
                    </button>
                  </p>
                )}
                {letter || regenerating ? (
                  <LetterPanel result={result} letter={letter} setLetter={setLetter} phoneScript={phoneScript} regenerating={regenerating} />
                ) : (
                  <p className="panel p-4 text-sm text-mist">
                    The letter couldn&apos;t be drafted automatically because the model was busy. Your findings are safe, so click{" "}
                    <span className="text-uv">Write letter for approved items</span> to try again.
                  </p>
                )}
              </div>
            )}

            {bill && (
              <div>
                <h3 className="mb-1 font-semibold text-frost">What Quibillix read</h3>
                <p className="mb-3 text-sm text-mist">
                  {[bill.provider, bill.location, bill.payer && `Payer: ${bill.payer}`, bill.statementDate].filter(Boolean).join(" · ")}
                </p>
                <LineItems bill={bill} findings={findings} />
              </div>
            )}

            {evidence.length > 0 && (
              <details className="panel p-4">
                <summary className="cursor-pointer text-sm font-medium text-cobalt">
                  Research trail ({evidence.reduce((s, e) => s + e.results.length, 0)} sources via Tavily)
                </summary>
                <div className="mt-3 space-y-4">
                  {evidence.map((e) => (
                    <div key={e.query}>
                      <p className="text-sm font-medium text-frost">“{e.query}”</p>
                      {e.answer && <p className="mt-1 text-sm text-mist">{e.answer}</p>}
                      <ul className="mt-1 space-y-0.5">
                        {e.results.map((r) => (
                          <li key={r.url} className="truncate text-xs">
                            <a href={r.url} target="_blank" rel="noreferrer" className="text-cobalt underline decoration-cobalt/40 hover:text-glacier">
                              {r.title}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        </section>
      )}
      </>
      )}
    </div>
  );
}

function Stat({ label, value, tone = "text-frost" }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-mist">{label}</p>
      <p className={`font-semibold tabular-nums ${tone}`}>{value}</p>
    </div>
  );
}
