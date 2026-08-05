import { CheckCircle2, CircleAlert, Clock3 } from "lucide-react";
import Link from "next/link";
import { PaymentResultAutoRefresh } from "@/components/checkout/PaymentResultAutoRefresh";
import { LocalizedText } from "@/components/LocalizedText";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const money = new Intl.NumberFormat("ka-GE", { style: "currency", currency: "GEL" });

type PaymentResultParams = {
  order?: string;
  return?: string;
};

export default async function PaymentResultPage({
  searchParams,
}: {
  searchParams: Promise<PaymentResultParams>;
}) {
  const query = await searchParams;
  const orderId = query.order ?? "";
  const supabase = (await createClient()) as any;
  const { data: order } = supabase && uuidPattern.test(orderId)
    ? await supabase
      .from("orders")
      .select("id,tracking_code,payment_status,subtotal,delivery_fee,delivery_benefit_code,total,test_mode")
      .eq("id", orderId)
      .eq("test_mode", false)
      .maybeSingle()
    : { data: null };

  if (!order) {
    return (
      <section className="mx-auto max-w-2xl px-4 py-20 text-center sm:px-6">
        <CircleAlert className="mx-auto text-amber-600" size={44} />
        <h1 className="mt-5 text-3xl font-semibold"><LocalizedText ka="შეკვეთა ვერ მოიძებნა" en="Order not found" /></h1>
        <p className="mt-3 text-hooma-muted"><LocalizedText ka="გადახდის შედეგი მხოლოდ შესაბამის ანგარიშში ჩანს. შეკვეთების გვერდზე გადაამოწმე ბოლო სტატუსი." en="Payment results are visible only in the corresponding account. Check the latest status on the Orders page." /></p>
        <Link href="/account/orders" className="mt-7 inline-flex rounded-full bg-hooma-text px-6 py-3 text-sm font-semibold text-white"><LocalizedText ka="ჩემი შეკვეთები" en="My orders" /></Link>
      </section>
    );
  }

  const paid = order.payment_status === "paid";
  const failed = order.payment_status === "failed";
  const refunded = order.payment_status === "refunded";
  const reviewRequired = order.payment_status === "review_required";
  const settled = paid || failed || refunded || reviewRequired;
  const returnedFromFailure = query.return === "fail";
  const state = paid
    ? {
      icon: <CheckCircle2 className="mx-auto text-emerald-600" size={48} />,
      titleKa: "გადახდა დადასტურებულია",
      titleEn: "Payment confirmed",
      bodyKa: "BOG-მა სრული თანხის გადახდა დაადასტურა. შეკვეთა მიღებულია და წარმოებაში გაშვებამდე ოპერატორი გადაამოწმებს.",
      bodyEn: "BOG confirmed the full payment. Your order is received and an operator will review it before production.",
      panel: "border-emerald-200 bg-emerald-50",
    }
    : reviewRequired
      ? {
        icon: <CircleAlert className="mx-auto text-orange-600" size={48} />,
        titleKa: "გადახდას დამატებითი შემოწმება სჭირდება",
        titleEn: "Payment needs additional review",
        bodyKa: "სტატუსში შეუსაბამობა დაფიქსირდა. ხელახლა ნუ გადაიხდი — შეკვეთა უსაფრთხოდ შეჩერებულია და ჩვენი გუნდი გადაამოწმებს ბანკის ჩანაწერს.",
        bodyEn: "A status mismatch was detected. Do not pay again—the order is safely on hold while our team reviews the bank record.",
        panel: "border-orange-200 bg-orange-50",
      }
      : failed || refunded
      ? {
        icon: <CircleAlert className={`mx-auto ${refunded ? "text-blue-600" : "text-red-600"}`} size={48} />,
        titleKa: refunded ? "თანხა დაბრუნებულია" : "გადახდა ვერ დასრულდა",
        titleEn: refunded ? "Payment refunded" : "Payment was not completed",
        bodyKa: refunded ? "BOG-ის ჩანაწერით სრული თანხა დაბრუნებულია." : "შეკვეთა არ ითვლება გადახდილად და წარმოებაში არ გაეშვება.",
        bodyEn: refunded ? "BOG records show that the full amount was refunded." : "The order is not considered paid and will not enter production.",
        panel: refunded ? "border-blue-200 bg-blue-50" : "border-red-200 bg-red-50",
      }
      : {
        icon: <Clock3 className="mx-auto text-amber-600" size={48} />,
        titleKa: returnedFromFailure ? "გადახდა ჯერ არ დადასტურებულა" : "გადახდა მოწმდება",
        titleEn: returnedFromFailure ? "Payment is not confirmed yet" : "Verifying payment",
        bodyKa: "ბანკის გვერდიდან დაბრუნება თავისთავად გადახდის დასტური არ არის. ველოდებით BOG-ის დაცულ დადასტურებას და სტატუსს ავტომატურად ვაახლებთ.",
        bodyEn: "Returning from the bank page is not proof of payment. We are waiting for BOG’s secure confirmation and will refresh the status automatically.",
        panel: "border-amber-200 bg-amber-50",
      };

  return (
    <section className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
      <div className={`rounded-[2rem] border p-7 text-center shadow-soft sm:p-10 ${state.panel}`}>
        {state.icon}
        <p className="mt-5 text-xs font-semibold uppercase tracking-[0.24em] text-hooma-muted">#{order.tracking_code ?? order.id.slice(0, 8).toUpperCase()}</p>
        <h1 className="mt-3 text-3xl font-semibold"><LocalizedText ka={state.titleKa} en={state.titleEn} /></h1>
        <p className="mt-4 leading-7 text-hooma-muted"><LocalizedText ka={state.bodyKa} en={state.bodyEn} /></p>
        <PaymentResultAutoRefresh settled={settled} />
        <p className="mt-5 text-2xl font-semibold">{money.format(Number(order.total ?? 0))}</p>
        <p className="mt-2 text-xs text-hooma-muted">
          <LocalizedText ka="პროდუქტები" en="Products" /> {money.format(Number(order.subtotal ?? 0))}
          {" · "}
          <LocalizedText ka="მიწოდება" en="Delivery" /> {Number(order.delivery_fee ?? 0) === 0 ? <LocalizedText ka="უფასო" en="Free" /> : money.format(Number(order.delivery_fee))}
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Link href="/account/orders" className="rounded-full bg-hooma-text px-6 py-3 text-sm font-semibold text-white"><LocalizedText ka="შეკვეთების ნახვა" en="View orders" /></Link>
          {failed
            ? <Link href="/checkout" className="rounded-full border border-hooma-text/15 bg-white px-6 py-3 text-sm font-semibold"><LocalizedText ka="გადახდის ხელახლა ცდა" en="Try payment again" /></Link>
            : <Link href="/shop" className="rounded-full border border-hooma-text/15 bg-white px-6 py-3 text-sm font-semibold"><LocalizedText ka="კატალოგში დაბრუნება" en="Back to shop" /></Link>}
        </div>
      </div>
    </section>
  );
}
