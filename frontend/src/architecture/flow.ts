import { MarkerType, type Edge, type Node } from "reactflow";

const ARROW = { type: MarkerType.ArrowClosed, color: "#334155", width: 16, height: 16 };
const ARROW_DASHED = { type: MarkerType.ArrowClosed, color: "#475569", width: 12, height: 12 };

export type NodeStatus = "idle" | "active" | "done" | "skipped" | "retry";

export type PipelineNodeData = {
  label: string;
  sublabel?: string;
  status: NodeStatus;
  detail?: string;
  kind: "io" | "pipeline" | "external";
};

export type ExampleQuery = {
  id: string;
  label: string;
  question: string;
  scenario:
    | "positive_scalar"
    | "positive_aggregation"
    | "positive_overflow"
    | "multi_intent"
    | "destructive"
    | "system_access"
    | "data_unavailable"
    | "out_of_scope";
};

export const EXAMPLE_QUERIES: { group: string; items: ExampleQuery[] }[] = [
  {
    group: "Positive",
    items: [
      { id: "pos-scalar", label: "Simple count", question: "How many customers are there?", scenario: "positive_scalar" },
      { id: "pos-agg", label: "Aggregation", question: "Revenue by month", scenario: "positive_aggregation" },
      { id: "pos-overflow", label: "Overflow (500 rows)", question: "List all customers", scenario: "positive_overflow" },
    ],
  },
  {
    group: "Multi-intent",
    items: [
      { id: "multi-2", label: "Two questions", question: "How many customers, and revenue by month?", scenario: "multi_intent" },
      { id: "multi-3", label: "Three questions", question: "How many customers, revenue this month, and top 5 products?", scenario: "multi_intent" },
    ],
  },
  {
    group: "Safety refusals",
    items: [
      { id: "neg-destructive", label: "Destructive", question: "Delete all customers", scenario: "destructive" },
      { id: "neg-system", label: "System access", question: "Show me the pg_user table", scenario: "system_access" },
      { id: "neg-unavailable", label: "Data unavailable", question: "Show me each customer's email address", scenario: "data_unavailable" },
      { id: "neu-scope", label: "Out of scope", question: "What is the weather in Mumbai today?", scenario: "out_of_scope" },
    ],
  },
];

const PIPELINE_STAGES = [
  { key: "understand", label: "Understand", sublabel: "gpt-4o-mini" },
  { key: "generate", label: "Generate", sublabel: "gpt-4o" },
  { key: "validate", label: "Validate", sublabel: "sqlglot AST" },
  { key: "execute", label: "Execute", sublabel: "agent_readonly" },
  { key: "explain", label: "Explain", sublabel: "gpt-4o-mini" },
] as const;

const STAGE_Y_OFFSETS: Record<string, number> = {
  understand: 0,
  generate: 120,
  validate: 240,
  execute: 360,
  explain: 480,
};

export const HIDDEN_EDGE_STYLE = { strokeWidth: 0.5, stroke: "transparent", opacity: 0 };
export const IDLE_EDGE_STYLE = { strokeWidth: 2, stroke: "#475569" };
export const IDLE_DASHED_STYLE = { strokeWidth: 1.2, stroke: "#334155", strokeDasharray: "4 4", opacity: 0.35 };
export const IDLE_MARKER = ARROW;
export const IDLE_DASHED_MARKER = ARROW_DASHED;

