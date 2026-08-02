"use client";

import { PackageOpen } from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";
import { PRODUCT_SUPPLY_POLICY } from "@/lib/storefront-assistant/knowledge";

export function ProductSupplyNotice({ className = "" }: { className?: string }) {
  const { language } = useLanguage();

  return (
    <aside
      role="note"
      className={`rounded-2xl border border-amber-200 bg-amber-50 p-4 text-amber-950 ${className}`}
    >
      <div className="flex items-start gap-3">
        <PackageOpen size={18} className="mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-semibold">{PRODUCT_SUPPLY_POLICY.title[language]}</p>
          <p className="mt-1 text-xs leading-5 text-amber-900/80">{PRODUCT_SUPPLY_POLICY.body[language]}</p>
        </div>
      </div>
    </aside>
  );
}
