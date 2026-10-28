"use client";

import { useState } from "react";
import type { AuditResult, Finding, IssueKind, ParsedBill } from "@/lib/types";

const KIND_LABEL: Record<IssueKind, string> = {
  duplicate: "Duplicate",
  math_error: "Math error",
  price_outlier: "Overpriced",
  upcoding: "Upcoding",
  unbundling: "Unbundling",
  balance_billing: "Balance billing",
  not_received: "Not received",
  late_fee: "Junk fee",
  other: "Other",
};

const CONF: Record<Finding["confidence"], string> = {
  high: "bg-emerald-100 text-emerald-800",
  medium: "bg-amber-100 text-amber-800",
  low: "bg-slate-100 text-slate-700",
};

export function money(n: number, currency: string) {
  try {
    return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", { style: "currency", currency }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

export function FindingCard({ f, currency }: { f: Finding; currency: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700">{KIND_LABEL[f.kind]}</span>
        <span className={`rounded px-2 py-0.5 text-xs ${CONF[f.confidence]}`}>{f.confidence} confidence</span>
        <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
          {f.source === "rule" ? "deterministic check" : "Nemotron audit"}
        </span>
        {f.lineItemIds.length > 0 && <span className="text-xs text-slate-400">lines {f.lineItemIds.join(", ")}</span>}
        <span className="ml-auto text-sm font-semibold text-rose-700">−{money(f.estimatedOvercharge, currency)}</span>
      </div>
      <h4 className="mt-2 font-medium">{f.title}</h4>
      <p className="mt-1 text-sm text-slate-600">{f.explanation}</p>
      {f.citations.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {f.citations.map((c) => (
            <li key={c.url} className="truncate text-xs">
              <a className="text-emerald-700 underline" href={c.url} target="_blank" rel="noreferrer">
                {c.title || c.url}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function LineItems({ bill, findings }: { bill: ParsedBill; findings: Finding[] }) {
  const flagged = new Set(findings.flatMap((f) => f.lineItemIds));
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
          <tr>
            <th className="px-3 py-2">#</th>
            <th className="px-3 py-2">Code</th>
            <th className="px-3 py-2">Description</th>
            <th className="px-3 py-2 text-right">Qty</th>
            <th className="px-3 py-2 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {bill.lineItems.map((li) => (
            <tr key={li.id} className={`border-t ${flagged.has(li.id) ? "bg-rose-50" : ""}`}>
              <td className="px-3 py-1.5 font-mono text-xs text-slate-400">{li.id}</td>
              <td className="px-3 py-1.5 font-mono text-xs">{li.code ?? ""}</td>
              <td className="px-3 py-1.5">
                {li.description}
                {flagged.has(li.id) && <span className="ml-2 text-xs font-medium text-rose-600">flagged</span>}
              </td>
              <td className="px-3 py-1.5 text-right">{li.quantity}</td>
              <td className="px-3 py-1.5 text-right tabular-nums">{money(li.amount, bill.currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function LetterPanel({ result }: { result: AuditResult }) {
  const [tab, setTab] = useState<"letter" | "phone">("letter");
  const [letter, setLetter] = useState(result.letter);
  const [copied, setCopied] = useState(false);
  const text = tab === "letter" ? letter : result.phoneScript;

  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  const download = () => {
    const blob = new Blob([letter], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `quibbill-dispute-${(result.bill.provider || "bill").replace(/\W+/g, "-").toLowerCase()}.txt`;
    a.click();
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-1 border-b px-3 pt-3">
        {(["letter", "phone"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-t-md px-3 py-1.5 text-sm ${tab === t ? "bg-emerald-50 font-medium text-emerald-800" : "text-slate-500"}`}
          >
            {t === "letter" ? "Dispute letter" : "Phone script"}
          </button>
        ))}
        <div className="ml-auto flex gap-2 pb-2">
          <button onClick={copy} className="rounded-md border px-2.5 py-1 text-xs hover:bg-slate-50">
            {copied ? "Copied!" : "Copy"}
          </button>
          {tab === "letter" && (
            <button onClick={download} className="rounded-md border px-2.5 py-1 text-xs hover:bg-slate-50">
              Download
            </button>
          )}
        </div>
      </div>
      {tab === "letter" ? (
        <textarea
          value={letter}
          onChange={(e) => setLetter(e.target.value)}
          className="h-96 w-full resize-y p-4 font-mono text-[13px] leading-relaxed outline-none"
        />
      ) : (
        <pre className="h-96 overflow-auto whitespace-pre-wrap p-4 font-mono text-[13px] leading-relaxed">{result.phoneScript}</pre>
      )}
    </div>
  );
}
