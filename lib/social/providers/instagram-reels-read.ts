import "server-only";

import { createHash } from "node:crypto";
import {
  instagramApiNetworkEnabled,
  instagramInsightsEnabled,
} from "../config";

const API_ORIGIN = "https://graph.instagram.com";
const API_VERSION = "v25.0";
const MAX_RESPONSE_BYTES = 1_000_000;
const PAGE_SIZE = 50;
const SHA256 = /^[a-f0-9]{64}$/;
const INSTAGRAM_ID = /^[1-9]\d{0,255}$/;

const REQUIRED_SCOPES = [
  "instagram_business_basic",
  "instagram_business_content_publish",
  "instagram_business_manage_insights",
] as const;

const OWNED_MEDIA_FIELDS = [
  "id",
  "caption",
  "media_type",
  "media_product_type",
  "permalink",
  "timestamp",
] as const;

const MEDIA_INSIGHT_FIELDS = [
  "views",
  "reach",
  "likes",
  "comments",
  "shares",
  "saved",
  "total_interactions",
  "follows",
  "ig_reels_video_view_total_time",
  "ig_reels_avg_watch_time",
  "clips_replays_count",
  "ig_reels_aggregated_all_plays_count",
] as const;

export const INSTAGRAM_REELS_READ_SCHEMA_ID =
  "instagram-login-reels-read-v25.0-2026-08-16" as const;

type JsonObject = Record<string, unknown>;
type InstagramReadOperation =
  | "activation"
  | "publishing_limit"
  | "owned_media"
  | "container_status"
  | "media_insights";

type NetworkOperation = Exclude<InstagramReadOperation, "activation">;

export type InstagramReelsReadActivation = {
  schemaId: typeof INSTAGRAM_REELS_READ_SCHEMA_ID;
  apiVersion: "v25.0";
  endpointSchemaReceiptSha256: string;
  connectionReceiptSha256: string;
  identityReceiptSha256: string;
  oauthScopeReceiptSha256: string;
  expectedAccountId: string;
  expectedUsername: string;
  grantedScopes: string[];
};

export type InstagramReadTransportRequest = {
  operation: NetworkOperation;
  url: URL;
  method: "GET";
  headers: Record<string, string>;
};

export type InstagramReadTransport = (
  request: InstagramReadTransportRequest,
) => Promise<{ status: number; body: unknown }>;

type ClientOptions = {
  activation?: unknown;
  networkEnabled?: boolean;
  insightsEnabled?: boolean;
  transport?: InstagramReadTransport;
};

export class InstagramReelsReadError extends Error {
  readonly code: string;
  readonly operation: InstagramReadOperation;
  readonly httpStatus: number | null;
  readonly requestId: string | null;
  readonly retryable: boolean;

  constructor(options: {
    code: string;
    operation: InstagramReadOperation;
    httpStatus?: number;
    requestId?: string | null;
    retryable?: boolean;
  }) {
    const code = safeDiagnostic(options.code, "UNEXPECTED_FAILURE");
    super(`INSTAGRAM_REELS_READ_ERROR:${options.operation}:${code}`);
    this.name = "InstagramReelsReadError";
    this.code = code;
    this.operation = options.operation;
    this.httpStatus = Number.isInteger(options.httpStatus) ? options.httpStatus! : null;
    this.requestId = options.requestId
      ? safeDiagnostic(options.requestId, "UNAVAILABLE")
      : null;
    this.retryable = options.retryable ?? false;
  }
}

function record(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : null;
}

function hasExactKeys(
  value: JsonObject | null,
  required: readonly string[],
  optional: readonly string[] = [],
) {
  if (!value || required.some((key) => !(key in value))) return false;
  const allowed = new Set([...required, ...optional]);
  return Object.keys(value).every((key) => allowed.has(key));
}

function boundedString(value: unknown, maximum = 4_096) {
  return typeof value === "string"
    && value.length > 0
    && value.length <= maximum
    && !/[\u0000-\u001f\u007f]/.test(value)
    ? value
    : null;
}

function optionalCaption(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  return boundedString(value, 2_200);
}

