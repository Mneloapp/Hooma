"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function OrdersAutoRefresh() {
  const router = useRouter();
  useEffect(() => {
    const timer = window.setInterval(() => router.refresh(), 15_000);
    return () => window.clearInterval(timer);
  }, [router]);
  return <span className="text-xs text-hooma-muted">სტატუსი ავტომატურად ახლდება</span>;
}
