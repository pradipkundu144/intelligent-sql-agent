import { useEffect, useRef, useState } from "react";
import Accordion from "./Accordion";

type StageTokens = { model?: string; input?: number; output?: number };

function AnimatedBar({ pct, index }: { pct: number; index: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (!ref.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => setReady(entry.isIntersecting),
      { threshold: 0.05 },
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={ref} className="h-1.5 w-28 rounded-full bg-slate-800/70 overflow-hidden">
      <div
        className="h-1.5 rounded-full bg-emerald-500/70"
        style={{
          width: ready ? `${pct}%` : "0%",
          transition: "width 600ms cubic-bezier(0.22, 1, 0.36, 1)",
          transitionDelay: `${index * 60}ms`,
        }}
      />
    </div>
  );
}

type Props = {
  stageTimings?: Record<string, number>;
  stageTokens?: Record<string, StageTokens>;
  traceId?: string | null;
  traceUrl?: string | null;
  attemptCount?: number;
};

const STAGE_ORDER = ["understand", "generate", "validate", "execute", "explain"];

const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  "gpt-4o": { input: 2.5, output: 10.0 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
};

function stageCost(tokens: StageTokens | undefined): number {
  if (!tokens || !tokens.model) return 0;
  const price = MODEL_PRICING[tokens.model];
  if (!price) return 0;
  const inputCost = ((tokens.input ?? 0) / 1_000_000) * price.input;
  const outputCost = ((tokens.output ?? 0) / 1_000_000) * price.output;
  return inputCost + outputCost;
}

function formatCost(cost: number): string {
  if (cost === 0) return "—";
  if (cost < 0.0001) return "<$0.0001";
  return `$${cost.toFixed(4)}`;
}

export default function TracePanel({
  stageTimings,
  stageTokens,
  traceId,
  traceUrl,
  attemptCount,
}: Props) {
  if (!stageTimings || Object.keys(stageTimings).length === 0) {
    return null;
  }

  const stages = STAGE_ORDER.filter((s) => stageTimings[s] !== undefined);
  const maxMs = Math.max(...stages.map((s) => stageTimings[s]));
  const totalMs = stages.reduce((sum, s) => sum + stageTimings[s], 0);
  const totalCost = stages.reduce((sum, s) => sum + stageCost(stageTokens?.[s]), 0);

  return (
    <div className="mt-4 border-t border-slate-800 pt-3">
      <Accordion
        summary={
          <>
            Trace
            <span className="text-slate-600">·</span>
            <span>{stages.length} stages</span>
            <span className="text-slate-600">·</span>
            <span>{totalMs} ms</span>
            <span className="text-slate-600">·</span>
            <span>{formatCost(totalCost)}</span>
          </>
        }
      >
      <div className="overflow-x-auto">
        <table className="w-full font-mono text-[11px]">
          <thead className="text-slate-500">
            <tr>
              <th className="px-2 py-1 text-left font-medium uppercase tracking-widest text-[10px]">Stage</th>
              <th className="px-2 py-1 text-left font-medium uppercase tracking-widest text-[10px]">Bar</th>
              <th className="px-2 py-1 text-right font-medium uppercase tracking-widest text-[10px]">Time</th>
              <th className="px-2 py-1 text-right font-medium uppercase tracking-widest text-[10px]">Tokens</th>
              <th className="px-2 py-1 text-right font-medium uppercase tracking-widest text-[10px]">Cost</th>
            </tr>
          </thead>
          <tbody>
            {stages.map((stage, i) => {
              const ms = stageTimings[stage];
              const tokens = stageTokens?.[stage];
              const cost = stageCost(tokens);
              const barPct = (ms / maxMs) * 100;
              return (
                <tr key={stage} className="border-t border-slate-900">
                  <td className="px-2 py-1.5 text-slate-300">{stage}</td>
                  <td className="px-2 py-1.5">
                    <AnimatedBar pct={barPct} index={i} />
                  </td>
                  <td className="px-2 py-1.5 text-right text-slate-300">{ms} ms</td>
                  <td className="px-2 py-1.5 text-right text-slate-400">
                    {tokens?.input != null && tokens?.output != null
                      ? `${tokens.input}↑ / ${tokens.output}↓`
                      : "—"}
                  </td>
                  <td className="px-2 py-1.5 text-right text-slate-400">
                    {formatCost(cost)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-800">
              <td className="px-2 py-1.5 text-slate-200 font-medium uppercase tracking-widest text-[10px]" colSpan={2}>
                Total
              </td>
              <td className="px-2 py-1.5 text-right text-slate-200">{totalMs} ms</td>
              <td className="px-2 py-1.5 text-right text-slate-400">
                {attemptCount && attemptCount > 1
                  ? `${attemptCount} attempts`
                  : "1 attempt"}
              </td>
              <td className="px-2 py-1.5 text-right text-slate-200">
                {formatCost(totalCost)}
              </td>
            </tr>
          </tfoot>
        </table>
        {(traceUrl || traceId) && (
          <p className="mt-3 font-mono text-[11px]">
            <a
              href={traceUrl || `https://cloud.langfuse.com/trace/${traceId}`}
              target="_blank"
              rel="noreferrer"
              className="rounded text-emerald-400 hover:text-emerald-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
            >
              View full trace in Langfuse ↗
            </a>
            <span className="ml-2 text-slate-600">
              (may take a few seconds to appear)
            </span>
          </p>
        )}
      </div>
      </Accordion>
    </div>
  );
}
