import { NextResponse } from "next/server";
import { defaultAdminPath, isStaffRole, isUserRole } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";

const safeNextPath = (value: string | null) => {
  const safePath = value?.startsWith("/") && !value.startsWith("//") && !value.includes("\\") ? value : "/account";
  return safePath === "/" ? "/account" : safePath;
};

/**
 * Confirms email signups directly from Supabase's token hash.
 *
 * Unlike the OAuth PKCE callback, this flow does not depend on the browser
 * retaining the signup code-verifier cookie. Confirmation therefore keeps
 * working when a customer opens the email in another browser context or after
 * the canonical-domain redirect.
 */
export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type");
  const requestedNext = safeNextPath(requestUrl.searchParams.get("next"));
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProtocol = request.headers.get("x-forwarded-proto") ?? "https";
  const origin = forwardedHost ? `${forwardedProtocol}://${forwardedHost}` : requestUrl.origin;
  const supabase = await createClient();
  const confirmationError = new URL("/login?error=confirmation", origin);

  if (!tokenHash || type !== "email" || !supabase) {
    return NextResponse.redirect(confirmationError);
  }

  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: "email",
  });
  if (error) return NextResponse.redirect(confirmationError);

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.redirect(confirmationError);

  const { data: profile } = await (supabase as any)
    .from("profiles")
    .select("role,is_active")
    .eq("id", userData.user.id)
    .single();

  if (!profile?.is_active || !isUserRole(profile.role)) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/login?error=disabled", origin));
  }

  await (supabase as any)
    .from("profiles")
    .update({ last_login_at: new Date().toISOString() })
    .eq("id", userData.user.id);

  const next = isStaffRole(profile.role) && requestedNext.startsWith("/account")
    ? defaultAdminPath(profile.role)
    : requestedNext;
  return NextResponse.redirect(new URL(next, origin));
}
