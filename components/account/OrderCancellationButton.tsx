"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, RotateCcw, X } from "lucide-react";
import { requestCustomerOrderCancellationAction } from "@/app/account/orders/actions";
import { useLanguage } from "@/components/LanguageProvider";

export type CustomerCancellationStatus =
  | "processing"
  | "refund_submitted"
  | "submission_failed"
  | "review_required"
  | "refunded";

type UnavailableReason = "later_stage" | "service_unavailable" | null;

type OrderCancellationButtonProps = {
  orderId: string;
  total: number;
  status: CustomerCancellationStatus | null;
  orderCancelled: boolean;
  canRequest: boolean;
  unavailableReason?: UnavailableReason;
};

const money = new Intl.NumberFormat("ka-GE", {
  style: "currency",
  currency: "GEL",
  maximumFractionDigits: 2,
});

export function OrderCancellationButton({
  orderId,
  total,
  status,
  orderCancelled,
  canRequest,
  unavailableReason = null,
}: OrderCancellationButtonProps) {
  const router = useRouter();
  const { language } = useLanguage();
  const georgian = language === "ka";
  const [open, setOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [reason, setReason] = useState("ordered_by_mistake");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [localStatus, setLocalStatus] = useState<CustomerCancellationStatus | null>(null);
  const [pending, startTransition] = useTransition();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const effectiveStatus = localStatus ?? status;
  const effectiveOrderCancelled = localStatus ? true : orderCancelled;

  useEffect(() => {
    if (!open) return;
    closeButtonRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pending) setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open, pending]);

  if (effectiveStatus === "processing" || effectiveStatus === "refund_submitted") {
    return (
      <div className="border-b border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-950 lg:p-6" role="status">
        <p className="flex items-center gap-2 font-bold"><RotateCcw size={17} aria-hidden="true" />{georgian ? "შეკვეთა გაუქმებულია · თანხის დაბრუნება მუშავდება" : "Order cancelled · refund processing"}</p>
        <p className="mt-1">{georgian
          ? "სრული თანხის დაბრუნების მოთხოვნა თავდაპირველ გადახდის მეთოდზე მუშავდება. წარმოება აღარ დაიწყება; ბანკში ასახვის დრო შეიძლება განსხვავდებოდეს."
          : "The full refund to the original payment method is being processed. Production will not start; the bank’s posting time may vary."}</p>
      </div>
    );
  }

  if (effectiveStatus === "submission_failed" || effectiveStatus === "review_required") {
    return (
      <div className="border-b border-orange-200 bg-orange-50 p-5 text-sm leading-6 text-orange-950 lg:p-6" role="alert">
        <p className="flex items-center gap-2 font-bold"><AlertTriangle size={17} aria-hidden="true" />{effectiveOrderCancelled
          ? (georgian ? "შეკვეთა გაუქმებულია · საჭიროა მხარდაჭერის შემოწმება" : "Order cancelled · support review needed")
          : (georgian ? "თანხის დაბრუნებას ოპერაციული შემოწმება სჭირდება" : "Refund needs operational review")}</p>
        <p className="mt-1">{georgian
          ? effectiveOrderCancelled
            ? "წარმოება აღარ დაიწყება. თანხის დაბრუნების საბანკო მოთხოვნას ჩვენი გუნდი გადაამოწმებს — ხელახლა ნუ გააუქმებ და ნუ გამოაგზავნი გადახდის მონაცემებს ჩატში."
            : "შეკვეთის ფიზიკური ეტაპი ავტომატურად არ შეცვლილა. მხარდაჭერისა და წარმოების გუნდი მდგომარეობას გადაამოწმებს — ხელახლა ნუ გააუქმებ და ნუ გამოაგზავნი გადახდის მონაცემებს ჩატში."
          : effectiveOrderCancelled
            ? "Production will not start. Our team will review the bank refund request—do not submit another cancellation or share payment details in chat."
            : "The physical order stage was not changed automatically. Support and production will review it—do not submit another cancellation or share payment details in chat."}</p>
        <Link href="/contact" className="mt-3 inline-flex rounded-full bg-orange-950 px-4 py-2 text-xs font-semibold text-white">
          {georgian ? "მხარდაჭერასთან დაკავშირება" : "Contact support"}
        </Link>
      </div>
    );
  }

  if (effectiveStatus === "refunded") {
    if (!effectiveOrderCancelled) {
      return (
        <div className="border-b border-orange-200 bg-orange-50 p-5 text-sm leading-6 text-orange-950 lg:p-6" role="alert">
          <p className="flex items-center gap-2 font-bold"><AlertTriangle size={17} aria-hidden="true" />{georgian ? "თანხა დაბრუნებულია · საჭიროა ოპერაციული შემოწმება" : "Payment refunded · operational review needed"}</p>
          <p className="mt-1">{georgian
            ? "BOG-ის დაცული დადასტურებით თანხა დაბრუნებულია, მაგრამ შეკვეთის ფიზიკური ეტაპი ავტომატურად არ შეცვლილა. მხარდაჭერისა და წარმოების გუნდი მდგომარეობას გადაამოწმებს."
            : "BOG securely confirmed the refund, but the physical order stage was not changed automatically. Support and production will review the situation."}</p>
          <Link href="/contact" className="mt-3 inline-flex rounded-full bg-orange-950 px-4 py-2 text-xs font-semibold text-white">
            {georgian ? "მხარდაჭერასთან დაკავშირება" : "Contact support"}
          </Link>
        </div>
      );
    }
    return (
      <div className="border-b border-violet-200 bg-violet-50 p-5 text-sm leading-6 text-violet-950 lg:p-6" role="status">
        <p className="flex items-center gap-2 font-bold"><CheckCircle2 size={17} aria-hidden="true" />{georgian ? "შეკვეთა გაუქმებულია · თანხა დაბრუნებულია" : "Order cancelled · payment refunded"}</p>
        <p className="mt-1">{georgian
          ? "BOG-ის დაცული დადასტურებით შეკვეთის სრული თანხა თავდაპირველ გადახდის მეთოდზე დაბრუნებულია."
          : "BOG’s secure confirmation shows that the full order amount was refunded to the original payment method."}</p>
      </div>
    );
  }

  if (!canRequest && unavailableReason) {
    const laterStage = unavailableReason === "later_stage";
    return (
      <div className="border-b border-hooma-text/10 bg-white/60 p-5 text-sm leading-6 text-hooma-muted lg:p-6">
        <p className="font-semibold text-hooma-text">{laterStage
          ? (georgian ? "ავტომატური გაუქმება აღარ არის ხელმისაწვდომი" : "Automatic cancellation is no longer available")
          : (georgian ? "ავტომატური გაუქმება დროებით მიუწვდომელია" : "Automatic cancellation is temporarily unavailable")}</p>
        <p className="mt-1">{laterStage
          ? (georgian ? "შეკვეთა უკვე გადავიდა წარმოების ეტაპზე. დახმარებისთვის დაუკავშირდი მხარდაჭერას." : "The order has already entered production. Contact support for assistance.")
          : (georgian ? "შეკვეთის გაუქმების საკითხისთვის დაუკავშირდი მხარდაჭერას." : "Contact support if you need help cancelling this order.")}</p>
        <Link href="/contact" className="mt-3 inline-flex rounded-full border border-hooma-text/15 bg-white px-4 py-2 text-xs font-semibold text-hooma-text">
          {georgian ? "მხარდაჭერასთან დაკავშირება" : "Contact support"}
        </Link>
      </div>
    );
  }

  if (!canRequest) return null;

  const submit = () => {
    if (!confirmed || pending) return;
    setMessage(null);
    startTransition(async () => {
      const result = await requestCustomerOrderCancellationAction({
        orderId,
        reason,
        operationKey: crypto.randomUUID(),
        language,
      });
      setMessage({ ok: result.ok, text: result.message });
      if (result.ok) {
        setLocalStatus(result.state === "refunded"
          ? "refunded"
          : result.state === "review"
            ? "review_required"
            : "processing");
        setOpen(false);
        router.refresh();
      }
    });
  };

  return (
    <div className="border-b border-hooma-text/10 bg-white/60 p-5 lg:p-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm font-semibold">{georgian ? "გადახდილი შეკვეთის გაუქმება" : "Cancel a paid order"}</p>
          <p className="mt-1 text-xs leading-5 text-hooma-muted">{georgian
            ? "ხელმისაწვდომია მხოლოდ წარმოების დაწყებამდე."
            : "Available only before production starts."}</p>
        </div>
        <button
          type="button"
          onClick={() => { setConfirmed(false); setMessage(null); setOpen(true); }}
          className="rounded-full border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-900 transition hover:bg-red-100"
        >
          {georgian ? "შეკვეთის გაუქმება" : "Cancel order"}
        </button>
      </div>

      {message ? <p className={`mt-3 text-sm ${message.ok ? "text-emerald-800" : "text-red-800"}`} role={message.ok ? "status" : "alert"}>{message.text}</p> : null}

      {open ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4" role="dialog" aria-modal="true" aria-labelledby="order-cancellation-title" aria-describedby="order-cancellation-description">
          <div className="w-full max-w-lg rounded-[1.75rem] bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-red-700">{georgian ? "შეუქცევადი მოქმედება" : "Irreversible action"}</p>
                <h3 id="order-cancellation-title" className="mt-2 text-2xl font-semibold">{georgian ? "გააუქმო შეკვეთა?" : "Cancel this order?"}</h3>
              </div>
              <button ref={closeButtonRef} type="button" onClick={() => setOpen(false)} disabled={pending} aria-label={georgian ? "ფანჯრის დახურვა" : "Close dialog"} className="rounded-full border border-hooma-text/10 p-2 disabled:opacity-50"><X size={18} /></button>
            </div>

            <div id="order-cancellation-description" className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-950">
              <p className="font-bold">{georgian ? `დასაბრუნებელი სრული თანხა: ${money.format(total)}` : `Full refund amount: ${money.format(total)}`}</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>{georgian ? "თანხაში შედის შეკვეთის მიწოდების საფასურიც." : "The amount includes the order’s delivery fee."}</li>
                <li>{georgian ? "თანხა დაბრუნდება გადახდის თავდაპირველ მეთოდზე." : "The refund goes to the original payment method."}</li>
                <li>{georgian ? "გაუქმება შეუქცევადია და ამ შეკვეთის წარმოება აღარ დაიწყება." : "Cancellation is irreversible and production for this order will not start."}</li>
                <li>{georgian ? "ბანკის მიერ თანხის ასახვის დრო შეიძლება განსხვავდებოდეს." : "The bank’s posting time may vary."}</li>
              </ul>
            </div>

            <label className="mt-5 block text-sm font-semibold">
              {georgian ? "გაუქმების მიზეზი" : "Reason for cancellation"}
              <select value={reason} onChange={(event) => setReason(event.target.value)} disabled={pending} className="mt-2 w-full rounded-xl border border-hooma-text/15 bg-white px-3 py-2.5 font-normal outline-none focus:border-hooma-accent">
                <option value="ordered_by_mistake">{georgian ? "შეკვეთა შეცდომით გავაფორმე" : "I placed the order by mistake"}</option>
                <option value="changed_mind">{georgian ? "გადავიფიქრე" : "I changed my mind"}</option>
                <option value="other">{georgian ? "სხვა მიზეზი" : "Another reason"}</option>
              </select>
            </label>

            <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-2xl border border-hooma-text/10 bg-hooma-background p-4 text-sm leading-6">
              <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} disabled={pending} className="mt-1" />
              <span>{georgian
                ? `ვადასტურებ ${money.format(total)}-ის სრული დაბრუნების მოთხოვნას და მესმის, რომ შეკვეთის გაუქმება შეუქცევადია.`
                : `I confirm the full ${money.format(total)} refund request and understand that cancelling the order is irreversible.`}</span>
            </label>

            {message ? <p className="mt-4 text-sm text-red-800" role="alert">{message.text}</p> : null}

            <div className="mt-5 flex flex-col-reverse justify-end gap-2 sm:flex-row">
              <button type="button" onClick={() => setOpen(false)} disabled={pending} className="rounded-full border border-hooma-text/15 px-5 py-2.5 text-sm font-semibold disabled:opacity-50">{georgian ? "დაბრუნება" : "Go back"}</button>
              <button type="button" onClick={submit} disabled={!confirmed || pending} className="rounded-full bg-red-800 px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">
                {pending ? (georgian ? "მოთხოვნა იგზავნება..." : "Submitting...") : (georgian ? "გაუქმება და სრული თანხის დაბრუნება" : "Cancel and request full refund")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
