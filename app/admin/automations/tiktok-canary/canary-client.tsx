"use client";

import { useState } from "react";
import { CheckCircle2, LoaderCircle, ShieldAlert } from "lucide-react";

export default function TikTokCanaryClient() {
  const [running, setRunning] = useState(false);
  const [provisioning, setProvisioning] = useState(false);
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
      const urlProperty = payload.urlProperty && typeof payload.urlProperty === "object"
        ? payload.urlProperty as Record<string, unknown>
        : {};
      const settingsSummary = settings.status === "PASS"
        ? `comments blocked: ${String(settings.commentDisabled)} · public posting: ${String(settings.publicPostingAvailable)}`
        : `settings: ${String(settings.errorCode ?? "FAILED_CLOSED")}`;
      const propertySummary = urlProperty.status === "FAILED_CLOSED"
        ? String(urlProperty.errorCode ?? "FAILED_CLOSED")
        : `${String(urlProperty.status)} (${String(urlProperty.mediaHost)})`;
      setResult(`PASS · ${String(payload.checkedPostId)} · duplicate-check: ${String(payload.duplicateCheck)} · შემოწმებული პოსტები: ${String(payload.scannedCount)} · ${settingsSummary} · URL property: ${propertySummary}`);
    } catch (error) {
      setResult(`უსაფრთხოდ შეჩერდა: ${error instanceof Error ? error.message : "UNEXPECTED_FAILURE"}`);
    } finally {
      setRunning(false);
    }
  };
  const provision = async () => {
    if (running || provisioning) return;
    setProvisioning(true);
    setResult("TikTok URL property ემზადება და მოწმდება…");
    try {
      const response = await fetch("/api/social/tiktok/url-property", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        redirect: "error",
      });
      const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
      if (!response.ok || payload?.status !== "VERIFIED") {
        throw new Error(String(payload?.errorCode ?? payload?.status ?? "URL_PROPERTY_FAILED"));
      }
      setResult("VERIFIED · hooma.ge-ის TikTok media prefix მზადაა.");
    } catch (error) {
      setResult(`უსაფრთხოდ შეჩერდა: ${error instanceof Error ? error.message : "UNEXPECTED_FAILURE"}`);
    } finally {
      setProvisioning(false);
    }
  };
  return (
    <section className="rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-start gap-3">
        <ShieldAlert className="mt-0.5 text-amber-600" size={22} />
        <p className="text-sm leading-6 text-slate-700">{result}</p>
      </div>
      <button type="button" onClick={run} disabled={running || provisioning} className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-slate-950 px-6 text-sm font-semibold text-white disabled:opacity-40">
        {running ? <LoaderCircle className="animate-spin" size={18} /> : <CheckCircle2 size={18} />}
        {running ? "მოწმდება" : "უსაფრთხო შემოწმების გაშვება"}
      </button>
      <button type="button" onClick={provision} disabled={running || provisioning} className="mt-3 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full border border-slate-300 bg-white px-6 text-sm font-semibold text-slate-900 disabled:opacity-40">
        {provisioning ? <LoaderCircle className="animate-spin" size={18} /> : <ShieldAlert size={18} />}
        {provisioning ? "მზადდება" : "URL property-ის მომზადება და ვერიფიკაცია"}
      </button>
    </section>
  );
}
