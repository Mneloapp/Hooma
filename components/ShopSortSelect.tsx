"use client";

import { ChevronDown } from "lucide-react";
import { useLanguage } from "./LanguageProvider";

export function ShopSortSelect({ defaultValue }: { defaultValue: string }) {
  const { language } = useLanguage();
  const options = language === "ka"
    ? [["featured", "პოპულარული"], ["rating", "უმაღლესი შეფასება"], ["sales", "ყველაზე გაყიდვადი"], ["name", "სახელის მიხედვით"], ["fastest", "მომზადების დრო"]]
    : [["featured", "Popular"], ["rating", "Top rated"], ["sales", "Best selling"], ["name", "By name"], ["fastest", "Lead time"]];
  return <div className="relative"><select name="sort" defaultValue={defaultValue} aria-label={language === "ka" ? "დალაგება" : "Sort"} className="h-10 appearance-none rounded-xl border border-hooma-text/10 bg-white py-0 pl-3 pr-9 text-sm outline-none">{options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-hooma-muted" /></div>;
}

export function ShopSearchInput({ defaultValue }: { defaultValue: string }) {
  const { language } = useLanguage();
  return <input name="q" defaultValue={defaultValue} placeholder={language === "ka" ? "ძიება ამ კატალოგში" : "Search this catalog"} className="h-11 min-w-0 flex-1 px-4 text-sm outline-none" />;
}
