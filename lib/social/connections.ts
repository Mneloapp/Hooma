import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { providerConfig, type SocialProvider } from "./config";
import {
  decryptSocialToken,
  encryptSocialToken,
  isEncryptedSocialSecretEnvelope,
  type EncryptedTokenEnvelope,
} from "./token-crypto";
import {
  asRecord,
  assertRequiredScopes,
  normalizedUsername,
  providerErrorCode,
  SocialProviderError,
} from "./provider-client";

const TIKTOK_REFRESH_MARGIN_SECONDS = 6 * 60 * 60;
const INSTAGRAM_REFRESH_AFTER_SECONDS = 45 * 24 * 60 * 60;
const TRANSIENT_RETRY_SECONDS = 15 * 60;

type SocialIdentity = {
  accountId: string;
  username: string;
  snapshot: Record<string, string | null>;
};

export type NewSocialConnection = {
  provider: SocialProvider;
  tokenType: "Bearer";
  scopes: string[];
  accessToken: string;
  refreshToken: string | null;
  expiresIn: number;
  refreshTokenExpiresIn: number | null;
  identity: SocialIdentity;
};

export type SocialConnectionRefreshClaim = {
  provider: SocialProvider;
  externalAccountId: string;
  username: string;
  scopes: string[];
  accessTokenEnvelope: EncryptedTokenEnvelope;
  refreshTokenEnvelope: EncryptedTokenEnvelope | null;
  tokenVersion: number;
  refreshLeaseId: string;
};

function adminClient() {
  const admin = createAdminClient() as any;
  if (!admin) throw new Error("SOCIAL_DATABASE_UNAVAILABLE");
  return admin;
}

function safeIdentifier(value: unknown, maximum = 256) {
  if (typeof value !== "string" || value.length < 1 || value.length > maximum) return null;
  return /[\u0000-\u001f\u007f]/.test(value) ? null : value;
}

function safeUuid(value: unknown) {
  return typeof value === "string"
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
    ? value
    : null;
}

function envelope(value: unknown): EncryptedTokenEnvelope | null {
  return isEncryptedSocialSecretEnvelope(value) ? value : null;
}

function databaseErrorCode(error: unknown) {
  const raw = providerErrorCode(error)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80);
  return /^[A-Z0-9_]{3,80}$/.test(raw) ? raw : "UNEXPECTED_FAILURE";
}

function futureIso(now: Date, seconds: number) {
  if (!Number.isInteger(seconds) || seconds <= 0 || seconds > 400_000_000) {
    throw new Error("SOCIAL_TOKEN_LIFETIME_INVALID");
  }
  return new Date(now.getTime() + seconds * 1_000).toISOString();
}

function refreshAfterIso(provider: SocialProvider, now: Date, expiresIn: number) {
  const offset = provider === "tiktok"
    ? Math.max(5 * 60, expiresIn - TIKTOK_REFRESH_MARGIN_SECONDS)
    : Math.min(INSTAGRAM_REFRESH_AFTER_SECONDS, Math.max(24 * 60 * 60, expiresIn - 7 * 24 * 60 * 60));
  return futureIso(now, offset);
}

function validateConnection(input: NewSocialConnection) {
  const config = providerConfig(input.provider);
  const username = normalizedUsername(input.identity.username);
  if (
    !safeIdentifier(input.identity.accountId)
    || !username
    || username !== config.expectedUsername
    || input.tokenType !== "Bearer"
    || !input.accessToken
    || (input.provider === "tiktok" && !input.refreshToken)
    || (input.provider === "instagram" && input.refreshToken !== null)
  ) {
    throw new SocialProviderError({
      provider: input.provider,
      stage: "identity",
      code: "ACCOUNT_IDENTITY_MISMATCH",
    });
  }
  assertRequiredScopes(input.provider, "token_exchange", input.scopes, config.requiredScopes);
  if (input.provider === "instagram" && input.expiresIn < 24 * 60 * 60) {
    throw new SocialProviderError({
      provider: input.provider,
      stage: "token_exchange",
      code: "LONG_LIVED_TOKEN_REQUIRED",
    });
  }
  return { username, accountId: input.identity.accountId };
}

