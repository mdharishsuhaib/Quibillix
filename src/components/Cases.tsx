"use client";

import { useState } from "react";
import { deleteCase, now, upsertCase, type CaseStatus, type DisputeCase } from "@/lib/cases";
import { money } from "./Results";

const STATUS: { id: CaseStatus; label: string }[] = [
  { id: "draft", label: "Draft" },
  { id: "sent", label: "Sent to provider" },
  { id: "responded", label: "Provider responded" },
  { id: "resolved", label: "Resolved" },
];

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
  const fmt = (k: "flagged" | "confirmed" | "approved" | "recovered") =>
    [...byCur.entries()].map(([cur, v]) => money(v[k], cur)).join(" + ");
  const tiles = [
    { label: "Flagged for review", value: fmt("flagged"), sub: "confirmed + suspected" },
    { label: "Confirmed errors", value: fmt("confirmed"), sub: "provable from the bill" },
    { label: "Approved & disputed", value: fmt("approved"), sub: "after your review" },
    { label: "Actually recovered", value: fmt("recovered"), sub: "credits/refunds you logged" },
    { label: "Review time saved", value: `~${(saved / 60).toFixed(1)} h`, sub: `est. vs ${MANUAL_MIN_PER_LINE} min/line manual` },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      {tiles.map((t) => (
        <div key={t.label} className="rounded-xl border border-slate-200 bg-white p-3">
          <p className="text-[11px] uppercase tracking-wide text-slate-500">{t.label}</p>
          <p className="mt-1 text-lg font-semibold tabular-nums">{t.value}</p>
          <p className="text-[11px] text-slate-400">{t.sub}</p>
        </div>
      ))}
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
    return <p className="text-sm text-slate-500">No disputes yet. Run an audit, review the findings and click “Approve & track dispute”.</p>;

  return (
    <div className="space-y-3">
      <ValueStrip cases={cases} />
      {cases.map((c) => {
        const open = openId === c.id;
        return (
          <div key={c.id} className="rounded-xl border border-slate-200 bg-white">
            <button onClick={() => setOpenId(open ? null : c.id)} className="flex w-full flex-wrap items-center gap-3 p-4 text-left">
              <span className="font-mono text-xs text-slate-400">{c.id}</span>
              <span className="font-medium">{c.provider}</span>
              <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs text-emerald-800">{STATUS.find((s) => s.id === c.status)?.label}</span>
              <span className="ml-auto text-sm tabular-nums">
                disputing <b>{money(c.approvedTotal, c.currency)}</b>
                {c.recovered > 0 && <span className="text-emerald-700"> · recovered {money(c.recovered, c.currency)}</span>}
              </span>
            </button>
            {open && (
              <div className="grid gap-4 border-t p-4 md:grid-cols-2">
                <div className="space-y-3 text-sm">
                  <label className="block">
                    <span className="text-xs text-slate-500">Status</span>
                    <select
                      value={c.status}
                      onChange={(e) => update(c, { status: e.target.value as CaseStatus }, "Changed status", STATUS.find((s) => s.id === e.target.value)?.label)}
                      className="mt-1 block w-full rounded-md border px-2 py-1.5"
                    >
                      {STATUS.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <RecoveredInput c={c} onSave={(v) => update(c, { recovered: v }, "Logged recovered amount", money(v, c.currency))} />
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => onOpen(c)} className="rounded-md border px-3 py-1.5 hover:bg-slate-50">
                      Open audit & letter
                    </button>
                    <button
                      onClick={() => {
                        if (confirm("Delete this case from this device?")) {
                          deleteCase(c.id);
                          onChange();
                        }
                      }}
                      className="rounded-md border border-rose-200 px-3 py-1.5 text-rose-700 hover:bg-rose-50"
                    >
                      Delete
                    </button>
                  </div>
                  <p className="text-xs text-slate-400">
                    Flagged {money(c.confirmedTotal + c.suspectedTotal, c.currency)} ({money(c.confirmedTotal, c.currency)} confirmed) ·{" "}
                    {c.approvedIds.length}/{c.findingsCount} findings approved · audited in {(c.durationMs / 1000).toFixed(0)}s
                  </p>
                </div>
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Audit trail</p>
                  <ol className="space-y-1.5 text-xs">
                    {c.trail.map((e, i) => (
                      <li key={i} className="flex gap-2">
                        <span className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${e.actor === "agent" ? "bg-sky-500" : "bg-emerald-500"}`} />
                        <span>
                          <span className="text-slate-400">{new Date(e.at).toLocaleString()} · {e.actor === "agent" ? "Agent" : "You"}</span>
                          <br />
                          <b className="font-medium">{e.action}</b>
                          {e.detail && <span className="text-slate-500"> — {e.detail}</span>}
                        </span>
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            )}
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
      <span className="text-xs text-slate-500">Amount actually credited / refunded ({c.currency})</span>
      <div className="mt-1 flex gap-2">
        <input
          inputMode="decimal"
          value={v}
          onChange={(e) => setV(e.target.value)}
          placeholder="0"
          className="w-full rounded-md border px-2 py-1.5"
        />
        <button onClick={() => onSave(Math.max(0, parseFloat(v) || 0))} className="rounded-md bg-emerald-600 px-3 py-1.5 text-white">
          Save
        </button>
      </div>
    </label>
  );
}
