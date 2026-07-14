import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AccountLayout } from "@/components/account/AccountLayout";
import { requireRole } from "@/lib/supabase/server";

export default async function Layout({ children }: { children: ReactNode }) {
  const profile = await requireRole("customer");
  if (!profile) redirect("/login?next=/account");
  return <AccountLayout profile={profile}>{children}</AccountLayout>;
}
