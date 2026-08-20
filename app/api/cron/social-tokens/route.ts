import { NextResponse } from "next/server";
import { instagramOAuthEnabled, tiktokOAuthEnabled } from "@/lib/social/config";
import {
  claimSocialConnectionRefresh,
  completeSocialConnectionRefresh,
  decryptClaimedSocialToken,
  failSocialConnectionRefresh,
} from "@/lib/social/connections";
import { authenticateSocialCronRequest } from "@/lib/social/cron-auth";
import { isProviderAuthenticationFailure, providerErrorCode } from "@/lib/social/provider-client";
import {
  getInstagramIdentity,
  refreshInstagramLongLivedToken,
} from "@/lib/social/providers/instagram-login";
import {
  getTikTokOAuthIdentity,
  refreshTikTokAccessToken,
} from "@/lib/social/providers/tiktok-oauth";
import {
  enabledSocialRefreshProviders,
  runSocialTokenRefreshes,
} from "@/lib/social/token-refresh-orchestrator";
import { refreshClaimedSocialConnection } from "@/lib/social/token-refresh-worker";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_REFRESHES_PER_PROVIDER_PER_RUN = 3;

const refreshDependencies = {
  decrypt: decryptClaimedSocialToken,
  refreshInstagram: refreshInstagramLongLivedToken,
  getInstagramIdentity,
  refreshTikTok: refreshTikTokAccessToken,
  getTikTokIdentity: getTikTokOAuthIdentity,
  complete: completeSocialConnectionRefresh,
};

export async function GET(request: Request) {
  if (!authenticateSocialCronRequest(request)) {
    return NextResponse.json({ ok: false, status: "UNAUTHORIZED" }, { status: 401 });
  }
  const providers = enabledSocialRefreshProviders({
    instagramOAuthEnabled: instagramOAuthEnabled(),
    tiktokOAuthEnabled: tiktokOAuthEnabled(),
  });
  if (providers.length === 0) {
    return NextResponse.json(
      { ok: true, status: "DISABLED", refreshed: 0, failed: 0 },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const { refreshed, failed, failures } = await runSocialTokenRefreshes({
    providers,
    maxPerProvider: MAX_REFRESHES_PER_PROVIDER_PER_RUN,
    claim: claimSocialConnectionRefresh,
    refresh: async (claim) => {
      await refreshClaimedSocialConnection(claim, refreshDependencies);
    },
    markFailed: async (claim, error) => {
      await failSocialConnectionRefresh(
        claim,
        error,
        isProviderAuthenticationFailure(error),
      );
    },
    errorCode: providerErrorCode,
  });

  return NextResponse.json(
    {
      ok: failed === 0,
      status: failed === 0 ? "COMPLETE" : "PARTIAL_FAILURE",
      refreshed,
      failed,
      failures,
    },
    {
      status: failed === 0 ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
