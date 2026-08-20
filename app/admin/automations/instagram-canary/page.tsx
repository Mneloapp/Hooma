import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, CheckCircle2, ShieldCheck } from "lucide-react";

import { requirePermission } from "@/lib/supabase/server";
import { instagramReadActivation } from "@/lib/social/instagram-activation";
import { instagramApiNetworkEnabled } from "@/lib/social/config";
import { loadInstagramPublishingConnection } from "@/lib/social/connections";
import { runInstagramReadCanary } from "@/lib/social/instagram-read-canary";
import {
  InstagramReelsReadClient,
  InstagramReelsReadError,
} from "@/lib/social/providers/instagram-reels-read";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function InstagramCanaryPage() {
  const actor = await requirePermission("team.manage");
  if (!actor || actor.role !== "owner") redirect("/admin");

  let result: Awaited<ReturnType<typeof runInstagramReadCanary>> | null = null;
  let failure: { code: string; operation: string; retryable: boolean } | null = null;
  if (!instagramApiNetworkEnabled()) {
    failure = { code: "NETWORK_DISABLED", operation: "activation", retryable: false };
  } else {
    try {
      const connection = await loadInstagramPublishingConnection();
      result = await runInstagramReadCanary({
        connection,
        client: new InstagramReelsReadClient({
          activation: instagramReadActivation(connection),
          networkEnabled: true,
          insightsEnabled: false,
        }),
      });
    } catch (error) {
      failure = error instanceof InstagramReelsReadError
        ? { code: error.code, operation: error.operation, retryable: error.retryable }
        : { code: "CANARY_FAILED", operation: "local", retryable: false };
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="rounded-[2rem] bg-slate-950 p-7 text-white shadow-soft sm:p-9">
        <div className="flex items-center gap-3 text-sm font-semibold text-emerald-200"><ShieldCheck size={20} />Instagram production canary</div>
        <h1 className="mt-4 text-3xl font-semibold sm:text-4xl">Instagram-ის უსაფრთხო შემოწმება</h1>
        <p className="mt-3 max-w-2xl text-sm leading-7 text-white/65">ეს გვერდი მხოლოდ კითხულობს @hooma.ge-ის კავშირს, გამოქვეყნების ლიმიტსა და ბოლო Reel-ების დუბლიკატის მდგომარეობას. არაფერს ტვირთავს, აქვეყნებს, შლის ან აზიარებს Facebook-ზე.</p>
      </header>

      {result ? (
        <section className="rounded-[1.75rem] border border-emerald-200 bg-emerald-50 p-6 text-emerald-950 shadow-sm">
          <div className="flex items-center gap-3"><CheckCircle2 size={24} /><div><p className="text-xs font-semibold uppercase tracking-[0.2em]">PASS</p><h2 className="text-2xl font-semibold">Instagram API მზადაა</h2></div></div>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-2xl bg-white/80 p-4"><p className="text-xs opacity-70">ანგარიში</p><p className="mt-2 font-semibold">@hooma.ge მიბმულია</p></div>
            <div className="rounded-2xl bg-white/80 p-4"><p className="text-xs opacity-70">24-საათიანი quota</p><p className="mt-2 font-semibold">{result.quota.remaining} / {result.quota.total} დარჩა</p></div>
            <div className="rounded-2xl bg-white/80 p-4"><p className="text-xs opacity-70">დუბლიკატის ძიება</p><p className="mt-2 font-semibold">{result.duplicateCheck.status}</p></div>
            <div className="rounded-2xl bg-white/80 p-4"><p className="text-xs opacity-70">გვერდითი მოქმედება</p><p className="mt-2 font-semibold">არ შესრულებულა</p></div>
          </div>
          <p className="mt-5 text-xs opacity-70">შემოწმების დრო: {new Date(result.checkedAt).toLocaleString("ka-GE", { timeZone: "Asia/Tbilisi" })}</p>
        </section>
      ) : (
        <section className="rounded-[1.75rem] border border-amber-200 bg-amber-50 p-6 text-amber-950 shadow-sm">
          <div className="flex items-center gap-3"><AlertTriangle size={24} /><div><p className="text-xs font-semibold uppercase tracking-[0.2em]">FAILED CLOSED</p><h2 className="text-2xl font-semibold">Instagram ჯერ მზად არ არის</h2></div></div>
          <p className="mt-4 text-sm">ეტაპი: {failure?.operation ?? "unknown"} · კოდი: {failure?.code ?? "CANARY_FAILED"}</p>
          <p className="mt-2 text-sm">არაფერი ატვირთულა ან გამოქვეყნებულა.</p>
        </section>
      )}

      <Link href="/admin/automations" className="inline-flex min-h-11 items-center justify-center rounded-full bg-hooma-text px-5 text-sm font-semibold text-white">ავტომატიზაციების დაფაზე დაბრუნება</Link>
    </div>
  );
}
