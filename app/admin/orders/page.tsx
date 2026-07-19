import { randomUUID } from "node:crypto";
import { CalendarClock, MapPin, PackageCheck, ShieldCheck, UserRound } from "lucide-react";
import { redirect } from "next/navigation";
import { confirmOrderForProductionAction } from "./actions";
import { hasPermission } from "@/lib/auth/permissions";
import { fulfillmentLabels } from "@/lib/production/manual-workflow";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { requirePermission } from "@/lib/supabase/server";

type Order = {
  id: string;
  customer_id: string | null;
  guest_email: string | null;
  guest_phone: string | null;
  status: string;
  payment_status: string;
  total: number | string | null;
  delivery_address: Record<string, unknown> | null;
  notes: string | null;
  fulfillment_status: string;
  tracking_code: string | null;
  promised_at: string | null;
  test_mode: boolean;
  created_at: string;
};

type OrderItem = {
  id: string;
  order_id: string;
  product_name: string | null;
  sku: string | null;
  size_label: string | null;
  material: string | null;
  color: string | null;
  quantity: number;
};

type Customer = { id: string; email: string | null; full_name: string | null; phone: string | null };

const dateFormat = new Intl.DateTimeFormat("ka-GE", { dateStyle: "medium", timeStyle: "short" });
const money = new Intl.NumberFormat("ka-GE", { style: "currency", currency: "GEL" });

function addressText(address: Record<string, unknown> | null) {
  if (!address) return "მისამართი არ არის მითითებული";
  return [address.city, address.address_line_1].filter((value): value is string => typeof value === "string" && Boolean(value)).join(", ") || "მისამართი არ არის მითითებული";
}

