import "server-only";

import {
  BOG_CALLBACK_PUBLIC_KEY,
  BOG_FULL_PAYMENT_METHODS,
  buildBogCreateOrderPayload,
  isTrustedBogRedirect,
  type BogCreateOrderInput,
  type BogPaymentMethod,
} from "./bog-core";

const BOG_TOKEN_URL = "https://oauth2.bog.ge/auth/realms/bog/protocol/openid-connect/token";
const BOG_ORDERS_URL = "https://api.bog.ge/payments/v1/ecommerce/orders";
const BOG_RECEIPTS_URL = "https://api.bog.ge/payments/v1/receipt";
const REQUEST_TIMEOUT_MS = 12_000;

type CachedToken = { value: string; expiresAt: number };
let cachedToken: CachedToken | null = null;
let tokenRequest: Promise<CachedToken> | null = null;

export class BogPaymentError extends Error {
  readonly retryable: boolean;
  readonly status: number | null;

  constructor(message: string, options: { retryable?: boolean; status?: number | null } = {}) {
    super(message);
    this.name = "BogPaymentError";
    this.retryable = options.retryable ?? false;
    this.status = options.status ?? null;
  }
}

const enabledValue = (value: string | undefined) => value?.trim().toLowerCase() === "true";

function canonicalOrigin() {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!raw) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return null;
    return url.origin;
  } catch {
    return null;
  }
}

function credentials() {
  const clientId = process.env.BOG_CLIENT_ID?.trim();
  const clientSecret = process.env.BOG_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) throw new BogPaymentError("BOG credentials are not configured");
  return { clientId, clientSecret };
}

export function getBogPaymentMethods(): BogPaymentMethod[] {
  const configured = (process.env.BOG_PAYMENT_METHODS ?? "card")
    .split(",")
    .map((method) => method.trim().toLowerCase())
    .filter(Boolean);
  const methods = configured.filter((method): method is BogPaymentMethod =>
    BOG_FULL_PAYMENT_METHODS.includes(method as BogPaymentMethod));
  return ["card", ...new Set(methods.filter((method) => method !== "card"))];
}

export function getBogCallbackPublicKey() {
  const configured = process.env.BOG_CALLBACK_PUBLIC_KEY?.trim().replace(/\\n/g, "\n");
  return configured || BOG_CALLBACK_PUBLIC_KEY;
}

export function getBogCheckoutAvailability() {
  const enabled = enabledValue(process.env.BOG_PAYMENTS_ENABLED);
  const configured = Boolean(
    process.env.BOG_CLIENT_ID?.trim()
    && process.env.BOG_CLIENT_SECRET?.trim()
    && canonicalOrigin(),
  );
  return {
    available: enabled && configured,
    methods: getBogPaymentMethods(),
  };
}

export function getHoomaPlusCheckoutAvailability() {
  const bog = getBogCheckoutAvailability();
  return {
    available: bog.available
      && enabledValue(process.env.HOOMA_PLUS_PAYMENTS_ENABLED),
    methods: bog.methods,
  };
}

export function getBogReturnUrls(orderId: string) {
  const origin = canonicalOrigin();
  if (!origin) throw new BogPaymentError("NEXT_PUBLIC_SITE_URL must be a canonical HTTPS origin");
  const success = new URL("/checkout/result", origin);
  success.searchParams.set("order", orderId);
  success.searchParams.set("return", "success");
  const fail = new URL("/checkout/result", origin);
  fail.searchParams.set("order", orderId);
  fail.searchParams.set("return", "fail");
  return {
    callbackUrl: new URL("/api/payments/bog/callback", origin).toString(),
    successUrl: success.toString(),
    failUrl: fail.toString(),
  };
}

export function getBogMobileReturnUrls(orderId: string) {
  const origin = canonicalOrigin();
  if (!origin) throw new BogPaymentError("NEXT_PUBLIC_SITE_URL must be a canonical HTTPS origin");
  const success = new URL("/mobile/payment/result", origin);
  success.searchParams.set("order", orderId);
  success.searchParams.set("return", "success");
  const fail = new URL("/mobile/payment/result", origin);
  fail.searchParams.set("order", orderId);
  fail.searchParams.set("return", "fail");
  return {
    callbackUrl: new URL("/api/payments/bog/callback", origin).toString(),
    successUrl: success.toString(),
    failUrl: fail.toString(),
  };
}

export function getBogHoomaPlusReturnUrls(purchaseId: string) {
  const origin = canonicalOrigin();
  if (!origin) throw new BogPaymentError("NEXT_PUBLIC_SITE_URL must be a canonical HTTPS origin");
  const success = new URL("/account/hooma-plus/result", origin);
  success.searchParams.set("purchase", purchaseId);
  success.searchParams.set("return", "success");
  const fail = new URL("/account/hooma-plus/result", origin);
  fail.searchParams.set("purchase", purchaseId);
  fail.searchParams.set("return", "fail");
  return {
    callbackUrl: new URL("/api/payments/bog/hooma-plus/callback", origin).toString(),
    successUrl: success.toString(),
    failUrl: fail.toString(),
  };
}

