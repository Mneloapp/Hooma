export default function AccountOrdersPage() {
  return (
    <div className="rounded-[2rem] bg-white/75 p-6 shadow-soft">
      <p className="text-xs uppercase tracking-[0.28em] text-hooma-muted">Orders</p>
      <h1 className="mt-3 text-4xl font-medium">Your orders</h1>
      <p className="mt-4 text-hooma-muted">Customers can only read their own orders through Supabase RLS. Order history will appear here after requests are submitted.</p>
    </div>
  );
}
