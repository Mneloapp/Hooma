import { supabase } from "./supabase";

const apiUrl = (process.env.EXPO_PUBLIC_API_URL ?? "https://hooma.ge").replace(/\/$/, "");

export function absoluteMediaUrl(value: string) {
  return value.startsWith("/") ? `${apiUrl}${value}` : value;
}

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    public readonly retryAfterSeconds?: number,
  ) {
    super(code);
  }
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { authenticated?: boolean; timeoutMs?: number } = {},
): Promise<T> {
  const { authenticated = false, timeoutMs = 15_000, ...requestOptions } = options;
  const headers = new Headers(requestOptions.headers);
  headers.set("Accept", "application/json");
  if (requestOptions.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (authenticated) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new ApiError("authentication_required", 401);
    headers.set("Authorization", `Bearer ${token}`);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${apiUrl}${path}`, {
      ...requestOptions,
      headers,
      signal: requestOptions.signal ?? controller.signal,
    });
    const payload = await response.json().catch(() => ({ ok: false, code: "invalid_response" }));
    if (!response.ok || payload?.ok === false) {
      throw new ApiError(
        payload?.code ?? "request_failed",
        response.status,
        Number(response.headers.get("retry-after") ?? 0) || undefined,
      );
    }
    return payload as T;
  } finally {
    clearTimeout(timeout);
  }
}
