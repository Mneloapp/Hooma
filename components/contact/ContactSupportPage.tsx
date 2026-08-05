"use client";

import Link from "next/link";
import { Boxes, Mail, ShieldCheck } from "lucide-react";
import { Button } from "@/components/Button";
import { useLanguage } from "@/components/LanguageProvider";
import { SectionTitle } from "@/components/SectionTitle";
import { ContactForm } from "./ContactForm";

export function ContactSupportPage({ enabled }: { enabled: boolean }) {
  const { language } = useLanguage();
  const georgian = language === "ka";

  return (
    <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
      <SectionTitle
        eyebrow={georgian ? "დახმარება და მხარდაჭერა" : "Help and support"}
        title={georgian ? "როგორ შეგვიძლია დაგეხმაროთ?" : "How can we help?"}
        copy={georgian
          ? "შეკვეთის, გადახდის, მიწოდების, პროდუქტის, ანგარიშის ან სხვა საკითხის შესახებ მოგვწერე. პასუხს შენს ელფოსტაზე მიიღებ."
          : "Contact us about an order, payment, delivery, product, account, or another issue. We will reply by email."}
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.45fr)_minmax(280px,0.75fr)]">
        <ContactForm enabled={enabled} />

        <aside className="space-y-5">
          <div className="rounded-[2rem] border border-hooma-text/10 bg-hooma-panel/75 p-6">
            <Mail size={24} className="text-hooma-accent" aria-hidden="true" />
            <h2 className="mt-4 text-xl font-semibold">{georgian ? "ელფოსტით დაკავშირება" : "Contact by email"}</h2>
            <p className="mt-3 text-sm leading-6 text-hooma-muted">
              {georgian
                ? "თუ ფოტოს ან ფაილის დართვა გჭირდება, მოგვწერე პირდაპირ."
                : "Email us directly when you need to attach a photo or file."}
            </p>
            <a href="mailto:support@hooma.ge" className="mt-4 inline-flex min-h-11 items-center font-semibold text-hooma-accent underline decoration-hooma-accent/30 underline-offset-4">
              support@hooma.ge
            </a>
          </div>

          <div className="rounded-[2rem] border border-hooma-text/10 bg-white/75 p-6 shadow-sm">
            <Boxes size={24} className="text-hooma-accent" aria-hidden="true" />
            <h2 className="mt-4 text-xl font-semibold">
              {georgian ? "ინდივიდუალური დეტალის დამზადება გჭირდება?" : "Need a custom part made?"}
            </h2>
            <p className="mt-3 text-sm leading-6 text-hooma-muted">
              {georgian
                ? "მოდელის, ნახაზის ან ფოტოს მიხედვით ფასის მოთხოვნისთვის გამოიყენე ინდივიდუალური შეკვეთის დაცული გვერდი."
                : "For a quote based on a model, drawing, or photo, use the secure custom-order page."}
            </p>
            <Button href="/account/custom-orders" className="mt-5 w-full">
              {georgian ? "ინდივიდუალური შეკვეთა" : "Custom order"}
            </Button>
          </div>

          <div className="rounded-[2rem] border border-emerald-200 bg-emerald-50/80 p-6 text-emerald-950">
            <ShieldCheck size={24} aria-hidden="true" />
            <h2 className="mt-4 text-lg font-semibold">{georgian ? "უსაფრთხო კომუნიკაცია" : "Secure communication"}</h2>
            <p className="mt-3 text-sm leading-6">
              {georgian
                ? "Hooma არასდროს მოგთხოვს პაროლს, CVV-ს ან ერთჯერად კოდს. მონაცემების დამუშავების შესახებ იხილე კონფიდენციალურობის პოლიტიკა."
                : "Hooma will never ask for your password, CVV, or one-time code. See our Privacy Policy for data-processing details."}
            </p>
            <Link href="/privacy" className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold underline underline-offset-4">
              {georgian ? "კონფიდენციალურობის პოლიტიკა" : "Privacy Policy"}
            </Link>
          </div>
        </aside>
      </div>
    </section>
  );
}
