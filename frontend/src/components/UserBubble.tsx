type Props = {
  question: string;
};

export default function UserBubble({ question }: Props) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[80%] rounded-2xl rounded-br-md border border-slate-800 bg-slate-800/60 px-4 py-2.5 text-[15px] text-slate-100 shadow-sm">
        {question}
      </div>
    </div>
  );
}
