import { InventoryTable } from "./InventoryTable";
import type { InventoryDisplayRow } from "@/lib/inventory";

export function InventoryEditor({ rows }: { rows: InventoryDisplayRow[] }) {
  return <InventoryTable rows={rows} />;
}
