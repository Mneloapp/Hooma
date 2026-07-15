import Link from "next/link";
import { ArrowLeft, ExternalLink, LockKeyhole } from "lucide-react";
import { notFound } from "next/navigation";
import { ProductEditor } from "@/components/admin/ProductEditor";
import { VariantEditor } from "@/components/admin/VariantEditor";
import { DeleteProductButton } from "@/components/admin/DeleteProductButton";
import { ProductPublicationControls } from "@/components/admin/ProductPublicationControls";
import { products } from "@/data/products";
import { createClient } from "@/lib/supabase/server";

const money = new Intl.NumberFormat("ka-GE", { style: "currency", currency: "GEL" });

function safeReferenceUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export default async function AdminProductDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const previewProduct = products.find((item) => item.id === id || item.slug === id);
  if (previewProduct) return <div className="space-y-6"><div><p className="text-xs uppercase tracking-[0.28em] text-hooma-muted">Preview product</p><h1 className="mt-3 text-4xl font-medium">{previewProduct.hoomaName}</h1></div><section className="rounded-[2rem] bg-white/75 p-6 shadow-soft"><h2 className="mb-5 text-xl font-medium">Product information</h2><ProductEditor product={previewProduct} /></section><section className="rounded-[2rem] bg-white/75 p-6 shadow-soft"><h2 className="mb-5 text-xl font-medium">Variants</h2><VariantEditor variants={previewProduct.variants} /></section></div>;

  const supabase = (await createClient()) as any;
  if (!supabase) notFound();
  const [productResult, costResult, operatorReferenceResult] = await Promise.all([
    supabase.from("products").select("*,categories(id,slug,name_en,name_ka),product_variants(*),product_sources(*)").eq("id", id).maybeSingle(),
    supabase.from("product_cost_estimates").select("*,material_cost_profiles(code,name,cost_per_kg,waste_percent),pricing_profiles(name,machine_hour_cost,default_margin_percent,vat_percent)").eq("product_id", id).maybeSingle(),
    supabase.from("product_operator_references").select("reference").eq("product_id", id).maybeSingle(),
  ]);
  const product = productResult.data as any;
  if (!product) notFound();
  const category = Array.isArray(product.categories) ? product.categories[0] : product.categories;
  const variant = product.product_variants?.[0];
  const source = product.product_sources?.[0];
  const cost = costResult.data as any;
  const image = typeof product.hero_image === "string" && product.hero_image.startsWith("https://") ? product.hero_image.replace(/["\\\n\r]/g, "") : null;
  const publicReady = source?.platform === "hooma" || (source?.license_status === "verified" && source?.commercial_use_allowed && source?.media_use_allowed);
  const video = typeof product.video_url === "string" && product.video_url.startsWith("https://") ? product.video_url.replace(/["\\\n\r]/g, "") : null;
  const imageCount = Array.isArray(product.gallery_images) ? product.gallery_images.length : image ? 1 : 0;
  const operatorReference = operatorReferenceResult.data?.reference as string | undefined;
  const operatorReferenceUrl = safeReferenceUrl(operatorReference);
  const variantAttributes = variant?.attributes && typeof variant.attributes === "object" && !Array.isArray(variant.attributes) ? variant.attributes : {};
  const amsRequired = variantAttributes.ams_required === true && variantAttributes.color_mode === "fixed_multicolor";
  const fixedColorPalette = Array.isArray(variantAttributes.fixed_color_palette) ? variantAttributes.fixed_color_palette.filter((color: unknown) => typeof color === "string") : [];

  return <div className="space-y-6"><Link href="/admin/products" className="inline-flex items-center gap-2 text-sm text-hooma-muted"><ArrowLeft size={15} />პროდუქტები</Link><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-xs uppercase tracking-[0.28em] text-hooma-muted">{product.status === "active" ? "Published product" : "Supabase Draft"}</p><h1 className="mt-3 text-4xl font-semibold">{product.name_ka || product.hooma_name}</h1><p className="mt-2 text-sm text-hooma-muted">{product.slug} · {category?.name_ka || category?.name_en || "კატეგორია არაა"}</p></div><div className="flex gap-2"><span className="rounded-full bg-slate-100 px-4 py-2 text-xs font-semibold">{product.status}</span><span className="rounded-full bg-amber-100 px-4 py-2 text-xs font-semibold text-amber-800">{product.production_status}</span></div></div>
    <div className="grid gap-6 xl:grid-cols-[360px_1fr]"><section className="rounded-[1.5rem] bg-white/75 p-5 shadow-soft"><div className="h-72 rounded-xl bg-hooma-panel bg-cover bg-center" style={image ? { backgroundImage: `url("${image}")` } : undefined} />{video ? <video src={video} controls preload="metadata" playsInline className="mt-4 aspect-video w-full rounded-xl bg-hooma-text object-contain" /> : null}<h2 className="mt-5 font-semibold">პროდუქტის მედია</h2><div className="mt-3 space-y-2 text-sm text-hooma-muted"><p>{imageCount} ფოტო{video ? " · 1 ვიდეო" : " · ვიდეო არ არის"}</p>{source?.platform !== "hooma" && source?.source_url ? <a href={source.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-hooma-accent">წყაროს გახსნა<ExternalLink size={13} /></a> : <p>ხელით დამატებული Hooma პროდუქტი</p>}</div></section>
      <div className="space-y-6">{operatorReference ? <section className="rounded-[1.5rem] border border-blue-200 bg-blue-50 p-6 text-blue-950"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">Private · Operator only</p><h2 className="mt-2 text-xl font-semibold">ოპერატორის რეფერენსი</h2>{operatorReferenceUrl ? <a href={operatorReferenceUrl} target="_blank" rel="noreferrer noopener" className="mt-4 inline-flex items-center gap-2 rounded-full bg-blue-950 px-4 py-2.5 text-sm font-semibold text-white">რეფერენსის გახსნა<ExternalLink size={14} /></a> : <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-blue-900/80">{operatorReference}</p>}<p className="mt-4 text-xs text-blue-800/65">ეს მონაცემი მომხმარებლის storefront მოთხოვნებში არ იგზავნება.</p></section> : null}<section className="rounded-[1.5rem] bg-white/75 p-6 shadow-soft"><h2 className="text-xl font-semibold">ტექნიკური პროფილი</h2><div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[["SKU", variant?.sku || "—"], ["მასალა", variant?.material || "—"], ["ფერის რეჟიმი", amsRequired ? "მრავალფერიანი · AMS" : "ერთფერიანი · მომხმარებლის არჩევანი"], ["ფერები", amsRequired ? fixedColorPalette.join(", ") : Array.isArray(variant?.available_colors) ? variant.available_colors.join(", ") : "—"], ["წონა", variant?.material_grams ? `${variant.material_grams} გ` : "—"], ["დრო", variant?.estimated_print_minutes ? `${variant.estimated_print_minutes} წუთი` : "—"], ["ფირფიტები", variant?.plate_count ?? "—"], ["ზომა", variant?.product_dimensions_cm ? JSON.stringify(variant.product_dimensions_cm) : "—"], ["გასაყიდი ფასი", variant?.price ? money.format(Number(variant.price)) : "—"], ["ვადა", `${product.lead_time_business_days} სამუშაო დღე`]].map(([label, value]) => <div key={String(label)} className="rounded-xl bg-hooma-panel p-4"><p className="text-xs text-hooma-muted">{String(label)}</p><p className="mt-2 text-sm font-semibold">{String(value)}</p></div>)}</div></section>
        <section className="rounded-[1.5rem] border border-hooma-text/10 bg-hooma-text p-6 text-white"><div className="flex items-center gap-2"><LockKeyhole size={18} className="text-[#c8d8bd]" /><h2 className="text-xl font-semibold">შიდა თვითღირებულება</h2></div>{cost ? <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[["მასალა", cost.material_cost], ["პრინტერის დრო", cost.machine_cost], ["შრომა", cost.labor_cost], ["შეფუთვა", cost.packaging_cost], ["ზედნადები", cost.overhead_cost], ["ბეჭდვის რეზერვი", cost.failure_reserve_cost], ["სრული თვითღირებულება", cost.production_cost], ["საბოლოო ფასი", cost.final_sale_price]].map(([label, value]) => <div key={String(label)} className="rounded-xl bg-white/10 p-4"><p className="text-xs text-white/50">{String(label)}</p><p className="mt-2 font-semibold">{money.format(Number(value))}</p></div>)}</div> : <p className="mt-4 text-sm text-white/60">კალკულაცია არ მოიძებნა.</p>}<p className="mt-4 text-xs text-white/45">ეს ბლოკი მხოლოდ ადმინისტრატორისთვისაა და მომხმარებლის პროდუქტის გვერდზე არ იგზავნება.</p></section>
        <ProductPublicationControls productId={product.id} slug={product.slug} status={product.status} priceReady={Boolean(variant?.is_active && Number(variant?.price) > 0)} publicReady={Boolean(publicReady)} />
        {product.status === "draft" ? <section className="rounded-[1.5rem] border border-red-200 bg-white/75 p-5"><h2 className="font-semibold text-red-950">Draft-ის მართვა</h2><p className="mt-2 text-sm leading-6 text-hooma-muted">წაშლა გამოიყენე მხოლოდ სატესტო ან შეცდომით შექმნილი Draft-ისთვის. შეკვეთაში გამოყენებული პროდუქტი დაცულია.</p><div className="mt-4"><DeleteProductButton productId={product.id} productName={product.name_ka || product.hooma_name} /></div></section> : null}</div>
    </div>
  </div>;
}
