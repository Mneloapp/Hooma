import { Check, Clock3, Package, Truck } from "lucide-react";
import Link from "next/link";
import {
  OrderCancellationButton,
  type CustomerCancellationStatus,
} from "@/components/account/OrderCancellationButton";
import { OrdersAutoRefresh } from "@/components/account/OrdersAutoRefresh";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { LocalizedText } from "@/components/LocalizedText";
import { getBogCustomerRefundAvailability } from "@/lib/payments/bog";
import {
  isOrderVisibleInHistory,
  ORDER_HISTORY_POSTGREST_FILTER,
} from "@/lib/orders/visibility";

export const dynamic = "force-dynamic";

type Order = {
  id: string;
  tracking_code: string | null;
  status: string;
  payment_status: string;
  subtotal: number | string | null;
  delivery_fee: number | string | null;
  delivery_benefit_code: string;
  total: number | string | null;
  fulfillment_status: string;
  promised_at: string | null;
  delivery_address: Record<string, unknown> | null;
  test_mode: boolean;
  created_at: string;
  updated_at: string;
};

type OrderItem = {
  id: string;
  order_id: string;
  product_name: string | null;
  size_label: string | null;
  material: string | null;
  color: string | null;
  quantity: number;
  product_id: string | null;
  products: { slug: string } | Array<{ slug: string }> | null;
};

type OrderEvent = {
  id: string;
  order_id: string;
  customer_label_ka: string;
  event_type: string;
  created_at: string;
};

type CancellationRefund = {
  order_id: string;
  status: CustomerCancellationStatus;
  refund_amount: number | string;
  currency: string;
  requested_at: string;
  submitted_at: string | null;
  refunded_at: string | null;
  updated_at: string;
};

type BogPaymentAttempt = { order_id: string };

const stages = [
  { key: "payment_confirmed", ka: "გადახდილია", en: "Paid" },
  { key: "order_received", ka: "შეკვეთა მიღებულია", en: "Order received" },
  { key: "production_started", ka: "წარმოება დაწყებულია", en: "Production started" },
  { key: "quality_check", ka: "ხარისხის შემოწმება", en: "Quality check" },
  { key: "ready_for_delivery", ka: "მზადაა საკურიეროსთვის", en: "Ready for courier" },
  { key: "out_for_delivery", ka: "გზაშია", en: "Out for delivery" },
  { key: "delivered", ka: "მიწოდებულია", en: "Delivered" },
] as const;

const eventLabelsEn: Record<string, string> = {
  order_received: "Order received", confirmed: "Order confirmed", production_queued: "Queued for production",
  production_started: "Production started", in_production: "In production", quality_check: "Quality check",
  ready_for_delivery: "Ready for courier", out_for_delivery: "Out for delivery", delivered: "Delivered", cancelled: "Order cancelled",
  cancellation_requested: "Order cancelled — refund requested",
  payment_confirmed: "Payment confirmed", payment_refunded: "Payment refunded",
};

const stageByStatus: Record<string, number> = {
  order_received: 1,
  confirmed: 1,
  production_queued: 2,
  production_started: 2,
  in_production: 2,
  quality_check: 3,
  ready_for_delivery: 4,
  out_for_delivery: 5,
  delivered: 6,
};

const stageByEvent: Record<string, number> = {
  payment_confirmed: 0,
  order_received: 1,
  confirmed: 1,
  production_queued: 2,
  production_started: 2,
  in_production: 2,
  quality_check: 3,
  ready_for_delivery: 4,
  out_for_delivery: 5,
  delivered: 6,
};

type StageState = "completed" | "current" | "delivered" | "upcoming" | "waiting" | "review" | "failed" | "refunded";

