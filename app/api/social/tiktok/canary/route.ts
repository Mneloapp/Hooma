import { createHash } from "node:crypto";
import { NextResponse } from "next/server";

import { requirePermission } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  TIKTOK_NINE_DAY_CAMPAIGN_ITEMS,
  tiktokNineDayCampaignItem,
} from "@/lib/social/campaigns/tiktok-nine-day-2026-08-22";
import { loadTikTokPublishingConnection } from "@/lib/social/connections";
import {
  TikTokBusinessOrganicClient,
  TikTokOrganicError,
} from "@/lib/social/providers/tiktok-business-organic";
import { tiktokOrganicActivation } from "@/lib/social/tiktok-activation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEADERS = { "Cache-Control": "no-store" };

function response(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status, headers: HEADERS });
}

function safeError(error: unknown) {
  if (error instanceof TikTokOrganicError) return error.code;
  const raw = error instanceof Error ? error.message.split(":", 1)[0] : "UNEXPECTED_FAILURE";
  return /^[A-Z0-9_]{3,80}$/.test(raw) ? raw : "UNEXPECTED_FAILURE";
}

export async function POST(request: Request) {
  if (new URL(request.url).origin !== "https://hooma.ge") {
    return response(403, { ok: false, status: "ORIGIN_REJECTED" });
  }
  const actor = await requirePermission("team.manage");
  if (!actor) return response(401, { ok: false, status: "UNAUTHORIZED" });
  if (actor.role !== "owner") return response(403, { ok: false, status: "FORBIDDEN" });
  try {
    const admin = createAdminClient();
    const latestUncertain = admin
      ? await admin
        .from("social_publish_jobs")
        .select("post_id")
        .eq("provider", "tiktok")
        .eq("state", "blocked_remote_uncertain")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle()
      : { data: null, error: null };
    if (latestUncertain.error) throw new Error("TIKTOK_CANARY_JOB_LOOKUP_FAILED");
    const connection = await loadTikTokPublishingConnection();
    const client = new TikTokBusinessOrganicClient({
      activation: tiktokOrganicActivation(connection),
      networkEnabled: true,
    });
    const target = tiktokNineDayCampaignItem(latestUncertain.data?.post_id)
      ?? TIKTOK_NINE_DAY_CAMPAIGN_ITEMS[0]!;
    const [settings, duplicate] = await Promise.all([
      client.fetchVideoSettings({ accountId: connection.externalAccountId }, connection.accessToken),
      client.lookupOwnedPostDuplicate({
      accountId: connection.externalAccountId,
      captionSha256: createHash("sha256").update(target.caption, "utf8").digest("hex"),
      notBefore: new Date(Date.parse(target.scheduledAt) - 72 * 60 * 60 * 1_000).toISOString(),
      maxPages: 5,
      }, connection.accessToken),
    ]);
    return response(200, {
      ok: true,
      status: "PASS",
      account: "@hooma.ge",
      checkedPostId: target.postId,
      schemaFrozen: client.connectionStatus().schemaFrozen,
      networkEnabled: client.connectionStatus().networkEnabled,
      settings: {
        commentDisabled: settings.commentDisabled,
        duetDisabled: settings.duetDisabled,
        stitchDisabled: settings.stitchDisabled,
        maxVideoPostDurationSec: settings.maxVideoPostDurationSec,
        publicPostingAvailable: settings.publicPostingAvailable,
      },
      duplicateCheck: duplicate.status,
      scannedCount: duplicate.scannedCount,
      duplicatePostId: duplicate.duplicate?.postId ?? null,
      duplicateProviderUrl: duplicate.duplicate?.providerUrl ?? null,
      providerRequestRecorded:
        settings.providerRequestId !== null && duplicate.providerRequestId !== null,
    });
  } catch (error) {
    return response(503, { ok: false, status: "FAILED_CLOSED", errorCode: safeError(error) });
  }
}
