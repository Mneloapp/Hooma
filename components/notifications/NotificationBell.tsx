"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function NotificationBell({ georgian }: { georgian: boolean }) {
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    const supabase = createClient() as any;
    let active = true;

    async function refresh() {
      const { data: authData } = await supabase.auth.getUser();
      const userId = authData.user?.id;
      if (!userId) {
        if (active) setUnreadCount(0);
        return;
      }

      const { count, error } = await supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("recipient_profile_id", userId)
        .is("read_at", null);

      if (active && !error) setUnreadCount(count ?? 0);
    }

    void refresh();
    const interval = window.setInterval(refresh, 15_000);
    const { data: authListener } = supabase.auth.onAuthStateChange(() => void refresh());

    return () => {
      active = false;
      window.clearInterval(interval);
      authListener.subscription.unsubscribe();
    };
  }, []);

  return (
    <Link
      aria-label={georgian ? "შეტყობინებები" : "Notifications"}
      className="relative grid h-10 w-10 place-items-center rounded-full text-white/90 transition hover:bg-white/10 hover:text-white"
      href="/notifications"
      title={georgian ? "შეტყობინებები" : "Notifications"}
    >
      <Bell className="h-5 w-5" />
      {unreadCount > 0 ? (
        <span className="absolute right-0 top-0 min-w-4 rounded-full bg-orange-500 px-1 text-center text-[10px] font-black leading-4 text-white ring-2 ring-[#203552]">
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      ) : null}
    </Link>
  );
}
