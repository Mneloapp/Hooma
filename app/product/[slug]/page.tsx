import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, ChevronRight, Clock3, Factory, FlaskConical, ShieldCheck, Truck } from "lucide-react";
import { ProductImageGallery } from "@/components/ProductImageGallery";
import { ProductConfigurator } from "@/components/ProductConfigurator";
import { ProductShelf } from "@/components/ProductShelf";
import { getDailyDeals } from "@/lib/daily-deals";
import { applyProductCardDeal } from "@/lib/product-card";
import { getAdminPreviewProductById, getStorefrontCatalogPage, getStorefrontProductBySlug } from "@/lib/storefront-catalog";
import { getProductReviewData } from "@/lib/product-reviews";
import { ProductRatingSummary } from "@/components/reviews/ProductRatingSummary";
import { ProductReviewsSection } from "@/components/reviews/ProductReviewsSection";
import { LocalizedText } from "@/components/LocalizedText";
import { getCategory } from "@/data/catalog";

export const dynamic = "force-dynamic";

export default async function ProductPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ preview?: string }> }) {
  const { slug } = await params;
  const { preview: previewId } = await searchParams;
  const [previewProduct, dailyDeals] = await Promise.all([
    previewId ? getAdminPreviewProductById(previewId) : Promise.resolve(null),
    previewId ? Promise.resolve({ deals: [] }) : getDailyDeals(),
  ]);
  if (previewId && (!previewProduct || previewProduct.slug !== slug)) notFound();
  const product = previewProduct ?? await getStorefrontProductBySlug(slug);
  if (!product) notFound();
  const reviewData = await getProductReviewData(product.id);
  const activeDeal = dailyDeals.deals.find((deal) => deal.productId === product.id && deal.dealPrice !== null && deal.originalPrice !== null);
  const dailyDealByProductId = new Map(dailyDeals.deals.map((deal) => [deal.productId, deal]));
  const defaultVariant = product.variants[0];
  const fixedMulticolor = defaultVariant.colorMode === "fixed_multicolor" && defaultVariant.amsRequired;
  const localizedCategory = getCategory(product.categorySlug);
  const recommendationPage = await getStorefrontCatalogPage({
    category: product.categorySlug,
    subcategory: product.subcategorySlug,
    sort: "featured",
    pageSize: 12,
  });
  const recommendations = recommendationPage.products.filter((item) => item.id !== product.id).slice(0, 8);

  return (
    <main className="mx-auto max-w-[1480px] px-4 py-6 sm:px-6 lg:px-8">
      {previewProduct ? <div className="mb-5 flex items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-blue-950"><FlaskConical size={19} className="mt-0.5 shrink-0" /><div><p className="font-semibold"><LocalizedText ka="ადმინის სატესტო Preview" en="Admin test preview" /></p><p className="mt-1 text-sm leading-6 text-blue-900/75"><LocalizedText ka="ეს Draft მხოლოდ ავტორიზებულ თანამშრომელს უჩანს. კალათაში დამატება და შეკვეთა გამორთულია." en="This draft is visible only to authorized staff. Cart and ordering are disabled." /></p></div></div> : null}
      <nav aria-label="Breadcrumb" className="mb-5 flex items-center gap-1.5 overflow-x-auto text-xs text-hooma-muted hide-scrollbar"><Link href="/" className="hover:text-hooma-text"><LocalizedText ka="მთავარი" en="Home" /></Link><ChevronRight size={13} /><Link href="/shop" className="hover:text-hooma-text"><LocalizedText ka="კატალოგი" en="Catalog" /></Link><ChevronRight size={13} /><Link href={`/shop?category=${product.categorySlug}`} className="hover:text-hooma-text"><LocalizedText ka={product.category} en={localizedCategory?.name ?? product.category} /></Link><ChevronRight size={13} /><span className="truncate text-hooma-text"><LocalizedText ka={product.nameKa} en={product.hoomaName} /></span></nav>

      <section className="grid items-start gap-7 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,0.9fr)_330px] xl:gap-10">
        <div><ProductImageGallery images={[product.heroImage, ...product.galleryImages]} name={product.nameKa} />{product.videoUrl ? <div className="mt-4 overflow-hidden rounded-2xl bg-hooma-text"><video src={product.videoUrl} controls preload="metadata" playsInline className="aspect-video w-full object-contain"><LocalizedText ka="თქვენი ბრაუზერი ვიდეოს ვერ აჩვენებს." en="Your browser cannot display this video." /></video></div> : null}</div>

        <div className="min-w-0">
          <Link href={`/shop?category=${product.categorySlug}`} className="text-xs font-semibold uppercase tracking-[0.16em] text-hooma-accent hover:underline"><LocalizedText ka={product.category} en={localizedCategory?.name ?? product.category} /></Link>
          <h1 className="mt-3 text-3xl font-semibold leading-tight tracking-[-0.03em] sm:text-4xl"><LocalizedText ka={product.nameKa} en={product.hoomaName} /></h1>
          <Link href="#reviews" className="mt-3 inline-flex rounded-full border border-hooma-text/10 bg-white/65 px-3 py-2 transition hover:border-hooma-accent/35"><ProductRatingSummary average={product.ratingAverage} ratingCount={product.ratingCount} salesCount={product.salesCount} detailed /></Link>
          <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-2 border-y border-hooma-text/10 py-4 text-sm"><span className="font-medium">SKU: {defaultVariant.sku}</span><span className="text-hooma-muted"><LocalizedText ka={product.isOrderable ? "წარმოებისთვის დამტკიცებული" : "კატალოგის სატესტო პროდუქტი"} en={product.isOrderable ? "Approved for production" : "Catalog test product"} /></span></div>

          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            {[
              [Clock3, "ვადა", "Lead time", `${product.leadTimeDays} სამუშაო დღე შეკვეთიდან მიწოდებამდე`, `${product.leadTimeDays} business days from order to delivery`],
              [Factory, "წარმოება", "Production", "თბილისი", "Tbilisi"],
              [Truck, "მიწოდება", "Delivery", "ტრეკინგით", "Tracked"],
            ].map(([Icon, labelKa, labelEn, valueKa, valueEn]) => { const DetailIcon = Icon as typeof Clock3; return <div key={String(labelEn)} className="rounded-xl border border-hooma-text/10 bg-white/65 p-4"><DetailIcon size={17} className="text-hooma-accent" /><p className="mt-3 text-xs text-hooma-muted"><LocalizedText ka={String(labelKa)} en={String(labelEn)} /></p><p className="mt-1 text-sm font-medium"><LocalizedText ka={String(valueKa)} en={String(valueEn)} /></p></div>; })}
          </div>

          <div className="mt-8">
            <h2 className="text-xl font-semibold"><LocalizedText ka="პროდუქტის შესახებ" en="About this product" /></h2>
            <p className="mt-3 text-sm leading-7 text-hooma-muted"><LocalizedText ka={<>{product.shortDescriptionKa} პროდუქტი მზადდება მხოლოდ შეკვეთის დადასტურების შემდეგ. {fixedMulticolor ? "მასალა შეგიძლია აირჩიო შესყიდვის ბლოკში, ხოლო ფერთა კომბინაცია ფიქსირებულია და ემთხვევა ფოტოს." : "ფერი და მასალა შეგიძლია აირჩიო შესყიდვის ბლოკში."}</>} en={<>{product.shortDescription} This product is made only after the order is confirmed. {fixedMulticolor ? "Choose the material in the purchase panel; the color combination is fixed and matches the photo." : "Choose the color and material in the purchase panel."}</>} /></p>
            <ul className="mt-5 grid gap-3 text-sm">
              {[
                ["ზომა: " + defaultVariant.productDimensionsCm, "Dimensions: " + defaultVariant.productDimensionsCm],
                ["მასალები: " + product.availableMaterials.join(", "), "Materials: " + product.availableMaterials.join(", ")],
                [fixedMulticolor ? "ფერთა კომბინაცია: მრავალფერიანი — როგორც ფოტოზე" : "ხელმისაწვდომი ფერები: " + product.availableColors.join(", "), fixedMulticolor ? "Color combination: multicolor — as shown" : "Available colors: " + product.availableColors.join(", ")],
                ["საბოლოო სპეციფიკაცია დასტურდება სატესტო ბეჭდვის შემდეგ", "Final specifications are confirmed after a test print"],
              ].map(([ka, en]) => <li key={en} className="flex gap-2.5"><Check size={16} className="mt-0.5 shrink-0 text-hooma-accent" /><LocalizedText ka={ka} en={en} /></li>)}
            </ul>
          </div>

          <div className="mt-8 rounded-2xl bg-hooma-panel p-5"><div className="flex items-center gap-2"><ShieldCheck size={18} className="text-hooma-accent" /><h2 className="font-semibold"><LocalizedText ka="უსაფრთხოება და მოვლა" en="Safety and care" /></h2></div><p className="mt-3 text-sm leading-6 text-hooma-muted"><LocalizedText ka="არ მოათავსოთ მაღალი ტემპერატურის ან ღია ცეცხლის სიახლოვეს. საბავშვო და საკვებთან დაკავშირებული პროდუქტები გამოქვეყნდება მხოლოდ შესაბამისი გამოყენების შემოწმების შემდეგ." en="Keep away from high temperatures and open flames. Children’s and food-related products are published only after their intended use has been reviewed." /></p></div>
        </div>

        <ProductConfigurator product={product} dailyDeal={activeDeal ? {
          variantId: activeDeal.variantId,
          originalPrice: activeDeal.originalPrice!,
          dealPrice: activeDeal.dealPrice!,
          discountPercent: activeDeal.discountPercent,
        } : undefined} />
      </section>

      <ProductReviewsSection productId={product.id} slug={product.slug} productName={product.nameKa} productNameEn={product.hoomaName} average={product.ratingAverage} ratingCount={product.ratingCount} salesCount={product.salesCount} reviews={reviewData.reviews} context={reviewData.context} allowReview={!previewProduct && product.isOrderable} />

      <div className="mt-14"><ProductShelf title="მსგავსი პროდუქტები" titleEn="Similar products" products={recommendations.map((item) => applyProductCardDeal(item, dailyDealByProductId.get(item.id)))} href={`/shop?category=${product.categorySlug}`} /></div>
    </main>
  );
}
