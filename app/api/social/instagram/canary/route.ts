import { NextResponse } from "next/server";

import { requirePermission } from "@/lib/supabase/server";
import { instagramReadActivation } from "@/lib/social/instagram-activation";
import { instagramApiNetworkEnabled } from "@/lib/social/config";
import { loadInstagramPublishingConnection } from "@/lib/social/connections";
import { runInstagramReadCanary } from "@/lib/social/instagram-read-canary";
import {
  InstagramReelsReadClient,
  InstagramReelsReadError,
} from "@/lib/social/providers/instagram-reels-read";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEADERS = { "Cache-Control": "no-store" };

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  if (requestUrl.origin !== "https://hooma.ge") {
    return NextResponse.redirect(
      "https://hooma.ge/api/social/instagram/canary",
      { status: 303 },
    );
  }
  const actor = await requirePermission("team.manage");
  if (!actor) {
    return NextResponse.json(
      { ok: false, status: "UNAUTHORIZED" },
      { status: 401, headers: HEADERS },
    );
  }
  if (actor.role !== "owner") {
    return NextResponse.json(
      { ok: false, status: "FORBIDDEN" },
      { status: 403, headers: HEADERS },
    );
  }
  if (!instagramApiNetworkEnabled()) {
    return NextResponse.json(
      { ok: false, status: "NETWORK_DISABLED" },
      { status: 503, headers: HEADERS },
    );
  }

  try {
    const connection = await loadInstagramPublishingConnection();
    const result = await runInstagramReadCanary({
      connection,
      client: new InstagramReelsReadClient({
        activation: instagramReadActivation(connection),
        networkEnabled: true,
        insightsEnabled: false,
      }),
    });
    return NextResponse.json(
      { ok: true, ...result },
      { status: 200, headers: HEADERS },
    );
  } catch (error) {
    const diagnostic = error instanceof InstagramReelsReadError
      ? { code: error.code, operation: error.operation, retryable: error.retryable }
      : { code: "CANARY_FAILED", operation: "local", retryable: false };
    console.error(JSON.stringify({
      level: "error",
      message: "instagram_read_canary_failed",
      ...diagnostic,
    }));
    return NextResponse.json(
      { ok: false, status: "FAILED_CLOSED", ...diagnostic, sideEffects: false },
      { status: 503, headers: HEADERS },
    );
  }
}
