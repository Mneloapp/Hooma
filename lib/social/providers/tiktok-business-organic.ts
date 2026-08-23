import "server-only";

import { createHash } from "node:crypto";
import {
  providerConfig,
  TIKTOK_APPROVED_APP_ID,
  tiktokAppReviewApproved,
  tiktokAppReviewReceiptSha256,
  tiktokOAuthConnectionReceiptSha256,
  tiktokOAuthEnabled,
  tiktokOrganicActivationReceiptSha256,
  tiktokOrganicNetworkEnabled,
  tiktokOrganicPublishingEnabled,
} from "../config";

const API_ORIGIN = "https://business-api.tiktok.com";
const API_VERSION = "v1.3";
const PUBLISH_PATH = "/open_api/v1.3/business/video/publish/";
const STATUS_PATH = "/open_api/v1.3/business/publish/status/";
const VIDEO_LIST_PATH = "/open_api/v1.3/business/video/list/";
const VIDEO_SETTINGS_PATH = "/open_api/v1.3/business/video/settings/";
const MAX_RESPONSE_BYTES = 1_000_000;
const MIN_STAGING_TTL_MS = 30 * 60 * 1_000;
const MIN_ACCESS_TOKEN_TTL_MS = 10 * 60 * 1_000;

export const TIKTOK_ORGANIC_SCHEMA_ID =
  "tiktok-business-organic-v1.3-cml-owned-master-ai-brand-2026-08-21" as const;

const REQUIRED_PERMISSIONS = [
  "Account User",
  "Get Account Media",
  "Account Post Content",
] as const;

const METRIC_FIELDS = [
  "item_id",
  "share_url",
  "likes",
  "comments",
  "shares",
  "favorites",
  "video_views",
  "reach",
  "total_time_watched",
  "average_time_watched",
  "full_video_watched_rate",
  "new_followers",
  "profile_views",
  "website_clicks",
] as const;

const DUPLICATE_FIELDS = ["item_id", "share_url", "caption", "create_time"] as const;

const SHA256 = /^[a-f0-9]{64}$/;
const SAFE_ID = /^[A-Za-z0-9._:~-]{1,256}$/;
const TIKTOK_POST_ID = /^[1-9]\d{7,39}$/;

type JsonObject = Record<string, unknown>;
type TikTokOperation =
  | "publish"
  | "publish_status"
  | "settings"
  | "metrics"
  | "duplicate_lookup"
  | "music"
  | "activation";

export class TikTokOrganicError extends Error {
  readonly code: string;
  readonly operation: TikTokOperation;
  readonly httpStatus: number | null;
  readonly requestId: string | null;
  readonly retryable: boolean;

  constructor(options: {
    code: string;
    operation: TikTokOperation;
    httpStatus?: number;
    requestId?: string | null;
    retryable?: boolean;
  }) {
    const code = safeDiagnostic(options.code, "UNEXPECTED_FAILURE");
    super(`TIKTOK_ORGANIC_ERROR:${options.operation}:${code}`);
    this.name = "TikTokOrganicError";
    this.code = code;
    this.operation = options.operation;
    this.httpStatus = Number.isInteger(options.httpStatus) ? options.httpStatus! : null;
    this.requestId = options.requestId
      ? safeDiagnostic(options.requestId, "UNAVAILABLE")
      : null;
    this.retryable = options.retryable ?? false;
  }
}

export type TikTokOrganicActivation = {
  schemaId: typeof TIKTOK_ORGANIC_SCHEMA_ID;
  apiVersion: "v1.3";
  appId: typeof TIKTOK_APPROVED_APP_ID;
  appReviewStatus: "APPROVED";
  appReviewReceiptSha256: string;
  activationReceiptSha256: string;
  oauthConnectionStatus: "ACTIVE_VERIFIED";
  oauthConnectionReceiptSha256: string;
  oauthConnectionVerifiedAt: string;
  oauthAccessExpiresAt: string;
  oauthScopes: string[];
  endpointSchemaReceiptSha256: string;
  identityReceiptSha256: string;
  oauthScopeReceiptSha256: string;
  urlPropertyReceiptSha256: string;
  cmlSchemaReceiptSha256: string;
  cmlRegion: string;
  expectedAccountId: string;
  expectedUsername: string;
  verifiedMediaHosts: string[];
  portalPermissions: string[];
};

export type TikTokCmlSelectionReceipt = {
  schemaVersion: 1;
  receiptType: "TIKTOK_COMMERCIAL_MUSIC_SELECTION";
  immutable: true;
  status: "APPROVED";
  context: {
    platform: "tiktok";
    accountId: string;
    postId: string;
  };
  track: {
    musicSoundId: string;
    region: string;
    placement: "ORGANIC";
    commercialUseAllowed: true;
    catalogEvidenceSha256: string;
  };
  mix: {
    musicSoundVolume: number;
    videoOriginalSoundVolume: number;
  };
  binding: {
    contentFingerprint: string;
    approvalFingerprint: string;
    videoSha256: string;
    captionSha256: string;
  };
  selectedAt: string;
  validUntil: string;
  selectionFingerprint: string;
};

export type TikTokOwnedMasterReceipt = {
  schemaVersion: 1;
  receiptType: "HOOMA_LICENSED_MUSIC_MASTER_PROVENANCE";
  immutable: true;
  context: {
    platform: "tiktok";
    account: "@hooma.ge";
    postId: string;
    campaignId: string;
  };
  track: {
    id: string;
    commercialUseAllowed: true;
    trackSha256: string;
    license: {
      status: "VERIFIED";
      commercialUseAllowed: true;
      platforms: ["tiktok"];
      receiptSha256: string;
    };
  };
  output: { sha256: string; audioPcmSha256: string };
  sourceReceipt: {
    receiptType: "HOOMA_LICENSED_VOICE_MUSIC_MASTER_PROVENANCE";
    receiptSha256: string;
    provenanceSha256: string;
    sourceVoiceSha256: string;
  };
};

export type TikTokPublishSettings = {
  commentsEnabled: true;
  duetEnabled: boolean;
  stitchEnabled: boolean;
  aiGeneratedContent: true;
  commercialContent: true;
  promotionType: "YOUR_BRAND";
  uploadToDraft: false;
  adsOnly: false;
  shareToFacebook: false;
  thumbnailOffsetMs?: number;
};

export type TikTokOrganicPublishInput = {
  accountId: string;
  postId: string;
  approvalStatus: "APPROVED_EXACT";
  publishingAllowed: true;
  rightsStatus: "CLEARED";
  visualClaimsStatus: "CLEARED";
  productAvailable: true;
  remoteDuplicateStatus: "CLEAR";
  remoteDuplicateReceiptSha256: string;
  scheduledAt: string;
  publishNotAfter: string;
  contentFingerprint: string;
  approvalFingerprint: string;
  videoSha256: string;
  caption: string;
  captionSha256: string;
  idempotencyKey: string;
  musicMode: "TIKTOK_CML" | "HOOMA_OWNED_MASTER";
  musicReceipt: unknown;
  settings: TikTokPublishSettings;
  media: {
    videoUrl: string;
    sha256: string;
    expiresAt: string;
    signatureReferenceSha256: string;
    urlPropertyReceiptSha256: string;
  };
};

