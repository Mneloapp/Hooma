import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { defaultAdminPath, isStaffRole, isUserRole } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";

function requestOrigin(request: Request) {
  const requestUrl = new URL(request.url);
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProtocol = request.headers.get("x-forwarded-proto") ?? "https";
  return forwardedHost ? `${forwardedProtocol}://${forwardedHost}` : requestUrl.origin;
}

function failureRedirect(origin: string) {
  return NextResponse.redirect(new URL("/login?error=confirmation", origin));
}

/**
 * Completes Supabase's email-change flow from the trusted token hash in the
 * dedicated Change email address template. Keeping this separate from signup
 * confirmation prevents one token type from being accepted in another flow.
 */
export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const origin = requestOrigin(request);
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type");
  const code = requestUrl.searchParams.get("code");
  const supabase = await createClient();

  if (!supabase) return failureRedirect(origin);

  let user: User | null;
  if (tokenHash || type) {
    if (!tokenHash || type !== "email_change") return failureRedirect(origin);
    const { data: verification, error: verificationError } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: "email_change",
    });
    if (verificationError) return failureRedirect(origin);
    user = verification.user;
  } else if (code) {
    // Hosted Supabase keeps using its safe default ConfirmationURL until the
    // branded token-hash template is copied into the dashboard. Supporting the
    // PKCE code here keeps email changes functional during that rollout.
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) return failureRedirect(origin);
    const { data: userData } = await supabase.auth.getUser();
    user = userData.user;
  } else {
    return failureRedirect(origin);
  }
  if (!user?.email) return failureRedirect(origin);

  const { data: profile, error: profileLookupError } = await (supabase as any)
    .from("profiles")
    .select("role,is_active")
    .eq("id", user.id)
    .single();
  if (profileLookupError || !profile?.is_active || !isUserRole(profile.role)) {
    await supabase.auth.signOut();
    return failureRedirect(origin);
  }

  const [{ error: profileSyncError }, { error: customerSyncError }] = await Promise.all([
    (supabase as any)
      .from("profiles")
      .update({ email: user.email, last_login_at: new Date().toISOString() })
      .eq("id", user.id),
    (supabase as any)
      .from("customers")
      .update({ email: user.email })
      .eq("profile_id", user.id),
  ]);
  if (profileSyncError || customerSyncError) {
    await supabase.auth.signOut();
    return failureRedirect(origin);
  }

  const emailChangeStatus = user.new_email ? "pending" : "confirmed";
  const destination = isStaffRole(profile.role)
    ? defaultAdminPath(profile.role)
    : `/account/settings?email_change=${emailChangeStatus}`;
  return NextResponse.redirect(new URL(destination, origin));
}
