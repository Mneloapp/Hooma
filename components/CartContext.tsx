"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import {
  clearCheckoutPaymentSession,
  clearLegacyCheckoutPaymentSession,
} from "@/components/checkout/payment-session-storage";
import { createClient } from "@/lib/supabase/client";
import {
  ACTIVE_CART_SCOPE_SESSION_KEY,
  GUEST_CART_STORAGE_KEY,
  LEGACY_CART_STORAGE_KEY,
  MAX_STORED_CART_ITEMS,
  cartItemKey,
  cartStorageKeyForUser,
  isCartStorageEventForScope,
  mergeCartItems,
  parseStoredCartSnapshot,
  resolveCartScope,
  serializeStoredCart,
  type CartItem,
  type CartStorageSnapshot,
  type PendingCartMode,
} from "@/lib/cart-storage";

export type { CartItem } from "@/lib/cart-storage";

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

type ScopedCart = {
  storageKey: string | null;
  items: CartItem[];
  cartId: string | null;
  consumedGuestCartIds: string[];
  pendingMode: PendingCartMode;
};

const emptyCartSnapshot = (): CartStorageSnapshot => ({
  items: [],
  cartId: null,
  consumedGuestCartIds: [],
});

function readCart(storageKey: string): CartStorageSnapshot {
  try {
    return parseStoredCartSnapshot(window.localStorage.getItem(storageKey));
  } catch {
    return emptyCartSnapshot();
  }
}

function writeCart(
  storageKey: string,
  {
    items,
    cartId,
    consumedGuestCartIds,
  }: CartStorageSnapshot,
) {
  try {
    window.localStorage.setItem(storageKey, serializeStoredCart(items, {
      cartId,
      consumedGuestCartIds,
    }));
    return true;
  } catch {
    // Checkout remains usable in memory when storage is unavailable or full.
    return false;
  }
}

function createCartId() {
  return window.crypto.randomUUID();
}

