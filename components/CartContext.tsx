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
  clearCheckoutPaymentSessionForOrder,
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
  reconcileSettledPaymentOrder,
  rememberPendingPaymentOrder,
  resolveCartScope,
  serializeStoredCart,
  type CartItem,
  type CartPaymentOrderMarker,
  type CartStorageSnapshot,
  type PendingCartMode,
  type PurchasedCartLine,
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
  trackPendingPaymentOrder: (orderId: string) => void;
  reconcilePaymentOrder: (input: {
    orderId: string;
    status: "paid" | "failed" | "refunded";
    purchasedLines: PurchasedCartLine[];
  }) => void;
  count: number;
};

const CartContext = createContext<CartContextValue | null>(null);

type ScopedCart = {
  storageKey: string | null;
  items: CartItem[];
  cartId: string | null;
  consumedGuestCartIds: string[];
  pendingPaymentOrders: CartPaymentOrderMarker[];
  settledPaymentOrders: CartPaymentOrderMarker[];
  pendingMode: PendingCartMode;
};

const emptyCartSnapshot = (): CartStorageSnapshot => ({
  items: [],
  cartId: null,
  consumedGuestCartIds: [],
  pendingPaymentOrders: [],
  settledPaymentOrders: [],
});

function readCart(storageKey: string): CartStorageSnapshot {
  return readCartResult(storageKey).snapshot;
}

function readCartResult(storageKey: string): {
  snapshot: CartStorageSnapshot;
  readable: boolean;
} {
  try {
    return {
      snapshot: parseStoredCartSnapshot(window.localStorage.getItem(storageKey)),
      readable: true,
    };
  } catch {
    return {
      snapshot: emptyCartSnapshot(),
      readable: false,
    };
  }
}

function writeCart(
  storageKey: string,
  {
    items,
    cartId,
    consumedGuestCartIds,
    pendingPaymentOrders,
    settledPaymentOrders,
  }: CartStorageSnapshot,
) {
  try {
    window.localStorage.setItem(storageKey, serializeStoredCart(items, {
      cartId,
      consumedGuestCartIds,
      pendingPaymentOrders,
      settledPaymentOrders,
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
    pendingPaymentOrders: [],
    settledPaymentOrders: [],
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
        pendingPaymentOrders: scopedCart.pendingPaymentOrders,
        settledPaymentOrders: scopedCart.settledPaymentOrders,
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
        pendingPaymentOrders: nextCart.pendingPaymentOrders,
        settledPaymentOrders: nextCart.settledPaymentOrders,
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

  const trackPendingPaymentOrder = useCallback((orderId: string) => {
    const current = cartRef.current;
    if (!current.storageKey) return;
    const nextSnapshot = rememberPendingPaymentOrder(current, orderId);
    if (nextSnapshot === current) return;
    const next: ScopedCart = {
      storageKey: current.storageKey,
      ...nextSnapshot,
      pendingMode: "none",
    };
    writeCart(current.storageKey, next);
    replaceCart(next);
  }, [replaceCart]);

  const reconcilePaymentOrder = useCallback((input: {
    orderId: string;
    status: "paid" | "failed" | "refunded";
    purchasedLines: PurchasedCartLine[];
  }) => {
    const current = cartRef.current;
    if (!current.storageKey) return;

    const { snapshot: stored, readable } = readCartResult(current.storageKey);
    if (stored.settledPaymentOrders.some((marker) => marker.orderId === input.orderId)) {
      clearCheckoutPaymentSessionForOrder(input.orderId);
      replaceCart({
        storageKey: current.storageKey,
        ...stored,
        pendingMode: "none",
      });
      return;
    }
    // A successfully read localStorage snapshot is the cross-tab authority. If
    // another tab already consumed the marker, a stale async response must not
    // fall back to this tab's older in-memory cart and subtract the order twice.
    const source = readable ? stored : current;
    const nextSnapshot = reconcileSettledPaymentOrder(source, input);
    if (nextSnapshot === source) return;
    const next: ScopedCart = {
      storageKey: current.storageKey,
      ...nextSnapshot,
      pendingMode: "none",
    };
    writeCart(current.storageKey, next);
    replaceCart(next);
    clearCheckoutPaymentSessionForOrder(input.orderId);
  }, [replaceCart]);

  const pendingPaymentOrderKey = cart.pendingPaymentOrders
    .map((marker) => marker.orderId)
    .join(",");

  useEffect(() => {
    if (!cart.storageKey || !pendingPaymentOrderKey) return;
    const supabase = createClient() as any;
    if (!supabase) return;

    let active = true;
    let running = false;
    const synchronize = async () => {
      if (!active || running) return;
      const orderIds = cartRef.current.pendingPaymentOrders.map((marker) => marker.orderId);
      if (!orderIds.length) return;
      running = true;
      try {
        const { data: orders, error } = await supabase
          .from("orders")
          .select("id,payment_status")
          .in("id", orderIds)
          .eq("test_mode", false);
        if (error || !active) return;
        for (const order of orders ?? []) {
          if (!active || !["paid", "failed", "refunded"].includes(order.payment_status)) continue;
          let purchasedLines: PurchasedCartLine[] = [];
          if (order.payment_status === "paid") {
            const { data: lines, error: linesError } = await supabase
              .from("order_items")
              .select("product_id,variant_id,material,color,quantity")
              .eq("order_id", order.id);
            if (linesError || !lines?.length || !active) continue;
            purchasedLines = lines as PurchasedCartLine[];
          }
          reconcilePaymentOrder({
            orderId: order.id,
            status: order.payment_status,
            purchasedLines,
          });
        }
      } finally {
        running = false;
      }
    };

    void synchronize();
    const timer = window.setInterval(() => void synchronize(), 15_000);
    const onFocus = () => void synchronize();
    const onVisibility = () => {
      if (document.visibilityState === "visible") void synchronize();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [cart.storageKey, pendingPaymentOrderKey, reconcilePaymentOrder]);

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
      trackPendingPaymentOrder,
      reconcilePaymentOrder,
      count: cart.items.reduce((sum, item) => sum + item.quantity, 0),
    }),
    [cart.items, isOpen, reconcilePaymentOrder, trackPendingPaymentOrder, updateItems],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used inside CartProvider");
  return { ...context, keyFor: cartItemKey };
}
