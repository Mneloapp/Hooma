"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import type { Profile } from "@/lib/supabase/types";
import { LogoutButton } from "@/components/auth/LogoutButton";
import { useLanguage } from "@/components/LanguageProvider";
import { isAccountLinkActive } from "@/components/account/account-navigation";

const links = [
  ["/account", "მიმოხილვა", "Overview"],
  ["/account/hooma-plus", "Hooma+", "Hooma+"],
  ["/account/orders", "შეკვეთები", "Orders"],
  ["/account/custom-orders", "ინდივიდუალური მოთხოვნები", "Custom requests"],
  ["/account/addresses", "მისამართები", "Addresses"],
  ["/account/settings", "პარამეტრები", "Settings"],
];

export function AccountLayout({ children, profile }: { children: ReactNode; profile: Profile | null }) {
  const { language } = useLanguage();
  const pathname = usePathname();

  return (
    <section className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:px-6 lg:grid-cols-[260px_1fr] lg:px-8">
      <aside className="rounded-[1.5rem] bg-white/70 p-5 shadow-soft">
        <p className="text-xs uppercase tracking-[0.24em] text-hooma-muted">{language === "ka" ? "ანგარიში" : "Account"}</p>
        <p className="mt-2 font-medium">{profile?.email ?? (language === "ka" ? "სატესტო მომხმარებელი" : "Preview customer")}</p>
        <nav aria-label={language === "ka" ? "ანგარიშის მენიუ" : "Account navigation"} className="mt-6 grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-1">
          {links.map(([href, labelKa, labelEn]) => {
            const active = isAccountLinkActive(pathname, href);

            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-11 items-center rounded-2xl px-4 py-3 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hooma-accent focus-visible:ring-offset-2 ${
                  active
                    ? "bg-hooma-text font-semibold text-white shadow-sm"
                    : "text-hooma-muted hover:bg-hooma-panel hover:text-hooma-text"
                }`}
              >
                {language === "ka" ? labelKa : labelEn}
              </Link>
            );
          })}
          <LogoutButton className="col-span-2 min-h-11 rounded-2xl px-4 py-3 text-left text-sm text-hooma-muted transition hover:bg-hooma-panel hover:text-hooma-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hooma-accent focus-visible:ring-offset-2 disabled:opacity-60 sm:col-span-3 lg:col-span-1" />
        </nav>
      </aside>
      <div>{children}</div>
    </section>
  );
}
