import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { isSupabaseConfigured, supabasePublishableKey, supabaseUrl } from "./config";
import type { Database, Profile } from "./types";
import { hasPermission, isStaffRole, type Permission } from "@/lib/auth/permissions";
import type { UserRole } from "./types";

export async function createClient() {
  if (!isSupabaseConfigured()) return null;
  const cookieStore = await cookies();

  return createServerClient<Database>(supabaseUrl, supabasePublishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server components cannot set cookies; middleware handles refresh.
        }
      },
    },
  });
}

export async function getSessionUser() {
  const supabase = await createClient();
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}

export async function getProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  if (!supabase) return null;
  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return null;
  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  return (data as Profile | null) ?? null;
}

export async function requireRole(...roles: UserRole[]) {
  const profile = await getProfile();
  if (!profile || !profile.is_active || !roles.includes(profile.role)) return null;
  return profile;
}

export async function requireStaff() {
  const profile = await getProfile();
  if (!profile || !profile.is_active || !isStaffRole(profile.role)) return null;
  return profile;
}

export async function requirePermission(permission: Permission) {
  const profile = await getProfile();
  if (!profile || !profile.is_active || !hasPermission(profile.role, permission)) return null;
  return profile;
}
