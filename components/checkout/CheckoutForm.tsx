"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { CreditCard, ExternalLink, LockKeyhole, MapPin } from "lucide-react";
import { Button } from "@/components/Button";
import { useCart } from "@/components/CartContext";
import { createOrderAction } from "@/app/auth/actions";
import { useLanguage } from "@/components/LanguageProvider";
import {
  clearCheckoutPaymentSession,
  getOrCreateCheckoutKey,
} from "@/components/checkout/payment-session-storage";

const deliveryCityLabels: Record<string, { ka: string; en: string }> = {
  tbilisi: { ka: "თბილისი", en: "Tbilisi" }, batumi: { ka: "ბათუმი", en: "Batumi" },
  kutaisi: { ka: "ქუთაისი", en: "Kutaisi" }, rustavi: { ka: "რუსთავი", en: "Rustavi" },
  gori: { ka: "გორი", en: "Gori" }, zugdidi: { ka: "ზუგდიდი", en: "Zugdidi" },
  poti: { ka: "ფოთი", en: "Poti" }, telavi: { ka: "თელავი", en: "Telavi" },
  other: { ka: "სხვა ქალაქი", en: "Other city" },
};

type CheckoutInitialValues = { fullName: string; phone: string; email: string; city: string; addressLine1: string; addressLine2: string; postalCode: string; latitude: number | null; longitude: number | null; googleMapsUrl: string };
type CheckoutFormProps = {
  initialValues: CheckoutInitialValues;
  paymentAvailable: boolean;
  paymentMethods: string[];
};

const money = new Intl.NumberFormat("ka-GE", {
  style: "currency",
  currency: "GEL",
  minimumFractionDigits: 2,
});

