import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  const packageName = process.env.HOOMA_ANDROID_APPLICATION_ID?.trim() || "ge.hooma.app";
  const fingerprints = (process.env.ANDROID_SHA256_CERT_FINGERPRINT ?? "")
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter((value) => /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(value));
  const statements = fingerprints.length ? [{
    relation: ["delegate_permission/common.handle_all_urls"],
    target: {
      namespace: "android_app",
      package_name: packageName,
      sha256_cert_fingerprints: fingerprints,
    },
  }] : [];
  return NextResponse.json(statements, {
    headers: {
      "Cache-Control": "public, max-age=300",
      "Content-Type": "application/json",
    },
  });
}
