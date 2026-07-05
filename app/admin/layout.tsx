import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { requireRole } from "@/lib/supabase/server";

export default async function Layout({ children }: { children: ReactNode }) {
  const profile = isSupabaseConfigured() ? await requireRole("admin") : null;
  if (isSupabaseConfigured() && !profile) redirect("/login?next=/admin");
  return <AdminLayout profile={profile}>{children}</AdminLayout>;
}
