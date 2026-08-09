import { useState } from "react";

type Props = {
  examples: string[];
  onSubmit: (question: string) => void;
  disabled?: boolean;
};

export default function AskBox({ examples, onSubmit, disabled }: Props) {
  const [value, setValue] = useState("");

  const submit = () => {
    const q = value.trim();
    if (!q || disabled) return;
    onSubmit(q);
    setValue("");
  };

  return (
    <div className="border-t border-slate-800 bg-slate-950">
      <div className="mx-auto max-w-3xl px-4 py-4">
        <div className="mb-3 flex flex-wrap gap-2">
          {examples.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => !disabled && setValue(q)}
              disabled={disabled}
              className="rounded-full border border-slate-800 bg-slate-900 px-3 py-1 font-mono text-[11px] text-slate-400 transition-all duration-150 hover:-translate-y-px hover:border-slate-600 hover:bg-slate-800/70 hover:text-slate-100 active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0"
            >
              {q}
            </button>
          ))}
        </div>
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Ask a question about the shop data…"
            disabled={disabled}
            className="flex-1 rounded-lg border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 caret-emerald-500 transition-colors focus:border-emerald-600/60 focus:outline-none focus:ring-1 focus:ring-emerald-600/40 disabled:opacity-50"
          />
          <button
            type="submit"
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-[0_0_0_1px_rgb(34_197_94/0.4)] transition-all duration-150 hover:bg-emerald-500 hover:shadow-[0_0_0_1px_rgb(34_197_94/0.6),0_0_16px_rgb(34_197_94/0.35)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 disabled:cursor-not-allowed disabled:bg-slate-800 disabled:text-slate-500 disabled:shadow-none disabled:active:scale-100"
            disabled={!value.trim() || disabled}
          >
            Ask
          </button>
        </form>
      </div>
    </div>
  );
}