export type TikTokTransportRequest = {
  operation: Exclude<TikTokOperation, "music" | "activation">;
  url: URL;
  method: "GET" | "POST";
  headers: Record<string, string>;
  body?: string;
};

export type TikTokTransport = (
  request: TikTokTransportRequest,
) => Promise<{ status: number; body: unknown }>;

type ClientOptions = {
  activation?: unknown;
  networkEnabled?: boolean;
  publishingEnabled?: boolean;
  transport?: TikTokTransport;
  now?: () => Date;
};

function record(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : null;
}

function hasExactKeys(
  value: JsonObject | null,
  required: string[],
  optional: string[] = [],
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

function boundedCaption(value: unknown, maximum = 2_200) {
  return typeof value === "string"
    && value.length > 0
    && value.length <= maximum
    && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)
    ? value
    : null;
}

function canonicalIsoTimestamp(value: unknown) {
  if (typeof value !== "string") return null;
  const timestamp = Date.parse(value);
  const normalizedUtc = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+00:00$/.test(value)
    ? `${value.slice(0, -6)}.000Z`
    : value;
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === normalizedUtc
    ? timestamp
    : null;
}

function safeDiagnostic(value: unknown, fallback: string) {
  const candidate = typeof value === "string" || typeof value === "number"
    ? String(value).trim()
    : "";
  return /^[A-Za-z0-9_.:~-]{1,120}$/.test(candidate) ? candidate : fallback;
}

function safeId(value: unknown, maximum = 256) {
  const candidate = boundedString(value, maximum);
  return candidate && SAFE_ID.test(candidate) ? candidate : null;
}

function sha256Text(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as JsonObject)
      .filter(([, nested]) => nested !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableJson(nested)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function sha256Json(value: unknown) {
  return sha256Text(stableJson(value));
}

function normalizedUsername(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/^@/, "").toLowerCase();
  return /^[a-z0-9._]{2,80}$/.test(normalized) ? normalized : null;
}

function activationEvidenceIsCurrent(value: unknown, now: Date) {
  const activation = record(value);
  if (!activation || !tiktokAppReviewApproved() || !tiktokOAuthEnabled()) return false;

  let config;
  try {
    config = providerConfig("tiktok");
  } catch {
    return false;
  }
  const appReviewReceipt = tiktokAppReviewReceiptSha256();
  const connectionReceipt = tiktokOAuthConnectionReceiptSha256();
  const activationReceipt = tiktokOrganicActivationReceiptSha256();
  const verifiedAt = canonicalIsoTimestamp(activation.oauthConnectionVerifiedAt);
  const accessExpiresAt = canonicalIsoTimestamp(activation.oauthAccessExpiresAt);
  const suppliedScopes = Array.isArray(activation.oauthScopes)
    ? activation.oauthScopes.filter((scope): scope is string => typeof scope === "string")
    : [];
  const exactSuppliedScopes = [...new Set(suppliedScopes)].sort();
  const exactConfiguredScopes = [...config.requiredScopes].sort();

  return Boolean(
    config.clientId === TIKTOK_APPROVED_APP_ID
    && activation.appId === config.clientId
    && activation.appReviewStatus === "APPROVED"
    && appReviewReceipt
    && activation.appReviewReceiptSha256 === appReviewReceipt
    && activation.oauthConnectionStatus === "ACTIVE_VERIFIED"
    && connectionReceipt
    && activation.oauthConnectionReceiptSha256 === connectionReceipt
    && activationReceipt
    && activation.activationReceiptSha256 === activationReceipt
    && activation.expectedUsername === config.expectedUsername
    && verifiedAt !== null
    && accessExpiresAt !== null
    && verifiedAt <= now.getTime() + 5 * 60 * 1_000
    && accessExpiresAt > now.getTime() + MIN_ACCESS_TOKEN_TTL_MS
    && accessExpiresAt > verifiedAt
    && Array.isArray(activation.oauthScopes)
    && activation.oauthScopes.length === suppliedScopes.length
    && suppliedScopes.length === exactSuppliedScopes.length
    && exactSuppliedScopes.length === exactConfiguredScopes.length
    && exactSuppliedScopes.every(
      (scope, index) => scope === exactConfiguredScopes[index],
    )
  );
}

