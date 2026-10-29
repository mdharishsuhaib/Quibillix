"use client";

import { useState } from "react";
import type { AuditResult, Certainty, Finding } from "@/lib/types";
import CountUp from "./fx/CountUp";
import { money } from "./Results";

const HUE: Record<Certainty, string> = { confirmed: "var(--coral)", suspected: "var(--warn)", needs_info: "var(--cobalt)" };
const RANK: Record<Certainty, number> = { confirmed: 0, suspected: 1, needs_info: 2 };

/** Thin ring: confirmed then suspected, over the untouched rest of the bill. No labels on the arcs. */
function Ring({ billed, confirmed, suspected }: { billed: number; confirmed: number; suspected: number }) {
  const R = 52;
  const C = 2 * Math.PI * R;
  const pc = billed > 0 ? Math.min(1, confirmed / billed) : 0;
  const ps = billed > 0 ? Math.min(1 - pc, suspected / billed) : 0;
  return (
    <svg viewBox="0 0 120 120" className="h-[88px] w-[88px] shrink-0 -rotate-90 sm:h-[120px] sm:w-[120px]" aria-hidden>
      <circle cx="60" cy="60" r={R} fill="none" stroke="var(--raised)" strokeWidth="8" />
      {pc > 0 && (
        <circle cx="60" cy="60" r={R} fill="none" stroke="var(--coral)" strokeWidth="8" strokeDasharray={`${pc * C} ${C}`} strokeDashoffset={pc * C} style={{ animation: "draw .8s var(--ease-out) .15s forwards" }} />
      )}
      {ps > 0 && (
        <circle
          cx="60"
          cy="60"
          r={R}
          fill="none"
          stroke="var(--warn)"
          strokeWidth="8"
          transform={`rotate(${pc * 360} 60 60)`}
          strokeDasharray={`${ps * C} ${C}`}
          strokeDashoffset={ps * C}
          style={{ animation: "draw .8s var(--ease-out) .45s forwards" }}
        />
      )}
    </svg>
  );
}

/**
 * The whole bill as one bar, each band a line sized by cost. Clean lines stay one neutral
 * tone; only the lines the audit marked carry colour, so the eye lands on them first.
 */
