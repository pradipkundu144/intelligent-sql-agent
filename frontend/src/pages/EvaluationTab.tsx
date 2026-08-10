import { useEffect, useState } from "react";
import { streamEval, type EvalCase, type EvalMetricEnd, type EvalMetricSpec } from "../lib/evalStream";

const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  "http://localhost:8000";

type MetricRuntime = {
  name: string;
  total: number;
  status: "pending" | "running" | "done";
  cases: EvalCase[];
  passed?: number;
  rate?: number;
  faithfulness_mean?: number;
  answer_relevancy_mean?: number;
};

const METRIC_LABELS: Record<string, string> = {
  execution_accuracy: "Execution accuracy",
  guardrail_catch: "Guardrail catch",
  graceful_handling: "Graceful handling",
  ragas: "RAGAS (faithfulness + relevancy)",
};

function initMetrics(specs: EvalMetricSpec[]): MetricRuntime[] {
  return specs.map((s) => ({ name: s.name, total: s.total, status: "pending", cases: [] }));
}

export default function EvaluationTab() {
  const [running, setRunning] = useState(false);
  const [metrics, setMetrics] = useState<MetricRuntime[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [finalResults, setFinalResults] = useState<Record<string, unknown> | null>(null);
  const [showSummary, setShowSummary] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [finishedAt, setFinishedAt] = useState<number | null>(null);

  useEffect(() => {
    if (!showSummary) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowSummary(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [showSummary]);

  const startEval = async () => {
    if (running) return;
    setRunning(true);
    setError(null);
    setMetrics([]);
    setFinalResults(null);
    setShowSummary(false);
    setStartedAt(Date.now());
    setFinishedAt(null);

    try {
      for await (const ev of streamEval(API_BASE_URL)) {
        if (ev.type === "eval_start") {
          setMetrics(initMetrics(ev.metrics));
        } else if (ev.type === "metric_start") {
          setMetrics((prev) =>
            prev.map((m) => (m.name === ev.metric ? { ...m, status: "running" } : m)),
          );
        } else if (ev.type === "case_end") {
          setMetrics((prev) =>
            prev.map((m) =>
              m.name === ev.metric ? { ...m, cases: [...m.cases, ev.case] } : m,
            ),
          );
        } else if (ev.type === "metric_end") {
          const patch: Partial<MetricRuntime> = {
            status: "done",
            passed: ev.passed,
            rate: ev.rate,
          };
          const end = ev as EvalMetricEnd;
          if (end.faithfulness_mean !== undefined) patch.faithfulness_mean = end.faithfulness_mean;
          if (end.answer_relevancy_mean !== undefined) patch.answer_relevancy_mean = end.answer_relevancy_mean;
          setMetrics((prev) => prev.map((m) => (m.name === ev.metric ? { ...m, ...patch } : m)));
        } else if (ev.type === "eval_end") {
          setFinalResults(ev.results);
          setFinishedAt(Date.now());
          setShowSummary(true);
        } else if (ev.type === "error") {
          setError(ev.message);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Eval request failed");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-100">Evaluation harness</h2>
          <p className="mt-1 text-sm text-slate-400">
            Runs 4 metrics × 31 total cases. Streams per-case results as they complete.
            Full run takes ~2–3 minutes (RAGAS is the slow one).
          </p>
        </div>
        <button
          type="button"
          onClick={startEval}
          disabled={running}
          className="rounded-lg bg-sky-600 px-5 py-2.5 text-sm font-medium text-white shadow-[0_0_0_1px_rgb(14_165_233/0.4)] transition-all duration-150 hover:bg-sky-500 hover:shadow-[0_0_0_1px_rgb(14_165_233/0.6),0_0_16px_rgb(14_165_233/0.35)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500 disabled:shadow-none disabled:active:scale-100"
        >
          {running ? "Running…" : metrics.length > 0 ? "Re-run evaluation" : "Run evaluation"}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-900/40 bg-red-950/40 p-3 font-mono text-[12px] text-red-300">
          {error}
        </div>
      )}

      {metrics.length === 0 && !running && (
        <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-8 text-center">
          <p className="text-slate-500">
            Click <span className="text-sky-400">Run evaluation</span> to start. Progress will stream here.
          </p>
        </div>
      )}

      {metrics.length > 0 && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {metrics.map((m) => (
            <MetricCard key={m.name} metric={m} />
          ))}
        </div>
      )}

      {finalResults && (
        <SummaryPanel
          metrics={metrics}
          startedAt={startedAt}
          finishedAt={finishedAt}
          onReopen={() => setShowSummary(true)}
        />
      )}

      {showSummary && finalResults && (
        <SummaryModal
          metrics={metrics}
          startedAt={startedAt}
          finishedAt={finishedAt}
          onClose={() => setShowSummary(false)}
        />
      )}
    </div>
  );
}

function computeOverall(metrics: MetricRuntime[]): { passed: number; total: number; rate: number } {
  const totals = metrics.reduce(
    (acc, m) => {
      acc.total += m.total;
      acc.passed += m.status === "done" ? m.passed ?? 0 : m.cases.filter((c) => c.passed).length;
      return acc;
    },
    { passed: 0, total: 0 },
  );
  return { ...totals, rate: totals.total > 0 ? totals.passed / totals.total : 0 };
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}

function SummaryContent({
  metrics,
  startedAt,
  finishedAt,
}: {
  metrics: MetricRuntime[];
  startedAt: number | null;
  finishedAt: number | null;
}) {
  const overall = computeOverall(metrics);
  const duration = startedAt && finishedAt ? finishedAt - startedAt : null;

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <SummaryStat label="Total passed" value={`${overall.passed} / ${overall.total}`} accent="emerald" />
        <SummaryStat label="Overall rate" value={`${(overall.rate * 100).toFixed(1)}%`} accent="sky" />
        <SummaryStat
          label="Metrics complete"
          value={`${metrics.filter((m) => m.status === "done").length} / ${metrics.length}`}
          accent="slate"
        />
        <SummaryStat
          label="Duration"
          value={duration != null ? formatDuration(duration) : "—"}
          accent="slate"
        />
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-800">
        <table className="w-full text-sm">
          <thead className="bg-slate-950/60 font-mono text-[10px] uppercase tracking-widest text-slate-500">
            <tr>
              <th className="border-b border-slate-800 px-3 py-2 text-left font-medium">Metric</th>
              <th className="border-b border-slate-800 px-3 py-2 text-right font-medium">Passed</th>
              <th className="border-b border-slate-800 px-3 py-2 text-right font-medium">Rate</th>
              <th className="border-b border-slate-800 px-3 py-2 text-left font-medium">Notes</th>
            </tr>
          </thead>
          <tbody className="font-mono text-[12px]">
            {metrics.map((m) => (
              <tr
                key={m.name}
                className="border-b border-slate-900 last:border-b-0 hover:bg-slate-800/40"
              >
                <td className="px-3 py-2 text-slate-200">{METRIC_LABELS[m.name] ?? m.name}</td>
                <td className="px-3 py-2 text-right text-slate-300">
                  {(m.passed ?? 0)} / {m.total}
                </td>
                <td
                  className={`px-3 py-2 text-right ${
                    (m.rate ?? 0) >= 0.9
                      ? "text-emerald-400"
                      : (m.rate ?? 0) >= 0.7
                      ? "text-sky-400"
                      : "text-amber-400"
                  }`}
                >
                  {m.rate != null ? `${(m.rate * 100).toFixed(1)}%` : "—"}
                </td>
                <td className="px-3 py-2 text-slate-500">
                  {m.faithfulness_mean !== undefined
                    ? `faith=${m.faithfulness_mean.toFixed(2)}, relevancy=${(m.answer_relevancy_mean ?? 0).toFixed(2)}`
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-500">
        Results also written to{" "}
        <code className="rounded bg-slate-950 px-1.5 py-0.5 font-mono text-[11px] text-slate-400">
          sql-agent/eval/results/latest.json
        </code>
        .
      </p>
    </div>
  );
}

function SummaryPanel({
  metrics,
  startedAt,
  finishedAt,
  onReopen,
}: {
  metrics: MetricRuntime[];
  startedAt: number | null;
  finishedAt: number | null;
  onReopen: () => void;
}) {
  return (
    <div className="mt-4 rounded-xl border border-sky-900/50 bg-sky-950/20 p-6 animate-[fadeIn_260ms_ease-out]">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-sky-400 shadow-[0_0_8px_rgb(56_189_248/0.7)]" />
          <span className="font-mono text-[10px] uppercase tracking-widest text-sky-300">Run complete</span>
        </div>
        <button
          type="button"
          onClick={onReopen}
          className="rounded-md border border-slate-800 bg-slate-900 px-2.5 py-1 font-mono text-[11px] text-slate-400 transition-colors hover:border-sky-700/60 hover:bg-slate-800 hover:text-sky-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
        >
          Open summary ↗
        </button>
      </div>
      <SummaryContent metrics={metrics} startedAt={startedAt} finishedAt={finishedAt} />
    </div>
  );
}

function SummaryModal({
  metrics,
  startedAt,
  finishedAt,
  onClose,
}: {
  metrics: MetricRuntime[];
  startedAt: number | null;
  finishedAt: number | null;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/80 p-6 backdrop-blur-sm animate-[fadeIn_200ms_ease-out]"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="my-12 w-full max-w-3xl rounded-2xl border border-sky-900/60 bg-slate-950 p-8 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-sky-400 shadow-[0_0_8px_rgb(56_189_248/0.7)]" />
              <span className="font-mono text-[10px] uppercase tracking-widest text-sky-300">
                Evaluation complete
              </span>
            </div>
            <h2 className="text-xl font-semibold text-slate-100">Summary</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md border border-slate-800 bg-slate-900 px-3 py-1.5 font-mono text-[11px] text-slate-400 transition-colors hover:border-slate-600 hover:bg-slate-800 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
          >
            Close (Esc)
          </button>
        </div>
        <SummaryContent metrics={metrics} startedAt={startedAt} finishedAt={finishedAt} />
      </div>
    </div>
  );
}

function SummaryStat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: "emerald" | "sky" | "slate";
}) {
  const color =
    accent === "emerald"
      ? "text-emerald-300"
      : accent === "sky"
      ? "text-sky-300"
      : "text-slate-200";
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-4">
      <div className="font-mono text-[10px] uppercase tracking-widest text-slate-500">{label}</div>
      <div className={`mt-2 text-2xl font-semibold ${color}`}>{value}</div>
    </div>
  );
}

function MetricCard({ metric }: { metric: MetricRuntime }) {
  const doneCount = metric.cases.length;
  const passCount = metric.status === "done" ? (metric.passed ?? 0) : metric.cases.filter((c) => c.passed).length;
  const failCount = doneCount - passCount;
  const progressPct = metric.total > 0 ? (doneCount / metric.total) * 100 : 0;

  const statusBadge =
    metric.status === "done" ? (
      <span className="rounded-full border border-emerald-800/60 bg-emerald-950/50 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-emerald-400">
        done
      </span>
    ) : metric.status === "running" ? (
      <span className="rounded-full border border-sky-800/60 bg-sky-950/50 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-sky-400 animate-pulse">
        running
      </span>
    ) : (
      <span className="rounded-full border border-slate-800 bg-slate-900 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-slate-500">
        pending
      </span>
    );

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h3 className="text-base font-semibold text-slate-100">
            {METRIC_LABELS[metric.name] ?? metric.name}
          </h3>
          {statusBadge}
        </div>
        <div className="flex items-center gap-4 font-mono text-[12px]">
          <span className="text-emerald-400">✓ {passCount}</span>
          <span className="text-red-400">✗ {failCount}</span>
          <span className="text-slate-500">
            {doneCount} / {metric.total}
          </span>
          {metric.status === "done" && metric.rate !== undefined && (
            <span className="text-sky-300">{(metric.rate * 100).toFixed(1)}%</span>
          )}
        </div>
      </div>

      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-slate-800/70">
        <div
          className={`h-full rounded-full transition-[width] duration-500 ease-out ${
            metric.status === "done" ? "bg-emerald-500/80" : "bg-sky-500/80"
          }`}
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {metric.status === "done" && metric.faithfulness_mean !== undefined && (
        <div className="mt-3 flex gap-4 font-mono text-[11px] text-slate-400">
          <span>
            faithfulness mean:{" "}
            <span className="text-slate-200">{metric.faithfulness_mean.toFixed(2)}</span>
          </span>
          <span>
            answer_relevancy mean:{" "}
            <span className="text-slate-200">
              {(metric.answer_relevancy_mean ?? 0).toFixed(2)}
            </span>
          </span>
        </div>
      )}

      {metric.cases.length > 0 && (
        <div className="mt-4 max-h-64 overflow-y-auto rounded border border-slate-800/70 bg-slate-950/40">
          {metric.cases.map((c) => (
            <div
              key={c.id}
              className="flex items-start gap-3 border-b border-slate-800/60 px-3 py-2 last:border-b-0 animate-[fadeIn_200ms_ease-out]"
            >
              <span
                className={`mt-1 shrink-0 font-mono text-[11px] ${
                  c.passed ? "text-emerald-400" : "text-red-400"
                }`}
              >
                {c.passed ? "✓" : "✗"}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="font-mono text-[10px] text-slate-600">{c.id}</span>
                  <span className="truncate text-[13px] text-slate-300">{c.question}</span>
                </div>
                <div className="mt-0.5 font-mono text-[11px] text-slate-500">{c.reason}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
