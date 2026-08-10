import { useEffect, useRef, useState } from "react";

type ExampleGroup = { label: string; items: string[] };

type Props = {
  inlineExamples: string[];
  extraGroups: ExampleGroup[];
  onSubmit: (question: string) => void;
  disabled?: boolean;
};

export default function AskBox({ inlineExamples, extraGroups, onSubmit, disabled }: Props) {
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const submit = () => {
    const q = value.trim();
    if (!q || disabled) return;
    onSubmit(q);
    setValue("");
  };

  const pickExample = (q: string) => {
    if (disabled) return;
    setOpen(false);
    setValue("");
    onSubmit(q);
  };

  return (
    <div className="border-t border-slate-800 bg-slate-950">
      <div className="mx-auto max-w-3xl px-4 py-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {inlineExamples.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => pickExample(q)}
              disabled={disabled}
              className="rounded-full border border-slate-800 bg-slate-900 px-3 py-1 font-mono text-[11px] text-slate-400 transition-all duration-150 hover:-translate-y-px hover:border-slate-600 hover:bg-slate-800/70 hover:text-slate-100 active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0"
            >
              {q}
            </button>
          ))}
          {extraGroups.length > 0 && (
            <div ref={wrapperRef} className="relative">
              <button
                type="button"
                onClick={() => !disabled && setOpen((v) => !v)}
                disabled={disabled}
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-800 bg-slate-900 px-3 py-1 font-mono text-[11px] text-slate-400 transition-all duration-150 hover:border-slate-600 hover:bg-slate-800/70 hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 disabled:cursor-not-allowed disabled:opacity-40"
                aria-haspopup="listbox"
                aria-expanded={open}
              >
                Try more
                <span
                  className="inline-block transition-transform"
                  style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
                >
                  ▾
                </span>
              </button>
              {open && (
                <div
                  role="listbox"
                  className="absolute bottom-full left-0 z-20 mb-2 w-[min(30rem,calc(100vw-2rem))] overflow-hidden rounded-lg border border-slate-800 bg-slate-950/95 shadow-2xl backdrop-blur-md animate-[fadeIn_180ms_ease-out]"
                >
                  {extraGroups.map((group, gi) => (
                    <div
                      key={group.label}
                      className={gi > 0 ? "border-t border-slate-800" : ""}
                    >
                      <div className="px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-slate-600">
                        {group.label}
                      </div>
                      {group.items.map((q) => (
                        <button
                          key={q}
                          type="button"
                          onClick={() => pickExample(q)}
                          className="block w-full px-3 py-2 text-left text-[13px] text-slate-300 transition-colors hover:bg-slate-800/70 hover:text-slate-100 focus-visible:bg-slate-800/70 focus-visible:text-slate-100 focus-visible:outline-none"
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
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
