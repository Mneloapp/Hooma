import Image from "next/image";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { notFound } from "next/navigation";
import { DailyDealBuyBox } from "@/components/deals/DailyDealBuyBox";
import { getDailyDeals } from "@/lib/daily-deals";
import { LocalizedText } from "@/components/LocalizedText";

export const dynamic = "force-dynamic";

export default async function DailyDealProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { deals } = await getDailyDeals();
  const deal = deals.find((item) => item.slug === slug);
  if (!deal) notFound();

  return (
    <main className="mx-auto max-w-[1280px] px-4 py-8 sm:px-6 lg:px-8">
      <nav className="mb-6 flex items-center gap-1.5 text-xs text-hooma-muted"><Link href="/"><LocalizedText ka="მთავარი" en="Home" /></Link><ChevronRight size={13} /><Link href="/deals"><LocalizedText ka="დღის შეთავაზებები" en="Daily deals" /></Link><ChevronRight size={13} /><span className="truncate text-hooma-text"><LocalizedText ka={deal.name} en={deal.nameEn} /></span></nav>
      <section className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)_340px]">
        <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-hooma-panel"><Image src={deal.image} alt={deal.name} fill priority className="object-cover" sizes="(min-width: 1024px) 45vw, 100vw" /><span className="absolute left-5 top-5 rounded-full bg-red-600 px-4 py-2 text-sm font-bold text-white">−50%</span></div>
        <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-hooma-accent"><LocalizedText ka="დღის შეთავაზება" en="Daily deal" /></p><h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl"><LocalizedText ka={deal.name} en={deal.nameEn} /></h1><p className="mt-4 text-sm leading-7 text-hooma-muted"><LocalizedText ka={deal.description} en={deal.descriptionEn} /></p><div className="mt-6 rounded-xl border border-hooma-text/10 bg-white/70 p-5 text-sm"><p><span className="text-hooma-muted">SKU:</span> {deal.sku}</p><p className="mt-2"><span className="text-hooma-muted"><LocalizedText ka="ვარიანტი:" en="Variant:" /></span> {deal.sizeLabel}</p><p className="mt-2"><span className="text-hooma-muted"><LocalizedText ka="შეთავაზების თარიღი:" en="Deal date:" /></span> {deal.dealDate}</p></div></div>
        <DailyDealBuyBox deal={deal} />
      </section>
    </main>
  );
}
