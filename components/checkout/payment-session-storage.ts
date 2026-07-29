"use client";

const STORAGE_KEY = "hooma-bog-checkout-session-v1";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type StoredPaymentSession = {
  version: 1;
  fingerprint: string;
  checkoutKey: string;
};

export function getOrCreateCheckoutKey(fingerprint: string) {
  try {
    const stored = JSON.parse(
      window.sessionStorage.getItem(STORAGE_KEY) ?? "null",
    ) as StoredPaymentSession | null;
    if (
      stored?.version === 1
      && stored.fingerprint === fingerprint
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
      version: 1,
      fingerprint,
      checkoutKey,
    } satisfies StoredPaymentSession));
  } catch {
    // The in-memory caller still reuses this key until the page is unloaded.
  }
  return checkoutKey;
}

export function clearCheckoutPaymentSession() {
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage can be unavailable in hardened/private browser modes.
  }
}
