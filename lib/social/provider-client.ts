import "server-only";

import type { SocialProvider } from "./config";

const MAX_PROVIDER_RESPONSE_BYTES = 1_000_000;
const SAFE_CODE_PATTERN = /^[A-Za-z0-9_.:-]{1,120}$/;

export type SocialProviderStage =
  | "authorization"
  | "token_exchange"
  | "token_refresh"
  | "identity";

export type SocialOAuthFailureStage =
  | SocialProviderStage
  | "connection_store";

export type SocialOAuthAuditDiagnostic = {
  errorCode: string;
  failureStage: SocialOAuthFailureStage;
  providerRequestId: string | null;
};

export type SocialOAuthAuditDiagnosticInput = {
  failureStage?: unknown;
  providerRequestId?: unknown;
};

const SOCIAL_OAUTH_FAILURE_STAGES = new Set<string>([
  "authorization",
  "token_exchange",
  "token_refresh",
  "identity",
  "connection_store",
]);

const SOCIAL_OAUTH_PLAIN_ERROR_CODES = new Set<string>([
  "SOCIAL_ACTOR_INVALID",
  "SOCIAL_CONFIG_INVALID_ACCOUNT",
  "SOCIAL_CONFIG_INVALID_APP",
  "SOCIAL_CONFIG_INVALID_APPROVED_SCOPES",
  "SOCIAL_CONFIG_INVALID_AUTHORIZATION_URL",
  "SOCIAL_CONFIG_INVALID_HTTPS",
  "SOCIAL_CONFIG_INVALID_REDIRECT",
  "SOCIAL_CONFIG_INVALID_SCOPES",
  "SOCIAL_CONFIG_MISSING",
  "SOCIAL_CONNECTION_STORE_FAILED",
  "SOCIAL_DATABASE_UNAVAILABLE",
  "SOCIAL_TOKEN_ACTIVE_KEY_ID_INVALID",
  "SOCIAL_TOKEN_ACTIVE_KEY_VERSION_INVALID",
  "SOCIAL_TOKEN_AAD_CONTEXT_INVALID",
  "SOCIAL_TOKEN_EMPTY",
  "SOCIAL_TOKEN_ENVELOPE_KEY_UNAVAILABLE",
  "SOCIAL_TOKEN_KEYRING_INVALID_JSON",
  "SOCIAL_TOKEN_KEYRING_NOT_CONFIGURED",
  "SOCIAL_TOKEN_LIFETIME_INVALID",
  "SOCIAL_TOKEN_TOO_LARGE",
]);

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

function safeOptionalDiagnostic(value: unknown) {
  return typeof value === "string"
    && value !== "UNAVAILABLE"
    && SAFE_CODE_PATTERN.test(value)
    ? value
    : null;
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
    this.requestId = safeOptionalDiagnostic(options.requestId);
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
    .filter((entry) => (
      /^[A-Za-z0-9._:-]{2,120}$/.test(entry)
      || /^https:\/\/www\.googleapis\.com\/auth\/[A-Za-z0-9._-]{2,120}$/.test(entry)
    ));
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

/**
 * Reduce a provider failure to the only fields permitted in OAuth audit
 * metadata. Plain runtime errors can retain only one explicitly allowlisted
 * internal code; arbitrary message text and all code details are discarded.
 */
export function providerErrorAuditDiagnostic(
  error: unknown,
  fallbackStage: SocialOAuthFailureStage,
): SocialOAuthAuditDiagnostic {
  if (error instanceof SocialProviderError) {
    return {
      errorCode: error.code,
      failureStage: error.stage,
      providerRequestId: error.requestId,
    };
  }
  const classified = providerErrorCode(error);
  const plainInternalCode = classified.match(
    /^([A-Z][A-Z0-9_]{2,119})(?::|$)/,
  )?.[1];
  return {
    errorCode: plainInternalCode && SOCIAL_OAUTH_PLAIN_ERROR_CODES.has(plainInternalCode)
      ? plainInternalCode
      : "UNEXPECTED_FAILURE",
    failureStage: fallbackStage,
    providerRequestId: null,
  };
}

/**
 * Final defense-in-depth allowlist at the audit boundary. The returned object
 * can contain only the provider and sanitized OAuth diagnostic fields.
 */
export function socialOAuthAuditMetadata(
  provider: SocialProvider,
  errorCode: unknown,
  diagnostic: SocialOAuthAuditDiagnosticInput = {},
) {
  const metadata: Record<string, string> = {
    provider,
    error_code: safeDiagnostic(errorCode, "UNEXPECTED_FAILURE"),
  };
  if (
    typeof diagnostic.failureStage === "string"
    && SOCIAL_OAUTH_FAILURE_STAGES.has(diagnostic.failureStage)
  ) {
    metadata.failure_stage = diagnostic.failureStage;
  }
  const providerRequestId = safeOptionalDiagnostic(diagnostic.providerRequestId);
  if (providerRequestId) metadata.provider_request_id = providerRequestId;
  return metadata;
}

export function isProviderAuthenticationFailure(error: unknown) {
  if (!(error instanceof SocialProviderError)) return false;
  if (error.httpStatus === 401 || error.httpStatus === 403) return true;
  if ([
    "ACCOUNT_IDENTITY_MISMATCH",
    "REFRESH_IDENTITY_MISMATCH",
    "APPROVED_SCOPE_SET_MISMATCH",
    "REQUIRED_SCOPE_MISSING",
  ].includes(error.code)) return true;
  if (error.provider === "instagram") {
    return error.code === "190" || error.code === "INVALID_TOKEN";
  }
  if (error.provider === "facebook") {
    return error.code === "190" || error.code === "META_190" || error.code === "INVALID_TOKEN";
  }
  if (error.provider === "youtube") {
    return ["invalid_grant", "UNAUTHENTICATED", "INVALID_TOKEN"].includes(error.code);
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
  const code = nested?.code
    ?? (typeof record?.error === "string" ? record.error : null)
    ?? record?.code
    ?? `HTTP_${status}`;
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
  parseBody: (text: string) => unknown = JSON.parse,
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
      body = parseBody(text);
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
