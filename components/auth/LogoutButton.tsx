"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/components/LanguageProvider";

export function LogoutButton({ className = "", label = "Logout" }: { className?: string; label?: string }) {
  const [pending, setPending] = useState(false);
  const { language } = useLanguage();

  const logout = async () => {
    if (pending) return;
    setPending(true);
    const supabase = createClient();
    if (!supabase) {
      window.location.assign("/logout");
      return;
    }

    const { error } = await supabase.auth.signOut({ scope: "local" });
    if (error) {
      window.location.assign("/logout");
      return;
    }
    window.location.replace("/");
  };

  const localizedLabel = label === "Logout" ? (language === "ka" ? "გასვლა" : "Logout") : label;
  return <button type="button" onClick={logout} disabled={pending} className={className}>{pending ? (language === "ka" ? "გამოსვლა..." : "Signing out...") : localizedLabel}</button>;
}
