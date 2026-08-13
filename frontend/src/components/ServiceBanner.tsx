import { createPortal } from "react-dom";

export default function ServiceBanner() {
  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/95 p-6 backdrop-blur-md animate-[fadeIn_220ms_ease-out]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="service-unavailable-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-amber-900/60 bg-slate-950 p-8 shadow-[0_0_60px_rgb(245_158_11/0.15)]">
        <div className="mb-4 flex items-center gap-2">
          <span className="rounded-full border border-amber-700/60 bg-amber-950/60 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-amber-300">
            offline
          </span>
        </div>

        <h2
          id="service-unavailable-title"
          className="text-xl font-semibold text-slate-100"
        >
          Service temporarily unavailable
        </h2>

        <p className="mt-3 text-sm leading-relaxed text-slate-400">
          The agent is offline right now. This usually resolves within a short
          while — please check back in a bit.
        </p>

        <div className="mt-6 flex items-center gap-2">
          <span
            className="h-2 w-2 rounded-full bg-amber-500 shadow-[0_0_8px_rgb(245_158_11/0.7)] animate-pulse"
            aria-hidden
          />
          <span className="font-mono text-[10px] uppercase tracking-widest text-amber-400">
            monitoring availability…
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
