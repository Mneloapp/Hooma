import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";

import { requirePermission } from "@/lib/supabase/server";
import TikTokCanaryClient from "./canary-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function TikTokCanaryPage() {
  const actor = await requirePermission("team.manage");
  if (!actor || actor.role !== "owner") redirect("/admin");
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="rounded-[2rem] bg-slate-950 p-7 text-white shadow-soft sm:p-9">
        <div className="flex items-center gap-3 text-sm font-semibold text-cyan-200"><ShieldCheck size={20} />TikTok read-only canary</div>
        <h1 className="mt-4 text-3xl font-semibold">ანგარიშისა და duplicate-check-ის შემოწმება</h1>
        <p className="mt-3 text-sm leading-7 text-white/75">ეს შემოწმება არაფერს აქვეყნებს. იგი ამოწმებს ზუსტ @hooma.ge კავშირს, frozen სქემას და owned-post list endpoint-ს.</p>
      </header>
      <TikTokCanaryClient />
      <Link href="/admin/automations" className="inline-flex min-h-11 items-center justify-center rounded-full bg-hooma-text px-5 text-sm font-semibold text-white">ავტომატიზაციების დაფაზე დაბრუნება</Link>
    </div>
  );
}