const stageStyles: Record<StageState, { card: string; marker: string; text: string }> = {
  completed: {
    card: "border-emerald-200 bg-emerald-50",
    marker: "bg-emerald-700 text-white",
    text: "font-bold text-emerald-950",
  },
  current: {
    card: "border-sky-400 bg-sky-50 shadow-sm ring-2 ring-sky-200/70",
    marker: "bg-sky-700 text-white",
    text: "font-bold text-sky-950",
  },
  delivered: {
    card: "border-emerald-400 bg-emerald-50 shadow-sm ring-2 ring-emerald-200/70",
    marker: "bg-emerald-800 text-white",
    text: "font-bold text-emerald-950",
  },
  upcoming: {
    card: "border-hooma-text/10 bg-white/55",
    marker: "bg-hooma-panel text-hooma-muted",
    text: "font-medium text-hooma-muted",
  },
  waiting: {
    card: "border-amber-300 bg-amber-50 ring-2 ring-amber-200/60",
    marker: "bg-amber-600 text-white",
    text: "font-bold text-amber-950",
  },
  review: {
    card: "border-orange-300 bg-orange-50 ring-2 ring-orange-200/60",
    marker: "bg-orange-600 text-white",
    text: "font-bold text-orange-950",
  },
  failed: {
    card: "border-red-300 bg-red-50 ring-2 ring-red-200/60",
    marker: "bg-red-700 text-white",
    text: "font-bold text-red-950",
  },
  refunded: {
    card: "border-violet-300 bg-violet-50 ring-2 ring-violet-200/60",
    marker: "bg-violet-700 text-white",
    text: "font-bold text-violet-950",
  },
};

const dateFormat = new Intl.DateTimeFormat("ka-GE", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Tbilisi",
});
const money = new Intl.NumberFormat("ka-GE", { style: "currency", currency: "GEL" });

