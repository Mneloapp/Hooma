import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/supabase/server";
import { loadTikTokPublishingConnection } from "@/lib/social/connections";
import {
  TikTokBusinessOrganicClient,
  TikTokOrganicError,
} from "@/lib/social/providers/tiktok-business-organic";
import { tiktokOrganicActivation } from "@/lib/social/tiktok-activation";
import { TIKTOK_MEDIA_PROXY_PREFIX } from "@/lib/social/tiktok-media-delivery";

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
    if (!admin) throw new Error("SOCIAL_DATABASE_UNAVAILABLE");
    const connection = await loadTikTokPublishingConnection();
    const client = new TikTokBusinessOrganicClient({
      activation: tiktokOrganicActivation(connection),
      networkEnabled: true,
    });
    const current = await client.fetchUrlPropertyStatus({
      mediaBaseUrl: TIKTOK_MEDIA_PROXY_PREFIX,
    });
    if (current.status === "VERIFIED") {
      return response(200, { ok: true, status: "VERIFIED", propertyUrl: TIKTOK_MEDIA_PROXY_PREFIX });
    }
    const pending = current.status === "NOT_ADDED"
      ? await client.addUrlProperty({ propertyUrl: TIKTOK_MEDIA_PROXY_PREFIX })
      : {
        propertyType: current.matchingPropertyType,
        propertyStatus: 0,
        propertyUrl: TIKTOK_MEDIA_PROXY_PREFIX,
        fileName: current.matchingFileName,
        signature: current.matchingSignature,
        providerRequestId: current.providerRequestId,
      };
    if (
      pending.propertyType !== 2
      || pending.propertyUrl !== TIKTOK_MEDIA_PROXY_PREFIX
      || !pending.fileName
      || !pending.signature
    ) throw new Error("TIKTOK_URL_PROPERTY_PENDING_INVALID");
    const { error: persistError } = await admin
      .from("social_tiktok_url_property_verifications")
      .upsert({
        property_url: pending.propertyUrl,
        property_type: pending.propertyType,
        property_status: pending.propertyStatus,
        file_name: pending.fileName,
        signature: pending.signature,
        provider_request_id: pending.providerRequestId,
        updated_at: new Date().toISOString(),
      }, { onConflict: "property_url" });
    if (persistError) throw new Error("TIKTOK_URL_PROPERTY_PERSIST_FAILED");
    const verified = await client.verifyUrlProperty({ propertyUrl: TIKTOK_MEDIA_PROXY_PREFIX });
    const { error: updateError } = await admin
      .from("social_tiktok_url_property_verifications")
      .update({
        property_status: verified.propertyStatus,
        file_name: verified.fileName,
        signature: verified.signature,
        provider_request_id: verified.providerRequestId,
        updated_at: new Date().toISOString(),
      })
      .eq("property_url", TIKTOK_MEDIA_PROXY_PREFIX);
    if (updateError) throw new Error("TIKTOK_URL_PROPERTY_PERSIST_FAILED");
    if (verified.propertyStatus !== 1) {
      return response(503, { ok: false, status: "NOT_VERIFIED", propertyUrl: TIKTOK_MEDIA_PROXY_PREFIX });
    }
    return response(200, { ok: true, status: "VERIFIED", propertyUrl: TIKTOK_MEDIA_PROXY_PREFIX });
  } catch (error) {
    return response(503, { ok: false, status: "FAILED_CLOSED", errorCode: safeError(error) });
  }
}
