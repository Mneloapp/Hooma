"use client";

import { useState } from "react";
import { CheckCircle2, Instagram, LoaderCircle, ShieldCheck } from "lucide-react";

import { TODAY_TISSUE_CROSSPOST_ITEMS } from "@/lib/social/campaigns/today-tissue-crosspost-2026-08-21";

type ItemState = "pending" | "finalizing" | "complete" | "failed";
type ItemStatus = { state: ItemState; message: string };

const initialStatuses = () => Object.fromEntries(
  TODAY_TISSUE_CROSSPOST_ITEMS.map((item) => [
    item.postId,
    { state: "pending", message: "ზუსტ დამტკიცებას ელოდება" } satisfies ItemStatus,
  ]),
) as Record<string, ItemStatus>;

function statusColor(state: ItemState) {
  if (state === "complete") return "border-emerald-200 bg-emerald-50 text-emerald-950";
  if (state === "failed") return "border-rose-200 bg-rose-50 text-rose-950";
  if (state === "finalizing") return "border-sky-200 bg-sky-50 text-sky-950";
  return "border-slate-200 bg-white text-slate-800";
}

async function finalize(postId: string) {
  const result = await fetch(
    "/api/social/today-tissue-crosspost-2026-08-21/finalize",
    {
      method: "POST",
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ postId }),
    },
  );
  const payload = await result.json().catch(() => null) as {
    ok?: boolean;
    status?: string;
  } | null;
  if (!result.ok || payload?.ok !== true || payload.status !== "APPROVED_EXACT") {
    throw new Error("FINALIZE_FAILED");
  }
}

export default function TodayTissueCrosspostClient() {
  const [statuses, setStatuses] = useState(initialStatuses);
  const [running, setRunning] = useState(false);
  const [summary, setSummary] = useState(
    "ორივე ჩანაწერი შეიქმნება მხოლოდ ზუსტი ფაილის, პროდუქტის, ანგარიშისა და ლიცენზირებული ხმის ხელახალი შემოწმების შემდეგ.",
  );
  const completed = Object.values(statuses).filter((status) => status.state === "complete").length;

  const update = (postId: string, status: ItemStatus) => {
    setStatuses((current) => ({ ...current, [postId]: status }));
  };

  const launch = async () => {
    if (running) return;
    setRunning(true);
    setSummary("ზუსტი მედია, პროდუქტი, მუსიკის ქვითარი და ანგარიშები ხელახლა მოწმდება…");
    try {
      for (const item of TODAY_TISSUE_CROSSPOST_ITEMS) {
        update(item.postId, { state: "finalizing", message: "მოწმდება და მტკიცდება" });
        try {
          await finalize(item.postId);
          update(item.postId, { state: "complete", message: "დამტკიცებულია · 20:00" });
        } catch {
          update(item.postId, { state: "failed", message: "უსაფრთხოდ შეჩერდა" });
          throw new Error("FINALIZE_FAILED");
        }
      }
      setSummary("Instagram და TikTok ზუსტად დამტკიცდა. გამომქვეყნებელი ორივეს დღეს 20:00-ზე აიღებს, დუბლიკატს კიდევ ერთხელ შეამოწმებს და შედეგს აუდიტში შეინახავს.");
    } catch {
      setSummary("პროცესი უსაფრთხოდ შეჩერდა; არაფერი გამოქვეყნებულა. დასრულებული ჩანაწერი უცვლელია და ღილაკზე ხელახლა დაჭერა უსაფრთხოა.");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-5">
      <section className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 shrink-0 text-emerald-700" size={22} />
          <div>
            <h2 className="font-semibold">მფლობელის საბოლოო დასტური</h2>
            <p aria-live="polite" className="mt-1 text-sm leading-6 text-slate-600">{summary}</p>
            <p className="mt-2 text-xs text-slate-500">ლიცენზირებული ხმის master · Facebook OFF · T+2სთ / T+24სთ / T+72სთ ანალიტიკა</p>
          </div>
        </div>
        <button
          type="button"
          onClick={launch}
          disabled={running || completed === TODAY_TISSUE_CROSSPOST_ITEMS.length}
          className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-slate-950 px-6 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {running ? <LoaderCircle aria-hidden="true" className="animate-spin" size={18} /> : <CheckCircle2 aria-hidden="true" size={18} />}
          {running ? `მუშავდება · ${completed}/2` : completed === 2 ? "ორივე პლატფორმა დამტკიცებულია" : "დღევანდელი Instagram + TikTok ტესტის დამტკიცება"}
        </button>
      </section>

      <section aria-label="დღევანდელი სოციალური ჩანაწერები" className="grid gap-3 sm:grid-cols-2">
        {TODAY_TISSUE_CROSSPOST_ITEMS.map((item) => {
          const status = statuses[item.postId];
          return (
            <article key={item.postId} className={`rounded-2xl border p-5 ${statusColor(status.state)}`}>
              <div className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em]">
                  {item.platform === "instagram" ? <Instagram aria-hidden="true" size={17} /> : <span aria-hidden="true" className="font-black">TT</span>}
                  {item.platform}
                </span>
                <span className="rounded-full bg-white/75 px-3 py-1 text-xs font-semibold">{status.message}</span>
              </div>
              <h3 className="mt-4 font-semibold">{item.productName}</h3>
              <p className="mt-1 text-xs opacity-70">დღეს, 20:00 · Asia/Tbilisi</p>
            </article>
          );
        })}
      </section>
    </div>
  );
}
