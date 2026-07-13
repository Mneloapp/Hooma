import type { ReactNode } from "react";
import type { Profile } from "@/lib/supabase/types";
import { AdminSidebar } from "./AdminSidebar";
import { AdminTopbar } from "./AdminTopbar";

export function AdminLayout({ children, profile }: { children: ReactNode; profile: Profile | null }) {
  return (
    <div className="min-h-screen bg-hooma-background text-hooma-text lg:flex">
      <AdminSidebar />
      <div className="min-w-0 flex-1">
        <AdminTopbar profile={profile} />
        <main className="px-4 py-8 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}