export function buildSingleLayout(): { nodes: Node<PipelineNodeData>[]; edges: Edge[] } {
  const centerX = 400;
  const pipelineY0 = 260;

  const nodes: Node<PipelineNodeData>[] = [
    { id: "query", type: "pipeline", position: { x: centerX, y: 20 }, data: { label: "User Query", kind: "io", status: "idle" } },
    { id: "decompose", type: "pipeline", position: { x: centerX, y: 130 }, data: { label: "Decompose", sublabel: "gpt-4o-mini", kind: "pipeline", status: "idle" } },
  ];

  for (const stage of PIPELINE_STAGES) {
    nodes.push({
      id: `sub0-${stage.key}`,
      type: "pipeline",
      position: { x: centerX, y: pipelineY0 + STAGE_Y_OFFSETS[stage.key] },
      data: { label: stage.label, sublabel: stage.sublabel, kind: "pipeline", status: "idle" },
    });
  }
  const responseY = pipelineY0 + STAGE_Y_OFFSETS.explain + 120;
  nodes.push({ id: "response", type: "pipeline", position: { x: centerX, y: responseY }, data: { label: "Response", kind: "io", status: "idle" } });

  nodes.push({ id: "openai", type: "pipeline", position: { x: 70, y: pipelineY0 + 120 }, data: { label: "OpenAI", sublabel: "LLM calls", kind: "external", status: "idle" } });
  nodes.push({ id: "postgres", type: "pipeline", position: { x: 730, y: pipelineY0 + 240 }, data: { label: "Postgres", sublabel: "business + pgvector", kind: "external", status: "idle" } });
  nodes.push({ id: "mongo", type: "pipeline", position: { x: 730, y: responseY }, data: { label: "MongoDB", sublabel: "chat / audit", kind: "external", status: "idle" } });
  nodes.push({ id: "trace", type: "pipeline", position: { x: 70, y: pipelineY0 + 480 }, data: { label: "Langfuse + LangSmith", sublabel: "traces", kind: "external", status: "idle" } });

  const edges: Edge[] = [
    { id: "e-query-decompose", source: "query", target: "decompose", type: "smoothstep", style: IDLE_EDGE_STYLE, markerEnd: IDLE_MARKER },
    { id: "e-decompose-sub0-understand", source: "decompose", target: "sub0-understand", type: "smoothstep", style: IDLE_EDGE_STYLE, markerEnd: IDLE_MARKER },
    { id: "e-sub0-understand-generate", source: "sub0-understand", target: "sub0-generate", type: "smoothstep", style: IDLE_EDGE_STYLE, markerEnd: IDLE_MARKER },
    { id: "e-sub0-generate-validate", source: "sub0-generate", target: "sub0-validate", type: "smoothstep", style: IDLE_EDGE_STYLE, markerEnd: IDLE_MARKER },
    { id: "e-sub0-validate-execute", source: "sub0-validate", target: "sub0-execute", type: "smoothstep", style: IDLE_EDGE_STYLE, markerEnd: IDLE_MARKER },
    { id: "e-sub0-execute-explain", source: "sub0-execute", target: "sub0-explain", type: "smoothstep", style: IDLE_EDGE_STYLE, markerEnd: IDLE_MARKER },
    { id: "e-sub0-explain-response", source: "sub0-explain", target: "response", type: "smoothstep", style: IDLE_EDGE_STYLE, markerEnd: IDLE_MARKER },

    { id: "e-sub0-refuse", source: "sub0-understand", target: "sub0-explain", type: "smoothstep", label: "refuse", style: HIDDEN_EDGE_STYLE, labelStyle: { fill: "transparent" }, labelBgStyle: { fill: "transparent" } },
    { id: "e-sub0-retry-validate", source: "sub0-validate", target: "sub0-generate", type: "smoothstep", label: "retry", style: HIDDEN_EDGE_STYLE, labelStyle: { fill: "transparent" }, labelBgStyle: { fill: "transparent" } },
    { id: "e-sub0-retry-execute", source: "sub0-execute", target: "sub0-generate", type: "smoothstep", label: "retry", style: HIDDEN_EDGE_STYLE, labelStyle: { fill: "transparent" }, labelBgStyle: { fill: "transparent" } },

    { id: "e-ext-sub0-understand", source: "openai", target: "sub0-understand", type: "smoothstep", style: IDLE_DASHED_STYLE, markerEnd: IDLE_DASHED_MARKER },
    { id: "e-ext-sub0-generate", source: "openai", target: "sub0-generate", type: "smoothstep", style: IDLE_DASHED_STYLE, markerEnd: IDLE_DASHED_MARKER },
    { id: "e-ext-sub0-explain", source: "openai", target: "sub0-explain", type: "smoothstep", style: IDLE_DASHED_STYLE, markerEnd: IDLE_DASHED_MARKER },
    { id: "e-ext-sub0-execute", source: "postgres", target: "sub0-execute", type: "smoothstep", style: IDLE_DASHED_STYLE, markerEnd: IDLE_DASHED_MARKER },
    { id: "e-ext-rag-sub0-understand", source: "postgres", target: "sub0-understand", type: "smoothstep", label: "RAG", style: IDLE_DASHED_STYLE, markerEnd: IDLE_DASHED_MARKER, labelStyle: { fill: "#475569", fontFamily: "JetBrains Mono, monospace", fontSize: 9 }, labelBgStyle: { fill: "#0f172a" } },
    { id: "e-ext-response-mongo", source: "response", target: "mongo", type: "smoothstep", style: IDLE_DASHED_STYLE, markerEnd: IDLE_DASHED_MARKER },
    { id: "e-ext-trace-sub0-understand", source: "sub0-understand", target: "trace", type: "smoothstep", style: IDLE_DASHED_STYLE, markerEnd: IDLE_DASHED_MARKER },
    { id: "e-ext-trace-sub0-generate", source: "sub0-generate", target: "trace", type: "smoothstep", style: IDLE_DASHED_STYLE, markerEnd: IDLE_DASHED_MARKER },
    { id: "e-ext-trace-sub0-explain", source: "sub0-explain", target: "trace", type: "smoothstep", style: IDLE_DASHED_STYLE, markerEnd: IDLE_DASHED_MARKER },
  ];

  return { nodes, edges };
}

