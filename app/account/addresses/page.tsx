"use client";

import { useLanguage } from "@/components/LanguageProvider";

export default function AccountAddressesPage() {
  const { language } = useLanguage();
  const georgian = language === "ka";
  return (
    <div className="space-y-6">
      <div><p className="text-xs uppercase tracking-[0.28em] text-hooma-muted">{georgian ? "მიწოდება" : "Delivery"}</p><h1 className="mt-3 text-4xl font-medium">{georgian ? "მისამართები" : "Addresses"}</h1></div>
      <form className="grid gap-5 rounded-[2rem] bg-white/75 p-6 shadow-soft md:grid-cols-2">
        <label className="block text-sm font-medium">{georgian ? "სახელი და გვარი" : "Full name"}<input className="mt-2 w-full rounded-full border border-hooma-text/10 px-4 py-3" /></label>
        <label className="block text-sm font-medium">{georgian ? "ტელეფონი" : "Phone"}<input className="mt-2 w-full rounded-full border border-hooma-text/10 px-4 py-3" /></label>
        <label className="block text-sm font-medium">{georgian ? "ქალაქი" : "City"}<input className="mt-2 w-full rounded-full border border-hooma-text/10 px-4 py-3" /></label>
        <label className="block text-sm font-medium">{georgian ? "საფოსტო ინდექსი" : "Postal code"}<input className="mt-2 w-full rounded-full border border-hooma-text/10 px-4 py-3" /></label>
        <label className="block text-sm font-medium md:col-span-2">{georgian ? "მისამართი" : "Address line"}<input className="mt-2 w-full rounded-full border border-hooma-text/10 px-4 py-3" /></label>
        <button className="rounded-full bg-hooma-text px-5 py-3 text-sm font-medium text-white md:w-fit">{georgian ? "მისამართის შენახვა" : "Save address"}</button>
      </form>
    </div>
  );
}
