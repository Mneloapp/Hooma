import Link from "next/link";
import type { ReactNode } from "react";
import type { Profile } from "@/lib/supabase/types";
import { LogoutButton } from "@/components/auth/LogoutButton";

const links = [
  ["/account", "Overview"],
  ["/account/orders", "Orders"],
  ["/account/custom-orders", "Custom requests"],
  ["/account/addresses", "Addresses"],
  ["/account/settings", "Settings"],
];

export function AccountLayout({ children, profile }: { children: ReactNode; profile: Profile | null }) {
  return (
    <section className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:px-6 lg:grid-cols-[260px_1fr] lg:px-8">
      <aside className="rounded-[1.5rem] bg-white/70 p-5 shadow-soft">
        <p className="text-xs uppercase tracking-[0.24em] text-hooma-muted">Account</p>
        <p className="mt-2 font-medium">{profile?.email ?? "Preview customer"}</p>
        <nav className="mt-6 grid gap-1">
          {links.map(([href, label]) => (
            <Link key={href} href={href} className="rounded-full px-4 py-3 text-sm text-hooma-muted transition hover:bg-hooma-panel hover:text-hooma-text">{label}</Link>
          ))}
          <LogoutButton className="rounded-full px-4 py-3 text-left text-sm text-hooma-muted transition hover:bg-hooma-panel hover:text-hooma-text disabled:opacity-60" />
        </nav>
      </aside>
      <div>{children}</div>
    </section>
  );
}
