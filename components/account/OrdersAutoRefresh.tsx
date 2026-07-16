"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/components/LanguageProvider";

export function OrdersAutoRefresh() {
  const router = useRouter();
  const { language } = useLanguage();
  useEffect(() => {
    const timer = window.setInterval(() => router.refresh(), 15_000);
    return () => window.clearInterval(timer);
  }, [router]);
  return <span className="text-xs text-hooma-muted">{language === "ka" ? "სტატუსი ავტომატურად ახლდება" : "Status updates automatically"}</span>;
}
