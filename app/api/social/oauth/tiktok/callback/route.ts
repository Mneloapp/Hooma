import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/supabase/server";
import { tiktokOAuthEnabled } from "@/lib/social/config";
import { recordSocialOAuthEvent, storeSocialConnection } from "@/lib/social/connections";
import { consumeOAuthState } from "@/lib/social/oauth-state";
import {
  boundedOAuthParameter,
  oauthResultRedirect,
  socialFeatureUnavailable,
} from "@/lib/social/oauth-route";
import {
  exchangeTikTokAuthorizationCode,
  getTikTokOAuthIdentity,
} from "@/lib/social/providers/tiktok-oauth";
import { providerErrorCode } from "@/lib/social/provider-client";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!tiktokOAuthEnabled()) return socialFeatureUnavailable();
  const actor = await requirePermission("team.manage");
  if (!actor) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }
  if (actor.role !== "owner") {
    return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  if (url.origin !== "https://hooma.ge") {
    return NextResponse.json({ ok: false, message: "Invalid callback origin." }, { status: 400 });
  }
  const state = boundedOAuthParameter(url.searchParams.get("state"), 256);
  const stateAccepted = state
    ? await consumeOAuthState("tiktok", actor.id, state).catch(() => false)
    : false;
  if (!stateAccepted) {
    await recordSocialOAuthEvent(
      actor.id,
      "tiktok",
      "social_oauth_state_rejected",
      "STATE_REJECTED",
    ).catch(() => undefined);
    return oauthResultRedirect("tiktok", "state_rejected");
  }

  const providerDenied = url.searchParams.has("error")
    || url.searchParams.has("error_reason")
    || url.searchParams.get("code") === "40102";
  if (providerDenied) {
    await recordSocialOAuthEvent(
      actor.id,
      "tiktok",
      "social_oauth_denied",
      "AUTHORIZATION_DENIED",
    ).catch(() => undefined);
    return oauthResultRedirect("tiktok", "denied");
  }

  try {
    const authorizationCode = boundedOAuthParameter(url.searchParams.get("auth_code"));
    if (!authorizationCode) throw new Error("AUTHORIZATION_CODE_MISSING");
    const token = await exchangeTikTokAuthorizationCode(authorizationCode);
    const identity = await getTikTokOAuthIdentity(token.accessToken, token.openId);
    await storeSocialConnection({
      provider: "tiktok",
      tokenType: token.tokenType,
      scopes: token.scopes,
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      expiresIn: token.expiresIn,
      refreshTokenExpiresIn: token.refreshTokenExpiresIn,
      identity: {
        accountId: identity.accountId,
        username: identity.username,
        snapshot: {
          business_id: identity.accountId,
          username: identity.username,
          display_name: identity.displayName,
        },
      },
    }, actor.id);
    return oauthResultRedirect("tiktok", "connected");
  } catch (error) {
    await recordSocialOAuthEvent(
      actor.id,
      "tiktok",
      "social_oauth_failed",
      providerErrorCode(error),
    ).catch(() => undefined);
    return oauthResultRedirect("tiktok", "failed");
  }
}
