import { ArrowRight, Check, PackageCheck, Sparkles, Truck } from "lucide-react";
import Link from "next/link";
import { LocalizedText } from "@/components/LocalizedText";
import { getProfile } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function HoomaPlusPage() {
  const profile = await getProfile();
  const accountHref = profile?.role === "customer"
    ? "/account/hooma-plus"
    : "/login?next=/account/hooma-plus";

  return (
    <div>
      <section className="overflow-hidden bg-hooma-text text-white">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:px-8 lg:py-28">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-hooma-secondary">
              <Sparkles size={17} /> Hooma+
            </div>
            <h1 className="mt-6 max-w-3xl text-4xl font-semibold leading-tight sm:text-6xl">
              <LocalizedText
                ka="უფასო მიწოდება მაშინაც, როცა კალათაში მხოლოდ ერთი ნივთია"
                en="Free delivery, even when your cart has only one item"
              />
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-white/70">
              <LocalizedText
                ka="Hooma+ არის წინასწარ გადახდილი წევრობა კატალოგის სტანდარტული მიწოდებისთვის — 35₾ თვეში ან 350₾ წელიწადში."
                en="Hooma+ is prepaid membership for standard catalog delivery—₾35 monthly or ₾350 annually."
              />
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href={accountHref} className="inline-flex items-center justify-center gap-2 rounded-full bg-hooma-secondary px-6 py-3.5 font-semibold text-hooma-text">
                <LocalizedText ka="გეგმის არჩევა" en="Choose a plan" /><ArrowRight size={17} />
              </Link>
              <Link href="/shop" className="inline-flex items-center justify-center rounded-full border border-white/20 px-6 py-3.5 font-semibold text-white">
                <LocalizedText ka="კატალოგის ნახვა" en="Browse catalog" />
              </Link>
            </div>
          </div>
          <div className="relative">
            <div className="absolute -inset-12 rounded-full bg-hooma-accent/25 blur-3xl" />
            <div className="relative rounded-[2.5rem] border border-white/15 bg-white/10 p-7 backdrop-blur sm:p-9">
              <p className="text-sm font-semibold text-hooma-secondary">
                <LocalizedText ka="მიწოდების მარტივი წესები" en="Simple delivery rules" />
              </p>
              <div className="mt-6 space-y-4">
                {[
                  ["Hooma+", "Hooma+", "0₾", "₾0", "აქტიური წევრობა", "Active membership"],
                  ["100₾-დან", "From ₾100", "0₾", "₾0", "პროდუქტების ჯამი მინიმუმ 100₾-ია", "Product subtotal is at least ₾100"],
                  [
                    "პირველი 10 პროდუქტის ერთეულის მიწოდება",
                    "Delivery for your first 10 product units",
                    "0₾",
                    "₾0",
                    "მთელი კალათა უნდა ჩაეტიოს დარჩენილ ბალანსში",
                    "The whole cart must fit the remaining balance",
                  ],
                  ["სტანდარტული", "Standard", "5₾", "₾5", "ერთი საფასური შეკვეთაზე", "One fee per order"],
                ].map(([labelKa, labelEn, priceKa, priceEn, detailKa, detailEn]) => (
                  <div key={labelEn} className="flex items-center justify-between gap-5 rounded-2xl bg-white/10 p-4">
                    <div><p className="font-semibold"><LocalizedText ka={labelKa} en={labelEn} /></p><p className="mt-1 text-xs text-white/55"><LocalizedText ka={detailKa} en={detailEn} /></p></div>
                    <p className="text-2xl font-semibold text-hooma-secondary"><LocalizedText ka={priceKa} en={priceEn} /></p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid gap-5 md:grid-cols-3">
          <article className="rounded-[2rem] bg-white/75 p-6 shadow-soft">
            <Truck className="text-hooma-accent" />
            <h2 className="mt-5 text-xl font-semibold"><LocalizedText ka="უფასო სტანდარტული მიწოდება" en="Free standard delivery" /></h2>
            <p className="mt-3 text-sm leading-6 text-hooma-muted"><LocalizedText ka="აქტიური Hooma+ წევრობის დროს კატალოგის შეკვეთას მიწოდების 5₾ აღარ ემატება." en="While Hooma+ is active, the ₾5 standard delivery fee is not added to catalog orders." /></p>
          </article>
          <article className="rounded-[2rem] bg-white/75 p-6 shadow-soft">
            <PackageCheck className="text-hooma-accent" />
            <h2 className="mt-5 text-xl font-semibold"><LocalizedText ka="დარჩენილი ბალანსი შენარჩუნდება" en="Keep your remaining balance" /></h2>
            <p className="mt-3 text-sm leading-6 text-hooma-muted"><LocalizedText ka="Hooma+ ან მინიმუმ 100₾-იანი კალათა პირველი 10 პროდუქტის ერთეულის მიწოდების დარჩენილ ბალანსს არ ხარჯავს." en="Hooma+ and carts of at least ₾100 do not consume your remaining first-10 product-unit delivery balance." /></p>
          </article>
          <article className="rounded-[2rem] bg-white/75 p-6 shadow-soft">
            <Sparkles className="text-hooma-accent" />
            <h2 className="mt-5 text-xl font-semibold"><LocalizedText ka="ავტომატური ჩამოჭრის გარეშე" en="No recurring charge" /></h2>
            <p className="mt-3 text-sm leading-6 text-hooma-muted"><LocalizedText ka="ირჩევ წინასწარ გადახდილ 1 თვეს ან 1 წელს. ვადის ბოლოს მხოლოდ შენ გადაწყვიტავ განახლებას." en="Choose a prepaid month or year. At expiry, only you decide whether to renew." /></p>
          </article>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 pb-20 sm:px-6 lg:px-8">
        <div className="grid overflow-hidden rounded-[2.5rem] border border-hooma-text/10 bg-white/80 shadow-soft md:grid-cols-2">
          <article className="p-7 sm:p-9">
            <p className="text-sm font-semibold text-hooma-accent"><LocalizedText ka="თვიური" en="Monthly" /></p>
            <p className="mt-4 text-5xl font-semibold"><LocalizedText ka="35₾" en="₾35" /></p>
            <p className="mt-3 text-hooma-muted"><LocalizedText ka="1 კალენდარული თვე" en="1 calendar month" /></p>
            <ul className="mt-6 space-y-3 text-sm"><li className="flex gap-2"><Check size={17} className="text-emerald-600" /><LocalizedText ka="ხელით განახლება" en="Manual renewal" /></li><li className="flex gap-2"><Check size={17} className="text-emerald-600" /><LocalizedText ka="BOG-ის უსაფრთხო სრული გადახდა" en="Secure full payment with BOG" /></li></ul>
          </article>
          <article className="border-t border-hooma-text/10 bg-hooma-panel/55 p-7 sm:p-9 md:border-l md:border-t-0">
            <div className="flex items-center justify-between gap-4"><p className="text-sm font-semibold text-hooma-accent"><LocalizedText ka="წლიური" en="Annual" /></p><span className="rounded-full bg-hooma-accent px-3 py-1 text-xs font-semibold text-white"><LocalizedText ka="70₾ ეკონომია" en="Save ₾70" /></span></div>
            <p className="mt-4 text-5xl font-semibold"><LocalizedText ka="350₾" en="₾350" /></p>
            <p className="mt-3 text-hooma-muted"><LocalizedText ka="12 კალენდარული თვე · დაახლოებით 29.17₾/თვე" en="12 calendar months · about ₾29.17/month" /></p>
            <ul className="mt-6 space-y-3 text-sm"><li className="flex gap-2"><Check size={17} className="text-emerald-600" /><LocalizedText ka="წლიურ ფასში 2 თვის ეკონომია" en="Save the equivalent of 2 months" /></li><li className="flex gap-2"><Check size={17} className="text-emerald-600" /><LocalizedText ka="ერთჯერადი სრული გადახდა" en="One-time full payment" /></li></ul>
          </article>
        </div>
        <p className="mt-5 text-center text-xs leading-5 text-hooma-muted">
          <LocalizedText
            ka="Hooma+ ვრცელდება კატალოგის სტანდარტულ მიწოდებაზე; ინდივიდუალური შეკვეთები ამ პროგრამაში არ შედის. წევრობის გარეშე 100₾-ზე ნაკლებ შეკვეთაზე მიწოდება 5₾-ია, ხოლო 100₾-დან — უფასო."
            en="Hooma+ applies to standard catalog delivery; custom orders are excluded. Without membership, delivery is ₾5 below a ₾100 subtotal and free from ₾100."
          />
        </p>
      </section>
    </div>
  );
}
