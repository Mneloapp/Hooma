import Link from "next/link";
import { redirect } from "next/navigation";
import { Music2, ShieldCheck } from "lucide-react";

import { requirePermission } from "@/lib/supabase/server";
import TikTokLaunchClient from "./launch-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function TikTokCampaignLaunchPage() {
  const actor = await requirePermission("team.manage");
  if (!actor || actor.role !== "owner") redirect("/admin");
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="rounded-[2rem] bg-gradient-to-br from-slate-950 via-cyan-950 to-rose-700 p-7 text-white shadow-soft sm:p-9">
        <div className="flex items-center gap-3 text-sm font-semibold text-white/85"><Music2 size={20} />TikTok 9-დღიანი launch</div>
        <h1 className="mt-4 text-3xl font-semibold sm:text-4xl">იგივე ცხრა დამტკიცებული master</h1>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-white/80">TikTok-ისთვის იქმნება მხოლოდ ახალი post-ID-ები. ზუსტი ვიდეო/cover ჰეშები, ლიცენზირებული pre-mixed მუსიკა, პროდუქტები, OAuth ანგარიში და განრიგი სერვერზე ხელახლა მოწმდება.</p>
        <div className="mt-5 inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-xs font-semibold"><ShieldCheck size={16} />Silent publish აკრძალულია · ძველი TikTok პოსტები არ მეორდება</div>
      </header>
      <TikTokLaunchClient />
      <Link href="/admin/automations" className="inline-flex min-h-11 items-center justify-center rounded-full bg-hooma-text px-5 text-sm font-semibold text-white">ავტომატიზაციების დაფაზე დაბრუნება</Link>
    </div>
  );
}
