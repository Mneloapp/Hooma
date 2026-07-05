import { cn } from "@/lib/utils";
import type { StockStatus } from "@/lib/supabase/types";

const labels: Record<StockStatus, string> = {
  in_stock: "In Stock",
  low_stock: "Low Stock",
  preorder: "Pre-order",
  out_of_stock: "Out of Stock",
  coming_soon: "Coming Soon",
};

const styles: Record<StockStatus, string> = {
  in_stock: "bg-green-50 text-green-700",
  low_stock: "bg-amber-50 text-amber-700",
  preorder: "bg-blue-50 text-blue-700",
  out_of_stock: "bg-red-50 text-red-700",
  coming_soon: "bg-hooma-panel text-hooma-muted",
};

export function StockBadge({ status, className }: { status: StockStatus; className?: string }) {
  return <span className={cn("inline-flex rounded-full px-3 py-1 text-xs font-medium", styles[status], className)}>{labels[status]}</span>;
}

export function getStockMessage({
  stock_status,
  quantity_available,
  low_stock_threshold,
}: {
  stock_status: StockStatus;
  quantity_available: number;
  low_stock_threshold: number;
}) {
  if (stock_status === "preorder") return "Pre-order available";
  if (stock_status === "out_of_stock") return "This combination is currently out of stock";
  if (stock_status === "coming_soon") return "Inventory coming soon";
  if (quantity_available > 0 && quantity_available <= low_stock_threshold) return `Only ${quantity_available} left`;
  return "Ready to request";
}
