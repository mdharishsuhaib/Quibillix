import AuditApp from "@/components/AuditApp";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-icon.png" alt="Quibillix logo" width={44} height={44} className="h-11 w-11 drop-shadow-[0_0_12px_rgba(71,123,255,0.45)]" />
            <div>
              <h1 className="prism-text text-2xl font-bold tracking-tight">Quibillix</h1>
              <p className="text-[10px] font-semibold tracking-[0.2em] text-mist">BILL INTELLIGENCE · DISPUTE CONTROL</p>
            </div>
          </div>
          <h2 className="mt-5 text-3xl font-bold tracking-tight text-frost sm:text-4xl">
            Review. Verify. <span className="text-glacier">Resolve.</span>
          </h2>
          <p className="mt-1 text-sm font-medium text-mist">
            AI-Powered Bill Verification &amp; Dispute Agent · <span className="text-frost">Every charge questioned. Every dispute supported.</span>
          </p>
          <p className="mt-3 max-w-2xl text-mist">
            Upload a medical, hospital, telecom or utility bill. A team of NVIDIA Nemotron agents reads every line, checks
            it against live fair-price benchmarks and consumer law, and writes the dispute letter for you.
          </p>
        </div>
        <p className="text-xs text-mist/80">
          Runs on Nebius Token Factory · Nemotron Nano / Super / Ultra / Super VL · Tavily
        </p>
      </header>
      <AuditApp />
      <footer className="mt-16 border-t border-steel pt-6 text-xs text-mist/80">
        Quibillix isn&apos;t legal or medical advice. Always verify findings with your provider or insurer. Quibillix itself
        never stores your bill — it is processed in memory and sent only to the model API (Nebius Token Factory) and, for
        research, search queries (not your bill) go to Tavily. Remove names and account numbers if you prefer.
      </footer>
    </main>
  );
}
