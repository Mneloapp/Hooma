"use client";

const LEGACY_STORAGE_KEY = "hooma-bog-checkout-session-v1";
const STORAGE_KEY = "hooma-bog-checkout-session-v2";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const sha256Pattern = /^[0-9a-f]{64}$/;

type StoredPaymentSession = {
  version: 2;
  fingerprintSha256: string;
  checkoutKey: string;
  orderId?: string;
};

export type CheckoutPaymentSessionPointer = {
  checkoutKey: string;
  orderId?: string;
};

export async function sha256CheckoutFingerprint(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await window.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function getOrCreateCheckoutKey(fingerprintSha256: string) {
  if (!sha256Pattern.test(fingerprintSha256)) {
    throw new Error("Checkout fingerprint must be a SHA-256 digest.");
  }
  try {
    const stored = JSON.parse(
      window.sessionStorage.getItem(STORAGE_KEY) ?? "null",
    ) as StoredPaymentSession | null;
    if (
      stored?.version === 2
      && stored.fingerprintSha256 === fingerprintSha256
      && uuidPattern.test(stored.checkoutKey)
    ) {
      return stored.checkoutKey;
    }
  } catch {
    // Invalid or unavailable browser storage falls back to a new UUID below.
  }

  const checkoutKey = window.crypto.randomUUID();
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
      version: 2,
      fingerprintSha256,
      checkoutKey,
    } satisfies StoredPaymentSession));
  } catch {
    // The in-memory caller still reuses this key until the page is unloaded.
  }
  return checkoutKey;
}

export function clearLegacyCheckoutPaymentSession() {
  try {
    window.sessionStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // Storage can be unavailable in hardened/private browser modes.
  }
}

export function readCheckoutPaymentSessionPointer(): CheckoutPaymentSessionPointer | null {
  try {
    const stored = JSON.parse(
      window.sessionStorage.getItem(STORAGE_KEY) ?? "null",
    ) as StoredPaymentSession | null;
    if (
      stored?.version !== 2
      || !sha256Pattern.test(stored.fingerprintSha256)
      || !uuidPattern.test(stored.checkoutKey)
      || (stored.orderId !== undefined && !uuidPattern.test(stored.orderId))
    ) return null;
    return {
      checkoutKey: stored.checkoutKey,
      ...(stored.orderId ? { orderId: stored.orderId } : {}),
    };
  } catch {
    return null;
  }
}

export function bindCheckoutPaymentOrder(orderId: string) {
  if (!uuidPattern.test(orderId)) return false;
  try {
    const stored = JSON.parse(
      window.sessionStorage.getItem(STORAGE_KEY) ?? "null",
    ) as StoredPaymentSession | null;
    if (
      stored?.version !== 2
      || !sha256Pattern.test(stored.fingerprintSha256)
      || !uuidPattern.test(stored.checkoutKey)
      || (stored.orderId !== undefined && stored.orderId !== orderId)
    ) return false;
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...stored,
      orderId,
    } satisfies StoredPaymentSession));
    return true;
  } catch {
    return false;
  }
}

export function clearCheckoutPaymentSessionForOrder(orderId: string) {
  if (!uuidPattern.test(orderId)) return false;
  try {
    const stored = JSON.parse(
      window.sessionStorage.getItem(STORAGE_KEY) ?? "null",
    ) as StoredPaymentSession | null;
    if (stored?.version !== 2 || stored.orderId !== orderId) return false;
    window.sessionStorage.removeItem(STORAGE_KEY);
    window.sessionStorage.removeItem(LEGACY_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

export function clearCheckoutPaymentSession() {
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
    window.sessionStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    // Storage can be unavailable in hardened/private browser modes.
  }
}
