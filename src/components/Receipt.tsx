"use client";

import { useRef } from "react";
import type { Certainty, Finding, ParsedBill } from "@/lib/types";
import { money } from "./Results";

const RANK: Record<Certainty, number> = { confirmed: 0, suspected: 1, needs_info: 2 };
// Highlighter inks tuned for paper (not the dark UI).
const INK: Record<Certainty, { mark: string; pin: string; text: string }> = {
  confirmed: { mark: "rgba(255,113,141,0.38)", pin: "bg-coral text-ink", text: "text-[#b3123a]" },
  suspected: { mark: "rgba(255,198,109,0.62)", pin: "bg-warn text-ink", text: "text-[#8a5300]" },
  needs_info: { mark: "rgba(71,123,255,0.22)", pin: "bg-cobalt text-white", text: "text-[#2346b8]" },
};

export default function Receipt({
  bill,
  raw,
  image,
  findings,
  scanning,
  audited,
  focusId,
  onFocus,
}: {
  bill: ParsedBill | null;
  raw: string;
  image: string | null;
  findings: Finding[]; // in display order: pin numbers match the finding cards
  scanning: boolean;
  audited: boolean;
  focusId: string | null;
  onFocus: (id: string | null) => void;
}) {
  const tilt = useRef<HTMLDivElement>(null);

  const onMove = (e: React.PointerEvent) => {
    const el = tilt.current;
    if (!el || e.pointerType !== "mouse" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    el.style.transform = `perspective(1400px) rotateX(${(-y * 4).toFixed(2)}deg) rotateY(${(x * 5).toFixed(2)}deg)`;
  };
  const onLeave = () => {
    if (tilt.current) tilt.current.style.transform = "";
    onFocus(null);
  };

  // Which findings touch each line, and the worst certainty among them.
  const byLine = new Map<string, { idx: number; f: Finding }[]>();
  findings.forEach((f, idx) => f.lineItemIds.forEach((id) => byLine.set(id, [...(byLine.get(id) || []), { idx, f }])));
  const focused = findings.find((f) => f.id === focusId);
  const cur = bill?.currency || "USD";
  const sum = bill ? bill.lineItems.reduce((s, li) => s + li.amount, 0) : 0;
  const issues = findings.length;
  const flagged = findings.reduce((s, f) => s + (f.certainty === "needs_info" ? 0 : f.estimatedOvercharge), 0);

  return (
    <div className="relative" onPointerMove={onMove} onPointerLeave={onLeave}>
      <div className="mb-2 flex items-center justify-between">
        <span className="eyebrow">{bill ? "Live receipt · what Quibillix read" : image ? "Reading your image" : "Reading your bill"}</span>
        {bill && <span className="font-mono text-[10px] text-mist/70">{bill.lineItems.length} lines</span>}
      </div>
      <div ref={tilt} className="transition-transform duration-300 ease-[var(--ease-out)] [transform-style:preserve-3d]">
        <div className="paper torn-bottom relative overflow-hidden rounded-t-md">
          {scanning && <div className="scan-beam z-20" />}

          {!bill && image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt="Your bill" className="block max-h-[560px] w-full object-contain opacity-90 mix-blend-multiply" />
          )}

          {!bill && !image && (
            <pre className="max-h-[560px] overflow-hidden whitespace-pre-wrap break-words px-4 py-5 font-mono text-[10.5px] leading-[17px] text-paper-ink/80">
              {raw.split("\n").slice(0, 46).join("\n")}
            </pre>
          )}

          {bill && (
            <div className="px-4 pb-4 pt-5 font-mono text-[11px] leading-[17px]">
              <div className="border-b border-dashed border-paper-ink/25 pb-3 text-center">
                <p className="text-[12px] font-bold uppercase tracking-wide">{bill.provider || "Provider"}</p>
                <p className="text-paper-ink/60">{[bill.location, bill.statementDate].filter(Boolean).join(" · ")}</p>
                {bill.payer && <p className="text-paper-ink/60">Payer: {bill.payer}</p>}
              </div>
              <ul className="py-2">
                {bill.lineItems.map((li, i) => {
                  const hits = byLine.get(li.id) || [];
                  const worst = hits.length ? hits.map((h) => h.f.certainty).sort((a, b) => RANK[a] - RANK[b])[0] : null;
                  const isFocus = focused?.lineItemIds.includes(li.id);
                  const dim = focused && !isFocus;
                  return (
                    <li
                      key={li.id}
                      onPointerEnter={() => hits.length && onFocus(hits[0].f.id)}
                      onClick={() => hits.length && document.getElementById(`finding-${hits[0].f.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}
                      className={`reveal relative -mx-2 flex items-start gap-2 rounded px-2 py-[3px] transition-opacity duration-300 ${hits.length ? "cursor-pointer" : ""} ${dim ? "opacity-35" : ""}`}
                      style={{ ["--i" as string]: Math.min(i, 24) }}
                    >
                      {hits.length ? (
                        <span className="flex w-5 shrink-0 flex-col items-start gap-0.5 pt-px">
                          {hits.slice(0, 2).map((h) => (
                            <span
                              key={h.f.id}
                              className={`grid h-[15px] w-[15px] place-items-center rounded-full text-[8.5px] font-bold shadow transition-transform ${INK[h.f.certainty].pin} ${isFocus ? "scale-125" : ""}`}
                            >
                              {h.idx + 1}
                            </span>
                          ))}
                        </span>
                      ) : (
                        <span className="w-5 shrink-0 text-paper-ink/40">{li.id}</span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span
                          className={worst ? `marker box-decoration-clone px-0.5 ${isFocus ? "font-semibold" : ""}` : ""}
                          style={worst ? { backgroundImage: `linear-gradient(${INK[worst].mark}, ${INK[worst].mark})`, ["--i" as string]: i } : undefined}
                        >
                          {li.code && <span className="text-paper-ink/50">{li.code} </span>}
                          {li.description}
                          {li.quantity !== 1 && <span className="text-paper-ink/50"> ×{li.quantity}</span>}
                        </span>
                      </span>
                      <span className={`shrink-0 tabular-nums ${worst ? `font-semibold ${INK[worst].text}` : ""}`}>{money(li.amount, cur)}</span>
                    </li>
                  );
                })}
              </ul>
              <div className="space-y-0.5 border-t border-dashed border-paper-ink/25 pt-2">
                <Row label="Sum of lines" value={money(sum, cur)} />
                {bill.statedTotalDue != null && <Row label="Amount due (stated)" value={money(bill.statedTotalDue, cur)} bold />}
              </div>

              {audited && (
                <div className="mt-5 flex justify-center pb-2">
                  <div
                    className={`stamp rounded-md border-2 px-3 py-1.5 text-center font-mono uppercase ${issues ? "border-[#7c3aed] text-[#7c3aed]" : "border-[#0f8a4c] text-[#0f8a4c]"}`}
                    style={{ transform: "rotate(-8deg)" }}
                  >
                    <p className="text-[10px] font-bold tracking-[0.25em]">Audited · Quibillix</p>
                    <p className="text-[12px] font-bold">
                      {issues ? `${issues} issue${issues > 1 ? "s" : ""} · ${money(flagged, cur)}` : "No billing errors found"}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      {bill && findings.length > 0 && <p className="mt-3 text-center text-[11px] text-mist/70">Hover a highlighted line to find its issue. Click to jump.</p>}
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "font-bold" : "text-paper-ink/70"}`}>
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
