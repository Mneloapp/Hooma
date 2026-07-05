import { products } from "@/data/products";
import { createInventorySeedRows } from "@/lib/inventory";

export default function AdminDashboard() {
  const inventory = createInventorySeedRows();
  const cards = [
    ["Total products", products.length],
    ["Active products", products.length],
    ["Low stock items", inventory.filter((row) => row.stock_status === "low_stock").length],
    ["Pending orders", 0],
    ["Total sales", "Placeholder"],
  ];

  return (
    <div className="space-y-8">
      <div>
        <p className="text-xs uppercase tracking-[0.28em] text-hooma-muted">Commerce backend</p>
        <h1 className="mt-3 text-4xl font-medium">Admin dashboard</h1>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {cards.map(([label, value]) => (
          <div key={label} className="rounded-[1.5rem] bg-white/75 p-5 shadow-soft">
            <p className="text-sm text-hooma-muted">{label}</p>
            <p className="mt-4 text-3xl font-medium">{value}</p>
          </div>
        ))}
      </div>
      <div className="rounded-[2rem] bg-white/75 p-6 shadow-soft">
        <h2 className="text-xl font-medium">Supabase status</h2>
        <p className="mt-3 max-w-2xl text-hooma-muted">Tables, RLS policies, Auth trigger, and inventory reservation RPCs are defined in the migration. Connect environment variables to make this panel live.</p>
      </div>
    </div>
  );
}
