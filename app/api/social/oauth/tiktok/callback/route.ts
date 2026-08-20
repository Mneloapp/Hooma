import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/supabase/server";
import { tiktokOAuthEnabled } from "@/lib/social/config";
import { recordSocialOAuthEvent, storeSocialConnection } from "@/lib/social/connections";
import { consumeOAuthState } from "@/lib/social/oauth-state";
import {
  boundedSingleOAuthParameter,
  oauthResultRedirect,
  socialFeatureUnavailable,
} from "@/lib/social/oauth-route";
import {
  exchangeTikTokAuthorizationCode,
  getTikTokOAuthIdentity,
  parseTikTokAuthorizationCallback,
} from "@/lib/social/providers/tiktok-oauth";
import {
  providerErrorAuditDiagnostic,
  type SocialOAuthFailureStage,
} from "@/lib/social/provider-client";

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
  const state = boundedSingleOAuthParameter(url.searchParams, "state", 256);
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

  let failureStage: SocialOAuthFailureStage = "authorization";
  try {
    const callback = parseTikTokAuthorizationCallback(url.searchParams);
    if (callback.kind === "denied") {
      await recordSocialOAuthEvent(
        actor.id,
        "tiktok",
        "social_oauth_denied",
        "AUTHORIZATION_DENIED",
      ).catch(() => undefined);
      return oauthResultRedirect("tiktok", "denied");
    }
    failureStage = "token_exchange";
    const token = await exchangeTikTokAuthorizationCode(callback.code);
    failureStage = "identity";
    const identity = await getTikTokOAuthIdentity(token.accessToken, token.openId);
    failureStage = "connection_store";
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
    const diagnostic = providerErrorAuditDiagnostic(error, failureStage);
    await recordSocialOAuthEvent(
      actor.id,
      "tiktok",
      "social_oauth_failed",
      diagnostic.errorCode,
      {
        failureStage: diagnostic.failureStage,
        providerRequestId: diagnostic.providerRequestId,
      },
    ).catch(() => undefined);
    return oauthResultRedirect("tiktok", "failed");
  }
}
