import Link from "next/link";

const items = [
  ["/admin", "Dashboard"],
  ["/admin/products", "Products"],
  ["/admin/inventory", "Inventory"],
  ["/admin/orders", "Orders"],
  ["/admin/customers", "Customers"],
  ["/admin/settings", "Settings"],
];

export function AdminSidebar() {
  return (
    <aside className="hidden w-64 shrink-0 border-r border-hooma-text/10 bg-white/65 p-6 lg:block">
      <Link href="/" className="text-2xl font-semibold tracking-tight">Hooma</Link>
      <nav className="mt-10 space-y-1">
        {items.map(([href, label]) => (
          <Link key={href} href={href} className="block rounded-full px-4 py-3 text-sm text-hooma-muted transition hover:bg-hooma-panel hover:text-hooma-text">
            {label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
