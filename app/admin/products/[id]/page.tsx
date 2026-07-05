import { notFound } from "next/navigation";
import { ProductEditor } from "@/components/admin/ProductEditor";
import { VariantEditor } from "@/components/admin/VariantEditor";
import { products } from "@/data/products";

export default async function AdminProductDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const product = products.find((item) => item.id === id || item.slug === id);
  if (!product) notFound();

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.28em] text-hooma-muted">Edit product</p>
        <h1 className="mt-3 text-4xl font-medium">{product.hoomaName}</h1>
      </div>
      <section className="rounded-[2rem] bg-white/75 p-6 shadow-soft">
        <h2 className="mb-5 text-xl font-medium">Product information</h2>
        <ProductEditor product={product} />
      </section>
      <section className="rounded-[2rem] bg-white/75 p-6 shadow-soft">
        <h2 className="mb-5 text-xl font-medium">Variants</h2>
        <VariantEditor variants={product.variants} />
      </section>
      <section className="rounded-[2rem] bg-white/75 p-6 shadow-soft">
        <h2 className="text-xl font-medium">Images and tags</h2>
        <p className="mt-3 text-hooma-muted">Gallery images: {product.galleryImages.length}. Tags: {product.tags.join(", ") || "TBD"}.</p>
      </section>
    </div>
  );
}
