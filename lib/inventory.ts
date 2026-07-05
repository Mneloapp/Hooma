import { products } from "@/data/products";
import type { StockStatus } from "@/lib/supabase/types";

export type InventoryDisplayRow = {
  id: string;
  product_id: string;
  variant_id: string;
  product_name: string;
  sku: string;
  size_label: string;
  color: string;
  fabric: string;
  orientation: string;
  quantity_available: number;
  quantity_reserved: number;
  quantity_sold: number;
  low_stock_threshold: number;
  stock_status: StockStatus;
};

export const stockStatusLabels: Record<StockStatus, string> = {
  in_stock: "In Stock",
  low_stock: "Low Stock",
  preorder: "Pre-order",
  out_of_stock: "Out of Stock",
  coming_soon: "Coming Soon",
};

export function createInventorySeedRows(): InventoryDisplayRow[] {
  return products.flatMap((product) =>
    product.variants.map((variant) => ({
      id: `${product.id}-${variant.id}-${variant.availableColors[0] ?? "TBD"}-${variant.availableFabrics[0] ?? "TBD"}`,
      product_id: product.id,
      variant_id: variant.id,
      product_name: product.hoomaName,
      sku: variant.sku,
      size_label: variant.sizeLabel,
      color: variant.availableColors[0] ?? "TBD",
      fabric: variant.availableFabrics[0] ?? "TBD",
      orientation: "Standard",
      quantity_available: 0,
      quantity_reserved: 0,
      quantity_sold: 0,
      low_stock_threshold: 3,
      stock_status: "coming_soon" as StockStatus,
    })),
  );
}
