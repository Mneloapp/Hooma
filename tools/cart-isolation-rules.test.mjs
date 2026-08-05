import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  GUEST_CART_STORAGE_KEY,
  LEGACY_CART_STORAGE_KEY,
  MAX_CART_LINE_QUANTITY,
  MAX_PENDING_PAYMENT_ORDERS,
  cartMatchesPurchasedLinesExactly,
  cartItemKey,
  cartStorageKeyForUser,
  ensureCartLineIds,
  isCartStorageEventForScope,
  mergeCartItems,
  parseStoredCart,
  parseStoredCartSnapshot,
  reconcileSettledPaymentOrder,
  removeCartItem,
  rememberPendingPaymentOrder,
  resolveCartScope,
  serializeStoredCart,
  snapshotCartPaymentLines,
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
  cart_line_id: `cart-line-000000000000-${String(productId).replace(/[^a-zA-Z0-9-]/g, "-")}`,
});

const paymentLines = (items) => {
  const lines = snapshotCartPaymentLines(items);
  assert.ok(lines, "test cart requires stable payment generations");
  return lines;
};

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
  const merged = mergeCartItems([item("same", 15)], [item("same", 10)]);
  assert.equal(merged[0].quantity, MAX_CART_LINE_QUANTITY);
  assert.deepEqual(parseStoredCart(serializeStoredCart(merged)), merged);

  const invalid = JSON.stringify({
    version: 2,
    items: [{ ...item("invalid"), quantity: 101 }],
  });
  assert.deepEqual(parseStoredCart(invalid), []);

  const legacy = JSON.stringify({
    version: 2,
    items: [{ ...item("legacy-high"), quantity: 75 }],
  });
  assert.equal(parseStoredCart(legacy)[0].quantity, MAX_CART_LINE_QUANTITY);
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
  const purchasedVariant = item("same", 2);
  const sameVariant = { ...purchasedVariant, quantity: 3 };
  const otherVariant = {
    ...item("same", 2),
    variant_id: "variant-other",
    cart_line_id: "cart-line-000000000000-other-variant",
  };
  const unrelated = item("unrelated", 1);
  const initial = parseStoredCartSnapshot(serializeStoredCart([purchasedVariant]));
  const pending = rememberPendingPaymentOrder(
    initial,
    orderId,
    paymentNow,
    paymentLines(initial.items),
  );
  const changedAfterCheckout = {
    ...pending,
    items: [sameVariant, otherVariant, unrelated],
  };
  const settled = reconcileSettledPaymentOrder(changedAfterCheckout, {
    orderId,
    status: "paid",
    purchasedLines: [{
      product_id: sameVariant.product_id,
      variant_id: sameVariant.variant_id,
      material: sameVariant.material,
      color: sameVariant.color,
      quantity: purchasedVariant.quantity,
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
    purchasedLines: [{ ...purchasedVariant }],
  }), settled);
});

test("explicit removal targets only the exact configured cart line", () => {
  const target = item("same");
  const otherVariant = {
    ...item("same"),
    variant_id: "variant-other",
    cart_line_id: "cart-line-000000000000-other",
  };
  const unrelated = item("unrelated");
  const next = removeCartItem(
    [target, otherVariant, unrelated],
    cartItemKey(target),
  );

  assert.deepEqual(next, [otherVariant, unrelated]);
});

test("a late paid callback cannot remove the same product re-added after deletion", () => {
  const orderId = "00000000-0000-4000-8000-000000000090";
  const original = {
    ...item("same"),
    cart_line_id: "cart-line-000000000000-original",
  };
  const pending = rememberPendingPaymentOrder(
    parseStoredCartSnapshot(serializeStoredCart([original])),
    orderId,
    Date.now(),
    paymentLines([original]),
  );
  const readded = {
    ...original,
    cart_line_id: "cart-line-000000000000-readded",
  };
  const changed = {
    ...pending,
    items: [readded],
  };
  const settled = reconcileSettledPaymentOrder(changed, {
    orderId,
    status: "paid",
    purchasedLines: [{
      product_id: original.product_id,
      variant_id: original.variant_id,
      material: original.material,
      color: original.color,
      quantity: original.quantity,
    }],
  });

  assert.deepEqual(settled.items, [readded]);
  assert.equal(settled.pendingPaymentOrders.length, 0);
  assert.deepEqual(settled.settledPaymentOrders.map((marker) => marker.orderId), [orderId]);
});