function safeDiagnostic(value: unknown, fallback: string) {
  const candidate = typeof value === "string" || typeof value === "number"
    ? String(value).trim()
    : "";
  return /^[A-Za-z0-9_.:~-]{1,120}$/.test(candidate) ? candidate : fallback;
}

function instagramId(value: unknown) {
  if (typeof value === "string" && INSTAGRAM_ID.test(value)) return value;
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
    return String(value);
  }
  return null;
}

function normalizedUsername(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/^@/, "").toLowerCase();
  return /^[a-z0-9._]{2,80}$/.test(normalized) ? normalized : null;
}

function nonnegativeInteger(value: unknown) {
  const candidate = typeof value === "string" && /^\d+$/.test(value)
    ? Number(value)
    : value;
  return Number.isSafeInteger(candidate) && Number(candidate) >= 0
    ? Number(candidate)
    : null;
}

function positiveInteger(value: unknown) {
  const parsed = nonnegativeInteger(value);
  return parsed !== null && parsed > 0 ? parsed : null;
}

function nonnegativeNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function isoTimestamp(value: unknown) {
  if (typeof value !== "string") return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function sha256Text(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function parseActivation(value: unknown): InstagramReelsReadActivation | null {
  const activation = record(value);
  const accountId = instagramId(activation?.expectedAccountId);
  const username = normalizedUsername(activation?.expectedUsername);
  const scopes = Array.isArray(activation?.grantedScopes)
    ? activation.grantedScopes.filter((scope): scope is string => typeof scope === "string")
    : [];
  const normalizedScopes = [...new Set(scopes)].sort();
  const exactScopes = [...REQUIRED_SCOPES].sort();

  if (
    !hasExactKeys(activation, [
      "schemaId",
      "apiVersion",
      "endpointSchemaReceiptSha256",
      "connectionReceiptSha256",
      "identityReceiptSha256",
      "oauthScopeReceiptSha256",
      "expectedAccountId",
      "expectedUsername",
      "grantedScopes",
    ])
    || activation?.schemaId !== INSTAGRAM_REELS_READ_SCHEMA_ID
    || activation.apiVersion !== API_VERSION
    || !SHA256.test(String(activation.endpointSchemaReceiptSha256 ?? ""))
    || !SHA256.test(String(activation.connectionReceiptSha256 ?? ""))
    || !SHA256.test(String(activation.identityReceiptSha256 ?? ""))
    || !SHA256.test(String(activation.oauthScopeReceiptSha256 ?? ""))
    || !accountId
    || username !== "hooma.ge"
    || !Array.isArray(activation.grantedScopes)
    || scopes.length !== activation.grantedScopes.length
    || normalizedScopes.length !== scopes.length
    || normalizedScopes.length !== exactScopes.length
    || normalizedScopes.some((scope, index) => scope !== exactScopes[index])
  ) {
    return null;
  }

  return {
    schemaId: INSTAGRAM_REELS_READ_SCHEMA_ID,
    apiVersion: API_VERSION,
    endpointSchemaReceiptSha256: String(activation.endpointSchemaReceiptSha256),
    connectionReceiptSha256: String(activation.connectionReceiptSha256),
    identityReceiptSha256: String(activation.identityReceiptSha256),
    oauthScopeReceiptSha256: String(activation.oauthScopeReceiptSha256),
    expectedAccountId: accountId,
    expectedUsername: username,
    grantedScopes: normalizedScopes,
  };
}

// Meta IDs can exceed JavaScript's safe integer range. Quote only unquoted
// numeric values attached to ID fields before JSON.parse touches them.
export function parseInstagramReadJson(text: string) {
  const replacements: Array<{ start: number; end: number; value: string }> = [];
  let index = 0;
  while (index < text.length) {
    if (text[index] !== '"') {
      index += 1;
      continue;
    }
    const stringStart = index;
    index += 1;
    let escaped = false;
    while (index < text.length) {
      const character = text[index];
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') break;
      index += 1;
    }
    if (index >= text.length) return JSON.parse(text) as unknown;
    const stringEnd = index + 1;
    const property = JSON.parse(text.slice(stringStart, stringEnd)) as unknown;
    index = stringEnd;
    if (property !== "id" && property !== "user_id") continue;
    let cursor = stringEnd;
    while (/\s/.test(text[cursor] ?? "")) cursor += 1;
    if (text[cursor] !== ":") continue;
    cursor += 1;
    while (/\s/.test(text[cursor] ?? "")) cursor += 1;
    const numberStart = cursor;
    while (/\d/.test(text[cursor] ?? "")) cursor += 1;
    if (cursor === numberStart) continue;
    let terminator = cursor;
    while (/\s/.test(text[terminator] ?? "")) terminator += 1;
    if (text[terminator] !== "," && text[terminator] !== "}") continue;
    const digits = text.slice(numberStart, cursor);
    if (digits.length > 1 && digits.startsWith("0")) continue;
    replacements.push({ start: numberStart, end: cursor, value: `"${digits}"` });
  }
  let rewritten = text;
  for (const replacement of replacements.reverse()) {
    rewritten = rewritten.slice(0, replacement.start)
      + replacement.value
      + rewritten.slice(replacement.end);
  }
  return JSON.parse(rewritten) as unknown;
}

async function defaultTransport(request: InstagramReadTransportRequest) {
  let response: Response;
  try {
    response = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new InstagramReelsReadError({
      operation: request.operation,
      code: "NETWORK_FAILURE",
      retryable: true,
    });
  }

  let text: string;
  try {
    text = await response.text();
  } catch {
    throw new InstagramReelsReadError({
      operation: request.operation,
      code: "RESPONSE_READ_FAILURE",
      httpStatus: response.status,
      retryable: response.status >= 500,
    });
  }
  if (Buffer.byteLength(text, "utf8") > MAX_RESPONSE_BYTES) {
    throw new InstagramReelsReadError({
      operation: request.operation,
      code: "RESPONSE_TOO_LARGE",
      httpStatus: response.status,
    });
  }
  let body: unknown = null;
  if (text) {
    try {
      body = parseInstagramReadJson(text);
    } catch {
      throw new InstagramReelsReadError({
        operation: request.operation,
        code: "INVALID_JSON_RESPONSE",
        httpStatus: response.status,
        retryable: response.status >= 500,
      });
    }
  }
  return { status: response.status, body };
}

function checkedResponse(operation: NetworkOperation, status: number, body: unknown) {
  if (!Number.isInteger(status) || status < 100 || status > 599) {
    throw new InstagramReelsReadError({ operation, code: "INVALID_TRANSPORT_RESPONSE" });
  }
  const response = record(body);
  const providerError = record(response?.error);
  if (status < 200 || status >= 300 || providerError) {
    const errorCode = safeDiagnostic(providerError?.code, `HTTP_${status}`);
    const subcode = safeDiagnostic(providerError?.error_subcode, "");
    const code = subcode ? `${errorCode}_${subcode}` : errorCode;
    const requestId = boundedString(providerError?.fbtrace_id, 120);
    throw new InstagramReelsReadError({
      operation,
      code,
      httpStatus: status,
      requestId,
      retryable: providerError?.is_transient === true
        || status === 408
        || status === 429
        || status >= 500,
    });
  }
  if (!response) {
    throw new InstagramReelsReadError({
      operation,
      code: "INVALID_PROVIDER_RESPONSE",
      httpStatus: status,
    });
  }
  return response;
}

function bearerHeaders(accessToken: string, operation: NetworkOperation) {
  if (!boundedString(accessToken, 16_384)) {
    throw new InstagramReelsReadError({ operation, code: "ACCESS_TOKEN_INVALID" });
  }
  return { Authorization: `Bearer ${accessToken}`, Accept: "application/json" };
}

function graphUrl(path: string) {
  return new URL(`/${API_VERSION}/${path}`, API_ORIGIN);
}

function parsePermalink(value: unknown) {
  const candidate = boundedString(value, 2_048);
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    if (
      url.protocol !== "https:"
      || url.username
      || url.password
      || url.hash
      || !new Set(["instagram.com", "www.instagram.com"]).has(url.hostname)
      || !/^\/(?:reel|p)\/[A-Za-z0-9_-]+\/?$/.test(url.pathname)
    ) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function parsePagingAfter(value: unknown, operation: NetworkOperation) {
  if (value === undefined) return null;
  const paging = record(value);
  const cursors = record(paging?.cursors);
  const after = cursors?.after;
  if (!paging || (after !== undefined && !boundedString(after, 2_048))) {
    throw new InstagramReelsReadError({ operation, code: "INVALID_PAGING_RESPONSE" });
  }
  return typeof after === "string" ? after : null;
}

function insightValue(entry: JsonObject) {
  const values = entry.values;
  const totalValue = record(entry.total_value);
  if (values !== undefined && totalValue) return undefined;
  if (Array.isArray(values)) {
    if (values.length === 0) return null;
    if (values.length !== 1) return undefined;
    const valueRecord = record(values[0]);
    return valueRecord && "value" in valueRecord
      ? nonnegativeNumber(valueRecord.value)
      : undefined;
  }
  if (totalValue) return nonnegativeNumber(totalValue.value);
  return null;
}

export class InstagramReelsReadClient {
  private readonly activation: InstagramReelsReadActivation | null;
  private readonly networkRequested: boolean;
  private readonly insightsRequested: boolean;
  private readonly transport: InstagramReadTransport;

  constructor(options: ClientOptions = {}) {
    this.activation = parseActivation(options.activation);
    this.networkRequested = options.networkEnabled === true;
    this.insightsRequested = options.insightsEnabled === true;
    this.transport = options.transport ?? defaultTransport;
  }

  connectionStatus() {
    const networkEnabled = Boolean(
      this.activation && this.networkRequested && instagramApiNetworkEnabled(),
    );
    return {
      provider: "INSTAGRAM_API_WITH_INSTAGRAM_LOGIN" as const,
      schemaId: INSTAGRAM_REELS_READ_SCHEMA_ID,
      schemaFrozen: Boolean(this.activation),
      networkEnabled,
      insightsEnabled: Boolean(
        networkEnabled && this.insightsRequested && instagramInsightsEnabled(),
      ),
      expectedAccountId: this.activation?.expectedAccountId ?? null,
      expectedUsername: this.activation?.expectedUsername ?? null,
      credentialsLoaded: false,
      mutationsImplemented: false,
    };
  }

  private ready(operation: NetworkOperation, accountId?: string) {
    if (!this.activation) {
      throw new InstagramReelsReadError({
        operation,
        code: "ACTIVATION_RECEIPTS_REQUIRED",
      });
    }
    if (!this.networkRequested || !instagramApiNetworkEnabled()) {
      throw new InstagramReelsReadError({ operation, code: "NETWORK_DISABLED" });
    }
    if (accountId !== undefined && accountId !== this.activation.expectedAccountId) {
      throw new InstagramReelsReadError({ operation, code: "ACCOUNT_IDENTITY_MISMATCH" });
    }
    if (
      operation === "media_insights"
      && (!this.insightsRequested || !instagramInsightsEnabled())
    ) {
      throw new InstagramReelsReadError({ operation, code: "INSIGHTS_DISABLED" });
    }
    return this.activation;
  }

  private async get(operation: NetworkOperation, url: URL, accessToken: string) {
    let transported: { status: number; body: unknown };
    try {
      transported = await this.transport({
        operation,
        url,
        method: "GET",
        headers: bearerHeaders(accessToken, operation),
      });
    } catch (error) {
      if (error instanceof InstagramReelsReadError) throw error;
      throw new InstagramReelsReadError({
        operation,
        code: "NETWORK_FAILURE",
        retryable: true,
      });
    }
    return checkedResponse(operation, transported.status, transported.body);
  }

  async fetchContentPublishingLimit(
    input: { accountId: string },
    accessToken: string,
  ) {
    this.ready("publishing_limit", input.accountId);
    const url = graphUrl(`${input.accountId}/content_publishing_limit`);
    url.searchParams.set("fields", "quota_usage,config");
    const response = await this.get("publishing_limit", url, accessToken);
    const data = response.data;
    const entry = Array.isArray(data) && data.length === 1 ? record(data[0]) : null;
    const config = record(entry?.config);
    const usage = nonnegativeInteger(entry?.quota_usage);
    const total = positiveInteger(config?.quota_total);
    const durationSeconds = positiveInteger(config?.quota_duration);
    if (
      !hasExactKeys(response, ["data"], ["paging"])
      || !hasExactKeys(entry, ["quota_usage", "config"])
      || !hasExactKeys(config, ["quota_total", "quota_duration"])
      || usage === null
      || total === null
      || durationSeconds === null
      || usage > total
    ) {
      throw new InstagramReelsReadError({
        operation: "publishing_limit",
        code: "INVALID_LIMIT_RESPONSE",
      });
    }
    return {
      status: usage < total ? "AVAILABLE" as const : "EXHAUSTED" as const,
      usage,
      total,
      remaining: total - usage,
      durationSeconds,
    };
  }

  async lookupOwnedReelDuplicate(
    input: {
      accountId: string;
      captionSha256: string;
      notBefore: string;
      maxPages?: number;
    },
    accessToken: string,
  ) {
    this.ready("owned_media", input.accountId);
    const notBefore = isoTimestamp(input.notBefore);
    const maxPages = input.maxPages ?? 3;
    if (
      !SHA256.test(input.captionSha256)
      || !notBefore
      || !Number.isInteger(maxPages)
      || maxPages < 1
      || maxPages > 5
    ) {
      throw new InstagramReelsReadError({
        operation: "owned_media",
        code: "DUPLICATE_LOOKUP_INPUT_INVALID",
      });
    }

    let after: string | null = null;
    let scannedCount = 0;
    for (let page = 1; page <= maxPages; page += 1) {
      const url = graphUrl(`${input.accountId}/media`);
      url.searchParams.set("fields", OWNED_MEDIA_FIELDS.join(","));
      url.searchParams.set("limit", String(PAGE_SIZE));
      if (after) url.searchParams.set("after", after);
      const response = await this.get("owned_media", url, accessToken);
      if (!hasExactKeys(response, ["data"], ["paging"]) || !Array.isArray(response.data)) {
        throw new InstagramReelsReadError({
          operation: "owned_media",
          code: "INVALID_MEDIA_LIST_ENVELOPE",
        });
      }

      for (const rawItem of response.data) {
        const item = record(rawItem);
        const id = instagramId(item?.id);
        const caption = optionalCaption(item?.caption);
        const permalink = parsePermalink(item?.permalink);
        const timestamp = isoTimestamp(item?.timestamp);
        if (!hasExactKeys(
          item,
          ["id", "media_type", "media_product_type", "permalink", "timestamp"],
          ["caption"],
        )) {
          throw new InstagramReelsReadError({
            operation: "owned_media",
            code: "INVALID_MEDIA_ITEM_KEYS",
          });
        }
        if (!id) {
          throw new InstagramReelsReadError({
            operation: "owned_media",
            code: "INVALID_MEDIA_ID",
          });
        }
        if (item?.media_type !== "IMAGE"
          && item?.media_type !== "VIDEO"
          && item?.media_type !== "CAROUSEL_ALBUM") {
          throw new InstagramReelsReadError({
            operation: "owned_media",
            code: "INVALID_MEDIA_TYPE",
          });
        }
        if (item.media_product_type !== "AD"
          && item.media_product_type !== "FEED"
          && item.media_product_type !== "STORY"
          && item.media_product_type !== "REELS") {
          throw new InstagramReelsReadError({
            operation: "owned_media",
            code: "INVALID_MEDIA_PRODUCT_TYPE",
          });
        }
        if (
          item.caption !== undefined
          && item.caption !== null
          && item.caption !== ""
          && !caption
        ) {
          throw new InstagramReelsReadError({
            operation: "owned_media",
            code: "INVALID_MEDIA_CAPTION",
          });
        }
        if (!permalink) {
          throw new InstagramReelsReadError({
            operation: "owned_media",
            code: "INVALID_MEDIA_PERMALINK",
          });
        }
        if (!timestamp) {
          throw new InstagramReelsReadError({
            operation: "owned_media",
            code: "INVALID_MEDIA_TIMESTAMP",
          });
        }
        scannedCount += 1;
        if (
          item.media_type === "VIDEO"
          && item.media_product_type === "REELS"
          && caption
          && timestamp >= notBefore
          && sha256Text(caption) === input.captionSha256
        ) {
          return {
            status: "DUPLICATE" as const,
            scannedCount,
            duplicate: { mediaId: id, permalink, timestamp },
          };
        }
      }

      after = parsePagingAfter(response.paging, "owned_media");
      if (!after) {
        return { status: "CLEAR" as const, scannedCount, duplicate: null };
      }
    }
    return {
      status: "INCONCLUSIVE_PAGE_LIMIT" as const,
      scannedCount,
      duplicate: null,
    };
  }

  async fetchContainerStatus(
    input: { accountId: string; containerId: string },
    accessToken: string,
  ) {
    this.ready("container_status", input.accountId);
    const containerId = instagramId(input.containerId);
    if (!containerId) {
      throw new InstagramReelsReadError({
        operation: "container_status",
        code: "CONTAINER_ID_INVALID",
      });
    }
    const url = graphUrl(containerId);
    url.searchParams.set("fields", "id,status_code,status");
    const response = await this.get("container_status", url, accessToken);
    const returnedId = instagramId(response.id);
    const code = response.status_code;
    if (
      !hasExactKeys(response, ["id", "status_code"], ["status"])
      || returnedId !== containerId
      || !new Set(["IN_PROGRESS", "FINISHED", "ERROR", "EXPIRED", "PUBLISHED"]).has(String(code))
      || (response.status !== undefined && !boundedString(response.status, 1_000))
    ) {
      throw new InstagramReelsReadError({
        operation: "container_status",
        code: "INVALID_CONTAINER_STATUS_RESPONSE",
      });
    }
    const states = {
      IN_PROGRESS: "PROCESSING",
      FINISHED: "READY",
      ERROR: "FAILED",
      EXPIRED: "EXPIRED",
      PUBLISHED: "PUBLISHED",
    } as const;
    return { containerId, statusCode: code as keyof typeof states, status: states[code as keyof typeof states] };
  }

  async fetchMediaInsights(
    input: { accountId: string; mediaId: string },
    accessToken: string,
  ) {
    this.ready("media_insights", input.accountId);
    const mediaId = instagramId(input.mediaId);
    if (!mediaId) {
      throw new InstagramReelsReadError({
        operation: "media_insights",
        code: "MEDIA_ID_INVALID",
      });
    }
    const url = graphUrl(`${mediaId}/insights`);
    url.searchParams.set("metric", MEDIA_INSIGHT_FIELDS.join(","));
    const response = await this.get("media_insights", url, accessToken);
    if (!hasExactKeys(response, ["data"], ["paging"]) || !Array.isArray(response.data)) {
      throw new InstagramReelsReadError({
        operation: "media_insights",
        code: "INVALID_INSIGHTS_RESPONSE",
      });
    }
    const values = new Map<string, number | null>();
    for (const rawEntry of response.data) {
      const entry = record(rawEntry);
      const name = entry?.name;
      const parsedValue = entry ? insightValue(entry) : undefined;
      if (
        !hasExactKeys(
          entry,
          ["name"],
          ["period", "values", "total_value", "title", "description", "id"],
        )
        || typeof name !== "string"
        || !MEDIA_INSIGHT_FIELDS.includes(name as typeof MEDIA_INSIGHT_FIELDS[number])
        || values.has(name)
        || parsedValue === undefined
      ) {
        throw new InstagramReelsReadError({
          operation: "media_insights",
          code: "INVALID_INSIGHTS_RESPONSE",
        });
      }
      values.set(name, parsedValue);
    }
    const metric = (name: typeof MEDIA_INSIGHT_FIELDS[number]) => values.get(name) ?? null;
    const metrics = {
      views: metric("views"),
      reach: metric("reach"),
      likes: metric("likes"),
      comments: metric("comments"),
      shares: metric("shares"),
      saved: metric("saved"),
      totalInteractions: metric("total_interactions"),
      follows: metric("follows"),
      reelsVideoViewTotalTime: metric("ig_reels_video_view_total_time"),
      reelsAverageWatchTime: metric("ig_reels_avg_watch_time"),
      clipsReplaysCount: metric("clips_replays_count"),
      reelsAggregatedAllPlaysCount: metric("ig_reels_aggregated_all_plays_count"),
    };
    return {
      status: values.size === 0 ? "UNAVAILABLE" as const : "AVAILABLE" as const,
      mediaId,
      metrics,
    };
  }
}
