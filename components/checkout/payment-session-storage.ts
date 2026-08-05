"use client";

const LEGACY_STORAGE_KEY = "hooma-bog-checkout-session-v1";
const STORAGE_KEY = "hooma-bog-checkout-session-v2";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const sha256Pattern = /^[0-9a-f]{64}$/;
const cartLineIdPattern = /^[a-zA-Z0-9-]{16,128}$/;
const MAX_SUBMITTED_LINES = 100;
const MAX_LINE_QUANTITY = 20;

export type StagedCartPaymentLine = {
  product_id: string;
  variant_id: string;
  material: string;
  color: string;
  quantity: number;
  cartLineId: string;
};

function normalizeSubmittedLines(value: unknown): StagedCartPaymentLine[] | null {
  if (!Array.isArray(value) || !value.length || value.length > MAX_SUBMITTED_LINES) {
    return null;
  }
  const keys = new Set<string>();
  const lineIds = new Set<string>();
  const lines: StagedCartPaymentLine[] = [];
  for (const valueLine of value) {
    if (!valueLine || typeof valueLine !== "object") return null;
    const line = valueLine as Record<string, unknown>;
    if (
      typeof line.product_id !== "string"
      || line.product_id.length > 128
      || typeof line.variant_id !== "string"
      || line.variant_id.length > 128
      || typeof line.material !== "string"
      || line.material.length > 128
      || typeof line.color !== "string"
      || line.color.length > 128
      || !Number.isInteger(line.quantity)
      || Number(line.quantity) < 1
      || Number(line.quantity) > MAX_LINE_QUANTITY
      || typeof line.cartLineId !== "string"
      || !cartLineIdPattern.test(line.cartLineId)
    ) return null;
    const key = [line.product_id, line.variant_id, line.material, line.color].join("|");
    if (keys.has(key) || lineIds.has(line.cartLineId)) return null;
    keys.add(key);
    lineIds.add(line.cartLineId);
    lines.push({
      product_id: line.product_id,
      variant_id: line.variant_id,
      material: line.material,
      color: line.color,
      quantity: Number(line.quantity),
      cartLineId: line.cartLineId,
    });
  }
  return lines;
}

type StoredPaymentSession = {
  version: 2;
  fingerprintSha256: string | null;
  checkoutKey: string;
  orderId?: string;
  submittedLines?: StagedCartPaymentLine[];
};

export type CheckoutPaymentSessionPointer = {
  checkoutKey: string;
  orderId?: string;
};

export type PreparedCheckoutPaymentSession = {
  checkoutKey: string;
  submittedLines: StagedCartPaymentLine[] | null;
  reused: boolean;
};

export type CheckoutPaymentOrderBinding = {
  accepted: boolean;
  persisted: boolean;
  matchedStagedCheckout: boolean;
  submittedLines: StagedCartPaymentLine[] | null;
};

function parseStoredPaymentSession(value: string | null): StoredPaymentSession | null {
  try {
    const stored = JSON.parse(value ?? "null") as StoredPaymentSession | null;
    if (
      stored?.version !== 2
      || (stored.fingerprintSha256 !== null
        && !sha256Pattern.test(stored.fingerprintSha256))
      || !uuidPattern.test(stored.checkoutKey)
      || (stored.orderId !== undefined && !uuidPattern.test(stored.orderId))
    ) return null;
    const submittedLines = stored.submittedLines === undefined
      ? null
      : normalizeSubmittedLines(stored.submittedLines);
    if (stored.submittedLines !== undefined && !submittedLines) return null;
    return {
      version: 2,
      fingerprintSha256: stored.fingerprintSha256,
      checkoutKey: stored.checkoutKey,
      ...(stored.orderId ? { orderId: stored.orderId } : {}),
      ...(submittedLines ? { submittedLines } : {}),
    };
  } catch {
    return null;
  }
}

export async function sha256CheckoutFingerprint(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await window.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function prepareCheckoutPaymentSession(
  fingerprintSha256: string,
  submittedLines: readonly StagedCartPaymentLine[],
): PreparedCheckoutPaymentSession {
  if (!sha256Pattern.test(fingerprintSha256)) {
    throw new Error("Checkout fingerprint must be a SHA-256 digest.");
  }
  const safeSubmittedLines = normalizeSubmittedLines(submittedLines);
  if (!safeSubmittedLines) {
    throw new Error("Checkout cart lines must have stable generations.");
  }
  try {
    const stored = parseStoredPaymentSession(
      window.sessionStorage.getItem(STORAGE_KEY),
    );
    if (
      stored?.fingerprintSha256 === fingerprintSha256
    ) {
      return {
        checkoutKey: stored.checkoutKey,
        submittedLines: stored.submittedLines ?? null,
        reused: true,
      };
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
      submittedLines: safeSubmittedLines,
    } satisfies StoredPaymentSession));
  } catch {
    // The in-memory caller still reuses this key until the page is unloaded.
  }
  return {
    checkoutKey,
    submittedLines: safeSubmittedLines,
    reused: false,
  };
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
    const stored = parseStoredPaymentSession(
      window.sessionStorage.getItem(STORAGE_KEY),
    );
    if (!stored) return null;
    return {
      checkoutKey: stored.checkoutKey,
      ...(stored.orderId ? { orderId: stored.orderId } : {}),
    };
  } catch {
    return null;
  }
}

export function bindCheckoutPaymentOrder(
  orderId: string,
  authoritativeCheckoutKey: string,
): CheckoutPaymentOrderBinding {
  if (!uuidPattern.test(orderId) || !uuidPattern.test(authoritativeCheckoutKey)) {
    return {
      accepted: false,
      persisted: false,
      matchedStagedCheckout: false,
      submittedLines: null,
    };
  }
  let stored: StoredPaymentSession | null = null;
  try {
    stored = parseStoredPaymentSession(
      window.sessionStorage.getItem(STORAGE_KEY),
    );
  } catch {
    // The in-memory cart marker still fails closed when storage is unavailable.
  }
  if (stored?.orderId !== undefined && stored.orderId !== orderId) {
    return {
      accepted: false,
      persisted: true,
      matchedStagedCheckout: false,
      submittedLines: null,
    };
  }
  const matchedStagedCheckout = stored?.checkoutKey === authoritativeCheckoutKey;
  const submittedLines = matchedStagedCheckout
    ? stored?.submittedLines ?? null
    : null;
  const next: StoredPaymentSession = matchedStagedCheckout && stored
    ? { ...stored, orderId }
    : {
      version: 2,
      fingerprintSha256: null,
      checkoutKey: authoritativeCheckoutKey,
      orderId,
    };
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    return {
      accepted: true,
      persisted: true,
      matchedStagedCheckout,
      submittedLines,
    };
  } catch {
    return {
      accepted: true,
      persisted: false,
      matchedStagedCheckout,
      submittedLines,
    };
  }
}

export function clearCheckoutPaymentSessionForOrder(orderId: string) {
  if (!uuidPattern.test(orderId)) return false;
  try {
    const stored = parseStoredPaymentSession(
      window.sessionStorage.getItem(STORAGE_KEY),
    );
    if (!stored || stored.orderId !== orderId) return false;
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
