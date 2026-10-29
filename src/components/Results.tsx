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
    cls: "bg-coral/15 text-coral",
    amount: "text-coral",
    hint: "Provable from the bill's own numbers",
    spine: "bg-coral",
    pin: "bg-coral text-on-accent",
  },
  suspected: {
    label: "Suspected overcharge",
    cls: "bg-warn/15 text-warn",
    amount: "text-warn",
    hint: "Backed by rules or benchmarks; the provider must justify it",
    spine: "bg-warn",
    pin: "bg-warn text-on-accent",
  },
  needs_info: {
    label: "Needs itemising",
    cls: "bg-cobalt/15 text-cobalt-soft",
    amount: "text-mist",
    hint: "We'll ask for itemization; no amount claimed",
    spine: "bg-cobalt",
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
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 ${on ? "bg-glacier" : "bg-steel"}`}
      >
        <span
          className={`absolute left-[3px] top-[3px] h-[18px] w-[18px] rounded-full bg-knob transition-transform duration-200 ease-[var(--ease-out)] ${on ? "translate-x-5" : ""}`}
        />
      </button>
      <span className={`text-sm font-medium ${on ? "text-frost" : "text-mist"}`}>{on ? "In the dispute" : "Left out"}</span>
      {stampKey > 0 && (
        <span
          key={stampKey}
          aria-hidden
          className={`pointer-events-none absolute -top-2 left-40 rounded-[3px] border-2 px-1.5 text-[11px] font-bold uppercase ${on ? "border-glacier text-glacier" : "border-mist text-mist"}`}
          style={{ animation: "stamp .42s var(--ease-out) both, fade .3s .9s reverse forwards" }}
        >
          {on ? "Approved" : "Left out"}
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
      className={`reveal panel relative overflow-hidden transition-[opacity,border-color] duration-200 ${approved === false ? "opacity-55" : ""} ${focused ? "!border-edge" : ""}`}
      style={{ ["--i" as string]: index ?? 0 }}
    >
      <span aria-hidden className={`absolute bottom-0 left-0 top-0 w-[3px] ${c.spine}`} />
      <div className="p-5 pl-6">
        <div className="flex items-start gap-3">
          {index != null && (
            <span className={`num mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold transition-transform duration-200 ${c.pin} ${focused ? "scale-110" : ""}`}>
              {index + 1}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h4 className="text-base font-semibold leading-snug text-frost">{f.title}</h4>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-mist">
              <span className={`pill ${c.cls}`} title={c.hint}>
                {c.label}
              </span>
              <span>{KIND_LABEL[f.kind]}</span>
              <span aria-hidden>·</span>
              <span className={f.source === "rule" ? "" : "text-uv"}>{f.source === "rule" ? "Deterministic check" : "Nemotron audit"}</span>
              <span aria-hidden>·</span>
              <span className="inline-flex items-center gap-1" title={`${f.confidence} confidence`}>
                {[1, 2, 3].map((n) => (
                  <span key={n} className={`h-3 w-1 rounded-[1px] ${n <= CONF[f.confidence] ? "bg-frost" : "bg-steel"}`} />
                ))}
                <span className="ml-1">{f.confidence[0].toUpperCase() + f.confidence.slice(1)} confidence</span>
              </span>
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className={`num text-lg font-semibold ${c.amount}`}>{f.estimatedOvercharge > 0 ? `−${money(f.estimatedOvercharge, currency)}` : "Itemise"}</p>
            {f.lineItemIds.length > 0 && <p className="text-xs text-mist">Line {f.lineItemIds.join(", ")}</p>}
          </div>
        </div>

        <p className="mt-3 text-[15px] leading-relaxed text-frost/90">{f.explanation}</p>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          {onToggle ? <ApproveSwitch on={!!approved} onToggle={onToggle} title={f.title} /> : <span />}
          {hasDetail && (
            <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="inline-flex items-center gap-1 text-sm text-cobalt hover:text-frost">
              {open ? "Hide evidence" : `Show evidence${f.citations.length ? ` and ${f.citations.length} source${f.citations.length > 1 ? "s" : ""}` : ""}`}
              <Icon name="arrow" size={12} className={`transition-transform duration-200 ${open ? "-rotate-90" : "rotate-90"}`} />
            </button>
          )}
        </div>

        <div className={`grid transition-[grid-template-rows] duration-500 ease-[var(--ease-out)] ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
          <div className="overflow-hidden">
            {lines.length > 0 && (
              <div className="well mt-4 overflow-x-auto p-3">
                <p className="mb-1 text-xs text-mist">On your bill</p>
                <table className="num w-full text-sm">
                  <tbody>
                    {lines.map((li) => {
                      const expected = li.unitPrice != null ? Math.round(li.unitPrice * li.quantity * 100) / 100 : null;
                      const mathOff = expected != null && Math.abs(expected - li.amount) > 0.5;
                      return (
                        <tr data-ui key={li.id} className="border-t border-steel first:border-0">
                          <td className="py-1.5 pr-3 align-top text-mist">{li.id}</td>
                          <td className="py-1.5 pr-3 align-top">
                            <span className="text-frost">{li.description}</span>
                            {li.code && <span className="ml-2 font-mono text-xs text-mist">{li.code}</span>} {/* taste-skill-ignore: billing code */}
                          </td>
                          <td className="whitespace-nowrap py-1.5 pr-3 text-right align-top text-mist">
                            {li.quantity}
                            {li.unitPrice != null && ` × ${li.unitPrice.toFixed(2)}`}
                          </td>
                          <td className={`whitespace-nowrap py-1.5 text-right align-top ${c.amount}`}>
                            {money(li.amount, currency)}
                            {mathOff && <span className="block text-xs text-mint">should be {money(expected!, currency)}</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {f.citations.length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {f.citations.map((ct) => (
                  <li key={ct.url} className="flex items-center gap-2 truncate text-sm">
                    <Icon name="link" size={13} className="shrink-0 text-cobalt" />
                    <a className="truncate text-cobalt underline decoration-cobalt/40 underline-offset-2 hover:text-frost" href={ct.url} target="_blank" rel="noreferrer">
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
    <div className="panel overflow-hidden">
      <div data-ui className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-steel px-5 pt-3">
        <div className="flex gap-6" role="tablist" aria-label="Dispute documents">
          {(["letter", "phone"] as const).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className="tab inline-flex items-center gap-2 pb-3 text-sm font-medium">
              <Icon name={t === "letter" ? "pdf" : "phone"} size={15} />
              {t === "letter" ? "Dispute letter" : "Phone script"}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2 pb-3">
          <span className="num hidden text-sm text-mist sm:inline">{words} words</span>
          <button onClick={copy} className="btn-ghost inline-flex items-center gap-1.5 px-3 py-1.5 text-sm">
            <Icon name={copied ? "check" : "copy"} size={14} className={copied ? "text-mint" : ""} />
            {copied ? "Copied" : "Copy"}
          </button>
          {tab === "letter" && (
            <button onClick={download} className="btn-ghost inline-flex items-center gap-1.5 px-3 py-1.5 text-sm">
              <Icon name="download" size={14} />
              Download
            </button>
          )}
        </div>
      </div>
      {/* The letter is a sheet of paper, like the bill it answers. */}
      <div className="bg-ink/40 p-4 sm:p-6">
        {regenerating ? (
          <div className="paper space-y-3 rounded-[3px] p-6" aria-live="polite">
            <p className="caret mb-5 text-sm font-medium text-paper-ink">Rewriting the letter with only the items you approved</p>
            {[92, 78, 85, 60, 88, 70, 40].map((w, i) => (
              <div key={i} className="h-3 rounded-[2px] bg-paper-ink/10" style={{ width: `${w}%` }} />
            ))}
          </div>
        ) : tab === "letter" ? (
          typing ? (
            <pre className="paper caret h-[28rem] overflow-hidden whitespace-pre-wrap rounded-[3px] p-6 font-sans text-[14px] leading-relaxed">{letter.slice(0, typed)}</pre>
          ) : (
            <textarea
              value={letter}
              onChange={(e) => setLetter(e.target.value)}
              aria-label="Dispute letter (editable)"
              className="paper block h-[28rem] w-full resize-y rounded-[3px] p-6 font-sans text-[14px] leading-relaxed outline-none focus-visible:outline-2 focus-visible:outline-glacier"
            />
          )
        ) : (
          <pre className="paper h-[28rem] overflow-auto whitespace-pre-wrap rounded-[3px] p-6 font-sans text-[14px] leading-relaxed">{phoneScript}</pre>
        )}
      </div>
    </div>
  );
}