export function CartProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [cart, setCart] = useState<ScopedCart>({
    storageKey: null,
    items: [],
    cartId: null,
    consumedGuestCartIds: [],
    pendingMode: "none",
  });
  const cartRef = useRef(cart);
  const [isOpen, setIsOpen] = useState(false);

  const replaceCart = useCallback((next: ScopedCart) => {
    cartRef.current = next;
    setCart(next);
  }, []);

  const updateItems = useCallback((
    updater: (items: CartItem[]) => CartItem[],
    unresolvedMode: Exclude<PendingCartMode, "none"> = "merge",
  ) => {
    const current = cartRef.current;
    const items = updater(current.items);
    const cartId = current.storageKey === GUEST_CART_STORAGE_KEY
      ? items.length
        ? current.cartId ?? createCartId()
        : null
      : current.cartId;
    const next = {
      ...current,
      items,
      cartId,
      pendingMode: current.storageKey
        ? "none" as const
        : current.pendingMode === "replace"
          ? "replace" as const
          : unresolvedMode,
    };
    if (current.storageKey) writeCart(current.storageKey, next);
    replaceCart({
      ...next,
    });
  }, [replaceCart]);

  useEffect(() => {
    clearLegacyCheckoutPaymentSession();
    try {
      window.localStorage.removeItem(LEGACY_CART_STORAGE_KEY);
    } catch {
      // A blocked storage API still leaves the in-memory scoped cart usable.
    }

    const activateScope = (userId: string | null) => {
      const previous = cartRef.current;
      const nextStorageKey = cartStorageKeyForUser(userId);
      if (previous.storageKey === nextStorageKey) return;

      const scopedCart = readCart(nextStorageKey);
      const storedGuestCart = userId
        ? readCart(GUEST_CART_STORAGE_KEY)
        : emptyCartSnapshot();
      const guestCart = previous.storageKey === GUEST_CART_STORAGE_KEY
        ? {
          items: previous.items,
          cartId: previous.cartId,
          consumedGuestCartIds: [],
        }
        : storedGuestCart;
      if (userId && guestCart.items.length && !guestCart.cartId) {
        guestCart.cartId = createCartId();
      }

      const resolved = resolveCartScope({
        userId,
        previousStorageKey: previous.storageKey,
        pendingItems: previous.items,
        pendingMode: previous.pendingMode,
        scopedItems: scopedCart.items,
        scopedConsumedGuestCartIds: scopedCart.consumedGuestCartIds,
        guestItems: guestCart.items,
        guestCartId: guestCart.cartId,
      });

      const cartId = userId
        ? null
        : resolved.items.length
          ? scopedCart.cartId ?? createCartId()
          : null;
      const nextCart: ScopedCart = {
        storageKey: resolved.storageKey,
        items: resolved.items,
        cartId,
        consumedGuestCartIds: userId ? resolved.consumedGuestCartIds : [],
        pendingMode: "none",
      };
      const persisted = writeCart(resolved.storageKey, nextCart);
      if (resolved.consumeGuest && persisted) {
        try {
          window.localStorage.removeItem(GUEST_CART_STORAGE_KEY);
        } catch {
          // The transfer ID stored with the user cart prevents a repeated merge.
        }
      }

      try {
        const previousSessionScope = window.sessionStorage.getItem(
          ACTIVE_CART_SCOPE_SESSION_KEY,
        );
        if (previousSessionScope && previousSessionScope !== resolved.storageKey) {
          clearCheckoutPaymentSession();
        }
        window.sessionStorage.setItem(
          ACTIVE_CART_SCOPE_SESSION_KEY,
          resolved.storageKey,
        );
      } catch {
        // Identity isolation still works when session storage is unavailable.
      }

      replaceCart({
        storageKey: resolved.storageKey,
        items: resolved.items,
        cartId: nextCart.cartId,
        consumedGuestCartIds: nextCart.consumedGuestCartIds,
        pendingMode: "none",
      });
      setIsOpen(false);
    };

    const supabase = createClient();
    if (!supabase) {
      activateScope(null);
      return;
    }

    let active = true;
    let authEventVersion = 0;
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      authEventVersion += 1;
      activateScope(session?.user?.id ?? null);
    });
    const getUserVersion = authEventVersion;
    void supabase.auth.getUser().then(({ data }) => {
      if (active && authEventVersion === getUserVersion) {
        activateScope(data.user?.id ?? null);
      }
    });

    return () => {
      active = false;
      authListener.subscription.unsubscribe();
    };
  }, [pathname, replaceCart]);

  useEffect(() => {
    const syncCart = (event: StorageEvent) => {
      const current = cartRef.current;
      if (!isCartStorageEventForScope(current.storageKey, event.key)) return;
      replaceCart({
        storageKey: current.storageKey,
        ...parseStoredCartSnapshot(event.newValue),
        pendingMode: "none",
      });
    };
    window.addEventListener("storage", syncCart);
    return () => window.removeEventListener("storage", syncCart);
  }, [replaceCart]);

  const value = useMemo<CartContextValue>(
    () => ({
      items: cart.items,
      isOpen,
      openCart: () => setIsOpen(true),
      closeCart: () => setIsOpen(false),
      addItem: (item) => {
        updateItems((current) => {
          const index = current.findIndex(
            (existing) => cartItemKey(existing) === cartItemKey(item),
          );
          if (index >= 0) {
            const next = [...current];
            next[index] = {
              ...next[index],
              quantity: Math.min(100, next[index].quantity + Math.max(1, item.quantity)),
            };
            return next;
          }
          if (current.length >= MAX_STORED_CART_ITEMS) return current;
          return mergeCartItems(current, [item]);
        });
        setIsOpen(true);
      },
      updateQuantity: (key, quantity) =>
        updateItems((current) => current
          .map((item) => (
            cartItemKey(item) === key
              ? { ...item, quantity: Math.min(100, Math.trunc(quantity)) }
              : item
          ))
          .filter((item) => item.quantity > 0)),
      clearCart: () => updateItems(() => [], "replace"),
      count: cart.items.reduce((sum, item) => sum + item.quantity, 0),
    }),
    [cart.items, isOpen, updateItems],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used inside CartProvider");
  return { ...context, keyFor: cartItemKey };
}
