import { Handle, Position, type NodeProps } from "reactflow";
import type { PipelineNodeData } from "./flow";

function statusStyles(status: string, kind: string) {
  const base = "rounded-xl border transition-all duration-300";
  if (kind === "external") {
    if (status === "active") return `${base} border-sky-400/70 bg-slate-950 shadow-[0_0_20px_rgb(56_189_248/0.5)]`;
    if (status === "done") return `${base} border-sky-800/60 bg-slate-950/80`;
    return `${base} border-slate-800 bg-slate-950/40 opacity-70`;
  }
  if (kind === "io") {
    if (status === "active") return `${base} border-sky-400/80 bg-slate-900 shadow-[0_0_24px_rgb(56_189_248/0.5)]`;
    if (status === "done") return `${base} border-emerald-600/70 bg-emerald-950/40 shadow-[0_0_12px_rgb(16_185_129/0.3)]`;
    return `${base} border-slate-800 bg-slate-900/60`;
  }
  // pipeline
  if (status === "active") return `${base} border-sky-400 bg-slate-900 shadow-[0_0_24px_rgb(56_189_248/0.5)] animate-pulse`;
  if (status === "done") return `${base} border-emerald-600/70 bg-slate-900 shadow-[0_0_12px_rgb(16_185_129/0.25)]`;
  if (status === "skipped") return `${base} border-slate-800/60 bg-slate-950/40 opacity-30`;
  if (status === "retry") return `${base} border-amber-500 bg-amber-950/30 shadow-[0_0_20px_rgb(245_158_11/0.6)]`;
  return `${base} border-slate-800 bg-slate-900/70`;
}

function statusDot(status: string) {
  if (status === "active") return "bg-sky-400 shadow-[0_0_8px_rgb(56_189_248/0.9)] animate-pulse";
  if (status === "done") return "bg-emerald-500";
  if (status === "retry") return "bg-amber-500 animate-pulse";
  if (status === "skipped") return "bg-slate-800";
  return "bg-slate-700";
}

export default function PipelineNode({ data }: NodeProps<PipelineNodeData>) {
  const isExternal = data.kind === "external";
  const isIO = data.kind === "io";

  return (
    <div className={`${statusStyles(data.status, data.kind)} min-w-[140px] px-4 py-2.5`}>
      <Handle
        type="target"
        position={Position.Top}
        style={{ background: "transparent", border: "none", top: -3 }}
      />
      <Handle
        type="target"
        position={Position.Left}
        style={{ background: "transparent", border: "none", left: -3 }}
      />
      <Handle
        type="target"
        position={Position.Right}
        style={{ background: "transparent", border: "none", right: -3 }}
      />

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusDot(data.status)}`} />
          <span
            className={`font-mono text-[11px] font-medium tracking-wide ${
              data.status === "skipped" ? "text-slate-600" : "text-slate-100"
            }`}
          >
            {data.label}
          </span>
        </div>
        {data.status === "active" && !isExternal && (
          <span className="font-mono text-[9px] uppercase tracking-widest text-sky-400">running</span>
        )}
        {data.status === "done" && !isExternal && !isIO && (
          <span className="font-mono text-[9px] uppercase tracking-widest text-emerald-500">✓</span>
        )}
      </div>
      {data.sublabel && (
        <div
          className={`mt-0.5 font-mono text-[9px] ${
            data.status === "skipped" ? "text-slate-700" : "text-slate-500"
          }`}
        >
          {data.sublabel}
        </div>
      )}
      {data.detail && (
        <div className="mt-1.5 max-w-[200px] font-mono text-[10px] leading-snug text-sky-300">
          {data.detail}
        </div>
      )}

      <Handle
        type="source"
        position={Position.Bottom}
        style={{ background: "transparent", border: "none", bottom: -3 }}
      />
      <Handle
        type="source"
        position={Position.Left}
        style={{ background: "transparent", border: "none", left: -3 }}
      />
      <Handle
        type="source"
        position={Position.Right}
        style={{ background: "transparent", border: "none", right: -3 }}
      />
    </div>
  );
}
