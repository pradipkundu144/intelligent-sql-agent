const API_TOKEN = (import.meta.env.VITE_API_TOKEN as string | undefined) ?? "";

export function authHeaders(): Record<string, string> {
  return API_TOKEN ? { "X-API-Key": API_TOKEN } : {};
}
