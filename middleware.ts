import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { isSupabaseConfigured, supabasePublishableKey, supabaseUrl } from "@/lib/supabase/config";
import { canAccessAdminPath, defaultAdminPath, isStaffRole, isUserRole } from "@/lib/auth/permissions";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const pathname = request.nextUrl.pathname;
  const protectedPath = pathname.startsWith("/admin") || pathname.startsWith("/account") || pathname === "/checkout";
  if (!protectedPath) return response;

  const redirectToLogin = () => {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(url);
  };

  if (!isSupabaseConfigured()) return redirectToLogin();

  const supabase = createServerClient(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return redirectToLogin();

  const { data: profile } = await supabase.from("profiles").select("role,is_active").eq("id", userData.user.id).single();
  if (!profile?.is_active || !isUserRole(profile.role)) {
    await supabase.auth.signOut();
    return redirectToLogin();
  }
  if (pathname.startsWith("/admin") && (!isStaffRole(profile.role) || !canAccessAdminPath(profile.role, pathname))) {
    const url = request.nextUrl.clone();
    url.pathname = isStaffRole(profile.role) ? defaultAdminPath(profile.role) : "/account";
    url.search = "";
    return NextResponse.redirect(url);
  }
  if (pathname.startsWith("/account") && isStaffRole(profile.role)) {
    const url = request.nextUrl.clone();
    url.pathname = defaultAdminPath(profile.role);
    url.search = "";
    return NextResponse.redirect(url);
  }
  if (pathname === "/checkout" && isStaffRole(profile.role)) {
    const url = request.nextUrl.clone();
    url.pathname = defaultAdminPath(profile.role);
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ["/admin/:path*", "/account/:path*", "/checkout"],
};
