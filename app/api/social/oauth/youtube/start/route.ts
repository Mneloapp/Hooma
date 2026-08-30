import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/supabase/server";
import { providerConfig, youtubeOAuthEnabled } from "@/lib/social/config";
import { issueOAuthStateWithPkce } from "@/lib/social/oauth-state";
import { socialFeatureUnavailable } from "@/lib/social/oauth-route";
import { providerErrorCode } from "@/lib/social/provider-client";
import { buildYouTubeAuthorizationUrl } from "@/lib/social/providers/youtube-oauth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!youtubeOAuthEnabled()) return socialFeatureUnavailable();
  if (new URL(request.url).origin !== "https://hooma.ge") {
    return NextResponse.redirect("https://hooma.ge/api/social/oauth/youtube/start", { status: 303 });
  }
  const actor = await requirePermission("team.manage");
  if (!actor) return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  if (actor.role !== "owner") return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 });
  try {
    const config = providerConfig("youtube");
    const issued = await issueOAuthStateWithPkce("youtube", actor.id, config.redirectUri);
    return NextResponse.redirect(buildYouTubeAuthorizationUrl(issued), { status: 303 });
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      message: "social_oauth_start_failed",
      provider: "youtube",
      error_code: providerErrorCode(error),
    }));
    return NextResponse.json(
      { ok: false, message: "YouTube connection could not be started." },
      { status: 503 },
    );
  }
}
