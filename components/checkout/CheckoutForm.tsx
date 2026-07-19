"use client";

import { useEffect, useState, useTransition } from "react";
import { ExternalLink, MapPin } from "lucide-react";
import { Button } from "@/components/Button";
import { useCart } from "@/components/CartContext";
import { createOrderAction } from "@/app/auth/actions";
import { useLanguage } from "@/components/LanguageProvider";

const deliveryCityLabels: Record<string, { ka: string; en: string }> = {
  tbilisi: { ka: "თბილისი", en: "Tbilisi" }, batumi: { ka: "ბათუმი", en: "Batumi" },
  kutaisi: { ka: "ქუთაისი", en: "Kutaisi" }, rustavi: { ka: "რუსთავი", en: "Rustavi" },
  gori: { ka: "გორი", en: "Gori" }, zugdidi: { ka: "ზუგდიდი", en: "Zugdidi" },
  poti: { ka: "ფოთი", en: "Poti" }, telavi: { ka: "თელავი", en: "Telavi" },
  other: { ka: "სხვა ქალაქი", en: "Other city" },
};

type CheckoutInitialValues = { fullName: string; phone: string; email: string; city: string; addressLine1: string; addressLine2: string; postalCode: string; latitude: number | null; longitude: number | null; googleMapsUrl: string };
export function CheckoutForm({ initialValues }: { initialValues: CheckoutInitialValues }) {
  const { language } = useLanguage();
  const georgian = language === "ka";
  const { items, clearCart } = useCart();
  const [message, setMessage] = useState("");
  const [city, setCity] = useState(initialValues.city);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    if (initialValues.city) return;
    const stored = window.localStorage.getItem("hooma-delivery-city") ?? "";
    setCity(deliveryCityLabels[stored]?.[language] ?? stored);
  }, [initialValues.city, language]);

  function submit(formData: FormData) {
    const payload = {
      guest_email: String(formData.get("guest_email") ?? ""),
      guest_phone: String(formData.get("guest_phone") ?? ""),
      full_name: String(formData.get("full_name") ?? ""),
      city: String(formData.get("city") ?? ""),
      address_line_1: String(formData.get("address_line_1") ?? ""),
      address_line_2: String(formData.get("address_line_2") ?? ""),
      postal_code: String(formData.get("postal_code") ?? ""),
      latitude: String(formData.get("latitude") ?? ""),
      longitude: String(formData.get("longitude") ?? ""),
      notes: String(formData.get("notes") ?? ""),
      language,
      items,
    };
    const actionData = new FormData();
    actionData.set("payload", JSON.stringify(payload));
    startTransition(async () => {
      const result = await createOrderAction(actionData);
      setMessage(result.message);
      if (result.ok) clearCart();
    });
  }

  return (
    <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:px-6 lg:grid-cols-[1fr_420px] lg:px-8">
      <form action={submit} className="space-y-5 rounded-[2rem] bg-white/75 p-6 shadow-soft">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-hooma-muted">{georgian ? "სატესტო შეკვეთა" : "Test checkout"}</p>
          <h1 className="mt-3 text-3xl font-medium">{georgian ? "სატესტო შეკვეთა" : "Place a test order"}</h1>
          <p className="mt-3 text-hooma-muted">{georgian ? "ამ ეტაპზე თანხა არ ჩამოგეჭრება და პროდუქტი ავტომატურად არ გაეშვება ბეჭდვაზე." : "You will not be charged at this stage, and the product will not be sent to print automatically."}</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-sm font-medium">{georgian ? "სახელი და გვარი" : "Full name"}<input name="full_name" required defaultValue={initialValues.fullName} className="mt-2 w-full rounded-full border border-hooma-text/10 px-4 py-3 outline-none focus:border-hooma-accent" /></label>
          <label className="block text-sm font-medium">{georgian ? "ტელეფონი" : "Phone"}<input name="guest_phone" type="tel" required defaultValue={initialValues.phone} className="mt-2 w-full rounded-full border border-hooma-text/10 px-4 py-3 outline-none focus:border-hooma-accent" /></label>
          <label className="block text-sm font-medium">{georgian ? "ელფოსტა" : "Email"}<input name="guest_email" type="email" required defaultValue={initialValues.email} className="mt-2 w-full rounded-full border border-hooma-text/10 px-4 py-3 outline-none focus:border-hooma-accent" /></label>
          <label className="block text-sm font-medium">{georgian ? "ქალაქი" : "City"}<input name="city" required value={city} onChange={(event) => setCity(event.target.value)} className="mt-2 w-full rounded-full border border-hooma-text/10 px-4 py-3 outline-none focus:border-hooma-accent" /></label>
        </div>
        <input type="hidden" name="latitude" value={initialValues.latitude ?? ""} /><input type="hidden" name="longitude" value={initialValues.longitude ?? ""} />
        {initialValues.googleMapsUrl ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900"><span className="inline-flex items-center gap-2 font-semibold"><MapPin size={16} />{georgian ? "შენახული ზუსტი ლოკაცია დაემატება შეკვეთას" : "Your saved exact location will be added to the order"}</span><a href={initialValues.googleMapsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold underline">{georgian ? "რუკაზე ნახვა" : "View map"}<ExternalLink size={13} /></a></div> : null}
        <label className="block text-sm font-medium">{georgian ? "მიწოდების მისამართი" : "Delivery address"}<input name="address_line_1" required defaultValue={initialValues.addressLine1} className="mt-2 w-full rounded-full border border-hooma-text/10 px-4 py-3 outline-none focus:border-hooma-accent" /></label>
        <div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm font-medium">{georgian ? "სადარბაზო, სართული, ბინა" : "Entrance, floor, apartment"}<input name="address_line_2" defaultValue={initialValues.addressLine2} className="mt-2 w-full rounded-full border border-hooma-text/10 px-4 py-3 outline-none focus:border-hooma-accent" /></label><label className="block text-sm font-medium">{georgian ? "საფოსტო ინდექსი" : "Postal code"}<input name="postal_code" defaultValue={initialValues.postalCode} className="mt-2 w-full rounded-full border border-hooma-text/10 px-4 py-3 outline-none focus:border-hooma-accent" /></label></div>
        <label className="block text-sm font-medium">{georgian ? "შენიშვნა" : "Notes"}<textarea name="notes" rows={4} className="mt-2 w-full rounded-[1.5rem] border border-hooma-text/10 px-4 py-3 outline-none focus:border-hooma-accent" /></label>
        {message ? <p className="rounded-2xl bg-hooma-panel p-4 text-sm text-hooma-text">{message}</p> : null}
        <Button className="w-full" disabled={!items.length || isPending}>{isPending ? (georgian ? "იგზავნება..." : "Submitting...") : (georgian ? "სატესტო შეკვეთის განთავსება" : "Place test order")}</Button>
      </form>
      <aside className="h-fit rounded-[2rem] bg-white/75 p-6 shadow-soft lg:sticky lg:top-24">
        <h2 className="text-xl font-medium">{georgian ? "შეკვეთის შეჯამება" : "Order summary"}</h2>
        <div className="mt-5 space-y-4">
          {items.length ? items.map((item) => (
            <div key={`${item.product_id}-${item.variant_id}-${item.material}-${item.color}`} className="border-b border-hooma-text/10 pb-4 last:border-0">
              <div className="flex justify-between gap-4">
                <p className="font-medium">{georgian ? item.name : item.product_name}</p>
                <p className="text-sm text-hooma-muted">x{item.quantity}</p>
              </div>
              <p className="mt-1 text-sm text-hooma-muted">{item.size_label} / {item.material} / {item.color}</p>
              <p className="mt-2 text-sm font-medium">{item.price ?? item.pricePlaceholder}</p>
            </div>
          )) : <p className="text-sm text-hooma-muted">{georgian ? "კალათა ცარიელია." : "Your cart is empty."}</p>}
        </div>
      </aside>
    </div>
  );
}
