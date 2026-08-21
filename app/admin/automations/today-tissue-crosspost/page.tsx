import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarClock, ShieldCheck } from "lucide-react";

import { requirePermission } from "@/lib/supabase/server";
import TodayTissueCrosspostClient from "./launch-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function TodayTissueCrosspostPage() {
  const actor = await requirePermission("team.manage");
  if (!actor || actor.role !== "owner") redirect("/admin");

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="rounded-[2rem] bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 p-7 text-white shadow-soft sm:p-9">
        <div className="flex items-center gap-3 text-sm font-semibold text-white/80"><CalendarClock size={20} />დღევანდელი დაკვირვების ტესტი</div>
        <h1 className="mt-4 text-3xl font-semibold sm:text-4xl">Mario tissue box · Instagram + TikTok</h1>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-white/75">ძველი სიიდან ბოლო პროდუქტი გადმოდის ახალ, დღევანდელ პოსტებად. 30 აგვისტოს ჩანაწერები გაუქმდება და დამტკიცება გაუქმდება — ისინი აღარ გაიგზავნება.</p>
        <div className="mt-5 inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-xs font-semibold"><ShieldCheck size={16} />დღეს 20:00 · ლიცენზირებული ხმა · Facebook OFF</div>
      </header>

      <TodayTissueCrosspostClient />

      <Link href="/admin/automations" className="inline-flex min-h-11 items-center justify-center rounded-full bg-hooma-text px-5 text-sm font-semibold text-white">ავტომატიზაციების დაფაზე დაბრუნება</Link>
    </div>
  );
}
