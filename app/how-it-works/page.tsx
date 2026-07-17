"use client";

import { ArrowRight, CheckCircle2, ClipboardCheck, PackageCheck, Printer, Truck } from "lucide-react";
import { Button } from "@/components/Button";
import { Reveal } from "@/components/Reveal";
import { useLanguage } from "@/components/LanguageProvider";

const stepsKa = [
  ["01", "აირჩიე პროდუქტი", "მოძებნე კატეგორიებით, აირჩიე ვერსია, მასალა, ფერი და რაოდენობა.", ClipboardCheck],
  ["02", "ოპერატორი ამოწმებს", "ვამოწმებთ წარმოების პროფილს, მასალას, მისამართსა და სამდღიან შესაძლებლობას.", CheckCircle2],
  ["03", "ვამზადებთ", "დადასტურებული შეკვეთა გადადის წარმოების რიგში და იწყება მისი დამზადება.", Printer],
  ["04", "ხარისხის კონტროლი", "ვამოწმებთ ზომას, ზედაპირს, მოძრაობით ნაწილებსა და შეკვეთილ ფერს.", PackageCheck],
  ["05", "მიწოდება", "შეკვეთა გადაეცემა კურიერს და მომხმარებელი ხედავს განახლებულ სტატუსს.", Truck],
] as const;

const stepsEn = [
  ["01", "Choose a product", "Browse categories and choose the version, material, color, and quantity.", ClipboardCheck],
  ["02", "Operator review", "We check the production profile, material, address, and three-day feasibility.", CheckCircle2],
  ["03", "We make it", "The confirmed order enters the production queue and manufacturing begins.", Printer],
  ["04", "Quality control", "We check dimensions, surface, moving parts, and the selected color.", PackageCheck],
  ["05", "Delivery", "The order is handed to the courier and you see its updated status.", Truck],
] as const;

export default function HowItWorks() {
  const { language } = useLanguage();
  const georgian = language === "ka";
  const steps = georgian ? stepsKa : stepsEn;
  return <><section className="bg-hooma-text py-20 text-white"><div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8"><p className="text-xs font-semibold uppercase tracking-[0.26em] text-white/45">{georgian ? "როგორ მუშაობს Hooma" : "How Hooma works"}</p><h1 className="mt-5 max-w-4xl text-5xl font-semibold leading-none tracking-tight md:text-7xl">{georgian ? "შეკვეთიდან დამზადებამდე — ერთი მკაფიო პროცესი." : "From order to production — one clear process."}</h1><p className="mt-7 max-w-2xl text-lg leading-8 text-white/60">{georgian ? "მომხმარებელი ირჩევს ნივთს. ტექნიკური სამუშაო, წარმოების რიგი და პრინტერის მართვა Hooma-ს პასუხისმგებლობაა." : "You choose the product. Hooma handles the technical work, production queue, and printer management."}</p><Button href="/shop" variant="secondary" className="mt-9 border-white/20 bg-white/10 text-white hover:text-white">{georgian ? "პროდუქტების ნახვა" : "View products"}<ArrowRight size={16} className="ml-2" /></Button></div></section><section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8"><div className="grid gap-4">{steps.map(([number, title, copy, Icon], index) => <Reveal key={number} delay={index * 60}><div className="grid gap-5 rounded-[1.5rem] border border-hooma-text/10 bg-white/70 p-6 sm:grid-cols-[70px_52px_1fr] sm:items-center"><span className="text-sm font-semibold text-hooma-accent">{number}</span><span className="grid h-12 w-12 place-items-center rounded-2xl bg-hooma-panel text-hooma-accent"><Icon size={20} /></span><div><h2 className="text-xl font-semibold">{title}</h2><p className="mt-2 text-sm leading-6 text-hooma-muted">{copy}</p></div></div></Reveal>)}</div><div className="mt-12 rounded-[2rem] bg-[#dfe8da] p-8 md:p-10"><p className="text-sm font-semibold uppercase tracking-[0.2em] text-hooma-accent">{georgian ? "3 სამუშაო დღე შეკვეთიდან მიწოდებამდე" : "3 business days from order to delivery"}</p><h2 className="mt-4 max-w-3xl text-3xl font-semibold tracking-tight md:text-5xl">{georgian ? "სისწრაფე არ ცვლის ხარისხის კონტროლს." : "Speed never replaces quality control."}</h2><p className="mt-5 max-w-2xl text-sm leading-7 text-hooma-muted">{georgian ? "თუ პროდუქტი ინდივიდუალურ მოდელირებას, მრავალ ფირფიტას ან სპეციალურ მასალას მოითხოვს, ოპერატორი შეკვეთამდე გაცნობებს რეალურ ვადას." : "If a product requires custom modeling, multiple build plates, or a special material, an operator will confirm the actual timeline before the order."}</p></div></section></>;
}
