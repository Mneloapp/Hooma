"use client";

import { useRef, useState, useTransition } from "react";
import { CalendarCheck2, Check, CreditCard, Sparkles, Truck } from "lucide-react";
import { createHoomaPlusCheckoutAction } from "@/app/account/hooma-plus/actions";
import {
  HOOMA_PLUS_PLANS,
  type HoomaPlusPlanCode,
  type HoomaPlusSummary,
} from "@/lib/commerce/hooma-plus";
import { useLanguage } from "@/components/LanguageProvider";

type Purchase = {
  id: string;
  planCode: string;
  amount: number;
  status: string;
  createdAt: string;
  expiresAt: string | null;
};

const formatMoney = (value: number, georgian: boolean) =>
  new Intl.NumberFormat(georgian ? "ka-GE" : "en-GB", {
    style: "currency",
    currency: "GEL",
    currencyDisplay: "narrowSymbol",
    maximumFractionDigits: 0,
  }).format(value);
const formatDate = (value: string, georgian: boolean) =>
  new Intl.DateTimeFormat(georgian ? "ka-GE" : "en-GB", {
    dateStyle: "long",
  }).format(new Date(value));
const SESSION_KEY = "hooma-plus-bog-session-v1";

function nextCheckoutKey(plan: HoomaPlusPlanCode) {
  try {
    const stored = JSON.parse(
      window.sessionStorage.getItem(SESSION_KEY) ?? "null",
    ) as { plan?: string; key?: string } | null;
    if (
      stored?.plan === plan
      && typeof stored.key === "string"
      && /^[0-9a-f-]{36}$/i.test(stored.key)
    ) {
      return stored.key;
    }
  } catch {
    // A new in-memory key is sufficient when storage is unavailable.
  }
  const key = window.crypto.randomUUID();
  try {
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify({ plan, key }));
  } catch {
    // Keep the key in the caller's ref for this page lifetime.
  }
  return key;
}

function clearCheckoutKey() {
  try {
    window.sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // No action is required when session storage is unavailable.
  }
}

