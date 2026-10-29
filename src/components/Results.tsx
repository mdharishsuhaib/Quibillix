"use client";

import { useEffect, useRef, useState } from "react";
import type { AuditResult, Finding, IssueKind, ParsedBill } from "@/lib/types";
import Icon from "./fx/Icon";

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

const CONF: Record<Finding["confidence"], number> = { high: 3, medium: 2, low: 1 };

// Coral = provable error, amber = possible discrepancy, silver = open question. Never label a mere flag as "wrong".
const CERTAINTY: Record<Finding["certainty"], { label: string; cls: string; amount: string; hint: string; spine: string; pin: string }> = {
  confirmed: {
    label: "Confirmed error",
    cls: "bg-coral/15 text-coral ring-1 ring-coral/40",
    amount: "text-coral",
    hint: "Provable from the bill's own numbers",
    spine: "bg-coral shadow-[0_0_14px_var(--coral)]",
    pin: "bg-coral text-ink",
  },
  suspected: {
    label: "Suspected overcharge",
    cls: "bg-warn/15 text-warn ring-1 ring-warn/40",
    amount: "text-warn",
    hint: "Backed by rules/benchmarks — provider must justify",
    spine: "bg-warn shadow-[0_0_14px_var(--warn)]",
    pin: "bg-warn text-ink",
  },
  needs_info: {
    label: "Needs info",
    cls: "bg-mist/10 text-mist ring-1 ring-mist/30",
    amount: "text-mist",
    hint: "We'll ask for itemization; no amount claimed",
    spine: "bg-mist/60",
    pin: "bg-cobalt text-white",
  },
};

