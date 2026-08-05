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

export const LEGACY_CART_STORAGE_KEY = "hooma-cart";
export const GUEST_CART_STORAGE_KEY = "hooma-cart:v2:guest";
export const ACTIVE_CART_SCOPE_SESSION_KEY = "hooma-cart:v2:active-scope";
export const CART_STORAGE_VERSION = 2;
export const MAX_STORED_CART_ITEMS = 100;
export const MAX_CONSUMED_GUEST_CART_IDS = 100;
export const MAX_PENDING_PAYMENT_ORDERS = 5;
export const MAX_SETTLED_PAYMENT_ORDERS = 20;

const PENDING_PAYMENT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const SETTLED_PAYMENT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const PAYMENT_MARKER_MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;

export type PendingCartMode = "none" | "merge" | "replace";

type StoredCart = {
  version: typeof CART_STORAGE_VERSION;
  items: CartItem[];
  cartId?: string;
  consumedGuestCartIds?: string[];
  pendingPaymentOrders?: CartPaymentOrderMarker[];
  settledPaymentOrders?: CartPaymentOrderMarker[];
};

export type CartPaymentOrderMarker = {
  orderId: string;
  recordedAt: number;
};

export type PurchasedCartLine = Pick<
  CartItem,
  "product_id" | "variant_id" | "material" | "color" | "quantity"
>;

export type CartStorageSnapshot = {
  items: CartItem[];
  cartId: string | null;
  consumedGuestCartIds: string[];
  pendingPaymentOrders: CartPaymentOrderMarker[];
  settledPaymentOrders: CartPaymentOrderMarker[];
};

export function cartStorageKeyForUser(userId: string | null | undefined) {
  return userId
    ? `hooma-cart:v2:user:${encodeURIComponent(userId)}`
    : GUEST_CART_STORAGE_KEY;
}

export const cartItemKey = (
  item: Pick<CartItem, "product_id" | "variant_id" | "material" | "color">,
) => [item.product_id, item.variant_id, item.material, item.color].join("|");

const isShortString = (value: unknown, maxLength = 500) =>
  typeof value === "string" && value.length <= maxLength;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const isPaymentOrderMarker = (value: unknown): value is CartPaymentOrderMarker =>
  isRecord(value)
  && typeof value.orderId === "string"
  && uuidPattern.test(value.orderId)
  && Number.isSafeInteger(value.recordedAt)
  && Number(value.recordedAt) > 0;

function normalizePaymentOrderMarkers(
  value: unknown,
  maxItems: number,
  ttlMs: number,
  now = Date.now(),
) {
  if (!Array.isArray(value)) return [];
  const unique = new Map<string, CartPaymentOrderMarker>();
  for (const marker of value) {
    if (
      !isPaymentOrderMarker(marker)
      || marker.recordedAt > now + PAYMENT_MARKER_MAX_CLOCK_SKEW_MS
      || now - marker.recordedAt > ttlMs
    ) continue;
    unique.set(marker.orderId, marker);
  }
  return [...unique.values()]
    .sort((a, b) => a.recordedAt - b.recordedAt)
    .slice(-maxItems);
}

function isCartItem(value: unknown): value is CartItem {
  if (!isRecord(value)) return false;
  return (
    isShortString(value.product_id, 128)
    && isShortString(value.variant_id, 128)
    && (value.inventory_id === undefined
      || value.inventory_id === null
      || isShortString(value.inventory_id, 128))
    && isShortString(value.product_name)
    && isShortString(value.name)
    && isShortString(value.image, 2_000)
    && isShortString(value.sku, 128)
    && isShortString(value.size_label, 128)
    && isShortString(value.material, 128)
    && isShortString(value.color, 128)
    && Number.isInteger(value.quantity)
    && Number(value.quantity) > 0
    && Number(value.quantity) <= 100
    && (value.price === undefined
      || value.price === null
      || (typeof value.price === "number" && Number.isFinite(value.price) && value.price >= 0))
    && isShortString(value.pricePlaceholder, 200)
    && (value.price_placeholder === undefined || isShortString(value.price_placeholder, 200))
  );
}

const isCartId = (value: unknown): value is string =>
  typeof value === "string"
  && value.length >= 16
  && value.length <= 128
  && /^[a-zA-Z0-9-]+$/.test(value);

