import { notFound } from "next/navigation";
import { Clock3, Factory, ShieldCheck } from "lucide-react";
import { getProductBySlug, getRelatedProducts, products } from "@/data/products";
import { ProductImageGallery } from "@/components/ProductImageGallery";
import { ProductConfigurator } from "@/components/ProductConfigurator";
import { ProductGrid } from "@/components/ProductGrid";
import { SectionTitle } from "@/components/SectionTitle";

export function generateStaticParams() {
  return products.map((product) => ({ slug: product.slug }));
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = getProductBySlug(slug);
  if (!product) notFound();
  const defaultVariant = product.variants[0];

  return (
    <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr]">
        <ProductImageGallery images={[product.heroImage, ...product.galleryImages]} name={product.nameKa} />
        <div>
          <div className="flex flex-wrap gap-2 text-xs"><span className="rounded-full bg-hooma-panel px-3 py-1.5">{product.category}</span><span className="rounded-full bg-hooma-panel px-3 py-1.5">{product.subcategory}</span></div>
          <h1 className="mt-5 text-4xl font-semibold tracking-tight md:text-6xl">{product.nameKa}</h1>
          <p className="mt-4 text-lg leading-8 text-hooma-muted">{product.shortDescriptionKa}</p>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {[
              [Clock3, "მზადება", `${product.leadTimeDays} სამუშაო დღე`],
              [Factory, "წარმოება", "თბილისი"],
              [ShieldCheck, "კონტროლი", "ოპერატორის შემოწმება"],
            ].map(([Icon, label, value]) => {
              const DetailIcon = Icon as typeof Clock3;
              return <div key={String(label)} className="rounded-2xl border border-hooma-text/10 bg-white/65 p-4"><DetailIcon size={18} className="text-hooma-accent" /><p className="mt-5 text-xs text-hooma-muted">{String(label)}</p><p className="mt-1 text-sm font-medium">{String(value)}</p></div>;
            })}
          </div>
          <div className="mt-8"><ProductConfigurator product={product} /></div>
        </div>
      </div>

      <div className="mt-20 grid gap-5 lg:grid-cols-3">
        {[
          ["პროდუქტის შესახებ", product.shortDescriptionKa],
          ["ტექნიკური მონაცემები", `ზომები: ${defaultVariant.productDimensionsCm}. მასალა და ფერი ირჩევა შეკვეთისას. საბოლოო სპეციფიკაცია დასტურდება სატესტო ბეჭდვის შემდეგ.`],
          ["უსაფრთხოება და მოვლა", "არ მოათავსოთ მაღალი ტემპერატურის ან ღია ცეცხლის სიახლოვეს. საბავშვო და საკვებთან დაკავშირებული პროდუქტები გამოქვეყნდება მხოლოდ შესაბამისი გამოყენების შემოწმების შემდეგ."],
        ].map(([title, copy]) => <div key={title} className="rounded-[1.5rem] border border-hooma-text/10 bg-white/65 p-6"><h2 className="text-xl font-semibold">{title}</h2><p className="mt-3 text-sm leading-6 text-hooma-muted">{copy}</p></div>)}
      </div>

      <div className="mt-20">
        <SectionTitle title="მსგავსი პროდუქტები" />
        <ProductGrid products={getRelatedProducts(product)} />
      </div>
    </section>
  );
}
