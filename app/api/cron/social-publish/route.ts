import { NextResponse } from "next/server";
import { authenticateSocialCronRequest } from "@/lib/social/cron-auth";
import { runInstagramPublishWorker } from "@/lib/social/instagram-publish-worker";
import { runInstagramAnalyticsWorker } from "@/lib/social/instagram-analytics-worker";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  if (!authenticateSocialCronRequest(request)) {
    return NextResponse.json(
      { ok: false, status: "UNAUTHORIZED" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  const [publishing, analytics] = await Promise.all([
    runInstagramPublishWorker(),
    runInstagramAnalyticsWorker(),
  ]);
  const healthy = (status: string) => status === "DISABLED"
    || status === "IDLE"
    || status === "COMPLETE";
  const ok = healthy(publishing.status) && healthy(analytics.status);
  return NextResponse.json(
    { ok, status: ok ? "COMPLETE" : "FAILED_CLOSED", publishing, analytics },
    {
      status: ok ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
