import Link from "next/link";
import { hasPermission, type Permission } from "@/lib/auth/permissions";
import type { Profile } from "@/lib/supabase/types";

export const adminNavItems: Array<[string, string, Permission]> = [
  ["/admin", "მთავარი", "admin.access"],
  ["/admin/products", "პროდუქტები", "catalog.manage"],
  ["/admin/reviews", "შეფასებები", "catalog.manage"],
  ["/admin/catalog-agent", "Catalog Agent", "catalog.manage"],
  ["/admin/inventory", "მარაგები", "inventory.manage"],
  ["/admin/orders", "შეკვეთების კანბანი", "orders.manage"],
  ["/admin/custom-orders", "ინდივიდუალური ფასები", "quotes.manage"],
  ["/admin/production", "წარმოება", "production.manage"],
  ["/admin/erp", "ERP და ფინანსები", "finance.manage"],
  ["/admin/customers", "მომხმარებლები", "customers.read"],
  ["/admin/settings", "ფასის პარამეტრები", "pricing.manage"],
  ["/admin/team", "გუნდი და უფლებები", "team.manage"],
];

export function AdminSidebar({ profile }: { profile: Profile | null }) {
  const visibleItems = profile ? adminNavItems.filter(([, , permission]) => hasPermission(profile.role, permission)) : adminNavItems;
  return (
    <aside className="hidden w-64 shrink-0 border-r border-hooma-text/10 bg-white/65 p-6 lg:block">
      <Link href="/" className="text-2xl font-semibold tracking-tight">Hooma</Link>
      <nav className="mt-10 space-y-1">
        {visibleItems.map(([href, label]) => (
          <Link key={href} href={href} className="block rounded-full px-4 py-3 text-sm text-hooma-muted transition hover:bg-hooma-panel hover:text-hooma-text">
            {label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