export default async function AccountOrdersPage() {
  const supabase = (await createClient()) as any;
  const refundAvailability = getBogCustomerRefundAvailability();
  const { data: orderRows, error: orderError } = supabase
    ? await supabase
      .from("orders")
      .select("id,tracking_code,status,payment_status,subtotal,delivery_fee,delivery_benefit_code,total,fulfillment_status,promised_at,delivery_address,test_mode,created_at,updated_at")
      .or(ORDER_HISTORY_POSTGREST_FILTER)
      .order("updated_at", { ascending: false })
      .limit(50)
    : { data: [], error: null };
  const orders = ((orderRows ?? []) as Order[]).filter((order) =>
    isOrderVisibleInHistory(order.payment_status, order.test_mode));
  const orderIds = orders.map((order) => order.id);
  // The service-role client is used only after user RLS has produced this
  // exact owned-order allowlist. No provider identifiers are selected below.
  const admin = orderIds.length ? createAdminClient() as any : null;

  const [{ data: itemRows }, { data: eventRows }, { data: cancellationRows }, { data: bogAttemptRows }] = supabase && orderIds.length
    ? await Promise.all([
      supabase.from("order_items").select("id,order_id,product_id,product_name,size_label,material,color,quantity,products(slug)").in("order_id", orderIds).order("created_at"),
      supabase.from("order_events").select("id,order_id,customer_label_ka,event_type,created_at").in("order_id", orderIds).eq("is_customer_visible", true).order("created_at"),
      admin
        ? admin.from("order_cancellation_refunds").select("order_id,status,refund_amount,currency,requested_at,submitted_at,refunded_at,updated_at").in("order_id", orderIds)
        : Promise.resolve({ data: [] }),
      admin
        ? admin.from("payment_attempts").select("order_id").in("order_id", orderIds).eq("provider", "bog").eq("status", "paid").eq("signature_verified", true)
        : Promise.resolve({ data: [] }),
    ])
    : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }];

  const itemsByOrder = new Map<string, OrderItem[]>();
  for (const item of (itemRows ?? []) as OrderItem[]) itemsByOrder.set(item.order_id, [...(itemsByOrder.get(item.order_id) ?? []), item]);
  const eventsByOrder = new Map<string, OrderEvent[]>();
  for (const event of (eventRows ?? []) as OrderEvent[]) eventsByOrder.set(event.order_id, [...(eventsByOrder.get(event.order_id) ?? []), event]);
  const cancellationByOrder = new Map(((cancellationRows ?? []) as CancellationRefund[]).map((refund) => [refund.order_id, refund]));
  const paidBogOrderIds = new Set(((bogAttemptRows ?? []) as BogPaymentAttempt[]).map((attempt) => attempt.order_id));

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div><p className="text-xs uppercase tracking-[0.28em] text-hooma-muted"><LocalizedText ka="შეკვეთის ისტორია" en="Order history" /></p><h1 className="mt-3 text-4xl font-medium"><LocalizedText ka="შეკვეთები" en="Orders" /></h1><p className="mt-3 text-sm text-hooma-muted"><LocalizedText ka="აქ ჩანს მხოლოდ გადახდით დადასტურებული ან საბანკო შემოწმებაზე მყოფი შეკვეთები. დაუსრულებელი გადახდის სესია შეკვეთად არ ითვლება." en="Only payment-confirmed orders and orders under bank review appear here. An unfinished payment session is not treated as an order." /></p></div>
        <OrdersAutoRefresh />
      </div>

      {orderError ? <p className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900"><LocalizedText ka="შეკვეთების ჩატვირთვა ვერ მოხერხდა. სცადე გვერდის განახლება." en="Orders could not be loaded. Refresh the page and try again." /></p> : null}

      {orders.map((order) => {
        const orderItems = itemsByOrder.get(order.id) ?? [];
        const events = eventsByOrder.get(order.id) ?? [];
        const placedAt = events.find((event) => event.event_type === "order_received")?.created_at
          ?? order.created_at;
        const cancellation = cancellationByOrder.get(order.id);
        const orderCancelled = order.fulfillment_status === "cancelled";
        const cancellationStatus = cancellation?.status
          ?? (order.payment_status === "refunded"
            ? orderCancelled ? "refunded" : "review_required"
            : null);
        const refundProcessing = cancellationStatus === "processing" || cancellationStatus === "refund_submitted";
        const refundReview = cancellationStatus === "submission_failed" || cancellationStatus === "review_required";
        const refundComplete = cancellationStatus === "refunded";
        const operationalRefundHold = Boolean(cancellationStatus && !orderCancelled);
        const cancelled = orderCancelled;
        const paymentReady = order.test_mode || order.payment_status === "paid";
        const reviewRequired = order.payment_status === "review_required";
        const refunded = order.payment_status === "refunded";
        const paymentFailed = order.payment_status === "failed";
        const currentStage = paymentReady || operationalRefundHold ? (stageByStatus[order.fulfillment_status] ?? 1) : 0;
        const reachedBeforeCancellation = paymentReady
          ? events.reduce((highest, event) => Math.max(highest, stageByEvent[event.event_type] ?? -1), 1)
          : -1;
        const paymentTitle = reviewRequired
          ? ["გადახდას შემოწმება სჭირდება", "Payment needs review"]
          : paymentFailed
            ? ["გადახდა ვერ დასრულდა", "Payment was not completed"]
            : refunded
              ? ["თანხა დაბრუნებულია", "Payment refunded"]
              : ["გადახდას ელოდება", "Awaiting payment"];
        const paymentPresentation = refundProcessing
          ? { ka: "დაბრუნება მუშავდება", en: "Refund processing", className: "border-amber-200 bg-amber-50 text-amber-900" }
          : refundReview
            ? { ka: "საჭიროა მხარდაჭერა", en: "Support review", className: "border-orange-200 bg-orange-50 text-orange-900" }
            : refundComplete
              ? { ka: "თანხა დაბრუნებულია", en: "Refunded", className: "border-violet-200 bg-violet-50 text-violet-900" }
              : order.test_mode
                ? { ka: "სატესტო შეკვეთა", en: "Test order", className: "border-sky-200 bg-sky-50 text-sky-900" }
                : order.payment_status === "paid"
                  ? { ka: "გადახდილია", en: "Paid", className: "border-emerald-200 bg-emerald-50 text-emerald-900" }
                  : paymentFailed
                    ? { ka: "გადახდა ვერ დასრულდა", en: "Payment failed", className: "border-red-200 bg-red-50 text-red-900" }
                    : reviewRequired
                      ? { ka: "მოწმდება", en: "Under review", className: "border-orange-200 bg-orange-50 text-orange-900" }
                      : refunded
                        ? { ka: "თანხა დაბრუნებულია", en: "Refunded", className: "border-violet-200 bg-violet-50 text-violet-900" }
                        : { ka: "გადახდას ელოდება", en: "Awaiting payment", className: "border-amber-200 bg-amber-50 text-amber-900" };
        const paymentStageLabel = order.test_mode
          ? { ka: "სატესტო რეჟიმი", en: "Test mode" }
          : { ka: paymentPresentation.ka, en: paymentPresentation.en };
        const currentStageLabel = stages[currentStage] ?? stages[1];
        const orderIsCatalog = orderItems.length > 0 && orderItems.every((item) => Boolean(item.product_id));
        const isPaidBogCatalogOrder = !order.test_mode
          && order.payment_status === "paid"
          && paidBogOrderIds.has(order.id)
          && orderIsCatalog;
        const isPreProduction = ["order_received", "confirmed"].includes(order.fulfillment_status);
        const canRequestCancellation = refundAvailability.available
          && isPaidBogCatalogOrder
          && isPreProduction
          && !cancellation;
        const cancellationUnavailableReason = !cancellation && isPaidBogCatalogOrder
          ? isPreProduction && !refundAvailability.available
            ? "service_unavailable" as const
            : !isPreProduction && order.fulfillment_status !== "cancelled"
              ? "later_stage" as const
              : null
          : null;
        const stageState = (index: number): StageState => {
          if (operationalRefundHold) {
            if (index < currentStage) return "completed";
            if (index === currentStage) return "review";
            return "upcoming";
          }
          if (!paymentReady) {
            if (index > 0) return "upcoming";
            if (paymentFailed) return "failed";
            if (refunded) return "refunded";
            if (reviewRequired) return "review";
            return "waiting";
          }
          if (cancelled) return index <= reachedBeforeCancellation ? "completed" : "upcoming";
          if (index < currentStage) return "completed";
          if (index === currentStage) return order.fulfillment_status === "delivered" ? "delivered" : "current";
          return "upcoming";
        };
        return (
          <article key={order.id} className="overflow-hidden rounded-[2rem] border border-hooma-text/10 bg-white/75 shadow-soft">
            <div className="flex flex-col justify-between gap-4 border-b border-hooma-text/10 p-5 sm:flex-row sm:items-start lg:p-6">
              <div><p className="text-xs font-semibold text-hooma-accent">#{order.tracking_code ?? order.id.slice(0, 8).toUpperCase()}</p><h2 className="mt-2 text-2xl font-semibold"><LocalizedText
                ka={operationalRefundHold ? "თანხის დაბრუნებას ოპერაციული შემოწმება სჭირდება" : refundProcessing ? "შეკვეთა გაუქმებულია · დაბრუნება მუშავდება" : refundReview ? "შეკვეთა გაუქმებულია · საჭიროა მხარდაჭერა" : refundComplete ? "შეკვეთა გაუქმებულია · თანხა დაბრუნებულია" : cancelled ? "შეკვეთა გაუქმებულია" : !paymentReady ? paymentTitle[0] : currentStageLabel.ka}
                en={operationalRefundHold ? "Refund needs operational review" : refundProcessing ? "Order cancelled · refund processing" : refundReview ? "Order cancelled · support review needed" : refundComplete ? "Order cancelled · payment refunded" : cancelled ? "Order cancelled" : !paymentReady ? paymentTitle[1] : currentStageLabel.en}
              /></h2><p className="mt-2 text-xs text-hooma-muted"><LocalizedText ka="შეკვეთა:" en="Ordered:" /> {dateFormat.format(new Date(placedAt))}</p></div>
              <div className="text-left sm:text-right">
                <p className="text-xl font-semibold">{money.format(Number(order.total ?? 0))}</p>
                <span className={`mt-2 inline-flex rounded-full border px-3 py-1.5 text-xs font-bold ${paymentPresentation.className}`}><LocalizedText ka={paymentPresentation.ka} en={paymentPresentation.en} /></span>
                {order.test_mode ? <p className="mt-1 text-[11px] text-hooma-muted"><LocalizedText ka="თანხა არ ჩამოგეჭრება" en="You will not be charged" /></p> : null}
                <div className="mt-3 space-y-1 text-xs text-hooma-muted">
                  <p><LocalizedText ka="პროდუქტები" en="Products" />: {money.format(Number(order.subtotal ?? 0))}</p>
                  <p><LocalizedText ka="მიწოდება" en="Delivery" />: {Number(order.delivery_fee ?? 0) === 0 ? <LocalizedText ka="უფასო" en="Free" /> : money.format(Number(order.delivery_fee))}</p>
                  <p className="font-medium text-hooma-text"><LocalizedText
                    ka={order.delivery_benefit_code === "hooma_plus" ? "Hooma+ ბენეფიტი" : order.delivery_benefit_code === "subtotal_threshold" ? "100₾-დან" : order.delivery_benefit_code === "welcome_units" ? "პირველი 10 ერთეული" : order.delivery_benefit_code === "standard_fee" ? "სტანდარტული ტარიფი" : "ძველი უფასო პირობა"}
                    en={order.delivery_benefit_code === "hooma_plus" ? "Hooma+ benefit" : order.delivery_benefit_code === "subtotal_threshold" ? "From ₾100" : order.delivery_benefit_code === "welcome_units" ? "First 10 units" : order.delivery_benefit_code === "standard_fee" ? "Standard rate" : "Legacy free condition"}
                  /></p>
                </div>
              </div>
            </div>

            <div className="border-b border-hooma-text/10 bg-hooma-background/65 p-5 lg:p-6">
              <div className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 sm:pb-0 lg:grid-cols-4 xl:grid-cols-7" role="list" aria-label="Order progress">
                {stages.map((stage, index) => {
                    const state = stageState(index);
                    const styles = stageStyles[state];
                    const isCurrent = ["current", "delivered", "waiting", "review", "failed", "refunded"].includes(state);
                    const label = index === 0 ? paymentStageLabel : stage;
                    return (
                      <div key={stage.key} role="listitem" aria-current={isCurrent ? "step" : undefined} className={`min-h-28 w-[10rem] shrink-0 snap-start rounded-2xl border p-3 sm:w-auto ${styles.card}`}>
                        <span className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${styles.marker}`}>{["completed", "delivered"].includes(state) ? <Check size={16} aria-hidden="true" /> : state === "failed" ? "!" : index + 1}</span>
                        <p className={`mt-3 text-xs leading-5 ${styles.text}`}><LocalizedText ka={label.ka} en={label.en} /></p>
                        {state === "current" ? <span className="mt-1 block text-[10px] font-bold uppercase tracking-[0.12em] text-sky-700"><LocalizedText ka="მიმდინარე" en="Current" /></span> : null}
                      </div>
                    );
                  })}
              </div>
            </div>

            <OrderCancellationButton
              orderId={order.id}
              total={Number(cancellation?.refund_amount ?? order.total ?? 0)}
              status={cancellationStatus}
              orderCancelled={orderCancelled}
              canRequest={canRequestCancellation}
              unavailableReason={cancellationUnavailableReason}
            />

            {cancelled && !cancellationStatus ? (
              <div className="border-b border-red-200 bg-red-50 p-5 text-sm leading-6 text-red-950 lg:p-6">
                <p className="font-bold"><LocalizedText ka="შეკვეთა გაუქმებულია" en="Order cancelled" /></p>
                <p className="mt-1"><LocalizedText ka="გაუქმების შემდეგ დარჩენილი წარმოებისა და მიწოდების ეტაპები აღარ გაგრძელდება." en="Production and delivery stages will not continue after cancellation." /></p>
              </div>
            ) : !cancellationStatus && !paymentReady ? (
              <div className={`border-b p-5 text-sm leading-6 lg:p-6 ${reviewRequired ? "border-orange-200 bg-orange-50 text-orange-950" : paymentFailed ? "border-red-200 bg-red-50 text-red-950" : refunded ? "border-violet-200 bg-violet-50 text-violet-950" : "border-amber-200 bg-amber-50 text-amber-950"}`}>
                <p className="font-semibold"><LocalizedText ka={paymentTitle[0]} en={paymentTitle[1]} /></p>
                <p className="mt-1"><LocalizedText
                  ka={reviewRequired ? "ხელახლა ნუ გადაიხდი. შეკვეთა უსაფრთხოდ შეჩერებულია, სანამ ჩვენი გუნდი ბანკის ჩანაწერს გადაამოწმებს." : paymentFailed ? "წარმოება არ დაწყებულა და თანხა დადასტურებული არ არის. შეგიძლია იგივე კალათით ახალი უსაფრთხო გადახდა სცადო." : refunded ? "BOG-ის ჩანაწერით სრული თანხა დაბრუნებულია და წარმოების დარჩენილი ეტაპები აღარ გაგრძელდება." : "წარმოება დაიწყება მხოლოდ საქართველოს ბანკის დაცული დადასტურებისა და ოპერატორის შემოწმების შემდეგ."}
                  en={reviewRequired ? "Do not pay again. The order is safely on hold while our team reviews the bank record." : paymentFailed ? "Production has not started and payment is not confirmed. You can retry a new secure payment with the same cart." : refunded ? "BOG records show that the full amount was refunded, so the remaining production stages will not continue." : "Production starts only after Bank of Georgia’s secure confirmation and an operator review."}
                /></p>
                {paymentFailed ? <Link href="/checkout" className="mt-3 inline-flex rounded-full bg-red-950 px-4 py-2 text-xs font-semibold text-white"><LocalizedText ka="გადახდის ხელახლა ცდა" en="Try payment again" /></Link> : null}
              </div>
            ) : null}

            <div className="grid gap-6 p-5 lg:grid-cols-[1.35fr_0.65fr] lg:p-6">
              <div>
                <h3 className="flex items-center gap-2 font-semibold"><Package size={18} className="text-hooma-accent" /><LocalizedText ka="პროდუქტები" en="Products" /></h3>
                <div className="mt-3 divide-y divide-hooma-text/10 rounded-2xl border border-hooma-text/10 bg-white">
                  {orderItems.map((item) => {
                    const joinedProduct = Array.isArray(item.products) ? item.products[0] : item.products;

                    return (
                      <div key={item.id} className="flex flex-col justify-between gap-3 p-4 sm:flex-row sm:items-center">
                        <div>
                          <p className="font-semibold">{item.product_name || <LocalizedText ka="ინდივიდუალური პროდუქტი" en="Custom product" />}</p>
                          <p className="mt-1 text-xs text-hooma-muted">{[item.size_label, item.material, item.color].filter(Boolean).join(" · ") || <LocalizedText ka="კონფიგურაცია" en="Configuration" />}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                          <strong className="mr-1 text-sm">×{item.quantity}</strong>
                          {joinedProduct?.slug ? (
                            <Link href={`/product/${joinedProduct.slug}`} className="rounded-full border border-hooma-text/15 bg-white px-3 py-1.5 text-xs font-semibold text-hooma-text transition hover:border-hooma-accent hover:text-hooma-accent">
                              <LocalizedText ka="პროდუქტის ნახვა" en="View product" />
                            </Link>
                          ) : null}
                          {order.fulfillment_status === "delivered" && joinedProduct?.slug ? <Link href={`/product/${joinedProduct.slug}#reviews`} className="rounded-full bg-hooma-text px-3 py-1.5 text-xs font-semibold text-white"><LocalizedText ka="შეფასება" en="Review" /></Link> : null}
                        </div>
                      </div>
                    );
                  })}
                  {!orderItems.length ? <p className="p-4 text-sm text-hooma-muted"><LocalizedText ka="პროდუქტის მონაცემები ვერ ჩაიტვირთა." en="Product details could not be loaded." /></p> : null}
                </div>
                {paymentReady ? <div className="mt-4 flex flex-wrap gap-3 text-xs text-hooma-muted">
                  <span className="inline-flex items-center gap-1.5"><Clock3 size={14} /><LocalizedText ka={order.promised_at ? `სავარაუდო მომზადება/კურიერზე გადაცემა: ${dateFormat.format(new Date(order.promised_at))}` : "მომზადება ან კურიერზე გადაცემა 3 სამუშაო დღეში"} en={order.promised_at ? `Estimated preparation/courier handoff: ${dateFormat.format(new Date(order.promised_at))}` : "Prepared or handed to the courier within 3 business days"} /></span>
                  {order.fulfillment_status === "out_for_delivery" ? <span className="inline-flex items-center gap-1.5 font-semibold text-hooma-text"><Truck size={14} /><LocalizedText ka="საკურიერო მომსახურებასთანაა" en="With the courier" /></span> : null}
                </div> : null}
              </div>

              <div>
                <h3 className="font-semibold"><LocalizedText ka="სტატუსის ისტორია" en="Status history" /></h3>
                <ol className="mt-3 space-y-3">
                  {events.slice().reverse().map((event) => (
                    <li key={event.id} className="border-l-2 border-hooma-accent/35 pl-3"><p className="text-sm font-medium"><LocalizedText ka={event.customer_label_ka} en={eventLabelsEn[event.event_type] ?? "Order updated"} /></p><time className="mt-1 block text-xs text-hooma-muted">{dateFormat.format(new Date(event.created_at))}</time></li>
                  ))}
                  {!events.length ? <li className="text-sm text-hooma-muted"><LocalizedText ka={paymentReady ? "შეკვეთა მიღებულია." : "გადახდის შედეგს ველოდებით."} en={paymentReady ? "Order received." : "Waiting for the payment result."} /></li> : null}
                </ol>
              </div>
            </div>
          </article>
        );
      })}

      {!orders.length ? (
        <div className="rounded-[2rem] border border-dashed border-hooma-text/15 bg-white/55 px-6 py-16 text-center"><Package className="mx-auto text-hooma-muted" /><p className="mt-4 font-semibold"><LocalizedText ka="დადასტურებული შეკვეთა ჯერ არ გაქვს" en="You have no confirmed orders yet" /></p><p className="mt-2 text-sm text-hooma-muted"><LocalizedText ka="შეკვეთა აქ BOG-ის მიერ გადახდის დადასტურების შემდეგ გამოჩნდება." en="An order will appear here after BOG confirms its payment." /></p></div>
      ) : null}
    </div>
  );
}
