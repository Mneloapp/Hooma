import "server-only";

import { providerConfig } from "../config";
import {
  asRecord,
  assertRequiredScopes,
  normalizedUsername,
  parseProviderScopes,
  positiveInteger,
  providerFetchJson,
  SocialProviderError,
} from "../provider-client";

const AUTHORIZATION_URL = "https://www.instagram.com/oauth/authorize";
const SHORT_TOKEN_URL = "https://api.instagram.com/oauth/access_token";
const LONG_TOKEN_URL = "https://graph.instagram.com/access_token";
const REFRESH_URL = "https://graph.instagram.com/refresh_access_token";
const GRAPH_API_ORIGIN = "https://graph.instagram.com";
const GRAPH_API_VERSION_PATTERN = /^v[1-9]\d{0,2}\.\d{1,2}$/;
const INSTAGRAM_USER_ID_PATTERN = /^[1-9]\d{0,255}$/;

export type InstagramLongLivedToken = {
  accessToken: string;
  tokenType: "Bearer";
  scopes: string[];
  expiresIn: number;
  userId: string;
};

export type InstagramIdentity = {
  accountId: string;
  username: string;
  accountType: string | null;
};

function boundedString(value: unknown, maximum = 4_096) {
  return typeof value === "string" && value.length > 0 && value.length <= maximum
    ? value
    : null;
}

function responseEntry(body: unknown) {
  const record = asRecord(body);
  if (!record) return null;
  if (!("data" in record)) return record;
  return Array.isArray(record.data) && record.data.length === 1
    ? asRecord(record.data[0])
    : null;
}

export function instagramGraphApiVersion() {
  const version = process.env.INSTAGRAM_GRAPH_API_VERSION?.trim();
  if (!version) {
    throw new Error("SOCIAL_CONFIG_MISSING:INSTAGRAM_GRAPH_API_VERSION");
  }
  if (!GRAPH_API_VERSION_PATTERN.test(version)) {
    throw new Error("SOCIAL_CONFIG_INVALID_GRAPH_VERSION:INSTAGRAM_GRAPH_API_VERSION");
  }
  return version;
}

export function buildInstagramIdentityEndpoint() {
  return new URL(`/${instagramGraphApiVersion()}/me`, GRAPH_API_ORIGIN);
}

export function parseInstagramUserId(value: unknown) {
  if (typeof value === "string") {
    return INSTAGRAM_USER_ID_PATTERN.test(value) ? value : null;
  }
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) {
    return String(value);
  }
  return null;
}

export function parseInstagramShortTokenResponse(body: unknown) {
  const entry = responseEntry(body);
  const accessToken = boundedString(entry?.access_token, 16_384);
  const userId = parseInstagramUserId(entry?.user_id);
  if (!accessToken || !userId) return null;
  return {
    accessToken,
    userId,
    scopes: parseProviderScopes(entry?.permissions),
  };
}

export function parseInstagramIdentityResponse(body: unknown, expectedUserId: string) {
  if (parseInstagramUserId(expectedUserId) !== expectedUserId) return null;
  const entry = responseEntry(body);
  const rawAccountId = entry && "user_id" in entry ? entry.user_id : entry?.id;
  const accountId = parseInstagramUserId(rawAccountId);
  const username = normalizedUsername(entry?.username);
  const accountType = boundedString(entry?.account_type, 80);
  if (accountId !== expectedUserId || !username) return null;
  return { accountId, username, accountType } satisfies InstagramIdentity;
}

export function buildInstagramAuthorizationUrl(state: string) {
  if (!boundedString(state, 256)) {
    throw new SocialProviderError({
      provider: "instagram",
      stage: "authorization",
      code: "INVALID_STATE",
    });
  }
  const config = providerConfig("instagram");
  const url = new URL(AUTHORIZATION_URL);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", config.requiredScopes.join(","));
  url.searchParams.set("state", state);
  return url;
}

