type StageTokens = { model?: string; input?: number; output?: number };

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
    <details className="mt-3 border-t border-slate-100 pt-3">
      <summary className="cursor-pointer text-xs text-slate-500 hover:text-slate-700">
        Trace · {stages.length} stages · {totalMs} ms · {formatCost(totalCost)}
      </summary>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="text-slate-500">
            <tr>
              <th className="px-2 py-1 text-left font-medium">Stage</th>
              <th className="px-2 py-1 text-left font-medium">Bar</th>
              <th className="px-2 py-1 text-right font-medium">Time</th>
              <th className="px-2 py-1 text-right font-medium">Tokens</th>
              <th className="px-2 py-1 text-right font-medium">Cost</th>
            </tr>
          </thead>
          <tbody>
            {stages.map((stage) => {
              const ms = stageTimings[stage];
              const tokens = stageTokens?.[stage];
              const cost = stageCost(tokens);
              const barPct = (ms / maxMs) * 100;
              return (
                <tr key={stage} className="border-t border-slate-100">
                  <td className="px-2 py-1 text-slate-700">{stage}</td>
                  <td className="px-2 py-1">
                    <div className="h-2 w-24 rounded bg-slate-100">
                      <div
                        className="h-2 rounded bg-emerald-400"
                        style={{ width: `${barPct}%` }}
                      />
                    </div>
                  </td>
                  <td className="px-2 py-1 text-right text-slate-700">{ms} ms</td>
                  <td className="px-2 py-1 text-right text-slate-700">
                    {tokens?.input != null && tokens?.output != null
                      ? `${tokens.input}↑ / ${tokens.output}↓`
                      : "—"}
                  </td>
                  <td className="px-2 py-1 text-right text-slate-700">
                    {formatCost(cost)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-200 font-medium">
              <td className="px-2 py-1 text-slate-800" colSpan={2}>
                Total
              </td>
              <td className="px-2 py-1 text-right text-slate-800">{totalMs} ms</td>
              <td className="px-2 py-1 text-right text-slate-800">
                {attemptCount && attemptCount > 1
                  ? `${attemptCount} attempts`
                  : "1 attempt"}
              </td>
              <td className="px-2 py-1 text-right text-slate-800">
                {formatCost(totalCost)}
              </td>
            </tr>
          </tfoot>
        </table>
        {(traceUrl || traceId) && (
          <p className="mt-2 text-xs">
            <a
              href={traceUrl || `https://cloud.langfuse.com/trace/${traceId}`}
              target="_blank"
              rel="noreferrer"
              className="text-emerald-700 hover:text-emerald-900"
            >
              View full trace in Langfuse ↗
            </a>
            <span className="ml-2 text-slate-400">
              (may take a few seconds to appear)
            </span>
          </p>
        )}
      </div>
    </details>
  );
}
