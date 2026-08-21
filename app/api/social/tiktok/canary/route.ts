import { createHash } from "node:crypto";
import { NextResponse } from "next/server";

import { requirePermission } from "@/lib/supabase/server";
import { TIKTOK_NINE_DAY_CAMPAIGN_ITEMS } from "@/lib/social/campaigns/tiktok-nine-day-2026-08-22";
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
    const connection = await loadTikTokPublishingConnection();
    const client = new TikTokBusinessOrganicClient({
      activation: tiktokOrganicActivation(connection),
      networkEnabled: true,
    });
    const first = TIKTOK_NINE_DAY_CAMPAIGN_ITEMS[0]!;
    const duplicate = await client.lookupOwnedPostDuplicate({
      accountId: connection.externalAccountId,
      captionSha256: createHash("sha256").update(first.caption, "utf8").digest("hex"),
      notBefore: "2026-08-01T00:00:00.000Z",
      maxPages: 5,
    }, connection.accessToken);
    return response(200, {
      ok: true,
      status: "PASS",
      account: "@hooma.ge",
      schemaFrozen: client.connectionStatus().schemaFrozen,
      networkEnabled: client.connectionStatus().networkEnabled,
      duplicateCheck: duplicate.status,
      scannedCount: duplicate.scannedCount,
      providerRequestRecorded: duplicate.providerRequestId !== null,
    });
  } catch (error) {
    return response(503, { ok: false, status: "FAILED_CLOSED", errorCode: safeError(error) });
  }
}
