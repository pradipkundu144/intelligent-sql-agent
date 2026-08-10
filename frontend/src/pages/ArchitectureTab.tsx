import { useCallback, useMemo, useRef, useState } from "react";
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  type Edge,
  type Node,
  ReactFlowProvider,
} from "reactflow";
import "reactflow/dist/style.css";

import {
  EXAMPLE_QUERIES,
  IDLE_DASHED_STYLE,
  IDLE_EDGE_STYLE,
  buildMultiLayout,
  buildSingleLayout,
  nodeIdFor,
  type ExampleQuery,
  type PipelineNodeData,
} from "../architecture/flow";
import PipelineNode from "../architecture/PipelineNode";
import { streamQuery } from "../lib/stream";

const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  "http://localhost:8000";

const NODE_TYPES = { pipeline: PipelineNode };

type PerSubDetail = {
  question?: string;
  intentType?: string;
  blockReason?: string;
  sql?: string;
  rowCount?: number;
  overflow?: boolean;
  answer?: string;
  attemptCount?: number;
};

type DetailState = {
  parentQuestion?: string;
  subquestions?: string[];
  perSub: Record<number, PerSubDetail>;
  finalAnswer?: string;
  traceUrl?: string;
  stageTimings?: Record<string, number>;
  status: "idle" | "running" | "done" | "error";
};

const EMPTY_DETAIL: DetailState = { perSub: {}, status: "idle" };

function updateNode(
  nodes: Node<PipelineNodeData>[],
  id: string,
  patch: Partial<PipelineNodeData>,
): Node<PipelineNodeData>[] {
  return nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n));
}

const ARROW_ACTIVE = { type: MarkerType.ArrowClosed, color: "#38bdf8", width: 20, height: 20 };
const ARROW_DONE = { type: MarkerType.ArrowClosed, color: "#10b981", width: 16, height: 16 };
const ARROW_IDLE = { type: MarkerType.ArrowClosed, color: "#475569", width: 14, height: 14 };
const ARROW_REFUSE = { type: MarkerType.ArrowClosed, color: "#f59e0b", width: 18, height: 18 };
const ARROW_RETRY = { type: MarkerType.ArrowClosed, color: "#f97316", width: 18, height: 18 };

function setEdgeStyle(edges: Edge[], id: string, active: boolean, dashed = false, done = false): Edge[] {
  return edges.map((e) => {
    if (e.id !== id) return e;
    if (active) {
      return {
        ...e,
        animated: true,
        style: dashed
          ? { strokeWidth: 2.5, stroke: "#38bdf8", strokeDasharray: "6 4", opacity: 1 }
          : { strokeWidth: 3, stroke: "#38bdf8", opacity: 1 },
        markerEnd: ARROW_ACTIVE,
      };
    }
    if (done) {
      return {
        ...e,
        animated: false,
        style: dashed
          ? { strokeWidth: 1.5, stroke: "#10b981", strokeDasharray: "4 4", opacity: 0.6 }
          : { strokeWidth: 2, stroke: "#10b981", opacity: 0.8 },
        markerEnd: ARROW_DONE,
      };
    }
    return {
      ...e,
      animated: false,
      style: dashed ? IDLE_DASHED_STYLE : IDLE_EDGE_STYLE,
      markerEnd: ARROW_IDLE,
    };
  });
}

function revealHiddenEdge(edges: Edge[], id: string, kind: "refuse" | "retry"): Edge[] {
  return edges.map((e) => {
    if (e.id !== id) return e;
    const color = kind === "refuse" ? "#f59e0b" : "#f97316";
    const marker = kind === "refuse" ? ARROW_REFUSE : ARROW_RETRY;
    return {
      ...e,
      animated: true,
      style: { strokeWidth: 2.5, stroke: color, strokeDasharray: "6 4", opacity: 1 },
      markerEnd: marker,
      labelStyle: { fill: color, fontFamily: "JetBrains Mono, monospace", fontSize: 10 },
      labelBgStyle: { fill: "#0f172a" },
    };
  });
}