export function SpectralLedger({ result, findings, focusId, onFocus }: { result: AuditResult; findings: Finding[]; focusId: string | null; onFocus: (id: string | null) => void }) {
  const [hover, setHover] = useState<string | null>(null);
  const items = result.bill.lineItems.filter((li) => li.amount > 0);
  const total = items.reduce((s, li) => s + li.amount, 0) || 1;
  const worst = (id: string) => findings.filter((f) => f.lineItemIds.includes(id)).sort((a, b) => RANK[a.certainty] - RANK[b.certainty])[0];
  const focused = findings.find((f) => f.id === focusId);
  const hovered = items.find((li) => li.id === hover);
  const cur = result.bill.currency;
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h4 className="text-sm font-semibold text-frost">Where the money went</h4>
        <p className="num min-h-[20px] truncate text-sm text-mist">
          {hovered ? (
            <>
              <span className="text-frost">{hovered.description}</span> · {money(hovered.amount, cur)} · {Math.round((hovered.amount / total) * 100)}% of the bill
            </>
          ) : (
            "Each band is one line, sized by what it cost"
          )}
        </p>
      </div>
      <div
        className="flex h-10 gap-[2px] overflow-hidden rounded-[var(--r-control)]"
        onPointerLeave={() => {
          setHover(null);
          onFocus(null);
        }}
      >
        {items.map((li, i) => {
          const f = worst(li.id);
          const isFocus = focused?.lineItemIds.includes(li.id);
          const dim = (focused && !isFocus) || (hover && hover !== li.id);
          return (
            <button
              key={li.id}
              type="button"
              aria-label={`${li.description}: ${money(li.amount, cur)}${f ? `, flagged: ${f.title}` : ""}`}
              onPointerEnter={() => {
                setHover(li.id);
                onFocus(f?.id ?? null);
              }}
              onFocus={() => setHover(li.id)}
              onBlur={() => setHover(null)}
              onClick={() => f && document.getElementById(`finding-${f.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}
              className="animate-grow-x h-full min-w-[3px] transition-opacity duration-200"
              style={{
                flexGrow: li.amount / total,
                flexBasis: 0,
                animationDelay: `${i * 35}ms`,
                opacity: dim ? 0.3 : 1,
                background: f
                  ? f.certainty === "needs_info"
                    ? "repeating-linear-gradient(135deg, var(--cobalt) 0 3px, color-mix(in oklab, var(--cobalt) 35%, var(--carbon)) 3px 7px)" // taste-skill-ignore: hatch encodes "needs itemising" as its own mark
                    : HUE[f.certainty]
                  : "var(--neutral-slice)",
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

export default function Verdict({
  result,
  findings,
  currency,
  manualHours,
  focusId,
  onFocus,
}: {
  result: AuditResult;
  findings: Finding[];
  currency: string;
  manualHours: number;
  focusId: string | null;
  onFocus: (id: string | null) => void;
}) {
  const needs = result.findings.filter((f) => f.certainty === "needs_info").length;
  const fmt = (n: number) => money(n, currency);
  const pct = result.totalBilled > 0 ? Math.round((result.totalDisputable / result.totalBilled) * 100) : 0;
  const clean = Math.max(0, result.totalBilled - result.confirmedTotal - result.suspectedTotal);
  const rows = [
    { c: "var(--coral)", l: "Confirmed errors", s: "Provable from the bill's own numbers", v: fmt(result.confirmedTotal) },
    { c: "var(--warn)", l: "Suspected overcharges", s: "Provider must justify these", v: fmt(result.suspectedTotal) },
    { c: "var(--cobalt)", l: "Needs itemising", s: "We ask; no amount claimed", v: `${needs} ${needs === 1 ? "line" : "lines"}` },
    { c: "var(--neutral-slice)", l: "No issue found", s: "Left alone", v: fmt(clean) },
  ];
  return (
    <section aria-labelledby="verdict-title" className="panel reveal p-6">
      <h3 id="verdict-title" className="text-base font-semibold text-frost">
        What this bill owes you back
      </h3>
      <div className="mt-4 flex flex-col gap-6 sm:flex-row sm:items-center">
        <div className="flex items-center gap-4 sm:gap-5">
          <Ring billed={result.totalBilled} confirmed={result.confirmedTotal} suspected={result.suspectedTotal} />
          <div className="min-w-0">
            <CountUp value={result.totalDisputable} format={fmt} ms={1100} className="num block text-[30px] font-semibold leading-none tracking-[-0.02em] text-frost sm:text-[40px]" />
            <p className="num mt-2 text-sm text-mist">
              {pct}% of {fmt(result.totalBilled)} billed · checked in {Math.round(result.durationMs / 1000)} s, about {manualHours} h by hand
            </p>
          </div>
        </div>
        <table className="num w-full text-sm sm:ml-auto sm:max-w-[360px]">
          <tbody>
            {rows.map((r) => (
              <tr data-ui key={r.l} className="border-t border-steel first:border-0">
                <td className="py-2 pr-3">
                  <span className="flex items-center gap-2 text-frost">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-[2px]" style={{ background: r.c }} />
                    {r.l}
                  </span>
                  <span className="ml-[18px] block text-xs text-mist">{r.s}</span>
                </td>
                <td className="py-2 text-right font-medium text-frost">{r.v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-6 max-w-3xl text-[15px] leading-relaxed text-frost">{result.summary}</p>
      <div className="mt-6">
        <SpectralLedger result={result} findings={findings} focusId={focusId} onFocus={onFocus} />
      </div>
    </section>
  );
}
