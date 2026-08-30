import "server-only";

import type { SocialProvider } from "./config";

type RefreshClaim = {
  provider: SocialProvider;
};

type RefreshRunOptions<TClaim extends RefreshClaim> = {
  providers: SocialProvider[];
  maxPerProvider: number;
  claim: (provider: SocialProvider) => Promise<TClaim | null>;
  refresh: (claim: TClaim) => Promise<void>;
  markFailed: (claim: TClaim, error: unknown) => Promise<void>;
  errorCode: (error: unknown) => string;
};

export type SocialTokenRefreshResult = {
  refreshed: number;
  failed: number;
  failures: string[];
};

export function enabledSocialRefreshProviders(input: {
  instagramOAuthEnabled: boolean;
  tiktokOAuthEnabled: boolean;
  youtubeOAuthEnabled?: boolean;
}) {
  const providers: SocialProvider[] = [];
  if (input.instagramOAuthEnabled) providers.push("instagram");
  if (input.tiktokOAuthEnabled) providers.push("tiktok");
  if (input.youtubeOAuthEnabled) providers.push("youtube");
  return providers;
}

export async function runSocialTokenRefreshes<TClaim extends RefreshClaim>(
  options: RefreshRunOptions<TClaim>,
): Promise<SocialTokenRefreshResult> {
  if (
    !Number.isInteger(options.maxPerProvider)
    || options.maxPerProvider < 1
    || options.maxPerProvider > 20
    || new Set(options.providers).size !== options.providers.length
  ) {
    throw new Error("SOCIAL_REFRESH_PLAN_INVALID");
  }

  let refreshed = 0;
  let failed = 0;
  const failures: string[] = [];
  for (const provider of options.providers) {
    for (let index = 0; index < options.maxPerProvider; index += 1) {
      let claim: TClaim | null;
      try {
        claim = await options.claim(provider);
      } catch (error) {
        failed += 1;
        failures.push(`${provider}:${options.errorCode(error)}`);
        break;
      }
      if (!claim) break;

      if (claim.provider !== provider) {
        const error = new Error("SOCIAL_REFRESH_CLAIM_PROVIDER_MISMATCH");
        failed += 1;
        failures.push(`${provider}:${options.errorCode(error)}`);
        try {
          await options.markFailed(claim, error);
        } catch (storeError) {
          failures.push(`${provider}:${options.errorCode(storeError)}`);
        }
        break;
      }

      try {
        await options.refresh(claim);
        refreshed += 1;
      } catch (error) {
        failed += 1;
        failures.push(`${provider}:${options.errorCode(error)}`);
        try {
          await options.markFailed(claim, error);
        } catch (storeError) {
          failures.push(`${provider}:${options.errorCode(storeError)}`);
          break;
        }
      }
    }
  }
  return { refreshed, failed, failures };
}