test("an async checkout response binds submitted generation A, never current generation B", () => {
  const orderId = "00000000-0000-4000-8000-000000000093";
  const submitted = {
    ...item("async-boundary"),
    cart_line_id: "cart-line-000000000000-submitted-a",
  };
  const readdedWhileServerWasRunning = {
    ...submitted,
    cart_line_id: "cart-line-000000000000-current-b",
  };
  const currentSnapshot = parseStoredCartSnapshot(
    serializeStoredCart([readdedWhileServerWasRunning]),
  );
  const pending = rememberPendingPaymentOrder(
    currentSnapshot,
    orderId,
    Date.now(),
    paymentLines([submitted]),
  );
  const settled = reconcileSettledPaymentOrder(pending, {
    orderId,
    status: "paid",
    purchasedLines: [{
      product_id: submitted.product_id,
      variant_id: submitted.variant_id,
      material: submitted.material,
      color: submitted.color,
      quantity: submitted.quantity,
    }],
  });

  assert.deepEqual(settled.items, [readdedWhileServerWasRunning]);
  assert.equal(settled.pendingPaymentOrders.length, 0);
});

test("retracking the same payment preserves its original cart-line generation", () => {
  const orderId = "00000000-0000-4000-8000-000000000092";
  const original = {
    ...item("same"),
    cart_line_id: "cart-line-000000000000-original",
  };
  const pending = rememberPendingPaymentOrder(
    parseStoredCartSnapshot(serializeStoredCart([original])),
    orderId,
    Date.now() - 1_000,
    paymentLines([original]),
  );
  const changed = {
    ...pending,
    items: [{
      ...original,
      cart_line_id: "cart-line-000000000000-readded",
    }],
  };
  const retracked = rememberPendingPaymentOrder(changed, orderId);

  assert.equal(retracked, changed);
  assert.equal(
    retracked.pendingPaymentOrders[0].lines?.[0].cartLineId,
    "cart-line-000000000000-original",
  );
});

test("legacy payment markers close safely without mutating current cart lines", () => {
  const orderId = "00000000-0000-4000-8000-000000000091";
  const current = item("legacy-current");
  const pending = parseStoredCartSnapshot(serializeStoredCart([current], {
    pendingPaymentOrders: [{ orderId, recordedAt: Date.now() }],
  }));
  const settled = reconcileSettledPaymentOrder(pending, {
    orderId,
    status: "paid",
    purchasedLines: [{
      product_id: current.product_id,
      variant_id: current.variant_id,
      material: current.material,
      color: current.color,
      quantity: current.quantity,
    }],
  });

  assert.deepEqual(settled.items, [current]);
  assert.equal(settled.pendingPaymentOrders.length, 0);
  assert.equal(settled.settledPaymentOrders.length, 1);
});

test("missing cart line generations are assigned before payment tracking", () => {
  const withoutLineId = { ...item("missing-line") };
  delete withoutLineId.cart_line_id;
  const withLineIds = ensureCartLineIds(
    [withoutLineId],
    () => "cart-line-000000000000-generated",
  );
  assert.equal(withLineIds[0].cart_line_id, "cart-line-000000000000-generated");
});

test("failed payments retain their exact generation for a later signed paid transition", () => {
  const paymentNow = Date.now();
  const orderId = "00000000-0000-4000-8000-000000000002";
  const purchased = item("retry");
  const initial = parseStoredCartSnapshot(serializeStoredCart([purchased]));
  const pending = rememberPendingPaymentOrder(
    initial,
    orderId,
    paymentNow,
    paymentLines(initial.items),
  );
  const failed = reconcileSettledPaymentOrder(pending, {
    orderId,
    status: "failed",
    purchasedLines: [],
    settledAt: paymentNow + 100,
  });
  assert.deepEqual(failed.items, initial.items);
  assert.equal(failed.pendingPaymentOrders.length, 1);
  assert.equal(failed.pendingPaymentOrders[0].lastObservedStatus, "failed");
  assert.equal(failed.pendingPaymentOrders[0].lines?.[0].cartLineId, purchased.cart_line_id);

  const paid = reconcileSettledPaymentOrder(failed, {
    orderId,
    status: "paid",
    purchasedLines: [{
      product_id: purchased.product_id,
      variant_id: purchased.variant_id,
      material: purchased.material,
      color: purchased.color,
      quantity: purchased.quantity,
    }],
    settledAt: paymentNow + 200,
  });
  assert.deepEqual(paid.items, []);
  assert.equal(paid.pendingPaymentOrders.length, 0);
  assert.deepEqual(paid.settledPaymentOrders.map((marker) => marker.orderId), [orderId]);
});

