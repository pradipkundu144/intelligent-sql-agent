import { useEffect, useRef, useState } from "react";

type Row = Record<string, unknown>;

type Props = {
  rows: Row[];
  overflow: boolean;
};

const STAGGER_MAX = 10;
const STAGGER_MS = 30;

export default function RowsTable({ rows, overflow }: Props) {
  const ref = useRef<HTMLTableSectionElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!ref.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { threshold: 0.05 },
    );
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  const displayRows = rows.slice(0, 20);
  const columns = Object.keys(rows[0]);

  return (
    <div className="overflow-x-auto rounded border border-slate-800">
      <table className="w-full text-xs">
        <thead className="bg-slate-950/60 font-mono text-[10px] uppercase tracking-widest text-slate-500">
          <tr>
            {columns.map((col) => (
              <th
                key={col}
                className="border-b border-slate-800 px-3 py-2 text-left font-medium"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody ref={ref} className="font-mono text-[12px]">
          {displayRows.map((row, i) => {
            const delay = Math.min(i, STAGGER_MAX) * STAGGER_MS;
            return (
              <tr
                key={i}
                className="odd:bg-slate-900 even:bg-slate-900/40 transition-colors hover:bg-slate-800/60"
                style={{
                  opacity: visible ? 1 : 0,
                  transform: visible ? "translateY(0)" : "translateY(4px)",
                  transition: `opacity 320ms ease-out ${delay}ms, transform 320ms ease-out ${delay}ms`,
                }}
              >
                {Object.values(row).map((val, j) => (
                  <td
                    key={j}
                    className="border-b border-slate-900 px-3 py-1.5 text-slate-300"
                  >
                    {String(val)}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      {!overflow && rows.length > 20 && (
        <p className="p-2 font-mono text-[11px] text-slate-500">
          Showing first 20 of {rows.length} rows.
        </p>
      )}
    </div>
  );
}