export function CheckoutForm({ initialValues, paymentAvailable, paymentMethods }: CheckoutFormProps) {
  const { language } = useLanguage();
  const georgian = language === "ka";
  const { items } = useCart();
  const [message, setMessage] = useState("");
  const [city, setCity] = useState(initialValues.city);
  const [addressLine1, setAddressLine1] = useState(initialValues.addressLine1);
  const [latitude, setLatitude] = useState(initialValues.latitude);
  const [longitude, setLongitude] = useState(initialValues.longitude);
  const [isPending, startTransition] = useTransition();
  const checkoutKey = useRef("");
  const checkoutFingerprint = useRef("");
  const pricesComplete = items.length > 0 && items.every(
    (item) => typeof item.price === "number" && Number.isFinite(item.price) && item.price > 0,
  );
  const subtotal = pricesComplete
    ? items.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0)
    : 0;

  useEffect(() => {
    if (initialValues.city) return;
    const stored = window.localStorage.getItem("hooma-delivery-city") ?? "";
    setCity(deliveryCityLabels[stored]?.[language] ?? stored);
    setLatitude(null);
    setLongitude(null);
  }, [initialValues.city, language]);

  function clearSavedCoordinates() {
    setLatitude(null);
    setLongitude(null);
  }

  function submit(formData: FormData) {
    if (!paymentAvailable) {
      setMessage(georgian
        ? "BOG ონლაინ გადახდა დროებით მიუწვდომელია. თანხა არ ჩამოგეჭრება."
        : "BOG online payment is temporarily unavailable. You will not be charged.");
      return;
    }
    const payloadWithoutKey = {
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
      expected_total_minor: pricesComplete ? Math.round(subtotal * 100) : null,
      items,
    };
    const paymentFingerprint = JSON.stringify({
      guest_email: payloadWithoutKey.guest_email,
      guest_phone: payloadWithoutKey.guest_phone,
      full_name: payloadWithoutKey.full_name,
      city: payloadWithoutKey.city,
      address_line_1: payloadWithoutKey.address_line_1,
      address_line_2: payloadWithoutKey.address_line_2,
      postal_code: payloadWithoutKey.postal_code,
      latitude: payloadWithoutKey.latitude,
      longitude: payloadWithoutKey.longitude,
      notes: payloadWithoutKey.notes,
      expected_total_minor: payloadWithoutKey.expected_total_minor,
      items: items.map((item) => ({
        product_id: item.product_id,
        variant_id: item.variant_id,
        material: item.material,
        color: item.color,
        quantity: item.quantity,
      })),
    });
    if (!checkoutKey.current || checkoutFingerprint.current !== paymentFingerprint) {
      checkoutKey.current = getOrCreateCheckoutKey(paymentFingerprint);
      checkoutFingerprint.current = paymentFingerprint;
    }
    const payload = {
      ...payloadWithoutKey,
      checkout_key: checkoutKey.current,
    };
    const actionData = new FormData();
    actionData.set("payload", JSON.stringify(payload));
    startTransition(async () => {
      try {
        const result = await createOrderAction(actionData);
        setMessage(result.message);
        if (result.resetCheckout) {
          clearCheckoutPaymentSession();
          checkoutKey.current = "";
          checkoutFingerprint.current = "";
        }
        if (result.ok && result.redirectUrl) window.location.assign(result.redirectUrl);
      } catch {
        setMessage(georgian
          ? "კავშირი დროებით შეწყდა. თანხის ორჯერ ჩამოჭრის თავიდან ასაცილებლად იგივე გადახდის სესიას შევინარჩუნებთ — სცადე ხელახლა."
          : "The connection was interrupted. We will keep the same payment session to prevent duplicate charges; try again.");
      }
    });
  }

  return (
    <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:px-6 lg:grid-cols-[1fr_420px] lg:px-8">
      <form action={submit} className="order-2 space-y-5 rounded-[2rem] bg-white/75 p-6 shadow-soft lg:order-1">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-hooma-muted">{georgian ? "უსაფრთხო გადახდა" : "Secure checkout"}</p>
          <h1 className="mt-3 text-3xl font-medium">{georgian ? "შეკვეთის გაფორმება" : "Complete your order"}</h1>
          <p className="mt-3 text-hooma-muted">{georgian ? "სრული თანხა გადაიხდება საქართველოს ბანკის (BOG) უსაფრთხო გვერდზე. განვადება და თანხის გაყოფა არ გამოიყენება; წარმოებას გადახდის დადასტურების შემდეგ ოპერატორი ამოწმებს." : "The full amount is paid on Bank of Georgia’s (BOG) secure page. Installments and split payments are not used; an operator reviews the order after payment confirmation."}</p>
        </div>
        <div className={`rounded-2xl border p-4 text-sm ${paymentAvailable ? "border-emerald-200 bg-emerald-50 text-emerald-950" : "border-amber-200 bg-amber-50 text-amber-950"}`}>
          <div className="flex items-start gap-3">
            {paymentAvailable ? <LockKeyhole className="mt-0.5 shrink-0" size={18} /> : <CreditCard className="mt-0.5 shrink-0" size={18} />}
            <div>
              <p className="font-semibold">{paymentAvailable ? (georgian ? "საქართველოს ბანკით სრული გადახდა" : "Bank of Georgia full payment") : (georgian ? "გადახდა დროებით მიუწვდომელია" : "Payment temporarily unavailable")}</p>
              <p className="mt-1 leading-6">{paymentAvailable
                ? (georgian
                  ? `ხელმისაწვდომია: ${paymentMethods.map((method) => method === "card" ? "ბარათი" : method === "apple_pay" ? "Apple Pay" : "Google Pay").join(", ")}. ბარათის სრული მონაცემები Hooma-ში არ ინახება.`
                  : `Available: ${paymentMethods.map((method) => method === "card" ? "Card" : method === "apple_pay" ? "Apple Pay" : "Google Pay").join(", ")}. Hooma does not store full card details.`)
                : (georgian ? "შეკვეთას ვერ გააგზავნი და თანხა არ ჩამოგეჭრება, სანამ საბანკო კავშირი არ გააქტიურდება." : "The order cannot be submitted and you will not be charged until the bank connection is activated.")}</p>
            </div>
          </div>
        </div>
        <fieldset disabled={!paymentAvailable || isPending} className="space-y-5 disabled:opacity-60">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium">{georgian ? "სახელი და გვარი" : "Full name"}<input name="full_name" autoComplete="name" required defaultValue={initialValues.fullName} className="mt-2 w-full rounded-full border border-hooma-text/10 px-4 py-3 outline-none focus:border-hooma-accent" /></label>
            <label className="block text-sm font-medium">{georgian ? "ტელეფონი" : "Phone"}<input name="guest_phone" type="tel" autoComplete="tel" required defaultValue={initialValues.phone} className="mt-2 w-full rounded-full border border-hooma-text/10 px-4 py-3 outline-none focus:border-hooma-accent" /></label>
            <label className="block text-sm font-medium">{georgian ? "ანგარიშის ელფოსტა" : "Account email"}<input name="guest_email" type="email" autoComplete="email" required readOnly aria-readonly="true" defaultValue={initialValues.email} className="mt-2 w-full cursor-not-allowed rounded-full border border-hooma-text/10 bg-hooma-panel/70 px-4 py-3 text-hooma-muted outline-none" /><span className="mt-1 block text-xs font-normal text-hooma-muted">{georgian ? "ქვითარი და სტატუსი ამ ანგარიშის ელფოსტას უკავშირდება." : "The receipt and status are linked to this account email."}</span></label>
            <label className="block text-sm font-medium">{georgian ? "ქალაქი" : "City"}<input name="city" autoComplete="address-level2" required value={city} onChange={(event) => { setCity(event.target.value); clearSavedCoordinates(); }} className="mt-2 w-full rounded-full border border-hooma-text/10 px-4 py-3 outline-none focus:border-hooma-accent" /></label>
          </div>
          <input type="hidden" name="latitude" value={latitude ?? ""} /><input type="hidden" name="longitude" value={longitude ?? ""} />
          {initialValues.googleMapsUrl && latitude !== null && longitude !== null ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900"><span className="inline-flex items-center gap-2 font-semibold"><MapPin size={16} />{georgian ? "შენახული ზუსტი ლოკაცია დაემატება შეკვეთას" : "Your saved exact location will be added to the order"}</span><a href={initialValues.googleMapsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold underline">{georgian ? "რუკაზე ნახვა" : "View map"}<ExternalLink size={13} /></a></div> : null}
          <label className="block text-sm font-medium">{georgian ? "მიწოდების მისამართი" : "Delivery address"}<input name="address_line_1" autoComplete="address-line1" required value={addressLine1} onChange={(event) => { setAddressLine1(event.target.value); clearSavedCoordinates(); }} className="mt-2 w-full rounded-full border border-hooma-text/10 px-4 py-3 outline-none focus:border-hooma-accent" /></label>
          <div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm font-medium">{georgian ? "სადარბაზო, სართული, ბინა" : "Entrance, floor, apartment"}<input name="address_line_2" autoComplete="address-line2" defaultValue={initialValues.addressLine2} className="mt-2 w-full rounded-full border border-hooma-text/10 px-4 py-3 outline-none focus:border-hooma-accent" /></label><label className="block text-sm font-medium">{georgian ? "საფოსტო ინდექსი" : "Postal code"}<input name="postal_code" autoComplete="postal-code" defaultValue={initialValues.postalCode} className="mt-2 w-full rounded-full border border-hooma-text/10 px-4 py-3 outline-none focus:border-hooma-accent" /></label></div>
          <label className="block text-sm font-medium">{georgian ? "შენიშვნა" : "Notes"}<textarea name="notes" rows={4} className="mt-2 w-full rounded-[1.5rem] border border-hooma-text/10 px-4 py-3 outline-none focus:border-hooma-accent" /></label>
        </fieldset>
        {message ? <p role="alert" aria-live="polite" className="rounded-2xl bg-hooma-panel p-4 text-sm text-hooma-text">{message}</p> : null}
        <Button className="w-full" disabled={!items.length || !pricesComplete || isPending || !paymentAvailable}>{isPending ? (georgian ? "გადახდა მზადდება..." : "Preparing payment...") : pricesComplete ? (georgian ? `${money.format(subtotal)} — სრული თანხის გადახდა` : `Pay ${money.format(subtotal)} in full`) : (georgian ? "ფასი გადასამოწმებელია" : "Price requires review")}</Button>
      </form>
      <aside className="order-1 h-fit rounded-[2rem] bg-white/75 p-6 shadow-soft lg:order-2 lg:sticky lg:top-24">
        <h2 className="text-xl font-medium">{georgian ? "შეკვეთის შეჯამება" : "Order summary"}</h2>
        <div className="mt-5 space-y-4">
          {items.length ? items.map((item) => (
            <div key={`${item.product_id}-${item.variant_id}-${item.material}-${item.color}`} className="border-b border-hooma-text/10 pb-4 last:border-0">
              <div className="flex justify-between gap-4">
                <p className="font-medium">{georgian ? item.name : item.product_name}</p>
                <p className="text-sm text-hooma-muted">x{item.quantity}</p>
              </div>
              <p className="mt-1 text-sm text-hooma-muted">{item.size_label} / {item.material} / {item.color}</p>
              <p className="mt-2 text-sm font-medium">{typeof item.price === "number" ? money.format(item.price * item.quantity) : item.pricePlaceholder}</p>
            </div>
          )) : <p className="text-sm text-hooma-muted">{georgian ? "კალათა ცარიელია." : "Your cart is empty."}</p>}
        </div>
        {items.length ? <dl className="mt-5 space-y-3 border-t border-hooma-text/10 pt-5 text-sm">
          <div className="flex justify-between gap-4"><dt className="text-hooma-muted">{georgian ? "პროდუქტები" : "Subtotal"}</dt><dd className="font-semibold">{pricesComplete ? money.format(subtotal) : "—"}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-hooma-muted">{georgian ? "მიწოდება" : "Delivery"}</dt><dd className="font-semibold">{georgian ? "უფასო" : "Free"}</dd></div>
          <div className="flex justify-between gap-4 border-t border-hooma-text/10 pt-3 text-base"><dt className="font-semibold">{georgian ? "სულ გადასახდელი" : "Total due"}</dt><dd className="font-semibold">{pricesComplete ? money.format(subtotal) : "—"}</dd></div>
        </dl> : null}
      </aside>
    </div>
  );
}
