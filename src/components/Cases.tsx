"use client";

import { useState } from "react";
import { deleteCase, now, upsertCase, type CaseStatus, type DisputeCase } from "@/lib/cases";
import { money } from "./Results";
import CountUp from "./fx/CountUp";
import Icon from "./fx/Icon";

const STATUS: { id: CaseStatus; label: string; short: string }[] = [
  { id: "draft", label: "Draft", short: "Draft" },
  { id: "sent", label: "Sent to provider", short: "Sent" },
  { id: "responded", label: "Provider responded", short: "Responded" },
  { id: "resolved", label: "Resolved", short: "Resolved" },
];

// draft → sent (investigation) → responded (dispute in play) → resolved (success)
const STATUS_TONE: Record<CaseStatus, string> = {
  draft: "bg-mist/10 text-mist ring-mist/30",
  sent: "bg-cobalt/10 text-cobalt ring-cobalt/40",
  responded: "bg-uv/10 text-uv ring-uv/40",
  resolved: "bg-mint/10 text-mint ring-mint/40",
};

/** Assumed manual effort to audit one bill line-by-line & research it (minutes) — shown as an estimate. */
const MANUAL_MIN_PER_LINE = 4;
const MANUAL_MIN_LETTER = 30;

export function manualMinutes(lines: number) {
  return lines * MANUAL_MIN_PER_LINE + MANUAL_MIN_LETTER;
}

export function ValueStrip({ cases }: { cases: DisputeCase[] }) {
  if (!cases.length) return null;
  // Group money by currency so we never add ₹ to $.
  const byCur = new Map<string, { flagged: number; confirmed: number; approved: number; recovered: number }>();
  let saved = 0;
  for (const c of cases) {
    const v = byCur.get(c.currency) || { flagged: 0, confirmed: 0, approved: 0, recovered: 0 };
    v.flagged += c.confirmedTotal + c.suspectedTotal;
    v.confirmed += c.confirmedTotal;
    v.approved += c.approvedTotal;
    v.recovered += c.recovered;
    byCur.set(c.currency, v);
    saved += Math.max(0, manualMinutes(c.result.bill.lineItems.length) - c.durationMs / 60000);
  }
  const single = byCur.size === 1 ? [...byCur.entries()][0] : null;
  const fmt = (k: "flagged" | "confirmed" | "approved" | "recovered", tone: string) =>
    single ? (
      <CountUp value={single[1][k]} format={(n) => money(n, single[0])} className={tone} />
    ) : (
      <span className={tone}>{[...byCur.entries()].map(([cur, v]) => money(v[k], cur)).join(" + ")}</span>
    );
  const tiles = [
    { dot: "bg-warn", label: "Flagged for review", value: fmt("flagged", "text-warn"), sub: "confirmed + suspected" },
    { dot: "bg-coral", label: "Confirmed errors", value: fmt("confirmed", "text-coral"), sub: "provable from the bill" },
    { dot: "bg-uv", label: "Approved & disputed", value: fmt("approved", "text-uv"), sub: "after your review" },
    { dot: "bg-mint", label: "Actually recovered", value: fmt("recovered", "text-mint"), sub: "credits/refunds you logged" },
    { dot: "bg-glacier", label: "Review time saved", value: <CountUp value={saved / 60} format={(n) => `~${n.toFixed(1)} h`} className="text-glacier" />, sub: `est. vs ${MANUAL_MIN_PER_LINE} min/line manual` },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      {tiles.map((t, i) => (
        <div key={t.label} className="spot reveal panel p-3.5" style={{ ["--i" as string]: i }}>
          <p className="flex items-center gap-1.5 text-[10.5px] uppercase tracking-wider text-mist">
            <span className={`h-1.5 w-1.5 rounded-full ${t.dot}`} />
            {t.label}
          </p>
          <p className="mt-1.5 text-lg font-semibold">{t.value}</p>
          <p className="text-[11px] text-mist/70">{t.sub}</p>
        </div>
      ))}
    </div>
  );
}

