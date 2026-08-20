import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/supabase/server";
import { instagramOAuthEnabled } from "@/lib/social/config";
import { recordSocialOAuthEvent, storeSocialConnection } from "@/lib/social/connections";
import { consumeOAuthState } from "@/lib/social/oauth-state";
import {
  boundedOAuthParameter,
  oauthResultRedirect,
  socialFeatureUnavailable,
} from "@/lib/social/oauth-route";
import {
  exchangeInstagramAuthorizationCode,
  getInstagramIdentity,
} from "@/lib/social/providers/instagram-login";
import { providerErrorCode } from "@/lib/social/provider-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!instagramOAuthEnabled()) return socialFeatureUnavailable();
  const actor = await requirePermission("team.manage");
  if (!actor) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }
  if (actor.role !== "owner") {
    return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  const state = boundedOAuthParameter(url.searchParams.get("state"), 256);
  const stateAccepted = state
    ? await consumeOAuthState("instagram", actor.id, state).catch(() => false)
    : false;
  if (!stateAccepted) {
    await recordSocialOAuthEvent(
      actor.id,
      "instagram",
      "social_oauth_state_rejected",
      "STATE_REJECTED",
    ).catch(() => undefined);
    return oauthResultRedirect("instagram", "state_rejected");
  }

  if (url.searchParams.has("error") || url.searchParams.has("error_reason")) {
    await recordSocialOAuthEvent(
      actor.id,
      "instagram",
      "social_oauth_denied",
      "AUTHORIZATION_DENIED",
    ).catch(() => undefined);
    return oauthResultRedirect("instagram", "denied");
  }

  try {
    const authorizationCode = boundedOAuthParameter(url.searchParams.get("code"));
    if (!authorizationCode) throw new Error("AUTHORIZATION_CODE_MISSING");
    const token = await exchangeInstagramAuthorizationCode(authorizationCode);
    const identity = await getInstagramIdentity(token.accessToken, {
      appScopedUserId: token.appScopedUserId,
    });
    await storeSocialConnection({
      provider: "instagram",
      tokenType: token.tokenType,
      scopes: token.scopes,
      accessToken: token.accessToken,
      refreshToken: null,
      expiresIn: token.expiresIn,
      refreshTokenExpiresIn: null,
      identity: {
        accountId: identity.accountId,
        username: identity.username,
        snapshot: {
          account_id: identity.accountId,
          app_scoped_user_id: identity.appScopedUserId,
          username: identity.username,
          account_type: identity.accountType,
        },
      },
    }, actor.id);
    return oauthResultRedirect("instagram", "connected");
  } catch (error) {
    await recordSocialOAuthEvent(
      actor.id,
      "instagram",
      "social_oauth_failed",
      providerErrorCode(error),
    ).catch(() => undefined);
    return oauthResultRedirect("instagram", "failed");
  }
}
