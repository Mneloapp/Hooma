import { BadgePercent, CalendarDays, Clock3, ShieldCheck } from "lucide-react";
import { ProductCard } from "@/components/ProductCard";
import { getDailyDeals } from "@/lib/daily-deals";
import { applyProductCardDeal } from "@/lib/product-card";
import { getStorefrontProductCardsByIds } from "@/lib/storefront-catalog";
import { LocalizedText } from "@/components/LocalizedText";

export const dynamic = "force-dynamic";

export default async function DailyDealsPage() {
  const { date, deals, isPreview, discountPercent } = await getDailyDeals();
  const dealByProductId = new Map(deals.map((deal) => [deal.productId, deal]));
  const dealCards = await getStorefrontProductCardsByIds(deals.map((deal) => deal.productId));
  const dealProducts = dealCards.map((product) => applyProductCardDeal(product, dealByProductId.get(product.id)));

  return (
    <main className="bg-hooma-panel/60 pb-16">
      <section className="bg-hooma-text text-white">
        <div className="mx-auto max-w-[1480px] px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
          <div className="flex items-center gap-2 text-hooma-secondary"><BadgePercent size={20} /><p className="text-xs font-semibold uppercase tracking-[0.2em]"><LocalizedText ka="Hooma-ს დღის შეთავაზებები" en="Hooma daily deals" /></p></div>
          <h1 className="mt-4 max-w-4xl text-4xl font-semibold tracking-tight sm:text-5xl"><LocalizedText ka={`დღის 50 განსხვავებული პროდუქტი −${discountPercent}%-ად`} en={`50 different products at ${discountPercent}% off today`} /></h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-white/65"><LocalizedText ka="შერჩევა თბილისის დროით ყოველ დღე ახლდება. სისტემა პირველ რიგში აჩვენებს პროდუქტებს, რომლებიც მიმდინარე როტაციაში ჯერ არ ყოფილა." en="The selection refreshes daily on Tbilisi time. Products that have not appeared in the current rotation are prioritized." /></p>
          <div className="mt-7 flex flex-wrap gap-3 text-xs">
            <span className="flex items-center gap-2 rounded-full bg-white/10 px-4 py-2"><CalendarDays size={15} />{date}</span>
            <span className="flex items-center gap-2 rounded-full bg-white/10 px-4 py-2"><ShieldCheck size={15} /><LocalizedText ka="ფასი სერვერზე მოწმდება" en="Price verified on server" /></span>
            <span className="flex items-center gap-2 rounded-full bg-white/10 px-4 py-2"><Clock3 size={15} /><LocalizedText ka="იცვლება 00:00-ზე" en="Changes at 00:00" /></span>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-[1480px] px-4 py-8 sm:px-6 lg:px-8">
        {isPreview ? (
          <div className="mb-6 rounded-2xl border border-amber-300/50 bg-amber-50 px-5 py-4 text-sm leading-6 text-amber-950">
            <LocalizedText ka="დღის შეთავაზებების რეალური კატალოგი ამჟამად მიუწვდომელია. გვერდი ავტომატურად განახლდება კავშირის აღდგენის შემდეგ." en="The live daily-deals catalog is currently unavailable. This page will update automatically after the connection is restored." />
          </div>
        ) : null}

        <div className="mb-5 flex items-end justify-between gap-4">
          <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-hooma-accent"><LocalizedText ka="დღეს ხელმისაწვდომია" en="Available today" /></p><h2 className="mt-2 text-2xl font-semibold"><LocalizedText ka={`${dealProducts.length} პროდუქტი`} en={`${dealProducts.length} products`} /></h2></div>
          <p className="text-right text-xs leading-5 text-hooma-muted"><LocalizedText ka={<>შეთავაზება მოქმედებს მხოლოდ<br />მიმდინარე დღის დასრულებამდე</>} en={<>Offer valid only until<br />the end of today</>} /></p>
        </div>

        {dealProducts.length ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {dealProducts.map((product) => <ProductCard key={product.id} product={product} />)}
          </div>
        ) : <div className="rounded-2xl bg-white p-8 text-center text-hooma-muted"><LocalizedText ka="დღევანდელი შეთავაზებები მზადდება." en="Today’s deals are being prepared." /></div>}
      </div>
    </main>
  );
}
