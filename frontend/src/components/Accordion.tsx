import { useState, type ReactNode } from "react";

type Props = {
  summary: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
};

export default function Accordion({ summary, children, defaultOpen = false }: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full cursor-pointer items-center gap-2 rounded font-mono text-[11px] text-slate-400 hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
      >
        <span
          className="inline-block text-slate-600 transition-transform"
          style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)" }}
        >
          ›
        </span>
        {summary}
      </button>
      <div
        className="grid transition-[grid-template-rows] duration-[280ms] ease-out"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <div className="mt-2">{children}</div>
        </div>
      </div>
    </div>
  );
}
