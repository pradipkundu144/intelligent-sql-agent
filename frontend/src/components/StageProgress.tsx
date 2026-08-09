export type StageStatus = "pending" | "running" | "done";

type Props = {
  stages: Record<string, { status: StageStatus; durationMs?: number }>;
};

const STAGE_LABELS: Record<string, string> = {
  understand: "Understanding your question…",
  generate: "Generating SQL…",
  validate: "Validating (guardrails)…",
  execute: "Running query…",
  explain: "Explaining results…",
};

const STAGE_ORDER = ["understand", "generate", "validate", "execute", "explain"];

const ICONS: Record<StageStatus, string> = {
  pending: "·",
  running: "⟳",
  done: "✓",
};

const ICON_CLASSES: Record<StageStatus, string> = {
  pending: "text-slate-300",
  running: "text-emerald-500 animate-pulse",
  done: "text-emerald-600",
};

export default function StageProgress({ stages }: Props) {
  return (
    <ul className="space-y-1 font-mono text-xs text-slate-700">
      {STAGE_ORDER.map((stage) => {
        const entry = stages[stage] ?? { status: "pending" as StageStatus };
        return (
          <li key={stage} className="flex items-center gap-2">
            <span className={`w-4 text-center ${ICON_CLASSES[entry.status]}`}>
              {ICONS[entry.status]}
            </span>
            <span className="flex-1">{STAGE_LABELS[stage]}</span>
            {entry.durationMs != null && (
              <span className="text-slate-400">{entry.durationMs} ms</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
