import Link from "next/link";
import type { Profile } from "@/lib/supabase/types";

export function AdminTopbar({ profile }: { profile: Profile | null }) {
  return (
    <header className="sticky top-0 z-20 border-b border-hooma-text/10 bg-hooma-bg/90 px-4 py-4 backdrop-blur sm:px-6 lg:px-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-hooma-muted">Admin</p>
          <p className="font-medium">{profile?.email ?? "Supabase preview mode"}</p>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <Link href="/shop" className="text-hooma-muted hover:text-hooma-text">View shop</Link>
          <Link href="/logout" className="rounded-full border border-hooma-text/10 px-4 py-2 hover:border-hooma-accent">Logout</Link>
        </div>
      </div>
    </header>
  );
}
