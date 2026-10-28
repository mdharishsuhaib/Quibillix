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
  high: "border border-mint/30 text-mint",
  medium: "border border-warn/30 text-warn",
  low: "border border-steel text-mist",
};

// Coral = provable error, amber = possible discrepancy, silver = open question. Never label a mere flag as "wrong".
const CERTAINTY: Record<Finding["certainty"], { label: string; cls: string; amount: string; hint: string }> = {
  confirmed: { label: "Confirmed error", cls: "bg-coral/15 text-coral ring-1 ring-coral/40", amount: "text-coral", hint: "Provable from the bill's own numbers" },
  suspected: { label: "Suspected overcharge", cls: "bg-warn/15 text-warn ring-1 ring-warn/40", amount: "text-warn", hint: "Backed by rules/benchmarks — provider must justify" },
  needs_info: { label: "Needs info", cls: "bg-mist/10 text-mist ring-1 ring-mist/30", amount: "text-mist", hint: "We'll ask for itemization; no amount claimed" },
};

export function money(n: number, currency: string) {
  try {
    return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", { style: "currency", currency }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

export function FindingCard({
  f,
  currency,
  approved,
  onToggle,
}: {
  f: Finding;
  currency: string;
  approved?: boolean;
  onToggle?: () => void;
}) {
  const c = CERTAINTY[f.certainty];
  return (
    <div className={`panel p-4 transition ${approved === false ? "opacity-45" : "hover:border-[#33445f]"}`}>
      <div className="flex flex-wrap items-center gap-2">
        {onToggle && (
          <input
            type="checkbox"
            checked={approved}
            onChange={onToggle}
            className="h-4 w-4 accent-[#20e3ce]"
            title="Include in dispute"
            aria-label={`Include "${f.title}" in dispute`}
          />
        )}
        <span className={`rounded px-2 py-0.5 text-xs font-semibold ${c.cls}`} title={c.hint}>
          {c.label}
        </span>
        <span className="rounded bg-uv/10 px-2 py-0.5 text-xs font-semibold text-uv">{KIND_LABEL[f.kind]}</span>
        <span className={`rounded px-2 py-0.5 text-xs ${CONF[f.confidence]}`}>{f.confidence} confidence</span>
        <span className="rounded bg-cobalt/10 px-2 py-0.5 text-xs text-cobalt">
          {f.source === "rule" ? "deterministic check" : "Nemotron audit"}
        </span>
        {f.lineItemIds.length > 0 && <span className="text-xs text-mist/70">lines {f.lineItemIds.join(", ")}</span>}
        <span className={`ml-auto text-sm font-semibold tabular-nums ${c.amount}`}>
          {f.estimatedOvercharge > 0 ? `−${money(f.estimatedOvercharge, currency)}` : "itemize"}
        </span>
      </div>
      <h4 className="mt-2 font-medium text-frost">{f.title}</h4>
      <p className="mt-1 text-sm text-mist">{f.explanation}</p>
      {f.citations.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {f.citations.map((c) => (
            <li key={c.url} className="truncate text-xs">
              <a className="text-cobalt underline decoration-cobalt/40 hover:text-glacier" href={c.url} target="_blank" rel="noreferrer">
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
    <div className="panel overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-steel bg-ink/40 text-left text-xs uppercase tracking-wide text-mist">
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
            <tr key={li.id} className={`border-t border-steel/70 ${flagged.has(li.id) ? "bg-warn/[0.06]" : ""}`}>
              <td className="px-3 py-1.5 font-mono text-xs text-mist/70">{li.id}</td>
              <td className="px-3 py-1.5 font-mono text-xs text-mist">{li.code ?? ""}</td>
              <td className="px-3 py-1.5">
                {li.description}
                {flagged.has(li.id) && <span className="ml-2 text-xs font-medium text-warn">flagged for review</span>}
              </td>
              <td className="px-3 py-1.5 text-right">{li.quantity}</td>
              <td className="px-3 py-1.5 text-right tabular-nums text-frost">{money(li.amount, bill.currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function LetterPanel({
  result,
  letter,
  setLetter,
  phoneScript,
  regenerating,
}: {
  result: AuditResult;
  letter: string;
  setLetter: (s: string) => void;
  phoneScript: string;
  regenerating?: boolean;
}) {
  const [tab, setTab] = useState<"letter" | "phone">("letter");
  const [copied, setCopied] = useState(false);
  const text = tab === "letter" ? letter : phoneScript;

  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  const download = () => {
    const blob = new Blob([letter], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `quibillix-dispute-${(result.bill.provider || "bill").replace(/\W+/g, "-").toLowerCase()}.txt`;
    a.click();
  };

  return (
    <div className="panel">
      <div className="flex items-center gap-1 border-b border-steel px-3 pt-3">
        {(["letter", "phone"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-t-md px-3 py-1.5 text-sm ${tab === t ? "border-b-2 border-uv bg-uv/10 font-medium text-frost" : "text-mist hover:text-frost"}`}
          >
            {t === "letter" ? "Dispute letter" : "Phone script"}
          </button>
        ))}
        <div className="ml-auto flex gap-2 pb-2">
          <button onClick={copy} className="btn-ghost px-2.5 py-1 text-xs">
            {copied ? "Copied!" : "Copy"}
          </button>
          {tab === "letter" && (
            <button onClick={download} className="btn-ghost px-2.5 py-1 text-xs">
              Download
            </button>
          )}
        </div>
      </div>
      {regenerating ? (
        <div className="grid h-96 place-items-center text-sm text-uv">Rewriting the letter with only your approved items…</div>
      ) : tab === "letter" ? (
        <textarea
          value={letter}
          onChange={(e) => setLetter(e.target.value)}
          className="h-96 w-full resize-y rounded-b-2xl bg-transparent p-4 font-mono text-[13px] leading-relaxed text-frost outline-none"
        />
      ) : (
        <pre className="h-96 overflow-auto whitespace-pre-wrap p-4 font-mono text-[13px] leading-relaxed text-frost">{phoneScript}</pre>
      )}
    </div>
  );
}
