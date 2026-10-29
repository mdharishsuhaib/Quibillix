"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { SAMPLES } from "@/lib/samples";
import { agentTrail, loadCases, newCaseId, now, serverCases, subscribeCases, upsertCase, type DisputeCase } from "@/lib/cases";
import type { AuditResult, Evidence, Finding, ParsedBill, StepId, StreamEvent } from "@/lib/types";
import Pipeline, { STEPS, type StepState } from "./Pipeline";
import { FindingCard, LetterPanel, money } from "./Results";
import Cases, { manualMinutes } from "./Cases";
import Receipt from "./Receipt";
import Verdict from "./Verdict";
import Icon, { type IconName } from "./fx/Icon";
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
  const [focusId, setFocusId] = useState<string | null>(null); // finding linked across receipt ↔ cards ↔ ledger
  const [dragging, setDragging] = useState(false);
  const [revealKey, setRevealKey] = useState(""); // bump to type the letter in
  const fileRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const runRef = useRef<() => void>(() => {});

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
      setRevealKey(`regen-${Date.now()}`);
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
              setRevealKey(`run-${Date.now()}`);
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
  const scanning = running && !bill;
  const sorted = useMemo(
    () =>
      [...findings].sort((a, b) => {
        const o = { confirmed: 0, suspected: 1, needs_info: 2 } as const;
        return o[a.certainty] - o[b.certainty] || b.estimatedOvercharge - a.estimatedOvercharge;
      }),
    [findings],
  );
  const canRun = !running && Boolean(text.trim() || image);
  useEffect(() => {
    runRef.current = () => canRun && run();
  });

  // Ctrl/Cmd + Enter runs the audit from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        runRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const loadPhoto = async () => {
    const blob = await (await fetch("/samples/india-hospital-bill.png")).blob();
    await onFile(new File([blob], "india-hospital-bill.png", { type: "image/png" }));
    setContext(SAMPLES.find((x) => x.id === "in-hospital")!.context);
  };
  const loadPdf = async () => {
    const blob = await (await fetch("/samples/utility-bill.pdf")).blob();
    await onFile(new File([blob], "utility-bill.pdf", { type: "application/pdf" }));
    setContext("Single-person flat. I submitted an actual meter reading of 14,250 on 30 Sept. I pay by direct debit on time every month.");
  };
  const SAMPLE_ICON: Record<string, IconName> = { "us-er": "pulse", "in-hospital": "hospital", telecom: "phone" };

  return (
    <div className="space-y-10">
      <nav id="workspace" className="no-print sticky top-3 z-40 flex flex-wrap items-center gap-3 rounded-2xl border border-steel/80 bg-carbon/80 p-1.5 backdrop-blur-xl">
        <div className="relative flex rounded-xl bg-ink/60 p-1 text-sm" role="tablist">
          <span
            aria-hidden
            className="absolute bottom-1 top-1 w-[calc(50%-4px)] rounded-lg bg-raised shadow-[inset_0_-2px_0_var(--glacier),0_6px_20px_-10px_var(--glacier)] transition-transform duration-500 ease-[var(--ease-out)]"
            style={{ transform: tab === "audit" ? "translateX(0)" : "translateX(100%)" }}
          />
          {(
            [
              ["audit", "Audit a bill", "search"],
              ["cases", `My disputes${cases.length ? ` · ${cases.length}` : ""}`, "folder"],
            ] as const
          ).map(([id, label, icon]) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`relative z-10 inline-flex w-40 items-center justify-center gap-2 rounded-lg px-3 py-2 transition-colors ${tab === id ? "font-medium text-frost" : "text-mist hover:text-frost"}`}
            >
              <Icon name={icon} size={15} />
              {label}
            </button>
          ))}
        </div>
        <Journey
          stage={tab === "cases" || caseId ? 4 : regenerating ? 3 : result ? 2 : running ? 1 : text.trim() || image ? 0 : 0}
          running={running}
        />
      </nav>
      {tab === "cases" && (
        <section className="reveal">
          <p className="eyebrow mb-1">Resolve with oversight</p>
          <h2 className="display mb-1 text-4xl text-frost">My disputes</h2>
          <p className="mb-6 text-sm text-mist">Track each dispute from draft to resolution. Everything here is stored only in this browser.</p>
          <Cases cases={cases} onChange={refreshCases} onOpen={openCase} />
        </section>
      )}

      {tab === "audit" && (
        <>
          {!started && (
            <section className="no-print reveal">
              <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="eyebrow mb-1">Step 1 · Check</p>
                  <h2 className="display text-4xl text-frost">
                    Hand over the bill. <em className="text-mist">We&apos;ll question it.</em>
                  </h2>
                </div>
                <p className="inline-flex items-center gap-1.5 text-xs text-mist">
                  <Icon name="lock" size={13} className="text-mint" /> Read in memory, never stored. Names are removed before any web search.
                </p>
              </div>

              <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
                <div
                  onDragEnter={(e) => {
                    e.preventDefault();
                    setDragging(true);
                  }}
                  onDragOver={(e) => e.preventDefault()}
                  onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragging(false);
                    onFile(e.dataTransfer.files?.[0]);
                  }}
                  className={`spot relative rounded-2xl p-[1px] transition-all duration-300 ${dragging ? "prism-ring scale-[1.01]" : "bg-steel"}`}
                >
                  <div className="relative overflow-hidden rounded-[15px] bg-carbon">
                    {dragging && (
                      <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center bg-ink/80 backdrop-blur-sm">
                        <div className="text-center">
                          <div className="animate-float mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-glacier/15 text-glacier">
                            <Icon name="upload" size={26} />
                          </div>
                          <p className="display text-2xl text-frost">Drop it into the prism</p>
                          <p className="text-xs text-mist">PDF, photo or text</p>
                        </div>
                      </div>
                    )}
                    <div className="flex items-center justify-between border-b border-steel/80 px-4 py-2.5">
                      <span className="eyebrow">Your bill</span>
                      <span className="font-mono text-[10px] text-mist/60">{image ? "image" : text ? `${text.split("\n").length} lines` : "empty"}</span>
                    </div>
                    {image ? (
                      <div className="flex items-start gap-4 p-4">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={image.dataUrl} alt="bill" className="paper h-52 w-auto rounded object-contain p-1" />
                        <div className="text-sm">
                          <p className="font-medium text-frost">{image.name}</p>
                          <p className="mt-1 text-mist">
                            Will be read by <span className="text-uv">Nemotron 3.5 Super VL</span>.
                          </p>
                          <button onClick={() => setImage(null)} className="mt-3 inline-flex items-center gap-1 text-coral hover:underline">
                            <Icon name="x" size={13} /> Remove
                          </button>
                        </div>
                      </div>
                    ) : (
                      <textarea
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        placeholder={"Paste the text of your bill or EOB here…\n\nor drop a PDF / photo anywhere on this card."}
                        aria-label="Bill text"
                        className="h-72 w-full resize-y bg-transparent p-4 font-mono text-xs leading-relaxed text-frost outline-none placeholder:text-[#6b7894]"
                      />
                    )}
                    <div className="flex flex-wrap items-center gap-3 border-t border-steel/80 px-4 py-3 text-sm">
                      <button onClick={() => fileRef.current?.click()} className="btn-ghost magnetic inline-flex items-center gap-2 px-3 py-1.5">
                        <Icon name="upload" size={15} /> Upload PDF / photo
                      </button>
                      <span className="text-xs text-mist/70">PDF, JPG, PNG, WebP or .txt</span>
                      <input ref={fileRef} type="file" accept="application/pdf,.pdf,image/*,.txt,.csv,.md" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-4">
                  <div className="spot panel p-4">
                    <p className="eyebrow mb-3">No bill handy? Try one</p>
                    <div className="grid gap-2">
                      {SAMPLES.map((s, i) => (
                        <button
                          key={s.id}
                          onClick={() => loadSample(s.id)}
                          disabled={running}
                          className="reveal group flex items-center gap-3 rounded-xl border border-steel bg-ink/50 px-3 py-2.5 text-left transition hover:border-glacier/50 hover:bg-glacier/[0.06] disabled:opacity-40"
                          style={{ ["--i" as string]: i + 2 }}
                        >
                          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-glacier/10 text-glacier transition group-hover:scale-110">
                            <Icon name={SAMPLE_ICON[s.id] ?? "doc"} size={16} />
                          </span>
                          <span className="min-w-0">
                            <span className="block text-sm font-medium text-frost">{s.label}</span>
                            <span className="block truncate text-xs text-mist">{s.blurb}</span>
                          </span>
                        </button>
                      ))}
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={loadPhoto}
                          disabled={running}
                          title="Tests the vision path (Nemotron 3.5 Super VL)"
                          className="flex items-center gap-2 rounded-xl border border-dashed border-cobalt/50 px-3 py-2 text-xs text-cobalt transition hover:bg-cobalt/10 disabled:opacity-40"
                        >
                          <Icon name="camera" size={15} /> Bill photo
                        </button>
                        <button
                          onClick={loadPdf}
                          disabled={running}
                          title="Tests PDF upload (text layer read in your browser)"
                          className="flex items-center gap-2 rounded-xl border border-dashed border-cobalt/50 px-3 py-2 text-xs text-cobalt transition hover:bg-cobalt/10 disabled:opacity-40"
                        >
                          <Icon name="pdf" size={15} /> PDF utility bill
                        </button>
                      </div>
                    </div>
                  </div>

                  <label className="spot panel flex flex-1 flex-col p-4">
                    <span className="eyebrow mb-2">What happened? <span className="normal-case tracking-normal text-mist/60">(optional, it helps)</span></span>
                    <textarea
                      value={context}
                      onChange={(e) => setContext(e.target.value)}
                      placeholder="e.g. I was only in the ER for 2 hours for a sprained ankle. I have Aetna PPO; the hospital is in-network."
                      className="field min-h-28 w-full flex-1 resize-y p-3 text-sm"
                    />
                  </label>

                  <button onClick={run} disabled={!canRun} className="btn-primary magnetic group flex items-center justify-center gap-2 px-4 py-3.5 text-[15px]">
                    Audit my bill
                    <Icon name="arrow" size={17} className="transition-transform duration-300 group-hover:translate-x-1" />
                  </button>
                  <p className="-mt-2 text-center font-mono text-[10.5px] text-mist/60">
                    <Icon name="keyboard" size={11} className="mr-1 inline" /> Ctrl / ⌘ + Enter
                  </p>
                </div>
              </div>
            </section>
          )}
          {started && (
            <section ref={resultsRef} className="scroll-mt-24 space-y-6">
              <div className="no-print flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="eyebrow mb-1">{result ? "Step 3 · Review with oversight" : "Step 2 · Investigate"}</p>
                  <h2 className="display text-4xl text-frost">
                    {result ? (
                      <>
                        Here&apos;s what the prism <em className="prism-text">caught.</em>
                      </>
                    ) : error && !running ? (
                      "The audit stopped."
                    ) : (
                      <>
                        Questioning every line<span className="caret" />
                      </>
                    )}
                  </h2>
                </div>
                <button
                  onClick={() => {
                    setBill(null);
                    setFindings([]);
                    setEvidence([]);
                    setResult(null);
                    setError(null);
                    setCaseId(null);
                    setSteps(initialSteps());
                    setTimeout(() => document.getElementById("workspace")?.scrollIntoView({ behavior: "smooth" }), 30);
                  }}
                  disabled={running}
                  className="btn-ghost inline-flex items-center gap-2 px-3 py-1.5 text-sm"
                >
                  <Icon name="spark" size={14} /> New audit
                </button>
              </div>

              <div className="no-print">
                <Pipeline steps={steps} running={running} />
              </div>

              {error && (
                <div role="alert" className="reveal flex items-start gap-3 rounded-xl border border-coral/40 bg-coral/10 p-4 text-sm text-coral">
                  <Icon name="x" size={16} className="mt-0.5 shrink-0" />
                  {error}
                </div>
              )}

              <div className="grid gap-8 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
                <aside className="no-print lg:sticky lg:top-24 lg:h-fit">
                  <Receipt
                    bill={bill}
                    raw={text}
                    image={image?.dataUrl ?? null}
                    findings={sorted}
                    scanning={scanning}
                    audited={Boolean(result)}
                    focusId={focusId}
                    onFocus={setFocusId}
                  />
                </aside>

                <div className="min-w-0 space-y-8">
                  {result && (
                    <Verdict
                      result={result}
                      findings={sorted}
                      currency={currency}
                      manualHours={Math.round((manualMinutes(result.bill.lineItems.length) / 60) * 10) / 10}
                      focusId={focusId}
                      onFocus={setFocusId}
                    />
                  )}

                  {!result && !findings.length && running && (
                    <div className="space-y-3" aria-hidden>
                      {[0, 1, 2].map((i) => (
                        <div key={i} className="panel p-4">
                          <div className="shimmer mb-3 h-3 w-1/3 rounded" />
                          <div className="shimmer mb-2 h-3 w-5/6 rounded" />
                          <div className="shimmer h-3 w-2/3 rounded" />
                        </div>
                      ))}
                    </div>
                  )}

                  {findings.length > 0 && (
                    <div>
                      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                        <h3 className="flex items-center gap-2 font-semibold text-frost">
                          {result ? "Review findings" : "Issues found so far"}
                          {!result && <span className="caret text-sm font-normal text-uv">deep audit in progress</span>}
                        </h3>
                        {result && (
                          <p className="text-sm text-mist">
                            <b className="text-glacier">{approved.size}</b> in dispute · <b className="text-glacier">{money(approvedTotal, currency)}</b>
                          </p>
                        )}
                      </div>
                      <div className="grid gap-3">
                        {sorted.map((f, i) => (
                          <FindingCard
                            key={f.id}
                            f={f}
                            index={i}
                            bill={bill ?? undefined}
                            currency={currency}
                            approved={result ? approved.has(f.id) : undefined}
                            onToggle={result ? () => toggle(f.id) : undefined}
                            focused={focusId === f.id}
                            onFocus={setFocusId}
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {result && !findings.length && (
                    <div className="reveal panel flex items-center gap-4 p-5">
                      <span className="grid h-10 w-10 place-items-center rounded-full bg-mint/15 text-mint">
                        <Icon name="check" size={20} />
                      </span>
                      <div>
                        <p className="font-medium text-frost">This bill came back clean.</p>
                        <p className="text-sm text-mist">No math errors, duplicates or evidence-backed overcharges. Nothing to dispute.</p>
                      </div>
                    </div>
                  )}

                  {result && (letter || needsLetter) && (
                    <div className="reveal">
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <p className="eyebrow">Step 4 · Build the dispute</p>
                          <h3 className="font-semibold text-frost">Dispute letter</h3>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {(letterStale || needsLetter) && (
                            <button
                              onClick={regenerate}
                              disabled={regenerating || !approved.size}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-uv/50 bg-uv/10 px-3 py-1.5 text-sm text-uv transition hover:bg-uv/20 disabled:opacity-40"
                            >
                              <Icon name="spark" size={14} />
                              {regenerating ? "Writing…" : needsLetter ? "Write letter for approved items" : "Rewrite for approved items"}
                            </button>
                          )}
                          <button
                            onClick={approveAndTrack}
                            disabled={!approved.size || !letter || letterStale || regenerating}
                            title={letterStale ? "Rewrite the letter first so it matches your approvals" : ""}
                            className="btn-primary magnetic inline-flex items-center gap-1.5 px-3.5 py-1.5 text-sm"
                          >
                            <Icon name="shield" size={14} />
                            {caseId ? "Update tracked case" : "Approve & track dispute"}
                          </button>
                        </div>
                      </div>
                      {letterStale && (
                        <p className="mb-2 text-xs text-warn">You changed which findings are in the dispute. Rewrite the letter so it matches.</p>
                      )}
                      {caseId && (
                        <p className="reveal mb-3 inline-flex items-center gap-2 rounded-lg border border-mint/40 bg-mint/10 px-3 py-1.5 text-sm text-mint">
                          <Icon name="check" size={14} /> Tracking as case <b>{caseId}</b>
                          <button className="underline" onClick={() => setTab("cases")}>
                            Open My disputes
                          </button>
                        </p>
                      )}
                      {letter || regenerating ? (
                        <LetterPanel result={result} letter={letter} setLetter={setLetter} phoneScript={phoneScript} regenerating={regenerating} revealKey={revealKey} />
                      ) : (
                        <p className="panel p-4 text-sm text-mist">
                          The letter couldn&apos;t be drafted automatically because the model was busy. Your findings are safe, so click{" "}
                          <span className="text-uv">Write letter for approved items</span> to try again.
                        </p>
                      )}
                    </div>
                  )}

                  {evidence.length > 0 && (
                    <details className="spot panel group p-4">
                      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-cobalt">
                        <Icon name="search" size={15} />
                        Research trail · {evidence.reduce((s, e) => s + e.results.length, 0)} sources via Tavily
                        <Icon name="arrow" size={13} className="ml-auto rotate-90 transition-transform group-open:-rotate-90" />
                      </summary>
                      <div className="mt-4 space-y-4 border-l border-cobalt/30 pl-4">
                        {evidence.map((e) => (
                          <div key={e.query}>
                            <p className="font-mono text-xs text-frost">“{e.query}”</p>
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
              </div>
            </section>
          )}
        </>
      )}
      {/*__BODY__*/}
    </div>
  );
}

/** Where the user is in the job: Bill → Scan → Review → Dispute → Track. */
function Journey({ stage, running }: { stage: number; running: boolean }) {
  const stops = ["Add bill", "Scan", "Review", "Dispute", "Track"];
  return (
    <ol className="ml-auto hidden items-center gap-1 pr-2 text-[11.5px] lg:flex" aria-label="Progress">
      {stops.map((s, i) => {
        const done = i < stage;
        const cur = i === stage;
        return (
          <li key={s} className="flex items-center gap-1">
            <span
              className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 transition-colors duration-500 ${
                cur ? "bg-glacier/10 text-glacier ring-1 ring-glacier/40" : done ? "text-frost" : "text-mist/50"
              }`}
              aria-current={cur ? "step" : undefined}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${cur ? (running ? "bg-cobalt animate-pulse-ring" : "bg-glacier") : done ? "bg-mint" : "bg-steel"}`} />
              {s}
            </span>
            {i < stops.length - 1 && <span className={`h-px w-4 ${done ? "bg-mint/60" : "bg-steel"}`} />}
          </li>
        );
      })}
    </ol>
  );
}

