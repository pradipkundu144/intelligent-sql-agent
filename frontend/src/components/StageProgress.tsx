import { useEffect, useState } from "react";

export type StageStatus = "pending" | "running" | "done";

type StageEntry = {
  status: StageStatus;
  durationMs?: number;
  startedAt?: number;
};

type Props = {
  stages: Record<string, StageEntry>;
};

const STAGE_LABELS: Record<string, string> = {
  understand: "Understanding",
  generate: "Generating SQL",
  validate: "Validating",
  execute: "Running query",
  explain: "Explaining",
};

const STAGE_ORDER = ["understand", "generate", "validate", "execute", "explain"];

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function useTick(active: boolean, ms = 100): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setTick((t) => t + 1), ms);
    return () => clearInterval(id);
  }, [active, ms]);
  return tick;
}

function dotClasses(status: StageStatus): string {
  if (status === "done") return "bg-emerald-500/70 border-emerald-500/70";
  if (status === "running")
    return "bg-emerald-500 border-emerald-500 shadow-[0_0_0_3px_rgb(34_197_94/0.2)] animate-pulse";
  return "bg-slate-900 border-slate-700";
}

function labelClasses(status: StageStatus): string {
  if (status === "done") return "text-slate-500";
  if (status === "running") return "text-slate-100";
  return "text-slate-600";
}

export default function StageProgress({ stages }: Props) {
  const anyRunning = STAGE_ORDER.some((s) => stages[s]?.status === "running");
  useTick(anyRunning, 100);
  const now = Date.now();

  const doneCount = STAGE_ORDER.filter((s) => stages[s]?.status === "done").length;
  const progressPct = (doneCount / STAGE_ORDER.length) * 100;

  const runningIndex = STAGE_ORDER.findIndex((s) => stages[s]?.status === "running");

  return (
    <div className="min-w-[220px]">
      <ul className="relative space-y-2 py-1">
        <span className="absolute left-[7.5px] top-3 bottom-3 w-px bg-slate-800" />
        {runningIndex >= 0 && (
          <span
            aria-hidden
            className="pointer-events-none absolute left-5 right-[-6px] h-6 rounded bg-emerald-500/[0.06] transition-all duration-300 ease-out"
            style={{ top: `${runningIndex * 28 + 2}px` }}
          />
        )}
        {STAGE_ORDER.map((stage) => {
          const entry = stages[stage] ?? { status: "pending" as StageStatus };
          const isRunning = entry.status === "running";
          const liveMs =
            isRunning && entry.startedAt != null ? now - entry.startedAt : undefined;
          return (
            <li key={stage} className="relative flex items-center gap-3">
              <span className="flex w-4 shrink-0 items-center justify-center">
                <span
                  className={`h-3 w-3 rounded-full border ${dotClasses(entry.status)}`}
                />
              </span>
              <span
                className={`flex-1 whitespace-nowrap font-mono text-xs transition-colors ${labelClasses(entry.status)}`}
              >
                {STAGE_LABELS[stage]}
              </span>
              {isRunning && liveMs != null && (
                <span className="ml-3 font-mono text-[10px] text-emerald-300">
                  {formatDuration(liveMs)}
                </span>
              )}
              {entry.status === "done" && entry.durationMs != null && (
                <span className="ml-3 font-mono text-[10px] text-slate-500">
                  {formatDuration(entry.durationMs)}
                </span>
              )}
              {entry.status === "pending" && (
                <span className="ml-3 font-mono text-[10px] text-slate-700">—</span>
              )}
            </li>
          );
        })}
      </ul>
      <div className="mt-2.5 h-[2px] w-full overflow-hidden rounded-full bg-slate-800/70">
        <div
          className="h-full rounded-full bg-emerald-500/80 transition-[width] duration-500 ease-out"
          style={{ width: `${progressPct}%` }}
        />
      </div>
    </div>
  );
}
