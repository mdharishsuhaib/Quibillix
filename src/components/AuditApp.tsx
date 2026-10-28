"use client";

import { useRef, useState } from "react";
import { SAMPLES } from "@/lib/samples";
import type { AuditResult, Evidence, Finding, ParsedBill, StepId, StreamEvent } from "@/lib/types";
import Pipeline, { STEPS, type StepState } from "./Pipeline";
import { FindingCard, LetterPanel, LineItems, money } from "./Results";

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
  const fileRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

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
            case "result":
              setResult(ev.result);
              setFindings(ev.result.findings);
              break;
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
                <p className="text-sm opacity-80">Potentially disputable</p>
                <p className="text-4xl font-bold tabular-nums">{money(result.totalDisputable, currency)}</p>
                <p className="mt-1 text-sm opacity-80">
                  of {money(result.totalBilled, currency)} billed ·{" "}
                  {result.totalBilled > 0 ? Math.round((result.totalDisputable / result.totalBilled) * 100) : 0}% · {result.findings.length} issue(s)
                </p>
                <p className="mt-4 max-w-3xl text-[15px] leading-relaxed">{result.summary}</p>
              </div>
            )}

            {findings.length > 0 && (
              <div>
                <h3 className="mb-3 font-semibold">
                  Issues found {!result && <span className="text-sm font-normal text-slate-400">(deep audit in progress…)</span>}
                </h3>
                <div className="grid gap-3">
                  {[...findings]
                    .sort((a, b) => b.estimatedOvercharge - a.estimatedOvercharge)
                    .map((f) => (
                      <FindingCard key={f.id} f={f} currency={currency} />
                    ))}
                </div>
              </div>
            )}

            {result?.letter && (
              <div>
                <h3 className="mb-3 font-semibold">Ready-to-send dispute</h3>
                <LetterPanel result={result} />
              </div>
            )}

            {bill && (
              <div>
                <h3 className="mb-1 font-semibold">What Fairbill read</h3>
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
    </div>
  );
}
