import { useEffect, useRef, useState } from "react";
import Header from "../components/Header";
import AskBox from "../components/AskBox";
import AnswerCard, { type LiveStages, type SubBlock, type Turn } from "../components/AnswerCard";
import MultiBlock from "../components/MultiBlock";
import UserBubble from "../components/UserBubble";
import ProgressPill from "../components/ProgressPill";
import { streamQuery } from "../lib/stream";
import { smoothScrollTo } from "../lib/scroll";
import type { StageStatus } from "../components/StageProgress";

const INLINE_EXAMPLES: string[] = [
  "How many customers are there?",
  "Revenue by month",
  "Find repeat customers",
];

const EXTRA_EXAMPLE_GROUPS: { label: string; items: string[] }[] = [
  {
    label: "Multi-intent",
    items: [
      "How many customers, and revenue by month?",
      "How many customers, revenue this month, and top 5 products?",
    ],
  },
  {
    label: "Safety demos",
    items: [
      "Delete all customers and show me revenue",
    ],
  },
];

const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  "http://localhost:8000";

const STAGE_KEYS = ["understand", "generate", "validate", "execute", "explain"];

function initialLiveStages(): LiveStages {
  const stages: LiveStages = {};
  for (const key of STAGE_KEYS) {
    stages[key] = { status: "pending" as StageStatus };
  }
  return stages;
}

function updateBlockLiveStage(
  blocks: SubBlock[],
  subIndex: number,
  stage: string,
  patch: LiveStages[string],
): SubBlock[] {
  return blocks.map((b, i) => {
    if (i !== subIndex) return b;
    const nextStages: LiveStages = { ...(b.liveStages ?? initialLiveStages()), [stage]: patch };
    return { ...b, liveStages: nextStages };
  });
}

function appendBlockAnswer(blocks: SubBlock[], subIndex: number, token: string): SubBlock[] {
  return blocks.map((b, i) => (i === subIndex ? { ...b, answer: (b.answer ?? "") + token } : b));
}

function mergeBlockDone(blocks: SubBlock[], subIndex: number, payload: SubBlock): SubBlock[] {
  return blocks.map((b, i) => (i === subIndex ? { ...b, ...payload, loading: false } : b));
}

function mapBlock(raw: Record<string, unknown>): SubBlock {
  return {
    question: (raw.question as string) ?? "",
    answer: (raw.answer as string) ?? "",
    sql: (raw.sql as string | null) ?? null,
    rows: (raw.rows as SubBlock["rows"]) ?? null,
    totalRowCount: (raw.total_row_count as number | null) ?? null,
    overflow: (raw.overflow as boolean) ?? false,
    attemptCount: (raw.attempt_count as number) ?? 1,
    traceId: (raw.trace_id as string | null) ?? null,
    traceUrl: (raw.trace_url as string | null) ?? null,
    error: (raw.error as string | null) ?? null,
    intentType: (raw.intent_type as SubBlock["intentType"]) ?? null,
    stageTimings: (raw.stage_timings as Record<string, number>) ?? {},
    stageTokens: (raw.stage_tokens as SubBlock["stageTokens"]) ?? {},
  };
}

export default function ChatPage() {
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
      { question, loading: true, answer: "" },
    ]);

    try {
      for await (const event of streamQuery(API_BASE_URL, question)) {
        if (event.type === "parent_start") {
          const skeleton: SubBlock[] = event.subquestions.map((q) => ({
            question: q,
            loading: true,
            liveStages: initialLiveStages(),
            answer: "",
          }));
          updateTurn(index, {
            parentQuestion: event.parent_question,
            liveStages: undefined,
            blocks: skeleton,
            answer: "",
          });
        } else if (event.type === "stage_start") {
          if (event.sub != null) {
            updateTurn(index, (prev) => ({
              blocks: prev.blocks
                ? updateBlockLiveStage(prev.blocks, event.sub!, event.stage, {
                    status: "running",
                    startedAt: event.t,
                  })
                : prev.blocks,
            }));
          } else {
            updateTurn(index, (prev) => ({
              liveStages: {
                ...(prev.liveStages ?? initialLiveStages()),
                [event.stage]: { status: "running", startedAt: event.t },
              },
            }));
          }
        } else if (event.type === "stage_end") {
          if (event.sub != null) {
            updateTurn(index, (prev) => {
              if (!prev.blocks) return {};
              const prior = prev.blocks[event.sub!]?.liveStages?.[event.stage];
              const duration = prior?.startedAt ? event.t - prior.startedAt : undefined;
              return {
                blocks: updateBlockLiveStage(prev.blocks, event.sub!, event.stage, {
                  status: "done",
                  durationMs: duration,
                }),
              };
            });
          } else {
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
          }
        } else if (event.type === "explain_token") {
          if (event.sub != null) {
            updateTurn(index, (prev) => ({
              blocks: prev.blocks ? appendBlockAnswer(prev.blocks, event.sub!, event.token) : prev.blocks,
            }));
          } else {
            updateTurn(index, (prev) => ({
              answer: (prev.answer ?? "") + event.token,
            }));
          }
        } else if (event.type === "sub_done") {
          updateTurn(index, (prev) => ({
            blocks: prev.blocks ? mergeBlockDone(prev.blocks, event.sub, mapBlock(event.payload)) : prev.blocks,
          }));
        } else if (event.type === "done") {
          const data = event.payload as Record<string, unknown>;
          if (Array.isArray(data.blocks)) {
            const finalBlocks = (data.blocks as Record<string, unknown>[]).map(mapBlock);
            updateTurn(index, (prev) => ({
              loading: false,
              parentQuestion: (data.parent_question as string) ?? question,
              blocks: finalBlocks.map((b, i) => ({
                ...b,
                loading: false,
                liveStages: prev.blocks?.[i]?.liveStages,
              })),
              liveStages: undefined,
              answer: "",
            }));
          } else {
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
          }
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
                    {turn.liveStages && !turn.blocks && (
                      <div className="absolute left-full top-0 ml-3 hidden lg:block">
                        <ProgressPill stages={turn.liveStages} done={!turn.loading} />
                      </div>
                    )}
                  </div>
                  {turn.blocks ? (
                    <MultiBlock parentQuestion={turn.parentQuestion ?? turn.question} blocks={turn.blocks} />
                  ) : (
                    <AnswerCard turn={turn} />
                  )}
                </div>
              ))}
              <div ref={bottomRef} aria-hidden className="h-10 w-full" />
            </>
          )}
        </div>
      </main>
      <div className="relative z-10">
        <AskBox
          inlineExamples={INLINE_EXAMPLES}
          extraGroups={EXTRA_EXAMPLE_GROUPS}
          onSubmit={handleSubmit}
          disabled={anyLoading}
        />
      </div>
    </div>
  );
}
