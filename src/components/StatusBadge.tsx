"use client";

import { useEffect, useState } from "react";

interface Health {
  status: "ok" | "degraded" | "down";
  primary: string | null;
  checkedAt: string;
  checks: { name: string; ok: boolean; ms: number; detail?: string }[];
}

const TONE = {
  ok: { dot: "bg-mint shadow-[0_0_8px_var(--mint)]", text: "text-mint", label: "All systems live" },
  degraded: { dot: "bg-warn shadow-[0_0_8px_var(--warn)]", text: "text-warn", label: "Running on fallback" },
  down: { dot: "bg-coral shadow-[0_0_8px_var(--coral)]", text: "text-coral", label: "Models unavailable" },
} as const;

/** Live provider status from /api/health, refreshed every 2 minutes. */
export default function StatusBadge() {
  const [h, setH] = useState<Health | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch("/api/health")
        .then((r) => r.json())
        .then((j: Health) => alive && setH(j))
        .catch(() => alive && setH({ status: "down", primary: null, checkedAt: new Date().toISOString(), checks: [] }));
    load();
    const id = setInterval(load, 120_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  if (!h) return <span className="text-xs text-mist/70">Checking model status…</span>;
  const t = TONE[h.status];
  return (
    <div className="relative text-xs">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex items-center gap-2 rounded-full border border-steel bg-carbon/80 px-3 py-1.5 backdrop-blur transition hover:border-[#33445f]">
        <span className="relative flex h-2 w-2">
          {h.status === "ok" && <span className="absolute inset-0 animate-ping rounded-full bg-mint/60" />}
          <span className={`relative h-2 w-2 rounded-full ${t.dot}`} />
        </span>
        <span className={t.text}>{t.label}</span>
        <span className="hidden text-mist sm:inline">· Nemotron via {h.primary ?? "n/a"} + Tavily</span>
      </button>
      {open && (
        <div className="panel reveal absolute right-0 z-50 mt-2 w-80 p-3 shadow-2xl">
          <ul className="space-y-1.5">
            {h.checks.map((c) => (
              <li key={c.name} className="flex items-start gap-2">
                <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${c.ok ? "bg-mint" : "bg-coral"}`} />
                <span className="min-w-0">
                  <span className="text-frost">{c.name}</span> <span className="text-mist/70">{c.ms} ms</span>
                  {!c.ok && c.detail && <span className="block break-words text-coral/90">{c.detail}</span>}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[10px] text-mist/60">Checked {new Date(h.checkedAt).toLocaleTimeString()} · auto-failover between providers</p>
        </div>
      )}
    </div>
  );
}
