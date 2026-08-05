import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  GUEST_CART_STORAGE_KEY,
  LEGACY_CART_STORAGE_KEY,
  MAX_PENDING_PAYMENT_ORDERS,
  cartStorageKeyForUser,
  isCartStorageEventForScope,
  mergeCartItems,
  parseStoredCart,
  parseStoredCartSnapshot,
  reconcileSettledPaymentOrder,
  rememberPendingPaymentOrder,
  resolveCartScope,
  serializeStoredCart,
  subtractPurchasedCartItems,
} from "../lib/cart-storage.ts";

const item = (productId, quantity = 1) => ({
  product_id: productId,
  variant_id: `variant-${productId}`,
  inventory_id: null,
  product_name: `Product ${productId}`,
  name: `პროდუქტი ${productId}`,
  image: "/product.jpg",
  sku: `SKU-${productId}`,
  size_label: "M",
  material: "PLA",
  color: "White",
  quantity,
  price: 10,
  pricePlaceholder: "₾10.00",
});

test("guest and authenticated users receive separate versioned cart keys", () => {
  assert.equal(cartStorageKeyForUser(null), GUEST_CART_STORAGE_KEY);
  assert.notEqual(cartStorageKeyForUser("user-a"), cartStorageKeyForUser("user-b"));
  assert.notEqual(cartStorageKeyForUser("user-a"), GUEST_CART_STORAGE_KEY);
  assert.notEqual(cartStorageKeyForUser(null), LEGACY_CART_STORAGE_KEY);
});

test("the unowned legacy cart is rejected instead of leaking into an account", () => {
  const legacyCart = JSON.stringify({ version: 1, items: [item("legacy")] });
  assert.deepEqual(parseStoredCart(legacyCart), []);
  assert.deepEqual(parseStoredCart("{not-json"), []);
});

test("guest cart merges once into the account that signs in", () => {
  const resolved = resolveCartScope({
    userId: "user-a",
    previousStorageKey: GUEST_CART_STORAGE_KEY,
    pendingItems: [item("guest"), item("saved", 2)],
    pendingMode: "none",
    scopedItems: [item("saved")],
    scopedConsumedGuestCartIds: [],
    guestItems: [],
    guestCartId: "guest-transfer-0001",
  });

  assert.equal(resolved.storageKey, cartStorageKeyForUser("user-a"));
  assert.equal(resolved.consumeGuest, true);
  assert.deepEqual(
    resolved.items.map(({ product_id, quantity }) => ({ product_id, quantity })),
    [
      { product_id: "saved", quantity: 3 },
      { product_id: "guest", quantity: 1 },
    ],
  );
});

test("logout and direct account switching never copy the previous user's cart", () => {
  const userACart = [item("private-a")];
  const guestAfterLogout = resolveCartScope({
    userId: null,
    previousStorageKey: cartStorageKeyForUser("user-a"),
    pendingItems: userACart,
    pendingMode: "none",
    scopedItems: [],
    scopedConsumedGuestCartIds: [],
    guestItems: [],
    guestCartId: null,
  });
  assert.deepEqual(guestAfterLogout.items, []);
  assert.equal(guestAfterLogout.consumeGuest, false);

  const userBAfterSwitch = resolveCartScope({
    userId: "user-b",
    previousStorageKey: cartStorageKeyForUser("user-a"),
    pendingItems: userACart,
    pendingMode: "none",
    scopedItems: [item("saved-b")],
    scopedConsumedGuestCartIds: [],
    guestItems: [item("unrelated-guest")],
    guestCartId: "guest-transfer-0001",
  });
  assert.deepEqual(userBAfterSwitch.items, [item("saved-b")]);
  assert.equal(userBAfterSwitch.consumeGuest, false);
});

test("returning users can restore only their own saved cart", () => {
  const savedA = [item("saved-a")];
  const resolved = resolveCartScope({
    userId: "user-a",
    previousStorageKey: cartStorageKeyForUser("user-b"),
    pendingItems: [item("saved-b")],
    pendingMode: "none",
    scopedItems: savedA,
    scopedConsumedGuestCartIds: [],
    guestItems: [],
    guestCartId: null,
  });
  assert.deepEqual(resolved.items, savedA);
});

test("cart storage events update only the currently active account scope", () => {
  const active = cartStorageKeyForUser("user-a");
  assert.equal(isCartStorageEventForScope(active, active), true);
  assert.equal(isCartStorageEventForScope(active, cartStorageKeyForUser("user-b")), false);
  assert.equal(isCartStorageEventForScope(active, GUEST_CART_STORAGE_KEY), false);
  assert.equal(isCartStorageEventForScope(null, active), false);
});

