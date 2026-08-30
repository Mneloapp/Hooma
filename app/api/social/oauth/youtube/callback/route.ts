import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/supabase/server";
import { youtubeOAuthEnabled } from "@/lib/social/config";
import { recordSocialOAuthEvent, storeSocialConnection } from "@/lib/social/connections";
import { consumeYouTubeOAuthState } from "@/lib/social/oauth-state";
import {
  boundedSingleOAuthParameter,
  oauthResultRedirect,
  socialFeatureUnavailable,
} from "@/lib/social/oauth-route";
import {
  providerErrorAuditDiagnostic,
  type SocialOAuthFailureStage,
} from "@/lib/social/provider-client";
import {
  exchangeYouTubeAuthorizationCode,
  getYouTubeChannelIdentity,
} from "@/lib/social/providers/youtube-oauth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!youtubeOAuthEnabled()) return socialFeatureUnavailable();
  const actor = await requirePermission("team.manage");
  if (!actor) return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  if (actor.role !== "owner") return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 });

  const url = new URL(request.url);
  if (url.origin !== "https://hooma.ge") {
    return NextResponse.json({ ok: false, message: "Invalid callback origin." }, { status: 400 });
  }
  const state = boundedSingleOAuthParameter(url.searchParams, "state", 256);
  const consumed = state
    ? await consumeYouTubeOAuthState(actor.id, state).catch(() => null)
    : null;
  if (!consumed) {
    await recordSocialOAuthEvent(actor.id, "youtube", "social_oauth_state_rejected", "STATE_REJECTED")
      .catch(() => undefined);
    return oauthResultRedirect("youtube", "state_rejected");
  }
  if (url.searchParams.has("error")) {
    await recordSocialOAuthEvent(actor.id, "youtube", "social_oauth_denied", "AUTHORIZATION_DENIED")
      .catch(() => undefined);
    return oauthResultRedirect("youtube", "denied");
  }

  let failureStage: SocialOAuthFailureStage = "authorization";
  try {
    const code = boundedSingleOAuthParameter(url.searchParams, "code");
    if (!code) throw new Error("AUTHORIZATION_CODE_MISSING");
    failureStage = "token_exchange";
    const token = await exchangeYouTubeAuthorizationCode({ code, codeVerifier: consumed.verifier });
    failureStage = "identity";
    const identity = await getYouTubeChannelIdentity(token.accessToken);
    failureStage = "connection_store";
    await storeSocialConnection({
      provider: "youtube",
      tokenType: token.tokenType,
      scopes: token.scopes,
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      expiresIn: token.expiresIn,
      refreshTokenExpiresIn: null,
      identity: {
        accountId: identity.accountId,
        username: identity.username,
        snapshot: {
          channel_id: identity.accountId,
          channel_handle: identity.username,
          title: identity.title,
          channel_url: identity.channelUrl,
        },
      },
    }, actor.id);
    return oauthResultRedirect("youtube", "connected");
  } catch (error) {
    const diagnostic = providerErrorAuditDiagnostic(error, failureStage);
    await recordSocialOAuthEvent(
      actor.id,
      "youtube",
      "social_oauth_failed",
      diagnostic.errorCode,
      { failureStage: diagnostic.failureStage, providerRequestId: diagnostic.providerRequestId },
    ).catch(() => undefined);
    return oauthResultRedirect("youtube", "failed");
  }
}
