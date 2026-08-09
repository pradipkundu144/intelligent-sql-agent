import { useState } from "react";
import Header from "./components/Header";
import AskBox from "./components/AskBox";
import AnswerCard, { type Turn } from "./components/AnswerCard";
import { streamQuery } from "./lib/stream";
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
          updateTurn(index, {
            loading: false,
            answer: (data.answer as string) ?? "",
            sql: (data.sql as string | null) ?? null,
            rows: (data.rows as Turn["rows"]) ?? null,
            totalRowCount: (data.total_row_count as number | null) ?? null,
            overflow: (data.overflow as boolean) ?? false,
            attemptCount: (data.attempt_count as number) ?? 1,
            traceId: (data.trace_id as string | null) ?? null,
            traceUrl: (data.trace_url as string | null) ?? null,
            error: (data.error as string | null) ?? null,
            intentType: (data.intent_type as Turn["intentType"]) ?? null,
            stageTimings: (data.stage_timings as Record<string, number>) ?? {},
            stageTokens: (data.stage_tokens as Turn["stageTokens"]) ?? {},
            liveStages: undefined,
          });
        } else if (event.type === "error") {
          updateTurn(index, {
            loading: false,
            error: event.message,
            liveStages: undefined,
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
    <div className="flex h-full flex-col">
      <Header />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 overflow-y-auto px-4 py-6">
        {turns.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center text-center text-slate-500">
            <p className="text-lg">Ask a question about the shop data.</p>
            <p className="mt-1 text-sm">
              Try one of the examples below, or type your own.
            </p>
          </div>
        ) : (
          turns.map((turn, i) => <AnswerCard key={i} turn={turn} />)
        )}
      </main>
      <AskBox
        examples={EXAMPLE_QUESTIONS}
        onSubmit={handleSubmit}
        disabled={anyLoading}
      />
    </div>
  );
}
