import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/supabase/server";
import { facebookOAuthEnabled, providerConfig } from "@/lib/social/config";
import { issueOAuthState } from "@/lib/social/oauth-state";
import { socialFeatureUnavailable } from "@/lib/social/oauth-route";
import { providerErrorCode } from "@/lib/social/provider-client";
import { buildFacebookAuthorizationUrl } from "@/lib/social/providers/facebook-oauth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!facebookOAuthEnabled()) return socialFeatureUnavailable();
  if (new URL(request.url).origin !== "https://hooma.ge") {
    return NextResponse.redirect("https://hooma.ge/api/social/oauth/facebook/start", { status: 303 });
  }
  const actor = await requirePermission("team.manage");
  if (!actor) return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  if (actor.role !== "owner") return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 });
  try {
    const config = providerConfig("facebook");
    const state = await issueOAuthState("facebook", actor.id, config.redirectUri);
    return NextResponse.redirect(buildFacebookAuthorizationUrl(state), { status: 303 });
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      message: "social_oauth_start_failed",
      provider: "facebook",
      error_code: providerErrorCode(error),
    }));
    return NextResponse.json(
      { ok: false, message: "Facebook connection could not be started." },
      { status: 503 },
    );
  }
}
