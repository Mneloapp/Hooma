export function OrderTable() {
  return (
    <div className="rounded-[1.5rem] bg-white/75 p-6 shadow-soft">
      <div className="overflow-x-auto">
        <table className="min-w-[720px] w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-[0.18em] text-hooma-muted">
            <tr>
              <th className="py-3">Order</th>
              <th className="py-3">Customer</th>
              <th className="py-3">Status</th>
              <th className="py-3">Payment</th>
              <th className="py-3">Total</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-hooma-text/10">
              <td className="py-6 text-hooma-muted" colSpan={5}>Orders from Supabase will appear here after checkout requests are submitted.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
