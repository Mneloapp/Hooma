import { Activity, ClipboardCheck, Factory, LayoutDashboard } from "lucide-react";
import { redirect } from "next/navigation";
import { OrderOperationsKanban, type OperationsKanbanCard } from "@/components/admin/OrderOperationsKanban";
import { hasPermission } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { requirePermission } from "@/lib/supabase/server";

type Order = {
  id: string;
  customer_id: string | null;
  guest_email: string | null;
  guest_phone: string | null;
  payment_status: string;
  total: number | string | null;
  delivery_address: Record<string, unknown> | null;
  fulfillment_status: string;
  tracking_code: string | null;
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
type PrintJob = { order_item_id: string; status: string };

const dateFormat = new Intl.DateTimeFormat("ka-GE", { dateStyle: "medium", timeStyle: "short" });

function addressText(address: Record<string, unknown> | null) {
  if (!address) return "მისამართი არ არის მითითებული";
  return [address.city, address.address_line_1, address.address_line_2]
    .filter((value): value is string => typeof value === "string" && Boolean(value))
    .join(", ") || "მისამართი არ არის მითითებული";
}

function addressMapUrl(address: Record<string, unknown> | null) {
  const value = address?.google_maps_url;
  return typeof value === "string" && value.startsWith("https://www.google.com/maps/") ? value : null;
}

export default async function AdminOrdersPage() {
  const profile = await requirePermission("orders.manage");
  if (isSupabaseConfigured() && !profile) redirect("/login?next=/admin/orders");
  const canMove = Boolean(profile && hasPermission(profile.role, "production.manage"));
  const admin = createAdminClient() as any;

  const { data: orderRows, error: orderError } = admin ? await admin
    .from("orders")
    .select("id,customer_id,guest_email,guest_phone,payment_status,total,delivery_address,fulfillment_status,tracking_code,test_mode,created_at")
    .order("created_at", { ascending: false })
    .limit(500) : { data: [], error: null };
  const orders = (orderRows ?? []) as Order[];
  const orderIds = orders.map((order) => order.id);
  const customerIds = orders.map((order) => order.customer_id).filter((id): id is string => Boolean(id));

  const [{ data: itemRows }, { data: customerRows }] = admin ? await Promise.all([
    orderIds.length ? admin.from("order_items").select("id,order_id,product_name,sku,size_label,material,color,quantity").in("order_id", orderIds).order("created_at") : Promise.resolve({ data: [] }),
    customerIds.length ? admin.from("customers").select("id,email,full_name,phone").in("id", customerIds) : Promise.resolve({ data: [] }),
  ]) : [{ data: [] }, { data: [] }];
  const items = (itemRows ?? []) as OrderItem[];
  const itemIds = items.map((item) => item.id);
  const { data: jobRows } = admin && itemIds.length ? await admin.from("print_jobs").select("order_item_id,status").in("order_item_id", itemIds).limit(5000) : { data: [] };
  const jobs = (jobRows ?? []) as PrintJob[];

  const customers = new Map(((customerRows ?? []) as Customer[]).map((customer) => [customer.id, customer]));
  const itemsByOrder = new Map<string, OrderItem[]>();
  for (const item of items) itemsByOrder.set(item.order_id, [...(itemsByOrder.get(item.order_id) ?? []), item]);
  const itemOrder = new Map(items.map((item) => [item.id, item.order_id]));
  const jobsByOrder = new Map<string, PrintJob[]>();
  for (const job of jobs) {
    const orderId = itemOrder.get(job.order_item_id);
    if (orderId) jobsByOrder.set(orderId, [...(jobsByOrder.get(orderId) ?? []), job]);
  }

  const cards: OperationsKanbanCard[] = orders.map((order) => {
    const customer = order.customer_id ? customers.get(order.customer_id) : null;
    const orderItems = itemsByOrder.get(order.id) ?? [];
    const orderJobs = jobsByOrder.get(order.id) ?? [];
    return {
      id: order.id,
      label: `#${order.tracking_code ?? order.id.slice(0, 8).toUpperCase()}`,
      fulfillmentStatus: order.fulfillment_status,
      total: Number(order.total ?? 0),
      createdAtLabel: dateFormat.format(new Date(order.created_at)),
      customerName: customer?.full_name || String(order.delivery_address?.full_name ?? "მომხმარებელი"),
      customerContact: customer?.phone || order.guest_phone || customer?.email || order.guest_email || "კონტაქტი არ არის",
      address: addressText(order.delivery_address),
      mapUrl: addressMapUrl(order.delivery_address),
      paymentReady: order.test_mode || order.payment_status === "paid",
      testMode: order.test_mode,
      items: orderItems.map((item) => ({
        id: item.id,
        name: item.product_name || "ინდივიდუალური პროდუქტი",
        configuration: [item.sku, item.size_label, item.material, item.color].filter(Boolean).join(" · ") || "კონფიგურაცია არ არის",
        quantity: item.quantity,
      })),
      jobs: {
        total: orderJobs.length,
        queued: orderJobs.filter((job) => job.status === "queued").length,
        preparing: orderJobs.filter((job) => job.status === "preparing").length,
        active: orderJobs.filter((job) => ["printing", "paused"].includes(job.status)).length,
        completed: orderJobs.filter((job) => ["completed", "quality_check", "approved"].includes(job.status)).length,
        failed: orderJobs.filter((job) => ["failed", "awaiting_approval"].includes(job.status)).length,
      },
    };
  });

  const incoming = orders.filter((order) => ["order_received", "confirmed"].includes(order.fulfillment_status)).length;
  const active = orders.filter((order) => ["production_queued", "in_production", "quality_check"].includes(order.fulfillment_status)).length;
  const ready = orders.filter((order) => ["ready_for_delivery", "out_for_delivery"].includes(order.fulfillment_status)).length;

  return (
    <div className="space-y-7">
      <div className="flex flex-col justify-between gap-4 xl:flex-row xl:items-end">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-hooma-muted">Order & production operations</p>
          <h1 className="mt-3 text-4xl font-medium">შეკვეთების კანბანი</h1>
          <p className="mt-3 max-w-4xl text-sm leading-6 text-hooma-muted">შეკვეთები მოძრაობს მარცხნიდან მარჯვნივ. ბარათის გადატანა და დადასტურება ქმნის პასუხისმგებელი ოპერატორის აუდიტირებად მოქმედებას; წარმოების ეტაპები კი რეალური print job-ების მდგომარეობას მიჰყვება.</p>
        </div>
        <div className="grid grid-cols-3 gap-3 text-center sm:min-w-[460px]">
          <div className="rounded-2xl bg-white/80 p-4 shadow-sm"><LayoutDashboard size={17} className="mx-auto text-amber-700" /><p className="mt-2 text-xs text-hooma-muted">შემოსული</p><p className="mt-1 text-2xl font-semibold">{incoming}</p></div>
          <div className="rounded-2xl bg-white/80 p-4 shadow-sm"><Factory size={17} className="mx-auto text-blue-700" /><p className="mt-2 text-xs text-hooma-muted">წარმოება</p><p className="mt-1 text-2xl font-semibold">{active}</p></div>
          <div className="rounded-2xl bg-white/80 p-4 shadow-sm"><ClipboardCheck size={17} className="mx-auto text-emerald-700" /><p className="mt-2 text-xs text-hooma-muted">მიწოდება</p><p className="mt-1 text-2xl font-semibold">{ready}</p></div>
        </div>
      </div>

      {orderError ? <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">შეკვეთების წაკითხვა ვერ მოხერხდა. შეამოწმე Supabase კავშირი და migrations.</p> : null}
      <div className="flex items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-950"><Activity size={18} className="mt-1 shrink-0" /><p><strong>ოპერაციული წესი:</strong> შემოსული შეკვეთა, QC, კურიერზე გადაცემა და მიწოდება შეიძლება გადაიტანო ხელით. „წარმოების რიგი → წარმოებაში → QC“ იცვლება მხოლოდ პრინტერის მინიჭების, ფიზიკური გაშვებისა და დასრულების რეალური ჩანაწერებით.</p></div>
      <OrderOperationsKanban cards={cards} canMove={canMove} />
    </div>
  );
}