function parseActivation(value: unknown, now: Date): TikTokOrganicActivation | null {
  const activation = record(value);
  const expectedUsername = normalizedUsername(activation?.expectedUsername);
  const expectedAccountId = safeId(activation?.expectedAccountId);
  const verifiedMediaHosts = Array.isArray(activation?.verifiedMediaHosts)
    ? activation.verifiedMediaHosts
      .filter((host): host is string => typeof host === "string")
      .map((host) => host.trim().toLowerCase())
    : [];
  const portalPermissions = Array.isArray(activation?.portalPermissions)
    ? activation.portalPermissions
      .filter((permission): permission is string => typeof permission === "string")
    : [];
  const uniqueMediaHosts = [...new Set(verifiedMediaHosts)].sort();
  const uniquePortalPermissions = [...new Set(portalPermissions)].sort();
  const exactPortalPermissions = [...REQUIRED_PERMISSIONS].sort();

  if (
    !hasExactKeys(activation, [
      "schemaId",
      "apiVersion",
      "appId",
      "appReviewStatus",
      "appReviewReceiptSha256",
      "activationReceiptSha256",
      "oauthConnectionStatus",
      "oauthConnectionReceiptSha256",
      "oauthConnectionVerifiedAt",
      "oauthAccessExpiresAt",
      "oauthScopes",
      "endpointSchemaReceiptSha256",
      "identityReceiptSha256",
      "oauthScopeReceiptSha256",
      "urlPropertyReceiptSha256",
      "cmlSchemaReceiptSha256",
      "cmlRegion",
      "expectedAccountId",
      "expectedUsername",
      "verifiedMediaHosts",
      "portalPermissions",
    ])
    || activation?.schemaId !== TIKTOK_ORGANIC_SCHEMA_ID
    || activation.apiVersion !== API_VERSION
    || !activationEvidenceIsCurrent(activation, now)
    || !SHA256.test(String(activation.appReviewReceiptSha256 ?? ""))
    || !SHA256.test(String(activation.activationReceiptSha256 ?? ""))
    || !SHA256.test(String(activation.oauthConnectionReceiptSha256 ?? ""))
    || !SHA256.test(String(activation.endpointSchemaReceiptSha256 ?? ""))
    || !SHA256.test(String(activation.identityReceiptSha256 ?? ""))
    || !SHA256.test(String(activation.oauthScopeReceiptSha256 ?? ""))
    || !SHA256.test(String(activation.urlPropertyReceiptSha256 ?? ""))
    || !SHA256.test(String(activation.cmlSchemaReceiptSha256 ?? ""))
    || !/^[A-Z]{2}$/.test(String(activation.cmlRegion ?? ""))
    || !expectedAccountId
    || expectedUsername !== "hooma.ge"
    || !Array.isArray(activation.verifiedMediaHosts)
    || activation.verifiedMediaHosts.length !== verifiedMediaHosts.length
    || verifiedMediaHosts.length !== uniqueMediaHosts.length
    || !Array.isArray(activation.portalPermissions)
    || activation.portalPermissions.length !== portalPermissions.length
    || portalPermissions.length !== uniquePortalPermissions.length
    || !verifiedMediaHosts.length
    || verifiedMediaHosts.some((host) => {
      try {
        const url = new URL(`https://${host}`);
        return url.hostname !== host || url.pathname !== "/" || url.port !== "";
      } catch {
        return true;
      }
    })
    || uniquePortalPermissions.length !== exactPortalPermissions.length
    || uniquePortalPermissions.some(
      (permission, index) => permission !== exactPortalPermissions[index],
    )
  ) {
    return null;
  }

  return {
    schemaId: TIKTOK_ORGANIC_SCHEMA_ID,
    apiVersion: API_VERSION,
    appId: TIKTOK_APPROVED_APP_ID,
    appReviewStatus: "APPROVED",
    appReviewReceiptSha256: String(activation.appReviewReceiptSha256),
    activationReceiptSha256: String(activation.activationReceiptSha256),
    oauthConnectionStatus: "ACTIVE_VERIFIED",
    oauthConnectionReceiptSha256: String(activation.oauthConnectionReceiptSha256),
    oauthConnectionVerifiedAt: String(activation.oauthConnectionVerifiedAt),
    oauthAccessExpiresAt: String(activation.oauthAccessExpiresAt),
    oauthScopes: [...new Set(activation.oauthScopes as string[])],
    endpointSchemaReceiptSha256: String(activation.endpointSchemaReceiptSha256),
    identityReceiptSha256: String(activation.identityReceiptSha256),
    oauthScopeReceiptSha256: String(activation.oauthScopeReceiptSha256),
    urlPropertyReceiptSha256: String(activation.urlPropertyReceiptSha256),
    cmlSchemaReceiptSha256: String(activation.cmlSchemaReceiptSha256),
    cmlRegion: String(activation.cmlRegion),
    expectedAccountId,
    expectedUsername,
    verifiedMediaHosts: uniqueMediaHosts,
    portalPermissions: uniquePortalPermissions,
  };
}

function selectionFingerprintPayload(receipt: JsonObject) {
  return {
    schemaVersion: receipt.schemaVersion,
    receiptType: receipt.receiptType,
    immutable: receipt.immutable,
    status: receipt.status,
    context: receipt.context,
    track: receipt.track,
    mix: receipt.mix,
    binding: receipt.binding,
    selectedAt: receipt.selectedAt,
    validUntil: receipt.validUntil,
  };
}

export function tiktokCmlSelectionFingerprint(receipt: unknown) {
  const parsed = record(receipt);
  if (!parsed) throw new TikTokOrganicError({ operation: "music", code: "CML_RECEIPT_INVALID" });
  return sha256Json(selectionFingerprintPayload(parsed));
}

export function validateTikTokCmlSelectionReceipt(
  value: unknown,
  expected: {
    accountId: string;
    postId: string;
    contentFingerprint: string;
    approvalFingerprint: string;
    videoSha256: string;
    captionSha256: string;
    region: string;
  },
  now = new Date(),
): TikTokCmlSelectionReceipt {
  const receipt = record(value);
  const context = record(receipt?.context);
  const track = record(receipt?.track);
  const mix = record(receipt?.mix);
  const binding = record(receipt?.binding);
  const selectedAt = canonicalIsoTimestamp(receipt?.selectedAt);
  const validUntil = canonicalIsoTimestamp(receipt?.validUntil);

  if (
    !hasExactKeys(receipt, [
      "schemaVersion",
      "receiptType",
      "immutable",
      "status",
      "context",
      "track",
      "mix",
      "binding",
      "selectedAt",
      "validUntil",
      "selectionFingerprint",
    ])
    || !hasExactKeys(context, ["platform", "accountId", "postId"])
    || !hasExactKeys(track, [
      "musicSoundId",
      "region",
      "placement",
      "commercialUseAllowed",
      "catalogEvidenceSha256",
    ])
    || !hasExactKeys(mix, ["musicSoundVolume", "videoOriginalSoundVolume"])
    || !hasExactKeys(binding, [
      "contentFingerprint",
      "approvalFingerprint",
      "videoSha256",
      "captionSha256",
    ])
    || receipt?.schemaVersion !== 1
    || receipt.receiptType !== "TIKTOK_COMMERCIAL_MUSIC_SELECTION"
    || receipt.immutable !== true
    || receipt.status !== "APPROVED"
    || context?.platform !== "tiktok"
    || context.accountId !== expected.accountId
    || context.postId !== expected.postId
    || track?.placement !== "ORGANIC"
    || track.commercialUseAllowed !== true
    || !safeId(track.musicSoundId)
    || track.region !== expected.region
    || !/^[A-Z]{2}$/.test(expected.region)
    || !SHA256.test(String(track.catalogEvidenceSha256 ?? ""))
    || !Number.isInteger(mix?.musicSoundVolume)
    || Number(mix?.musicSoundVolume) < 1
    || Number(mix?.musicSoundVolume) > 100
    || !Number.isInteger(mix?.videoOriginalSoundVolume)
    || Number(mix?.videoOriginalSoundVolume) < 0
    || Number(mix?.videoOriginalSoundVolume) > 100
    || binding?.contentFingerprint !== expected.contentFingerprint
    || binding.approvalFingerprint !== expected.approvalFingerprint
    || binding.videoSha256 !== expected.videoSha256
    || binding.captionSha256 !== expected.captionSha256
    || !safeId(expected.accountId)
    || !safeId(expected.postId, 160)
    || !SHA256.test(expected.contentFingerprint)
    || !SHA256.test(expected.approvalFingerprint)
    || !SHA256.test(expected.videoSha256)
    || !SHA256.test(expected.captionSha256)
    || selectedAt === null
    || validUntil === null
    || selectedAt > now.getTime() + 5 * 60 * 1_000
    || validUntil <= now.getTime()
    || validUntil <= selectedAt
    || receipt.selectionFingerprint !== tiktokCmlSelectionFingerprint(receipt)
  ) {
    throw new TikTokOrganicError({ operation: "music", code: "CML_RECEIPT_INVALID" });
  }

  return receipt as unknown as TikTokCmlSelectionReceipt;
}

