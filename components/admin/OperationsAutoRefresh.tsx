"use client";

import { RefreshCw } from "lucide-react";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function OperationsAutoRefresh() {
  const router = useRouter();
  useEffect(() => {
    const timer = window.setInterval(() => {
      const activeTag = document.activeElement?.tagName;
      const editing = activeTag === "INPUT" || activeTag === "SELECT" || activeTag === "TEXTAREA";
      if (document.visibilityState === "visible" && !editing) router.refresh();
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [router]);

  return <button type="button" onClick={() => router.refresh()} className="inline-flex items-center gap-2 rounded-full border border-hooma-text/10 bg-white/70 px-4 py-2 text-xs font-semibold"><RefreshCw size={14} />რიგის განახლება · auto 10წმ</button>;
}
