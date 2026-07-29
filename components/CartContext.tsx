"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type CartItem = {
  product_id: string;
  variant_id: string;
  inventory_id?: string | null;
  product_name: string;
  name: string;
  image: string;
  sku: string;
  size_label: string;
  material: string;
  color: string;
  quantity: number;
  price?: number | null;
  pricePlaceholder: string;
  price_placeholder?: string;
};

type CartContextValue = {
  items: CartItem[];
  isOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
  addItem: (item: CartItem) => void;
  updateQuantity: (key: string, quantity: number) => void;
  clearCart: () => void;
  count: number;
};

const CartContext = createContext<CartContextValue | null>(null);
const CART_STORAGE_KEY = "hooma-cart";
const CART_STORAGE_VERSION = 1;
const MAX_STORED_CART_ITEMS = 100;

type StoredCart = {
  version: typeof CART_STORAGE_VERSION;
  items: CartItem[];
};

const keyFor = (item: Pick<CartItem, "product_id" | "variant_id" | "material" | "color">) =>
  [item.product_id, item.variant_id, item.material, item.color].join("|");

const isShortString = (value: unknown, maxLength = 500) =>
  typeof value === "string" && value.length <= maxLength;

function parseStoredCart(value: string | null): CartItem[] {
  if (!value) return [];
  try {
    const stored = JSON.parse(value) as Partial<StoredCart> | null;
    if (stored?.version !== CART_STORAGE_VERSION || !Array.isArray(stored.items)) return [];
    return stored.items.slice(0, MAX_STORED_CART_ITEMS).filter((item): item is CartItem => (
      item !== null
      && typeof item === "object"
      && isShortString(item.product_id, 128)
      && isShortString(item.variant_id, 128)
      && (item.inventory_id === undefined || item.inventory_id === null || isShortString(item.inventory_id, 128))
      && isShortString(item.product_name)
      && isShortString(item.name)
      && isShortString(item.image, 2_000)
      && isShortString(item.sku, 128)
      && isShortString(item.size_label, 128)
      && isShortString(item.material, 128)
      && isShortString(item.color, 128)
      && Number.isInteger(item.quantity)
      && item.quantity > 0
      && item.quantity <= 100
      && (item.price === undefined || item.price === null || (Number.isFinite(item.price) && item.price >= 0))
      && isShortString(item.pricePlaceholder, 200)
      && (item.price_placeholder === undefined || isShortString(item.price_placeholder, 200))
    ));
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [storageReady, setStorageReady] = useState(false);

  useEffect(() => {
    setItems(parseStoredCart(window.localStorage.getItem(CART_STORAGE_KEY)));
    setStorageReady(true);
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    const stored: StoredCart = { version: CART_STORAGE_VERSION, items };
    try {
      window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(stored));
    } catch {
      // Checkout remains usable in memory when storage is unavailable or full.
    }
  }, [items, storageReady]);

  useEffect(() => {
    const syncCart = (event: StorageEvent) => {
      if (event.key === CART_STORAGE_KEY) setItems(parseStoredCart(event.newValue));
    };
    window.addEventListener("storage", syncCart);
    return () => window.removeEventListener("storage", syncCart);
  }, []);

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
      clearCart: () => setItems([]),
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
