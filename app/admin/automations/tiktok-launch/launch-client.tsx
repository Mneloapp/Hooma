"use client";

import { useState } from "react";
import { CheckCircle2, LoaderCircle, ShieldAlert } from "lucide-react";

import { TIKTOK_NINE_DAY_CAMPAIGN_ITEMS } from "@/lib/social/campaigns/tiktok-nine-day-2026-08-22";

type ItemStatus = { state: "pending" | "finalizing" | "complete" | "failed"; message: string };

const initialStatuses = () => Object.fromEntries(
  TIKTOK_NINE_DAY_CAMPAIGN_ITEMS.map((item) => [
    item.postId,
    { state: "pending", message: "ზუსტ launch-ს ელოდება" } satisfies ItemStatus,
  ]),
) as Record<string, ItemStatus>;

async function finalize(postId: string) {
  const response = await fetch("/api/social/tiktok/campaign-2026-08-22/finalize", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    redirect: "error",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ postId }),
  });
  const payload = await response.json().catch(() => null) as { ok?: boolean; status?: string } | null;
  if (!response.ok || !payload?.ok || payload.status !== "APPROVED_EXACT") {
    throw new Error(`FINALIZE_FAILED:${postId}`);
  }
}

function statusColor(status: ItemStatus["state"]) {
  if (status === "complete") return "border-emerald-200 bg-emerald-50 text-emerald-950";
  if (status === "failed") return "border-rose-200 bg-rose-50 text-rose-950";
  if (status === "finalizing") return "border-sky-200 bg-sky-50 text-sky-950";
  return "border-slate-200 bg-white text-slate-800";
}

export default function TikTokLaunchClient() {
  const [statuses, setStatuses] = useState(initialStatuses);
  const [running, setRunning] = useState(false);
  const [summary, setSummary] = useState("ცხრა ზუსტი master უკვე პირად staging საცავშია; TikTok-ისთვის მხოლოდ ახალი დამტკიცებული სამუშაოები შეიქმნება.");
  const complete = Object.values(statuses).filter((status) => status.state === "complete").length;
  const update = (postId: string, state: ItemStatus["state"], message: string) => {
    setStatuses((current) => ({ ...current, [postId]: { state, message } }));
  };
  const launch = async () => {
    if (running) return;
    setRunning(true);
    setSummary("TikTok-ის ანგარიში, პროდუქტები, ჰეშები, მუსიკის უფლებები და ახალი post-ID-ები მოწმდება…");
    try {
      for (const item of TIKTOK_NINE_DAY_CAMPAIGN_ITEMS) {
        update(item.postId, "finalizing", "სერვერზე ზუსტად მოწმდება");
        await finalize(item.postId);
        update(item.postId, "complete", "დამტკიცებულია და დროს ელოდება");
      }
      setSummary("ცხრა TikTok ვიდეო ზუსტად დამტკიცდა და 9-დღიან განრიგში ჩაიწერა.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "UNEXPECTED_FAILURE";
      const postId = message.split(":")[1];
      if (postId) update(postId, "failed", "უსაფრთხოდ შეჩერდა — არაფერი გამოქვეყნებულა");
      setSummary(`პროცესი უსაფრთხოდ შეჩერდა (${message.split(":", 1)[0]}). დასრულებული ჩანაწერები უცვლელია; ხელახლა გაშვება idempotent-ია.`);
    } finally {
      setRunning(false);
    }
  };
  return (
    <div className="space-y-6">
      <section className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <ShieldAlert className="mt-0.5 text-amber-600" size={22} />
          <div>
            <h2 className="font-semibold">მფლობელის ზუსტი TikTok launch</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">{summary}</p>
            <p className="mt-2 text-xs text-slate-500">ლიცენზირებული pre-mixed master · ანალიტიკა: T+2სთ, T+24სთ, T+72სთ</p>
          </div>
        </div>
        <button type="button" onClick={launch} disabled={running} className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-slate-950 px-6 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">
          {running ? <LoaderCircle className="animate-spin" size={18} /> : <CheckCircle2 size={18} />}
          {running ? `მუშავდება · ${complete}/9` : "ცხრა ვიდეოს TikTok launch"}
        </button>
      </section>
      <section className="space-y-3">
        {TIKTOK_NINE_DAY_CAMPAIGN_ITEMS.map((item) => {
          const status = statuses[item.postId];
          return (
            <article key={item.postId} className={`rounded-2xl border p-4 ${statusColor(status.state)}`}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.15em]">დღე {item.sequence}</p>
                  <h3 className="mt-1 font-semibold">{item.productName}</h3>
                  <p className="mt-1 text-xs opacity-70">{new Date(item.scheduledAt).toLocaleString("ka-GE", { timeZone: "Asia/Tbilisi", dateStyle: "medium", timeStyle: "short" })}</p>
                </div>
                <span className="rounded-full bg-white/70 px-3 py-1 text-xs font-semibold">{status.message}</span>
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}
