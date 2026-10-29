"use client";

import { useState } from "react";
import type { AuditResult, Certainty, Finding } from "@/lib/types";
import CountUp from "./fx/CountUp";
import { money } from "./Results";

const TONE: Record<Certainty | "clean", string> = {
  confirmed: "var(--coral)",
  suspected: "var(--warn)",
  needs_info: "var(--mist)",
  clean: "",
};

/** SVG donut: confirmed (coral) + suspected (amber) arcs over the clean spectrum. */
function RefractionRing({ billed, confirmed, suspected, currency }: { billed: number; confirmed: number; suspected: number; currency: string }) {
  const R = 64;
  const C = 2 * Math.PI * R;
  const pc = billed > 0 ? Math.min(1, confirmed / billed) : 0;
  const ps = billed > 0 ? Math.min(1 - pc, suspected / billed) : 0;
  const pct = Math.round((pc + ps) * 100);
  return (
    <div className="relative h-[168px] w-[168px] shrink-0">
      <svg viewBox="0 0 160 160" className="h-full w-full -rotate-90">
        <defs>
          <linearGradient id="clean-spec" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#20e3ce" />
            <stop offset="0.5" stopColor="#477bff" />
            <stop offset="1" stopColor="#b66cff" />
          </linearGradient>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <circle cx="80" cy="80" r={R} fill="none" stroke="var(--steel)" strokeWidth="10" />
        <circle cx="80" cy="80" r={R} fill="none" stroke="url(#clean-spec)" strokeOpacity="0.35" strokeWidth="10" strokeDasharray={C} strokeDashoffset={C} style={{ animation: "draw 1.2s var(--ease-out) forwards" }} />
        {ps > 0 && (
          <circle
            cx="80"
            cy="80"
            r={R}
            fill="none"
            stroke="var(--warn)"
            strokeWidth="10"
            filter="url(#glow)"
            transform={`rotate(${pc * 360} 80 80)`}
            strokeDasharray={`${ps * C} ${C}`}
            strokeDashoffset={ps * C}
            style={{ animation: "draw 1s var(--ease-out) 0.55s forwards" }}
          />
        )}
        {pc > 0 && (
          <circle
            cx="80"
            cy="80"
            r={R}
            fill="none"
            stroke="var(--coral)"
            strokeWidth="10"
            filter="url(#glow)"
            strokeDasharray={`${pc * C} ${C}`}
            strokeDashoffset={pc * C}
            style={{ animation: "draw 0.9s var(--ease-out) 0.25s forwards" }}
          />
        )}
        {/* inner tick ring, like a lens bezel */}
        {Array.from({ length: 60 }, (_, i) => {
          const a = (i / 60) * Math.PI * 2;
          const r1 = 50;
          const r2 = i % 5 ? 52 : 54;
          return <line key={i} x1={80 + Math.cos(a) * r1} y1={80 + Math.sin(a) * r1} x2={80 + Math.cos(a) * r2} y2={80 + Math.sin(a) * r2} stroke="var(--steel)" strokeWidth="1" />;
        })}
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <CountUp value={pct} format={(n) => `${Math.round(n)}%`} className="block text-3xl font-semibold text-frost" />
          <span className="eyebrow !text-[9px]">of bill flagged</span>
        </div>
      </div>
      <span className="sr-only">
        {money(confirmed, currency)} confirmed and {money(suspected, currency)} suspected of {money(billed, currency)} billed
      </span>
    </div>
  );
}

