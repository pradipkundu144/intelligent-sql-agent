import { useEffect } from "react";
import { createPortal } from "react-dom";

const STORAGE_KEY = "sql-agent-welcome-seen";

export function hasSeenWelcome(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return true;
  }
}

export function markWelcomeSeen(): void {
  try {
    localStorage.setItem(STORAGE_KEY, "true");
  } catch {
    // localStorage unavailable — silently ignore
  }
}

type Props = { onClose: () => void };

export default function WelcomeModal({ onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center overflow-y-auto bg-slate-950/85 p-6 backdrop-blur-sm animate-[fadeIn_220ms_ease-out]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-title"
    >
      <div
        className="my-8 w-full max-w-lg rounded-2xl border border-emerald-900/50 bg-slate-950 p-8 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center gap-2">
          <span className="rounded-full border border-emerald-700/60 bg-emerald-950/60 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-emerald-300">
            technical demo
          </span>
          <span className="rounded-full border border-slate-800 bg-slate-900 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-slate-500">
            read-only
          </span>
        </div>

        <h2 id="welcome-title" className="text-2xl font-semibold text-slate-100">
          Welcome to the Intelligent SQL Agent
        </h2>

        <p className="mt-3 text-sm leading-relaxed text-slate-400">
          Ask questions in plain English against a synthetic e-commerce database
          (500 customers, 100 products, 800 orders) and get correct SQL + a
          plain-English answer. This is a portfolio demo — no real user or business
          data is involved.
        </p>

        <div className="mt-6">
          <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-slate-500">
            what to try
          </p>
          <ul className="space-y-2 text-[13px] text-slate-300">
            <li className="flex gap-2">
              <span className="text-emerald-500">→</span>
              <span>Ask <span className="text-slate-100">"Revenue by month"</span> to see multi-step SQL generation + streaming explanation</span>
            </li>
            <li className="flex gap-2">
              <span className="text-emerald-500">→</span>
              <span>Try <span className="text-slate-100">"Delete all customers"</span> — the 3-layer safety story blocks it before any SQL is generated</span>
            </li>
            <li className="flex gap-2">
              <span className="text-emerald-500">→</span>
              <span>Click <span className="text-emerald-400">Visualize Architecture Flow</span> (top-right) to watch the pipeline execute live end-to-end</span>
            </li>
          </ul>
        </div>

        <div className="mt-6 space-y-2">
          <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
            <p className="text-[12px] leading-relaxed text-slate-400">
              <span className="font-mono text-[10px] uppercase tracking-widest text-emerald-400">safety </span>
              The agent connects to Postgres via a role with every write privilege
              revoked. Even a jailbroken model cannot mutate data — verified at the DB
              layer, not just in application code.
            </p>
          </div>
          <div className="rounded-lg border border-amber-900/50 bg-amber-950/30 p-3">
            <p className="text-[12px] leading-relaxed text-amber-200/90">
              <span className="font-mono text-[10px] uppercase tracking-widest text-amber-400">heads up </span>
              Requests are rate-limited to keep LLM costs contained. If you hit the
              limit, wait a bit before trying again.
            </p>
          </div>
        </div>

        <div className="mt-7 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-emerald-600 px-5 py-2 text-sm font-medium text-white shadow-[0_0_0_1px_rgb(34_197_94/0.4)] transition-all duration-150 hover:bg-emerald-500 hover:shadow-[0_0_0_1px_rgb(34_197_94/0.6),0_0_16px_rgb(34_197_94/0.35)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
          >
            Got it — let me try
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
