import AuditApp from "@/components/AuditApp";
import StatusBadge from "@/components/StatusBadge";
import PrismEngine from "@/components/fx/PrismEngine";

const PROOF = [
  { k: "96%", v: "planted errors caught", s: "24 / 25 on a 21-bill benchmark" },
  { k: "93%", v: "precision", s: "on labelled lines" },
  { k: "5 / 5", v: "clean bills stay clean", s: "zero false disputes" },
  { k: "~40s", v: "per bill", s: "vs ~45 min by hand" },
];

const FLOW = [
  { n: "01", t: "Check", d: "Nemotron reads every line. Code re-does the math." },
  { n: "02", t: "Investigate", d: "Live fair-price and law research via Tavily." },
  { n: "03", t: "Build", d: "Evidence-backed letter and phone script." },
  { n: "04", t: "Resolve", d: "You approve each item, then track the outcome." },
];

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
      <header className="no-print mb-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-icon.png" alt="Quibillix logo" width={40} height={40} className="h-10 w-10 drop-shadow-[0_0_12px_rgba(71,123,255,0.45)]" />
          <div>
            <p className="prism-text text-xl font-bold leading-none tracking-tight">Quibillix</p>
            <p className="mt-1 text-[9.5px] font-semibold tracking-[0.22em] text-mist">BILL INTELLIGENCE · DISPUTE CONTROL</p>
          </div>
        </div>
        <StatusBadge />
      </header>

      {/* ---------------- hero: the prism ---------------- */}
      <section className="no-print relative mb-10 overflow-hidden rounded-[28px] border border-steel/70 bg-[radial-gradient(120%_120%_at_70%_0%,#111a2b_0%,#080c18_60%)]">
        <div className="grid items-center lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
          <div className="relative z-10 p-7 sm:p-10">
            <p className="reveal eyebrow mb-4 inline-flex items-center gap-2 rounded-full border border-steel bg-ink/60 px-3 py-1 !text-[10px]" style={{ ["--i" as string]: 0 }}>
              <span className="h-1.5 w-1.5 rounded-full bg-glacier shadow-[0_0_8px_var(--glacier)]" />
              AI-powered bill verification &amp; dispute agent
            </p>
            <h1 className="reveal display text-[44px] leading-[1.02] text-frost sm:text-[60px]" style={{ ["--i" as string]: 1 }}>
              Every bill is white light.
              <br />
              <em className="prism-text pr-2">We split it.</em>
            </h1>
            <p className="reveal mt-5 max-w-md text-[15px] leading-relaxed text-mist" style={{ ["--i" as string]: 2 }}>
              Upload a medical, hospital, telecom or utility bill. NVIDIA Nemotron agents question every charge, check it against live fair-price
              benchmarks and consumer law, and draft the dispute. <span className="text-frost">You stay in control of what gets sent.</span>
            </p>
            <div className="reveal mt-7 flex flex-wrap items-center gap-3" style={{ ["--i" as string]: 3 }}>
              <a href="#workspace" className="btn-primary magnetic inline-flex items-center gap-2 px-5 py-3 text-[15px]">
                Audit a bill
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
                  <path d="M5 12h14m0 0-5-5m5 5-5 5" />
                </svg>
              </a>
              <span className="text-xs text-mist/80">Free · no sign-up · nothing stored</span>
            </div>
          </div>
          <div className="relative h-[300px] sm:h-[380px] lg:h-[440px]">
            <div aria-hidden className="absolute inset-0 bg-[radial-gradient(50%_60%_at_45%_45%,rgba(71,123,255,0.18),transparent_70%)]" />
            <PrismEngine />
          </div>
        </div>

        {/* proof strip */}
        <dl className="relative z-10 grid grid-cols-2 border-t border-steel/70 bg-ink/40 backdrop-blur sm:grid-cols-4">
          {PROOF.map((p, i) => (
            <div key={p.k} className={`reveal px-6 py-4 ${i ? "sm:border-l sm:border-steel/70" : ""}`} style={{ ["--i" as string]: i + 4 }}>
              <dt className="sr-only">{p.v}</dt>
              <dd>
                <span className="text-2xl font-semibold tabular-nums text-frost">{p.k}</span>
                <span className="ml-2 text-sm text-mist">{p.v}</span>
                <span className="block font-mono text-[10.5px] text-mist/60">{p.s}</span>
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {/* workflow */}
      <ol className="no-print mb-10 grid gap-3 sm:grid-cols-4">
        {FLOW.map((f, i) => (
          <li key={f.n} className="reveal spot panel relative overflow-hidden p-4" style={{ ["--i" as string]: i + 6 }}>
            <span aria-hidden className="prism-bar absolute left-0 top-0 h-[2px]" style={{ width: `${(i + 1) * 25}%` }} />
            <span className="font-mono text-[11px] text-mist/60">{f.n}</span>
            <p className="display mt-1 text-2xl text-frost">{f.t}</p>
            <p className="mt-1 text-[13px] leading-snug text-mist">{f.d}</p>
          </li>
        ))}
      </ol>

      <AuditApp />

      <footer className="mt-20 border-t border-steel pt-6 text-xs text-mist/80">
        Quibillix isn&apos;t legal or medical advice. Always verify findings with your provider or insurer. Quibillix itself never stores your bill. It
        is processed in memory and sent only to the NVIDIA Nemotron model API (Nebius Token Factory, or NVIDIA Build as a fallback). Only search
        queries, never your bill, go to Tavily. Remove names and account numbers if you prefer.
      </footer>
    </main>
  );
}
