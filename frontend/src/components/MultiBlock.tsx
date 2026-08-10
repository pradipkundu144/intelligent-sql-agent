import AnswerCard, { type SubBlock, type Turn } from "./AnswerCard";
import ProgressPill from "./ProgressPill";

type Props = {
  parentQuestion: string;
  blocks: SubBlock[];
};

function subBlockToTurn(sub: SubBlock): Turn {
  return { ...sub, loading: sub.loading ?? false };
}

export default function MultiBlock({ parentQuestion: _parentQuestion, blocks }: Props) {
  void _parentQuestion;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <span className="font-mono text-[10px] uppercase tracking-widest text-emerald-400">
          {blocks.length} questions
        </span>
        <span className="h-px flex-1 bg-slate-800" />
      </div>
      {blocks.map((sub, i) => (
        <div key={i} className="flex flex-col gap-2">
          <div className="flex items-start justify-between gap-3 pl-1">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
                #{i + 1}
              </span>
              <span className="text-[13px] text-slate-400">{sub.question}</span>
            </div>
            {sub.liveStages && sub.loading && (
              <div className="hidden lg:block shrink-0">
                <ProgressPill stages={sub.liveStages} done={!sub.loading} />
              </div>
            )}
          </div>
          <AnswerCard turn={subBlockToTurn(sub)} />
        </div>
      ))}
    </div>
  );
}
