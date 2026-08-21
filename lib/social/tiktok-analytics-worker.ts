import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { tiktokOrganicNetworkEnabled } from "./config";
import { loadTikTokPublishingConnection } from "./connections";
import { TikTokBusinessOrganicClient } from "./providers/tiktok-business-organic";
import { tiktokOrganicActivation } from "./tiktok-activation";

type JsonObject = Record<string, unknown>;
type AdminClient = ReturnType<typeof createAdminClient> & {
  rpc(name: string, args?: JsonObject): Promise<{ data: unknown; error: { code?: string } | null }>;
};

function object(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : null;
}

function parseClaim(value: unknown) {
  const row = object(value);
  const jobId = typeof row?.job_id === "string" ? row.job_id : "";
  const accountId = typeof row?.account_id === "string" ? row.account_id : "";
  const postId = typeof row?.post_id === "string" ? row.post_id : "";
  const horizon = row?.horizon;
  if (
    !/^[0-9a-f-]{36}$/i.test(jobId)
    || !/^[A-Za-z0-9._:~-]{1,256}$/.test(accountId)
    || !/^[1-9]\d{7,39}$/.test(postId)
    || (horizon !== "T2H" && horizon !== "T24H" && horizon !== "T72H")
  ) throw new Error("TIKTOK_ANALYTICS_CLAIM_INVALID");
  return { jobId, accountId, postId, horizon };
}

async function rpc(admin: AdminClient, name: string, args: JsonObject = {}) {
  const { data, error } = await admin.rpc(name, args);
  if (error) throw new Error(`SOCIAL_DATABASE_RPC_FAILED:${error.code ?? "UNKNOWN"}`);
  return data;
}

function safeError(error: unknown) {
  const raw = error instanceof Error ? error.message.split(":", 1)[0] : "UNEXPECTED_FAILURE";
  return /^[A-Z0-9_]{3,80}$/.test(raw) ? raw : "UNEXPECTED_FAILURE";
}

export async function runTikTokAnalyticsWorker(options: {
  admin?: AdminClient;
  now?: Date;
  connection?: Awaited<ReturnType<typeof loadTikTokPublishingConnection>>;
  client?: TikTokBusinessOrganicClient;
} = {}) {
  if (!tiktokOrganicNetworkEnabled()) {
    return { status: "DISABLED" as const, externalActionsPerformed: false, result: null };
  }
  const admin = options.admin ?? createAdminClient() as AdminClient;
  if (!admin) return { status: "BLOCKED_DATABASE_UNAVAILABLE" as const, externalActionsPerformed: false, result: null };
  try {
    const now = options.now ?? new Date();
    const connection = options.connection ?? await loadTikTokPublishingConnection(now);
    const client = options.client ?? new TikTokBusinessOrganicClient({
      activation: tiktokOrganicActivation(connection),
      networkEnabled: true,
    });
    const rawClaim = await rpc(admin, "claim_due_tiktok_analytics_v1");
    if (rawClaim === null) return { status: "IDLE" as const, externalActionsPerformed: false, result: null };
    const claim = parseClaim(rawClaim);
    if (claim.accountId !== connection.externalAccountId) {
      throw new Error("TIKTOK_ANALYTICS_ACCOUNT_MISMATCH");
    }
    const snapshot = await client.fetchOwnedPostMetrics({
      accountId: claim.accountId,
      postId: claim.postId,
    }, connection.accessToken);
    const metrics = {
      views: snapshot.metrics.views,
      likes: snapshot.metrics.likes,
      comments: snapshot.metrics.comments,
      shares: snapshot.metrics.shares,
      favorites: snapshot.metrics.favorites,
      reach: snapshot.metrics.reach,
      total_time_watched: snapshot.metrics.totalWatchTimeSeconds,
      average_time_watched: snapshot.metrics.averageWatchTimeSeconds,
      full_video_watched_rate: snapshot.metrics.fullVideoWatchedRate,
      new_followers: snapshot.metrics.newFollowers,
      profile_views: snapshot.metrics.profileViews,
      website_clicks: snapshot.metrics.websiteClicks,
    };
    await rpc(admin, "record_tiktok_analytics_snapshot_v1", {
      requested_job_id: claim.jobId,
      requested_post_id: claim.postId,
      requested_horizon: claim.horizon,
      requested_captured_at: now.toISOString(),
      requested_metrics: metrics,
    });
    return {
      status: "COMPLETE" as const,
      externalActionsPerformed: false,
      result: { jobId: claim.jobId, horizon: claim.horizon, availability: snapshot.status },
    };
  } catch (error) {
    return {
      status: "FAILED_CLOSED" as const,
      externalActionsPerformed: false,
      result: { errorCode: safeError(error) },
    };
  }
}
