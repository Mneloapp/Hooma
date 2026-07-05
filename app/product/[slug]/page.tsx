import Image from "next/image";
import { notFound } from "next/navigation";
import { getProductBySlug, getRelatedProducts, products } from "@/data/products";
import { Badge } from "@/components/Badge";
import { FAQAccordion } from "@/components/FAQAccordion";
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
        <div>
          <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-hooma-panel">
            <Image src={product.heroImage} alt={product.hoomaName} fill priority className="object-cover" sizes="(min-width: 1024px) 55vw, 100vw" />
          </div>
          <div className="mt-4 grid grid-cols-2 gap-4">
            {product.galleryImages.map((image) => (
              <div key={image} className="relative aspect-[4/3] overflow-hidden rounded-xl bg-hooma-panel">
                <Image src={image} alt={product.hoomaName} fill className="object-cover" sizes="(min-width: 1024px) 25vw, 50vw" />
              </div>
            ))}
          </div>
        </div>
        <div>
          <Badge>{product.category}</Badge>
          <h1 className="mt-4 text-4xl font-semibold md:text-6xl">{product.hoomaName}</h1>
          <p className="mt-4 text-lg leading-8 text-hooma-muted">{product.shortDescription}</p>
          <div className="mt-5 grid grid-cols-2 gap-3 rounded-2xl bg-white p-4 text-sm">
            <span className="text-hooma-muted">Original model</span><span className="text-right">{product.originalModelCode} {product.originalName}</span>
            <span className="text-hooma-muted">Dimensions</span><span className="text-right">{defaultVariant.productDimensionsCm}</span>
            <span className="text-hooma-muted">Packing size</span><span className="text-right">{defaultVariant.packingDimensionsCm}</span>
            <span className="text-hooma-muted">Gross weight</span><span className="text-right">{defaultVariant.grossWeightKg}</span>
            <span className="text-hooma-muted">Delivery</span><span className="text-right">{product.deliveryEstimate}</span>
          </div>
          <div className="mt-8"><ProductConfigurator product={product} /></div>
        </div>
      </div>
      <div className="mt-20 grid gap-10 lg:grid-cols-3">
        {[
          ["Description", product.longDescription],
          ["Compressed delivery", "Your selected model arrives in compact packaging, then expands after opening into full-size comfort."],
          ["Care guide", "Vacuum gently, rotate cushions where applicable, and blot spills promptly with a clean dry cloth. Confirm fabric-specific care before cleaning."],
        ].map(([title, copy]) => (
          <div key={title} className="rounded-2xl bg-white p-6">
            <h2 className="text-xl font-semibold">{title}</h2>
            <p className="mt-3 text-sm leading-6 text-hooma-muted">{copy}</p>
          </div>
        ))}
      </div>
      <div className="mx-auto mt-20 max-w-4xl">
        <SectionTitle title="Product FAQ" />
        <FAQAccordion />
      </div>
      <div className="mt-20">
        <SectionTitle title="Related products" />
        <ProductGrid products={getRelatedProducts(product)} />
      </div>
    </section>
  );
}