export function getBogMobileHoomaPlusReturnUrls(purchaseId: string) {
  const origin = canonicalOrigin();
  if (!origin) throw new BogPaymentError("NEXT_PUBLIC_SITE_URL must be a canonical HTTPS origin");
  const success = new URL("/mobile/hooma-plus/result", origin);
  success.searchParams.set("purchase", purchaseId);
  success.searchParams.set("return", "success");
  const fail = new URL("/mobile/hooma-plus/result", origin);
  fail.searchParams.set("purchase", purchaseId);
  fail.searchParams.set("return", "fail");
  return {
    callbackUrl: new URL("/api/payments/bog/hooma-plus/callback", origin).toString(),
    successUrl: success.toString(),
    failUrl: fail.toString(),
  };
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new BogPaymentError("BOG returned an invalid JSON response", {
      retryable: response.status >= 500,
      status: response.status,
    });
  }
}

async function requestToken(force = false): Promise<string> {
  if (!force && cachedToken && cachedToken.expiresAt > Date.now() + 30_000) return cachedToken.value;
  if (!force && tokenRequest) return (await tokenRequest).value;

  tokenRequest = (async () => {
    const { clientId, clientSecret } = credentials();
    let response: Response;
    try {
      response = await fetch(BOG_TOKEN_URL, {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`, "utf8").toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "grant_type=client_credentials",
        cache: "no-store",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new BogPaymentError("BOG authentication is temporarily unavailable", { retryable: true });
    }
    const body = await readJson(response) as Record<string, unknown> | null;
    const accessToken = typeof body?.access_token === "string" ? body.access_token : "";
    const expiresIn = typeof body?.expires_in === "number" ? body.expires_in : Number(body?.expires_in);
    if (!response.ok || !accessToken || !Number.isFinite(expiresIn) || expiresIn <= 0) {
      throw new BogPaymentError("BOG authentication failed", {
        retryable: response.status >= 500 || response.status === 429,
        status: response.status,
      });
    }
    const token = { value: accessToken, expiresAt: Date.now() + expiresIn * 1000 };
    cachedToken = token;
    return token;
  })();

  try {
    return (await tokenRequest).value;
  } finally {
    tokenRequest = null;
  }
}

async function authorizedRequest(url: string, init: RequestInit, retryAuth = true): Promise<Response> {
  const token = await requestToken();
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new BogPaymentError("BOG is temporarily unavailable", { retryable: true });
  }
  if (response.status === 401 && retryAuth) {
    cachedToken = null;
    const refreshedToken = await requestToken(true);
    try {
      return await fetch(url, {
        ...init,
        headers: { ...init.headers, Authorization: `Bearer ${refreshedToken}` },
        cache: "no-store",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new BogPaymentError("BOG is temporarily unavailable", { retryable: true });
    }
  }
  return response;
}

export async function createBogOrder(
  input: BogCreateOrderInput,
  idempotencyKey: string,
  language: "ka" | "en",
) {
  const payload = buildBogCreateOrderPayload(input);
  const response = await authorizedRequest(BOG_ORDERS_URL, {
    method: "POST",
    headers: {
      "Accept-Language": language,
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey,
    },
    body: JSON.stringify(payload),
  });
  const body = await readJson(response) as Record<string, unknown> | null;
  const links = body?._links && typeof body._links === "object"
    ? body._links as Record<string, unknown>
    : null;
  const redirect = links?.redirect && typeof links.redirect === "object"
    ? links.redirect as Record<string, unknown>
    : null;
  const providerOrderId = typeof body?.id === "string" ? body.id.trim() : "";
  const redirectUrl = typeof redirect?.href === "string" ? redirect.href.trim() : "";
  if (!response.ok || !providerOrderId || !isTrustedBogRedirect(redirectUrl)) {
    throw new BogPaymentError("BOG could not create the payment", {
      retryable: response.status >= 500 || response.status === 429,
      status: response.status,
    });
  }
  return {
    providerOrderId,
    redirectUrl,
    safeResponse: {
      id: providerOrderId,
      redirect_url: redirectUrl,
    },
  };
}

export async function getBogPaymentDetails(providerOrderId: string) {
  if (!providerOrderId || providerOrderId.length > 128) throw new BogPaymentError("Invalid BOG order identifier");
  const response = await authorizedRequest(`${BOG_RECEIPTS_URL}/${encodeURIComponent(providerOrderId)}`, {
    method: "GET",
    headers: { Accept: "application/json" },
  });
  const body = await readJson(response);
  if (!response.ok) {
    throw new BogPaymentError("BOG payment details are temporarily unavailable", {
      retryable: response.status >= 500 || response.status === 429,
      status: response.status,
    });
  }
  return body;
}
