"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useCart } from "@/components/CartContext";
import { useLanguage } from "@/components/LanguageProvider";
import { clearCheckoutPaymentSession } from "@/components/checkout/payment-session-storage";

export function PaymentResultAutoRefresh({
  settled,
  paid,
  failed,
  refunded,
}: {
  settled: boolean;
  paid: boolean;
  failed: boolean;
  refunded: boolean;
}) {
  const router = useRouter();
  const { clearCart } = useCart();
  const { language } = useLanguage();
  const cleared = useRef(false);
  const [timedOut, setTimedOut] = useState(false);
  const [refreshCycle, setRefreshCycle] = useState(0);

  useEffect(() => {
    if ((paid || refunded) && !cleared.current) {
      cleared.current = true;
      clearCart();
      clearCheckoutPaymentSession();
    } else if (failed && !cleared.current) {
      cleared.current = true;
      clearCheckoutPaymentSession();
    }
  }, [clearCart, failed, paid, refunded]);

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
          ? "ხელახლა ნუ გადაიხდი. შეგიძლია განაახლო სტატუსი ან მოგვიანებით გადაამოწმო „ჩემ შეკვეთებში“."
          : "Do not pay again. Refresh the status or check My Orders later."}
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
