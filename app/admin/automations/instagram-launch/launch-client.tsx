"use client";

import { useState } from "react";
import { CheckCircle2, LoaderCircle, ShieldAlert, UploadCloud } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import {
  INSTAGRAM_NINE_DAY_CAMPAIGN_ITEMS,
} from "@/lib/social/campaigns/instagram-nine-day-2026-08-22";

type ItemStatus = {
  state: "pending" | "checking" | "uploading" | "finalizing" | "complete" | "failed";
  message: string;
};

type UploadTicket = {
  ok: true;
  bucket: string;
  video: { path: string; token: string };
  cover: { path: string; token: string };
};

const initialStatuses = () => Object.fromEntries(
  INSTAGRAM_NINE_DAY_CAMPAIGN_ITEMS.map((item) => [
    item.postId,
    { state: "pending", message: "ფაილებს ელოდება" } satisfies ItemStatus,
  ]),
) as Record<string, ItemStatus>;

async function sha256(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function jsonRequest<T>(url: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    redirect: "error",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null) as T | null;
  if (!response.ok || !payload) throw new Error("REQUEST_FAILED");
  return payload;
}

function expectedFiles(files: FileList) {
  if (files.length !== INSTAGRAM_NINE_DAY_CAMPAIGN_ITEMS.length * 2) {
    throw new Error("EXACTLY_18_FILES_REQUIRED");
  }
  return INSTAGRAM_NINE_DAY_CAMPAIGN_ITEMS.map((item, index) => ({
    item,
    video: files[index * 2],
    cover: files[index * 2 + 1],
  }));
}

function statusColor(status: ItemStatus["state"]) {
  if (status === "complete") return "border-emerald-200 bg-emerald-50 text-emerald-950";
  if (status === "failed") return "border-rose-200 bg-rose-50 text-rose-950";
  if (status !== "pending") return "border-sky-200 bg-sky-50 text-sky-950";
  return "border-slate-200 bg-white text-slate-800";
}

export default function InstagramLaunchClient() {
  const [files, setFiles] = useState<FileList | null>(null);
  const [statuses, setStatuses] = useState(initialStatuses);
  const [running, setRunning] = useState(false);
  const [summary, setSummary] = useState("18 ზუსტი ფაილი აირჩიეთ: თითო ვიდეოს შემდეგ მისი cover.jpg, ქვემოთ ნაჩვენები რიგითობით.");
  const completed = Object.values(statuses).filter((status) => status.state === "complete").length;

  const update = (postId: string, state: ItemStatus["state"], message: string) => {
    setStatuses((current) => ({ ...current, [postId]: { state, message } }));
  };

  const launch = async () => {
    if (!files || running) return;
    setRunning(true);
    setSummary("ჰეშები მოწმდება და ფაილები იტვირთება პირად საცავში…");
    try {
      const selected = expectedFiles(files);
      const supabase = createClient();
      if (!supabase) throw new Error("DATABASE_UNAVAILABLE");

      for (const { item, video, cover } of selected) {
        update(item.postId, "checking", "ზუსტი ჰეშები მოწმდება");
        if (video.name !== "video.mp4" || cover.name !== "cover.jpg") {
          throw new Error(`FILE_ORDER_INVALID:${item.postId}`);
        }
        const [videoSha256, coverSha256] = await Promise.all([sha256(video), sha256(cover)]);
        if (videoSha256 !== item.videoSha256 || coverSha256 !== item.coverSha256) {
          throw new Error(`FILE_HASH_MISMATCH:${item.postId}`);
        }

        update(item.postId, "uploading", "პირად staging საცავში იტვირთება");
        const ticket = await jsonRequest<UploadTicket>(
          "/api/social/instagram/campaign-2026-08-22/upload-ticket",
          { postId: item.postId },
        );
        const [videoUpload, coverUpload] = await Promise.all([
          supabase.storage.from(ticket.bucket).uploadToSignedUrl(
            ticket.video.path,
            ticket.video.token,
            video,
            { contentType: "video/mp4", upsert: true },
          ),
          supabase.storage.from(ticket.bucket).uploadToSignedUrl(
            ticket.cover.path,
            ticket.cover.token,
            cover,
            { contentType: "image/jpeg", upsert: true },
          ),
        ]);
        if (videoUpload.error || coverUpload.error) {
          throw new Error(`UPLOAD_FAILED:${item.postId}`);
        }

        update(item.postId, "finalizing", "სერვერზე ხელახლა მოწმდება და ზუსტად მტკიცდება");
        const finalized = await jsonRequest<{ ok: true; status: string }>(
          "/api/social/instagram/campaign-2026-08-22/finalize",
          { postId: item.postId },
        );
        if (finalized.status !== "APPROVED_EXACT") {
          throw new Error(`FINALIZE_FAILED:${item.postId}`);
        }
        update(item.postId, "complete", "დამტკიცებულია და დაგეგმილ დროს ელოდება");
      }
      setSummary("ცხრა ვიდეო უსაფრთხოდ აიტვირთა, ზუსტად დამტკიცდა და 9-დღიან განრიგში ჩაიწერა.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "UNEXPECTED_FAILURE";
      const postId = message.split(":")[1];
      if (postId && INSTAGRAM_NINE_DAY_CAMPAIGN_ITEMS.some((item) => item.postId === postId)) {
        update(postId, "failed", "უსაფრთხოდ შეჩერდა — არაფერი გამოქვეყნებულა");
      }
      setSummary(`პროცესი უსაფრთხოდ შეჩერდა (${message.split(":", 1)[0]}). დასრულებული ვიდეოები უცვლელია; ხელახლა გაშვება უსაფრთხოა.`);
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
            <h2 className="font-semibold">მფლობელის ზუსტი launch</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600">{summary}</p>
            <p className="mt-2 text-xs text-slate-500">Instagram Share to Facebook: OFF · ანალიტიკა: T+2სთ, T+24სთ, T+72სთ</p>
          </div>
        </div>
        <label className="mt-5 flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 text-center hover:border-slate-400">
          <UploadCloud size={24} />
          <span className="mt-2 text-sm font-semibold">18 ფაილის არჩევა</span>
          <span className="mt-1 text-xs text-slate-500">{files ? `${files.length} ფაილი არჩეულია` : "video.mp4, cover.jpg — თითოეულ პოსტზე"}</span>
          <input
            className="sr-only"
            type="file"
            accept="video/mp4,image/jpeg"
            multiple
            disabled={running}
            onChange={(event) => setFiles(event.target.files)}
          />
        </label>
        <button
          type="button"
          onClick={launch}
          disabled={!files || running}
          className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-slate-950 px-6 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          {running ? <LoaderCircle className="animate-spin" size={18} /> : <CheckCircle2 size={18} />}
          {running ? `მუშავდება · ${completed}/9` : "ცხრა ვიდეოს უსაფრთხოდ მომზადება"}
        </button>
      </section>

      <section className="space-y-3">
        {INSTAGRAM_NINE_DAY_CAMPAIGN_ITEMS.map((item) => {
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