test("stored carts validate data and merged quantities remain bounded", () => {
  const merged = mergeCartItems([item("same", 70)], [item("same", 50)]);
  assert.equal(merged[0].quantity, 100);
  assert.deepEqual(parseStoredCart(serializeStoredCart(merged)), merged);

  const invalid = JSON.stringify({
    version: 2,
    items: [{ ...item("invalid"), quantity: 101 }],
  });
  assert.deepEqual(parseStoredCart(invalid), []);
});

test("first authenticated resolution combines saved, guest, and pending carts", () => {
  const resolved = resolveCartScope({
    userId: "user-a",
    previousStorageKey: null,
    pendingItems: [item("pending")],
    pendingMode: "merge",
    scopedItems: [item("saved")],
    scopedConsumedGuestCartIds: [],
    guestItems: [item("guest")],
    guestCartId: "guest-transfer-0001",
  });
  assert.equal(resolved.consumeGuest, true);
  assert.deepEqual(
    resolved.items.map(({ product_id }) => product_id),
    ["saved", "guest", "pending"],
  );
});

test("first anonymous resolution keeps stored and newly added guest items", () => {
  const resolved = resolveCartScope({
    userId: null,
    previousStorageKey: null,
    pendingItems: [item("pending")],
    pendingMode: "merge",
    scopedItems: [item("stored-guest")],
    scopedConsumedGuestCartIds: [],
    guestItems: [],
    guestCartId: null,
  });
  assert.equal(resolved.storageKey, GUEST_CART_STORAGE_KEY);
  assert.deepEqual(
    resolved.items.map(({ product_id }) => product_id),
    ["stored-guest", "pending"],
  );
});

test("a pre-resolution clear overrides saved cart contents", () => {
  const resolved = resolveCartScope({
    userId: "user-a",
    previousStorageKey: null,
    pendingItems: [],
    pendingMode: "replace",
    scopedItems: [item("already-purchased")],
    scopedConsumedGuestCartIds: [],
    guestItems: [item("guest")],
    guestCartId: "guest-transfer-0001",
  });
  assert.deepEqual(resolved.items, []);
  assert.equal(resolved.consumeGuest, true);
});

test("guest migration uses current in-memory items when storage is stale", () => {
  const resolved = resolveCartScope({
    userId: "user-a",
    previousStorageKey: GUEST_CART_STORAGE_KEY,
    pendingItems: [item("current")],
    pendingMode: "none",
    scopedItems: [],
    scopedConsumedGuestCartIds: [],
    guestItems: [item("stale")],
    guestCartId: "guest-transfer-0001",
  });
  assert.deepEqual(resolved.items, [item("current")]);
});

test("guest quantities add exactly once across repeated cross-tab migration", () => {
  const transferId = "guest-transfer-0001";
  const once = resolveCartScope({
    userId: "user-a",
    previousStorageKey: null,
    pendingItems: [],
    pendingMode: "none",
    scopedItems: [item("same", 2)],
    scopedConsumedGuestCartIds: [],
    guestItems: [item("same", 3)],
    guestCartId: transferId,
  });
  assert.equal(once.items[0].quantity, 5);
  assert.deepEqual(once.consumedGuestCartIds, [transferId]);

  const twice = resolveCartScope({
    userId: "user-a",
    previousStorageKey: null,
    pendingItems: [],
    pendingMode: "none",
    scopedItems: once.items,
    scopedConsumedGuestCartIds: once.consumedGuestCartIds,
    guestItems: [item("same", 3)],
    guestCartId: transferId,
  });
  assert.equal(twice.items[0].quantity, 5);
  assert.deepEqual(twice.consumedGuestCartIds, [transferId]);
});

test("guest transfer marker is persisted atomically with the user cart", () => {
  const serialized = serializeStoredCart([item("same", 5)], {
    cartId: null,
    consumedGuestCartIds: ["guest-transfer-0001"],
  });
  const parsed = parseStoredCartSnapshot(serialized);
  assert.equal(parsed.items[0].quantity, 5);
  assert.deepEqual(parsed.consumedGuestCartIds, ["guest-transfer-0001"]);
});

