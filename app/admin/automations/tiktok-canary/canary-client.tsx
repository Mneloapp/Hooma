"use client";

import { useState } from "react";
import { CheckCircle2, LoaderCircle, ShieldAlert } from "lucide-react";

export default function TikTokCanaryClient() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState("შემოწმება ჯერ არ გაშვებულა.");
  const run = async () => {
    if (running) return;
    setRunning(true);
    setResult("TikTok-ის read-only endpoint მოწმდება…");
    try {
      const response = await fetch("/api/social/tiktok/canary", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        redirect: "error",
      });
      const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
      if (!response.ok || payload?.status !== "PASS") throw new Error(String(payload?.errorCode ?? "CANARY_FAILED"));
      const settings = payload.settings && typeof payload.settings === "object"
        ? payload.settings as Record<string, unknown>
        : {};
      setResult(`PASS · ${String(payload.checkedPostId)} · duplicate-check: ${String(payload.duplicateCheck)} · შემოწმებული პოსტები: ${String(payload.scannedCount)} · comments blocked: ${String(settings.commentDisabled)} · public posting: ${String(settings.publicPostingAvailable)}`);
    } catch (error) {
      setResult(`უსაფრთხოდ შეჩერდა: ${error instanceof Error ? error.message : "UNEXPECTED_FAILURE"}`);
    } finally {
      setRunning(false);
    }
  };
  return (
    <section className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-start gap-3">
        <ShieldAlert className="mt-0.5 text-amber-600" size={22} />
        <p className="text-sm leading-6 text-slate-700">{result}</p>
      </div>
      <button type="button" onClick={run} disabled={running} className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-slate-950 px-6 text-sm font-semibold text-white disabled:opacity-40">
        {running ? <LoaderCircle className="animate-spin" size={18} /> : <CheckCircle2 size={18} />}
        {running ? "მოწმდება" : "უსაფრთხო შემოწმების გაშვება"}
      </button>
    </section>
  );
}
