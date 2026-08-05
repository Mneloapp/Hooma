"use client";

import { AlertCircle, Clock3, RefreshCw, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { reconcileBogPaymentAction } from "@/app/admin/orders/actions";

export type BogPaymentSessionCard = {
  orderId: string;
  label: string;
  paymentStatus: "unpaid" | "failed";
  total: number;
  customerName: string;
  customerContact: string;
  createdAtLabel: string;
  updatedAtLabel: string;
  canReconcile: boolean;
};

const money = new Intl.NumberFormat("ka-GE", {
  style: "currency",
  currency: "GEL",
  maximumFractionDigits: 2,
});

export function BogPaymentSessionsPanel({
  sessions,
  loadError = false,
}: {
  sessions: BogPaymentSessionCard[];
  loadError?: boolean;
}) {
  const router = useRouter();
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  const reconcile = (session: BogPaymentSessionCard) => {
    setPendingOrderId(session.orderId);
    startTransition(async () => {
      const result = await reconcileBogPaymentAction({
        orderId: session.orderId,
        operationKey: crypto.randomUUID(),
      });
      setMessage({ ok: result.ok, text: result.message });
      setPendingOrderId(null);
      if (result.ok) router.refresh();
    });
  };

  return (
    <section aria-labelledby="bog-payment-sessions-title" className="rounded-[2rem] border border-amber-200 bg-amber-50/55 p-5 shadow-sm lg:p-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-800">BOG payment sessions</p>
          <h2 id="bog-payment-sessions-title" className="mt-2 text-2xl font-semibold">დაუსრულებელი და უარყოფილი გადახდები</h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-amber-950/80">ეს ჩანაწერები ოპერაციული შეკვეთები არ არის და წარმოებაში ვერ გადავა. აქ შესაძლებელია მხოლოდ BOG receipt-ის უსაფრთხო შემოწმება; გადახდილად მონიშვნა კვლავ მხოლოდ ხელმოწერილი callback-ით ხდება.</p>
        </div>
        <span className="inline-flex w-fit rounded-full bg-white px-3 py-1.5 text-xs font-bold text-amber-950">{sessions.length} სესია</span>
      </div>

      {message ? (
        <div role="status" aria-live="polite" className={`mt-4 flex items-start gap-2 rounded-2xl border px-4 py-3 text-sm ${message.ok ? "border-emerald-200 bg-emerald-50 text-emerald-950" : "border-red-200 bg-red-50 text-red-950"}`}>
          {message.ok ? <RefreshCw size={17} className="mt-0.5 shrink-0" /> : <AlertCircle size={17} className="mt-0.5 shrink-0" />}
          <span>{message.text}</span>
        </div>
      ) : null}

      {loadError ? <p role="alert" className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-950">გადახდის სესიების ჩატვირთვა ვერ მოხერხდა. სცადე გვერდის განახლება.</p> : null}

      <div className="mt-5 grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
        {sessions.map((session) => {
          const failed = session.paymentStatus === "failed";
          const checking = isPending && pendingOrderId === session.orderId;
          return (
            <article key={session.orderId} className="rounded-2xl border border-white/90 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold text-hooma-accent">{session.label}</p>
                  <p className="mt-1 text-[11px] text-hooma-muted">შექმნა: {session.createdAtLabel}</p>
                </div>
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold ${failed ? "bg-red-100 text-red-900" : "bg-amber-100 text-amber-950"}`}>
                  {failed ? <XCircle size={12} aria-hidden="true" /> : <Clock3 size={12} aria-hidden="true" />}
                  {failed ? "გადახდა უარყოფილია" : "გადახდა დაუსრულებელია"}
                </span>
              </div>
              <div className="mt-4 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{session.customerName}</p>
                  <p className="mt-1 truncate text-xs text-hooma-muted">{session.customerContact}</p>
                </div>
                <p className="shrink-0 font-semibold">{money.format(session.total)}</p>
              </div>
              <p className="mt-3 text-[11px] text-hooma-muted">ბოლო ცვლილება: {session.updatedAtLabel}</p>
              {session.canReconcile ? (
                <button
                  type="button"
                  onClick={() => reconcile(session)}
                  disabled={isPending}
                  className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-950 transition hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <RefreshCw size={15} className={checking ? "animate-spin" : undefined} aria-hidden="true" />
                  {checking ? "მოწმდება..." : "BOG receipt-ის შემოწმება"}
                </button>
              ) : (
                <p className="mt-4 rounded-xl bg-hooma-panel/70 px-3 py-2.5 text-xs leading-5 text-hooma-muted">საბანკო receipt ჯერ ხელმისაწვდომი არ არის. ხელახლა გადახდა ან წარმოებაში გადატანა არ დაიწყო.</p>
              )}
            </article>
          );
        })}
        {!sessions.length && !loadError ? <p className="rounded-2xl border border-dashed border-amber-300 bg-white/45 px-4 py-8 text-center text-sm text-amber-950/70 lg:col-span-2 2xl:col-span-3">დაუსრულებელი ან უარყოფილი რეალური გადახდის სესია არ არის.</p> : null}
      </div>
    </section>
  );
}
