import { useState } from "react";
import Header from "./components/Header";
import AskBox from "./components/AskBox";
import AnswerCard, { type Turn } from "./components/AnswerCard";

const EXAMPLE_QUESTIONS = [
  "How many customers are there?",
  "Revenue by month",
  "Find repeat customers",
];

const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  "http://localhost:8000";

export default function App() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const anyLoading = turns.some((t) => t.loading);

  const handleSubmit = async (question: string) => {
    const index = turns.length;
    setTurns((prev) => [...prev, { question, loading: true }]);

    try {
      const res = await fetch(`${API_BASE_URL}/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      setTurns((prev) =>
        prev.map((t, i) =>
          i === index
            ? {
                question,
                loading: false,
                answer: data.answer,
                sql: data.sql,
                rows: data.rows,
                totalRowCount: data.total_row_count,
                overflow: data.overflow,
                error: data.error,
                intentType: data.intent_type,
                stageTimings: data.stage_timings,
              }
            : t
        )
      );
    } catch (err) {
      setTurns((prev) =>
        prev.map((t, i) =>
          i === index
            ? {
                question,
                loading: false,
                error: err instanceof Error ? err.message : "Request failed",
              }
            : t
        )
      );
    }
  };

  return (
    <div className="flex h-full flex-col">
      <Header />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 overflow-y-auto px-4 py-6">
        {turns.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center text-center text-slate-500">
            <p className="text-lg">Ask a question about the shop data.</p>
            <p className="mt-1 text-sm">
              Try one of the examples below, or type your own.
            </p>
          </div>
        ) : (
          turns.map((turn, i) => <AnswerCard key={i} turn={turn} />)
        )}
      </main>
      <AskBox
        examples={EXAMPLE_QUESTIONS}
        onSubmit={handleSubmit}
        disabled={anyLoading}
      />
    </div>
  );
}
