"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/components/LanguageProvider";

export function PaymentResultAutoRefresh({
  settled,
}: {
  settled: boolean;
}) {
  const router = useRouter();
  const { language } = useLanguage();
  const [timedOut, setTimedOut] = useState(false);
  const [refreshCycle, setRefreshCycle] = useState(0);

  useEffect(() => {
    if (settled) return;
    setTimedOut(false);
    const timer = window.setInterval(() => router.refresh(), 4_000);
    const timeout = window.setTimeout(() => {
      window.clearInterval(timer);
      setTimedOut(true);
    }, 120_000);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(timeout);
    };
  }, [refreshCycle, router, settled]);

  if (!timedOut || settled) return null;

  return (
    <div className="mt-5 rounded-2xl border border-amber-300 bg-white/75 p-4 text-left text-sm leading-6 text-amber-950">
      <p className="font-semibold">
        {language === "ka"
          ? "დადასტურებას ჩვეულებრივზე მეტი დრო სჭირდება."
          : "Confirmation is taking longer than usual."}
      </p>
      <p className="mt-1">
        {language === "ka"
          ? "ხელახლა ნუ გადაიხდი. დატოვე ეს გვერდი გახსნილი და განაახლე სტატუსი; გადახდის დადასტურებამდე ან უსაფრთხოების შემოწმებაზე გადასვლამდე ჩანაწერი „ჩემ შეკვეთებში“ არ გამოჩნდება."
          : "Do not pay again. Keep this page open and refresh the status; it will not appear in My Orders until payment is confirmed or placed under security review."}
      </p>
      <button
        type="button"
        onClick={() => {
          router.refresh();
          setRefreshCycle((value) => value + 1);
        }}
        className="mt-3 rounded-full bg-amber-950 px-4 py-2 text-xs font-semibold text-white"
      >
        {language === "ka" ? "სტატუსის განახლება" : "Refresh status"}
      </button>
    </div>
  );
}