export function HoomaPlusPurchasePanel({
  paymentAvailable,
  summary,
  purchases,
}: {
  paymentAvailable: boolean;
  summary: HoomaPlusSummary;
  purchases: Purchase[];
}) {
  const { language } = useLanguage();
  const georgian = language === "ka";
  const [message, setMessage] = useState("");
  const [isPending, startTransition] = useTransition();
  const checkoutKeys = useRef<Partial<Record<HoomaPlusPlanCode, string>>>({});

  const purchase = (plan: HoomaPlusPlanCode) => {
    if (!paymentAvailable) {
      setMessage(georgian
        ? "Hooma+ ონლაინ გადახდა ჯერ არ არის გააქტიურებული. თანხა არ ჩამოგეჭრება."
        : "Hooma+ online payment is not active yet. You will not be charged.");
      return;
    }
    const checkoutKey = checkoutKeys.current[plan] ?? nextCheckoutKey(plan);
    checkoutKeys.current[plan] = checkoutKey;
    const data = new FormData();
    data.set("plan", plan);
    data.set("checkout_key", checkoutKey);
    data.set("language", language);
    startTransition(async () => {
      try {
        const result = await createHoomaPlusCheckoutAction(data);
        setMessage(result.message);
        if (result.resetCheckout) {
          clearCheckoutKey();
          delete checkoutKeys.current[plan];
        }
        if (result.ok && result.redirectUrl) window.location.assign(result.redirectUrl);
      } catch {
        setMessage(georgian
          ? "კავშირი დროებით შეწყდა. იგივე გადახდის სესიას შევინარჩუნებთ — სცადე ხელახლა."
          : "The connection was interrupted. We will keep the same payment session; try again.");
      }
    });
  };

  return (
    <div className="space-y-6">
      <section className={`rounded-[2rem] border p-6 shadow-soft ${
        summary.active
          ? "border-emerald-200 bg-emerald-50"
          : "border-hooma-text/10 bg-white/75"
      }`}>
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-hooma-accent">
              <Sparkles size={18} />
              Hooma+
            </div>
            <h2 className="mt-3 text-2xl font-semibold">
              {summary.active
                ? (georgian ? "წევრობა აქტიურია" : "Membership is active")
                : (georgian ? "წევრობა ჯერ არ არის აქტიური" : "Membership is not active yet")}
            </h2>
            <p className="mt-2 text-sm leading-6 text-hooma-muted">
              {summary.active && summary.activeUntil
                ? (georgian
                  ? `უფასო სტანდარტული მიწოდება მოქმედებს თარიღამდე: ${formatDate(summary.activeUntil, true)}.`
                  : `Free standard delivery is active until ${formatDate(summary.activeUntil, false)}.`)
                : (georgian
                  ? "აირჩიე წინასწარ გადახდილი თვიური ან წლიური გეგმა."
                  : "Choose a prepaid monthly or annual plan.")}
            </p>
          </div>
          <div className="rounded-2xl bg-white/75 px-5 py-4 text-center">
            <p className="text-xs text-hooma-muted">
              {georgian ? "უფასო მიწოდების ერთეული ხელმისაწვდომია" : "Free-delivery units available"}
            </p>
            <p className="mt-1 text-3xl font-semibold">
              {summary.welcomeUnitsRemaining}/{summary.welcomeUnitsTotal}
            </p>
            {summary.welcomeUnitsReserved > 0 ? (
              <p className="mt-1 max-w-40 text-xs leading-5 text-amber-700">
                {georgian
                  ? `${summary.welcomeUnitsReserved} დროებით დაჯავშნილია მიმდინარე გადახდაში`
                  : `${summary.welcomeUnitsReserved} temporarily reserved in a pending payment`}
              </p>
            ) : null}
            <p className="mt-2 max-w-44 text-xs leading-5 text-hooma-muted">
              {georgian
                ? "ბენეფიტისთვის მთელი კალათა ამ დარჩენილ რაოდენობაში უნდა ჩაეტიოს."
                : "The whole cart must fit this remaining balance to use the benefit."}
            </p>
          </div>
        </div>
        <div className="mt-5 grid gap-3 text-sm sm:grid-cols-3">
          <p className="flex items-start gap-2 rounded-2xl bg-white/70 p-4">
            <Truck className="mt-0.5 shrink-0 text-hooma-accent" size={17} />
            {georgian ? "კატალოგის შეკვეთებზე უფასო სტანდარტული მიწოდება" : "Free standard delivery on catalog orders"}
          </p>
          <p className="flex items-start gap-2 rounded-2xl bg-white/70 p-4">
            <CalendarCheck2 className="mt-0.5 shrink-0 text-hooma-accent" size={17} />
            {georgian ? "აქტიური პერიოდი ზუსტად ჩანს ანგარიშში" : "Exact active period shown in your account"}
          </p>
          <p className="flex items-start gap-2 rounded-2xl bg-white/70 p-4">
            <CreditCard className="mt-0.5 shrink-0 text-hooma-accent" size={17} />
            {georgian ? "ავტომატური განახლებისა და ჩამოჭრის გარეშე" : "No automatic renewal or recurring charge"}
          </p>
        </div>
      </section>

      <p className="rounded-2xl bg-hooma-panel/70 p-4 text-sm leading-6 text-hooma-muted">
        {summary.active
          ? (georgian
            ? "ახლა შეძენილი პერიოდი მიმდინარე წევრობის ვადის შემდეგ დაემატება. წევრობის გარეშე 100₾-მდე ჩათვლით მიწოდება 5₾-ია, 100.01₾-დან კი უფასო."
            : "A plan purchased now is appended after your current membership expires. Without membership, delivery is ₾5 through ₾100 and free from ₾100.01.")
          : (georgian
            ? "წევრობის გარეშე 100₾-მდე ჩათვლით მიწოდება 5₾-ია, 100.01₾-დან კი უფასო."
            : "Without membership, delivery is ₾5 through ₾100 and free from ₾100.01.")}
      </p>

      <section className="grid gap-5 md:grid-cols-2">
        {(["monthly", "annual"] as const).map((planCode) => {
          const plan = HOOMA_PLUS_PLANS[planCode];
          const annual = planCode === "annual";
          return (
            <article key={planCode} className={`relative overflow-hidden rounded-[2rem] border bg-white/80 p-6 shadow-soft ${
              annual ? "border-hooma-accent" : "border-hooma-text/10"
            }`}>
              {annual ? <span className="absolute right-5 top-5 rounded-full bg-hooma-accent px-3 py-1 text-xs font-semibold text-white">{georgian ? "70₾ ეკონომია" : "Save ₾70"}</span> : null}
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-hooma-muted">
                {annual
                  ? (georgian ? "წლიური" : "Annual")
                  : (georgian ? "თვიური" : "Monthly")}
              </p>
              <p className="mt-5 text-4xl font-semibold">{formatMoney(plan.priceMinor / 100, georgian)}</p>
              <p className="mt-2 text-sm text-hooma-muted">
                {annual
                  ? (georgian ? "12 კალენდარული თვე · დაახლოებით 29.17₾/თვე" : "12 calendar months · about ₾29.17/month")
                  : (georgian ? "1 კალენდარული თვე" : "1 calendar month")}
              </p>
              <ul className="mt-6 space-y-3 text-sm">
                <li className="flex gap-2"><Check size={17} className="shrink-0 text-emerald-600" />{georgian ? "უფასო სტანდარტული მიწოდება" : "Free standard delivery"}</li>
                <li className="flex gap-2"><Check size={17} className="shrink-0 text-emerald-600" />{georgian ? "პირველი 10 ერთეულის მიწოდების დარჩენილი ბალანსი არ იხარჯება" : "Your remaining first-10 unit delivery balance is preserved"}</li>
                <li className="flex gap-2"><Check size={17} className="shrink-0 text-emerald-600" />{georgian ? "ხელით განახლება ნებისმიერ დროს" : "Renew manually at any time"}</li>
              </ul>
              <button
                type="button"
                disabled={isPending || !paymentAvailable}
                onClick={() => purchase(planCode)}
                className={`mt-7 w-full rounded-full px-5 py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-45 ${
                  annual
                    ? "bg-hooma-accent text-white hover:bg-hooma-accent/90"
                    : "bg-hooma-text text-white hover:bg-hooma-text/90"
                }`}
              >
                {isPending
                  ? (georgian ? "გადახდა მზადდება..." : "Preparing payment...")
                  : !paymentAvailable
                    ? (georgian ? "გადახდა მალე ჩაირთვება" : "Payments coming soon")
                    : summary.active
                      ? (georgian ? "წევრობის გაგრძელება" : "Extend membership")
                      : (georgian ? "გეგმის გააქტიურება" : "Activate plan")}
              </button>
            </article>
          );
        })}
      </section>

      {message ? <p role="alert" aria-live="polite" className="rounded-2xl bg-hooma-panel p-4 text-sm">{message}</p> : null}

      <section className="rounded-[2rem] bg-white/75 p-6 shadow-soft">
        <h2 className="text-xl font-semibold">{georgian ? "გადახდების ისტორია" : "Payment history"}</h2>
        <div className="mt-4 divide-y divide-hooma-text/10">
          {purchases.map((item) => (
            <div key={item.id} className="flex flex-col justify-between gap-2 py-4 sm:flex-row sm:items-center">
              <div>
                <p className="font-semibold">{item.planCode === "annual" ? (georgian ? "წლიური Hooma+" : "Annual Hooma+") : (georgian ? "თვიური Hooma+" : "Monthly Hooma+")}</p>
                <p className="mt-1 text-xs text-hooma-muted">{formatDate(item.createdAt, georgian)}</p>
              </div>
              <div className="sm:text-right">
                <p className="font-semibold">{formatMoney(item.amount, georgian)}</p>
                <p className="mt-1 text-xs text-hooma-muted">
                  {item.status === "paid"
                    ? (georgian ? "გადახდილია" : "Paid")
                    : item.status === "failed"
                      ? (georgian ? "ვერ დასრულდა" : "Failed")
                      : item.status === "refunded"
                        ? (georgian ? "დაბრუნებულია" : "Refunded")
                        : item.status === "review_required"
                          ? (georgian ? "მოწმდება" : "Under review")
                          : (georgian ? "გადახდას ელოდება" : "Awaiting payment")}
                </p>
              </div>
            </div>
          ))}
          {!purchases.length ? <p className="py-6 text-sm text-hooma-muted">{georgian ? "Hooma+ გადახდა ჯერ არ გაქვს." : "You have no Hooma+ payments yet."}</p> : null}
        </div>
      </section>
    </div>
  );
}
