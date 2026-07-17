"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { useLanguage } from "./LanguageProvider";

const faqsKa = [
  ["როდის მივიღებ შეკვეთას?", "სტანდარტული კატალოგის პროდუქტებისთვის ვადა არის 3 სამუშაო დღე შეკვეთიდან მიწოდებამდე. ინდივიდუალური ან რთული პროდუქტის შემთხვევაში ზუსტ დროს შეკვეთის დადასტურებისას გაცნობებთ."],
  ["ყველა პროდუქტი წინასწარ მზად არის?", "არა. პროდუქტების უმეტესობა მზადდება შეკვეთის შემდეგ. ეს საშუალებას გვაძლევს შემოგთავაზოთ ფერისა და მასალის არჩევანი ზედმეტი მარაგის გარეშე."],
  ["შემიძლია ინდივიდუალური დეტალის შეკვეთა?", "დიახ. მოგვაწოდეთ ფოტო, ზომები და აღწერა. ოპერატორი შეაფასებს მოდელირების, მასალისა და წარმოების შესაძლებლობას."],
  ["რას ნიშნავს კატალოგის პრევიუ?", "სატესტო ეტაპზე პროდუქტების სტრუქტურა და შეკვეთის პროცესი მოწმდება. რეალური ფასი, ფოტო და წარმოების პროფილი ადმინ პანელიდან დამტკიცების შემდეგ გამოქვეყნდება."],
  ["გადახდა უკვე მუშაობს?", "ჯერ არა. საბანკო გადახდა დაემატება მხოლოდ შიდა შეკვეთის, წარმოების, ხარისხის კონტროლისა და ტრეკინგის სრული ტესტირების შემდეგ."],
];

const faqsEn = [
  ["When will I receive my order?", "Standard catalog products arrive within 3 business days from order to delivery. For custom or complex products, we confirm the exact timing when the order is approved."],
  ["Are all products kept in stock?", "No. Most products are made after you order, so you can choose colors and materials without unnecessary inventory."],
  ["Can I request a custom part?", "Yes. Send us a photo, dimensions, and a description. An operator will review modeling, material, and production feasibility."],
  ["What does catalog preview mean?", "During testing, we validate the product structure and ordering flow. The real price, photos, and production profile appear after admin approval."],
  ["Are payments live?", "Not yet. Bank payments will be enabled after the order, production, quality-control, and tracking flow has been fully tested."],
];

export function FAQAccordion() {
  const [active, setActive] = useState<number | null>(0);
  const { language } = useLanguage();
  const faqs = language === "ka" ? faqsKa : faqsEn;
  return <div className="mt-8 divide-y divide-hooma-text/10 border-y border-hooma-text/10">{faqs.map(([question, answer], index) => <div key={question}><button type="button" onClick={() => setActive(active === index ? null : index)} className="flex w-full items-center justify-between gap-6 py-5 text-left font-medium"><span>{question}</span><ChevronDown size={18} className={`shrink-0 transition ${active === index ? "rotate-180" : ""}`} /></button>{active === index ? <p className="max-w-3xl pb-6 text-sm leading-7 text-hooma-muted">{answer}</p> : null}</div>)}</div>;
}