export function validateTikTokOwnedMasterReceipt(
  value: unknown,
  expected: { postId: string; videoSha256: string },
): TikTokOwnedMasterReceipt {
  const receipt = record(value);
  const context = record(receipt?.context);
  const track = record(receipt?.track);
  const license = record(track?.license);
  const output = record(receipt?.output);
  const sourceReceipt = record(receipt?.sourceReceipt);
  const platforms = Array.isArray(license?.platforms) ? license.platforms : [];
  if (
    !hasExactKeys(receipt, [
      "schemaVersion", "receiptType", "immutable", "context", "track", "output", "sourceReceipt",
    ])
    || !hasExactKeys(context, ["platform", "account", "postId", "campaignId"])
    || !hasExactKeys(track, ["id", "commercialUseAllowed", "trackSha256", "license"])
    || !hasExactKeys(license, ["status", "commercialUseAllowed", "platforms", "receiptSha256"])
    || !hasExactKeys(output, ["sha256", "audioPcmSha256"])
    || !hasExactKeys(sourceReceipt, [
      "receiptType", "receiptSha256", "provenanceSha256", "sourceVoiceSha256",
    ])
    || receipt?.schemaVersion !== 1
    || receipt.receiptType !== "HOOMA_LICENSED_MUSIC_MASTER_PROVENANCE"
    || receipt.immutable !== true
    || context?.platform !== "tiktok"
    || context.account !== "@hooma.ge"
    || context.postId !== expected.postId
    || !safeId(context.campaignId, 160)
    || track?.commercialUseAllowed !== true
    || !safeId(track.id, 160)
    || !SHA256.test(String(track.trackSha256 ?? ""))
    || license?.status !== "VERIFIED"
    || license.commercialUseAllowed !== true
    || platforms.length !== 1
    || platforms[0] !== "tiktok"
    || !SHA256.test(String(license.receiptSha256 ?? ""))
    || output?.sha256 !== expected.videoSha256
    || !SHA256.test(String(output.audioPcmSha256 ?? ""))
    || sourceReceipt?.receiptType !== "HOOMA_LICENSED_VOICE_MUSIC_MASTER_PROVENANCE"
    || !SHA256.test(String(sourceReceipt.receiptSha256 ?? ""))
    || !SHA256.test(String(sourceReceipt.provenanceSha256 ?? ""))
    || !SHA256.test(String(sourceReceipt.sourceVoiceSha256 ?? ""))
    || !safeId(expected.postId, 160)
    || !SHA256.test(expected.videoSha256)
  ) {
    throw new TikTokOrganicError({ operation: "music", code: "OWNED_MASTER_RECEIPT_INVALID" });
  }
  return receipt as unknown as TikTokOwnedMasterReceipt;
}

async function defaultTransport(request: TikTokTransportRequest) {
  let response: Response;
  try {
    response = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
      redirect: "error",
    });
  } catch {
    throw new TikTokOrganicError({
      operation: request.operation,
      code: "NETWORK_FAILURE",
      retryable: true,
    });
  }

  let text: string;
  try {
    text = await response.text();
  } catch {
    throw new TikTokOrganicError({
      operation: request.operation,
      code: "RESPONSE_READ_FAILURE",
      httpStatus: response.status,
      retryable: response.status >= 500,
    });
  }
  if (Buffer.byteLength(text, "utf8") > MAX_RESPONSE_BYTES) {
    throw new TikTokOrganicError({
      operation: request.operation,
      code: "RESPONSE_TOO_LARGE",
      httpStatus: response.status,
    });
  }
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text) as unknown;
    } catch {
      throw new TikTokOrganicError({
        operation: request.operation,
        code: "INVALID_JSON_RESPONSE",
        httpStatus: response.status,
        retryable: response.status >= 500,
      });
    }
  }
  return { status: response.status, body };
}

function providerResponse(
  operation: Exclude<TikTokOperation, "music" | "activation">,
  status: number,
  body: unknown,
) {
  if (!Number.isInteger(status) || status < 100 || status > 599) {
    throw new TikTokOrganicError({ operation, code: "INVALID_TRANSPORT_RESPONSE" });
  }
  const response = record(body);
  const requestId = safeId(response?.request_id);
  if (status < 200 || status >= 300 || (response?.code !== 0 && response?.code !== "0")) {
    const code = safeDiagnostic(response?.code, `HTTP_${status}`);
    throw new TikTokOrganicError({
      operation,
      code,
      httpStatus: status,
      requestId,
      retryable: status === 408 || status === 429 || status >= 500 || code === "40100" || code === "51065",
    });
  }
  if (!response || !requestId || !record(response.data)) {
    throw new TikTokOrganicError({
      operation,
      code: "INVALID_PROVIDER_RESPONSE",
      httpStatus: status,
    });
  }
  return { response, data: record(response.data)!, requestId };
}

function accessTokenHeader(
  accessToken: string,
  operation: Exclude<TikTokOperation, "music" | "activation">,
) {
  if (!boundedString(accessToken, 16_384)) {
    throw new TikTokOrganicError({ operation, code: "ACCESS_TOKEN_INVALID" });
  }
  return {
    "Access-Token": accessToken,
    "Content-Type": "application/json",
  };
}

function canonicalPostUrl(username: string, postId: string) {
  return `https://www.tiktok.com/@${username}/video/${postId}`;
}

function optionalCount(value: unknown) {
  if (value === undefined || value === null) return null;
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new TikTokOrganicError({ operation: "metrics", code: "METRIC_VALUE_INVALID" });
  }
  return Number(value);
}

function optionalNumber(value: unknown) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new TikTokOrganicError({ operation: "metrics", code: "METRIC_VALUE_INVALID" });
  }
  return value;
}

function optionalRate(value: unknown) {
  const parsed = optionalNumber(value);
  if (parsed !== null && parsed > 1) {
    throw new TikTokOrganicError({ operation: "metrics", code: "METRIC_VALUE_INVALID" });
  }
  return parsed;
}

export class TikTokBusinessOrganicClient {
  private readonly activation: TikTokOrganicActivation | null;
  private readonly networkRequested: boolean;
  private readonly publishingRequested: boolean;
  private readonly transport: TikTokTransport;
  private readonly now: () => Date;

  constructor(options: ClientOptions = {}) {
    this.now = options.now ?? (() => new Date());
    this.activation = parseActivation(options.activation, this.now());
    this.networkRequested = options.networkEnabled === true;
    this.publishingRequested = options.publishingEnabled === true;
    this.transport = options.transport ?? defaultTransport;
  }