export async function exchangeInstagramAuthorizationCode(code: string) {
  if (!boundedString(code)) {
    throw new SocialProviderError({
      provider: "instagram",
      stage: "token_exchange",
      code: "INVALID_AUTHORIZATION_CODE",
    });
  }
  const config = providerConfig("instagram");
  const form = new FormData();
  form.set("client_id", config.clientId);
  form.set("client_secret", config.clientSecret);
  form.set("grant_type", "authorization_code");
  form.set("redirect_uri", config.redirectUri);
  form.set("code", code);
  const shortBody = await providerFetchJson(
    "instagram",
    "token_exchange",
    SHORT_TOKEN_URL,
    { method: "POST", body: form },
  );
  const shortToken = parseInstagramShortTokenResponse(shortBody);
  if (!shortToken) {
    throw new SocialProviderError({
      provider: "instagram",
      stage: "token_exchange",
      code: "INVALID_SHORT_TOKEN_RESPONSE",
    });
  }
  const { accessToken: shortAccessToken, userId, scopes } = shortToken;
  assertRequiredScopes("instagram", "token_exchange", scopes, config.requiredScopes);

  const longUrl = new URL(LONG_TOKEN_URL);
  longUrl.searchParams.set("grant_type", "ig_exchange_token");
  longUrl.searchParams.set("client_secret", config.clientSecret);
  longUrl.searchParams.set("access_token", shortAccessToken);
  const longBody = asRecord(await providerFetchJson(
    "instagram",
    "token_exchange",
    longUrl,
    { method: "GET" },
  ));
  const accessToken = boundedString(longBody?.access_token, 16_384);
  const expiresIn = positiveInteger(longBody?.expires_in);
  if (!accessToken || !expiresIn) {
    throw new SocialProviderError({
      provider: "instagram",
      stage: "token_exchange",
      code: "INVALID_LONG_TOKEN_RESPONSE",
    });
  }
  return {
    accessToken,
    tokenType: "Bearer",
    scopes,
    expiresIn,
    userId,
  } satisfies InstagramLongLivedToken;
}

export async function refreshInstagramLongLivedToken(accessToken: string) {
  if (!boundedString(accessToken, 16_384)) {
    throw new SocialProviderError({
      provider: "instagram",
      stage: "token_refresh",
      code: "INVALID_TOKEN",
    });
  }
  const url = new URL(REFRESH_URL);
  url.searchParams.set("grant_type", "ig_refresh_token");
  url.searchParams.set("access_token", accessToken);
  const body = asRecord(await providerFetchJson(
    "instagram",
    "token_refresh",
    url,
    { method: "GET" },
  ));
  const refreshedAccessToken = boundedString(body?.access_token, 16_384);
  const expiresIn = positiveInteger(body?.expires_in);
  if (!refreshedAccessToken || !expiresIn) {
    throw new SocialProviderError({
      provider: "instagram",
      stage: "token_refresh",
      code: "INVALID_TOKEN_RESPONSE",
    });
  }
  return { accessToken: refreshedAccessToken, expiresIn };
}

export async function getInstagramIdentity(accessToken: string, expectedUserId: string) {
  if (
    !boundedString(accessToken, 16_384)
    || parseInstagramUserId(expectedUserId) !== expectedUserId
  ) {
    throw new SocialProviderError({
      provider: "instagram",
      stage: "identity",
      code: "INVALID_IDENTITY_INPUT",
    });
  }
  const url = buildInstagramIdentityEndpoint();
  url.searchParams.set("fields", "user_id,username,account_type");
  const body = await providerFetchJson("instagram", "identity", url, {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const identity = parseInstagramIdentityResponse(body, expectedUserId);
  if (!identity) {
    throw new SocialProviderError({
      provider: "instagram",
      stage: "identity",
      code: "INVALID_IDENTITY_RESPONSE",
    });
  }
  return identity;
}
