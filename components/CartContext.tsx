"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

export type CartItem = {
  productId: string;
  variantId: string;
  name: string;
  image: string;
  fabric: string;
  color: string;
  orientation: string;
  quantity: number;
  pricePlaceholder: string;
};

type CartContextValue = {
  items: CartItem[];
  isOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
  addItem: (item: CartItem) => void;
  updateQuantity: (key: string, quantity: number) => void;
  count: number;
};

const CartContext = createContext<CartContextValue | null>(null);

const keyFor = (item: Pick<CartItem, "productId" | "variantId" | "fabric" | "color" | "orientation">) =>
  [item.productId, item.variantId, item.fabric, item.color, item.orientation].join("|");

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  const value = useMemo<CartContextValue>(
    () => ({
      items,
      isOpen,
      openCart: () => setIsOpen(true),
      closeCart: () => setIsOpen(false),
      addItem: (item) => {
        setItems((current) => {
          const next = [...current];
          const index = next.findIndex((existing) => keyFor(existing) === keyFor(item));
          if (index >= 0) next[index] = { ...next[index], quantity: next[index].quantity + item.quantity };
          else next.push(item);
          return next;
        });
        setIsOpen(true);
      },
      updateQuantity: (key, quantity) =>
        setItems((current) => current.map((item) => (keyFor(item) === key ? { ...item, quantity } : item)).filter((item) => item.quantity > 0)),
      count: items.reduce((sum, item) => sum + item.quantity, 0),
    }),
    [items, isOpen],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used inside CartProvider");
  return { ...context, keyFor };
}
