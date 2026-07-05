import { InventoryEditor } from "@/components/admin/InventoryEditor";
import { createInventorySeedRows } from "@/lib/inventory";

export default function AdminInventoryPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.28em] text-hooma-muted">Stock control</p>
        <h1 className="mt-3 text-4xl font-medium">Inventory</h1>
      </div>
      <InventoryEditor rows={createInventorySeedRows()} />
    </div>
  );
}