/** Four-stop lifecycle track; each stop is a button that moves the case there. */
function Lifecycle({ status, onSet }: { status: CaseStatus; onSet: (s: CaseStatus) => void }) {
  const at = STATUS.findIndex((s) => s.id === status);
  return (
    <div className="relative">
      <div aria-hidden className="absolute left-[12.5%] right-[12.5%] top-[11px] h-px bg-steel">
        <div className="prism-bar h-full transition-[width] duration-700 ease-[var(--ease-out)]" style={{ width: `${(at / (STATUS.length - 1)) * 100}%` }} />
      </div>
      <ol className="relative grid grid-cols-4" role="radiogroup" aria-label="Dispute status">
        {STATUS.map((s, i) => {
          const reached = i <= at;
          const current = i === at;
          return (
            <li key={s.id} className="flex flex-col items-center">
              <button
                type="button"
                role="radio"
                aria-checked={current}
                onClick={() => !current && onSet(s.id)}
                className={`grid h-6 w-6 place-items-center rounded-full border transition-all duration-300 ${
                  current
                    ? s.id === "resolved"
                      ? "border-mint bg-mint text-ink shadow-[0_0_14px_var(--mint)]"
                      : "border-glacier bg-glacier/20 text-glacier shadow-[0_0_12px_rgba(32,227,206,0.6)]"
                    : reached
                      ? "border-glacier/50 bg-ink text-glacier"
                      : "border-steel bg-ink text-mist/40 hover:border-mist/60"
                }`}
                title={`Mark as: ${s.label}`}
              >
                {reached && !current ? <Icon name="check" size={11} /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
              </button>
              <span className={`mt-1.5 text-[11px] ${current ? "font-medium text-frost" : "text-mist/70"}`}>{s.short}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export default function Cases({ cases, onChange, onOpen }: { cases: DisputeCase[]; onChange: () => void; onOpen: (c: DisputeCase) => void }) {
  const [openId, setOpenId] = useState<string | null>(null);

  const update = (c: DisputeCase, patch: Partial<DisputeCase>, action: string, detail?: string) => {
    upsertCase({ ...c, ...patch, trail: [...c.trail, { at: now(), actor: "user", action, detail }] });
    onChange();
  };

  if (!cases.length)
    return (
      <div className="spot panel grid place-items-center px-6 py-16 text-center">
        <div className="animate-float mb-4 grid h-14 w-14 place-items-center rounded-2xl border border-steel bg-ink text-glacier">
          <Icon name="folder" size={24} />
        </div>
        <p className="display text-2xl text-frost">No disputes yet</p>
        <p className="mt-1 max-w-sm text-sm text-mist">Run an audit, review the findings and press “Approve &amp; track dispute”. Cases stay in this browser only.</p>
      </div>
    );

  return (
    <div className="space-y-4">
      <ValueStrip cases={cases} />
      {cases.map((c, i) => {
        const open = openId === c.id;
        const pct = c.approvedTotal > 0 ? Math.min(1, c.recovered / c.approvedTotal) : 0;
        return (
          <div key={c.id} className="spot reveal panel overflow-hidden" style={{ ["--i" as string]: i + 3 }}>
            <button onClick={() => setOpenId(open ? null : c.id)} aria-expanded={open} className="flex w-full flex-wrap items-center gap-3 p-4 text-left">
              <span className="font-mono text-xs text-mist/70">{c.id}</span>
              <span className="font-medium text-frost">{c.provider}</span>
              <span className={`rounded px-2 py-0.5 text-xs ring-1 ${STATUS_TONE[c.status]}`}>{STATUS.find((s) => s.id === c.status)?.label}</span>
              <span className="ml-auto text-sm tabular-nums text-mist">
                disputing <b className="text-uv">{money(c.approvedTotal, c.currency)}</b>
                {c.recovered > 0 && <span className="text-mint"> · recovered {money(c.recovered, c.currency)}</span>}
              </span>
              <Icon name="arrow" size={14} className={`text-mist transition-transform duration-300 ${open ? "-rotate-90" : "rotate-90"}`} />
            </button>
            {/* recovery meter */}
            <div className="mx-4 mb-3 h-1 overflow-hidden rounded-full bg-steel/70" title={`${Math.round(pct * 100)}% recovered`}>
              <div className="h-full rounded-full bg-mint shadow-[0_0_10px_var(--mint)] transition-[width] duration-700" style={{ width: `${pct * 100}%` }} />
            </div>
            <div className={`grid transition-[grid-template-rows] duration-500 ease-[var(--ease-out)] ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
              <div className="overflow-hidden">
                <div className="grid gap-6 border-t border-steel p-4 md:grid-cols-2">
                  <div className="space-y-5 text-sm">
                    <Lifecycle status={c.status} onSet={(s) => update(c, { status: s }, "Changed status", STATUS.find((x) => x.id === s)?.label)} />
                    <RecoveredInput c={c} onSave={(v) => update(c, { recovered: v }, "Logged recovered amount", money(v, c.currency))} />
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => onOpen(c)} className="btn-ghost inline-flex items-center gap-1.5 px-3 py-1.5">
                        <Icon name="doc" size={14} />
                        Open audit &amp; letter
                      </button>
                      <button
                        onClick={() => {
                          if (confirm("Delete this case from this device?")) {
                            deleteCase(c.id);
                            onChange();
                          }
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-coral/40 px-3 py-1.5 text-coral transition hover:bg-coral/10"
                      >
                        <Icon name="trash" size={14} />
                        Delete
                      </button>
                    </div>
                    <p className="text-xs text-mist/70">
                      Flagged {money(c.confirmedTotal + c.suspectedTotal, c.currency)} ({money(c.confirmedTotal, c.currency)} confirmed) ·{" "}
                      {c.approvedIds.length}/{c.findingsCount} findings approved · audited in {(c.durationMs / 1000).toFixed(0)}s
                    </p>
                  </div>
                  <div>
                    <p className="eyebrow mb-3 !text-uv">Audit trail</p>
                    <ol className="relative space-y-3 border-l border-steel pl-4 text-xs">
                      {c.trail.map((e, k) => (
                        <li key={k} className="relative">
                          <span
                            className={`absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full ring-4 ring-carbon ${e.actor === "agent" ? "bg-uv shadow-[0_0_8px_var(--uv)]" : "bg-glacier"}`}
                          />
                          <span className="text-mist/70">
                            {new Date(e.at).toLocaleString()} · {e.actor === "agent" ? "Agent" : "You"}
                          </span>
                          <br />
                          <b className="font-medium text-frost">{e.action}</b>
                          {e.detail && <span className="text-mist"> — {e.detail}</span>}
                        </li>
                      ))}
                    </ol>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RecoveredInput({ c, onSave }: { c: DisputeCase; onSave: (v: number) => void }) {
  const [v, setV] = useState(String(c.recovered || ""));
  return (
    <label className="block">
      <span className="text-xs text-mist">Amount actually credited / refunded ({c.currency})</span>
      <div className="mt-1 flex gap-2">
        <input inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} placeholder="0" className="field w-full px-3 py-1.5" />
        <button onClick={() => onSave(Math.max(0, parseFloat(v) || 0))} className="btn-primary px-4 py-1.5">
          Save
        </button>
      </div>
    </label>
  );
}
