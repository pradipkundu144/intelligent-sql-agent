export type StreamEvent =
  | { type: "stage_start"; stage: string; t: number }
  | { type: "stage_end"; stage: string; t: number }
  | { type: "explain_token"; token: string }
  | { type: "done"; payload: Record<string, unknown> }
  | { type: "error"; message: string };

export async function* streamQuery(
  baseUrl: string,
  question: string,
): AsyncGenerator<StreamEvent, void, unknown> {
  const response = await fetch(`${baseUrl}/query/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
  });

  if (!response.ok || !response.body) {
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

      // SSE frames are separated by \n\n
      let sepIndex: number;
      while ((sepIndex = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0, sepIndex);
        buffer = buffer.slice(sepIndex + 2);
        const line = frame.split("\n").find((l) => l.startsWith("data: "));
        if (!line) continue;
        const jsonStr = line.slice(6);
        try {
          const event = JSON.parse(jsonStr) as StreamEvent;
          yield event;
        } catch {
          // ignore malformed frames
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
