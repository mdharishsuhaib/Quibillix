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

/**
 * The audit as a single rail. It fills in the brand spectrum as each agent finishes:
 * the only place the prism colours run across the working screen, because here they
 * mean "light has passed through this step".
 */
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
    <div className="panel p-5 sm:p-6">
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-semibold text-frost">Audit progress</h3>
        <p className="num text-sm text-mist">
          {running ? `${elapsed.toFixed(1)} s elapsed` : totalMs ? `Finished in ${(totalMs / 1000).toFixed(1)} s` : ""} · {done} of {STEPS.length} steps
        </p>
      </div>

      <ol className="relative grid grid-cols-3 gap-y-7 md:grid-cols-6">
        <div aria-hidden data-ui className="pointer-events-none absolute left-[8.33%] right-[8.33%] top-[15px] hidden h-[2px] rounded-full bg-steel md:block">
          <div data-ui className="relative h-full overflow-hidden rounded-full transition-[width] duration-700 ease-[var(--ease-out)]" style={{ width: `${progress * 100}%`, background: "var(--prism)" }}>
            {running && <span className="animate-comet absolute inset-y-0 left-0 w-1/4 bg-white/70" />}
          </div>
        </div>
        {STEPS.map((s) => {
          const st = steps[s.id];
          const node =
            st.status === "running"
              ? "border-cobalt bg-ink text-cobalt"
              : st.status === "done"
                ? "border-mint bg-mint text-on-accent"
                : st.status === "error"
                  ? "border-coral bg-coral text-on-accent"
                  : "border-steel bg-ink text-dim";
          return (
            <li key={s.id} className="relative flex flex-col items-center px-1 text-center" title={s.what}>
              <span className={`relative z-10 grid h-8 w-8 place-items-center rounded-full border-2 transition-colors duration-300 ${node}`}>
                <Icon name={st.status === "done" ? "check" : st.status === "error" ? "x" : s.icon} size={14} className={st.status === "running" ? "animate-breathe" : ""} />
              </span>
              <span className={`mt-2.5 text-sm font-medium leading-tight ${st.status === "pending" ? "text-dim" : st.status === "running" ? "text-cobalt" : "text-frost"}`}>
                {s.label}
              </span>
              <span className="num mt-0.5 text-xs text-mist">
                {st.ms != null ? `${(st.ms / 1000).toFixed(1)} s` : st.status === "running" ? "Working" : st.status === "skipped" ? "Skipped" : "Waiting"}
              </span>
              {st.model && (
                <span data-ui className="mt-1.5 max-w-full truncate rounded-[var(--r-chip)] bg-uv/12 px-1.5 py-0.5 font-mono text-[11px] text-uv" title={st.model}> {/* taste-skill-ignore: model ID */}
                  {shortModel(st.model)}
                </span>
              )}
            </li>
          );
        })}
      </ol>

      <p className="mt-6 min-h-[22px] text-sm text-mist" aria-live="polite">
        {failed ? (
          <span className="text-coral">
            {failed.label} failed{steps[failed.id].detail ? `: ${steps[failed.id].detail}` : ""}
          </span>
        ) : active ? (
          <span className="caret">
            <span className="font-medium text-frost">{active.label}.</span> {steps[active.id].detail || active.what}
          </span>
        ) : running ? (
          <span className="caret">Connecting to Nemotron</span>
        ) : (
          (STEPS.map((s) => steps[s.id].detail).filter(Boolean).slice(-1)[0] ?? "Every step is logged in the case's audit trail.")
        )}
      </p>
    </div>
  );
}
