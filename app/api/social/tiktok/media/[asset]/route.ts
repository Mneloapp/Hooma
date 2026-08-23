import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  decodeTikTokMediaSource,
  TIKTOK_MEDIA_PROXY_PREFIX,
} from "@/lib/social/tiktok-media-delivery";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_VIDEO_BYTES = 512 * 1024 * 1024;
const VERIFICATION_FILE = /^[A-Za-z0-9._=-]{1,240}$/;
const VIDEO_ASSET = /^[a-f0-9]{64}\.mp4$/;
const RANGE = /^bytes=\d*-\d*$/;

async function verificationFile(asset: string) {
  if (!VERIFICATION_FILE.test(asset) || VIDEO_ASSET.test(asset)) return null;
  const admin = createAdminClient();
  if (!admin) return null;
  const { data, error } = await admin
    .from("social_tiktok_url_property_verifications")
    .select("signature")
    .eq("property_url", TIKTOK_MEDIA_PROXY_PREFIX)
    .eq("file_name", asset)
    .maybeSingle();
  if (error || typeof data?.signature !== "string") return null;
  return new Response(data.signature, {
    status: 200,
    headers: {
      "Cache-Control": "public, max-age=60, must-revalidate",
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

async function deliver(request: Request, context: { params: Promise<{ asset: string }> }) {
  const { asset } = await context.params;
  const verification = await verificationFile(asset);
  if (verification) return request.method === "HEAD"
    ? new Response(null, { status: verification.status, headers: verification.headers })
    : verification;
  if (!VIDEO_ASSET.test(asset)) {
    return NextResponse.json({ ok: false, status: "NOT_FOUND" }, { status: 404 });
  }
  try {
    const requestUrl = new URL(request.url);
    const encodedSource = requestUrl.searchParams.get("source");
    if (!encodedSource || [...requestUrl.searchParams.keys()].some((key) => key !== "source")) {
      throw new Error("TIKTOK_MEDIA_DELIVERY_REQUEST_INVALID");
    }
    const source = decodeTikTokMediaSource(encodedSource, asset);
    const range = request.headers.get("range");
    if (range && !RANGE.test(range)) throw new Error("TIKTOK_MEDIA_RANGE_INVALID");
    const upstream = await fetch(source, {
      method: request.method,
      headers: range ? { Range: range } : undefined,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
    });
    if (!upstream.ok && upstream.status !== 206) {
      return NextResponse.json({ ok: false, status: "SOURCE_UNAVAILABLE" }, { status: 502 });
    }
    const rawLength = upstream.headers.get("content-length");
    const length = rawLength === null ? null : Number(rawLength);
    if (length !== null && (!Number.isFinite(length) || length < 1 || length > MAX_VIDEO_BYTES)) {
      throw new Error("TIKTOK_MEDIA_SIZE_INVALID");
    }
    const headers = new Headers({
      "Cache-Control": "private, no-store, max-age=0",
      "Content-Type": "video/mp4",
      "Content-Disposition": `inline; filename="${asset}"`,
      "X-Content-Type-Options": "nosniff",
    });
    for (const name of ["content-length", "content-range", "accept-ranges"]) {
      const value = upstream.headers.get(name);
      if (value) headers.set(name, value);
    }
    return new Response(request.method === "HEAD" ? null : upstream.body, {
      status: upstream.status,
      headers,
    });
  } catch {
    return NextResponse.json({ ok: false, status: "DELIVERY_REJECTED" }, { status: 400 });
  }
}

export async function GET(
  request: Request,
  context: { params: Promise<{ asset: string }> },
) {
  return deliver(request, context);
}

export async function HEAD(
  request: Request,
  context: { params: Promise<{ asset: string }> },
) {
  return deliver(request, context);
}
