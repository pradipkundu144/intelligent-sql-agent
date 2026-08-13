import { useEffect, useState } from "react";
import { type StageStatus } from "./StageProgress";
import TracePanel from "./TracePanel";
import Sparkles from "./Sparkles";
import Accordion from "./Accordion";
import RowsTable from "./RowsTable";
import CopyButton from "./CopyButton";

type Row = Record<string, unknown>;
type StageTokens = { model?: string; input?: number; output?: number };

export type LiveStages = Record<string, { status: StageStatus; durationMs?: number; startedAt?: number }>;

export type SubBlock = {
  question: string;
  answer?: string;
  sql?: string | null;
  rows?: Row[] | null;
  totalRowCount?: number | null;
  overflow?: boolean;
  attemptCount?: number;
  traceId?: string | null;
  traceUrl?: string | null;
  error?: string | null;
  intentType?: "query" | "destructive" | "out_of_scope" | "system_access" | "data_unavailable" | null;
  stageTimings?: Record<string, number>;
  stageTokens?: Record<string, StageTokens>;
  loading?: boolean;
  liveStages?: LiveStages;
};

export type Turn = SubBlock & {
  loading: boolean;
  parentQuestion?: string;
  blocks?: SubBlock[];
};

function isSystemNotice(error: string | null | undefined): boolean {
  if (!error) return false;
  const s = error.toLowerCase();
  return (
    s.includes("request limit") ||
    s.includes("temporarily unavailable") ||
    s.includes("authorised") ||
    s.includes("authorized")
  );
}

function borderColorForIntent(intent: Turn["intentType"], hasError: boolean | undefined, systemNotice: boolean = false): string {
  if (systemNotice) return "border-l-amber-500/70";
  if (hasError) return "border-l-red-500/70";
  switch (intent) {
    case "destructive":
      return "border-l-red-500/70";
    case "system_access":
      return "border-l-orange-500/70";
    case "data_unavailable":
      return "border-l-amber-500/70";
    case "out_of_scope":
      return "border-l-slate-600";
    default:
      return "border-l-emerald-500/70";
  }
}

function statusLabelForIntent(intent: Turn["intentType"]): string | null {
  switch (intent) {
    case "destructive":
      return "blocked · destructive";
    case "system_access":
      return "blocked · system access";
    case "data_unavailable":
      return "not available";
    case "out_of_scope":
      return "out of scope";
    default:
      return null;
  }
}