  connectionStatus() {
    const activationCurrent = Boolean(
      this.activation && activationEvidenceIsCurrent(this.activation, this.now()),
    );
    const networkEnabled = Boolean(
      activationCurrent
      && this.networkRequested
      && tiktokOrganicNetworkEnabled(),
    );
    const publishingEnabled = Boolean(
      networkEnabled
      && this.publishingRequested
      && tiktokOrganicPublishingEnabled(),
    );
    return {
      provider: "TIKTOK_API_FOR_BUSINESS_ORGANIC_ACCOUNTS" as const,
      schemaId: TIKTOK_ORGANIC_SCHEMA_ID,
      schemaFrozen: activationCurrent,
      networkEnabled,
      publishingEnabled,
      expectedUsername: this.activation?.expectedUsername ?? null,
      credentialsLoaded: false,
    };
  }

  private ready(operation: Exclude<TikTokOperation, "music" | "activation">) {
    if (
      !this.activation
      || !activationEvidenceIsCurrent(this.activation, this.now())
    ) {
      throw new TikTokOrganicError({ operation, code: "ACTIVATION_RECEIPTS_REQUIRED" });
    }
    if (
      !this.networkRequested
      || !tiktokOrganicNetworkEnabled()
    ) {
      throw new TikTokOrganicError({ operation, code: "NETWORK_DISABLED" });
    }
    return this.activation;
  }

  private publishReady() {
    const activation = this.ready("publish");
    if (
      !this.publishingRequested
      || !tiktokOrganicPublishingEnabled()
    ) {
      throw new TikTokOrganicError({ operation: "publish", code: "PUBLISHING_DISABLED" });
    }
    return activation;
  }

  private async send(request: TikTokTransportRequest) {
    try {
      return await this.transport(request);
    } catch (error) {
      if (error instanceof TikTokOrganicError) throw error;
      throw new TikTokOrganicError({
        operation: request.operation,
        code: "NETWORK_FAILURE",
        retryable: true,
      });
    }
  }

  private preparePublishRequest(input: TikTokOrganicPublishInput) {
    const activation = this.publishReady();
    const now = this.now();
    const publishRecord = record(input);
    const settingsRecord = record(publishRecord?.settings);
    const mediaRecord = record(publishRecord?.media);
    if (
      !hasExactKeys(publishRecord, [
        "accountId",
        "postId",
        "approvalStatus",
        "publishingAllowed",
        "rightsStatus",
        "visualClaimsStatus",
        "productAvailable",
        "remoteDuplicateStatus",
        "remoteDuplicateReceiptSha256",
        "scheduledAt",
        "publishNotAfter",
        "contentFingerprint",
        "approvalFingerprint",
        "videoSha256",
        "caption",
        "captionSha256",
        "idempotencyKey",
        "musicMode",
        "musicReceipt",
        "settings",
        "media",
      ])
      || !hasExactKeys(
        settingsRecord,
        [
          "commentsEnabled",
          "duetEnabled",
          "stitchEnabled",
          "aiGeneratedContent",
          "commercialContent",
          "promotionType",
          "uploadToDraft",
          "adsOnly",
          "shareToFacebook",
        ],
        ["thumbnailOffsetMs"],
      )
      || !hasExactKeys(mediaRecord, [
        "videoUrl",
        "sha256",
        "expiresAt",
        "signatureReferenceSha256",
        "urlPropertyReceiptSha256",
      ])
      || input.accountId !== activation.expectedAccountId
      || !safeId(input.postId, 160)
      || input.approvalStatus !== "APPROVED_EXACT"
      || input.publishingAllowed !== true
      || input.rightsStatus !== "CLEARED"
      || input.visualClaimsStatus !== "CLEARED"
      || input.productAvailable !== true
      || input.remoteDuplicateStatus !== "CLEAR"
      || !SHA256.test(input.remoteDuplicateReceiptSha256)
      || !SHA256.test(input.contentFingerprint)
      || input.approvalFingerprint !== input.contentFingerprint
      || !SHA256.test(input.videoSha256)
      || !boundedCaption(input.caption)
      || input.captionSha256 !== sha256Text(input.caption)
      || !boundedString(input.idempotencyKey, 240)
      || !new Set(["TIKTOK_CML", "HOOMA_OWNED_MASTER"]).has(input.musicMode)
      || canonicalIsoTimestamp(input.scheduledAt) === null
      || canonicalIsoTimestamp(input.publishNotAfter) === null
      || canonicalIsoTimestamp(input.scheduledAt)! > now.getTime()
      || canonicalIsoTimestamp(input.publishNotAfter)! < now.getTime()
    ) {
      throw new TikTokOrganicError({ operation: "publish", code: "POLICY_GATE_MISMATCH" });
    }
    if (
      input.settings.commentsEnabled !== true
      || typeof input.settings.duetEnabled !== "boolean"
      || typeof input.settings.stitchEnabled !== "boolean"
      || input.settings.aiGeneratedContent !== true
      || input.settings.commercialContent !== true
      || input.settings.promotionType !== "YOUR_BRAND"
      || input.settings.uploadToDraft !== false
      || input.settings.adsOnly !== false
      || input.settings.shareToFacebook !== false
      || (
        input.settings.thumbnailOffsetMs !== undefined
        && (!Number.isInteger(input.settings.thumbnailOffsetMs)
          || input.settings.thumbnailOffsetMs < 0
          || input.settings.thumbnailOffsetMs > 600_000)
      )
    ) {
      throw new TikTokOrganicError({ operation: "publish", code: "DISCLOSURE_GATE_MISMATCH" });
    }

    let videoUrl: URL;
    try {
      videoUrl = new URL(input.media.videoUrl);
    } catch {
      throw new TikTokOrganicError({ operation: "publish", code: "STAGING_URL_INVALID" });
    }
    const mediaExpiresAt = canonicalIsoTimestamp(input.media.expiresAt);
    if (
      videoUrl.protocol !== "https:"
      || videoUrl.username
      || videoUrl.password
      || videoUrl.hash
      || !activation.verifiedMediaHosts.includes(videoUrl.hostname.toLowerCase())
      || input.media.sha256 !== input.videoSha256
      || !SHA256.test(input.media.signatureReferenceSha256)
      || input.media.urlPropertyReceiptSha256 !== activation.urlPropertyReceiptSha256
      || mediaExpiresAt === null
      || mediaExpiresAt < now.getTime() + MIN_STAGING_TTL_MS
    ) {
      throw new TikTokOrganicError({ operation: "publish", code: "STAGING_GATE_MISMATCH" });
    }

    const postInfo: JsonObject = {
      caption: input.caption,
      is_brand_organic: true,
      is_branded_content: false,
      disable_comment: false,
      disable_duet: !input.settings.duetEnabled,
      disable_stitch: !input.settings.stitchEnabled,
      is_ai_generated: true,
      upload_to_draft: false,
      is_ads_only: false,
    };
    let cmlSelectionFingerprint: string | null = null;
    let musicReceiptSha256: string;
    if (input.musicMode === "TIKTOK_CML") {
      const music = validateTikTokCmlSelectionReceipt(input.musicReceipt, {
        accountId: input.accountId,
        postId: input.postId,
        contentFingerprint: input.contentFingerprint,
        approvalFingerprint: input.approvalFingerprint,
        videoSha256: input.videoSha256,
        captionSha256: input.captionSha256,
        region: activation.cmlRegion,
      }, now);
      cmlSelectionFingerprint = music.selectionFingerprint;
      musicReceiptSha256 = sha256Json(music);
      postInfo.music_sound_info = {
        music_sound_id: music.track.musicSoundId,
        music_sound_volume: music.mix.musicSoundVolume,
        video_original_sound_volume: music.mix.videoOriginalSoundVolume,
      };
    } else {
      const music = validateTikTokOwnedMasterReceipt(input.musicReceipt, {
        postId: input.postId,
        videoSha256: input.videoSha256,
      });
      musicReceiptSha256 = sha256Json(music);
      // The exact licensed music and voice are already mixed into the immutable
      // master. Omitting music_sound_info prevents TikTok from replacing it.
    }
    if (input.settings.thumbnailOffsetMs !== undefined) {
      postInfo.thumbnail_offset = input.settings.thumbnailOffsetMs;
    }
    const body = {
      business_id: input.accountId,
      video_url: videoUrl.toString(),
      post_info: postInfo,
    };
    const requestFingerprint = sha256Json({
      schemaId: TIKTOK_ORGANIC_SCHEMA_ID,
      accountId: input.accountId,
      postId: input.postId,
      contentFingerprint: input.contentFingerprint,
      videoSha256: input.videoSha256,
      captionSha256: input.captionSha256,
      videoHost: videoUrl.hostname.toLowerCase(),
      idempotencyKey: input.idempotencyKey,
      musicMode: input.musicMode,
      musicReceiptSha256,
      settings: input.settings,
    });
    return {
      activation,
      now,
      body,
      requestFingerprint,
      musicReceiptSha256,
      cmlSelectionFingerprint,
    };
  }

