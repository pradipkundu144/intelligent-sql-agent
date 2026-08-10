export type EvalCase = {
  id: string;
  category?: string;
  question: string;
  passed: boolean;
  reason: string;
  sql?: string | null;
  row_count?: number | null;
  faithfulness?: number | null;
  answer_relevancy?: number | null;
};

export type EvalMetricSpec = { name: string; total: number };

export type EvalMetricEnd = {
  metric: string;
  passed: number;
  total: number;
  rate: number;
  faithfulness_mean?: number;
  answer_relevancy_mean?: number;
};

export type EvalEvent =
  | { type: "eval_start"; metrics: EvalMetricSpec[]; t: number }
  | { type: "metric_start"; metric: string; total: number; t: number }
  | { type: "case_end"; metric: string; case: EvalCase; t: number }
  | ({ type: "metric_end"; t: number } & EvalMetricEnd)
  | { type: "eval_end"; results: Record<string, unknown>; t: number }
  | { type: "error"; message: string };

export async function* streamEval(baseUrl: string): AsyncGenerator<EvalEvent, void, unknown> {
  const response = await fetch(`${baseUrl}/eval/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });

  if (!response.ok || !response.body) {
    if (response.status === 409) {
      throw new Error("Eval already running — wait for the current run to finish.");
    }
    throw new Error(`HTTP ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let sepIndex: number;
      while ((sepIndex = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, sepIndex);
        buffer = buffer.slice(sepIndex + 2);
        const line = frame.split("\n").find((l) => l.startsWith("data: "));
        if (!line) continue;
        try {
          const event = JSON.parse(line.slice(6)) as EvalEvent;
          yield event;
        } catch {
          // ignore malformed frame
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
