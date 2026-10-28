import AuditApp from "@/components/AuditApp";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <header className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-600 text-lg font-bold text-white">Q</span>
            <h1 className="text-2xl font-bold tracking-tight">Quibillix</h1>
            <span className="hidden text-sm text-slate-500 sm:inline">AI-Powered Bill Verification &amp; Dispute Agent</span>
          </div>
          <p className="mt-1 text-sm font-medium text-emerald-700">Every charge questioned. Every dispute supported.</p>
          <p className="mt-2 max-w-2xl text-slate-600">
            Upload a medical, hospital, telecom or utility bill. A team of NVIDIA Nemotron agents reads every line, checks
            it against live fair-price benchmarks and consumer law, and writes the dispute letter for you.
          </p>
        </div>
        <p className="text-xs text-slate-500">
          Runs on Nebius Token Factory · Nemotron Nano / Super / Ultra / Super VL · Tavily
        </p>
      </header>
      <AuditApp />
      <footer className="mt-16 border-t pt-6 text-xs text-slate-500">
        Quibillix isn&apos;t legal or medical advice. Always verify findings with your provider or insurer. Quibillix itself
        never stores your bill — it is processed in memory and sent only to the model API (Nebius Token Factory) and, for
        research, search queries (not your bill) go to Tavily. Remove names and account numbers if you prefer.
      </footer>
    </main>
  );
}
