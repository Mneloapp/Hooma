import Link from "next/link";
import { CatalogProductTable, type CatalogProductListItem } from "@/components/admin/CatalogProductTable";
import { catalogCategories } from "@/data/catalog";
import { createClient, requirePermission } from "@/lib/supabase/server";

export default async function AdminProductsPage({ searchParams }: { searchParams: Promise<{ q?: string; category?: string }> }) {
  const params = await searchParams;
  const q = (params.q ?? "").toLocaleLowerCase("ka-GE");
  const category = params.category ?? "all";
  const profile = await requirePermission("catalog.manage");
  const supabase = (await createClient()) as any;
  const { data: databaseRows } = supabase ? await supabase.from("products").select("id,slug,hooma_name,name_ka,status,production_status,estimated_print_minutes,material_grams,base_price,categories(slug,name_en,name_ka)").order("created_at", { ascending: false }) : { data: [] };

  const databaseProducts: CatalogProductListItem[] = (databaseRows ?? []).map((row: any) => {
    const categoryRow = Array.isArray(row.categories) ? row.categories[0] : row.categories;
    return { id: row.id, name: row.name_ka || row.hooma_name, slug: row.slug, category: categoryRow?.name_ka || categoryRow?.name_en || "—", categorySlug: categoryRow?.slug || "", subcategory: "", printMinutes: row.estimated_print_minutes, grams: row.material_grams, price: row.base_price === null ? null : Number(row.base_price), production: row.production_status, status: row.status };
  });
  const filtered = databaseProducts.filter((product) => `${product.name} ${product.slug}`.toLocaleLowerCase("ka-GE").includes(q) && (category === "all" || product.categorySlug === category));
  const canDelete = Boolean(profile && ["owner", "admin", "catalog_manager"].includes(profile.role));

  return <div className="space-y-6"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-xs uppercase tracking-[0.28em] text-hooma-muted">Catalog</p><h1 className="mt-3 text-4xl font-medium">პროდუქტები</h1><p className="mt-2 text-sm text-hooma-muted">{`${databaseProducts.length} პროდუქტი Supabase კატალოგში`}</p></div><Link href="/admin/products/new" className="rounded-full bg-hooma-text px-5 py-3 text-sm font-medium text-white">ახალი პროდუქტი</Link></div>
    <form className="flex flex-col gap-3 rounded-[1.5rem] bg-white/70 p-4 sm:flex-row"><input name="q" defaultValue={params.q} placeholder="პროდუქტის ძიება" className="min-h-11 flex-1 rounded-full border border-hooma-text/10 px-4 outline-none focus:border-hooma-accent" /><select name="category" defaultValue={category} className="min-h-11 rounded-full border border-hooma-text/10 px-4 outline-none focus:border-hooma-accent"><option value="all">ყველა კატეგორია</option>{catalogCategories.map((item) => <option key={item.slug} value={item.slug}>{item.nameKa}</option>)}</select><button className="rounded-full border border-hooma-text/10 px-5 py-3 text-sm font-medium">ფილტრი</button></form>
    {filtered.length ? <CatalogProductTable products={filtered} canDelete={canDelete} /> : <div className="rounded-[1.5rem] border border-dashed border-hooma-text/15 bg-white/60 px-6 py-14 text-center"><p className="font-semibold">Supabase კატალოგში პროდუქტი ჯერ არ არის</p><p className="mt-2 text-sm text-hooma-muted">დაამატე პირველი პროდუქტი ან გაასუფთავე ძიების ფილტრი.</p></div>}
  </div>;
}
