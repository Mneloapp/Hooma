"use client";

import type { ReactNode } from "react";
import { useLanguage } from "./LanguageProvider";

/** Renders locale-aware copy inside Server Components without duplicating page logic. */
export function LocalizedText({ ka, en }: { ka: ReactNode; en: ReactNode }) {
  const { language } = useLanguage();
  return <>{language === "ka" ? ka : en}</>;
}
