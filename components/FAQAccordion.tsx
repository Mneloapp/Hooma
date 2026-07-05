"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";

export const faqs = [
  ["How does compressed furniture work?", "The furniture is packed compactly for delivery, then expands after opening. Exact expansion timing can vary by model, room temperature, and fabric."],
  ["Are prices available?", "Not yet. Product pages currently use request-price placeholders until Hooma finalizes pricing."],
  ["Can I choose fabric and color?", "Yes. The configurator is prepared for fabric and color choices. Final availability should be confirmed before order."],
  ["Will the final color match the screen?", "Final color may vary slightly depending on fabric and lighting."],
];

export function FAQAccordion({ items = faqs }: { items?: string[][] }) {
  const [open, setOpen] = useState(0);

  return (
    <div className="divide-y divide-hooma-text/10 rounded-2xl bg-white">
      {items.map(([question, answer], index) => (
        <div key={question}>
          <button onClick={() => setOpen(open === index ? -1 : index)} className="flex w-full items-center justify-between gap-5 p-5 text-left font-medium">
            {question}
            <ChevronDown size={18} className={`shrink-0 transition ${open === index ? "rotate-180" : ""}`} />
          </button>
          {open === index ? <p className="px-5 pb-5 text-sm leading-6 text-hooma-muted">{answer}</p> : null}
        </div>
      ))}
    </div>
  );
}
