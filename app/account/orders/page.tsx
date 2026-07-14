import { Check, Clock3, Package, Truck } from "lucide-react";
import { OrdersAutoRefresh } from "@/components/account/OrdersAutoRefresh";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Order = {
  id: string;
  tracking_code: string | null;
  status: string;
  payment_status: string;
  total: number | string | null;
  fulfillment_status: string;
  promised_at: string | null;
  delivery_address: Record<string, unknown> | null;
  test_mode: boolean;
  created_at: string;
};

type OrderItem = {
  id: string;
  order_id: string;
  product_name: string | null;
  size_label: string | null;
  material: string | null;
  color: string | null;
  quantity: number;
};

type OrderEvent = {
  id: string;
  order_id: string;
  customer_label_ka: string;
  event_type: string;
  created_at: string;
};

const stages = [
  "შეკვეთა მიღებულია",
  "წარმოება დაწყებულია",
  "ხარისხის შემოწმება",
  "მზადაა საკურიეროსთვის",
  "გზაშია",
  "მიწოდებულია",
];

const stageByStatus: Record<string, number> = {
  order_received: 0,
  confirmed: 0,
  production_queued: 1,
  in_production: 1,
  quality_check: 2,
  ready_for_delivery: 3,
  out_for_delivery: 4,
  delivered: 5,
};

const dateFormat = new Intl.DateTimeFormat("ka-GE", { dateStyle: "medium", timeStyle: "short" });
const money = new Intl.NumberFormat("ka-GE", { style: "currency", currency: "GEL" });

