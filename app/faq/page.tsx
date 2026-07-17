"use client";

import { FAQAccordion } from "@/components/FAQAccordion";
import { SectionTitle } from "@/components/SectionTitle";
import { useLanguage } from "@/components/LanguageProvider";

export default function FAQ() {
  const { language } = useLanguage();
  return (
    <section className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
      <SectionTitle eyebrow="FAQ" title={language === "ka" ? "ყველაფერი, რაც შეკვეთამდე უნდა იცოდე." : "Everything you need to know before ordering."} />
      <FAQAccordion />
    </section>
  );
}
