"use client";

import type { StepId } from "@/lib/types";

export interface StepState {
  status: "pending" | "running" | "done" | "skipped" | "error";
  model?: string;
  detail?: string;
  ms?: number;
}

export const STEPS: { id: StepId; label: string; what: string }[] = [
  { id: "extract", label: "Read the bill", what: "Parse every line item into structured data" },
  { id: "rules", label: "Hard checks", what: "Math, duplicates, totals and junk fees" },
  { id: "triage", label: "Plan research", what: "Pick the charges most likely to be wrong" },
  { id: "research", label: "Live research", what: "Fair prices and consumer law from the web" },
  { id: "audit", label: "Deep audit", what: "Upcoding, unbundling, price outliers, balance billing" },
  { id: "letter", label: "Write dispute", what: "Dispute letter and phone script" },
];

const dot: Record<StepState["status"], string> = {
  pending: "bg-slate-200",
  running: "bg-amber-400 animate-pulse",
  done: "bg-emerald-500",
  skipped: "bg-slate-300",
  error: "bg-rose-500",
};

export default function Pipeline({ steps }: { steps: Record<StepId, StepState> }) {
  return (
    <ol className="space-y-3">
      {STEPS.map((s, i) => {
        const st = steps[s.id];
        return (
          <li key={s.id} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span className={`mt-1 h-3 w-3 rounded-full ${dot[st.status]}`} />
              {i < STEPS.length - 1 && <span className="mt-1 w-px flex-1 bg-slate-200" />}
            </div>
            <div className="min-w-0 flex-1 pb-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                <span className={`text-sm font-medium ${st.status === "pending" ? "text-slate-400" : ""}`}>{s.label}</span>
                {st.ms != null && <span className="text-xs text-slate-400">{(st.ms / 1000).toFixed(1)}s</span>}
              </div>
              <p className="text-xs text-slate-500">{s.what}</p>
              {st.model && (
                <span className="mt-1 inline-block rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600">
                  {st.model}
                </span>
              )}
              {st.detail && <p className="mt-1 break-words text-xs text-slate-500">{st.detail}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
