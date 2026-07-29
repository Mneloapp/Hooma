import { useSettingsStore } from "@/stores/settings";

export function useCopy() {
  const language = useSettingsStore((state) => state.language);
  return {
    language,
    t: (ka: string, en: string) => language === "ka" ? ka : en,
    money: (minor: number) => new Intl.NumberFormat(language === "ka" ? "ka-GE" : "en-GB", {
      style: "currency",
      currency: "GEL",
      minimumFractionDigits: 2,
    }).format(minor / 100),
  };
}
