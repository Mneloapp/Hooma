import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type CartLine = {
  key: string;
  productId: string;
  variantId: string;
  slug: string;
  nameKa: string;
  nameEn: string;
  image: string;
  sizeLabel: string;
  material: string;
  color: string;
  quantity: number;
  unitPriceMinor: number;
};

type CartState = {
  lines: CartLine[];
  hydrated: boolean;
  add: (line: Omit<CartLine, "key">) => void;
  remove: (key: string) => void;
  setQuantity: (key: string, quantity: number) => void;
  clear: () => void;
  setHydrated: (hydrated: boolean) => void;
};

export function cartLineKey(line: Pick<CartLine, "productId" | "variantId" | "material" | "color">) {
  return [line.productId, line.variantId, line.material, line.color].join(":");
}

export const useCartStore = create<CartState>()(
  persist(
    (set) => ({
      lines: [],
      hydrated: false,
      add: (line) => set((state) => {
        const key = cartLineKey(line);
        const existing = state.lines.find((item) => item.key === key);
        if (existing) {
          return {
            lines: state.lines.map((item) => item.key === key
              ? { ...item, quantity: Math.min(20, item.quantity + line.quantity) }
              : item),
          };
        }
        return {
          lines: [...state.lines, { ...line, key, quantity: Math.min(20, Math.max(1, line.quantity)) }],
        };
      }),
      remove: (key) => set((state) => ({ lines: state.lines.filter((line) => line.key !== key) })),
      setQuantity: (key, quantity) => set((state) => ({
        lines: state.lines.map((line) => line.key === key
          ? { ...line, quantity: Math.min(20, Math.max(1, Math.floor(quantity))) }
          : line),
      })),
      clear: () => set({ lines: [] }),
      setHydrated: (hydrated) => set({ hydrated }),
    }),
    {
      name: "hooma-mobile-cart-v1",
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ lines }) => ({ lines }),
      onRehydrateStorage: () => (state) => state?.setHydrated(true),
    },
  ),
);
