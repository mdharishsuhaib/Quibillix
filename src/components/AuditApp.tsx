"use client";

import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import { SAMPLES } from "@/lib/samples";
import { agentTrail, loadCases, newCaseId, now, serverCases, subscribeCases, upsertCase, type DisputeCase } from "@/lib/cases";
import type { AuditResult, Evidence, Finding, ParsedBill, StepId, StreamEvent } from "@/lib/types";
import Pipeline, { STEPS, type StepState } from "./Pipeline";
import { FindingCard, LetterPanel, LineItems, money } from "./Results";
import Cases, { manualMinutes } from "./Cases";

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
    if (file.type.startsWith("image/")) {
      setImage({ name: file.name, dataUrl: await fileToDataUrl(file) });
    } else if (file.type.startsWith("text/") || /\.(txt|csv|md)$/i.test(file.name)) {
      setText(await file.text());
      setImage(null);
    } else {
      setError("Please upload a photo/screenshot (JPG, PNG, WebP) or a text file. For PDFs, take a screenshot or copy the text.");
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
      <nav className="no-print flex gap-1 rounded-xl bg-slate-100 p-1 text-sm">
        {(
          [
            ["audit", "Audit a bill"],
            ["cases", `My disputes${cases.length ? ` (${cases.length})` : ""}`],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex-1 rounded-lg px-3 py-2 ${tab === id ? "bg-white font-medium shadow-sm" : "text-slate-500"}`}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === "cases" && (
        <section>
          <h2 className="mb-1 text-lg font-semibold">My disputes</h2>
          <p className="mb-4 text-sm text-slate-500">
            Track each dispute from draft to resolution. Everything here is stored only in this browser.
          </p>
          <Cases cases={cases} onChange={refreshCases} onOpen={openCase} />
        </section>
      )}

      {tab === "audit" && (
      <>
      {/* ---------------- input ---------------- */}
      <section className="no-print rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-sm text-slate-500">Try a sample:</span>
          {SAMPLES.map((s) => (
            <button
              key={s.id}
              onClick={() => loadSample(s.id)}
              disabled={running}
              className="rounded-full border border-slate-200 px-3 py-1 text-sm hover:border-emerald-400 hover:bg-emerald-50"
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
            className="rounded-full border border-dashed border-emerald-400 px-3 py-1 text-sm text-emerald-700 hover:bg-emerald-50"
            title="Tests the vision path (Nemotron 3.5 Super VL)"
          >
            📷 Photo of a bill
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
            <label className="mb-1 block text-sm font-medium">Your bill</label>
            {image ? (
              <div className="flex items-start gap-3 rounded-lg border border-dashed border-slate-300 p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={image.dataUrl} alt="bill" className="h-40 w-auto rounded border object-contain" />
                <div className="text-sm">
                  <p className="font-medium">{image.name}</p>
                  <p className="text-slate-500">Will be read by Nemotron 3.5 Super VL.</p>
                  <button onClick={() => setImage(null)} className="mt-2 text-rose-600 underline">
                    Remove
                  </button>
                </div>
              </div>
            ) : (
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Paste the text of your bill / EOB here, or drop a photo of it…"
                className="h-64 w-full resize-y rounded-lg border border-slate-300 p-3 font-mono text-xs outline-none focus:border-emerald-500"
              />
            )}
            <div className="mt-2 flex items-center gap-3 text-sm">
              <button onClick={() => fileRef.current?.click()} className="rounded-md border px-3 py-1.5 hover:bg-slate-50">
                Upload photo / screenshot
              </button>
              <span className="text-xs text-slate-400">JPG, PNG, WebP or .txt — drag & drop works too</span>
              <input
                ref={fileRef}
                type="file"
                accept="image/*,.txt,.csv,.md"
                className="hidden"
                onChange={(e) => onFile(e.target.files?.[0])}
              />
            </div>
          </div>

          <div className="flex flex-col">
            <label className="mb-1 block text-sm font-medium">What happened? (optional, but it helps)</label>
            <textarea
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder="e.g. I was only in the ER for 2 hours for a sprained ankle. I have Aetna PPO; the hospital is in-network."
              className="h-40 w-full resize-y rounded-lg border border-slate-300 p-3 text-sm outline-none focus:border-emerald-500"
            />
            <button
              onClick={run}
              disabled={running || (!text.trim() && !image)}
              className="mt-auto rounded-lg bg-emerald-600 px-4 py-3 font-semibold text-white shadow hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {running ? "Auditing…" : "Audit my bill"}
            </button>
          </div>
        </div>
      </section>

      {/* ---------------- output ---------------- */}
      {started && (
        <section ref={resultsRef} className="grid gap-6 lg:grid-cols-[260px_1fr]">
          <aside className="no-print h-fit rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:sticky lg:top-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Agent pipeline</h3>
            <Pipeline steps={steps} />
          </aside>

          <div className="min-w-0 space-y-6">
            {error && <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div>}

            {result && (
              <div className="rounded-2xl bg-gradient-to-br from-emerald-600 to-emerald-800 p-6 text-white shadow">
                <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
                  <div>
                    <p className="text-sm opacity-80">Flagged for review</p>
                    <p className="text-4xl font-bold tabular-nums">{money(result.totalDisputable, currency)}</p>
                    <p className="mt-1 text-sm opacity-80">
                      of {money(result.totalBilled, currency)} billed ·{" "}
                      {result.totalBilled > 0 ? Math.round((result.totalDisputable / result.totalBilled) * 100) : 0}%
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
                    <Stat label="Confirmed errors" value={money(result.confirmedTotal, currency)} />
                    <Stat label="Suspected" value={money(result.suspectedTotal, currency)} />
                    <Stat label="Needs info" value={`${result.findings.filter((f) => f.certainty === "needs_info").length} item(s)`} />
                    <Stat
                      label="Time"
                      value={`${Math.round(result.durationMs / 1000)}s vs ~${Math.round(manualMinutes(result.bill.lineItems.length) / 60 * 10) / 10}h`}
                    />
                  </div>
                </div>
                <p className="mt-4 max-w-3xl text-[15px] leading-relaxed">{result.summary}</p>
              </div>
            )}

            {findings.length > 0 && (
              <div>
                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="font-semibold">
                    {result ? "Review findings" : "Issues found"}{" "}
                    {!result && <span className="text-sm font-normal text-slate-400">(deep audit in progress…)</span>}
                  </h3>
                  {result && (
                    <p className="text-sm text-slate-500">
                      Untick anything you don&apos;t want to dispute. <b className="text-slate-800">{approved.size}</b> approved ·{" "}
                      <b className="text-slate-800">{money(approvedTotal, currency)}</b>
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
                        currency={currency}
                        approved={result ? approved.has(f.id) : undefined}
                        onToggle={result ? () => toggle(f.id) : undefined}
                      />
                    ))}
                </div>
              </div>
            )}

            {result && letter && (
              <div>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold">Dispute letter</h3>
                  <div className="flex flex-wrap gap-2">
                    {letterStale && (
                      <button
                        onClick={regenerate}
                        disabled={regenerating || !approved.size}
                        className="rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                      >
                        {regenerating ? "Rewriting…" : "Rewrite letter for approved items"}
                      </button>
                    )}
                    <button
                      onClick={approveAndTrack}
                      disabled={!approved.size || letterStale || regenerating}
                      title={letterStale ? "Rewrite the letter first so it matches your approvals" : ""}
                      className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {caseId ? "Update tracked case" : "Approve & track dispute"}
                    </button>
                  </div>
                </div>
                {caseId && (
                  <p className="mb-2 text-sm text-emerald-700">
                    Tracking as case <b>{caseId}</b>.{" "}
                    <button className="underline" onClick={() => setTab("cases")}>
                      Open My disputes →
                    </button>
                  </p>
                )}
                <LetterPanel result={result} letter={letter} setLetter={setLetter} phoneScript={phoneScript} regenerating={regenerating} />
              </div>
            )}

            {bill && (
              <div>
                <h3 className="mb-1 font-semibold">What Quibillix read</h3>
                <p className="mb-3 text-sm text-slate-500">
                  {[bill.provider, bill.location, bill.payer && `Payer: ${bill.payer}`, bill.statementDate].filter(Boolean).join(" · ")}
                </p>
                <LineItems bill={bill} findings={findings} />
              </div>
            )}

            {evidence.length > 0 && (
              <details className="rounded-xl border border-slate-200 bg-white p-4">
                <summary className="cursor-pointer text-sm font-medium">
                  Research trail ({evidence.reduce((s, e) => s + e.results.length, 0)} sources via Tavily)
                </summary>
                <div className="mt-3 space-y-4">
                  {evidence.map((e) => (
                    <div key={e.query}>
                      <p className="text-sm font-medium">“{e.query}”</p>
                      {e.answer && <p className="mt-1 text-sm text-slate-600">{e.answer}</p>}
                      <ul className="mt-1 space-y-0.5">
                        {e.results.map((r) => (
                          <li key={r.url} className="truncate text-xs">
                            <a href={r.url} target="_blank" rel="noreferrer" className="text-emerald-700 underline">
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide opacity-70">{label}</p>
      <p className="font-semibold tabular-nums">{value}</p>
    </div>
  );
}
