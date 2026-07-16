import Link from "next/link";
import { CheckCircle2, Clock3, FileCheck2, Printer, WalletCards } from "lucide-react";
import { CustomQuoteRequestForm } from "@/components/account/CustomQuoteRequestForm";
import { acceptCustomQuoteAction } from "./actions";
import { createClient } from "@/lib/supabase/server";

type CustomQuoteRequest = {
  id: string;
  title: string;
  description: string;
  quantity: number;
  status: string;
  quoted_price: number | null;
  quote_currency: string;
  quoted_lead_days: number | null;
  quote_notes: string | null;
  quote_expires_at: string | null;
  order_id: string | null;
  created_at: string;
};

const statusLabel: Record<string, string> = {
  submitted: "მოთხოვნა მიღებულია",
  under_review: "მიმდინარეობს შეფასება",
  needs_information: "საჭიროა დამატებითი ინფორმაცია",
  quoted: "ფასი მზად არის",
  accepted: "შეთავაზება მიღებულია",
  payment_pending: "ელოდება გადახდას",
  paid: "გადახდილია",
  production_queued: "წარმოების რიგშია",
  in_production: "მზადდება",
  quality_check: "ხარისხის კონტროლი",
  ready_for_delivery: "მზადაა მიწოდებისთვის",
  delivered: "მიწოდებულია",
  rejected: "ვერ დამზადდება",
  cancelled: "გაუქმებულია",
};

export default async function CustomOrdersPage() {
  const supabase = (await createClient()) as any;
  const { data } = supabase
    ? await supabase.from("custom_quote_requests").select("*").order("created_at", { ascending: false })
    : { data: [] };
  const requests = (data ?? []) as CustomQuoteRequest[];

  return (
    <div className="space-y-7">
      <div><p className="text-xs font-semibold uppercase tracking-[0.22em] text-hooma-accent">Custom manufacturing</p><h1 className="mt-3 text-4xl font-semibold tracking-tight">ინდივიდუალური შეკვეთები</h1><p className="mt-3 max-w-2xl text-sm leading-7 text-hooma-muted">ატვირთე ფაილი, მიიღე ინდივიდუალური ფასი და აკონტროლე მოთხოვნა, გადახდა და წარმოების სტატუსი ერთი გვერდიდან.</p></div>

      <CustomQuoteRequestForm />

      <section className="rounded-[1.5rem] border border-hooma-text/10 bg-white/75 p-5 shadow-sm sm:p-6">
        <div className="flex items-center justify-between gap-4"><div><p className="text-xs uppercase tracking-[0.2em] text-hooma-muted">Request history</p><h2 className="mt-2 text-2xl font-semibold">ჩემი მოთხოვნები</h2></div><span className="rounded-full bg-hooma-panel px-3 py-1.5 text-xs font-medium">{requests.length}</span></div>
        <div className="mt-5 grid gap-4">
          {requests.length ? requests.map((request) => (
            <article key={request.id} className="rounded-2xl border border-hooma-text/10 bg-hooma-background p-5">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div><p className="text-xs text-hooma-muted">#{request.id.slice(0, 8).toUpperCase()} · {new Date(request.created_at).toLocaleDateString("ka-GE")}</p><h3 className="mt-2 text-lg font-semibold">{request.title}</h3><p className="mt-2 line-clamp-2 text-sm leading-6 text-hooma-muted">{request.description}</p></div><span className="w-fit rounded-full bg-[#dfe8da] px-3 py-1.5 text-xs font-semibold text-hooma-accent">{statusLabel[request.status] ?? request.status}</span></div>

              <div className="mt-4 grid gap-3 border-t border-hooma-text/10 pt-4 sm:grid-cols-3">
                <div className="flex items-center gap-2 text-sm"><FileCheck2 size={15} className="text-hooma-accent" /><span><span className="text-hooma-muted">რაოდენობა:</span> {request.quantity}</span></div>
                <div className="flex items-center gap-2 text-sm"><Clock3 size={15} className="text-hooma-accent" /><span>{request.quoted_lead_days ? `${request.quoted_lead_days} სამუშაო დღე` : "ვადა შეფასების შემდეგ"}</span></div>
                <div className="flex items-center gap-2 text-sm"><WalletCards size={15} className="text-hooma-accent" /><span className="font-semibold">{request.quoted_price === null ? "ფასი შეფასების შემდეგ" : `₾${request.quoted_price} / ერთეული`}</span></div>
              </div>

              {request.quote_notes ? <p className="mt-4 rounded-xl bg-white p-3 text-sm leading-6 text-hooma-muted">{request.quote_notes}</p> : null}
              {request.status === "quoted" ? <form action={acceptCustomQuoteAction} className="mt-4 flex flex-col gap-3 rounded-xl border border-hooma-accent/20 bg-white p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-semibold">შეთავაზება მზადაა</p><p className="mt-1 text-xs text-hooma-muted">დადასტურების შემდეგ მოთხოვნა გადავა გადახდის ეტაპზე.</p></div><input type="hidden" name="request_id" value={request.id} /><button className="rounded-full bg-hooma-text px-5 py-2.5 text-sm font-semibold text-white">შეთავაზების მიღება</button></form> : null}
              {request.status === "payment_pending" ? <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><p className="font-semibold">გადახდის ეტაპი მზადაა დასაკავშირებლად</p><p className="mt-1 text-xs leading-5">რეალური TBC/საქართველოს ბანკის გადახდა ჩაირთვება სრული სატესტო ციკლის დამტკიცების შემდეგ.</p></div> : null}
              {request.order_id ? <Link href="/account/orders" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-hooma-accent hover:underline"><Printer size={15} />წარმოების შეკვეთის ნახვა</Link> : null}
              {request.status === "delivered" ? <p className="mt-4 flex items-center gap-2 text-sm font-semibold text-emerald-700"><CheckCircle2 size={16} />შეკვეთა დასრულებულია</p> : null}
            </article>
          )) : <div className="rounded-2xl border border-dashed border-hooma-text/15 px-5 py-12 text-center"><FileCheck2 className="mx-auto text-hooma-muted" /><p className="mt-4 font-semibold">ჯერ მოთხოვნა არ გაქვს</p><p className="mt-2 text-sm text-hooma-muted">პირველი ფაილის გაგზავნის შემდეგ სტატუსი აქ გამოჩნდება.</p></div>}
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-3">{[[FileCheck2, "1. ფაილის შემოწმება", "ოპერატორი ამოწმებს მოდელსა და დამზადებადობას"], [WalletCards, "2. ფასი და გადახდა", "ინდივიდუალური შეთავაზება გამოჩნდება ანგარიშში"], [Printer, "3. წარმოების ციკლი", "დადასტურებული გადახდის შემდეგ იქმნება ოპერატორის მიერ დასამტკიცებელი print job"]].map(([Icon, title, copy]) => { const StepIcon = Icon as typeof Printer; return <div key={String(title)} className="rounded-2xl bg-hooma-panel p-4"><StepIcon size={18} className="text-hooma-accent" /><h3 className="mt-3 text-sm font-semibold">{String(title)}</h3><p className="mt-1 text-xs leading-5 text-hooma-muted">{String(copy)}</p></div>; })}</div>
    </div>
  );
}
