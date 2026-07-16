import Link from "next/link";
import type { Profile } from "@/lib/supabase/types";
import { hasPermission, roleLabels } from "@/lib/auth/permissions";
import { adminNavItems } from "./AdminSidebar";
import { LogoutButton } from "@/components/auth/LogoutButton";

export function AdminTopbar({ profile }: { profile: Profile | null }) {
  return (
    <header className="sticky top-0 z-20 border-b border-hooma-text/10 bg-hooma-bg/90 px-4 py-4 backdrop-blur sm:px-6 lg:px-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-hooma-muted">{profile ? roleLabels[profile.role] : "Admin"}</p>
          <p className="font-medium">{profile?.email ?? "Supabase preview mode"}</p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          {profile ? <details className="relative lg:hidden"><summary className="cursor-pointer list-none rounded-full border border-hooma-text/10 px-4 py-2">მენიუ</summary><nav className="absolute right-0 mt-2 w-64 rounded-2xl border border-hooma-text/10 bg-white p-2 shadow-xl">{adminNavItems.filter(([, , permission]) => hasPermission(profile.role, permission)).map(([href, label]) => <Link key={href} href={href} className="block rounded-xl px-3 py-2.5 hover:bg-hooma-panel">{label}</Link>)}</nav></details> : null}
          <Link href="/shop" className="text-hooma-muted hover:text-hooma-text">View shop</Link>
          <LogoutButton className="rounded-full border border-hooma-text/10 px-4 py-2 hover:border-hooma-accent disabled:opacity-60" />
        </div>
      </div>
    </header>
  );
}
