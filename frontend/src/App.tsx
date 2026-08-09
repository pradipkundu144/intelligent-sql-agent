import { useEffect, useRef, useState } from "react";
import Header from "./components/Header";
import AskBox from "./components/AskBox";
import AnswerCard, { type Turn } from "./components/AnswerCard";
import UserBubble from "./components/UserBubble";
import ProgressPill from "./components/ProgressPill";
import { streamQuery } from "./lib/stream";
import { smoothScrollTo } from "./lib/scroll";
import type { StageStatus } from "./components/StageProgress";

const EXAMPLE_QUESTIONS = [
  "How many customers are there?",
  "Revenue by month",
  "Find repeat customers",
];

const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  "http://localhost:8000";

const STAGE_KEYS = ["understand", "generate", "validate", "execute", "explain"];

function initialLiveStages(): Turn["liveStages"] {
  const stages: Turn["liveStages"] = {};
  for (const key of STAGE_KEYS) {
    stages[key] = { status: "pending" as StageStatus };
  }
  return stages;
}

export default function App() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const anyLoading = turns.some((t) => t.loading);
  const bottomRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!mainRef.current || !bottomRef.current) return;
    const main = mainRef.current;
    const bottom = bottomRef.current;
    const target = bottom.offsetTop - main.clientHeight + bottom.clientHeight;
    return smoothScrollTo(main, target, 250);
  }, [turns.length]);

  const updateTurn = (index: number, update: Partial<Turn> | ((prev: Turn) => Partial<Turn>)) => {
    setTurns((prev) =>
      prev.map((t, i) => {
        if (i !== index) return t;
        const patch = typeof update === "function" ? update(t) : update;
        return { ...t, ...patch };
      }),
    );
  };

  const handleSubmit = async (question: string) => {
    const index = turns.length;
    setTurns((prev) => [
      ...prev,
      { question, loading: true, answer: "", liveStages: initialLiveStages() },
    ]);

    try {
      for await (const event of streamQuery(API_BASE_URL, question)) {
        if (event.type === "stage_start") {
          updateTurn(index, (prev) => ({
            liveStages: {
              ...(prev.liveStages ?? initialLiveStages()),
              [event.stage]: { status: "running", startedAt: event.t },
            },
          }));
        } else if (event.type === "stage_end") {
          updateTurn(index, (prev) => {
            const prior = prev.liveStages?.[event.stage];
            const duration = prior?.startedAt ? event.t - prior.startedAt : undefined;
            return {
              liveStages: {
                ...(prev.liveStages ?? initialLiveStages()),
                [event.stage]: { status: "done", durationMs: duration },
              },
            };
          });
        } else if (event.type === "explain_token") {
          updateTurn(index, (prev) => ({
            answer: (prev.answer ?? "") + event.token,
          }));
        } else if (event.type === "done") {
          const data = event.payload as Record<string, unknown>;
          const finalTimings = (data.stage_timings as Record<string, number>) ?? {};
          updateTurn(index, (prev) => {
            const merged: Turn["liveStages"] = { ...(prev.liveStages ?? initialLiveStages()) };
            for (const key of STAGE_KEYS) {
              const wasDone = merged[key]?.status === "done";
              if (finalTimings[key] != null) {
                merged[key] = {
                  status: "done",
                  durationMs: merged[key]?.durationMs ?? finalTimings[key],
                };
              } else if (!wasDone) {
                merged[key] = { ...merged[key], status: merged[key]?.status ?? "pending" };
              }
            }
            return {
              loading: false,
              answer: (data.answer as string) ?? prev.answer ?? "",
              sql: (data.sql as string | null) ?? null,
              rows: (data.rows as Turn["rows"]) ?? null,
              totalRowCount: (data.total_row_count as number | null) ?? null,
              overflow: (data.overflow as boolean) ?? false,
              attemptCount: (data.attempt_count as number) ?? 1,
              traceId: (data.trace_id as string | null) ?? null,
              traceUrl: (data.trace_url as string | null) ?? null,
              error: (data.error as string | null) ?? null,
              intentType: (data.intent_type as Turn["intentType"]) ?? null,
              stageTimings: finalTimings,
              stageTokens: (data.stage_tokens as Turn["stageTokens"]) ?? {},
              liveStages: merged,
            };
          });
        } else if (event.type === "error") {
          updateTurn(index, {
            loading: false,
            error: event.message,
          });
        }
      }
    } catch (err) {
      updateTurn(index, {
        loading: false,
        error: err instanceof Error ? err.message : "Request failed",
        liveStages: undefined,
      });
    }
  };

  return (
    <div className="relative flex h-full flex-col bg-slate-950">
      <div className="ambient-layer" aria-hidden>
        <div className="ambient-blob ambient-blob-a" />
        <div className="ambient-blob ambient-blob-b" />
        <div className="ambient-blob ambient-blob-c" />
      </div>
      <div className="relative z-10">
        <Header />
      </div>
      <main ref={mainRef} className="relative z-10 flex-1 overflow-y-auto overflow-x-hidden">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6">
          {turns.length === 0 ? (
            <div className="flex min-h-[60vh] flex-1 flex-col items-center justify-center gap-2 text-center">
              <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-slate-600">
                read-only · natural-language SQL
              </p>
              <p className="text-lg text-slate-200">Ask a question about the shop data.</p>
              <p className="text-sm text-slate-500">
                Try one of the examples below, or type your own.
              </p>
            </div>
          ) : (
            <>
              {turns.map((turn, i) => (
                <div key={i} className="flex flex-col gap-3 animate-[fadeIn_240ms_ease-out]">
                  <div className="relative">
                    <UserBubble question={turn.question} />
                    {turn.liveStages && (
                      <div className="absolute left-full top-0 ml-3 hidden lg:block">
                        <ProgressPill stages={turn.liveStages} done={!turn.loading} />
                      </div>
                    )}
                  </div>
                  <AnswerCard turn={turn} />
                </div>
              ))}
              <div ref={bottomRef} aria-hidden className="h-10 w-full" />
            </>
          )}
        </div>
      </main>
      <div className="relative z-10">
        <AskBox
          examples={EXAMPLE_QUESTIONS}
          onSubmit={handleSubmit}
          disabled={anyLoading}
        />
      </div>
    </div>
  );
}
