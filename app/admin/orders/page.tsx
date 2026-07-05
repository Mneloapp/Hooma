import { OrderDetail } from "@/components/admin/OrderDetail";
import { OrderTable } from "@/components/admin/OrderTable";

export default function AdminOrdersPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.28em] text-hooma-muted">Fulfillment</p>
        <h1 className="mt-3 text-4xl font-medium">Orders</h1>
      </div>
      <OrderTable />
      <OrderDetail />
    </div>
  );
}
