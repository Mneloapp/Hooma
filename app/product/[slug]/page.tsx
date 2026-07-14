import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, ChevronRight, Clock3, Factory, ShieldCheck, Truck } from "lucide-react";
import { ProductImageGallery } from "@/components/ProductImageGallery";
import { ProductConfigurator } from "@/components/ProductConfigurator";
import { ProductShelf } from "@/components/ProductShelf";
import { getStorefrontCatalog, getStorefrontProductBySlug } from "@/lib/storefront-catalog";

export const dynamic = "force-dynamic";

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [product, products] = await Promise.all([getStorefrontProductBySlug(slug), getStorefrontCatalog()]);
  if (!product) notFound();
  const defaultVariant = product.variants[0];
  const related = products.filter((item) => item.category === product.category && item.id !== product.id).slice(0, 3);
  const recommendations = related.length >= 3 ? related : products.filter((item) => item.id !== product.id).slice(0, 5);

  return (
    <main className="mx-auto max-w-[1480px] px-4 py-6 sm:px-6 lg:px-8">
      <nav aria-label="Breadcrumb" className="mb-5 flex items-center gap-1.5 overflow-x-auto text-xs text-hooma-muted hide-scrollbar"><Link href="/" className="hover:text-hooma-text">მთავარი</Link><ChevronRight size={13} /><Link href="/shop" className="hover:text-hooma-text">კატალოგი</Link><ChevronRight size={13} /><Link href={`/shop?category=${product.categorySlug}`} className="hover:text-hooma-text">{product.category}</Link><ChevronRight size={13} /><span className="truncate text-hooma-text">{product.nameKa}</span></nav>

      <section className="grid items-start gap-7 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,0.9fr)_330px] xl:gap-10">
        <ProductImageGallery images={[product.heroImage, ...product.galleryImages]} name={product.nameKa} />

        <div className="min-w-0">
          <Link href={`/shop?category=${product.categorySlug}`} className="text-xs font-semibold uppercase tracking-[0.16em] text-hooma-accent hover:underline">{product.category}</Link>
          <h1 className="mt-3 text-3xl font-semibold leading-tight tracking-[-0.03em] sm:text-4xl">{product.nameKa}</h1>
          <p className="mt-4 text-base leading-7 text-hooma-muted">{product.shortDescriptionKa}</p>
          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 border-y border-hooma-text/10 py-4 text-sm"><span className="font-medium">SKU: {defaultVariant.sku}</span><span className="text-hooma-muted">{product.isOrderable ? "წარმოებისთვის დამტკიცებული" : "კატალოგის სატესტო პროდუქტი"}</span></div>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {[[Clock3, "ვადა", `${product.leadTimeDays} სამუშაო დღე შეკვეთიდან მიწოდებამდე`], [Factory, "წარმოება", "თბილისი"], [Truck, "მიწოდება", "ტრეკინგით"]].map(([Icon, label, value]) => { const DetailIcon = Icon as typeof Clock3; return <div key={String(label)} className="rounded-xl border border-hooma-text/10 bg-white/65 p-4"><DetailIcon size={17} className="text-hooma-accent" /><p className="mt-3 text-xs text-hooma-muted">{String(label)}</p><p className="mt-1 text-sm font-medium">{String(value)}</p></div>; })}
          </div>

          <div className="mt-8">
            <h2 className="text-xl font-semibold">პროდუქტის შესახებ</h2>
            <p className="mt-3 text-sm leading-7 text-hooma-muted">{product.shortDescriptionKa} პროდუქტი მზადდება მხოლოდ შეკვეთის დადასტურების შემდეგ. ფერი და მასალა შეგიძლია აირჩიო შესყიდვის ბლოკში.</p>
            <ul className="mt-5 grid gap-3 text-sm">{["ზომა: " + defaultVariant.productDimensionsCm, "მასალები: " + product.availableMaterials.join(", "), "ხელმისაწვდომი ფერები: " + product.availableColors.join(", "), "საბოლოო სპეციფიკაცია დასტურდება სატესტო ბეჭდვის შემდეგ"].map((item) => <li key={item} className="flex gap-2.5"><Check size={16} className="mt-0.5 shrink-0 text-hooma-accent" />{item}</li>)}</ul>
          </div>

          <div className="mt-8 rounded-2xl bg-hooma-panel p-5"><div className="flex items-center gap-2"><ShieldCheck size={18} className="text-hooma-accent" /><h2 className="font-semibold">უსაფრთხოება და მოვლა</h2></div><p className="mt-3 text-sm leading-6 text-hooma-muted">არ მოათავსოთ მაღალი ტემპერატურის ან ღია ცეცხლის სიახლოვეს. საბავშვო და საკვებთან დაკავშირებული პროდუქტები გამოქვეყნდება მხოლოდ შესაბამისი გამოყენების შემოწმების შემდეგ.</p></div>
        </div>

        <ProductConfigurator product={product} />
      </section>

      <div className="mt-14"><ProductShelf title="მსგავსი პროდუქტები" products={recommendations} href={`/shop?category=${product.categorySlug}`} /></div>
    </main>
  );
}
