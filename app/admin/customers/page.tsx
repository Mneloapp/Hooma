import { CustomerTable } from "@/components/admin/CustomerTable";

export default function AdminCustomersPage() {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.28em] text-hooma-muted">People</p>
        <h1 className="mt-3 text-4xl font-medium">Customers</h1>
      </div>
      <CustomerTable />
    </div>
  );
}
