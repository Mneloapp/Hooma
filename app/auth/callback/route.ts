import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { defaultAdminPath, isStaffRole, isUserRole } from "@/lib/auth/permissions";

const safeNextPath = (value: string | null) => {
  const safePath = value?.startsWith("/") && !value.startsWith("//") && !value.includes("\\") ? value : "/account";
  return safePath === "/" ? "/account" : safePath;
};

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const requestedNext = safeNextPath(requestUrl.searchParams.get("next"));
  const forwardedHost = request.headers.get("x-forwarded-host");
  const forwardedProtocol = request.headers.get("x-forwarded-proto") ?? "https";
  const origin = forwardedHost ? `${forwardedProtocol}://${forwardedHost}` : requestUrl.origin;
  const supabase = await createClient();

  if (!code || !supabase) return NextResponse.redirect(new URL("/login?error=oauth", origin));

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(new URL("/login?error=oauth", origin));

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.redirect(new URL("/login?error=oauth", origin));

  const { data: profile } = await (supabase as any).from("profiles").select("role,is_active").eq("id", userData.user.id).single();
  if (!profile?.is_active || !isUserRole(profile.role)) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL("/login?error=disabled", origin));
  }

  await (supabase as any).from("profiles").update({ last_login_at: new Date().toISOString() }).eq("id", userData.user.id);
  const next = isStaffRole(profile.role) && requestedNext.startsWith("/account") ? defaultAdminPath(profile.role) : requestedNext;
  return NextResponse.redirect(new URL(next, origin));
}
