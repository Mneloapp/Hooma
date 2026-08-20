import "server-only";

export type SocialProvider = "tiktok" | "instagram";

export type TikTokProviderConfig = {
  provider: "tiktok";
  clientId: string;
  clientSecret: string;
  authorizationUrl: string;
  redirectUri: string;
  requiredScopes: string[];
  expectedUsername: string;
};

export type InstagramProviderConfig = {
  provider: "instagram";
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  requiredScopes: string[];
  expectedUsername: string;
};

export type SocialProviderConfig = TikTokProviderConfig | InstagramProviderConfig;

const SHA256_PATTERN = /^[a-f0-9]{64}$/;

export const TIKTOK_APPROVED_APP_ID = "7675794584770248724" as const;

export const TIKTOK_APPROVED_ACCOUNT_SCOPES = [
  "user.info.basic",
  "user.info.username",
  "user.info.stats",
  "user.info.profile",
  "user.account.type",
  "user.insights",
  "video.publish",
  "video.upload",
  "video.list",
  "video.insights",
] as const;

function required(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`SOCIAL_CONFIG_MISSING:${name}`);
  return value;
}

function requiredHttps(name: string) {
  const value = required(name);
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.hash) {
    throw new Error(`SOCIAL_CONFIG_INVALID_HTTPS:${name}`);
  }
  return url.toString();
}

function requiredOAuthRedirect(name: string, pathname: string) {
  const value = requiredHttps(name);
  const url = new URL(value);
  if (
    url.origin !== "https://hooma.ge"
    || url.pathname !== pathname
    || url.search
    || url.hash
  ) {
    throw new Error(`SOCIAL_CONFIG_INVALID_REDIRECT:${name}`);
  }
  return url.toString();
}

function requiredTikTokAuthorizationUrl() {
  const value = requiredHttps("TIKTOK_BUSINESS_AUTH_URL");
  const url = new URL(value);
  if (
    url.origin !== "https://ads.tiktok.com"
    || url.pathname !== "/marketing_api/auth"
    || url.search
    || url.hash
  ) {
    throw new Error("SOCIAL_CONFIG_INVALID_AUTHORIZATION_URL:TIKTOK_BUSINESS_AUTH_URL");
  }
  return url.toString();
}

function scopes(name: string) {
  const parsed = required(name)
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (
    !parsed.length
    || new Set(parsed).size !== parsed.length
    || parsed.some((value) => !/^[A-Za-z0-9._:-]{2,120}$/.test(value))
  ) {
    throw new Error(`SOCIAL_CONFIG_INVALID_SCOPES:${name}`);
  }
  return [...new Set(parsed)].sort();
}

function exactTikTokApprovedScopes() {
  const configured = scopes("TIKTOK_BUSINESS_APPROVED_SCOPES");
  const approved = [...TIKTOK_APPROVED_ACCOUNT_SCOPES].sort();
  if (
    configured.length !== approved.length
    || configured.some((scope, index) => scope !== approved[index])
  ) {
    throw new Error(
      "SOCIAL_CONFIG_INVALID_APPROVED_SCOPES:TIKTOK_BUSINESS_APPROVED_SCOPES",
    );
  }
  return [...TIKTOK_APPROVED_ACCOUNT_SCOPES];
}

export function socialPublishingEnabled() {
  return process.env.HOOMA_SOCIAL_PUBLISHING_ENABLED === "1";
}

function configuredReceiptSha256(name: string) {
  const value = process.env[name]?.trim() ?? "";
  return SHA256_PATTERN.test(value) ? value : null;
}

export function tiktokAppReviewReceiptSha256() {
  return configuredReceiptSha256("TIKTOK_BUSINESS_APP_REVIEW_RECEIPT_SHA256");
}

export function tiktokOAuthConnectionReceiptSha256() {
  return configuredReceiptSha256(
    "TIKTOK_BUSINESS_OAUTH_CONNECTION_RECEIPT_SHA256",
  );
}

export function tiktokOrganicActivationReceiptSha256() {
  return configuredReceiptSha256(
    "TIKTOK_BUSINESS_ORGANIC_ACTIVATION_RECEIPT_SHA256",
  );
}

export function tiktokAppReviewApproved() {
  return process.env.TIKTOK_BUSINESS_APP_REVIEW_STATUS === "APPROVED"
    && tiktokAppReviewReceiptSha256() !== null;
}

export function tiktokOAuthEnabled() {
  return process.env.HOOMA_TIKTOK_OAUTH_ENABLED === "1"
    && tiktokAppReviewApproved();
}

export function tiktokOrganicNetworkEnabled() {
  return process.env.HOOMA_TIKTOK_ORGANIC_NETWORK_ENABLED === "1";
}

export function tiktokOrganicPublishingEnabled() {
  return socialPublishingEnabled()
    && tiktokOrganicNetworkEnabled()
    && process.env.HOOMA_TIKTOK_ORGANIC_PUBLISHING_ENABLED === "1";
}

export function providerConfig(provider: "tiktok"): TikTokProviderConfig;
export function providerConfig(provider: "instagram"): InstagramProviderConfig;
export function providerConfig(provider: SocialProvider): SocialProviderConfig;
export function providerConfig(provider: SocialProvider): SocialProviderConfig {
  if (provider === "tiktok") {
    const clientId = required("TIKTOK_BUSINESS_CLIENT_ID");
    if (clientId !== TIKTOK_APPROVED_APP_ID) {
      throw new Error("SOCIAL_CONFIG_INVALID_APP:TIKTOK_BUSINESS_CLIENT_ID");
    }
    const expectedUsername = required("TIKTOK_BUSINESS_EXPECTED_USERNAME")
      .replace(/^@/, "")
      .toLowerCase();
    if (expectedUsername !== "hooma.ge") {
      throw new Error("SOCIAL_CONFIG_INVALID_ACCOUNT:TIKTOK_BUSINESS_EXPECTED_USERNAME");
    }
    return {
      provider,
      clientId,
      clientSecret: required("TIKTOK_BUSINESS_CLIENT_SECRET"),
      authorizationUrl: requiredTikTokAuthorizationUrl(),
      redirectUri: requiredOAuthRedirect(
        "TIKTOK_BUSINESS_REDIRECT_URI",
        "/api/social/oauth/tiktok/callback/",
      ),
      requiredScopes: exactTikTokApprovedScopes(),
      expectedUsername,
    };
  }

  return {
    provider,
    clientId: required("INSTAGRAM_APP_ID"),
    clientSecret: required("INSTAGRAM_APP_SECRET"),
    redirectUri: requiredOAuthRedirect(
      "INSTAGRAM_REDIRECT_URI",
      "/api/social/oauth/instagram/callback",
    ),
    requiredScopes: scopes("INSTAGRAM_REQUIRED_SCOPES"),
    expectedUsername: required("INSTAGRAM_EXPECTED_USERNAME").replace(/^@/, "").toLowerCase(),
  };
}

export function socialMediaBaseUrl() {
  return requiredHttps("HOOMA_SOCIAL_MEDIA_BASE_URL");
}
