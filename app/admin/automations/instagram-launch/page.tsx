import Link from "next/link";
import { redirect } from "next/navigation";
import { Instagram, ShieldCheck } from "lucide-react";

import { requirePermission } from "@/lib/supabase/server";
import InstagramLaunchClient from "./launch-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function InstagramCampaignLaunchPage() {
  const actor = await requirePermission("team.manage");
  if (!actor || actor.role !== "owner") redirect("/admin");

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="rounded-[2rem] bg-gradient-to-br from-fuchsia-700 via-rose-600 to-amber-500 p-7 text-white shadow-soft sm:p-9">
        <div className="flex items-center gap-3 text-sm font-semibold text-white/85"><Instagram size={20} />Instagram 9-დღიანი launch</div>
        <h1 className="mt-4 text-3xl font-semibold sm:text-4xl">ცხრა დამტკიცებული ვიდეო</h1>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-white/80">გვერდი იღებს მხოლოდ წინასწარ დამტკიცებულ ზუსტ ფაილებს, ხელახლა ამოწმებს ჰეშებს, მუსიკის უფლებებს, პროდუქტს, ანგარიშს და განრიგს. სხვა ფაილი ვერ გავა.</p>
        <div className="mt-5 inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-xs font-semibold"><ShieldCheck size={16} />Facebook გამორთულია · ავტომატური ანალიტიკა ჩართული იქნება</div>
      </header>

      <InstagramLaunchClient />

      <Link href="/admin/automations" className="inline-flex min-h-11 items-center justify-center rounded-full bg-hooma-text px-5 text-sm font-semibold text-white">ავტომატიზაციების დაფაზე დაბრუნება</Link>
    </div>
  );
}