  preparePublishVideo(input: TikTokOrganicPublishInput) {
    const prepared = this.preparePublishRequest(input);
    return {
      provider: "tiktok" as const,
      operation: "publish" as const,
      schemaId: TIKTOK_ORGANIC_SCHEMA_ID,
      accountId: input.accountId,
      postId: input.postId,
      contentFingerprint: input.contentFingerprint,
      providerRequestSha256: prepared.requestFingerprint,
      musicMode: input.musicMode,
      musicReceiptSha256: prepared.musicReceiptSha256,
      cmlSelectionFingerprint: prepared.cmlSelectionFingerprint,
    };
  }

  async publishVideo(input: TikTokOrganicPublishInput, accessToken: string) {
    const prepared = this.preparePublishRequest(input);
    const url = new URL(PUBLISH_PATH, API_ORIGIN);
    const result = await this.send({
      operation: "publish",
      url,
      method: "POST",
      headers: accessTokenHeader(accessToken, "publish"),
      body: JSON.stringify(prepared.body),
    });
    const response = providerResponse("publish", result.status, result.body);
    const shareId = safeId(response.data.share_id);
    if (!shareId) {
      throw new TikTokOrganicError({
        operation: "publish",
        code: "PUBLISH_ID_MISSING",
        requestId: response.requestId,
      });
    }
    return {
      provider: "tiktok" as const,
      operation: "publish" as const,
      status: "PROCESSING_REMOTE" as const,
      schemaId: TIKTOK_ORGANIC_SCHEMA_ID,
      accountId: input.accountId,
      postId: input.postId,
      contentFingerprint: input.contentFingerprint,
      providerRequestId: response.requestId,
      providerPublishId: shareId,
      providerPostId: null,
      providerUrl: null,
      providerRequestSha256: prepared.requestFingerprint,
      providerResponseSha256: sha256Json({
        code: response.response.code,
        requestId: response.requestId,
        shareId,
      }),
      musicMode: input.musicMode,
      musicReceiptSha256: prepared.musicReceiptSha256,
      cmlSelectionFingerprint: prepared.cmlSelectionFingerprint,
      acceptedAt: prepared.now.toISOString(),
    };
  }

  async fetchPublishStatus(
    input: { accountId: string; publishId: string },
    accessToken: string,
  ) {
    const activation = this.ready("publish_status");
    const statusInput = record(input);
    if (
      !hasExactKeys(statusInput, ["accountId", "publishId"])
      || input.accountId !== activation.expectedAccountId
      || !safeId(input.publishId)
    ) {
      throw new TikTokOrganicError({ operation: "publish_status", code: "STATUS_INPUT_INVALID" });
    }
    const url = new URL(STATUS_PATH, API_ORIGIN);
    url.searchParams.set("business_id", input.accountId);
    url.searchParams.set("publish_id", input.publishId);
    const result = await this.send({
      operation: "publish_status",
      url,
      method: "GET",
      headers: accessTokenHeader(accessToken, "publish_status"),
    });
    const response = providerResponse("publish_status", result.status, result.body);
    const status = safeId(response.data.status, 80);
    const reason = safeId(response.data.reason, 120);
    const collectedAt = this.now().toISOString();
    const base = {
      provider: "tiktok" as const,
      operation: "publish_status" as const,
      schemaId: TIKTOK_ORGANIC_SCHEMA_ID,
      accountId: input.accountId,
      providerRequestId: response.requestId,
      providerPublishId: input.publishId,
      collectedAt,
    };

    if (status === "PROCESSING_DOWNLOAD") {
      return {
        ...base,
        status: "PROCESSING_REMOTE" as const,
        providerPostId: null,
        providerUrl: null,
        reason: null,
        retryable: true,
        providerResponseSha256: sha256Json({ status, requestId: response.requestId }),
      };
    }
    if (status === "PUBLISH_COMPLETE") {
      const postIds = Array.isArray(response.data.post_ids)
        ? response.data.post_ids.filter((postId): postId is string => typeof postId === "string")
        : [];
      if (postIds.length === 0) {
        return {
          ...base,
          status: "PROCESSING_REMOTE" as const,
          providerPostId: null,
          providerUrl: null,
          reason: "POST_ID_PENDING" as const,
          retryable: true,
          providerResponseSha256: sha256Json({ status, postIds: [], requestId: response.requestId }),
        };
      }
      if (postIds.length !== 1 || !TIKTOK_POST_ID.test(postIds[0]!)) {
        throw new TikTokOrganicError({
          operation: "publish_status",
          code: "POST_ID_RESPONSE_INVALID",
          requestId: response.requestId,
        });
      }
      const providerPostId = postIds[0]!;
      const providerUrl = canonicalPostUrl(activation.expectedUsername, providerPostId);
      return {
        ...base,
        status: "PUBLISHED" as const,
        providerPostId,
        providerUrl,
        reason: null,
        retryable: false,
        providerResponseSha256: sha256Json({
          status,
          postIds: [providerPostId],
          requestId: response.requestId,
        }),
      };
    }
    if (status === "FAILED") {
      if (!reason) {
        throw new TikTokOrganicError({
          operation: "publish_status",
          code: "FAILURE_REASON_MISSING",
          requestId: response.requestId,
        });
      }
      return {
        ...base,
        status: "FAILED_REVIEW_REQUIRED" as const,
        providerPostId: null,
        providerUrl: null,
        reason,
        retryable: ["internal", "video_pull_failed"].includes(reason),
        providerResponseSha256: sha256Json({ status, reason, requestId: response.requestId }),
      };
    }
    if (status === "SEND_TO_USER_INBOX") {
      return {
        ...base,
        status: "FAILED_REVIEW_REQUIRED" as const,
        providerPostId: null,
        providerUrl: null,
        reason: "UNEXPECTED_DRAFT_DELIVERY" as const,
        retryable: false,
        providerResponseSha256: sha256Json({ status, requestId: response.requestId }),
      };
    }
    throw new TikTokOrganicError({
      operation: "publish_status",
      code: "UNKNOWN_PUBLISH_STATUS",
      requestId: response.requestId,
    });
  }

