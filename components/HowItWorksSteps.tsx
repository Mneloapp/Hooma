"use client";

import { CheckCircle2, ClipboardCheck, PackageCheck, Printer } from "lucide-react";
import { useLanguage } from "./LanguageProvider";

const stepsKa = [
  ["აირჩიე", "იპოვე პროდუქტი და აირჩიე მასალა და ფერი.", ClipboardCheck],
  ["დადასტურება", "ოპერატორი ამოწმებს შეკვეთას და წარმოების შესაძლებლობას.", CheckCircle2],
  ["წარმოება", "შეკვეთა გადადის პრინტერის რიგში.", Printer],
  ["მიწოდება", "ხარისხის კონტროლის შემდეგ პროდუქტი მზადაა მიწოდებისთვის.", PackageCheck],
] as const;

const stepsEn = [
  ["Choose", "Find a product and select its material and color.", ClipboardCheck],
  ["Confirmation", "An operator checks the order and production feasibility.", CheckCircle2],
  ["Production", "The order moves into the printer queue.", Printer],
  ["Delivery", "After quality control, the product is ready for delivery.", PackageCheck],
] as const;

export function HowItWorksSteps({ detailed = false }: { detailed?: boolean }) {
  const { language } = useLanguage();
  const steps = language === "ka" ? stepsKa : stepsEn;
  return <div className={`grid gap-4 ${detailed ? "lg:grid-cols-4" : "md:grid-cols-4"}`}>{steps.map(([title, copy, Icon], index) => <div key={title} className="rounded-2xl border border-hooma-text/10 bg-white/70 p-5"><span className="text-xs font-semibold text-hooma-accent">0{index + 1}</span><Icon size={20} className="mt-8 text-hooma-accent" /><h3 className="mt-5 font-semibold">{title}</h3><p className="mt-2 text-sm leading-6 text-hooma-muted">{copy}</p></div>)}</div>;
}