test("paid orders subtract only exact purchased quantities and settle once", () => {
  const orderId = "00000000-0000-4000-8000-000000000001";
  const paymentNow = Date.now();
  const sameVariant = item("same", 3);
  const otherVariant = { ...item("same", 2), variant_id: "variant-other" };
  const unrelated = item("unrelated", 1);
  const initial = parseStoredCartSnapshot(serializeStoredCart([
    sameVariant,
    otherVariant,
    unrelated,
  ]));
  const pending = rememberPendingPaymentOrder(initial, orderId, paymentNow);
  const settled = reconcileSettledPaymentOrder(pending, {
    orderId,
    status: "paid",
    purchasedLines: [{
      product_id: sameVariant.product_id,
      variant_id: sameVariant.variant_id,
      material: sameVariant.material,
      color: sameVariant.color,
      quantity: 2,
    }],
    settledAt: paymentNow + 100,
  });

  assert.deepEqual(
    settled.items.map(({ product_id, variant_id, quantity }) => ({ product_id, variant_id, quantity })),
    [
      { product_id: "same", variant_id: "variant-same", quantity: 1 },
      { product_id: "same", variant_id: "variant-other", quantity: 2 },
      { product_id: "unrelated", variant_id: "variant-unrelated", quantity: 1 },
    ],
  );
  assert.equal(settled.pendingPaymentOrders.length, 0);
  assert.deepEqual(settled.settledPaymentOrders.map((marker) => marker.orderId), [orderId]);
  assert.equal(reconcileSettledPaymentOrder(settled, {
    orderId,
    status: "paid",
    purchasedLines: [{ ...sameVariant, quantity: 2 }],
  }), settled);
});

test("failed and refunded payments keep cart items while closing their marker", () => {
  const paymentNow = Date.now();
  const statuses = ["failed", "refunded"];
  for (const [index, status] of statuses.entries()) {
    const orderId = `00000000-0000-4000-8000-${String(index + 2).padStart(12, "0")}`;
    const initial = rememberPendingPaymentOrder(
      parseStoredCartSnapshot(serializeStoredCart([item("retry")])),
      orderId,
      paymentNow,
    );
    const settled = reconcileSettledPaymentOrder(initial, {
      orderId,
      status,
      purchasedLines: [],
      settledAt: paymentNow + 100,
    });
    assert.deepEqual(settled.items, initial.items);
    assert.equal(settled.pendingPaymentOrders.length, 0);
    assert.equal(settled.settledPaymentOrders.length, 0);
  }
});

test("payment markers are bounded and an untracked order cannot change a cart", () => {
  const paymentNow = Date.now();
  let snapshot = parseStoredCartSnapshot(serializeStoredCart([item("safe")]));
  for (let index = 0; index < MAX_PENDING_PAYMENT_ORDERS + 3; index += 1) {
    snapshot = rememberPendingPaymentOrder(
      snapshot,
      `00000000-0000-4000-8000-${String(index + 10).padStart(12, "0")}`,
      paymentNow + index,
    );
  }
  assert.equal(snapshot.pendingPaymentOrders.length, MAX_PENDING_PAYMENT_ORDERS);

  const untouched = reconcileSettledPaymentOrder(snapshot, {
    orderId: "00000000-0000-4000-8000-999999999999",
    status: "paid",
    purchasedLines: [{ ...item("safe"), quantity: 1 }],
  });
  assert.equal(untouched, snapshot);
  assert.deepEqual(subtractPurchasedCartItems(snapshot.items, []), snapshot.items);
});

test("payment markers with implausible future timestamps are rejected", () => {
  const orderId = "00000000-0000-4000-8000-000000000099";
  const snapshot = parseStoredCartSnapshot(serializeStoredCart([item("future")], {
    pendingPaymentOrders: [{ orderId, recordedAt: Date.now() + 60 * 60 * 1000 }],
  }));
  assert.deepEqual(snapshot.pendingPaymentOrders, []);
});

test("CartProvider reconciles server-action auth changes and persists mutations synchronously", () => {
  const provider = readFileSync(
    new URL("../components/CartContext.tsx", import.meta.url),
    "utf8",
  );
  assert.match(provider, /const pathname = usePathname\(\)/);
  assert.match(provider, /\[pathname, replaceCart\]/);
  assert.match(provider, /auth\.onAuthStateChange/);
  assert.match(provider, /authEventVersion \+= 1/);
  assert.match(provider, /authEventVersion === getUserVersion/);
  assert.match(provider, /if \(current\.storageKey\) writeCart\(current\.storageKey, next\)/);
  assert.match(provider, /removeItem\(LEGACY_CART_STORAGE_KEY\)/);
  assert.match(provider, /\.from\("orders"\)/);
  assert.match(provider, /const source = readable \? stored : current/);
  assert.match(provider, /\.eq\("test_mode", false\)/);
  assert.match(provider, /order\.payment_status === "paid"/);
  assert.match(provider, /\.from\("order_items"\)/);
  assert.doesNotMatch(provider, /return=success/);
});
