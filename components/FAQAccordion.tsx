"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";

const faqs = [
  ["როდის მივიღებ შეკვეთას?", "სტანდარტული კატალოგის პროდუქტებისთვის ვადა არის 3 სამუშაო დღე შეკვეთიდან მიწოდებამდე. ინდივიდუალური ან რთული პროდუქტის შემთხვევაში ზუსტ დროს შეკვეთის დადასტურებისას გაცნობებთ."],
  ["ყველა პროდუქტი წინასწარ მზად არის?", "არა. პროდუქტების უმეტესობა მზადდება შეკვეთის შემდეგ. ეს საშუალებას გვაძლევს შემოგთავაზოთ ფერისა და მასალის არჩევანი ზედმეტი მარაგის გარეშე."],
  ["შემიძლია ინდივიდუალური დეტალის შეკვეთა?", "დიახ. მოგვაწოდეთ ფოტო, ზომები და აღწერა. ოპერატორი შეაფასებს მოდელირების, მასალისა და წარმოების შესაძლებლობას."],
  ["რას ნიშნავს კატალოგის პრევიუ?", "სატესტო ეტაპზე პროდუქტების სტრუქტურა და შეკვეთის პროცესი მოწმდება. რეალური ფასი, ფოტო და წარმოების პროფილი ადმინ პანელიდან დამტკიცების შემდეგ გამოქვეყნდება."],
  ["გადახდა უკვე მუშაობს?", "ჯერ არა. საბანკო გადახდა დაემატება მხოლოდ შიდა შეკვეთის, წარმოების, ხარისხის კონტროლისა და ტრეკინგის სრული ტესტირების შემდეგ."],
];

export function FAQAccordion() {
  const [active, setActive] = useState<number | null>(0);
  return <div className="mt-8 divide-y divide-hooma-text/10 border-y border-hooma-text/10">{faqs.map(([question, answer], index) => <div key={question}><button type="button" onClick={() => setActive(active === index ? null : index)} className="flex w-full items-center justify-between gap-6 py-5 text-left font-medium"><span>{question}</span><ChevronDown size={18} className={`shrink-0 transition ${active === index ? "rotate-180" : ""}`} /></button>{active === index ? <p className="max-w-3xl pb-6 text-sm leading-7 text-hooma-muted">{answer}</p> : null}</div>)}</div>;
}