export default function AnswerCard({ turn }: { turn: Turn }) {
  const {
    loading,
    answer,
    sql,
    rows,
    totalRowCount,
    overflow,
    error,
    intentType,
  } = turn;

  const [caretVisible, setCaretVisible] = useState(false);

  useEffect(() => {
    if (loading) {
      setCaretVisible(true);
      return;
    }
    const t = setTimeout(() => setCaretVisible(false), 600);
    return () => clearTimeout(t);
  }, [loading]);

  const sampleCount = rows?.length ?? 0;
  const showRowsTable = !loading && rows && rows.length > 0;
  const systemNotice = isSystemNotice(error);
  const borderColor = borderColorForIntent(intentType, !!error, systemNotice);
  const statusLabel = statusLabelForIntent(intentType);


  return (
    <div
      className={`rounded-2xl rounded-tl-md border border-l-2 border-slate-800 bg-slate-900 p-5 shadow-[0_1px_0_0_rgb(148_163_184/0.03)_inset] ${borderColor}`}
    >
      {statusLabel && !loading && (
        <div className="mb-3 flex items-center">
          <span className={`font-mono text-[10px] uppercase tracking-widest ${
            intentType === "destructive" || error
              ? "text-red-400"
              : intentType === "system_access"
              ? "text-orange-400"
              : intentType === "data_unavailable"
              ? "text-amber-400"
              : "text-slate-400"
          }`}>
            {statusLabel}
          </span>
        </div>
      )}

      {loading && !answer && (
        <div className="flex items-center gap-2">
          <Sparkles />
          <span className="thinking-shimmer font-mono text-xs">Thinking…</span>
        </div>
      )}

      {answer && (
        <p className="text-[15px] leading-relaxed text-slate-100 whitespace-pre-wrap">
          {answer}
          {caretVisible && (
            <span
              className={`streaming-caret ${!loading ? "streaming-caret-fade" : ""}`}
              aria-hidden
            />
          )}
        </p>
      )}

      {!loading && (turn.attemptCount ?? 1) > 1 && !error && (
        <span className="mt-3 inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest text-emerald-400">
          <span className="h-1 w-1 rounded-full bg-emerald-500" />
          refined {turn.attemptCount!}× · succeeded
        </span>
      )}
      {!loading && (turn.attemptCount ?? 1) > 1 && error && (
        <span className="mt-3 inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-widest text-amber-400">
          <span className="h-1 w-1 rounded-full bg-amber-500" />
          refined {turn.attemptCount!}× · gave up
        </span>
      )}

      {!loading && error && (
        <div
          className={`mt-3 flex items-center gap-2.5 rounded border p-2.5 text-[12px] leading-relaxed ${
            systemNotice
              ? "border-amber-900/50 bg-amber-950/30 text-amber-200"
              : "border-red-900/40 bg-red-950/40 font-mono text-[11px] text-red-300"
          }`}
        >
          {systemNotice && (
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500 shadow-[0_0_6px_rgb(245_158_11/0.6)]"
              aria-hidden
            />
          )}
          <span>{error}</span>
        </div>
      )}

      {!loading && overflow && totalRowCount != null && (
        <div className="mt-3">
          <span className="inline-flex items-center gap-1.5 rounded border border-amber-900/40 bg-amber-950/40 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-amber-300">
            {totalRowCount.toLocaleString()} rows · sample of {sampleCount}
          </span>
        </div>
      )}

      {!loading && sql && (
        <div className="mt-4 animate-[fadeIn_260ms_ease-out]">
          <Accordion
            summary={
              <>
                View SQL
                <span className="text-emerald-500">read-only ✓</span>
              </>
            }
          >
            <div className="relative">
              <div className="absolute right-2 top-2 z-10">
                <CopyButton text={sql} label="Copy SQL" />
              </div>
              <pre className="overflow-x-auto rounded border border-slate-800 bg-slate-950 p-3 pr-32 font-mono text-[12px] leading-relaxed text-slate-300">
                {sql}
              </pre>
            </div>
          </Accordion>
        </div>
      )}

      {showRowsTable && (
        <div className="mt-3">
          <Accordion
            defaultOpen={overflow}
            summary={
              overflow
                ? `Sample rows (${sampleCount} of ${totalRowCount?.toLocaleString()})`
                : `Rows (${rows!.length})`
            }
          >
            <RowsTable rows={rows!} overflow={!!overflow} />
          </Accordion>
        </div>
      )}

      {!loading && showRowsTable && (totalRowCount ?? rows!.length) > 20 && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled
            title="Coming soon"
            className="cursor-not-allowed rounded border border-slate-800 bg-slate-900 px-3 py-1.5 font-mono text-[11px] text-slate-500"
          >
            {overflow
              ? `View full results (${totalRowCount!.toLocaleString()} rows) →`
              : `View all ${(totalRowCount ?? rows!.length).toLocaleString()} rows →`}
          </button>
          <button
            type="button"
            disabled
            title="Coming soon"
            className="cursor-not-allowed rounded border border-slate-800 bg-slate-900 px-3 py-1.5 font-mono text-[11px] text-slate-500"
          >
            Download CSV
          </button>
        </div>
      )}

      {!loading && (
        <div className="animate-[fadeIn_300ms_ease-out]">
        <TracePanel
          stageTimings={turn.stageTimings}
          stageTokens={turn.stageTokens}
          traceId={turn.traceId}
          traceUrl={turn.traceUrl}
          attemptCount={turn.attemptCount}
        />
        </div>
      )}
    </div>
  );
}
