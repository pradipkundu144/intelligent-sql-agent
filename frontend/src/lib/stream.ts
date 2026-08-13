import { authHeaders } from "./api";

export type StreamEvent =
  | { type: "parent_start"; parent_question: string; subquestions: string[]; t: number }
  | { type: "stage_start"; stage: string; t: number; sub?: number }
  | { type: "stage_end"; stage: string; t: number; sub?: number }
  | { type: "explain_token"; token: string; sub?: number }
  | { type: "sub_done"; sub: number; payload: Record<string, unknown> }
  | { type: "done"; payload: Record<string, unknown> }
  | { type: "error"; message: string };

async function friendlyError(response: Response): Promise<string> {
  if (response.status === 429) {
    return "You've reached the request limit for now. Please wait a few minutes before asking another question.";
  }
  if (response.status === 503) {
    return "The service is temporarily unavailable. Please check back in a bit.";
  }
  if (response.status === 401) {
    return "Session couldn't be authorised. Try refreshing the page.";
  }
  try {
    const body = await response.json();
    if (body?.detail) return String(body.detail);
  } catch {
    // response body not JSON — fall through
  }
  return `Something went wrong (HTTP ${response.status}). Please try again.`;
}

export async function* streamQuery(
  baseUrl: string,
  question: string,
): AsyncGenerator<StreamEvent, void, unknown> {
  const response = await fetch(`${baseUrl}/query/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ question }),
  });

  if (!response.ok || !response.body) {
    throw new Error(await friendlyError(response));
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
