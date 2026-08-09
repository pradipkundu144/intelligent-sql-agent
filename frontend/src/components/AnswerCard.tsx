type Row = Record<string, unknown>;

export type Turn = {
  question: string;
  loading: boolean;
  answer?: string;
  sql?: string | null;
  rows?: Row[] | null;
  totalRowCount?: number | null;
  overflow?: boolean;
  error?: string | null;
  intentType?: "query" | "destructive" | "out_of_scope" | null;
  stageTimings?: Record<string, number>;
};

export default function AnswerCard({ turn }: { turn: Turn }) {
  const {
    question,
    loading,
    answer,
    sql,
    rows,
    totalRowCount,
    overflow,
    error,
    intentType,
  } = turn;

  const sampleCount = rows?.length ?? 0;
  const showRowsTable = !loading && rows && rows.length > 0;

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
        {question}
      </p>

      {loading && <p className="text-sm text-slate-500">Thinking…</p>}

      {!loading && answer && (
        <p className="text-base text-slate-900">{answer}</p>
      )}

      {!loading && intentType === "destructive" && (
        <span className="mt-2 inline-block rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
          blocked · destructive
        </span>
      )}
      {!loading && intentType === "out_of_scope" && (
        <span className="mt-2 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
          out of scope
        </span>
      )}

      {!loading && error && (
        <p className="mt-2 rounded bg-red-50 p-2 text-xs text-red-700">
          {error}
        </p>
      )}

      {!loading && overflow && totalRowCount != null && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="inline-block rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
            {totalRowCount.toLocaleString()} rows · sample of {sampleCount}
          </span>
        </div>
      )}

      {!loading && sql && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-slate-500 hover:text-slate-700">
            View SQL <span className="ml-1 text-emerald-600">read-only ✓</span>
          </summary>
          <pre className="mt-2 overflow-x-auto rounded bg-slate-50 p-3 text-xs text-slate-800">
            {sql}
          </pre>
        </details>
      )}

      {showRowsTable && (
        <details className="mt-2" open={overflow ? true : undefined}>
          <summary className="cursor-pointer text-xs text-slate-500 hover:text-slate-700">
            {overflow
              ? `View sample rows (${sampleCount} of ${totalRowCount?.toLocaleString()})`
              : `View rows (${rows!.length})`}
          </summary>
          <div className="mt-2 overflow-x-auto rounded border border-slate-200">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  {Object.keys(rows![0]).map((col) => (
                    <th
                      key={col}
                      className="border-b border-slate-200 px-2 py-1 text-left font-medium"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows!.slice(0, 20).map((row, i) => (
                  <tr key={i} className="odd:bg-white even:bg-slate-50">
                    {Object.values(row).map((val, j) => (
                      <td
                        key={j}
                        className="border-b border-slate-100 px-2 py-1 text-slate-800"
                      >
                        {String(val)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {!overflow && rows!.length > 20 && (
              <p className="p-2 text-xs text-slate-500">
                Showing first 20 of {rows!.length} rows.
              </p>
            )}
          </div>
        </details>
      )}

      {!loading && showRowsTable && (totalRowCount ?? rows!.length) > 20 && (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
          <button
            type="button"
            disabled
            title="Coming soon"
            className="cursor-not-allowed rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-400"
          >
            {overflow
              ? `View full results (${totalRowCount!.toLocaleString()} rows) →`
              : `View all ${(totalRowCount ?? rows!.length).toLocaleString()} rows →`}
          </button>
          <button
            type="button"
            disabled
            title="Coming soon"
            className="cursor-not-allowed rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-400"
          >
            Download CSV
          </button>
        </div>
      )}
    </div>
  );
}