export function parseStoredCartSnapshot(value: string | null): CartStorageSnapshot {
  const empty: CartStorageSnapshot = {
    items: [],
    cartId: null,
    consumedGuestCartIds: [],
    pendingPaymentOrders: [],
    settledPaymentOrders: [],
  };
  if (!value) return empty;
  try {
    const stored: unknown = JSON.parse(value);
    if (
      !isRecord(stored)
      || stored.version !== CART_STORAGE_VERSION
      || !Array.isArray(stored.items)
    ) {
      return empty;
    }
    return {
      items: stored.items.slice(0, MAX_STORED_CART_ITEMS).filter(isCartItem),
      cartId: isCartId(stored.cartId) ? stored.cartId : null,
      consumedGuestCartIds: Array.isArray(stored.consumedGuestCartIds)
        ? stored.consumedGuestCartIds
          .filter(isCartId)
          .slice(-MAX_CONSUMED_GUEST_CART_IDS)
        : [],
      pendingPaymentOrders: normalizePaymentOrderMarkers(
        stored.pendingPaymentOrders,
        MAX_PENDING_PAYMENT_ORDERS,
        PENDING_PAYMENT_TTL_MS,
      ),
      settledPaymentOrders: normalizePaymentOrderMarkers(
        stored.settledPaymentOrders,
        MAX_SETTLED_PAYMENT_ORDERS,
        SETTLED_PAYMENT_TTL_MS,
      ),
    };
  } catch {
    return empty;
  }
}

export function parseStoredCart(value: string | null): CartItem[] {
  return parseStoredCartSnapshot(value).items;
}

export function serializeStoredCart(
  items: CartItem[],
  options: Partial<Omit<CartStorageSnapshot, "items">> = {},
) {
  const {
    cartId = null,
    consumedGuestCartIds = [],
    pendingPaymentOrders = [],
    settledPaymentOrders = [],
  } = options;
  return JSON.stringify({
    version: CART_STORAGE_VERSION,
    items: items.slice(0, MAX_STORED_CART_ITEMS),
    ...(cartId ? { cartId } : {}),
    ...(consumedGuestCartIds.length
      ? {
        consumedGuestCartIds: consumedGuestCartIds
          .filter(isCartId)
          .slice(-MAX_CONSUMED_GUEST_CART_IDS),
      }
      : {}),
    ...(pendingPaymentOrders.length
      ? {
        pendingPaymentOrders: normalizePaymentOrderMarkers(
          pendingPaymentOrders,
          MAX_PENDING_PAYMENT_ORDERS,
          PENDING_PAYMENT_TTL_MS,
        ),
      }
      : {}),
    ...(settledPaymentOrders.length
      ? {
        settledPaymentOrders: normalizePaymentOrderMarkers(
          settledPaymentOrders,
          MAX_SETTLED_PAYMENT_ORDERS,
          SETTLED_PAYMENT_TTL_MS,
        ),
      }
      : {}),
  } satisfies StoredCart);
}

export function subtractPurchasedCartItems(
  items: CartItem[],
  purchasedLines: PurchasedCartLine[],
) {
  const purchasedByKey = new Map<string, number>();
  for (const line of purchasedLines.slice(0, MAX_STORED_CART_ITEMS)) {
    if (
      !isShortString(line.product_id, 128)
      || !isShortString(line.variant_id, 128)
      || !isShortString(line.material, 128)
      || !isShortString(line.color, 128)
      || !Number.isInteger(line.quantity)
      || line.quantity < 1
      || line.quantity > 100
    ) continue;
    const key = cartItemKey(line);
    purchasedByKey.set(key, Math.min(100, (purchasedByKey.get(key) ?? 0) + line.quantity));
  }
  if (!purchasedByKey.size) return items;
  return items.flatMap((item) => {
    const purchasedQuantity = purchasedByKey.get(cartItemKey(item)) ?? 0;
    if (!purchasedQuantity) return [item];
    const remainingQuantity = item.quantity - purchasedQuantity;
    return remainingQuantity > 0 ? [{ ...item, quantity: remainingQuantity }] : [];
  });
}

export function cartMatchesPurchasedLinesExactly(
  items: CartItem[],
  purchasedLines: PurchasedCartLine[],
) {
  const cartQuantities = new Map<string, number>();
  for (const item of items) {
    const key = cartItemKey(item);
    cartQuantities.set(key, (cartQuantities.get(key) ?? 0) + item.quantity);
  }

  const purchasedQuantities = new Map<string, number>();
  for (const line of purchasedLines) {
    if (
      !isShortString(line.product_id, 128)
      || !isShortString(line.variant_id, 128)
      || !isShortString(line.material, 128)
      || !isShortString(line.color, 128)
      || !Number.isInteger(line.quantity)
      || line.quantity < 1
      || line.quantity > 100
    ) return false;
    const key = cartItemKey(line);
    purchasedQuantities.set(key, (purchasedQuantities.get(key) ?? 0) + line.quantity);
  }

  if (!purchasedQuantities.size || cartQuantities.size !== purchasedQuantities.size) {
    return false;
  }
  return [...purchasedQuantities].every(
    ([key, quantity]) => cartQuantities.get(key) === quantity,
  );
}

export function rememberPendingPaymentOrder(
  snapshot: CartStorageSnapshot,
  orderId: string,
  recordedAt = Date.now(),
): CartStorageSnapshot {
  if (
    !uuidPattern.test(orderId)
    || !Number.isSafeInteger(recordedAt)
    || recordedAt <= 0
    || recordedAt > Date.now() + PAYMENT_MARKER_MAX_CLOCK_SKEW_MS
  ) {
    return snapshot;
  }
  if (snapshot.settledPaymentOrders.some((marker) => marker.orderId === orderId)) {
    return snapshot;
  }
  return {
    ...snapshot,
    pendingPaymentOrders: [
      ...snapshot.pendingPaymentOrders.filter((marker) => marker.orderId !== orderId),
      { orderId, recordedAt },
    ].slice(-MAX_PENDING_PAYMENT_ORDERS),
  };
}

