import { NextResponse } from "next/server";

export const MOBILE_API_VERSION = "1";
export const MAX_JSON_BODY_BYTES = 64 * 1024;

export function mobileJson(payload: unknown, status = 200, headers?: HeadersInit) {
  return NextResponse.json(payload, {
    status,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "X-Hooma-Mobile-API-Version": MOBILE_API_VERSION,
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
}

export async function readMobileJson(
  request: Request,
  maxBytes = MAX_JSON_BODY_BYTES,
): Promise<unknown> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new MobileApiError("invalid_content_type", 415);
  }
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > maxBytes) throw new MobileApiError("request_too_large", 413);

  const raw = await request.text();
  if (Buffer.byteLength(raw, "utf8") > maxBytes) {
    throw new MobileApiError("request_too_large", 413);
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new MobileApiError("invalid_json", 400);
  }
}

export class MobileApiError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    public readonly retryAfterSeconds?: number,
  ) {
    super(code);
  }
}

export function mobileError(error: unknown) {
  if (error instanceof MobileApiError) {
    return mobileJson(
      { ok: false, code: error.code },
      error.status,
      error.retryAfterSeconds
        ? { "Retry-After": String(error.retryAfterSeconds) }
        : undefined,
    );
  }
  return mobileJson({ ok: false, code: "internal_error" }, 500);
}

export function cleanString(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export function cleanOptionalString(value: unknown, maxLength: number) {
  const normalized = cleanString(value, maxLength);
  return normalized || null;
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
