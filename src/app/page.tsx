import AuditApp from "@/components/AuditApp";
import BillJourney3D from "@/components/fx/BillJourney3D";
import ShortcutKeys from "@/components/fx/ShortcutKeys";
import ThemeToggle from "@/components/ThemeToggle";

// Real figures from eval/results.json (21 labelled bills). Nothing here is invented.
const PROOF = [
  { k: "24 of 25", v: "planted billing errors caught" },
  { k: "93%", v: "precision on labelled lines" },
  { k: "5 of 5", v: "clean bills left alone" },
  { k: "42 s", v: "average per bill, vs about 45 min by hand" },
];

export default function Home() {
  return (
    <main id="top" className="mx-auto flex min-h-dvh w-full max-w-7xl flex-col px-5 py-5 sm:px-8">
      <header className="no-print mb-8 flex items-center justify-between gap-4">
        <a href="#top" className="flex items-center gap-3" aria-label="Quibillix home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo-icon.png?v=2" alt="" width={36} height={36} className="h-9 w-9" />
          <span className="text-[17px] font-semibold leading-none text-frost">Quibillix</span>
        </a>
        <ThemeToggle />
      </header>

      {/* The page's one idea, acted out: a bill goes in, gets checked line by line, and money comes back. */}
      <section className="no-print mb-16 overflow-hidden rounded-[var(--r-card)] bg-carbon">
        <div className="grid items-center lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <div className="p-7 sm:p-10 lg:py-14">
            <h1 className="reveal text-balance text-[34px] font-semibold leading-[1.04] tracking-[-0.03em] text-frost sm:text-[56px]">
              Every line checked. Every error disputed.
            </h1>
            <p className="reveal mt-6 max-w-[34rem] text-[17px] leading-relaxed text-frost/90" style={{ ["--i" as string]: 1 }}>
              Quibillix checks every line of a medical, hospital, telecom or utility bill, proves the math errors, prices the rest against live
              benchmarks and drafts the dispute letter. Nothing is sent until you approve it.
            </p>
            <div className="reveal mt-8 flex flex-wrap items-center gap-4" style={{ ["--i" as string]: 2 }}>
              <a href="#workspace" className="btn-primary inline-flex items-center gap-2 px-5 py-3 text-[15px]">
                Check my bill
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
                  <path d="M12 5v14m0 0-5-5m5 5 5-5" />
                </svg>
              </a>
              <span className="text-sm text-mist">Free, no account, nothing stored</span>
            </div>
            <p className="reveal mt-4 text-sm text-mist" style={{ ["--i" as string]: 2 }}>
              or press <ShortcutKeys /> to jump to the bill box
            </p>
          </div>
          <div className="h-[400px] sm:h-[470px] lg:h-[540px]">
            <BillJourney3D />
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-px bg-ink/60 sm:grid-cols-4">
          {PROOF.map((p, i) => (
            <div key={p.k} className="reveal bg-carbon px-7 py-5 sm:px-10" style={{ ["--i" as string]: i + 3 }}>
              <dd className="num text-[26px] font-semibold leading-tight text-frost">{p.k}</dd>
              <dt className="mt-1 text-sm text-mist">{p.v}</dt>
            </div>
          ))}
        </dl>
      </section>

      <AuditApp />

      <footer className="mt-auto pb-8 pt-24 text-center text-sm text-mist">
        <p>Quibillix © 2026</p>
      </footer>
    </main>
  );
}
