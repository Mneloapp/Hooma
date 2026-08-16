import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { requireStaff } from "@/lib/supabase/server";
import { privatePageMetadata } from "@/lib/seo";

export const metadata = privatePageMetadata;

export default async function Layout({ children }: { children: ReactNode }) {
  const profile = isSupabaseConfigured() ? await requireStaff() : null;
  if (isSupabaseConfigured() && !profile) redirect("/login?next=/admin");
  return <AdminLayout profile={profile}>{children}</AdminLayout>;
}
