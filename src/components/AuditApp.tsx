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
import ShortcutKeys from "./fx/ShortcutKeys";
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
  const [nudge, setNudge] = useState(false); // shortcut pressed with nothing to check

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
  // Ctrl/Cmd + Enter: run the audit if a bill is loaded; otherwise take the user to the bill box.
  useEffect(() => {
    runRef.current = () => {
      if (running) return;
      if (result) return; // results on screen: never wipe them by accident
      if (tab !== "audit") setTab("audit");
      if (canRun) {
        run();
        return;
      }
      setNudge(true);
      setTimeout(() => setNudge(false), 2400);
      setTimeout(() => {
        document.getElementById("workspace")?.scrollIntoView({ behavior: "smooth", block: "start" });
        document.getElementById("bill-text")?.focus({ preventScroll: true });
      }, 30);
    };
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || e.repeat || e.isComposing) return;
      if (e.key !== "Enter" && e.code !== "Enter" && e.code !== "NumpadEnter") return;
      e.preventDefault();
      runRef.current();
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
    <div className="space-y-12">
      {/* A plain bar: two places to be, and where you are in the job. */}
      <nav id="workspace" className="no-print sticky top-0 z-40 -mx-5 flex flex-wrap items-end gap-x-8 gap-y-2 bg-ink px-5 pt-3 sm:-mx-8 sm:px-8">
        <div data-ui className="flex gap-7 border-b border-steel" role="tablist" aria-label="Workspace">
          {(
            [
              ["audit", "Check a bill", "search"],
              ["cases", `My disputes${cases.length ? ` (${cases.length})` : ""}`, "folder"],
            ] as const
          ).map(([id, label, icon]) => (
            <button key={id} data-tab={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className="tab inline-flex items-center gap-2 pb-3 text-[15px] font-medium">
              <Icon name={icon} size={16} />
              {label}
            </button>
          ))}
        </div>
        <Journey stage={tab === "cases" || caseId ? 4 : regenerating ? 3 : result ? 2 : running ? 1 : 0} running={running} />
      </nav>

      {tab === "cases" && (
        <section className="reveal" aria-labelledby="cases-title">
          <h2 id="cases-title" className="text-2xl font-semibold text-frost">
            My disputes
          </h2>
          <p className="mb-6 mt-1 text-[15px] text-mist">Each dispute from draft to resolution, with every agent and human step logged. Stored only in this browser.</p>
          <Cases cases={cases} onChange={refreshCases} onOpen={openCase} />
        </section>
      )}

      {tab === "audit" && !started && (
        <section className="no-print reveal" aria-labelledby="intake-title">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <h2 id="intake-title" className="text-2xl font-semibold text-frost">
              Add your bill
            </h2>
            <p className="inline-flex items-center gap-2 text-sm text-mist">
              <Icon name="lock" size={14} className="text-mint" /> Read in memory, never stored. Names are removed before any web search.
            </p>
          </div>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
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
              className={`panel relative flex flex-col overflow-hidden transition-colors duration-200 focus-within:!border-glacier ${dragging ? "!border-glacier" : ""}`}
            >
              {dragging && (
                <div className="pointer-events-none absolute inset-0 z-20 grid place-items-center bg-ink/90">
                  <div className="text-center">
                    <Icon name="upload" size={28} className="mx-auto mb-3 text-glacier" />
                    <p className="text-lg font-semibold text-frost">Drop the bill to read it</p>
                    <p className="text-sm text-mist">PDF, photo or text file</p>
                  </div>
                </div>
              )}
              <div className="flex items-center justify-between px-5 pt-4">
                <label htmlFor="bill-text" className="text-sm font-medium text-frost">
                  The bill
                </label>
                <span className="num text-sm text-mist">{image ? "Photo attached" : text ? `${text.split("\n").length} lines pasted` : "Paste, upload or drop"}</span>
              </div>
              {image ? (
                <div className="flex flex-1 items-start gap-5 p-5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={image.dataUrl} alt="Your bill" className="paper h-56 w-auto rounded-[3px] object-contain p-1" />
                  <div className="text-[15px]">
                    <p className="font-medium text-frost">{image.name}</p>
                    <p className="mt-1 text-mist">
                      Read by <span className="text-uv">Nemotron 3.5 Super VL</span>.
                    </p>
                    <button onClick={() => setImage(null)} className="mt-3 inline-flex items-center gap-1 text-sm text-coral hover:underline">
                      <Icon name="x" size={13} /> Remove photo
                    </button>
                  </div>
                </div>
              ) : (
                <textarea
                  id="bill-text"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={"Paste the text of your bill or explanation of benefits here,\nor drop a PDF or photo anywhere on this panel."}
                  aria-describedby="bill-formats"
                  data-ui
                  className="min-h-80 w-full flex-1 resize-y bg-transparent px-5 py-3 font-mono text-[13px] leading-relaxed text-frost outline-none placeholder:font-sans placeholder:text-[15px] placeholder:text-dim" /* taste-skill-ignore: pasted bill text keeps its column alignment */
                />
              )}
              <div className="flex flex-wrap items-center gap-3 bg-raised px-5 py-3">
                <button onClick={() => fileRef.current?.click()} className="btn-ghost inline-flex items-center gap-2 px-3 py-1.5 text-sm">
                  <Icon name="upload" size={15} /> Upload a PDF or photo
                </button>
                <span id="bill-formats" className="text-sm text-mist">
                  PDF, JPG, PNG, WebP or .txt
                </span>
                <input ref={fileRef} type="file" accept="application/pdf,.pdf,image/*,.txt,.csv,.md" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
              </div>
            </div>

            <div className="flex flex-col gap-5">
              <div className="panel p-5">
                <h3 className="mb-3 text-sm font-medium text-frost">No bill to hand? Try a real-looking one</h3>
                <div className="grid gap-1">
                  {SAMPLES.map((s) => (
                    <button
                      key={s.id}
                      onClick={() => loadSample(s.id)}
                      disabled={running}
                      className="group flex items-center gap-3 rounded-[var(--r-control)] px-2 py-2 text-left transition-colors hover:bg-raised active:scale-[0.99] disabled:opacity-40"
                    >
                      <Icon name={SAMPLE_ICON[s.id] ?? "doc"} size={18} className="shrink-0 text-mist group-hover:text-glacier" />
                      <span className="min-w-0">
                        <span className="block text-[15px] text-frost">{s.label}</span>
                        <span className="block truncate text-sm text-mist">{s.blurb}</span>
                      </span>
                    </button>
                  ))}
                  <button onClick={loadPhoto} disabled={running} className="group flex items-center gap-3 rounded-[var(--r-control)] px-2 py-2 text-left transition-colors hover:bg-raised disabled:opacity-40">
                    <Icon name="camera" size={18} className="shrink-0 text-mist group-hover:text-glacier" />
                    <span>
                      <span className="block text-[15px] text-frost">Photo of a hospital bill</span>
                      <span className="block text-sm text-mist">Tests the vision model</span>
                    </span>
                  </button>
                  <button onClick={loadPdf} disabled={running} className="group flex items-center gap-3 rounded-[var(--r-control)] px-2 py-2 text-left transition-colors hover:bg-raised disabled:opacity-40">
                    <Icon name="pdf" size={18} className="shrink-0 text-mist group-hover:text-glacier" />
                    <span>
                      <span className="block text-[15px] text-frost">PDF electricity bill</span>
                      <span className="block text-sm text-mist">Read in your browser</span>
                    </span>
                  </button>
                </div>
              </div>

              <div className="panel flex flex-1 flex-col p-5">
                <label htmlFor="bill-context" className="mb-2 text-sm font-medium text-frost">
                  What happened? <span className="font-normal text-mist">Optional, but it sharpens the audit</span>
                </label>
                <textarea
                  id="bill-context"
                  value={context}
                  onChange={(e) => setContext(e.target.value)}
                  placeholder="For example: I was in the ER for 2 hours with a sprained ankle. I have Aetna PPO and the hospital is in-network."
                  className="field min-h-28 w-full flex-1 resize-y p-3 text-[15px]"
                />
              </div>

              <div>
                <button
                  onClick={() => runRef.current()}
                  disabled={running}
                  aria-describedby="run-hint"
                  className={`btn-primary group flex w-full items-center justify-center gap-2 px-4 py-3.5 text-base ${canRun ? "" : "opacity-60"}`}
                >
                  Check my bill
                  <Icon name="arrow" size={17} className="transition-transform duration-200 group-hover:translate-x-0.5" />
                </button>
                <p id="run-hint" aria-live="polite" className={`mt-2 text-center text-sm transition-colors duration-200 ${nudge ? "text-warn" : "text-mist"}`}>
                  {canRun ? (
                    <>
                      Or press <ShortcutKeys /> to check it
                    </>
                  ) : nudge ? (
                    "Paste a bill or pick a sample first, then press the shortcut again"
                  ) : (
                    <>
                      Pick a sample, or press <ShortcutKeys /> to go to the bill box
                    </>
                  )}
                </p>
              </div>
            </div>
          </div>
        </section>
      )}

      {tab === "audit" && started && (
        <section ref={resultsRef} className="scroll-mt-20 space-y-6" aria-labelledby="results-title">
          <div className="no-print flex flex-wrap items-center justify-between gap-3">
            <h2 id="results-title" className="text-2xl font-semibold text-frost">
              {result ? `${bill?.provider ?? "Your bill"}, checked` : error && !running ? "The check stopped" : <span className="caret">Checking every line</span>}
            </h2>
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
              <Icon name="spark" size={14} /> Check another bill
            </button>
          </div>

          <div className="no-print">
            <Pipeline steps={steps} running={running} />
          </div>

          {error && (
            <div role="alert" className="reveal panel flex items-start gap-3 p-4 text-[15px] text-frost">
              <Icon name="x" size={16} className="mt-1 shrink-0 text-coral" />
              <span>
                {error}{" "}
                <button onClick={run} disabled={!canRun} className="font-medium text-glacier underline underline-offset-2">
                  Try again
                </button>
              </span>
            </div>
          )}

          <div className="grid gap-8 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
            <aside className="no-print lg:sticky lg:top-20 lg:h-fit">
              <Receipt bill={bill} raw={text} image={image?.dataUrl ?? null} findings={sorted} scanning={scanning} audited={Boolean(result)} focusId={focusId} onFocus={setFocusId} />
            </aside>

            <div className="min-w-0 space-y-10">
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

              {/* Loading: the final layout, each value a flat bar at its real size. */}
              {!result && !findings.length && running && (
                <div className="space-y-3" aria-hidden>
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="panel p-5">
                      <div className="bar-skeleton mb-3 h-4 w-1/2" />
                      <div className="bar-skeleton mb-2 h-3 w-5/6" />
                      <div className="bar-skeleton h-3 w-2/3" />
                    </div>
                  ))}
                </div>
              )}

              {findings.length > 0 && (
                <section aria-labelledby="findings-title">
                  <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
                    <h3 id="findings-title" className="text-lg font-semibold text-frost">
                      {result ? "Choose what goes in the dispute" : "Found so far"}
                    </h3>
                    {result ? (
                      <p className="num text-[15px] text-mist">
                        {approved.size} of {findings.length} in, worth <b className="font-semibold text-frost">{money(approvedTotal, currency)}</b>
                      </p>
                    ) : (
                      <p className="caret text-sm text-mist">The deep audit is still running</p>
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
                </section>
              )}

              {result && !findings.length && (
                <div className="reveal panel flex items-center gap-4 p-5">
                  <Icon name="check" size={22} className="shrink-0 text-mint" />
                  <div>
                    <p className="font-semibold text-frost">This bill came back clean</p>
                    <p className="text-[15px] text-mist">No math errors, duplicates or evidence-backed overcharges, so there is nothing to dispute.</p>
                  </div>
                </div>
              )}

              {result && (letter || needsLetter) && (
                <section className="reveal" aria-labelledby="letter-title">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <h3 id="letter-title" className="text-lg font-semibold text-frost">
                      Your dispute letter
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {(letterStale || needsLetter) && (
                        <button onClick={regenerate} disabled={regenerating || !approved.size} className="btn-ghost inline-flex items-center gap-1.5 px-3 py-2 text-sm">
                          <Icon name="spark" size={14} className="text-uv" />
                          {regenerating ? "Writing" : needsLetter ? "Write the letter" : "Rewrite to match"}
                        </button>
                      )}
                      <button
                        onClick={approveAndTrack}
                        disabled={!approved.size || !letter || letterStale || regenerating}
                        title={letterStale ? "Rewrite the letter first so it matches your choices" : ""}
                        className="btn-primary inline-flex items-center gap-1.5 px-4 py-2 text-sm"
                      >
                        <Icon name="shield" size={15} />
                        {caseId ? "Update the tracked case" : "Approve and track dispute"}
                      </button>
                    </div>
                  </div>
                  {letterStale && <p className="mb-3 text-[15px] text-warn">You changed what is in the dispute. Rewrite the letter so it matches before you approve it.</p>}
                  {caseId && (
                    <p className="reveal mb-3 flex flex-wrap items-center gap-2 text-[15px] text-frost">
                      <Icon name="check" size={16} className="text-mint" /> Tracked as case <span data-ui className="font-mono text-sm">{caseId}</span>. {/* taste-skill-ignore: case ID */}
                      <button className="font-medium text-glacier underline underline-offset-2" onClick={() => setTab("cases")}>
                        Open My disputes
                      </button>
                    </p>
                  )}
                  {letter || regenerating ? (
                    <LetterPanel result={result} letter={letter} setLetter={setLetter} phoneScript={phoneScript} regenerating={regenerating} revealKey={revealKey} />
                  ) : (
                    <p className="panel p-5 text-[15px] text-mist">
                      The model was busy, so the letter wasn&apos;t drafted. Your findings are safe; press <span className="text-frost">Write the letter</span> to try again.
                    </p>
                  )}
                </section>
              )}

              {evidence.length > 0 && (
                <details className="panel group p-5">
                  <summary className="flex cursor-pointer list-none items-center gap-2 text-[15px] font-medium text-frost">
                    <Icon name="search" size={16} className="text-cobalt" />
                    Research trail: {evidence.reduce((s, e) => s + e.results.length, 0)} sources found with{" "}
                    {steps.research?.model?.replace(/ (web )?search/g, "") || "web search"}
                    <Icon name="arrow" size={13} className="ml-auto rotate-90 text-mist transition-transform duration-200 group-open:-rotate-90" />
                  </summary>
                  <div className="mt-4 space-y-5">
                    {evidence.map((e) => (
                      <div key={e.query}>
                        <p className="text-[15px] text-frost">“{e.query}”</p>
                        {e.answer && <p className="mt-1 text-sm text-mist">{e.answer}</p>}
                        <ul className="mt-1.5 space-y-1">
                          {e.results.map((r) => (
                            <li key={r.url} className="truncate text-sm">
                              <a href={r.url} target="_blank" rel="noreferrer" className="text-cobalt underline decoration-cobalt/40 underline-offset-2 hover:text-frost">
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
    </div>
  );
}

/** Where the user is in the job. Order is carried by position and the words, not numbers. */
function Journey({ stage, running }: { stage: number; running: boolean }) {
  const stops = ["Add the bill", "Check", "Review", "Write", "Track"];
  return (
    <ol className="ml-auto hidden items-center gap-4 pb-3 text-sm lg:flex" aria-label="Progress">
      {stops.map((s, i) => {
        const done = i < stage;
        const cur = i === stage;
        return (
          <li key={s} className={`flex items-center gap-2 ${cur ? "font-medium text-frost" : done ? "text-mist" : "text-dim"}`} aria-current={cur ? "step" : undefined}>
            <span
              className={`grid h-4 w-4 place-items-center rounded-full ${cur ? (running ? "bg-cobalt" : "bg-glacier") : done ? "bg-mint text-on-accent" : "border border-steel"}`}
            >
              {done && <Icon name="check" size={10} />}
            </span>
            {s}
          </li>
        );
      })}
    </ol>
  );
}
