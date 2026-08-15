import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/supabase/server";
import { providerConfig, tiktokOAuthEnabled } from "@/lib/social/config";
import { issueOAuthState } from "@/lib/social/oauth-state";
import { socialFeatureUnavailable } from "@/lib/social/oauth-route";
import { buildTikTokAuthorizationUrl } from "@/lib/social/providers/tiktok-oauth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!tiktokOAuthEnabled()) return socialFeatureUnavailable();
  const requestUrl = new URL(request.url);
  if (requestUrl.origin !== "https://hooma.ge") {
    return NextResponse.redirect(
      "https://hooma.ge/api/social/oauth/tiktok/start",
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
    const config = providerConfig("tiktok");
    const state = await issueOAuthState("tiktok", actor.id, config.redirectUri);
    return NextResponse.redirect(buildTikTokAuthorizationUrl(state), { status: 303 });
  } catch {
    return NextResponse.json(
      { ok: false, message: "TikTok connection could not be started." },
      { status: 503 },
    );
  }
}
