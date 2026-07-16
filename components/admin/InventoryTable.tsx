"use client";

import { useMemo, useState } from "react";
import type { InventoryDisplayRow } from "@/lib/inventory";
import { stockStatusLabels } from "@/lib/inventory";
import type { StockStatus } from "@/lib/supabase/types";
import { StockBadge } from "@/components/inventory/StockBadge";

export function InventoryTable({ rows }: { rows: InventoryDisplayRow[] }) {
  const [localRows, setLocalRows] = useState(rows);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StockStatus | "all">("all");
  const filtered = useMemo(
    () =>
      localRows.filter((row) => {
        const matchesQuery = `${row.product_name} ${row.sku} ${row.color} ${row.material}`.toLowerCase().includes(query.toLowerCase());
        const matchesStatus = status === "all" || row.stock_status === status;
        return matchesQuery && matchesStatus;
      }),
    [localRows, query, status],
  );

  const updateRow = (id: string, patch: Partial<InventoryDisplayRow>) => {
    setLocalRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 rounded-[1.5rem] bg-white/70 p-4 sm:flex-row">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search product, SKU, color, material" className="min-h-11 flex-1 rounded-full border border-hooma-text/10 bg-white px-4 text-sm outline-none focus:border-hooma-accent" />
        <select value={status} onChange={(event) => setStatus(event.target.value as StockStatus | "all")} className="min-h-11 rounded-full border border-hooma-text/10 bg-white px-4 text-sm outline-none focus:border-hooma-accent">
          <option value="all">All statuses</option>
          {Object.entries(stockStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>
      <div className="overflow-hidden rounded-[1.5rem] bg-white/75 shadow-soft">
        <div className="overflow-x-auto">
          <table className="min-w-[980px] w-full text-left text-sm">
            <thead className="bg-hooma-panel text-xs uppercase tracking-[0.18em] text-hooma-muted">
              <tr>
                <th className="px-5 py-4">Product</th>
                <th className="px-5 py-4">SKU</th>
                <th className="px-5 py-4">Combination</th>
                <th className="px-5 py-4">Available</th>
                <th className="px-5 py-4">Low threshold</th>
                <th className="px-5 py-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hooma-text/10">
              {filtered.map((row) => (
                <tr key={row.id}>
                  <td className="px-5 py-4 font-medium">{row.product_name}<span className="block text-xs text-hooma-muted">{row.size_label}</span></td>
                  <td className="px-5 py-4 text-hooma-muted">{row.sku}</td>
                  <td className="px-5 py-4 text-hooma-muted">{row.material} / {row.color}</td>
                  <td className="px-5 py-4"><input type="number" value={row.quantity_available} onChange={(event) => updateRow(row.id, { quantity_available: Number(event.target.value) })} className="w-24 rounded-full border border-hooma-text/10 px-3 py-2" /></td>
                  <td className="px-5 py-4"><input type="number" value={row.low_stock_threshold} onChange={(event) => updateRow(row.id, { low_stock_threshold: Number(event.target.value) })} className="w-24 rounded-full border border-hooma-text/10 px-3 py-2" /></td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <select value={row.stock_status} onChange={(event) => updateRow(row.id, { stock_status: event.target.value as StockStatus })} className="rounded-full border border-hooma-text/10 px-3 py-2">
                        {Object.entries(stockStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                      <StockBadge status={row.stock_status} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
