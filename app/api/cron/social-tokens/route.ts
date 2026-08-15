import { NextResponse } from "next/server";
import { socialPublishingEnabled } from "@/lib/social/config";
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

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_REFRESHES_PER_RUN = 3;

export async function GET(request: Request) {
  if (!authenticateSocialCronRequest(request)) {
    return NextResponse.json({ ok: false, status: "UNAUTHORIZED" }, { status: 401 });
  }
  if (!socialPublishingEnabled()) {
    return NextResponse.json(
      { ok: true, status: "DISABLED", refreshed: 0, failed: 0 },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  let refreshed = 0;
  let failed = 0;
  const failures: string[] = [];
  for (let index = 0; index < MAX_REFRESHES_PER_RUN; index += 1) {
    const claim = await claimSocialConnectionRefresh("instagram");
    if (!claim) break;
    try {
      const currentToken = decryptClaimedSocialToken(claim, "access");
      const token = await refreshInstagramLongLivedToken(currentToken);
      const identity = await getInstagramIdentity(token.accessToken, claim.externalAccountId);
      await completeSocialConnectionRefresh(claim, {
        provider: "instagram",
        tokenType: "Bearer",
        scopes: claim.scopes,
        accessToken: token.accessToken,
        refreshToken: null,
        expiresIn: token.expiresIn,
        refreshTokenExpiresIn: null,
        identity: {
          accountId: identity.accountId,
          username: identity.username,
          snapshot: {
            account_id: identity.accountId,
            username: identity.username,
            account_type: identity.accountType,
          },
        },
      });
      refreshed += 1;
    } catch (error) {
      failed += 1;
      failures.push(providerErrorCode(error));
      await failSocialConnectionRefresh(
        claim,
        error,
        isProviderAuthenticationFailure(error),
      );
    }
  }

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