export default async function AccountOrdersPage() {
  const supabase = (await createClient()) as any;
  const { data: orderRows, error: orderError } = supabase
    ? await supabase
      .from("orders")
      .select("id,tracking_code,status,payment_status,total,fulfillment_status,promised_at,delivery_address,test_mode,created_at")
      .order("created_at", { ascending: false })
      .limit(50)
    : { data: [], error: null };
  const orders = (orderRows ?? []) as Order[];
  const orderIds = orders.map((order) => order.id);

  const [{ data: itemRows }, { data: eventRows }] = supabase && orderIds.length
    ? await Promise.all([
      supabase.from("order_items").select("id,order_id,product_name,size_label,material,color,quantity").in("order_id", orderIds).order("created_at"),
      supabase.from("order_events").select("id,order_id,customer_label_ka,event_type,created_at").in("order_id", orderIds).eq("is_customer_visible", true).order("created_at"),
    ])
    : [{ data: [] }, { data: [] }];

  const itemsByOrder = new Map<string, OrderItem[]>();
  for (const item of (itemRows ?? []) as OrderItem[]) itemsByOrder.set(item.order_id, [...(itemsByOrder.get(item.order_id) ?? []), item]);
  const eventsByOrder = new Map<string, OrderEvent[]>();
  for (const event of (eventRows ?? []) as OrderEvent[]) eventsByOrder.set(event.order_id, [...(eventsByOrder.get(event.order_id) ?? []), event]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div><p className="text-xs uppercase tracking-[0.28em] text-hooma-muted">შეკვეთის ისტორია</p><h1 className="mt-3 text-4xl font-medium">შეკვეთები</h1><p className="mt-3 text-sm text-hooma-muted">აქ ჩანს შეკვეთის მიმდინარე ეტაპი შეკვეთიდან მიწოდებამდე.</p></div>
        <OrdersAutoRefresh />
      </div>

      {orderError ? <p className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">შეკვეთების ჩატვირთვა ვერ მოხერხდა. სცადე გვერდის განახლება.</p> : null}

      {orders.map((order) => {
        const currentStage = stageByStatus[order.fulfillment_status] ?? 0;
        const orderItems = itemsByOrder.get(order.id) ?? [];
        const events = eventsByOrder.get(order.id) ?? [];
        const cancelled = order.fulfillment_status === "cancelled";
        return (
          <article key={order.id} className="overflow-hidden rounded-[2rem] border border-hooma-text/10 bg-white/75 shadow-soft">
            <div className="flex flex-col justify-between gap-4 border-b border-hooma-text/10 p-5 sm:flex-row sm:items-start lg:p-6">
              <div><p className="text-xs font-semibold text-hooma-accent">#{order.tracking_code ?? order.id.slice(0, 8).toUpperCase()}</p><h2 className="mt-2 text-2xl font-semibold">{cancelled ? "შეკვეთა გაუქმებულია" : stages[currentStage]}</h2><p className="mt-2 text-xs text-hooma-muted">შეკვეთა: {dateFormat.format(new Date(order.created_at))}</p></div>
              <div className="text-left sm:text-right"><p className="text-xl font-semibold">{money.format(Number(order.total ?? 0))}</p><p className="mt-1 text-xs text-hooma-muted">{order.test_mode ? "სატესტო შეკვეთა — თანხა არ ჩამოგეჭრება" : order.payment_status === "paid" ? "გადახდილია" : "გადახდას ელოდება"}</p></div>
            </div>

            {!cancelled ? (
              <div className="border-b border-hooma-text/10 bg-hooma-background/65 p-5 lg:p-6">
                <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
                  {stages.map((stage, index) => {
                    const reached = index <= currentStage;
                    const current = index === currentStage;
                    return (
                      <div key={stage} className={`rounded-2xl border p-3 ${current ? "border-hooma-accent bg-white shadow-sm" : reached ? "border-emerald-200 bg-emerald-50" : "border-hooma-text/10 bg-white/55"}`}>
                        <span className={`flex h-7 w-7 items-center justify-center rounded-full ${reached ? "bg-hooma-text text-white" : "bg-hooma-panel text-hooma-muted"}`}>{index < currentStage ? <Check size={15} /> : index + 1}</span>
                        <p className={`mt-3 text-xs leading-5 ${reached ? "font-semibold text-hooma-text" : "text-hooma-muted"}`}>{stage}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <div className="grid gap-6 p-5 lg:grid-cols-[1.35fr_0.65fr] lg:p-6">
              <div>
                <h3 className="flex items-center gap-2 font-semibold"><Package size={18} className="text-hooma-accent" />პროდუქტები</h3>
                <div className="mt-3 divide-y divide-hooma-text/10 rounded-2xl border border-hooma-text/10 bg-white">
                  {orderItems.map((item) => (
                    <div key={item.id} className="flex flex-col justify-between gap-2 p-4 sm:flex-row sm:items-center"><div><p className="font-semibold">{item.product_name || "ინდივიდუალური პროდუქტი"}</p><p className="mt-1 text-xs text-hooma-muted">{[item.size_label, item.material, item.color].filter(Boolean).join(" · ") || "კონფიგურაცია"}</p></div><strong className="text-sm">×{item.quantity}</strong></div>
                  ))}
                  {!orderItems.length ? <p className="p-4 text-sm text-hooma-muted">პროდუქტის მონაცემები ვერ ჩაიტვირთა.</p> : null}
                </div>
                <div className="mt-4 flex flex-wrap gap-3 text-xs text-hooma-muted">
                  <span className="inline-flex items-center gap-1.5"><Clock3 size={14} />{order.promised_at ? `სავარაუდო მიწოდება: ${dateFormat.format(new Date(order.promised_at))}` : "3 სამუშაო დღე შეკვეთიდან მიწოდებამდე"}</span>
                  {order.fulfillment_status === "out_for_delivery" ? <span className="inline-flex items-center gap-1.5 font-semibold text-hooma-text"><Truck size={14} />საკურიერო მომსახურებასთანაა</span> : null}
                </div>
              </div>

              <div>
                <h3 className="font-semibold">სტატუსის ისტორია</h3>
                <ol className="mt-3 space-y-3">
                  {events.slice().reverse().map((event) => (
                    <li key={event.id} className="border-l-2 border-hooma-accent/35 pl-3"><p className="text-sm font-medium">{event.customer_label_ka}</p><time className="mt-1 block text-xs text-hooma-muted">{dateFormat.format(new Date(event.created_at))}</time></li>
                  ))}
                  {!events.length ? <li className="text-sm text-hooma-muted">შეკვეთა მიღებულია.</li> : null}
                </ol>
              </div>
            </div>
          </article>
        );
      })}

      {!orders.length ? (
        <div className="rounded-[2rem] border border-dashed border-hooma-text/15 bg-white/55 px-6 py-16 text-center"><Package className="mx-auto text-hooma-muted" /><p className="mt-4 font-semibold">შეკვეთა ჯერ არ გაქვს</p><p className="mt-2 text-sm text-hooma-muted">შეკვეთის გაფორმების შემდეგ მისი ეტაპები აქ გამოჩნდება.</p></div>
      ) : null}
    </div>
  );
}
