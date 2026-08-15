import "server-only";

import type { SocialProvider } from "./config";

const MAX_PROVIDER_RESPONSE_BYTES = 1_000_000;
const SAFE_CODE_PATTERN = /^[A-Za-z0-9_.:-]{1,120}$/;

export type SocialProviderStage =
  | "authorization"
  | "token_exchange"
  | "token_refresh"
  | "identity";

type SocialProviderErrorOptions = {
  provider: SocialProvider;
  stage: SocialProviderStage;
  code: string;
  httpStatus?: number;
  requestId?: string | null;
  retryable?: boolean;
};

function safeDiagnostic(value: unknown, fallback: string) {
  const candidate = typeof value === "string" || typeof value === "number"
    ? String(value).trim()
    : "";
  return SAFE_CODE_PATTERN.test(candidate) ? candidate : fallback;
}

export class SocialProviderError extends Error {
  readonly provider: SocialProvider;
  readonly stage: SocialProviderStage;
  readonly code: string;
  readonly httpStatus: number | null;
  readonly requestId: string | null;
  readonly retryable: boolean;

  constructor(options: SocialProviderErrorOptions) {
    const code = safeDiagnostic(options.code, "UNKNOWN");
    super(`SOCIAL_PROVIDER_ERROR:${options.provider}:${options.stage}:${code}`);
    this.name = "SocialProviderError";
    this.provider = options.provider;
    this.stage = options.stage;
    this.code = code;
    this.httpStatus = Number.isInteger(options.httpStatus) ? options.httpStatus! : null;
    this.requestId = options.requestId
      ? safeDiagnostic(options.requestId, "UNAVAILABLE")
      : null;
    this.retryable = options.retryable ?? false;
  }
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function positiveInteger(value: unknown, maximum = 400_000_000) {
  return Number.isInteger(value) && Number(value) > 0 && Number(value) <= maximum
    ? Number(value)
    : null;
}

export function normalizedUsername(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/^@/, "").toLowerCase();
  return /^[a-z0-9._]{2,80}$/.test(normalized) ? normalized : null;
}

export function parseProviderScopes(value: unknown) {
  const raw = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[\s,]+/)
      : [];
  const parsed = raw
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => /^[A-Za-z0-9._:-]{2,120}$/.test(entry));
  return [...new Set(parsed)].sort();
}

export function assertRequiredScopes(
  provider: SocialProvider,
  stage: SocialProviderStage,
  granted: string[],
  required: string[],
) {
  const grantedSet = new Set(granted);
  if (!required.length || required.some((scope) => !grantedSet.has(scope))) {
    throw new SocialProviderError({
      provider,
      stage,
      code: "REQUIRED_SCOPE_MISSING",
    });
  }
}

export function providerErrorCode(error: unknown) {
  if (error instanceof SocialProviderError) return error.code;
  if (error instanceof Error && SAFE_CODE_PATTERN.test(error.message)) return error.message;
  if (error instanceof Error) {
    const match = error.message.match(/^([A-Z][A-Z0-9_]{2,119})(?::|$)/);
    if (match) return match[1];
  }
  return "UNEXPECTED_FAILURE";
}

export function isProviderAuthenticationFailure(error: unknown) {
  if (!(error instanceof SocialProviderError)) return false;
  if (error.httpStatus === 401 || error.httpStatus === 403) return true;
  if ([
    "ACCOUNT_IDENTITY_MISMATCH",
    "REFRESH_IDENTITY_MISMATCH",
    "REQUIRED_SCOPE_MISSING",
  ].includes(error.code)) return true;
  if (error.provider === "instagram") {
    return error.code === "190" || error.code === "INVALID_TOKEN";
  }
  return ["40100", "40101", "40105", "40001", "INVALID_TOKEN"].includes(error.code);
}

function errorFromBody(
  provider: SocialProvider,
  stage: SocialProviderStage,
  status: number,
  body: unknown,
) {
  const record = asRecord(body);
  const nested = asRecord(record?.error);
  const code = nested?.code ?? record?.code ?? `HTTP_${status}`;
  const requestId = record?.request_id ?? nested?.fbtrace_id ?? null;
  return new SocialProviderError({
    provider,
    stage,
    code: safeDiagnostic(code, `HTTP_${status}`),
    httpStatus: status,
    requestId: typeof requestId === "string" ? requestId : null,
    retryable: status === 408 || status === 429 || status >= 500,
  });
}

export async function providerFetchJson(
  provider: SocialProvider,
  stage: SocialProviderStage,
  input: string | URL,
  init: RequestInit,
) {
  let response: Response;
  try {
    response = await fetch(input, {
      ...init,
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new SocialProviderError({
      provider,
      stage,
      code: "NETWORK_FAILURE",
      retryable: true,
    });
  }

  let text: string;
  try {
    text = await response.text();
  } catch {
    throw new SocialProviderError({
      provider,
      stage,
      code: "RESPONSE_READ_FAILURE",
      httpStatus: response.status,
      retryable: response.status >= 500,
    });
  }
  if (Buffer.byteLength(text, "utf8") > MAX_PROVIDER_RESPONSE_BYTES) {
    throw new SocialProviderError({
      provider,
      stage,
      code: "RESPONSE_TOO_LARGE",
      httpStatus: response.status,
    });
  }

  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      throw new SocialProviderError({
        provider,
        stage,
        code: "INVALID_JSON_RESPONSE",
        httpStatus: response.status,
        retryable: response.status >= 500,
      });
    }
  }
  if (!response.ok) throw errorFromBody(provider, stage, response.status, body);
  return body;
}
