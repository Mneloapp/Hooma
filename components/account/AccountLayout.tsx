"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { Profile } from "@/lib/supabase/types";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { useLanguage } from "@/components/LanguageProvider";

const links = [
  ["/account", "მიმოხილვა", "Overview"],
  ["/account/orders", "შეკვეთები", "Orders"],
  ["/account/custom-orders", "ინდივიდუალური მოთხოვნები", "Custom requests"],
  ["/account/addresses", "მისამართები", "Addresses"],
  ["/account/settings", "პარამეტრები", "Settings"],
];

export function AccountLayout({ children, profile }: { children: ReactNode; profile: Profile | null }) {
  const { language } = useLanguage();
  return (
    <section className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:px-6 lg:grid-cols-[260px_1fr] lg:px-8">
      <aside className="rounded-[1.5rem] bg-white/70 p-5 shadow-soft">
        <p className="text-xs uppercase tracking-[0.24em] text-hooma-muted">{language === "ka" ? "ანგარიში" : "Account"}</p>
        <p className="mt-2 font-medium">{profile?.email ?? (language === "ka" ? "სატესტო მომხმარებელი" : "Preview customer")}</p>
        <nav className="mt-6 grid gap-1">
          {links.map(([href, labelKa, labelEn]) => (
            <Link key={href} href={href} className="rounded-full px-4 py-3 text-sm text-hooma-muted transition hover:bg-hooma-panel hover:text-hooma-text">{language === "ka" ? labelKa : labelEn}</Link>
          ))}
          <LogoutButton className="rounded-full px-4 py-3 text-left text-sm text-hooma-muted transition hover:bg-hooma-panel hover:text-hooma-text disabled:opacity-60" />
        </nav>
      </aside>
      <div>{children}</div>
    </section>
  );
}