/** The whole bill as a strip of light: each segment is one line, width = its share of the bill. */
export function SpectralLedger({ result, findings, focusId, onFocus }: { result: AuditResult; findings: Finding[]; focusId: string | null; onFocus: (id: string | null) => void }) {
  const [hover, setHover] = useState<string | null>(null);
  const items = result.bill.lineItems.filter((li) => li.amount > 0);
  const total = items.reduce((s, li) => s + li.amount, 0) || 1;
  const rank: Record<Certainty, number> = { confirmed: 0, suspected: 1, needs_info: 2 };
  const worst = (id: string) =>
    findings
      .filter((f) => f.lineItemIds.includes(id))
      .sort((a, b) => rank[a.certainty] - rank[b.certainty])[0];
  const focused = findings.find((f) => f.id === focusId);
  const hovered = items.find((li) => li.id === hover);
  const mids = items.map((li, i) => (items.slice(0, i).reduce((s, x) => s + x.amount, 0) + li.amount / 2) / total);
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <span className="eyebrow">Spectral ledger</span>
        <span className="truncate font-mono text-[11px] text-mist">
          {hovered ? `${hovered.id} · ${hovered.description} · ${money(hovered.amount, result.bill.currency)}` : "each band is one line, sized by cost"}
        </span>
      </div>
      <div className="flex h-9 gap-[2px] overflow-hidden rounded-lg" onPointerLeave={() => { setHover(null); onFocus(null); }}>
        {items.map((li, i) => {
          const f = worst(li.id);
          const share = li.amount / total;
          const mid = mids[i] * 100;
          const isFocus = focused?.lineItemIds.includes(li.id);
          const dim = (focused && !isFocus) || (hover && hover !== li.id);
          return (
            <button
              key={li.id}
              type="button"
              aria-label={`${li.description}: ${money(li.amount, result.bill.currency)}${f ? `, flagged: ${f.title}` : ""}`}
              onPointerEnter={() => { setHover(li.id); onFocus(f?.id ?? null); }}
              onFocus={() => setHover(li.id)}
              onClick={() => f && document.getElementById(`finding-${f.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}
              className="animate-grow-x relative h-full min-w-[3px] transition-[opacity,filter] duration-300"
              style={{
                flexGrow: share,
                flexBasis: 0,
                animationDelay: `${i * 40}ms`,
                opacity: dim ? 0.35 : 1,
                background: f
                  ? f.certainty === "needs_info"
                    ? "repeating-linear-gradient(135deg, rgb(164 176 199 / .5) 0 4px, rgb(164 176 199 / .18) 4px 8px)"
                    : TONE[f.certainty]
                  : `linear-gradient(180deg, color-mix(in oklab, ${mid < 50 ? "var(--glacier)" : "var(--uv)"} ${Math.abs(50 - mid) * 2}%, var(--cobalt)), color-mix(in oklab, var(--cobalt) 60%, var(--ink)))`,
                boxShadow: f && f.certainty !== "needs_info" ? `0 0 18px -2px ${TONE[f.certainty]}` : undefined,
                filter: f ? undefined : "saturate(0.7) brightness(0.8)",
              }}
            />
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-mist">
        <Legend c="var(--coral)" l="Confirmed error" />
        <Legend c="var(--warn)" l="Suspected" />
        <Legend c="repeating-linear-gradient(135deg, rgb(164 176 199 / .6) 0 2px, transparent 2px 4px)" l="Needs info" />
        <Legend c="linear-gradient(90deg, var(--glacier), var(--cobalt), var(--uv))" l="No issue found" />
      </div>
    </div>
  );
}

function Legend({ c, l }: { c: string; l: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2 w-3 rounded-sm" style={{ background: c }} />
      {l}
    </span>
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
  return (
    <div className="prism-border reveal relative overflow-hidden rounded-2xl p-6 shadow-[0_30px_80px_-40px_rgba(71,123,255,0.7)]">
      <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-uv/10 blur-3xl" />
      <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
        <RefractionRing billed={result.totalBilled} confirmed={result.confirmedTotal} suspected={result.suspectedTotal} currency={currency} />
        <div className="min-w-0 flex-1">
          <p className="eyebrow">Flagged for review</p>
          <CountUp value={result.totalDisputable} format={fmt} ms={1400} className="prism-text block text-[44px] font-semibold leading-[1.05] tracking-tight" />
          <p className="mt-1 text-sm text-mist">
            of <span className="text-frost">{fmt(result.totalBilled)}</span> billed
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat dot="bg-coral" label="Confirmed" value={<CountUp value={result.confirmedTotal} format={fmt} />} hint="Provable from the bill" />
            <Stat dot="bg-warn" label="Suspected" value={<CountUp value={result.suspectedTotal} format={fmt} />} hint="Provider must justify" />
            <Stat dot="bg-mist" label="Needs info" value={`${needs} item${needs === 1 ? "" : "s"}`} hint="We ask, not claim" />
            <Stat dot="bg-glacier" label="Audit time" value={`${Math.round(result.durationMs / 1000)}s`} hint={`vs ~${manualHours}h by hand`} />
          </div>
        </div>
      </div>
      <p className="mt-5 max-w-3xl text-[15px] leading-relaxed text-frost/90">{result.summary}</p>
      <div className="mt-5">
        <SpectralLedger result={result} findings={findings} focusId={focusId} onFocus={onFocus} />
      </div>
    </div>
  );
}

function Stat({ label, value, hint, dot }: { label: string; value: React.ReactNode; hint: string; dot: string }) {
  return (
    <div className="rounded-lg border border-steel/80 bg-ink/40 px-3 py-2">
      <p className="flex items-center gap-1.5 text-[10.5px] uppercase tracking-wider text-mist">
        <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
        {label}
      </p>
      <p className="mt-0.5 font-semibold text-frost">{value}</p>
      <p className="text-[10.5px] text-mist/70">{hint}</p>
    </div>
  );
}
