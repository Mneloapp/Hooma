"use client";

import { SectionTitle } from "@/components/SectionTitle";
import { useLanguage } from "@/components/LanguageProvider";

export default function ContactPage() {
  const { language } = useLanguage();
  const georgian = language === "ka";
  return (
    <section className="mx-auto max-w-4xl px-4 py-20 sm:px-6 lg:px-8">
      <SectionTitle eyebrow={georgian ? "ინდივიდუალური მოთხოვნა" : "Custom request"} title={georgian ? "გჭირდება კონკრეტული დეტალი?" : "Need a specific part?"} copy={georgian ? "გამოგვიგზავნე ფოტო, ზომები, გამოყენების ადგილი და სასურველი მასალა. ოპერატორი შეაფასებს მოდელირებისა და დამზადების შესაძლებლობას." : "Send us a photo, dimensions, intended use, and preferred material. An operator will review modeling and production feasibility."} />
      <form className="mt-10 grid gap-4 rounded-[2rem] border border-hooma-text/10 bg-white/70 p-6 sm:grid-cols-2">
        <input placeholder={georgian ? "სახელი" : "Name"} className="rounded-full border border-hooma-text/10 px-4 py-3 outline-none focus:border-hooma-accent" />
        <input placeholder={georgian ? "ტელეფონი" : "Phone"} className="rounded-full border border-hooma-text/10 px-4 py-3 outline-none focus:border-hooma-accent" />
        <input placeholder={georgian ? "ელფოსტა" : "Email"} className="rounded-full border border-hooma-text/10 px-4 py-3 outline-none focus:border-hooma-accent sm:col-span-2" />
        <textarea placeholder={georgian ? "აღწერე რა დეტალი გჭირდება და სად გამოიყენება" : "Describe the part you need and how it will be used"} rows={6} className="rounded-[1.5rem] border border-hooma-text/10 px-4 py-3 outline-none focus:border-hooma-accent sm:col-span-2" />
        <button type="button" className="rounded-full bg-hooma-text px-5 py-3 font-medium text-white sm:col-span-2">{georgian ? "მოთხოვნის მომზადება" : "Prepare request"}</button>
        <p className="text-xs leading-5 text-hooma-muted sm:col-span-2">{georgian ? "ფორმის გაგზავნა ჩაირთვება Supabase Storage-სა და მოთხოვნების ცხრილთან დაკავშირების შემდეგ." : "Form submission will be enabled after connecting Supabase Storage and the requests table."}</p>
      </form>
    </section>
  );
}
