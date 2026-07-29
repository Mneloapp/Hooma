import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { Language } from "@/types";

type SettingsState = {
  language: Language;
  onboardingComplete: boolean;
  hydrated: boolean;
  setLanguage: (language: Language) => void;
  finishOnboarding: () => void;
  setHydrated: (hydrated: boolean) => void;
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      language: "ka",
      onboardingComplete: false,
      hydrated: false,
      setLanguage: (language) => set({ language }),
      finishOnboarding: () => set({ onboardingComplete: true }),
      setHydrated: (hydrated) => set({ hydrated }),
    }),
    {
      name: "hooma-mobile-settings-v1",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ language, onboardingComplete }) => ({ language, onboardingComplete }),
      onRehydrateStorage: () => (state) => state?.setHydrated(true),
    },
  ),
);