const EDGE_NAMES = (sub: number) => ({
  pre: {
    understand: `e-decompose-sub${sub}-understand`,
    generate: `e-sub${sub}-understand-generate`,
    validate: `e-sub${sub}-generate-validate`,
    execute: `e-sub${sub}-validate-execute`,
    explain: `e-sub${sub}-execute-explain`,
  },
  ext: {
    understand: [`e-ext-sub${sub}-understand`, `e-ext-rag-sub${sub}-understand`, `e-ext-trace-sub${sub}-understand`],
    generate: [`e-ext-sub${sub}-generate`, `e-ext-trace-sub${sub}-generate`],
    validate: [],
    execute: [`e-ext-sub${sub}-execute`],
    explain: [`e-ext-sub${sub}-explain`, `e-ext-trace-sub${sub}-explain`],
  },
});

const MIN_STAGE_DWELL_MS = 900;

export default function ArchitectureTab() {
  const [selected, setSelected] = useState<ExampleQuery | null>(null);
  const initial = useMemo(() => buildSingleLayout(), []);
  const [nodes, setNodes] = useState<Node<PipelineNodeData>[]>(initial.nodes);
  const [edges, setEdges] = useState<Edge[]>(initial.edges);
  const [detail, setDetail] = useState<DetailState>(EMPTY_DETAIL);
  const [running, setRunning] = useState(false);
  const stageStartedAt = useRef<Record<string, number>>({});

  const reset = useCallback(() => {
    const fresh = buildSingleLayout();
    setNodes(fresh.nodes);
    setEdges(fresh.edges);
    setDetail(EMPTY_DETAIL);
    setSelected(null);
  }, []);

  const activateStage = useCallback((sub: number, stage: string) => {
    const nodeId = nodeIdFor(stage, sub);
    const map = EDGE_NAMES(sub);
    stageStartedAt.current[`${sub}-${stage}`] = Date.now();
    setNodes((prev) => {
      let next = updateNode(prev, "query", { status: "done" });
      const dec = next.find((n) => n.id === "decompose");
      if (dec?.data.status === "idle" || dec?.data.status === "active") {
        next = updateNode(next, "decompose", { status: "done" });
      }
      next = updateNode(next, nodeId, { status: "active" });
      if (stage === "understand" || stage === "generate" || stage === "explain") {
        next = updateNode(next, "openai", { status: "active" });
      }
      if (stage === "execute") {
        next = updateNode(next, "postgres", { status: "active" });
      }
      return next;
    });
    setEdges((prev) => {
      let next = setEdgeStyle(prev, "e-query-decompose", false, false, true);
      const preEdgeId = (map.pre as Record<string, string>)[stage];
      if (preEdgeId) next = setEdgeStyle(next, preEdgeId, true);
      const extEdges = (map.ext as Record<string, string[]>)[stage] ?? [];
      for (const e of extEdges) next = setEdgeStyle(next, e, true, true);
      return next;
    });
  }, []);

  const completeStage = useCallback((sub: number, stage: string) => {
    const nodeId = nodeIdFor(stage, sub);
    const map = EDGE_NAMES(sub);
    const applyDone = () => {
      setNodes((prev) => {
        let next = updateNode(prev, nodeId, { status: "done" });
        if (stage === "understand" || stage === "generate" || stage === "explain") {
          next = updateNode(next, "openai", { status: "done" });
        }
        if (stage === "execute") {
          next = updateNode(next, "postgres", { status: "done" });
        }
        return next;
      });
      setEdges((prev) => {
        let next = prev;
        const preEdgeId = (map.pre as Record<string, string>)[stage];
        if (preEdgeId) next = setEdgeStyle(next, preEdgeId, false, false, true);
        const extEdges = (map.ext as Record<string, string[]>)[stage] ?? [];
        for (const e of extEdges) next = setEdgeStyle(next, e, false, true, true);
        return next;
      });
    };
    const startedAt = stageStartedAt.current[`${sub}-${stage}`];
    const elapsed = startedAt ? Date.now() - startedAt : MIN_STAGE_DWELL_MS;
    const wait = Math.max(0, MIN_STAGE_DWELL_MS - elapsed);
    if (wait === 0) {
      applyDone();
    } else {
      setTimeout(applyDone, wait);
    }
  }, []);

  const runQuery = useCallback(
    async (q: ExampleQuery) => {
      if (running) return;
      stageStartedAt.current = {};
      const fresh = buildSingleLayout();
      setNodes(fresh.nodes);
      setEdges(fresh.edges);
      setDetail({ parentQuestion: q.question, perSub: { 0: { question: q.question } }, status: "running" });
      setSelected(q);
      setRunning(true);

      setNodes((prev) => updateNode(prev, "query", { status: "active", detail: q.question }));

      // Track sub-count. Default 1 (single). Switches on parent_start.
      let subCount = 1;

      try {
        for await (const ev of streamQuery(API_BASE_URL, q.question)) {
          if (ev.type === "parent_start") {
            subCount = ev.subquestions.length;
            const multi = buildMultiLayout(subCount);
            setNodes(multi.nodes);
            setEdges(multi.edges);
            // Reactivate query + decompose in the fresh layout
            setNodes((prev) => {
              let next = updateNode(prev, "query", { status: "done", detail: q.question });
              next = updateNode(next, "decompose", {
                status: "active",
                detail: `${subCount} parallel subs`,
              });
              return next;
            });
            setEdges((prev) => setEdgeStyle(prev, "e-query-decompose", false, false, true));
            setDetail({
              parentQuestion: q.question,
              subquestions: ev.subquestions,
              perSub: Object.fromEntries(ev.subquestions.map((sq, i) => [i, { question: sq }])),
              status: "running",
            });
          } else if (ev.type === "stage_start") {
            const sub = ev.sub ?? 0;
            activateStage(sub, ev.stage);
          } else if (ev.type === "stage_end") {
            const sub = ev.sub ?? 0;
            completeStage(sub, ev.stage);
          } else if (ev.type === "explain_token") {
            const sub = ev.sub ?? 0;
            setDetail((d) => ({
              ...d,
              perSub: {
                ...d.perSub,
                [sub]: {
                  ...(d.perSub[sub] ?? {}),
                  answer: (d.perSub[sub]?.answer ?? "") + ev.token,
                },
              },
            }));
          } else if (ev.type === "sub_done") {
            const p = ev.payload as Record<string, unknown>;
            const sub = ev.sub;
            const intent = (p.intent_type as string | null) ?? undefined;
            const isRefuse = intent && intent !== "query";
            setDetail((d) => ({
              ...d,
              perSub: {
                ...d.perSub,
                [sub]: {
                  ...(d.perSub[sub] ?? {}),
                  intentType: intent,
                  blockReason: (p.block_reason as string | null) ?? undefined,
                  sql: (p.sql as string | null) ?? undefined,
                  rowCount: (p.total_row_count as number | null) ?? undefined,
                  overflow: (p.overflow as boolean) ?? false,
                  attemptCount: (p.attempt_count as number) ?? 1,
                  answer: (p.answer as string) ?? d.perSub[sub]?.answer,
                },
              },
              traceUrl: (p.trace_url as string | null) ?? d.traceUrl,
            }));
            // If refuse, mark middle nodes as skipped, activate refuse edge
            if (isRefuse) {
              setNodes((prev) => {
                let next = prev;
                for (const s of ["generate", "validate", "execute"]) {
                  next = updateNode(next, nodeIdFor(s, sub), { status: "skipped" });
                }
                return next;
              });
              setEdges((prev) => revealHiddenEdge(prev, `e-sub${sub}-refuse`, "refuse"));
            }
            if (((p.attempt_count as number) ?? 1) > 1) {
              setEdges((prev) => revealHiddenEdge(prev, `e-sub${sub}-retry-execute`, "retry"));
            }
            // Enrich node details inline
            setNodes((prev) => {
              let next = prev;
              const understandDetail = intent ? `intent: ${intent}` : undefined;
              if (understandDetail) {
                next = updateNode(next, nodeIdFor("understand", sub), { detail: understandDetail });
              }
              const rowCount = (p.total_row_count as number | null) ?? undefined;
              if (rowCount != null) {
                const overflow = (p.overflow as boolean) ?? false;
                next = updateNode(next, nodeIdFor("execute", sub), {
                  detail: `${rowCount} rows${overflow ? " (overflow)" : ""}`,
                });
              }
              const sql = (p.sql as string | null) ?? undefined;
              if (sql) {
                const preview = sql.length > 40 ? sql.slice(0, 37) + "…" : sql;
                next = updateNode(next, nodeIdFor("generate", sub), { detail: preview });
              }
              return next;
            });
          } else if (ev.type === "done") {
            const p = ev.payload as Record<string, unknown>;
            const isMulti = Array.isArray(p.blocks);

            if (!isMulti) {
              const intent = (p.intent_type as string | null) ?? undefined;
              const isRefuse = intent && intent !== "query";

              setDetail((d) => ({
                ...d,
                perSub: {
                  ...d.perSub,
                  0: {
                    ...(d.perSub[0] ?? {}),
                    intentType: intent,
                    blockReason: (p.block_reason as string | null) ?? undefined,
                    sql: (p.sql as string | null) ?? undefined,
                    rowCount: (p.total_row_count as number | null) ?? undefined,
                    overflow: (p.overflow as boolean) ?? false,
                    attemptCount: (p.attempt_count as number) ?? 1,
                    answer: (p.answer as string) ?? d.perSub[0]?.answer,
                  },
                },
                stageTimings: (p.stage_timings as Record<string, number>) ?? d.stageTimings,
                traceUrl: (p.trace_url as string | null) ?? d.traceUrl,
                finalAnswer: (p.answer as string) ?? undefined,
                status: p.error ? "error" : "done",
              }));

              if (isRefuse) {
                setNodes((prev) => {
                  let next = prev;
                  for (const s of ["generate", "validate", "execute"]) {
                    next = updateNode(next, nodeIdFor(s, 0), { status: "skipped" });
                  }
                  next = updateNode(next, nodeIdFor("explain", 0), { status: "done" });
                  next = updateNode(next, "response", { status: "done", detail: intent });
                  next = updateNode(next, "mongo", { status: "done" });
                  next = updateNode(next, "trace", { status: "done" });
                  next = updateNode(next, nodeIdFor("understand", 0), { detail: `intent: ${intent}` });
                  return next;
                });
                setEdges((prev) => {
                  let next = revealHiddenEdge(prev, "e-sub0-refuse", "refuse");
                  next = setEdgeStyle(next, "e-sub0-explain-response", false, false, true);
                  next = setEdgeStyle(next, "e-ext-response-mongo", false, true, true);
                  return next;
                });
              } else {
                setNodes((prev) => {
                  let next = updateNode(prev, "response", { status: "done" });
                  next = updateNode(next, "mongo", { status: "done" });
                  next = updateNode(next, "trace", { status: "done" });
                  if (intent) next = updateNode(next, nodeIdFor("understand", 0), { detail: `intent: ${intent}` });
                  const rowCount = (p.total_row_count as number | null) ?? undefined;
                  if (rowCount != null) {
                    const overflow = (p.overflow as boolean) ?? false;
                    next = updateNode(next, nodeIdFor("execute", 0), {
                      detail: `${rowCount} rows${overflow ? " (overflow)" : ""}`,
                    });
                  }
                  const sql = (p.sql as string | null) ?? undefined;
                  if (sql) {
                    const preview = sql.length > 40 ? sql.slice(0, 37) + "…" : sql;
                    next = updateNode(next, nodeIdFor("generate", 0), { detail: preview });
                  }
                  return next;
                });
                setEdges((prev) => {
                  let next = setEdgeStyle(prev, "e-sub0-explain-response", false, false, true);
                  next = setEdgeStyle(next, "e-ext-response-mongo", false, true, true);
                  return next;
                });

                if (((p.attempt_count as number) ?? 1) > 1) {
                  setEdges((prev) => revealHiddenEdge(prev, "e-sub0-retry-execute", "retry"));
                }
              }
            } else {
              // Multi: mark response + externals done, edges to response
              setNodes((prev) => {
                let next = updateNode(prev, "response", { status: "done" });
                next = updateNode(next, "mongo", { status: "done" });
                next = updateNode(next, "trace", { status: "done" });
                return next;
              });
              setEdges((prev) => {
                let next = prev;
                for (let s = 0; s < subCount; s++) {
                  next = setEdgeStyle(next, `e-sub${s}-explain-response`, false, false, true);
                }
                next = setEdgeStyle(next, "e-ext-response-mongo", false, true, true);
                return next;
              });
              setDetail((d) => ({ ...d, status: "done" }));
            }
          } else if (ev.type === "error") {
            setDetail((d) => ({ ...d, status: "error" }));
          }
        }
      } catch (err) {
        setDetail((d) => ({ ...d, status: "error", finalAnswer: err instanceof Error ? err.message : "stream failed" }));
      } finally {
        setRunning(false);
        // If decompose stayed idle (single-shot no parent_start), mark it as skipped
        setNodes((prev) => {
          const dec = prev.find((n) => n.id === "decompose");
          if (dec?.data.status === "idle") {
            return updateNode(prev, "decompose", { status: "skipped" });
          }
          return prev;
        });
      }
    },
    [running, activateStage, completeStage],
  );

  const rfNodes = useMemo(() => nodes, [nodes]);
  const rfEdges = useMemo(() => edges, [edges]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="text-xl font-semibold text-slate-100">Interactive architecture</h2>
        <p className="mt-1 text-sm text-slate-400">
          Pick an example query and watch the real pipeline flow through the system — every node
          lights up as its actual backend event arrives via SSE.
        </p>
      </div>

      <QuerySelector selected={selected} disabled={running} onPick={runQuery} onReset={reset} />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_400px]">
        <div className="h-[760px] overflow-hidden rounded-xl border border-slate-800 bg-slate-950/60">
          <ReactFlowProvider>
            <ReactFlow
              nodes={rfNodes}
              edges={rfEdges}
              nodeTypes={NODE_TYPES}
              nodesDraggable={false}
              nodesConnectable={false}
              zoomOnScroll={false}
              panOnScroll
              fitView
              fitViewOptions={{ padding: 0.15 }}
              proOptions={{ hideAttribution: true }}
            >
              <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#1e293b" />
              <Controls showInteractive={false} />
            </ReactFlow>
          </ReactFlowProvider>
        </div>

        <DetailPanel detail={detail} />
      </div>
    </div>
  );
}

