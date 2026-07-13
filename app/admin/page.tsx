import Link from "next/link";
import { catalogCategories } from "@/data/catalog";
import { products } from "@/data/products";

export default function AdminDashboard() {
  const cards = [
    ["Catalog previews", products.length],
    ["Categories", catalogCategories.length],
    ["Pending imports", 0],
    ["Test orders", 0],
    ["Active print jobs", 0],
  ];

  return <div className="space-y-8"><div><p className="text-xs uppercase tracking-[0.28em] text-hooma-muted">Hooma operations</p><h1 className="mt-3 text-4xl font-medium">Admin dashboard</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-hooma-muted">Catalog, source rights, test orders, production, quality control, and delivery tracking in one operating flow.</p></div><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">{cards.map(([label, value]) => <div key={String(label)} className="rounded-[1.5rem] bg-white/75 p-5 shadow-soft"><p className="text-sm text-hooma-muted">{label}</p><p className="mt-4 text-3xl font-medium">{value}</p></div>)}</div><div className="grid gap-5 lg:grid-cols-3"><Link href="/admin/imports" className="rounded-[1.5rem] border border-hooma-text/10 bg-white/75 p-6 transition hover:-translate-y-1 hover:shadow-soft"><p className="text-xs uppercase tracking-[0.2em] text-hooma-muted">Catalog</p><h2 className="mt-5 text-xl font-medium">Review a source URL</h2><p className="mt-2 text-sm leading-6 text-hooma-muted">Capture creator, commercial rights, media rights, and production data before publication.</p></Link><Link href="/admin/orders" className="rounded-[1.5rem] border border-hooma-text/10 bg-white/75 p-6 transition hover:-translate-y-1 hover:shadow-soft"><p className="text-xs uppercase tracking-[0.2em] text-hooma-muted">Orders</p><h2 className="mt-5 text-xl font-medium">Confirm a test order</h2><p className="mt-2 text-sm leading-6 text-hooma-muted">Validate address, promised date, product configuration, and production readiness.</p></Link><Link href="/admin/production" className="rounded-[1.5rem] border border-hooma-text/10 bg-white/75 p-6 transition hover:-translate-y-1 hover:shadow-soft"><p className="text-xs uppercase tracking-[0.2em] text-hooma-muted">Production</p><h2 className="mt-5 text-xl font-medium">Approve the print queue</h2><p className="mt-2 text-sm leading-6 text-hooma-muted">V1 keeps a human approval gate before any printer command is sent.</p></Link></div><div className="rounded-[2rem] border border-amber-200 bg-amber-50 p-6 text-amber-950"><h2 className="font-medium">Test mode is active</h2><p className="mt-2 text-sm leading-6 text-amber-900/75">No live bank payment and no automatic print start. These are enabled only after end-to-end order, tracking, capacity, and webhook tests pass.</p></div></div>;
}
