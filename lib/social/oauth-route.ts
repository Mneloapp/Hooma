import "server-only";

import { NextResponse } from "next/server";
import { providerConfig, type SocialProvider } from "./config";

export type OAuthResult = "connected" | "denied" | "failed" | "state_rejected";

export function socialFeatureUnavailable() {
  return NextResponse.json(
    { ok: false, message: "Social publishing is unavailable." },
    { status: 503 },
  );
}

export function oauthResultRedirect(provider: SocialProvider, result: OAuthResult) {
  const callback = new URL(providerConfig(provider).redirectUri);
  const destination = new URL("/admin/settings", callback.origin);
  destination.searchParams.set("social_provider", provider);
  destination.searchParams.set("social_result", result);
  return NextResponse.redirect(destination, { status: 303 });
}

export function boundedOAuthParameter(value: string | null, maximum = 4_096) {
  return value && value.length <= maximum && !/[\u0000-\u001f\u007f]/.test(value)
    ? value
    : null;
}