export async function recordSocialOAuthEvent(
  actorId: string | null,
  provider: SocialProvider,
  action: "social_oauth_denied" | "social_oauth_failed" | "social_oauth_state_rejected",
  errorCode: string,
) {
  const admin = adminClient();
  const safeCode = /^[A-Za-z0-9_.:-]{1,120}$/.test(errorCode)
    ? errorCode
    : "UNEXPECTED_FAILURE";
  const { error } = await admin.from("audit_log").insert({
    actor_id: actorId,
    action,
    entity_type: "social_connection",
    entity_id: provider,
    metadata: { provider, error_code: safeCode },
  });
  if (error) throw new Error(`SOCIAL_AUDIT_FAILED:${error.code ?? "UNKNOWN"}`);
}

export async function storeSocialConnection(input: NewSocialConnection, actorId: string) {
  const { accountId, username } = validateConnection(input);
  if (!safeUuid(actorId)) throw new Error("SOCIAL_ACTOR_INVALID");
  const now = new Date();
  const accessTokenEnvelope = encryptSocialToken(
    input.accessToken,
    input.provider,
    accountId,
    "access_token",
  );
  const refreshTokenEnvelope = input.refreshToken
    ? encryptSocialToken(input.refreshToken, input.provider, accountId, "refresh_token")
    : null;
  const admin = adminClient();
  const { data, error } = await admin.rpc("upsert_social_connection", {
    requested_provider: input.provider,
    requested_external_account_id: accountId,
    requested_username: username,
    requested_token_type: input.tokenType,
    requested_scopes: [...new Set(input.scopes)].sort(),
    requested_access_token_enc: accessTokenEnvelope,
    requested_refresh_token_enc: refreshTokenEnvelope,
    requested_access_expires_at: futureIso(now, input.expiresIn),
    requested_refresh_expires_at: input.refreshTokenExpiresIn
      ? futureIso(now, input.refreshTokenExpiresIn)
      : null,
    requested_issued_at: now.toISOString(),
    requested_refresh_after: refreshAfterIso(input.provider, now, input.expiresIn),
    requested_connected_by: actorId,
    requested_identity_snapshot: input.identity.snapshot,
  });
  if (error || data !== true) {
    throw new Error(`SOCIAL_CONNECTION_STORE_FAILED:${error?.code ?? "UNKNOWN"}`);
  }
}

export async function claimSocialConnectionRefresh(provider: SocialProvider) {
  const admin = adminClient();
  const { data, error } = await admin.rpc("claim_social_connection_refresh", {
    requested_provider: provider,
    requested_lease_seconds: 120,
  });
  if (error) throw new Error(`SOCIAL_REFRESH_CLAIM_FAILED:${error.code ?? "UNKNOWN"}`);
  if (data === null) return null;
  const record = asRecord(data);
  const externalAccountId = safeIdentifier(record?.external_account_id);
  const username = normalizedUsername(record?.username);
  const accessTokenEnvelope = envelope(record?.access_token_enc);
  const refreshTokenEnvelope = record?.refresh_token_enc === null
    ? null
    : envelope(record?.refresh_token_enc);
  const tokenVersion = Number.isInteger(record?.token_version) && Number(record?.token_version) > 0
    ? Number(record?.token_version)
    : null;
  const refreshLeaseId = safeUuid(record?.refresh_lease_id);
  const scopes = Array.isArray(record?.scopes)
    ? record.scopes.filter((scope): scope is string => typeof scope === "string")
    : [];
  if (
    record?.provider !== provider
    || record?.status !== "active"
    || !externalAccountId
    || !username
    || !accessTokenEnvelope
    || (provider === "tiktok" && !refreshTokenEnvelope)
    || !tokenVersion
    || !refreshLeaseId
  ) {
    throw new Error("SOCIAL_REFRESH_CLAIM_INVALID");
  }
  return {
    provider,
    externalAccountId,
    username,
    scopes,
    accessTokenEnvelope,
    refreshTokenEnvelope,
    tokenVersion,
    refreshLeaseId,
  } satisfies SocialConnectionRefreshClaim;
}

