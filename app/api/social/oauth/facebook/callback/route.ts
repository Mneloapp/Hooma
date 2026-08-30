import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/supabase/server";
import { facebookOAuthEnabled } from "@/lib/social/config";
import { recordSocialOAuthEvent, storeSocialConnection } from "@/lib/social/connections";
import { consumeExternalOAuthState } from "@/lib/social/oauth-state";
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
  exchangeFacebookAuthorizationCode,
  getFacebookPageIdentity,
} from "@/lib/social/providers/facebook-oauth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!facebookOAuthEnabled()) return socialFeatureUnavailable();
  const actor = await requirePermission("team.manage");
  if (!actor) return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  if (actor.role !== "owner") return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 });

  const url = new URL(request.url);
  if (url.origin !== "https://hooma.ge") {
    return NextResponse.json({ ok: false, message: "Invalid callback origin." }, { status: 400 });
  }
  const state = boundedSingleOAuthParameter(url.searchParams, "state", 256);
  const stateAccepted = state
    ? await consumeExternalOAuthState("facebook", actor.id, state).catch(() => false)
    : false;
  if (!stateAccepted) {
    await recordSocialOAuthEvent(actor.id, "facebook", "social_oauth_state_rejected", "STATE_REJECTED")
      .catch(() => undefined);
    return oauthResultRedirect("facebook", "state_rejected");
  }
  if (url.searchParams.has("error") || url.searchParams.has("error_reason")) {
    await recordSocialOAuthEvent(actor.id, "facebook", "social_oauth_denied", "AUTHORIZATION_DENIED")
      .catch(() => undefined);
    return oauthResultRedirect("facebook", "denied");
  }

  let failureStage: SocialOAuthFailureStage = "authorization";
  try {
    const code = boundedSingleOAuthParameter(url.searchParams, "code");
    if (!code) throw new Error("AUTHORIZATION_CODE_MISSING");
    failureStage = "token_exchange";
    const token = await exchangeFacebookAuthorizationCode(code);
    failureStage = "identity";
    const identity = await getFacebookPageIdentity(token.accessToken);
    failureStage = "connection_store";
    await storeSocialConnection({
      provider: "facebook",
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
          page_id: identity.accountId,
          username: identity.username,
          name: identity.name,
          page_url: identity.pageUrl,
        },
      },
    }, actor.id);
    return oauthResultRedirect("facebook", "connected");
  } catch (error) {
    const diagnostic = providerErrorAuditDiagnostic(error, failureStage);
    await recordSocialOAuthEvent(
      actor.id,
      "facebook",
      "social_oauth_failed",
      diagnostic.errorCode,
      { failureStage: diagnostic.failureStage, providerRequestId: diagnostic.providerRequestId },
    ).catch(() => undefined);
    return oauthResultRedirect("facebook", "failed");
  }
}