  async lookupOwnedPostDuplicate(
    input: {
      accountId: string;
      captionSha256: string;
      notBefore: string;
      maxPages: number;
    },
    accessToken: string,
  ) {
    const activation = this.ready("duplicate_lookup");
    const parsedInput = record(input);
    const notBefore = canonicalIsoTimestamp(input.notBefore);
    if (
      !hasExactKeys(parsedInput, ["accountId", "captionSha256", "notBefore", "maxPages"])
      || input.accountId !== activation.expectedAccountId
      || !SHA256.test(input.captionSha256)
      || notBefore === null
      || !Number.isInteger(input.maxPages)
      || input.maxPages < 1
      || input.maxPages > 5
    ) {
      throw new TikTokOrganicError({
        operation: "duplicate_lookup",
        code: "DUPLICATE_LOOKUP_INPUT_INVALID",
      });
    }
    let cursor: number | null = null;
    let scannedCount = 0;
    const seenCursors = new Set<number>();
    for (let page = 0; page < input.maxPages; page += 1) {
      const url = new URL(VIDEO_LIST_PATH, API_ORIGIN);
      url.searchParams.set("business_id", input.accountId);
      url.searchParams.set("fields", JSON.stringify(DUPLICATE_FIELDS));
      url.searchParams.set("max_count", "20");
      if (cursor !== null) url.searchParams.set("cursor", String(cursor));
      const result = await this.send({
        operation: "duplicate_lookup",
        url,
        method: "GET",
        headers: accessTokenHeader(accessToken, "duplicate_lookup"),
      });
      const response = providerResponse("duplicate_lookup", result.status, result.body);
      const videos = Array.isArray(response.data.videos) ? response.data.videos : null;
      if (!videos || typeof response.data.has_more !== "boolean") {
        throw new TikTokOrganicError({
          operation: "duplicate_lookup",
          code: "DUPLICATE_LOOKUP_RESPONSE_INVALID",
          requestId: response.requestId,
        });
      }
      let reachedOlderPost = false;
      for (const value of videos) {
        const video = record(value);
        const postId = safeId(video?.item_id);
        const caption = typeof video?.caption === "string"
          && video.caption.length <= 2_200
          && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(video.caption)
          ? video.caption
          : null;
        const createTime = Number(video?.create_time);
        if (
          !postId
          || !TIKTOK_POST_ID.test(postId)
          || caption === null
          || !Number.isSafeInteger(createTime)
          || createTime <= 0
        ) {
          throw new TikTokOrganicError({
            operation: "duplicate_lookup",
            code: "DUPLICATE_LOOKUP_RESPONSE_INVALID",
            requestId: response.requestId,
          });
        }
        if (createTime * 1_000 < notBefore) {
          reachedOlderPost = true;
          break;
        }
        scannedCount += 1;
        if (sha256Text(caption) === input.captionSha256) {
          return {
            provider: "tiktok" as const,
            operation: "duplicate_lookup" as const,
            status: "DUPLICATE" as const,
            accountId: input.accountId,
            scannedCount,
            duplicate: {
              postId,
              providerUrl: canonicalPostUrl(activation.expectedUsername, postId),
            },
            providerRequestId: response.requestId,
            collectedAt: this.now().toISOString(),
          };
        }
      }
      if (reachedOlderPost || response.data.has_more === false) {
        return {
          provider: "tiktok" as const,
          operation: "duplicate_lookup" as const,
          status: "CLEAR" as const,
          accountId: input.accountId,
          scannedCount,
          duplicate: null,
          providerRequestId: response.requestId,
          collectedAt: this.now().toISOString(),
        };
      }
      const nextCursor = Number(response.data.cursor);
      if (!Number.isSafeInteger(nextCursor) || nextCursor <= 0 || seenCursors.has(nextCursor)) {
        throw new TikTokOrganicError({
          operation: "duplicate_lookup",
          code: "DUPLICATE_LOOKUP_CURSOR_INVALID",
          requestId: response.requestId,
        });
      }
      seenCursors.add(nextCursor);
      cursor = nextCursor;
    }
    return {
      provider: "tiktok" as const,
      operation: "duplicate_lookup" as const,
      status: "INCONCLUSIVE_PAGE_LIMIT" as const,
      accountId: input.accountId,
      scannedCount,
      duplicate: null,
      providerRequestId: null,
      collectedAt: this.now().toISOString(),
    };
  }