function addressMapUrl(address: Record<string, unknown> | null) {
  if (!address) return null;
  return typeof address.google_maps_url === "string" && address.google_maps_url.startsWith("https://www.google.com/maps/") ? address.google_maps_url : null;
}

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const params = await searchParams;
  const profile = await requirePermission("orders.manage");
  if (isSupabaseConfigured() && !profile) redirect("/login?next=/admin/orders");
  const canConfirmProduction = Boolean(profile && hasPermission(profile.role, "production.manage"));
  const admin = createAdminClient() as any;

  const { data: orderRows, error: orderError } = admin
    ? await admin
      .from("orders")
      .select("id,customer_id,guest_email,guest_phone,status,payment_status,total,delivery_address,notes,fulfillment_status,tracking_code,promised_at,test_mode,created_at")
      .order("created_at", { ascending: false })
      .limit(100)
    : { data: [], error: null };
  const orders = (orderRows ?? []) as Order[];
  const orderIds = orders.map((order) => order.id);
  const customerIds = orders.map((order) => order.customer_id).filter((id): id is string => Boolean(id));

  const [{ data: itemRows }, { data: customerRows }] = admin
    ? await Promise.all([
      orderIds.length
        ? admin.from("order_items").select("id,order_id,product_name,sku,size_label,material,color,quantity").in("order_id", orderIds).order("created_at")
        : Promise.resolve({ data: [] }),
      customerIds.length
        ? admin.from("customers").select("id,email,full_name,phone").in("id", customerIds)
        : Promise.resolve({ data: [] }),
    ])
    : [{ data: [] }, { data: [] }];

  const items = (itemRows ?? []) as OrderItem[];
  const customers = new Map(((customerRows ?? []) as Customer[]).map((customer) => [customer.id, customer]));
  const itemsByOrder = new Map<string, OrderItem[]>();
  for (const item of items) itemsByOrder.set(item.order_id, [...(itemsByOrder.get(item.order_id) ?? []), item]);

  const awaitingConfirmation = orders.filter((order) => ["order_received", "confirmed"].includes(order.fulfillment_status)).length;
  const activeProduction = orders.filter((order) => ["production_queued", "in_production", "quality_check"].includes(order.fulfillment_status)).length;

  return (
    <div className="space-y-7">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-hooma-muted">შეკვეთების კონტროლი</p>
          <h1 className="mt-3 text-4xl font-medium">შეკვეთები</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-hooma-muted">ოპერატორი ამოწმებს პროდუქტს, არჩეულ ფერსა და მასალას, მისამართს და მხოლოდ შემდეგ იწყებს წარმოების პროცესს.</p>
        </div>
        <div className="grid grid-cols-2 gap-3 text-center sm:min-w-80">
          <div className="rounded-2xl bg-white/75 p-4 shadow-sm"><p className="text-xs text-hooma-muted">დასადასტურებელი</p><p className="mt-2 text-2xl font-semibold">{awaitingConfirmation}</p></div>
          <div className="rounded-2xl bg-white/75 p-4 shadow-sm"><p className="text-xs text-hooma-muted">წარმოებაში</p><p className="mt-2 text-2xl font-semibold">{activeProduction}</p></div>
        </div>
      </div>

      {params.notice ? <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{params.notice}</p> : null}
      {params.error ? <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{params.error}</p> : null}
      {orderError ? <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">შეკვეთების წაკითხვა ვერ მოხერხდა. შეამოწმე Supabase migration და server environment.</p> : null}

      <div className="grid gap-5">
        {orders.map((order) => {
          const customer = order.customer_id ? customers.get(order.customer_id) : null;
          const orderItems = itemsByOrder.get(order.id) ?? [];
          const isConfirmable = ["order_received", "confirmed"].includes(order.fulfillment_status);
          const paymentReady = order.test_mode || order.payment_status === "paid";
          return (
            <article key={order.id} className="rounded-[1.6rem] border border-hooma-text/10 bg-white/75 p-5 shadow-sm lg:p-6">
              <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-start">
                <div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-hooma-muted">
                    <span className="font-semibold text-hooma-text">#{order.tracking_code ?? order.id.slice(0, 8).toUpperCase()}</span>
                    <span>•</span>
                    <span>{dateFormat.format(new Date(order.created_at))}</span>
                    {order.test_mode ? <span className="rounded-full bg-amber-100 px-2.5 py-1 font-semibold text-amber-900">TEST</span> : null}
                  </div>
                  <h2 className="mt-3 text-2xl font-semibold">{fulfillmentLabels[order.fulfillment_status] ?? order.fulfillment_status}</h2>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${paymentReady ? "bg-emerald-100 text-emerald-900" : "bg-red-100 text-red-900"}`}>
                    {order.test_mode ? "სატესტო — გადახდა გამორთულია" : order.payment_status === "paid" ? "გადახდილია" : "გადახდას ელოდება"}
                  </span>
                  <span className="rounded-full bg-hooma-panel px-3 py-1.5 text-xs font-semibold">{money.format(Number(order.total ?? 0))}</span>
                </div>
              </div>

              <div className="mt-5 grid gap-3 rounded-2xl bg-hooma-background p-4 text-sm md:grid-cols-3">
                <p className="flex gap-2"><UserRound size={17} className="mt-0.5 shrink-0 text-hooma-accent" /><span><strong className="block">{customer?.full_name || String(order.delivery_address?.full_name ?? "მომხმარებელი")}</strong><span className="text-xs text-hooma-muted">{customer?.phone || order.guest_phone || customer?.email || order.guest_email || "კონტაქტი არ არის"}</span></span></p>
                <p className="flex gap-2"><MapPin size={17} className="mt-0.5 shrink-0 text-hooma-accent" /><span><strong className="block">მიწოდება</strong><span className="text-xs text-hooma-muted">{addressText(order.delivery_address)}</span>{addressMapUrl(order.delivery_address) ? <a href={addressMapUrl(order.delivery_address)!} target="_blank" rel="noreferrer" className="mt-1 block text-xs font-semibold text-hooma-accent underline underline-offset-2">ზუსტი ლოკაცია Google Maps-ზე</a> : null}</span></p>
                <p className="flex gap-2"><CalendarClock size={17} className="mt-0.5 shrink-0 text-hooma-accent" /><span><strong className="block">დაპირებული თარიღი</strong><span className="text-xs text-hooma-muted">{order.promised_at ? dateFormat.format(new Date(order.promised_at)) : "3 სამუშაო დღე"}</span></span></p>
              </div>

              <div className="mt-5 divide-y divide-hooma-text/10 rounded-2xl border border-hooma-text/10 bg-white">
                {orderItems.map((item) => (
                  <div key={item.id} className="flex flex-col justify-between gap-3 p-4 sm:flex-row sm:items-center">
                    <div><p className="font-semibold">{item.product_name || "ინდივიდუალური პროდუქტი"}</p><p className="mt-1 text-xs text-hooma-muted">{[item.sku, item.size_label].filter(Boolean).join(" · ") || "კონფიგურაცია"}</p></div>
                    <p className="text-sm"><span className="text-hooma-muted">ფერი:</span> {item.color || "—"} · <span className="text-hooma-muted">მასალა:</span> {item.material || "—"} · <strong>×{item.quantity}</strong></p>
                  </div>
                ))}
                {!orderItems.length ? <p className="p-4 text-sm text-hooma-muted">შეკვეთის პროდუქტები ვერ მოიძებნა.</p> : null}
              </div>

              {order.notes ? <p className="mt-4 rounded-xl bg-hooma-panel/70 p-3 text-sm"><span className="font-semibold">შენიშვნა:</span> {order.notes}</p> : null}

              {isConfirmable ? (
                <div className="mt-5 flex flex-col justify-between gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 lg:flex-row lg:items-center">
                  <p className="flex max-w-3xl gap-3 text-sm leading-6 text-amber-950"><ShieldCheck size={19} className="mt-0.5 shrink-0" /><span><strong className="block">ადამიანის დადასტურება სავალდებულოა</strong>დადასტურება შექმნის რაოდენობა × plate-ის საბეჭდ სამუშაოებს და მომხმარებელს აჩვენებს „წარმოება დაწყებულია“.</span></p>
                  {canConfirmProduction ? (
                    <form action={confirmOrderForProductionAction}>
                      <input type="hidden" name="order_id" value={order.id} />
                      <input type="hidden" name="operation_key" value={randomUUID()} />
                      <button disabled={!paymentReady || !orderItems.length} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-hooma-text px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"><PackageCheck size={17} />დაადასტურე წარმოება</button>
                    </form>
                  ) : <p className="text-xs font-semibold text-amber-900">წარმოების ოპერატორის უფლებაა საჭირო.</p>}
                </div>
              ) : null}
            </article>
          );
        })}

        {!orders.length ? (
          <div className="rounded-[1.6rem] border border-dashed border-hooma-text/15 bg-white/55 px-6 py-16 text-center">
            <PackageCheck className="mx-auto text-hooma-muted" />
            <p className="mt-4 font-semibold">შეკვეთები ჯერ არ არის</p>
            <p className="mt-2 text-sm text-hooma-muted">ავტორიზებული მომხმარებლის სატესტო შეკვეთა აქ გამოჩნდება.</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
