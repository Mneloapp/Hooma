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

const FACEBOOK_ID = /^[1-9][0-9]{4,255}$/;

export type FacebookOAuthToken = {
  accessToken: string;
  tokenType: "Bearer";
  scopes: string[];
  expiresIn: number;
};

export type FacebookPageIdentity = {
  accountId: string;
  username: string;
  name: string;
  pageUrl: string | null;
};

function boundedString(value: unknown, maximum = 16_384) {
  return typeof value === "string"
    && value.length > 0
    && value.length <= maximum
    && !/[\u0000-\u001f\u007f]/.test(value)
    ? value
    : null;
}

function graphUrl(path: string) {
  const config = providerConfig("facebook");
  return new URL(`/${config.graphApiVersion}/${path.replace(/^\//, "")}`, "https://graph.facebook.com");
}

function bearer(accessToken: string) {
  return { Authorization: `Bearer ${accessToken}` };
}

export function buildFacebookAuthorizationUrl(state: string) {
  if (!boundedString(state, 256)) {
    throw new SocialProviderError({
      provider: "facebook",
      stage: "authorization",
      code: "INVALID_STATE",
    });
  }
  const config = providerConfig("facebook");
  const url = new URL(config.authorizationUrl);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", config.requiredScopes.join(","));
  url.searchParams.set("state", state);
  return url;
}

async function fetchGrantedScopes(accessToken: string) {
  const body = asRecord(await providerFetchJson(
    "facebook",
    "token_exchange",
    graphUrl("me/permissions"),
    { method: "GET", headers: bearer(accessToken), redirect: "error" },
  ));
  const data = Array.isArray(body?.data) ? body.data : [];
  const scopes = data.flatMap((entry) => {
    const row = asRecord(entry);
    return row?.status === "granted" && typeof row.permission === "string"
      ? [row.permission]
      : [];
  });
  return parseProviderScopes(scopes);
}

export async function exchangeFacebookAuthorizationCode(code: string) {
  if (!boundedString(code, 4_096)) {
    throw new SocialProviderError({
      provider: "facebook",
      stage: "token_exchange",
      code: "INVALID_AUTHORIZATION_CODE",
    });
  }
  const config = providerConfig("facebook");
  const shortUrl = graphUrl("oauth/access_token");
  shortUrl.searchParams.set("client_id", config.clientId);
  shortUrl.searchParams.set("client_secret", config.clientSecret);
  shortUrl.searchParams.set("redirect_uri", config.redirectUri);
  shortUrl.searchParams.set("code", code);
  const shortBody = asRecord(await providerFetchJson(
    "facebook",
    "token_exchange",
    shortUrl,
    { method: "GET", redirect: "error" },
  ));
  const shortToken = boundedString(shortBody?.access_token);
  if (!shortToken) {
    throw new SocialProviderError({
      provider: "facebook",
      stage: "token_exchange",
      code: "INVALID_SHORT_TOKEN_RESPONSE",
    });
  }

  const longUrl = graphUrl("oauth/access_token");
  longUrl.searchParams.set("grant_type", "fb_exchange_token");
  longUrl.searchParams.set("client_id", config.clientId);
  longUrl.searchParams.set("client_secret", config.clientSecret);
  longUrl.searchParams.set("fb_exchange_token", shortToken);
  const longBody = asRecord(await providerFetchJson(
    "facebook",
    "token_exchange",
    longUrl,
    { method: "GET", redirect: "error" },
  ));
  const userAccessToken = boundedString(longBody?.access_token);
  const expiresIn = positiveInteger(longBody?.expires_in);
  if (!userAccessToken || !expiresIn) {
    throw new SocialProviderError({
      provider: "facebook",
      stage: "token_exchange",
      code: "INVALID_LONG_TOKEN_RESPONSE",
    });
  }
  const scopes = await fetchGrantedScopes(userAccessToken);
  assertRequiredScopes("facebook", "token_exchange", scopes, config.requiredScopes);

  const pagesUrl = graphUrl("me/accounts");
  pagesUrl.searchParams.set("fields", "id,name,username,access_token,tasks");
  pagesUrl.searchParams.set("limit", "100");
  const pagesBody = asRecord(await providerFetchJson(
    "facebook",
    "token_exchange",
    pagesUrl,
    { method: "GET", headers: bearer(userAccessToken), redirect: "error" },
  ));
  const pages = Array.isArray(pagesBody?.data) ? pagesBody.data : [];
  const exactPage = pages.map(asRecord).find((page) => (
    page?.id === config.expectedAccountId
    && normalizedUsername(page.username) === config.expectedUsername
  ));
  const pageAccessToken = boundedString(exactPage?.access_token);
  const tasks = Array.isArray(exactPage?.tasks)
    ? exactPage.tasks.filter((task): task is string => typeof task === "string")
    : [];
  if (
    !exactPage
    || !pageAccessToken
    || !tasks.some((task) => task === "CREATE_CONTENT" || task === "PROFILE_PLUS_CREATE_CONTENT")
  ) {
    throw new SocialProviderError({
      provider: "facebook",
      stage: "identity",
      code: "ACCOUNT_IDENTITY_MISMATCH",
    });
  }
  return {
    accessToken: pageAccessToken,
    tokenType: "Bearer",
    scopes,
    // Page tokens can have different provider-side lifetimes. Reauthorize no
    // later than the long-lived user grant used to derive this token.
    expiresIn,
  } satisfies FacebookOAuthToken;
}

export async function getFacebookPageIdentity(accessToken: string) {
  if (!boundedString(accessToken)) {
    throw new SocialProviderError({
      provider: "facebook",
      stage: "identity",
      code: "INVALID_TOKEN",
    });
  }
  const config = providerConfig("facebook");
  const url = graphUrl(config.expectedAccountId);
  url.searchParams.set("fields", "id,name,username,link");
  const body = asRecord(await providerFetchJson(
    "facebook",
    "identity",
    url,
    { method: "GET", headers: bearer(accessToken), redirect: "error" },
  ));
  const accountId = boundedString(body?.id, 256);
  const username = normalizedUsername(body?.username);
  const name = boundedString(body?.name, 256);
  const pageUrl = boundedString(body?.link, 2_048);
  if (
    !accountId
    || !FACEBOOK_ID.test(accountId)
    || accountId !== config.expectedAccountId
    || username !== config.expectedUsername
    || !name
    || (pageUrl !== null && !/^https:\/\/(?:www\.)?facebook\.com\//.test(pageUrl))
  ) {
    throw new SocialProviderError({
      provider: "facebook",
      stage: "identity",
      code: "ACCOUNT_IDENTITY_MISMATCH",
    });
  }
  return { accountId, username, name, pageUrl } satisfies FacebookPageIdentity;
}
