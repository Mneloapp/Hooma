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

export type PendingCartMode = "none" | "merge" | "replace";

type StoredCart = {
  version: typeof CART_STORAGE_VERSION;
  items: CartItem[];
  cartId?: string;
  consumedGuestCartIds?: string[];
};

export type CartStorageSnapshot = {
  items: CartItem[];
  cartId: string | null;
  consumedGuestCartIds: string[];
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
  {
    cartId = null,
    consumedGuestCartIds = [],
  }: Omit<CartStorageSnapshot, "items"> = {
    cartId: null,
    consumedGuestCartIds: [],
  },
) {
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
  } satisfies StoredCart);
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
