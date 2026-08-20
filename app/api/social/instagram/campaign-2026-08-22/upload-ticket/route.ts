import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/supabase/server";
import {
  instagramNineDayCampaignItem,
} from "@/lib/social/campaigns/instagram-nine-day-2026-08-22";
import { SOCIAL_STAGING_BUCKET } from "@/lib/social/staging";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEADERS = { "Cache-Control": "no-store" };

function response(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status, headers: HEADERS });
}

export async function POST(request: Request) {
  if (new URL(request.url).origin !== "https://hooma.ge") {
    return response(403, { ok: false, status: "ORIGIN_REJECTED" });
  }
  const actor = await requirePermission("team.manage");
  if (!actor) return response(401, { ok: false, status: "UNAUTHORIZED" });
  if (actor.role !== "owner") return response(403, { ok: false, status: "FORBIDDEN" });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return response(400, { ok: false, status: "INVALID_REQUEST" });
  }
  const postId = body && typeof body === "object" && "postId" in body
    ? (body as { postId?: unknown }).postId
    : null;
  const item = instagramNineDayCampaignItem(postId);
  if (!item) return response(404, { ok: false, status: "CAMPAIGN_ITEM_NOT_FOUND" });

  const admin = createAdminClient() as any;
  if (!admin) return response(503, { ok: false, status: "DATABASE_UNAVAILABLE" });
  const bucket = admin.storage.from(SOCIAL_STAGING_BUCKET);
  const [video, cover] = await Promise.all([
    bucket.createSignedUploadUrl(item.videoObjectPath, { upsert: true }),
    bucket.createSignedUploadUrl(item.coverObjectPath, { upsert: true }),
  ]);
  if (
    video.error
    || cover.error
    || typeof video.data?.token !== "string"
    || typeof cover.data?.token !== "string"
  ) {
    return response(503, { ok: false, status: "UPLOAD_TICKET_UNAVAILABLE" });
  }
  return response(200, {
    ok: true,
    postId: item.postId,
    bucket: SOCIAL_STAGING_BUCKET,
    video: { path: item.videoObjectPath, token: video.data.token },
    cover: { path: item.coverObjectPath, token: cover.data.token },
  });
}
