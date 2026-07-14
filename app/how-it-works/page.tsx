import { ArrowRight, CheckCircle2, ClipboardCheck, PackageCheck, Printer, Truck } from "lucide-react";
import { Button } from "@/components/Button";
import { Reveal } from "@/components/Reveal";

const steps = [
  ["01", "აირჩიე პროდუქტი", "მოძებნე კატეგორიებით, აირჩიე ვერსია, მასალა, ფერი და რაოდენობა.", ClipboardCheck],
  ["02", "ოპერატორი ამოწმებს", "ვამოწმებთ წარმოების პროფილს, მასალას, მისამართსა და სამდღიან შესაძლებლობას.", CheckCircle2],
  ["03", "ვამზადებთ", "დადასტურებული შეკვეთა გადადის წარმოების რიგში და იწყება მისი დამზადება.", Printer],
  ["04", "ხარისხის კონტროლი", "ვამოწმებთ ზომას, ზედაპირს, მოძრაობით ნაწილებსა და შეკვეთილ ფერს.", PackageCheck],
  ["05", "მიწოდება", "შეკვეთა გადაეცემა კურიერს და მომხმარებელი ხედავს განახლებულ სტატუსს.", Truck],
] as const;

export default function HowItWorks() {
  return <><section className="bg-hooma-text py-20 text-white"><div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8"><p className="text-xs font-semibold uppercase tracking-[0.26em] text-white/45">How Hooma works</p><h1 className="mt-5 max-w-4xl text-5xl font-semibold leading-none tracking-tight md:text-7xl">შეკვეთიდან დამზადებამდე — ერთი მკაფიო პროცესი.</h1><p className="mt-7 max-w-2xl text-lg leading-8 text-white/60">მომხმარებელი ირჩევს ნივთს. ტექნიკური სამუშაო, წარმოების რიგი და პრინტერის მართვა Hooma-ს პასუხისმგებლობაა.</p><Button href="/shop" variant="secondary" className="mt-9 border-white/20 bg-white/10 text-white hover:text-white">პროდუქტების ნახვა<ArrowRight size={16} className="ml-2" /></Button></div></section><section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8"><div className="grid gap-4">{steps.map(([number, title, copy, Icon], index) => <Reveal key={number} delay={index * 60}><div className="grid gap-5 rounded-[1.5rem] border border-hooma-text/10 bg-white/70 p-6 sm:grid-cols-[70px_52px_1fr] sm:items-center"><span className="text-sm font-semibold text-hooma-accent">{number}</span><span className="grid h-12 w-12 place-items-center rounded-2xl bg-hooma-panel text-hooma-accent"><Icon size={20} /></span><div><h2 className="text-xl font-semibold">{title}</h2><p className="mt-2 text-sm leading-6 text-hooma-muted">{copy}</p></div></div></Reveal>)}</div><div className="mt-12 rounded-[2rem] bg-[#dfe8da] p-8 md:p-10"><p className="text-sm font-semibold uppercase tracking-[0.2em] text-hooma-accent">3 სამუშაო დღე შეკვეთიდან მიწოდებამდე</p><h2 className="mt-4 max-w-3xl text-3xl font-semibold tracking-tight md:text-5xl">სისწრაფე არ ცვლის ხარისხის კონტროლს.</h2><p className="mt-5 max-w-2xl text-sm leading-7 text-hooma-muted">თუ პროდუქტი ინდივიდუალურ მოდელირებას, მრავალ ფირფიტას ან სპეციალურ მასალას მოითხოვს, ოპერატორი შეკვეთამდე გაცნობებს რეალურ ვადას.</p></div></section></>;
}
