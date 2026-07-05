"use client";

import { useLanguage } from "./LanguageProvider";

export function LanguageToggle() {
  const { language, setLanguage } = useLanguage();

  return (
    <div className="inline-flex h-10 items-center rounded-full border border-hooma-text/10 bg-white/55 p-1 text-xs font-medium">
      {(["en", "ka"] as const).map((item) => (
        <button
          key={item}
          type="button"
          onClick={() => setLanguage(item)}
          className={`h-8 rounded-full px-3 transition ${language === item ? "bg-hooma-text text-white" : "text-hooma-muted hover:text-hooma-text"}`}
          aria-pressed={language === item}
        >
          {item === "en" ? "EN" : "KA"}
        </button>
      ))}
    </div>
  );
}