export function decryptClaimedSocialToken(
  claim: SocialConnectionRefreshClaim,
  kind: "access" | "refresh",
) {
  const tokenEnvelope = kind === "access"
    ? claim.accessTokenEnvelope
    : claim.refreshTokenEnvelope;
  if (!tokenEnvelope) throw new Error("SOCIAL_REFRESH_TOKEN_UNAVAILABLE");
  return decryptSocialToken(
    tokenEnvelope,
    claim.provider,
    claim.externalAccountId,
    kind === "access" ? "access_token" : "refresh_token",
  );
}

export async function completeSocialConnectionRefresh(
  claim: SocialConnectionRefreshClaim,
  input: NewSocialConnection,
) {
  if (
    claim.provider !== input.provider
    || claim.externalAccountId !== input.identity.accountId
    || claim.username !== normalizedUsername(input.identity.username)
  ) {
    throw new SocialProviderError({
      provider: claim.provider,
      stage: "identity",
      code: "REFRESH_IDENTITY_MISMATCH",
    });
  }
  const { accountId, username } = validateConnection(input);
  const now = new Date();
  const accessTokenEnvelope = encryptSocialToken(
    input.accessToken,
    input.provider,
    accountId,
    "access_token",
  );
  const refreshTokenEnvelope = input.refreshToken
    ? encryptSocialToken(input.refreshToken, input.provider, accountId, "refresh_token")
    : null;
  const admin = adminClient();
  const { data, error } = await admin.rpc("complete_social_connection_refresh", {
    requested_provider: claim.provider,
    requested_lease_id: claim.refreshLeaseId,
    requested_token_version: claim.tokenVersion,
    requested_username: username,
    requested_scopes: [...new Set(input.scopes)].sort(),
    requested_access_token_enc: accessTokenEnvelope,
    requested_refresh_token_enc: refreshTokenEnvelope,
    requested_access_expires_at: futureIso(now, input.expiresIn),
    requested_refresh_expires_at: input.refreshTokenExpiresIn
      ? futureIso(now, input.refreshTokenExpiresIn)
      : null,
    requested_issued_at: now.toISOString(),
    requested_refresh_after: refreshAfterIso(input.provider, now, input.expiresIn),
    requested_identity_snapshot: input.identity.snapshot,
  });
  if (error || data !== true) {
    throw new Error(`SOCIAL_REFRESH_COMPLETE_FAILED:${error?.code ?? "RACE"}`);
  }
}

export async function failSocialConnectionRefresh(
  claim: SocialConnectionRefreshClaim,
  error: unknown,
  reauthorizationRequired: boolean,
) {
  const admin = adminClient();
  const errorCode = databaseErrorCode(error);
  const retryAfter = new Date(Date.now() + TRANSIENT_RETRY_SECONDS * 1_000).toISOString();
  const { data, error: databaseError } = await admin.rpc("fail_social_connection_refresh", {
    requested_provider: claim.provider,
    requested_lease_id: claim.refreshLeaseId,
    requested_token_version: claim.tokenVersion,
    requested_error_code: errorCode,
    requested_reauthorization_required: reauthorizationRequired,
    requested_retry_after: retryAfter,
  });
  if (databaseError || data !== true) {
    throw new Error(`SOCIAL_REFRESH_FAILURE_STORE_FAILED:${databaseError?.code ?? "RACE"}`);
  }
}
