import { NextResponse } from "next/server";
import { authenticateSocialCronRequest } from "@/lib/social/cron-auth";
import { runInstagramPublishWorker } from "@/lib/social/instagram-publish-worker";
import { runInstagramAnalyticsWorker } from "@/lib/social/instagram-analytics-worker";
import { runTikTokPublishWorker } from "@/lib/social/tiktok-publish-worker";
import { runTikTokAnalyticsWorker } from "@/lib/social/tiktok-analytics-worker";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!authenticateSocialCronRequest(request)) {
    return NextResponse.json(
      { ok: false, status: "UNAUTHORIZED" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  const [instagramPublishing, instagramAnalytics, tiktokPublishing, tiktokAnalytics] = await Promise.all([
    runInstagramPublishWorker(),
    runInstagramAnalyticsWorker(),
    runTikTokPublishWorker(),
    runTikTokAnalyticsWorker(),
  ]);
  const healthy = (status: string) => status === "DISABLED"
    || status === "IDLE"
    || status === "COMPLETE";
  const ok = [instagramPublishing, instagramAnalytics, tiktokPublishing, tiktokAnalytics]
    .every((result) => healthy(result.status));
  return NextResponse.json(
    {
      ok,
      status: ok ? "COMPLETE" : "FAILED_CLOSED",
      instagram: { publishing: instagramPublishing, analytics: instagramAnalytics },
      tiktok: { publishing: tiktokPublishing, analytics: tiktokAnalytics },
    },
    {
      status: ok ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
