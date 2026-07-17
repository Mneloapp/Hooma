"use client";

import { SectionTitle } from "@/components/SectionTitle";
import { useLanguage } from "@/components/LanguageProvider";

export default function AboutPage() {
  const { language } = useLanguage();
  const georgian = language === "ka";
  return (
    <section className="mx-auto max-w-4xl px-4 py-20 sm:px-6 lg:px-8">
      <SectionTitle eyebrow={georgian ? "Hooma-ს შესახებ" : "About Hooma"} title={georgian ? "სასარგებლო ნივთები, დამზადებული მაშინ, როცა ნამდვილად გჭირდება." : "Useful objects, made when you actually need them."} />
      <div className="mt-10 space-y-6 text-lg leading-8 text-hooma-muted">
        {(georgian ? [
          "Hooma არის ქართული ონლაინ მაღაზია, რომელიც შერჩეულ ყოველდღიურ პროდუქტებს შეკვეთის შემდეგ ამზადებს.",
          "ჩვენთვის წარმოების ტექნოლოგია კულისებში რჩება. მომხმარებელმა უნდა მიიღოს მკაფიო არჩევანი, სანდო ვადა, ხარისხიანი პროდუქტი და გამჭვირვალე ტრეკინგი.",
          "კატალოგში პროდუქტი მხოლოდ მას შემდეგ გამოქვეყნდება, რაც დადასტურდება მისი წარმოების პროფილი და უსაფრთხო გამოყენება.",
        ] : [
          "Hooma is a Georgian online store that makes selected everyday products after an order is placed.",
          "Production technology stays behind the scenes. Customers get a clear choice, a reliable timeline, a quality product, and transparent tracking.",
          "A product is published in the catalog only after its production profile and safe use have been confirmed.",
        ]).map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
      </div>
    </section>
  );
}