test("refunded payments keep cart items and close their watched marker", () => {
  const orderId = "00000000-0000-4000-8000-000000000003";
  const initial = rememberPendingPaymentOrder(
    parseStoredCartSnapshot(serializeStoredCart([item("refunded")])),
    orderId,
  );
  const refunded = reconcileSettledPaymentOrder(initial, {
    orderId,
    status: "refunded",
    purchasedLines: [],
  });
  assert.deepEqual(refunded.items, initial.items);
  assert.equal(refunded.pendingPaymentOrders.length, 0);
  assert.equal(refunded.settledPaymentOrders.length, 0);
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

test("legacy recovery requires the cart to exactly match the purchased lines", () => {
  const purchased = [{
    product_id: "same",
    variant_id: "variant-same",
    material: "PLA",
    color: "White",
    quantity: 1,
  }];
  assert.equal(cartMatchesPurchasedLinesExactly([item("same")], purchased), true);
  assert.equal(cartMatchesPurchasedLinesExactly([item("same", 2)], purchased), false);
  assert.equal(cartMatchesPurchasedLinesExactly([item("same"), item("new")], purchased), false);
  assert.equal(cartMatchesPurchasedLinesExactly([], purchased), false);
});

test("a paid order closes its marker even when the cart has no matching line", () => {
  const orderId = "00000000-0000-4000-8000-000000000099";
  const pending = rememberPendingPaymentOrder(
    parseStoredCartSnapshot(serializeStoredCart([item("different")])),
    orderId,
  );
  const settled = reconcileSettledPaymentOrder(pending, {
    orderId,
    status: "paid",
    purchasedLines: [{
      product_id: "purchased",
      variant_id: "variant-purchased",
      material: "PLA",
      color: "White",
      quantity: 1,
    }],
  });
  assert.deepEqual(settled.items, pending.items);
  assert.equal(settled.pendingPaymentOrders.length, 0);
  assert.deepEqual(settled.settledPaymentOrders.map((marker) => marker.orderId), [orderId]);
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
  assert.match(provider, /removeItem:\s*\(key\)[\s\S]*removeCartItem\(current, key\)/);
  assert.match(provider, /const \{ snapshot: stored, readable \} = readCartResult\(current\.storageKey\)/);
  assert.match(provider, /rememberPendingPaymentOrder\([\s\S]*submittedLines/);
  assert.match(provider, /marker\.lastObservedStatus === "failed"/);
  assert.match(provider, /onlyFailedMarkers[\s\S]*\? null[\s\S]*15_000/);
  assert.doesNotMatch(provider, /return=success/);
});

test("cart drawer exposes an accessible, deliberate remove action", () => {
  const drawer = readFileSync(
    new URL("../components/CartDrawer.tsx", import.meta.url),
    "utf8",
  );
  assert.match(drawer, /Trash2/);
  assert.match(drawer, /removeItem\(itemKey\)/);
  assert.match(drawer, /type="button"[\s\S]*კალათიდან წაშლა/);
  assert.match(drawer, /role="status" aria-live="polite"/);
  assert.match(drawer, /min-h-11/);
  assert.match(drawer, /disabled=\{item\.quantity <= 1\}/);
  assert.match(drawer, /disabled=\{item\.quantity >= MAX_CART_LINE_QUANTITY\}/);
  assert.match(drawer, /role="dialog"/);
  assert.match(drawer, /aria-labelledby="cart-drawer-title"/);
  assert.match(drawer, /inert=\{!isOpen\}/);
  assert.match(drawer, /h-dvh[\s\S]*overflow-y-auto/);
  assert.match(drawer, /event\.key === "Escape"/);
  assert.match(drawer, /previousFocus\?\.focus\(\)/);
  assert.match(drawer, /hasPendingPaymentOrders/);
  assert.match(drawer, /does not cancel a payment or order already created at the bank/);
  assert.match(drawer, /items\.length \? \([\s\S]*href="\/checkout"[\s\S]*href="\/shop"/);
});
