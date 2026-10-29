"use client";

import { useEffect, useState } from "react";
import type { StepId } from "@/lib/types";
import Icon, { type IconName } from "./fx/Icon";

export interface StepState {
  status: "pending" | "running" | "done" | "skipped" | "error";
  model?: string;
  detail?: string;
  ms?: number;
}

export const STEPS: { id: StepId; label: string; what: string; icon: IconName }[] = [
  { id: "extract", label: "Read the bill", what: "Parse every line item into structured data", icon: "doc" },
  { id: "rules", label: "Hard checks", what: "Math, duplicates, totals and junk fees", icon: "check" },
  { id: "triage", label: "Plan research", what: "Pick the charges most likely to be wrong", icon: "spark" },
  { id: "research", label: "Live research", what: "Fair prices and consumer law from the web", icon: "search" },
  { id: "audit", label: "Deep audit", what: "Upcoding, unbundling, price outliers, balance billing", icon: "shield" },
  { id: "letter", label: "Write dispute", what: "Dispute letter and phone script", icon: "pdf" },
];

const shortModel = (m?: string) => (m ? m.replace(/^.*\//, "").replace(/^nvidia-/i, "").slice(0, 34) : "");

/** Horizontal "spectrometer": the rail fills with prism light as each agent finishes. */
export default function Pipeline({ steps, running }: { steps: Record<StepId, StepState>; running?: boolean }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!running) return;
    const t0 = performance.now();
    const id = setInterval(() => setElapsed((performance.now() - t0) / 1000), 100);
    return () => clearInterval(id);
  }, [running]);

  const done = STEPS.filter((s) => ["done", "skipped"].includes(steps[s.id].status)).length;
  const activeIdx = STEPS.findIndex((s) => steps[s.id].status === "running");
  const active = activeIdx >= 0 ? STEPS[activeIdx] : null;
  const progress = Math.min(1, (done + (active ? 0.5 : 0)) / STEPS.length);
  const totalMs = STEPS.reduce((s, x) => s + (steps[x.id].ms || 0), 0);
  const failed = STEPS.find((s) => steps[s.id].status === "error");

  return (
    <div className="spot panel overflow-hidden p-5">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={`h-1.5 w-1.5 rounded-full ${running ? "bg-cobalt animate-pulse-ring" : failed ? "bg-coral" : "bg-mint"}`} />
          <span className="eyebrow">Agent spectrometer</span>
        </div>
        <span className="font-mono text-xs tabular-nums text-mist">
          {running ? `${elapsed.toFixed(1)}s` : totalMs ? `${(totalMs / 1000).toFixed(1)}s total` : ""}
          <span className="ml-2 text-mist/50">
            {done}/{STEPS.length}
          </span>
        </span>
      </div>

      <ol className="relative grid grid-cols-3 gap-y-6 md:grid-cols-6">
        {/* rail (desktop) */}
        <div aria-hidden className="pointer-events-none absolute left-[8.33%] right-[8.33%] top-[15px] hidden h-px bg-steel md:block">
          <div className="relative h-full transition-[width] duration-700 ease-[var(--ease-out)]" style={{ width: `${progress * 100}%` }}>
            <div className="prism-bar h-full shadow-[0_0_12px_rgba(71,123,255,0.8)]" />
            {running && <span className="animate-comet absolute top-1/2 h-[3px] w-10 -translate-x-full -translate-y-1/2 rounded-full bg-gradient-to-r from-transparent to-white/90" />}
          </div>
        </div>
        {STEPS.map((s, i) => {
          const st = steps[s.id];
          const ring =
            st.status === "running"
              ? "border-cobalt bg-cobalt/15 text-cobalt animate-pulse-ring"
              : st.status === "done"
                ? "border-mint/60 bg-mint/10 text-mint"
                : st.status === "error"
                  ? "border-coral bg-coral/10 text-coral"
                  : st.status === "skipped"
                    ? "border-dashed border-steel bg-ink text-mist/50"
                    : "border-steel bg-ink text-mist/50";
          return (
            <li key={s.id} className="relative flex flex-col items-center px-1 text-center" title={s.what}>
              <span className={`relative z-10 grid h-8 w-8 place-items-center rounded-full border transition-all duration-500 ${ring}`}>
                <Icon name={st.status === "done" ? "check" : st.status === "error" ? "x" : s.icon} size={14} />
              </span>
              <span className={`mt-2 text-[13px] font-medium leading-tight ${st.status === "pending" ? "text-mist/60" : st.status === "running" ? "text-cobalt" : "text-frost"}`}>
                {s.label}
              </span>
              <span className="mt-0.5 font-mono text-[10px] tabular-nums text-mist/60">
                {st.ms != null ? `${(st.ms / 1000).toFixed(1)}s` : st.status === "running" ? "working" : st.status === "skipped" ? "skipped" : `0${i + 1}`}
              </span>
              {st.model && (
                <span className="mt-1 max-w-full truncate rounded border border-uv/25 bg-uv/10 px-1.5 py-0.5 font-mono text-[9.5px] text-uv" title={st.model}>
                  {shortModel(st.model)}
                </span>
              )}
            </li>
          );
        })}
      </ol>

      <div className="mt-5 min-h-[20px] border-t border-steel/70 pt-3 font-mono text-[11.5px] text-mist">
        {failed ? (
          <span className="text-coral">
            {failed.label} failed{steps[failed.id].detail ? `: ${steps[failed.id].detail}` : ""}
          </span>
        ) : active ? (
          <span className="caret">
            <span className="text-cobalt">{active.label}</span> · {steps[active.id].detail || active.what}
          </span>
        ) : running ? (
          <span className="caret">Connecting to Nemotron…</span>
        ) : (
          <span>
            {STEPS.map((s) => steps[s.id].detail)
              .filter(Boolean)
              .slice(-1)[0] || "Pipeline complete. Every step is logged in the case audit trail."}
          </span>
        )}
      </div>
    </div>
  );
}
