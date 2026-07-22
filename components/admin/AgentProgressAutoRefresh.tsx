"use client";

import { RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useTransition } from "react";

const isEditing = () => {
  const element = document.activeElement as HTMLElement | null;
  return element?.matches("input, select, textarea, [contenteditable='true']") === true;
};

export function AgentProgressAutoRefresh({ active }: { active: boolean }) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const refresh = useCallback(() => startRefresh(() => router.refresh()), [router]);

  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible" && !isEditing()) refresh();
    }, 5_000);
    return () => window.clearInterval(timer);
  }, [active, refresh]);

  return (
    <button type="button" onClick={refresh} disabled={refreshing} className="inline-flex items-center gap-2 rounded-full border border-hooma-text/10 bg-white px-3 py-2 text-xs font-semibold disabled:opacity-60">
      <RefreshCw size={14} className={refreshing ? "animate-spin" : undefined} />
      {active ? "Live · ყოველ 5 წამში" : "პროგრესის განახლება"}
    </button>
  );
}