export function reconcileSettledPaymentOrder(
  snapshot: CartStorageSnapshot,
  {
    orderId,
    status,
    purchasedLines,
    settledAt = Date.now(),
  }: {
    orderId: string;
    status: "paid" | "failed" | "refunded";
    purchasedLines: PurchasedCartLine[];
    settledAt?: number;
  },
): CartStorageSnapshot {
  if (
    !uuidPattern.test(orderId)
    || !Number.isSafeInteger(settledAt)
    || settledAt <= 0
    || settledAt > Date.now() + PAYMENT_MARKER_MAX_CLOCK_SKEW_MS
    || snapshot.settledPaymentOrders.some((marker) => marker.orderId === orderId)
    || !snapshot.pendingPaymentOrders.some((marker) => marker.orderId === orderId)
  ) return snapshot;

  if (status === "failed" || status === "refunded") {
    return {
      ...snapshot,
      pendingPaymentOrders: snapshot.pendingPaymentOrders.filter((marker) => marker.orderId !== orderId),
    };
  }

  const nextItems = subtractPurchasedCartItems(snapshot.items, purchasedLines);
  if (nextItems === snapshot.items) return snapshot;
  return {
    ...snapshot,
    items: nextItems,
    pendingPaymentOrders: snapshot.pendingPaymentOrders.filter((marker) => marker.orderId !== orderId),
    settledPaymentOrders: [
      ...snapshot.settledPaymentOrders.filter((marker) => marker.orderId !== orderId),
      { orderId, recordedAt: settledAt },
    ].slice(-MAX_SETTLED_PAYMENT_ORDERS),
  };
}

export function mergeCartItems(...groups: ReadonlyArray<ReadonlyArray<CartItem>>) {
  const merged: CartItem[] = [];
  const itemIndexes = new Map<string, number>();

  for (const group of groups) {
    for (const item of group) {
      const quantity = Math.min(100, Math.max(1, Math.trunc(item.quantity)));
      const itemKey = cartItemKey(item);
      const existingIndex = itemIndexes.get(itemKey);
      if (existingIndex !== undefined) {
        const existing = merged[existingIndex];
        merged[existingIndex] = {
          ...existing,
          quantity: Math.min(100, existing.quantity + quantity),
        };
      } else if (merged.length < MAX_STORED_CART_ITEMS) {
        itemIndexes.set(itemKey, merged.length);
        merged.push({ ...item, quantity });
      }
    }
  }

  return merged;
}

export function resolveCartScope({
  userId,
  previousStorageKey,
  pendingItems,
  pendingMode,
  scopedItems,
  scopedConsumedGuestCartIds,
  guestItems,
  guestCartId,
}: {
  userId: string | null;
  previousStorageKey: string | null;
  pendingItems: CartItem[];
  pendingMode: PendingCartMode;
  scopedItems: CartItem[];
  scopedConsumedGuestCartIds: string[];
  guestItems: CartItem[];
  guestCartId: string | null;
}) {
  const storageKey = cartStorageKeyForUser(userId);
  const consumeGuest = Boolean(userId)
    && (previousStorageKey === null || previousStorageKey === GUEST_CART_STORAGE_KEY);
  const replaceStoredCart = previousStorageKey === null && pendingMode === "replace";
  const guestAlreadyConsumed = guestCartId
    ? scopedConsumedGuestCartIds.includes(guestCartId)
    : false;
  const consumedGuestCartIds = consumeGuest && guestCartId && !guestAlreadyConsumed
    ? [...scopedConsumedGuestCartIds, guestCartId].slice(-MAX_CONSUMED_GUEST_CART_IDS)
    : scopedConsumedGuestCartIds;

  let items: CartItem[];
  if (replaceStoredCart) {
    items = pendingItems;
  } else if (consumeGuest) {
    const currentGuestItems = previousStorageKey === GUEST_CART_STORAGE_KEY
      ? pendingItems
      : guestItems;
    const migratedItems = guestAlreadyConsumed
      ? scopedItems
      : mergeCartItems(scopedItems, currentGuestItems);
    items = previousStorageKey === null && pendingMode === "merge"
      ? mergeCartItems(migratedItems, pendingItems)
      : migratedItems;
  } else if (previousStorageKey === null && pendingMode === "merge") {
    items = mergeCartItems(scopedItems, pendingItems);
  } else {
    items = scopedItems;
  }

  return {
    storageKey,
    items,
    consumeGuest,
    consumedGuestCartIds,
  };
}

export function isCartStorageEventForScope(
  activeStorageKey: string | null,
  eventStorageKey: string | null,
) {
  return activeStorageKey !== null && eventStorageKey === activeStorageKey;
}
