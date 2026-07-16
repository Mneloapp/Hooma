"use client";

import { useLanguage } from "@/components/LanguageProvider";

export default function AccountSettingsPage() {
  const { language } = useLanguage();
  return (
    <div className="rounded-[2rem] bg-white/75 p-6 shadow-soft">
      <p className="text-xs uppercase tracking-[0.28em] text-hooma-muted">{language === "ka" ? "პარამეტრები" : "Settings"}</p>
      <h1 className="mt-3 text-4xl font-medium">{language === "ka" ? "ანგარიშის პარამეტრები" : "Account settings"}</h1>
      <p className="mt-4 text-hooma-muted">{language === "ka" ? "პაროლისა და ელფოსტის პარამეტრები იმართება Supabase Auth-ის მეშვეობით." : "Password and email preferences remain managed by Supabase Auth."}</p>
    </div>
  );
}
