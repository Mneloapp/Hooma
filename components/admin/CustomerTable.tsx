type CustomerListItem = { id: string; fullName: string | null; email: string | null; phone: string | null; provider: string; orders: number; createdAt: string };
const dateFormatter = new Intl.DateTimeFormat("ka-GE", { dateStyle: "medium", timeStyle: "short" });

export function CustomerTable({ customers }: { customers: CustomerListItem[] }) {
  return (
    <div className="rounded-[1.5rem] bg-white/75 p-6 shadow-soft">
      <div className="mb-5 flex items-center justify-between gap-4"><div><p className="text-sm text-hooma-muted">სულ მომხმარებელი</p><strong className="text-2xl">{customers.length}</strong></div><span className="rounded-full bg-emerald-100 px-3 py-1.5 text-xs font-semibold text-emerald-800">Auth სინქრონიზებულია</span></div>
      <div className="overflow-x-auto">
        <table className="min-w-[860px] w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-[0.18em] text-hooma-muted">
            <tr>
              <th className="py-3">მომხმარებელი</th><th className="py-3">ელფოსტა</th><th className="py-3">ტელეფონი</th><th className="py-3">შესვლა</th><th className="py-3">შეკვეთები</th><th className="py-3">რეგისტრაცია</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hooma-text/10">
            {customers.length ? customers.map((customer) => <tr key={customer.id}>
              <td className="py-4 pr-4 font-medium">{customer.fullName || "სახელი არ არის მითითებული"}</td><td className="py-4 pr-4 text-hooma-muted">{customer.email || "—"}</td><td className="py-4 pr-4">{customer.phone || <span className="text-hooma-muted">არ არის მითითებული</span>}</td><td className="py-4 pr-4"><span className="rounded-full bg-hooma-panel px-3 py-1 text-xs font-semibold">{customer.provider === "google" ? "Google" : "Email"}</span></td><td className="py-4 pr-4 font-semibold">{customer.orders}</td><td className="py-4 text-xs text-hooma-muted">{dateFormatter.format(new Date(customer.createdAt))}</td>
            </tr>) : <tr><td className="py-8 text-center text-hooma-muted" colSpan={6}>მომხმარებელი ჯერ არ არის რეგისტრირებული.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
