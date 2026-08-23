import { NextResponse } from "next/server";
import { authenticateSocialCronRequest } from "@/lib/social/cron-auth";
import { runInstagramPublishWorker } from "@/lib/social/instagram-publish-worker";
import { runInstagramAnalyticsWorker } from "@/lib/social/instagram-analytics-worker";
import { runTikTokPublishWorker } from "@/lib/social/tiktok-publish-worker";
import { runTikTokAnalyticsWorker } from "@/lib/social/tiktok-analytics-worker";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function workerSummary(result: { status: string; externalActionsPerformed: boolean; result: unknown }) {
  const nested = result.result && typeof result.result === "object" && !Array.isArray(result.result)
    ? result.result as Record<string, unknown>
    : null;
  return {
    status: result.status,
    externalActionsPerformed: result.externalActionsPerformed,
    resultStatus: typeof nested?.status === "string" ? nested.status : null,
    errorCode: typeof nested?.errorCode === "string" ? nested.errorCode : null,
  };
}

const healthyPublishingResults = new Set([
  "PUBLISHED",
  "PROCESSING_REMOTE",
  "CONTAINER_PROCESSING",
]);

function publishingWorkerHealthy(result: { status: string; result: unknown }) {
  if (result.status === "DISABLED" || result.status === "IDLE") return true;
  if (result.status !== "COMPLETE") return false;
  const nested = result.result && typeof result.result === "object" && !Array.isArray(result.result)
    ? result.result as Record<string, unknown>
    : null;
  return typeof nested?.status === "string" && healthyPublishingResults.has(nested.status);
}

function backgroundWorkerHealthy(result: { status: string }) {
  return result.status === "DISABLED" || result.status === "IDLE" || result.status === "COMPLETE";
}

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
  const publishingOk = [instagramPublishing, tiktokPublishing]
    .every((result) => publishingWorkerHealthy(result));
  const analyticsOk = [instagramAnalytics, tiktokAnalytics]
    .every((result) => backgroundWorkerHealthy(result));
  const ok = publishingOk;
  const status = !publishingOk
    ? "FAILED_CLOSED"
    : analyticsOk
      ? "COMPLETE"
      : "COMPLETE_WITH_ANALYTICS_DEGRADED";
  console.info("social_publish_cron_result", {
    ok,
    status,
    health: { publishing: publishingOk, analytics: analyticsOk },
    instagramPublishing: workerSummary(instagramPublishing),
    instagramAnalytics: workerSummary(instagramAnalytics),
    tiktokPublishing: workerSummary(tiktokPublishing),
    tiktokAnalytics: workerSummary(tiktokAnalytics),
  });
  return NextResponse.json(
    {
      ok,
      status,
      health: { publishing: publishingOk, analytics: analyticsOk },
      instagram: { publishing: instagramPublishing, analytics: instagramAnalytics },
      tiktok: { publishing: tiktokPublishing, analytics: tiktokAnalytics },
    },
    {
      status: ok ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