  async fetchVideoSettings(
    input: { accountId: string },
    accessToken: string,
  ) {
    const activation = this.ready("settings");
    const parsedInput = record(input);
    if (
      !hasExactKeys(parsedInput, ["accountId"])
      || input.accountId !== activation.expectedAccountId
    ) {
      throw new TikTokOrganicError({
        operation: "settings",
        code: "VIDEO_SETTINGS_INPUT_INVALID",
      });
    }
    const url = new URL(VIDEO_SETTINGS_PATH, API_ORIGIN);
    url.searchParams.set("business_id", input.accountId);
    const result = await this.send({
      operation: "settings",
      url,
      method: "GET",
      headers: accessTokenHeader(accessToken, "settings"),
    });
    const response = providerResponse("settings", result.status, result.body);
    const privacyLevels = Array.isArray(response.data.privacy_level_options)
      ? response.data.privacy_level_options
      : null;
    const allowedPrivacyLevels = new Set([
      "PUBLIC_TO_EVERYONE",
      "MUTUAL_FOLLOW_FRIENDS",
      "SELF_ONLY",
      "FOLLOWER_OF_CREATOR",
    ]);
    if (typeof response.data.comment_disabled !== "boolean") {
      throw new TikTokOrganicError({
        operation: "settings",
        code: "VIDEO_SETTINGS_COMMENT_INVALID",
        requestId: response.requestId,
      });
    }
    if (typeof response.data.duet_disabled !== "boolean") {
      throw new TikTokOrganicError({
        operation: "settings",
        code: "VIDEO_SETTINGS_DUET_INVALID",
        requestId: response.requestId,
      });
    }
    if (typeof response.data.stitch_disabled !== "boolean") {
      throw new TikTokOrganicError({
        operation: "settings",
        code: "VIDEO_SETTINGS_STITCH_INVALID",
        requestId: response.requestId,
      });
    }
    if (
      !Number.isInteger(response.data.max_video_post_duration_sec)
      || Number(response.data.max_video_post_duration_sec) < 3
      || Number(response.data.max_video_post_duration_sec) > 600
    ) {
      throw new TikTokOrganicError({
        operation: "settings",
        code: "VIDEO_SETTINGS_DURATION_INVALID",
        requestId: response.requestId,
      });
    }
    if (
      !privacyLevels
      || !privacyLevels.length
      || privacyLevels.some((level) => typeof level !== "string" || !allowedPrivacyLevels.has(level))
    ) {
      throw new TikTokOrganicError({
        operation: "settings",
        code: "VIDEO_SETTINGS_PRIVACY_INVALID",
        requestId: response.requestId,
      });
    }
    return {
      provider: "tiktok" as const,
      operation: "settings" as const,
      accountId: input.accountId,
      commentDisabled: response.data.comment_disabled,
      duetDisabled: response.data.duet_disabled,
      stitchDisabled: response.data.stitch_disabled,
      maxVideoPostDurationSec: Number(response.data.max_video_post_duration_sec),
      publicPostingAvailable: privacyLevels.includes("PUBLIC_TO_EVERYONE"),
      providerRequestId: response.requestId,
      collectedAt: this.now().toISOString(),
    };
  }

  async fetchOwnedPostMetrics(
    input: { accountId: string; postId: string },
    accessToken: string,
  ) {
    const activation = this.ready("metrics");
    const metricsInput = record(input);
    if (
      !hasExactKeys(metricsInput, ["accountId", "postId"])
      || input.accountId !== activation.expectedAccountId
      || !TIKTOK_POST_ID.test(input.postId)
    ) {
      throw new TikTokOrganicError({ operation: "metrics", code: "METRICS_INPUT_INVALID" });
    }
    const url = new URL(VIDEO_LIST_PATH, API_ORIGIN);
    url.searchParams.set("business_id", input.accountId);
    url.searchParams.set("filters", JSON.stringify({ video_ids: [input.postId], ad_post_only: false }));
    url.searchParams.set("fields", JSON.stringify(METRIC_FIELDS));
    url.searchParams.set("max_count", "1");
    const result = await this.send({
      operation: "metrics",
      url,
      method: "GET",
      headers: accessTokenHeader(accessToken, "metrics"),
    });
    const response = providerResponse("metrics", result.status, result.body);
    const videos = Array.isArray(response.data.videos) ? response.data.videos : [];
    const collectedAt = this.now().toISOString();
    const emptyMetrics = {
      views: null,
      likes: null,
      comments: null,
      shares: null,
      favorites: null,
      reach: null,
      totalWatchTimeSeconds: null,
      averageWatchTimeSeconds: null,
      fullVideoWatchedRate: null,
      newFollowers: null,
      profileViews: null,
      websiteClicks: null,
    };
    if (videos.length === 0) {
      return {
        provider: "tiktok" as const,
        operation: "metrics" as const,
        schemaId: TIKTOK_ORGANIC_SCHEMA_ID,
        status: "UNAVAILABLE" as const,
        accountId: input.accountId,
        providerPostId: input.postId,
        providerUrl: canonicalPostUrl(activation.expectedUsername, input.postId),
        providerRequestId: response.requestId,
        collectedAt,
        metrics: emptyMetrics,
        providerResponseSha256: sha256Json({ videos: [], requestId: response.requestId }),
      };
    }
    if (videos.length !== 1) {
      throw new TikTokOrganicError({
        operation: "metrics",
        code: "METRICS_RESPONSE_AMBIGUOUS",
        requestId: response.requestId,
      });
    }
    const video = record(videos[0]);
    if (!video || video.item_id !== input.postId) {
      throw new TikTokOrganicError({
        operation: "metrics",
        code: "METRICS_IDENTITY_MISMATCH",
        requestId: response.requestId,
      });
    }
    const metrics = {
      views: optionalCount(video.video_views),
      likes: optionalCount(video.likes),
      comments: optionalCount(video.comments),
      shares: optionalCount(video.shares),
      favorites: optionalCount(video.favorites),
      reach: optionalCount(video.reach),
      totalWatchTimeSeconds: optionalNumber(video.total_time_watched),
      averageWatchTimeSeconds: optionalNumber(video.average_time_watched),
      fullVideoWatchedRate: optionalRate(video.full_video_watched_rate),
      newFollowers: optionalCount(video.new_followers),
      profileViews: optionalCount(video.profile_views),
      websiteClicks: optionalCount(video.website_clicks),
    };
    const shareUrl = boundedString(video.share_url, 2_048);
    if (shareUrl) {
      let parsed: URL;
      try {
        parsed = new URL(shareUrl);
      } catch {
        throw new TikTokOrganicError({ operation: "metrics", code: "POST_URL_INVALID" });
      }
      if (
        parsed.protocol !== "https:"
        || !new Set(["www.tiktok.com", "tiktok.com"]).has(parsed.hostname.toLowerCase())
        || parsed.pathname.toLowerCase()
          !== `/@${activation.expectedUsername}/video/${input.postId}`.toLowerCase()
      ) {
        throw new TikTokOrganicError({ operation: "metrics", code: "POST_URL_INVALID" });
      }
    }
    return {
      provider: "tiktok" as const,
      operation: "metrics" as const,
      schemaId: TIKTOK_ORGANIC_SCHEMA_ID,
      status: "AVAILABLE" as const,
      accountId: input.accountId,
      providerPostId: input.postId,
      providerUrl: canonicalPostUrl(activation.expectedUsername, input.postId),
      providerRequestId: response.requestId,
      collectedAt,
      metrics,
      providerResponseSha256: sha256Json({
        itemId: input.postId,
        metrics,
        requestId: response.requestId,
      }),
    };
  }
}
