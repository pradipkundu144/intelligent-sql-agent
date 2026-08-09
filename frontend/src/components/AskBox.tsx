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
    <div className="border-t border-slate-200 bg-white">
      <div className="mx-auto max-w-3xl px-4 py-4">
        <div className="mb-3 flex flex-wrap gap-2">
          {examples.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => !disabled && setValue(q)}
              disabled={disabled}
              className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600 hover:bg-slate-100 disabled:opacity-50"
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
            placeholder="Ask a question…"
            disabled={disabled}
            className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 disabled:bg-slate-100"
          />
          <button
            type="submit"
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:bg-slate-400"
            disabled={!value.trim() || disabled}
          >
            Ask
          </button>
        </form>
      </div>
    </div>
  );
}
