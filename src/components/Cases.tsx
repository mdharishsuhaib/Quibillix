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
  draft: "bg-mist/12 text-mist",
  sent: "bg-cobalt/15 text-cobalt-soft",
  responded: "bg-uv/15 text-uv",
  resolved: "bg-mint/15 text-mint",
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
  const total = (k: "confirmed" | "recovered") => [...byCur.values()].reduce((s, v) => s + v[k], 0);
  const tiles = [
    { label: "Flagged for review", value: fmt("flagged", "text-frost"), sub: "Confirmed plus suspected" },
    // Status colour only on a real value: a zero stays in ink (Taste Skill app rule).
    { label: "Confirmed errors", value: fmt("confirmed", total("confirmed") > 0 ? "text-coral" : "text-frost"), sub: "Provable from the bill" },
    { label: "In dispute", value: fmt("approved", "text-frost"), sub: "After your review" },
    { label: "Recovered", value: fmt("recovered", total("recovered") > 0 ? "text-mint" : "text-frost"), sub: total("recovered") > 0 ? "Credits and refunds you logged" : "Log a credit when it arrives" },
    { label: "Review time saved", value: <CountUp value={saved / 60} format={(n) => `${n.toFixed(1)} h`} className="text-frost" />, sub: `Against ${MANUAL_MIN_PER_LINE} min per line by hand` },
  ];
  return (
    <dl className="panel grid grid-cols-2 overflow-hidden sm:grid-cols-5">
      {tiles.map((t, i) => (
        <div data-ui key={t.label} className={`reveal px-5 py-4 ${i ? "sm:border-l sm:border-steel" : ""} ${i % 2 ? "border-l border-steel sm:border-l" : ""} ${i > 1 ? "border-t border-steel sm:border-t-0" : ""} ${i === 4 ? "col-span-2 sm:col-span-1" : ""}`} style={{ ["--i" as string]: i }}>
          <dt className="text-sm text-mist">{t.label}</dt>
          <dd className="num mt-1 text-[22px] font-semibold leading-tight">{t.value}</dd>
          <dd className="mt-0.5 text-xs text-mist">{t.sub}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Four-stop lifecycle track; each stop is a button that moves the case there. */
function Lifecycle({ status, onSet }: { status: CaseStatus; onSet: (s: CaseStatus) => void }) {
  const at = STATUS.findIndex((s) => s.id === status);
  return (
    <div className="relative">
      <div aria-hidden className="absolute left-[12.5%] right-[12.5%] top-[11px] h-[2px] rounded-full bg-steel">
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
                className={`grid h-6 w-6 place-items-center rounded-full border-2 transition-colors duration-200 ${
                  current
                    ? s.id === "resolved"
                      ? "border-mint bg-mint text-on-accent"
                      : "border-glacier bg-glacier text-on-accent"
                    : reached
                      ? "border-glacier bg-ink text-glacier"
                      : "border-steel bg-ink text-dim hover:border-mist"
                }`}
                title={`Mark as: ${s.label}`}
              >
                {reached && !current ? <Icon name="check" size={11} /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
              </button>
              <span className={`mt-1.5 text-xs ${current ? "font-medium text-frost" : "text-mist"}`}>{s.short}</span>
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
      <div className="panel px-6 py-14 text-center">
        <p className="text-lg font-semibold text-frost">No disputes yet</p>
        <p className="mx-auto mt-1 max-w-sm text-[15px] text-mist">Check a bill, review what it found and press “Approve and track dispute”. Cases stay in this browser only.</p>
        <a href="#workspace" onClick={() => document.querySelector<HTMLButtonElement>("[data-tab=audit]")?.click()} className="btn-primary mt-5 inline-flex px-4 py-2 text-sm">
          Check a bill
        </a>
      </div>
    );

  return (
    <div className="space-y-4">
      <ValueStrip cases={cases} />
      {cases.map((c, i) => {
        const open = openId === c.id;
        const pct = c.approvedTotal > 0 ? Math.min(1, c.recovered / c.approvedTotal) : 0;
        return (
          <div key={c.id} className="reveal panel overflow-hidden" style={{ ["--i" as string]: i + 3 }}>
            <button onClick={() => setOpenId(open ? null : c.id)} aria-expanded={open} className="flex w-full flex-wrap items-center gap-3 p-5 text-left">
              <span className="font-semibold text-frost">{c.provider}</span>
              <span className={`pill ${STATUS_TONE[c.status]}`}>{STATUS.find((s) => s.id === c.status)?.label}</span>
              <span className="num ml-auto text-[15px] text-mist">
                Disputing <b className="font-semibold text-frost">{money(c.approvedTotal, c.currency)}</b>
                {c.recovered > 0 && <span className="text-mint"> · {money(c.recovered, c.currency)} back</span>}
              </span>
              <Icon name="arrow" size={14} className={`text-mist transition-transform duration-200 ${open ? "-rotate-90" : "rotate-90"}`} />
            </button>
            {/* recovered against what's in dispute, at its true ratio */}
            <div className="mx-5 mb-4 flex items-center gap-3">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-raised" role="progressbar" aria-valuenow={Math.round(pct * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Recovered">
                <div className="h-full rounded-full bg-mint transition-[width] duration-700" style={{ width: `${pct * 100}%` }} />
              </div>
              <span className="num text-xs text-mist">
                {money(c.recovered, c.currency)} of {money(c.approvedTotal, c.currency)}
              </span>
            </div>
            <div className={`grid transition-[grid-template-rows] duration-500 ease-[var(--ease-out)] ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
              <div className="overflow-hidden">
                <div data-ui className="grid gap-6 border-t border-steel p-4 md:grid-cols-2">
                  <div className="space-y-5 text-sm">
                    <Lifecycle status={c.status} onSet={(s) => update(c, { status: s }, "Changed status", STATUS.find((x) => x.id === s)?.label)} />
                    <RecoveredInput c={c} onSave={(v) => update(c, { recovered: v }, "Logged recovered amount", money(v, c.currency))} />
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => onOpen(c)} className="btn-ghost inline-flex items-center gap-1.5 px-3 py-1.5">
                        <Icon name="doc" size={14} />
                        Open audit and letter
                      </button>
                      <button
                        onClick={() => {
                          if (confirm("Delete this case from this device?")) {
                            deleteCase(c.id);
                            onChange();
                          }
                        }}
                        className="inline-flex items-center gap-1.5 rounded-[var(--r-control)] border border-coral/50 px-3 py-1.5 text-coral transition-colors hover:bg-coral/10"
                      >
                        <Icon name="trash" size={14} />
                        Delete
                      </button>
                    </div>
                    <p className="text-sm text-mist">
                      Case <span data-ui className="font-mono text-frost">{c.id}</span> · flagged {money(c.confirmedTotal + c.suspectedTotal, c.currency)}, {/* taste-skill-ignore: case ID */}
                      {money(c.confirmedTotal, c.currency)} of it confirmed · {c.approvedIds.length} of {c.findingsCount} findings approved · checked in{" "}
                      {(c.durationMs / 1000).toFixed(0)} s
                    </p>
                  </div>
                  <div>
                    <h4 className="mb-3 text-sm font-semibold text-frost">Audit trail</h4>
                    <ol data-ui className="relative space-y-3 border-l border-steel pl-4 text-sm">
                      {c.trail.map((e, k) => (
                        <li key={k} className="relative">
                          <span className={`absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full ring-4 ring-carbon ${e.actor === "agent" ? "bg-uv" : "bg-glacier"}`} />
                          <span className="text-xs text-mist">
                            {new Date(e.at).toLocaleString()} · {e.actor === "agent" ? "Agent" : "You"}
                          </span>
                          <br />
                          <b className="font-medium text-frost">{e.action}</b>
                          {e.detail && <span className="text-mist">: {e.detail}</span>}
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
      <span className="text-sm text-mist">Amount credited or refunded ({c.currency})</span>
      <div className="mt-1 flex gap-2">
        <input inputMode="decimal" value={v} onChange={(e) => setV(e.target.value)} placeholder="0" className="field w-full px-3 py-1.5" />
        <button onClick={() => onSave(Math.max(0, parseFloat(v) || 0))} className="btn-primary px-4 py-1.5">
          Save
        </button>
      </div>
    </label>
  );
}
