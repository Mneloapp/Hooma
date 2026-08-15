import "server-only";

import { providerConfig } from "../config";
import {
  asRecord,
  assertRequiredScopes,
  normalizedUsername,
  positiveInteger,
  providerFetchJson,
  SocialProviderError,
} from "../provider-client";

const TOKEN_URL = "https://business-api.tiktok.com/open_api/v1.3/tt_user/oauth2/token/";
const REFRESH_URL = "https://business-api.tiktok.com/open_api/v1.3/tt_user/oauth2/refresh_token/";
const IDENTITY_URL = "https://business-api.tiktok.com/open_api/v1.3/business/get/";
const SCOPE_IDENTIFIER_PATTERN = /^[A-Za-z0-9._:-]{2,120}$/;

export type TikTokOAuthToken = {
  accessToken: string;
  refreshToken: string;
  tokenType: "Bearer";
  scopes: string[];
  expiresIn: number;
  refreshTokenExpiresIn: number;
  openId: string;
};

export type TikTokOAuthIdentity = {
  accountId: string;
  username: string;
  displayName: string | null;
};

function boundedString(value: unknown, maximum = 4_096) {
  return typeof value === "string"
    && value.length > 0
    && value.length <= maximum
    && !/[\u0000-\u001f\u007f]/.test(value)
    ? value
    : null;
}

function responseData(
  body: unknown,
  stage: "token_exchange" | "token_refresh" | "identity",
) {
  const record = asRecord(body);
  const requestId = boundedString(record?.request_id, 256);
  if (record?.code !== 0) {
    throw new SocialProviderError({
      provider: "tiktok",
      stage,
      code: typeof record?.code === "number" || typeof record?.code === "string"
        ? String(record.code)
        : "INVALID_PROVIDER_RESPONSE",
      requestId,
    });
  }
  const data = asRecord(record?.data);
  if (!data) {
    throw new SocialProviderError({
      provider: "tiktok",
      stage,
      code: "INVALID_PROVIDER_RESPONSE",
      requestId,
    });
  }
  return { data, requestId };
}

/**
 * TikTok returns machine scope identifiers in the token response. Preserve and
 * compare those exact identifiers; never translate permission labels from the
 * developer portal into guessed scope strings.
 */
export function parseTikTokReturnedScopes(value: unknown) {
  if (typeof value !== "string" || value.length > 16_384) return null;
  const entries = value.split(",").map((entry) => entry.trim());
  if (
    entries.length === 0
    || entries.some((entry) => !SCOPE_IDENTIFIER_PATTERN.test(entry))
  ) return null;
  return [...new Set(entries)].sort();
}

export function parseTikTokTokenResponse(
  body: unknown,
  stage: "token_exchange" | "token_refresh" = "token_exchange",
) {
  const { data, requestId } = responseData(body, stage);
  const accessToken = boundedString(data.access_token, 16_384);
  const refreshToken = boundedString(data.refresh_token, 16_384);
  const expiresIn = positiveInteger(data.expires_in);
  const refreshTokenExpiresIn = positiveInteger(data.refresh_token_expires_in);
  const openId = boundedString(data.open_id, 256);
  const scopes = parseTikTokReturnedScopes(data.scope);
  if (
    !accessToken
    || !refreshToken
    || accessToken === refreshToken
    || data.token_type !== "Bearer"
    || !expiresIn
    || !refreshTokenExpiresIn
    || !openId
    || !scopes
  ) {
    throw new SocialProviderError({
      provider: "tiktok",
      stage,
      code: "INVALID_TOKEN_RESPONSE",
      requestId,
    });
  }
  assertRequiredScopes(
    "tiktok",
    stage,
    scopes,
    providerConfig("tiktok").requiredScopes,
  );
  return {
    accessToken,
    refreshToken,
    tokenType: "Bearer",
    scopes,
    expiresIn,
    refreshTokenExpiresIn,
    openId,
  } satisfies TikTokOAuthToken;
}

export function parseTikTokIdentityResponse(body: unknown, expectedAccountId: string) {
  const { data, requestId } = responseData(body, "identity");
  const config = providerConfig("tiktok");
  const accountId = boundedString(data.business_id, 256);
  const username = normalizedUsername(data.username);
  const displayName = data.display_name === undefined || data.display_name === null
    ? null
    : boundedString(data.display_name, 256);
  if (
    accountId !== expectedAccountId
    || username !== config.expectedUsername
    || (data.display_name !== undefined && data.display_name !== null && !displayName)
  ) {
    throw new SocialProviderError({
      provider: "tiktok",
      stage: "identity",
      code: "ACCOUNT_IDENTITY_MISMATCH",
      requestId,
    });
  }
  return { accountId, username, displayName } satisfies TikTokOAuthIdentity;
}

export function buildTikTokAuthorizationUrl(state: string) {
  if (!boundedString(state, 256)) {
    throw new SocialProviderError({
      provider: "tiktok",
      stage: "authorization",
      code: "INVALID_STATE",
    });
  }
  const config = providerConfig("tiktok");
  const url = new URL(config.authorizationUrl);
  url.searchParams.set("app_id", config.clientId);
  url.searchParams.set("state", state);
  url.searchParams.set("redirect_uri", config.redirectUri);
  // TikTok grants the app's approved permissions when `scope` is omitted. The
  // exact returned identifiers are validated after token exchange.
  return url;
}

export async function exchangeTikTokAuthorizationCode(authCode: string) {
  if (!boundedString(authCode)) {
    throw new SocialProviderError({
      provider: "tiktok",
      stage: "token_exchange",
      code: "INVALID_AUTHORIZATION_CODE",
    });
  }
  const config = providerConfig("tiktok");
  const body = await providerFetchJson("tiktok", "token_exchange", TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "authorization_code",
      auth_code: authCode,
      redirect_uri: config.redirectUri,
    }),
  });
  return parseTikTokTokenResponse(body);
}

export async function refreshTikTokAccessToken(
  refreshToken: string,
  expectedOpenId: string,
) {
  if (!boundedString(refreshToken, 16_384) || !boundedString(expectedOpenId, 256)) {
    throw new SocialProviderError({
      provider: "tiktok",
      stage: "token_refresh",
      code: "INVALID_REFRESH_INPUT",
    });
  }
  const config = providerConfig("tiktok");
  const body = await providerFetchJson("tiktok", "token_refresh", REFRESH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  const token = parseTikTokTokenResponse(body, "token_refresh");
  if (token.openId !== expectedOpenId) {
    throw new SocialProviderError({
      provider: "tiktok",
      stage: "token_refresh",
      code: "REFRESH_IDENTITY_MISMATCH",
    });
  }
  // Always return TikTok's response token pair. The refresh token may rotate,
  // and callers must persist this returned value rather than the input token.
  return token;
}

export async function getTikTokOAuthIdentity(
  accessToken: string,
  expectedAccountId: string,
) {
  if (!boundedString(accessToken, 16_384) || !boundedString(expectedAccountId, 256)) {
    throw new SocialProviderError({
      provider: "tiktok",
      stage: "identity",
      code: "INVALID_IDENTITY_INPUT",
    });
  }
  const url = new URL(IDENTITY_URL);
  url.searchParams.set("business_id", expectedAccountId);
  url.searchParams.set(
    "fields",
    JSON.stringify(["business_id", "username", "display_name"]),
  );
  const body = await providerFetchJson("tiktok", "identity", url, {
    method: "GET",
    headers: { "Access-Token": accessToken },
  });
  return parseTikTokIdentityResponse(body, expectedAccountId);
}
