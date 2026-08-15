import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/supabase/server";
import { instagramOAuthEnabled, providerConfig } from "@/lib/social/config";
import { issueOAuthState } from "@/lib/social/oauth-state";
import { socialFeatureUnavailable } from "@/lib/social/oauth-route";
import { providerErrorCode } from "@/lib/social/provider-client";
import { buildInstagramAuthorizationUrl } from "@/lib/social/providers/instagram-login";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!instagramOAuthEnabled()) return socialFeatureUnavailable();
  const requestUrl = new URL(request.url);
  if (requestUrl.origin !== "https://hooma.ge") {
    return NextResponse.redirect(
      "https://hooma.ge/api/social/oauth/instagram/start",
      { status: 303 },
    );
  }
  const actor = await requirePermission("team.manage");
  if (!actor) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }
  if (actor.role !== "owner") {
    return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 });
  }
  try {
    const config = providerConfig("instagram");
    const state = await issueOAuthState("instagram", actor.id, config.redirectUri);
    return NextResponse.redirect(buildInstagramAuthorizationUrl(state), { status: 303 });
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      message: "social_oauth_start_failed",
      provider: "instagram",
      error_code: providerErrorCode(error),
    }));
    return NextResponse.json(
      { ok: false, message: "Instagram connection could not be started." },
      { status: 503 },
    );
  }
}
