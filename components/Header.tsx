"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, MapPin, Menu, Package, Search, ShoppingCart, UserRound, X } from "lucide-react";
import { useEffect, useState } from "react";
import { catalogCategories } from "@/data/catalog";
import { useCart } from "./CartContext";
import { BrandLogo } from "./BrandLogo";
import { LanguageToggle } from "./LanguageToggle";
import { useLanguage } from "./LanguageProvider";
import { createClient } from "@/lib/supabase/client";
import NotificationBell from "./notifications/NotificationBell";

type HeaderAccount = { signedIn: boolean; name: string; initial: string };

function accountFromUser(user: { email?: string | null; user_metadata?: Record<string, unknown> } | null): HeaderAccount {
  if (!user) return { signedIn: false, name: "", initial: "" };
  const metadataName = typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name.trim() : "";
  const name = metadataName || user.email?.split("@")[0] || "მომხმარებელი";
  return { signedIn: true, name, initial: name.charAt(0).toLocaleUpperCase("ka-GE") || "✓" };
}

export function Header() {
  const { language } = useLanguage();
  const georgian = language === "ka";
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [locationOpen, setLocationOpen] = useState(false);
  const [deliveryCity, setDeliveryCity] = useState("tbilisi");
  const [account, setAccount] = useState<HeaderAccount>({ signedIn: false, name: "", initial: "" });
  const { openCart, count } = useCart();
  const deliveryCities = [
    ["tbilisi", "თბილისი", "Tbilisi"], ["batumi", "ბათუმი", "Batumi"],
    ["kutaisi", "ქუთაისი", "Kutaisi"], ["rustavi", "რუსთავი", "Rustavi"],
    ["gori", "გორი", "Gori"], ["zugdidi", "ზუგდიდი", "Zugdidi"],
    ["poti", "ფოთი", "Poti"], ["telavi", "თელავი", "Telavi"],
    ["other", "სხვა ქალაქი", "Other city"],
  ];
  const deliveryCityLabel = deliveryCities.find(([value]) => value === deliveryCity)?.[georgian ? 1 : 2] ?? deliveryCity;
  const utilityLinks = [
    [georgian ? "დღის შეთავაზებები" : "Daily deals", "/deals"],
    [georgian ? "როგორ შევუკვეთოთ?" : "How to order", "/how-it-works"],
    [georgian ? "შეკვეთის ტრეკინგი" : "Order tracking", "/account/orders"],
    [georgian ? "ინდივიდუალური შეკვეთა" : "Custom order", "/account/custom-orders"],
  ];

  useEffect(() => {
    const savedCity = window.localStorage.getItem("hooma-delivery-city");
    if (savedCity) {
      const legacyCity = deliveryCities.find(([, ka, en]) => ka === savedCity || en === savedCity)?.[0];
      setDeliveryCity(legacyCity ?? savedCity);
    }
  }, []);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) return;
    let active = true;
    supabase.auth.getUser().then(({ data }) => { if (active) setAccount(accountFromUser(data.user)); });
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setAccount(accountFromUser(session?.user ?? null));
    });
    return () => { active = false; authListener.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) {
      setAccount(accountFromUser(null));
      return;
    }
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (active) setAccount(accountFromUser(data.user));
    });
    return () => { active = false; };
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = open || locationOpen ? "hidden" : "";
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") { setOpen(false); setLocationOpen(false); } };
    window.addEventListener("keydown", closeOnEscape);
    return () => { document.body.style.overflow = ""; window.removeEventListener("keydown", closeOnEscape); };
  }, [open, locationOpen]);

  const selectDeliveryCity = (city: string) => {
    setDeliveryCity(city);
    window.localStorage.setItem("hooma-delivery-city", city);
    setLocationOpen(false);
  };
  const accountHref = account.signedIn ? "/account" : "/login?next=/account";
  const accountLabel = account.signedIn ? (georgian ? "ჩემი ანგარიში" : "My account") : (georgian ? "ანგარიში" : "Account");

  const SearchForm = ({ mobile = false }: { mobile?: boolean }) => (
    <form action="/shop" className={`flex min-w-0 overflow-hidden rounded-xl bg-white ring-2 ring-transparent transition focus-within:ring-hooma-accent ${mobile ? "w-full" : "flex-1"}`}>
      <label className="sr-only" htmlFor={mobile ? "mobile-category" : "desktop-category"}>{georgian ? "კატეგორია" : "Category"}</label>
      <div className="relative hidden border-r border-hooma-text/10 bg-hooma-panel sm:block">
        <select id={mobile ? "mobile-category" : "desktop-category"} name="category" defaultValue="" className="h-11 max-w-36 appearance-none bg-transparent py-0 pl-3 pr-8 text-xs text-hooma-muted outline-none">
          <option value="">{georgian ? "ყველა კატეგორია" : "All categories"}</option>
          {catalogCategories.map((category) => <option key={category.slug} value={category.slug}>{georgian ? category.nameKa : category.name}</option>)}
        </select>
        <ChevronDown size={13} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-hooma-muted" />
      </div>
      <label className="sr-only" htmlFor={mobile ? "mobile-search" : "desktop-search"}>{georgian ? "პროდუქტის ძიება" : "Search products"}</label>
      <input id={mobile ? "mobile-search" : "desktop-search"} name="q" type="search" placeholder={georgian ? "მოძებნე პროდუქტი Hooma-ზე" : "Search products on Hooma"} className="h-11 min-w-0 flex-1 bg-white px-4 text-sm text-hooma-text caret-hooma-accent outline-none placeholder:text-hooma-muted/70" />
      <button type="submit" aria-label={georgian ? "ძიება" : "Search"} className="grid w-12 place-items-center bg-hooma-accent text-white transition hover:bg-hooma-accent/90"><Search size={19} /></button>
    </form>
  );

  return (
    <header className="sticky top-0 z-40 shadow-[0_2px_12px_rgba(23,23,23,0.08)]">
      <div className="bg-hooma-text text-white">
        <div className="mx-auto flex min-h-[68px] max-w-[1480px] items-center gap-3 px-4 py-2 sm:px-6 lg:gap-5 lg:px-8">
          <BrandLogo inverted className="w-[94px] shrink-0" imageClassName="max-h-12" />
          <button type="button" onClick={() => setLocationOpen(true)} className="hidden shrink-0 items-center gap-2 rounded-lg px-2 py-2 text-left text-xs transition hover:bg-white/10 xl:flex">
            <MapPin size={18} className="text-hooma-secondary" />
            <span><span className="block text-white/55">{georgian ? "მიწოდება" : "Deliver to"}</span><strong className="font-medium">{deliveryCityLabel}</strong></span>
          </button>
          <div className="hidden min-w-0 flex-1 md:flex"><SearchForm /></div>
          <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
            <div className="hidden lg:block"><LanguageToggle /></div>
            {account.signedIn ? <NotificationBell georgian={georgian} /> : null}
            <Link href={accountHref} aria-label={accountLabel} title={account.signedIn ? account.name : undefined} className="hidden items-end gap-1 rounded-lg px-2.5 py-2 transition hover:bg-white/10 sm:flex">
              <span className="relative"><UserRound size={25} />{account.signedIn ? <span className="absolute -right-2 -top-2 grid h-5 min-w-5 place-items-center rounded-full bg-hooma-secondary px-1 text-[10px] font-bold text-hooma-text">{account.initial}</span> : null}</span><strong className="text-sm">{accountLabel}</strong>
            </Link>
            <Link href="/account/orders" aria-label={georgian ? "შეკვეთები" : "Orders"} className="hidden items-end gap-1 rounded-lg px-2.5 py-2 transition hover:bg-white/10 lg:flex">
              <Package size={25} /><strong className="text-sm">{georgian ? "შეკვეთები" : "Orders"}</strong>
            </Link>
            <button onClick={openCart} aria-label="Open cart" className="relative flex items-end gap-1 rounded-lg px-2.5 py-2 transition hover:bg-white/10">
              <ShoppingCart size={25} /><strong className="hidden text-sm sm:block">{georgian ? "კალათა" : "Cart"}</strong>
              {count ? <span className="absolute left-7 top-0 grid min-h-5 min-w-5 place-items-center rounded-full bg-hooma-secondary px-1 text-[10px] font-bold text-hooma-text">{count}</span> : null}
            </button>
          </div>
        </div>
        <div className="px-4 pb-3 md:hidden"><SearchForm mobile /></div>
      </div>

      <div className="border-b border-black/10 bg-[#34486B] text-white">
        <div className="mx-auto flex h-10 max-w-[1480px] items-center gap-1 overflow-x-auto px-2 text-[13px] hide-scrollbar sm:px-6 lg:px-8">
          <button aria-label="Open categories" onClick={() => setOpen(!open)} className="flex h-full shrink-0 items-center gap-2 px-2.5 font-semibold transition hover:bg-white/10">
            {open ? <X size={18} /> : <Menu size={18} />}{georgian ? "ყველა კატეგორია" : "All categories"}
          </button>
          <button type="button" onClick={() => setLocationOpen(true)} className="flex h-full shrink-0 items-center gap-1.5 px-2.5 transition hover:bg-white/10 xl:hidden"><MapPin size={14} className="text-hooma-secondary" />{deliveryCityLabel}</button>
          {utilityLinks.map(([label, href], index) => <Link key={label} href={href} className={`flex h-full shrink-0 items-center px-2.5 transition hover:bg-white/10 ${index === 0 ? "font-semibold text-hooma-secondary" : ""}`}>{label}</Link>)}
          <span className="ml-auto hidden shrink-0 text-xs text-white/65 xl:block">{georgian ? "3 სამუშაო დღე შეკვეთიდან მიწოდებამდე" : "3 business days from order to delivery"}</span>
        </div>
      </div>

      {open ? (
        <div className="fixed inset-0 z-50">
          <button type="button" aria-label="Close categories" onClick={() => setOpen(false)} className="absolute inset-0 bg-black/55 backdrop-blur-[2px]" />
          <aside aria-label="ყველა კატეგორია" className="absolute inset-y-0 left-0 flex w-[min(92vw,400px)] flex-col bg-hooma-background text-hooma-text shadow-2xl">
            <div className="flex items-center justify-between bg-hooma-text px-5 py-4 text-white">
              <Link href={accountHref} onClick={() => setOpen(false)} className="flex items-center gap-3 font-semibold"><span className="relative grid h-9 w-9 place-items-center rounded-full bg-white/10"><UserRound size={19} />{account.signedIn ? <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-hooma-secondary px-1 text-[10px] font-bold text-hooma-text">{account.initial}</span> : null}</span><span>{accountLabel}{account.signedIn ? <small className="mt-0.5 block max-w-52 truncate font-normal text-white/55">{account.name}</small> : null}</span></Link>
              <button type="button" aria-label="Close categories" onClick={() => setOpen(false)} className="grid h-10 w-10 place-items-center rounded-full transition hover:bg-white/10"><X size={22} /></button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="border-b border-hooma-text/10 px-5 py-5">
                <h2 className="text-xl font-semibold">{georgian ? "პროდუქტების კატეგორიები" : "Product categories"}</h2>
                <Link href="/shop" onClick={() => setOpen(false)} className="mt-3 inline-flex text-sm font-medium text-hooma-accent hover:underline">{georgian ? "მთელი კატალოგის ნახვა" : "View full catalog"}</Link>
              </div>
              <nav className="divide-y divide-hooma-text/10">
                {catalogCategories.map((category) => (
                  <div key={category.slug} className="px-5 py-5">
                    <Link href={`/shop?category=${category.slug}`} onClick={() => setOpen(false)} className="group flex items-center gap-3 font-semibold transition hover:text-hooma-accent">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-hooma-panel text-hooma-accent"><category.icon size={18} /></span>
                      {georgian ? category.nameKa : category.name}
                    </Link>
                    <div className="ml-12 mt-3 grid gap-2.5">
                      {category.subcategories.map((subcategory) => <Link key={subcategory.slug} href={subcategory.slug === "request-part" ? "/account/custom-orders" : `/shop?category=${category.slug}&subcategory=${subcategory.slug}`} onClick={() => setOpen(false)} className="text-sm text-hooma-muted transition hover:text-hooma-accent">{georgian ? subcategory.nameKa : subcategory.name}</Link>)}
                    </div>
                  </div>
                ))}
              </nav>
              <div className="border-t border-hooma-text/10 bg-white/55 px-5 py-5">
                <h3 className="font-semibold">{georgian ? "დახმარება და პარამეტრები" : "Help and settings"}</h3>
                <div className="mt-3 grid gap-3 text-sm text-hooma-muted">
                  <button type="button" onClick={() => { setOpen(false); setLocationOpen(true); }} className="flex items-center gap-2 text-left hover:text-hooma-accent"><MapPin size={15} />{georgian ? "მიწოდების ქალაქი" : "Delivery city"}: {deliveryCityLabel}</button>
                  {utilityLinks.slice(1, 3).map(([label, href]) => <Link key={label} href={href} onClick={() => setOpen(false)} className="hover:text-hooma-accent">{label}</Link>)}
                  <div className="pt-2"><LanguageToggle /></div>
                </div>
              </div>
            </div>
          </aside>
        </div>
      ) : null}

      {locationOpen ? (
        <div className="fixed inset-0 z-[60] grid place-items-center px-4">
          <button type="button" aria-label="Close delivery location" onClick={() => setLocationOpen(false)} className="absolute inset-0 bg-black/55 backdrop-blur-[2px]" />
          <section role="dialog" aria-modal="true" aria-labelledby="delivery-location-title" className="relative w-full max-w-md rounded-[1.5rem] bg-hooma-background p-6 text-hooma-text shadow-2xl">
            <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-hooma-accent">{georgian ? "მიწოდების ადგილი" : "Delivery location"}</p><h2 id="delivery-location-title" className="mt-2 text-2xl font-semibold">{georgian ? "აირჩიე მიწოდების ქალაქი" : "Choose a delivery city"}</h2></div><button type="button" onClick={() => setLocationOpen(false)} aria-label="Close" className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-hooma-panel"><X size={19} /></button></div>
            <p className="mt-3 text-sm leading-6 text-hooma-muted">{georgian ? "ქალაქის არჩევანი ამ ბრაუზერში შეინახება. საბოლოო მისამართი და მიწოდების პირობები Checkout-ზე დადასტურდება." : "Your city choice is saved in this browser. The final address and delivery terms are confirmed at checkout."}</p>
            <div className="mt-5 grid grid-cols-2 gap-2.5">
              {deliveryCities.map(([value, ka, en]) => <button key={value} type="button" onClick={() => selectDeliveryCity(value)} className={`rounded-xl border px-4 py-3 text-left text-sm transition ${deliveryCity === value ? "border-hooma-accent bg-hooma-accent text-white" : "border-hooma-text/10 bg-white hover:border-hooma-accent/40"}`}>{georgian ? ka : en}</button>)}
            </div>
            <p className="mt-4 text-xs leading-5 text-hooma-muted">{georgian ? "IP მისამართით ქალაქს ავტომატურად არ ვადგენთ — VPN-ისა და მობილური ქსელის გამო ასეთი მონაცემი ხშირად არასწორია." : "We do not detect your city from the IP address because VPNs and mobile networks often make that information inaccurate."}</p>
          </section>
        </div>
      ) : null}
    </header>
  );
}
