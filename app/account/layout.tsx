import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AccountLayout } from "@/components/account/AccountLayout";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { requireRole } from "@/lib/supabase/server";

export default async function Layout({ children }: { children: ReactNode }) {
  const profile = isSupabaseConfigured() ? await requireRole("customer") : null;
  if (isSupabaseConfigured() && !profile) redirect("/login?next=/account");
  return <AccountLayout profile={profile}>{children}</AccountLayout>;
}