function QuerySelector({
  selected,
  disabled,
  onPick,
  onReset,
}: {
  selected: ExampleQuery | null;
  disabled: boolean;
  onPick: (q: ExampleQuery) => void;
  onReset: () => void;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
          Choose an example query
        </span>
        {selected && !disabled && (
          <button
            type="button"
            onClick={onReset}
            className="font-mono text-[10px] uppercase tracking-widest text-slate-500 hover:text-slate-300"
          >
            reset
          </button>
        )}
      </div>
      <div className="flex flex-col gap-3">
        {EXAMPLE_QUERIES.map((group) => (
          <div key={group.group}>
            <div className="mb-1.5 font-mono text-[9px] uppercase tracking-widest text-slate-600">
              {group.group}
            </div>
            <div className="flex flex-wrap gap-2">
              {group.items.map((q) => {
                const active = selected?.id === q.id;
                return (
                  <button
                    key={q.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => onPick(q)}
                    title={q.question}
                    className={`rounded-full border px-3 py-1 font-mono text-[11px] transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-40 ${
                      active
                        ? "border-sky-500 bg-sky-950/60 text-sky-200"
                        : "border-slate-800 bg-slate-900 text-slate-400 hover:-translate-y-px hover:border-slate-600 hover:bg-slate-800/70 hover:text-slate-100"
                    }`}
                  >
                    {q.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DetailPanel({ detail }: { detail: DetailState }) {
  const isIdle = detail.status === "idle";
  const subs = Object.keys(detail.perSub)
    .map(Number)
    .sort((a, b) => a - b);

  return (
    <div className="flex h-[760px] flex-col gap-3 overflow-y-auto rounded-xl border border-slate-800 bg-slate-900/60 p-5">
      {isIdle ? (
        <div className="flex flex-1 items-center justify-center text-center">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-slate-600">detail panel</p>
            <p className="mt-2 text-sm text-slate-500">Pick a query to see it flow through.</p>
          </div>
        </div>
      ) : (
        <>
          {detail.parentQuestion && (
            <Section label={detail.subquestions ? "Parent question" : "Question"}>
              <p className="text-sm text-slate-200">{detail.parentQuestion}</p>
            </Section>
          )}

          {detail.subquestions && (
            <Section label={`Decomposed into ${detail.subquestions.length} sub-questions`}>
              <ol className="list-decimal space-y-1 pl-5 text-[13px] text-slate-300">
                {detail.subquestions.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
            </Section>
          )}

          {subs.map((s) => (
            <SubDetail key={s} index={s} totalSubs={subs.length} sub={detail.perSub[s]} />
          ))}

          {detail.stageTimings && (
            <Section label="Per-stage timings">
              <div className="grid grid-cols-2 gap-1 font-mono text-[11px] text-slate-400">
                {Object.entries(detail.stageTimings).map(([stage, ms]) => (
                  <div key={stage} className="flex justify-between">
                    <span>{stage}</span>
                    <span className="text-slate-300">{ms} ms</span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {detail.traceUrl && (
            <div className="pt-2">
              <a
                href={detail.traceUrl}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-[11px] text-sky-400 hover:text-sky-300"
              >
                View full trace in Langfuse ↗
              </a>
            </div>
          )}

          {detail.status === "running" && (
            <div className="mt-auto flex items-center gap-2 border-t border-slate-800 pt-3 text-[11px] text-sky-400">
              <span className="h-1.5 w-1.5 rounded-full bg-sky-400 shadow-[0_0_6px_rgb(56_189_248/0.8)] animate-pulse" />
              <span className="font-mono uppercase tracking-widest">streaming…</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SubDetail({
  index,
  totalSubs,
  sub,
}: {
  index: number;
  totalSubs: number;
  sub: PerSubDetail;
}) {
  const showHeader = totalSubs > 1;
  const intent = sub.intentType;
  return (
    <div className={showHeader ? "rounded-lg border border-slate-800/60 bg-slate-950/40 p-3" : ""}>
      {showHeader && (
        <div className="mb-2 flex items-center gap-2">
          <span className="rounded-full border border-sky-800/60 bg-sky-950/50 px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest text-sky-400">
            #{index + 1}
          </span>
          {sub.question && <span className="truncate text-xs text-slate-400">{sub.question}</span>}
        </div>
      )}

      {intent && (
        <div className="mb-2">
          <span
            className={`inline-block rounded-full border px-2 py-0.5 font-mono text-[11px] ${
              intent === "query"
                ? "border-emerald-800/60 bg-emerald-950/50 text-emerald-300"
                : "border-amber-800/60 bg-amber-950/50 text-amber-300"
            }`}
          >
            {intent}
          </span>
          {sub.blockReason && <p className="mt-1 text-xs text-slate-400">{sub.blockReason}</p>}
        </div>
      )}

      {sub.sql && (
        <details className="mb-2 rounded border border-slate-800 bg-slate-950">
          <summary className="cursor-pointer px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-slate-500 hover:text-slate-300">
            sql
          </summary>
          <pre className="overflow-x-auto border-t border-slate-800 p-2 font-mono text-[11px] leading-relaxed text-slate-300">
            {sub.sql}
          </pre>
        </details>
      )}

      {sub.rowCount != null && (
        <p className="mb-1 font-mono text-[11px] text-slate-400">
          {sub.rowCount} rows
          {sub.overflow ? " (overflow — sample shown)" : ""}
        </p>
      )}

      {sub.attemptCount != null && sub.attemptCount > 1 && (
        <p className="mb-1 font-mono text-[11px] text-amber-300">
          self-corrected after {sub.attemptCount} attempts
        </p>
      )}

      {sub.answer && (
        <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-slate-100">
          {sub.answer}
        </p>
      )}
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 font-mono text-[9px] uppercase tracking-widest text-slate-600">{label}</div>
      {children}
    </div>
  );
}
