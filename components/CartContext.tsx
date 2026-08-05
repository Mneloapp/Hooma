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
import { recoverCatalogPaymentSessionAction } from "@/app/auth/actions";
import {
  clearCheckoutPaymentSession,
  clearCheckoutPaymentSessionForOrder,
  clearLegacyCheckoutPaymentSession,
  bindCheckoutPaymentOrder,
  readCheckoutPaymentSessionPointer,
} from "@/components/checkout/payment-session-storage";
import { createClient } from "@/lib/supabase/client";
import {
  ACTIVE_CART_SCOPE_SESSION_KEY,
  GUEST_CART_STORAGE_KEY,
  LEGACY_CART_STORAGE_KEY,
  MAX_CART_LINE_QUANTITY,
  MAX_STORED_CART_ITEMS,
  cartItemKey,
  cartStorageKeyForUser,
  ensureCartLineIds,
  isCartStorageEventForScope,
  mergeCartItems,
  parseStoredCartSnapshot,
  reconcileSettledPaymentOrder,
  removeCartItem,
  rememberPendingPaymentOrder,
  resolveCartScope,
  serializeStoredCart,
  type CartItem,
  type CartPaymentLineMarker,
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
  removeItem: (key: string) => void;
  clearCart: () => void;
  trackPendingPaymentOrder: (
    orderId: string,
    submittedLines?: readonly CartPaymentLineMarker[] | null,
  ) => void;
  reconcilePaymentOrder: (input: {
    orderId: string;
    status: "paid" | "failed" | "refunded";
    purchasedLines: PurchasedCartLine[];
  }) => void;
  hasPendingPaymentOrders: boolean;
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
  const recoveredCheckoutKeysRef = useRef(new Set<string>());
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
      const resolvedItems = ensureCartLineIds(resolved.items, createCartId);
      const nextCart: ScopedCart = {
        storageKey: resolved.storageKey,
        items: resolvedItems,
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
        items: resolvedItems,
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

  const trackPendingPaymentOrder = useCallback((
    orderId: string,
    submittedLines?: readonly CartPaymentLineMarker[] | null,
  ) => {
    const current = cartRef.current;
    if (!current.storageKey) return;
    const { snapshot: stored, readable } = readCartResult(current.storageKey);
    // Payment binding is metadata-only. Preserve a newer cross-tab cart as the
    // item authority and never reconstruct generations from a stale render.
    const source = readable ? stored : current;
    const nextSnapshot = rememberPendingPaymentOrder(
      source,
      orderId,
      Date.now(),
      submittedLines,
    );
    if (nextSnapshot === source) {
      if (readable) {
        replaceCart({
          storageKey: current.storageKey,
          ...stored,
          pendingMode: "none",
        });
      }
      return;
    }
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
    if (nextSnapshot === source) {
      if (input.status === "failed" || input.status === "refunded") {
        clearCheckoutPaymentSessionForOrder(input.orderId);
      }
      return;
    }
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
    .map((marker) => `${marker.orderId}:${marker.lastObservedStatus ?? "pending"}`)
    .join(",");

  useEffect(() => {
    if (!cart.storageKey || cart.storageKey === GUEST_CART_STORAGE_KEY) return;
    const session = readCheckoutPaymentSessionPointer();
    if (!session) return;
    const recoveryKey = `${cart.storageKey}:${session.checkoutKey}`;
    if (recoveredCheckoutKeysRef.current.has(recoveryKey)) return;
    recoveredCheckoutKeysRef.current.add(recoveryKey);
    let active = true;
    let retryTimer: number | null = null;
    let attempts = 0;
    const recover = async () => {
      attempts += 1;
      let result: Awaited<ReturnType<typeof recoverCatalogPaymentSessionAction>> = { ok: false };
      try {
        result = await recoverCatalogPaymentSessionAction(session.checkoutKey);
      } catch {
        // A bounded retry below handles transient server/network failures.
      }
      if (!active) return;
      if (!result.ok) {
        if (attempts < 3) {
          retryTimer = window.setTimeout(() => void recover(), 5_000);
        } else {
          recoveredCheckoutKeysRef.current.delete(recoveryKey);
        }
        return;
      }
      if (session.orderId && session.orderId !== result.orderId) {
        clearCheckoutPaymentSession();
        return;
      }

      const binding = bindCheckoutPaymentOrder(
        result.orderId,
        result.checkoutKey,
      );
      if (!binding.accepted) {
        clearCheckoutPaymentSession();
        return;
      }
      // Legacy or different-key recovery deliberately carries no lines. It is
      // still watched, but a later callback cannot consume today's cart.
      trackPendingPaymentOrder(result.orderId, binding.submittedLines);
      if (["paid", "failed", "refunded"].includes(result.paymentStatus)) {
        reconcilePaymentOrder({
          orderId: result.orderId,
          status: result.paymentStatus as "paid" | "failed" | "refunded",
          purchasedLines: result.purchasedLines,
        });
      }
    };
    void recover();
    return () => {
      active = false;
      if (retryTimer !== null) window.clearTimeout(retryTimer);
      recoveredCheckoutKeysRef.current.delete(recoveryKey);
    };
  }, [cart.storageKey, reconcilePaymentOrder, trackPendingPaymentOrder]);

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
    const onlyFailedMarkers = cart.pendingPaymentOrders.length > 0
      && cart.pendingPaymentOrders.every(
        (marker) => marker.lastObservedStatus === "failed",
      );
    // A failed receipt is a bounded safety tombstone because SQL permits a
    // later signed `completed` transition. Recheck it on mount/focus only;
    // active sessions retain the responsive 15-second polling cadence.
    const timer = onlyFailedMarkers
      ? null
      : window.setInterval(() => void synchronize(), 15_000);
    const onFocus = () => void synchronize();
    const onVisibility = () => {
      if (document.visibilityState === "visible") void synchronize();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      active = false;
      if (timer !== null) window.clearInterval(timer);
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
              quantity: Math.min(
                MAX_CART_LINE_QUANTITY,
                next[index].quantity + Math.max(1, item.quantity),
              ),
            };
            return next;
          }
          if (current.length >= MAX_STORED_CART_ITEMS) return current;
          return mergeCartItems(current, [{
            ...item,
            cart_line_id: item.cart_line_id ?? createCartId(),
          }]);
        });
        setIsOpen(true);
      },
      updateQuantity: (key, quantity) =>
        updateItems((current) => current
          .map((item) => (
            cartItemKey(item) === key
              ? {
                ...item,
                quantity: Math.min(
                  MAX_CART_LINE_QUANTITY,
                  Math.trunc(quantity),
                ),
              }
              : item
          ))
          .filter((item) => item.quantity > 0)),
      removeItem: (key) =>
        updateItems((current) => removeCartItem(current, key)),
      clearCart: () => updateItems(() => [], "replace"),
      trackPendingPaymentOrder,
      reconcilePaymentOrder,
      hasPendingPaymentOrders: cart.pendingPaymentOrders.some(
        (marker) => marker.lastObservedStatus !== "failed",
      ),
      count: cart.items.reduce((sum, item) => sum + item.quantity, 0),
    }),
    [
      cart.items,
      pendingPaymentOrderKey,
      isOpen,
      reconcilePaymentOrder,
      trackPendingPaymentOrder,
      updateItems,
    ],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used inside CartProvider");
  return { ...context, keyFor: cartItemKey };
}
