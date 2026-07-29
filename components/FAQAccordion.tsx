"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { storefrontFaqs } from "@/lib/storefront-assistant/knowledge";
import { useLanguage } from "./LanguageProvider";

export function FAQAccordion() {
  const [active, setActive] = useState<number | null>(0);
  const { language } = useLanguage();
  return <div className="mt-8 divide-y divide-hooma-text/10 border-y border-hooma-text/10">{storefrontFaqs.map((faq, index) => <div key={faq.id}><button type="button" onClick={() => setActive(active === index ? null : index)} className="flex w-full items-center justify-between gap-6 py-5 text-left font-medium"><span>{faq.question[language]}</span><ChevronDown size={18} className={`shrink-0 transition ${active === index ? "rotate-180" : ""}`} /></button>{active === index ? <p className="max-w-3xl pb-6 text-sm leading-7 text-hooma-muted">{faq.answer[language]}</p> : null}</div>)}</div>;
}
