import { useEffect, useState } from "react";
import Logo from "../components/Logo";
import EvaluationTab from "./EvaluationTab";
import ArchitectureTab from "./ArchitectureTab";
import { ENABLE_EVAL_TAB } from "../config/features";

type TabKey = "evaluation" | "architecture";

function tabFromHash(): TabKey {
  if (!ENABLE_EVAL_TAB) return "architecture";
  const h = window.location.hash.replace("#", "").toLowerCase();
  return h === "architecture" ? "architecture" : "evaluation";
}

export default function DashboardPage() {
  const [tab, setTab] = useState<TabKey>(tabFromHash);

  useEffect(() => {
    const onHash = () => setTab(tabFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const switchTab = (t: TabKey) => {
    window.location.hash = t;
    setTab(t);
  };

  return (
    <div className="relative flex min-h-screen flex-col bg-slate-900 text-slate-100">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0"
        style={{
          background:
            "radial-gradient(1200px circle at 20% 0%, rgba(14, 165, 233, 0.08), transparent 45%), radial-gradient(900px circle at 90% 100%, rgba(14, 165, 233, 0.05), transparent 40%)",
        }}
      />

      <header className="sticky top-0 z-20 border-b border-slate-800 bg-slate-950/90 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-none items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Logo size={22} />
            <div className="flex items-baseline gap-2">
              <h1 className="text-sm font-semibold tracking-tight text-slate-100">
                SQL Agent Dashboard
              </h1>
              <span className="rounded-full border border-sky-800/60 bg-sky-950/50 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-sky-300">
                admin
              </span>
            </div>
          </div>
          <a
            href="/"
            className="rounded-md border border-slate-800 bg-slate-900 px-3 py-1.5 font-mono text-[11px] text-slate-400 transition-colors hover:border-slate-600 hover:bg-slate-800 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
          >
            ← Back to chat
          </a>
        </div>
        <div className="mx-auto flex w-full max-w-none gap-1 px-4">
          {ENABLE_EVAL_TAB && (
            <TabButton active={tab === "evaluation"} onClick={() => switchTab("evaluation")}>
              Evaluation
            </TabButton>
          )}
          <TabButton active={tab === "architecture"} onClick={() => switchTab("architecture")}>
            Architecture
          </TabButton>
        </div>
      </header>

      <main className="relative z-10 flex-1">
        <div className="mx-auto w-full max-w-none px-4 py-6">
          {ENABLE_EVAL_TAB && tab === "evaluation" && <EvaluationTab />}
          {tab === "architecture" && <ArchitectureTab />}
        </div>
      </main>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative px-4 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 ${
        active ? "text-sky-300" : "text-slate-500 hover:text-slate-200"
      }`}
    >
      {children}
      {active && (
        <span className="absolute inset-x-0 -bottom-px h-0.5 bg-sky-400 shadow-[0_0_8px_rgb(56_189_248/0.6)]" />
      )}
    </button>
  );
}
