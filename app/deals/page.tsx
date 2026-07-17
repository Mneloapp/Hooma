import Image from "next/image";
import Link from "next/link";
import { BadgePercent, CalendarDays, Clock3, ShieldCheck } from "lucide-react";
import { getDailyDeals } from "@/lib/daily-deals";
import { LocalizedText } from "@/components/LocalizedText";

export const dynamic = "force-dynamic";

const money = new Intl.NumberFormat("ka-GE", { style: "currency", currency: "GEL" });

export default async function DailyDealsPage() {
  const { date, deals, isPreview, discountPercent } = await getDailyDeals();

  return (
    <main className="bg-hooma-panel/60 pb-16">
      <section className="bg-hooma-text text-white">
        <div className="mx-auto max-w-[1480px] px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
          <div className="flex items-center gap-2 text-[#c8d8bd]"><BadgePercent size={20} /><p className="text-xs font-semibold uppercase tracking-[0.2em]"><LocalizedText ka="Hooma-ს დღის შეთავაზებები" en="Hooma daily deals" /></p></div>
          <h1 className="mt-4 max-w-4xl text-4xl font-semibold tracking-tight sm:text-5xl"><LocalizedText ka={`დღის 100 განსხვავებული პროდუქტი −${discountPercent}%-ად`} en={`100 different products at ${discountPercent}% off today`} /></h1>
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
          <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-hooma-accent"><LocalizedText ka="დღეს ხელმისაწვდომია" en="Available today" /></p><h2 className="mt-2 text-2xl font-semibold"><LocalizedText ka={`${deals.length} პროდუქტი`} en={`${deals.length} products`} /></h2></div>
          <p className="text-right text-xs leading-5 text-hooma-muted"><LocalizedText ka={<>შეთავაზება მოქმედებს მხოლოდ<br />მიმდინარე დღის დასრულებამდე</>} en={<>Offer valid only until<br />the end of today</>} /></p>
        </div>

        {deals.length ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {deals.map((deal) => (
              <Link key={`${deal.dealDate}-${deal.productId}`} href={`/deals/${deal.slug}`} className="group overflow-hidden rounded-[1.25rem] border border-hooma-text/10 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-soft">
                <div className="relative aspect-[4/3] overflow-hidden bg-hooma-panel">
                  <Image src={deal.image} alt={deal.name} fill className="object-cover transition duration-500 group-hover:scale-[1.025]" sizes="(min-width: 1280px) 25vw, (min-width: 640px) 50vw, 100vw" />
                  <span className="absolute left-4 top-4 rounded-full bg-red-600 px-3 py-1.5 text-xs font-bold text-white shadow">−{deal.discountPercent}%</span>
                  {deal.preview ? <span className="absolute right-4 top-4 rounded-full bg-white/90 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider">Demo</span> : null}
                </div>
                <div className="p-5">
                  <p className="text-xs text-hooma-muted">{deal.sku} · {deal.sizeLabel}</p>
                  <h3 className="mt-2 min-h-12 text-lg font-semibold leading-6"><LocalizedText ka={deal.name} en={deal.nameEn} /></h3>
                  <p className="mt-2 line-clamp-2 min-h-10 text-sm leading-5 text-hooma-muted"><LocalizedText ka={deal.description} en={deal.descriptionEn} /></p>
                  <div className="mt-5 border-t border-hooma-text/10 pt-4">
                    {deal.dealPrice !== null && deal.originalPrice !== null ? (
                      <div className="flex items-baseline gap-2"><span className="text-xl font-bold text-red-600">{money.format(deal.dealPrice)}</span><span className="text-sm text-hooma-muted line-through">{money.format(deal.originalPrice)}</span></div>
                    ) : <span className="text-sm font-semibold"><LocalizedText ka="ფასი დამტკიცების შემდეგ" en="Price after approval" /></span>}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : <div className="rounded-2xl bg-white p-8 text-center text-hooma-muted"><LocalizedText ka="დღევანდელი შეთავაზებები მზადდება." en="Today’s deals are being prepared." /></div>}
      </div>
    </main>
  );
}
