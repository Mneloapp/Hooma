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

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CHANNELS_URL = "https://www.googleapis.com/youtube/v3/channels";

export type YouTubeOAuthToken = {
  accessToken: string;
  refreshToken: string;
  tokenType: "Bearer";
  scopes: string[];
  expiresIn: number;
};

export type YouTubeRefreshedToken = Omit<YouTubeOAuthToken, "refreshToken"> & {
  refreshToken: null;
};

export type YouTubeChannelIdentity = {
  accountId: string;
  username: string;
  title: string;
  channelUrl: string;
};

function boundedString(value: unknown, maximum = 16_384) {
  return typeof value === "string"
    && value.length > 0
    && value.length <= maximum
    && !/[\u0000-\u001f\u007f]/.test(value)
    ? value
    : null;
}

function parseTokenBody(body: unknown, refreshTokenRequired: boolean) {
  const record = asRecord(body);
  const accessToken = boundedString(record?.access_token);
  const refreshToken = boundedString(record?.refresh_token);
  const expiresIn = positiveInteger(record?.expires_in, 86_400);
  const scopes = parseProviderScopes(record?.scope);
  const tokenType = typeof record?.token_type === "string"
    ? record.token_type.toLowerCase()
    : "";
  if (
    !accessToken
    || !expiresIn
    || tokenType !== "bearer"
    || (refreshTokenRequired && !refreshToken)
  ) {
    throw new SocialProviderError({
      provider: "youtube",
      stage: "token_exchange",
      code: refreshTokenRequired
        ? "OFFLINE_REFRESH_TOKEN_REQUIRED"
        : "INVALID_TOKEN_RESPONSE",
    });
  }
  assertRequiredScopes(
    "youtube",
    refreshTokenRequired ? "token_exchange" : "token_refresh",
    scopes,
    providerConfig("youtube").requiredScopes,
  );
  return { accessToken, refreshToken, expiresIn, scopes };
}

export function buildYouTubeAuthorizationUrl(input: {
  state: string;
  codeChallenge: string;
}) {
  if (!boundedString(input.state, 256) || !/^[A-Za-z0-9_-]{43}$/.test(input.codeChallenge)) {
    throw new SocialProviderError({
      provider: "youtube",
      stage: "authorization",
      code: "INVALID_STATE_OR_PKCE",
    });
  }
  const config = providerConfig("youtube");
  const url = new URL(config.authorizationUrl);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", config.requiredScopes.join(" "));
  url.searchParams.set("state", input.state);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url;
}

export async function exchangeYouTubeAuthorizationCode(input: {
  code: string;
  codeVerifier: string;
}) {
  if (!boundedString(input.code, 4_096) || !/^[A-Za-z0-9_-]{43}$/.test(input.codeVerifier)) {
    throw new SocialProviderError({
      provider: "youtube",
      stage: "token_exchange",
      code: "INVALID_AUTHORIZATION_CODE",
    });
  }
  const config = providerConfig("youtube");
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code: input.code,
    code_verifier: input.codeVerifier,
    grant_type: "authorization_code",
    redirect_uri: config.redirectUri,
  });
  const parsed = parseTokenBody(await providerFetchJson(
    "youtube",
    "token_exchange",
    TOKEN_URL,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      redirect: "error",
    },
  ), true);
  return {
    accessToken: parsed.accessToken,
    refreshToken: parsed.refreshToken!,
    tokenType: "Bearer",
    scopes: parsed.scopes,
    expiresIn: parsed.expiresIn,
  } satisfies YouTubeOAuthToken;
}

export async function refreshYouTubeAccessToken(refreshToken: string) {
  if (!boundedString(refreshToken)) {
    throw new SocialProviderError({
      provider: "youtube",
      stage: "token_refresh",
      code: "INVALID_REFRESH_TOKEN",
    });
  }
  const config = providerConfig("youtube");
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });
  const parsed = parseTokenBody(await providerFetchJson(
    "youtube",
    "token_refresh",
    TOKEN_URL,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      redirect: "error",
    },
  ), false);
  return {
    accessToken: parsed.accessToken,
    refreshToken: null,
    tokenType: "Bearer",
    scopes: parsed.scopes,
    expiresIn: parsed.expiresIn,
  } satisfies YouTubeRefreshedToken;
}

export async function getYouTubeChannelIdentity(accessToken: string) {
  if (!boundedString(accessToken)) {
    throw new SocialProviderError({
      provider: "youtube",
      stage: "identity",
      code: "INVALID_TOKEN",
    });
  }
  const config = providerConfig("youtube");
  const url = new URL(CHANNELS_URL);
  url.searchParams.set("part", "id,snippet");
  url.searchParams.set("mine", "true");
  url.searchParams.set("maxResults", "2");
  const body = asRecord(await providerFetchJson(
    "youtube",
    "identity",
    url,
    {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
      redirect: "error",
    },
  ));
  const items = Array.isArray(body?.items) ? body.items : [];
  if (items.length !== 1) {
    throw new SocialProviderError({
      provider: "youtube",
      stage: "identity",
      code: "ACCOUNT_IDENTITY_MISMATCH",
    });
  }
  const channel = asRecord(items[0]);
  const snippet = asRecord(channel?.snippet);
  const accountId = boundedString(channel?.id, 64);
  const title = boundedString(snippet?.title, 256);
  const username = normalizedUsername(snippet?.customUrl);
  if (
    accountId !== config.expectedAccountId
    || username !== config.expectedUsername
    || !title
  ) {
    throw new SocialProviderError({
      provider: "youtube",
      stage: "identity",
      code: "ACCOUNT_IDENTITY_MISMATCH",
    });
  }
  return {
    accountId,
    username,
    title,
    channelUrl: `https://www.youtube.com/@${username}`,
  } satisfies YouTubeChannelIdentity;
}
