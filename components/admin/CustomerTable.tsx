export function CustomerTable() {
  return (
    <div className="rounded-[1.5rem] bg-white/75 p-6 shadow-soft">
      <div className="overflow-x-auto">
        <table className="min-w-[680px] w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-[0.18em] text-hooma-muted">
            <tr>
              <th className="py-3">Customer</th>
              <th className="py-3">Email</th>
              <th className="py-3">Phone</th>
              <th className="py-3">Orders</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-hooma-text/10">
              <td className="py-6 text-hooma-muted" colSpan={4}>Customer profiles will sync here from Supabase Auth signups.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
