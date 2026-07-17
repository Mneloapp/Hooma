"use client";

import Link from "next/link";
import { BrandLogo } from "./BrandLogo";
import { useLanguage } from "./LanguageProvider";

export function Footer() {
  const { language, t } = useLanguage();

  return (
    <footer className="border-t border-hooma-text/10 bg-hooma-text text-white">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr_1fr] lg:px-8">
        <div>
          <BrandLogo inverted className="w-28" imageClassName="max-h-24" />
          <p className="mt-4 max-w-sm text-sm leading-6 text-white/65">{t.footer.copy}</p>
        </div>
        <div className="grid gap-3 text-sm text-white/65">
          <Link href="/shop">{t.footer.shop}</Link>
          <Link href="/how-it-works">{t.footer.howItWorks}</Link>
          <Link href="/faq">{t.footer.faq}</Link>
        </div>
        <div className="grid content-start gap-3 text-sm text-white/65">
          <Link href="/about">{language === "ka" ? "Hooma-ს შესახებ" : "About Hooma"}</Link>
          <Link href="/contact">{language === "ka" ? "კონტაქტი" : "Contact"}</Link>
          <Link href="/privacy">{language === "ka" ? "კონფიდენციალურობა" : "Privacy"}</Link>
          <Link href="/terms">{language === "ka" ? "გამოყენების პირობები" : "Terms of use"}</Link>
        </div>
        <div className="text-sm text-white/65">
          <p>hooma.ge</p>
          <p>hoomalive.com</p>
          <p className="mt-4">{t.footer.location}</p>
        </div>
      </div>
    </footer>
  );
}