export function money(n: number, currency: string) {
  try {
    return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", { style: "currency", currency }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

/** Approve/exclude switch with a rubber-stamp confirmation. */
function ApproveSwitch({ on, onToggle, title }: { on: boolean; onToggle: () => void; title: string }) {
  const [stampKey, setStampKey] = useState(0);
  return (
    <div className="relative flex items-center gap-2">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={`Include "${title}" in dispute`}
        onClick={() => {
          onToggle();
          setStampKey((k) => k + 1);
        }}
        className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors duration-300 ${on ? "border-glacier/60 bg-glacier/25" : "border-steel bg-ink"}`}
      >
        <span
          className={`absolute top-[3px] h-4 w-4 rounded-full transition-all duration-300 ease-[var(--ease-spring)] ${on ? "left-[22px] bg-glacier shadow-[0_0_10px_var(--glacier)]" : "left-[3px] bg-mist/60"}`}
        />
      </button>
      <span className={`text-[11px] font-medium ${on ? "text-glacier" : "text-mist/70"}`}>{on ? "In dispute" : "Excluded"}</span>
      {stampKey > 0 && (
        <span
          key={stampKey}
          aria-hidden
          className={`stamp pointer-events-none absolute -top-3 left-14 rounded border-2 px-1.5 font-mono text-[10px] font-bold tracking-[0.2em] ${on ? "border-glacier text-glacier" : "border-mist/60 text-mist/70"}`}
          style={{ animation: "stamp .5s var(--ease-spring) both, rise .4s 1.1s reverse forwards" }}
        >
          {on ? "APPROVED" : "EXCLUDED"}
        </span>
      )}
    </div>
  );
}

export function FindingCard({
  f,
  currency,
  approved,
  onToggle,
  bill,
  index,
  focused,
  onFocus,
}: {
  f: Finding;
  currency: string;
  approved?: boolean;
  onToggle?: () => void;
  bill?: ParsedBill;
  index?: number;
  focused?: boolean;
  onFocus?: (id: string | null) => void;
}) {
  const c = CERTAINTY[f.certainty];
  const lines = bill ? bill.lineItems.filter((li) => f.lineItemIds.includes(li.id)) : [];
  const [open, setOpen] = useState(f.certainty === "confirmed");
  const hasDetail = lines.length > 0 || f.citations.length > 0;
  return (
    <article
      id={`finding-${f.id}`}
      onPointerEnter={() => onFocus?.(f.id)}
      onPointerLeave={() => onFocus?.(null)}
      className={`spot reveal panel relative overflow-hidden transition-[opacity,transform,border-color] duration-300 ${approved === false ? "opacity-50" : ""} ${focused ? "!border-[#3a5078] -translate-y-0.5" : ""}`}
      style={{ ["--i" as string]: index ?? 0 }}
    >
      <span aria-hidden className={`absolute bottom-0 left-0 top-0 w-[3px] ${c.spine}`} />
      <div className="p-4 pl-5">
        <div className="flex items-start gap-3">
          {index != null && (
            <span className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full font-mono text-[11px] font-bold ${c.pin} ${focused ? "scale-110" : ""} transition-transform`}>
              {index + 1}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className={`rounded px-2 py-0.5 text-[11px] font-semibold ${c.cls}`} title={c.hint}>
                {c.label}
              </span>
              <span className="rounded bg-uv/10 px-2 py-0.5 text-[11px] font-semibold text-uv">{KIND_LABEL[f.kind]}</span>
              <span className="rounded bg-cobalt/10 px-2 py-0.5 text-[11px] text-cobalt">{f.source === "rule" ? "Deterministic check" : "Nemotron audit"}</span>
              <span className="inline-flex items-center gap-1 px-1 text-[11px] text-mist" title={`${f.confidence} confidence`}>
                {[1, 2, 3].map((n) => (
                  <span key={n} className={`h-2.5 w-1 rounded-sm ${n <= CONF[f.confidence] ? "bg-glacier" : "bg-steel"}`} />
                ))}
                <span className="ml-0.5">{f.confidence}</span>
              </span>
            </div>
            <h4 className="mt-2 text-[15px] font-medium leading-snug text-frost">{f.title}</h4>
          </div>
          <div className="shrink-0 text-right">
            <p className={`text-lg font-semibold tabular-nums ${c.amount}`}>{f.estimatedOvercharge > 0 ? `−${money(f.estimatedOvercharge, currency)}` : "itemize"}</p>
            {f.lineItemIds.length > 0 && <p className="font-mono text-[10px] text-mist/60">line {f.lineItemIds.join(", ")}</p>}
          </div>
        </div>

        <p className="mt-2 text-sm leading-relaxed text-mist">{f.explanation}</p>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          {onToggle ? <ApproveSwitch on={!!approved} onToggle={onToggle} title={f.title} /> : <span />}
          {hasDetail && (
            <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="inline-flex items-center gap-1 text-[12px] text-cobalt hover:text-glacier">
              {open ? "Hide evidence" : `Evidence${f.citations.length ? ` · ${f.citations.length} source${f.citations.length > 1 ? "s" : ""}` : ""}`}
              <Icon name="arrow" size={12} className={`transition-transform duration-300 ${open ? "-rotate-90" : "rotate-90"}`} />
            </button>
          )}
        </div>

        <div className={`grid transition-[grid-template-rows] duration-500 ease-[var(--ease-out)] ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
          <div className="overflow-hidden">
            {lines.length > 0 && (
              <div className="mt-3 overflow-x-auto rounded-md border border-steel bg-ink/60">
                <p className="border-b border-steel px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-mist/70">Evidence from your bill</p>
                <table className="w-full font-mono text-[11px]">
                  <tbody>
                    {lines.map((li) => {
                      const expected = li.unitPrice != null ? Math.round(li.unitPrice * li.quantity * 100) / 100 : null;
                      const mathOff = expected != null && Math.abs(expected - li.amount) > 0.5;
                      return (
                        <tr key={li.id} className="border-t border-steel/50 first:border-0">
                          <td className="px-2 py-1 text-mist/60">{li.id}</td>
                          <td className="px-2 py-1 text-mist">{li.code ?? ""}</td>
                          <td className="px-2 py-1 text-frost">{li.description}</td>
                          <td className="px-2 py-1 text-right text-mist">
                            {li.quantity}
                            {li.unitPrice != null && ` × ${li.unitPrice.toFixed(2)}`}
                          </td>
                          <td className={`px-2 py-1 text-right ${c.amount}`}>
                            {money(li.amount, currency)}
                            {mathOff && <span className="block text-[10px] text-mint">should be {money(expected!, currency)}</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {f.citations.length > 0 && (
              <ul className="mt-2 space-y-1">
                {f.citations.map((ct) => (
                  <li key={ct.url} className="flex items-center gap-1.5 truncate text-xs">
                    <Icon name="link" size={12} className="shrink-0 text-cobalt/70" />
                    <a className="truncate text-cobalt underline decoration-cobalt/40 hover:text-glacier" href={ct.url} target="_blank" rel="noreferrer">
                      {ct.title || ct.url}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </article>
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

/** Reveals `text` like it's being typed whenever `revealKey` changes (not on user edits). */
function useTypewriter(text: string, revealKey: string) {
  const [n, setN] = useState(Infinity);
  const textRef = useRef(text);
  useEffect(() => {
    textRef.current = text;
  }, [text]);
  useEffect(() => {
    if (!revealKey || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const total = textRef.current.length;
    const dur = Math.min(2600, 500 + total * 0.9);
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / dur);
      setN(p >= 1 ? Infinity : Math.floor(total * (1 - Math.pow(1 - p, 2))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [revealKey]);
  return n;
}

export function LetterPanel({
  result,
  letter,
  setLetter,
  phoneScript,
  regenerating,
  revealKey = "",
}: {
  result: AuditResult;
  letter: string;
  setLetter: (s: string) => void;
  phoneScript: string;
  regenerating?: boolean;
  revealKey?: string;
}) {
  const [tab, setTab] = useState<"letter" | "phone">("letter");
  const [copied, setCopied] = useState(false);
  const text = tab === "letter" ? letter : phoneScript;
  const typed = useTypewriter(letter, revealKey);
  const typing = tab === "letter" && typed < letter.length;

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
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;

  return (
    <div className="spot panel overflow-hidden">
      <div className="prism-bar h-[2px] opacity-80" />
      <div className="flex flex-wrap items-center gap-1 border-b border-steel px-3 pt-3">
        <div className="relative flex rounded-lg bg-ink/60 p-0.5" role="tablist">
          <span
            aria-hidden
            className="absolute bottom-0.5 top-0.5 w-[calc(50%-2px)] rounded-md bg-uv/15 ring-1 ring-uv/40 transition-transform duration-300 ease-[var(--ease-out)]"
            style={{ transform: tab === "letter" ? "translateX(0)" : "translateX(100%)" }}
          />
          {(["letter", "phone"] as const).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => setTab(t)}
              className={`relative z-10 inline-flex w-36 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm ${tab === t ? "font-medium text-frost" : "text-mist hover:text-frost"}`}
            >
              <Icon name={t === "letter" ? "pdf" : "phone"} size={14} />
              {t === "letter" ? "Dispute letter" : "Phone script"}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2 pb-3">
          <span className="hidden font-mono text-[10px] text-mist/60 sm:inline">{words} words</span>
          <button onClick={copy} className="btn-ghost inline-flex items-center gap-1.5 px-2.5 py-1 text-xs">
            <Icon name={copied ? "check" : "copy"} size={13} className={copied ? "text-mint" : ""} />
            {copied ? "Copied" : "Copy"}
          </button>
          {tab === "letter" && (
            <button onClick={download} className="btn-ghost inline-flex items-center gap-1.5 px-2.5 py-1 text-xs">
              <Icon name="download" size={13} />
              Download
            </button>
          )}
        </div>
      </div>
      {regenerating ? (
        <div className="space-y-2.5 p-5" aria-live="polite">
          <p className="caret mb-4 font-mono text-xs text-uv">Rewriting the letter with only your approved items</p>
          {[92, 78, 85, 60, 88, 70, 40].map((w, i) => (
            <div key={i} className="shimmer h-3 rounded" style={{ width: `${w}%` }} />
          ))}
        </div>
      ) : tab === "letter" ? (
        typing ? (
          <pre className="caret h-96 overflow-hidden whitespace-pre-wrap p-5 font-mono text-[13px] leading-relaxed text-frost">{letter.slice(0, typed)}</pre>
        ) : (
          <textarea
            value={letter}
            onChange={(e) => setLetter(e.target.value)}
            aria-label="Dispute letter (editable)"
            className="h-96 w-full resize-y bg-transparent p-5 font-mono text-[13px] leading-relaxed text-frost outline-none"
          />
        )
      ) : (
        <pre className="h-96 overflow-auto whitespace-pre-wrap p-5 font-mono text-[13px] leading-relaxed text-frost">{phoneScript}</pre>
      )}
    </div>
  );
}
