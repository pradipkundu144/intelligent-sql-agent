import Logo from "./Logo";
import { ENABLE_DASHBOARD_LINK } from "../config/features";

export default function Header() {
  return (
    <header className="border-b border-slate-800 bg-slate-950">
      <div className="flex w-full items-center justify-between px-6 py-3">
        <div className="flex items-center gap-2">
          <Logo size={22} />
          <h1 className="text-sm font-semibold tracking-tight text-slate-100">
            Intelligent SQL Agent
          </h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgb(34_197_94/0.7)]" />
            <span className="font-mono text-[11px] uppercase tracking-widest text-slate-500">
              shop_db
            </span>
          </div>

          <a
            href="/dashboard#architecture"
            target="_blank"
            rel="noreferrer"
            className="group inline-flex items-center gap-2 rounded-md border border-emerald-700/60 bg-emerald-950/40 px-3 py-1.5 text-[12px] font-medium text-emerald-300 shadow-[0_0_0_1px_rgb(34_197_94/0.15)] transition-all duration-150 hover:border-emerald-500/70 hover:bg-emerald-900/40 hover:text-emerald-200 hover:shadow-[0_0_0_1px_rgb(34_197_94/0.35),0_0_14px_rgb(34_197_94/0.25)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
          >
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden>
              <circle cx="3" cy="3" r="1.8" stroke="currentColor" strokeWidth="1.4" />
              <circle cx="13" cy="3" r="1.8" stroke="currentColor" strokeWidth="1.4" />
              <circle cx="8" cy="13" r="1.8" stroke="currentColor" strokeWidth="1.4" />
              <path d="M4.2 4.4L7.2 11.2M11.8 4.4L8.8 11.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
            Visualize Architecture Flow
            <span className="text-emerald-500 transition-transform group-hover:translate-x-0.5">↗</span>
          </a>

          {ENABLE_DASHBOARD_LINK && (
            <a
              href="/dashboard"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-md border border-slate-800 bg-slate-900 px-2.5 py-1 font-mono text-[11px] text-slate-400 transition-all duration-150 hover:border-sky-700/60 hover:bg-slate-800 hover:text-sky-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
            >
              Dashboard ↗
            </a>
          )}
        </div>
      </div>
    </header>
  );
}