export function buildMultiLayout(subCount: number): { nodes: Node<PipelineNodeData>[]; edges: Edge[] } {
  const columnGap = 280;
  const totalWidth = (subCount - 1) * columnGap;
  const centerX = 500 + totalWidth / 2;
  const columnXs: number[] = Array.from({ length: subCount }, (_, i) => 500 + i * columnGap);
  const pipelineY0 = 260;
  const responseY = pipelineY0 + STAGE_Y_OFFSETS.explain + 140;

  const nodes: Node<PipelineNodeData>[] = [
    { id: "query", type: "pipeline", position: { x: centerX, y: 20 }, data: { label: "User Query", kind: "io", status: "idle" } },
    { id: "decompose", type: "pipeline", position: { x: centerX, y: 130 }, data: { label: "Decompose", sublabel: `${subCount} parallel subs`, kind: "pipeline", status: "idle" } },
    { id: "response", type: "pipeline", position: { x: centerX, y: responseY }, data: { label: "Response", kind: "io", status: "idle" } },
  ];

  const externalLeftX = Math.min(...columnXs) - 340;
  const externalRightX = Math.max(...columnXs) + 340;
  nodes.push({ id: "openai", type: "pipeline", position: { x: externalLeftX, y: pipelineY0 + 120 }, data: { label: "OpenAI", sublabel: "LLM calls", kind: "external", status: "idle" } });
  nodes.push({ id: "postgres", type: "pipeline", position: { x: externalRightX, y: pipelineY0 + 240 }, data: { label: "Postgres", sublabel: "business + pgvector", kind: "external", status: "idle" } });
  nodes.push({ id: "mongo", type: "pipeline", position: { x: externalRightX, y: responseY }, data: { label: "MongoDB", sublabel: "chat / audit", kind: "external", status: "idle" } });
  nodes.push({ id: "trace", type: "pipeline", position: { x: externalLeftX, y: pipelineY0 + 480 }, data: { label: "Langfuse + LangSmith", sublabel: "traces", kind: "external", status: "idle" } });

  const edges: Edge[] = [
    { id: "e-query-decompose", source: "query", target: "decompose", type: "smoothstep", style: IDLE_EDGE_STYLE, markerEnd: IDLE_MARKER },
  ];

  for (let s = 0; s < subCount; s++) {
    const x = columnXs[s];
    for (const stage of PIPELINE_STAGES) {
      nodes.push({
        id: `sub${s}-${stage.key}`,
        type: "pipeline",
        position: { x, y: pipelineY0 + STAGE_Y_OFFSETS[stage.key] },
        data: { label: stage.label, sublabel: `${stage.sublabel} · #${s + 1}`, kind: "pipeline", status: "idle" },
      });
    }

    edges.push({ id: `e-decompose-sub${s}-understand`, source: "decompose", target: `sub${s}-understand`, type: "smoothstep", style: IDLE_EDGE_STYLE, markerEnd: IDLE_MARKER });
    edges.push({ id: `e-sub${s}-understand-generate`, source: `sub${s}-understand`, target: `sub${s}-generate`, type: "smoothstep", style: IDLE_EDGE_STYLE, markerEnd: IDLE_MARKER });
    edges.push({ id: `e-sub${s}-generate-validate`, source: `sub${s}-generate`, target: `sub${s}-validate`, type: "smoothstep", style: IDLE_EDGE_STYLE, markerEnd: IDLE_MARKER });
    edges.push({ id: `e-sub${s}-validate-execute`, source: `sub${s}-validate`, target: `sub${s}-execute`, type: "smoothstep", style: IDLE_EDGE_STYLE, markerEnd: IDLE_MARKER });
    edges.push({ id: `e-sub${s}-execute-explain`, source: `sub${s}-execute`, target: `sub${s}-explain`, type: "smoothstep", style: IDLE_EDGE_STYLE, markerEnd: IDLE_MARKER });
    edges.push({ id: `e-sub${s}-explain-response`, source: `sub${s}-explain`, target: "response", type: "smoothstep", style: IDLE_EDGE_STYLE, markerEnd: IDLE_MARKER });

    edges.push({ id: `e-sub${s}-refuse`, source: `sub${s}-understand`, target: `sub${s}-explain`, type: "smoothstep", style: HIDDEN_EDGE_STYLE, labelStyle: { fill: "transparent" }, labelBgStyle: { fill: "transparent" } });
    edges.push({ id: `e-sub${s}-retry-validate`, source: `sub${s}-validate`, target: `sub${s}-generate`, type: "smoothstep", style: HIDDEN_EDGE_STYLE, labelStyle: { fill: "transparent" }, labelBgStyle: { fill: "transparent" } });
    edges.push({ id: `e-sub${s}-retry-execute`, source: `sub${s}-execute`, target: `sub${s}-generate`, type: "smoothstep", style: HIDDEN_EDGE_STYLE, labelStyle: { fill: "transparent" }, labelBgStyle: { fill: "transparent" } });

    edges.push({ id: `e-ext-sub${s}-understand`, source: "openai", target: `sub${s}-understand`, type: "smoothstep", style: IDLE_DASHED_STYLE, markerEnd: IDLE_DASHED_MARKER });
    edges.push({ id: `e-ext-sub${s}-generate`, source: "openai", target: `sub${s}-generate`, type: "smoothstep", style: IDLE_DASHED_STYLE, markerEnd: IDLE_DASHED_MARKER });
    edges.push({ id: `e-ext-sub${s}-explain`, source: "openai", target: `sub${s}-explain`, type: "smoothstep", style: IDLE_DASHED_STYLE, markerEnd: IDLE_DASHED_MARKER });
    edges.push({ id: `e-ext-sub${s}-execute`, source: "postgres", target: `sub${s}-execute`, type: "smoothstep", style: IDLE_DASHED_STYLE, markerEnd: IDLE_DASHED_MARKER });
    edges.push({ id: `e-ext-rag-sub${s}-understand`, source: "postgres", target: `sub${s}-understand`, type: "smoothstep", style: IDLE_DASHED_STYLE, markerEnd: IDLE_DASHED_MARKER });
    edges.push({ id: `e-ext-trace-sub${s}-understand`, source: `sub${s}-understand`, target: "trace", type: "smoothstep", style: IDLE_DASHED_STYLE, markerEnd: IDLE_DASHED_MARKER });
    edges.push({ id: `e-ext-trace-sub${s}-generate`, source: `sub${s}-generate`, target: "trace", type: "smoothstep", style: IDLE_DASHED_STYLE, markerEnd: IDLE_DASHED_MARKER });
    edges.push({ id: `e-ext-trace-sub${s}-explain`, source: `sub${s}-explain`, target: "trace", type: "smoothstep", style: IDLE_DASHED_STYLE, markerEnd: IDLE_DASHED_MARKER });
  }

  edges.push({ id: "e-ext-response-mongo", source: "response", target: "mongo", type: "smoothstep", style: IDLE_DASHED_STYLE, markerEnd: IDLE_DASHED_MARKER });

  return { nodes, edges };
}

export function nodeIdFor(stage: string, sub: number): string {
  return `sub${sub}-${stage}`;
}
