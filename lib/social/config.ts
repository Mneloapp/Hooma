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

function scopes(name: string) {
  const parsed = required(name)
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (
    !parsed.length
    || parsed.some((value) => !/^[A-Za-z0-9._:-]{2,120}$/.test(value))
  ) {
    throw new Error(`SOCIAL_CONFIG_INVALID_SCOPES:${name}`);
  }
  return [...new Set(parsed)].sort();
}

export function socialPublishingEnabled() {
  return process.env.HOOMA_SOCIAL_PUBLISHING_ENABLED === "1";
}

export function providerConfig(provider: "tiktok"): TikTokProviderConfig;
export function providerConfig(provider: "instagram"): InstagramProviderConfig;
export function providerConfig(provider: SocialProvider): SocialProviderConfig;
export function providerConfig(provider: SocialProvider): SocialProviderConfig {
  if (provider === "tiktok") {
    const authorizationUrl = requiredHttps("TIKTOK_BUSINESS_AUTH_URL");
    const authorizationHost = new URL(authorizationUrl).hostname;
    if (!new Set(["business-api.tiktok.com", "ads.tiktok.com"]).has(authorizationHost)) {
      throw new Error("SOCIAL_CONFIG_INVALID_AUTHORIZATION_HOST:TIKTOK_BUSINESS_AUTH_URL");
    }
    return {
      provider,
      clientId: required("TIKTOK_BUSINESS_CLIENT_ID"),
      clientSecret: required("TIKTOK_BUSINESS_CLIENT_SECRET"),
      authorizationUrl,
      redirectUri: requiredOAuthRedirect(
        "TIKTOK_BUSINESS_REDIRECT_URI",
        "/api/social/oauth/tiktok/callback",
      ),
      requiredScopes: scopes("TIKTOK_BUSINESS_REQUIRED_SCOPES"),
      expectedUsername: required("TIKTOK_BUSINESS_EXPECTED_USERNAME").replace(/^@/, "").toLowerCase(),
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
