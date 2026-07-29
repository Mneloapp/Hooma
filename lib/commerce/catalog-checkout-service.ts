import "server-only";

import type { User } from "@supabase/supabase-js";
import { products } from "@/data/products";
import { quoteCatalogDelivery, parseHoomaPlusSummary } from "@/lib/commerce/hooma-plus";
import {
  createBogOrder,
  getBogCheckoutAvailability,
  getBogMobileReturnUrls,
  getBogPaymentMethods,
  getBogReturnUrls,
} from "@/lib/payments/bog";
import {
  isTrustedBogRedirect,
  minorToAmount,
  moneyToMinor,
} from "@/lib/payments/bog-core";
import { reconcileCustomerCatalogBogAttempts } from "@/lib/payments/bog-stale-recovery";
import { cleanOptionalString, cleanString, uuidPattern } from "@/lib/mobile-api/http";

type AdminClient = any;

export type CatalogCheckoutItemInput = {
  product_id?: string;
  variant_id?: string;
  material?: string;
  color?: string;
  quantity?: number;
};

export type CatalogCheckoutInput = {
  guest_email?: string;
  guest_phone?: string;
  full_name?: string;
  city?: string;
  address_line_1?: string;
  address_line_2?: string;
  postal_code?: string;
  latitude?: string | number | null;
  longitude?: string | number | null;
  notes?: string;
  language?: "ka" | "en";
  checkout_key?: string;
  expected_total_minor?: number | null;
  items?: CatalogCheckoutItemInput[];
};

export type CatalogCheckoutResult = {
  ok: boolean;
  code: string;
  message: string;
  redirectUrl?: string;
  resetCheckout?: boolean;
  orderId?: string;
};

type CheckoutContext = {
  admin: AdminClient;
  customerId: string;
  user: User;
  channel: "web" | "mobile";
};

function localized(language: "ka" | "en" | undefined, ka: string, en: string) {
  return language === "en" ? en : ka;
}

function failure(
  input: CatalogCheckoutInput,
  code: string,
  ka: string,
  en: string,
  resetCheckout = false,
): CatalogCheckoutResult {
  return {
    ok: false,
    code,
    message: localized(input.language, ka, en),
    resetCheckout: resetCheckout || undefined,
  };
}

function coordinate(value: string | number | null | undefined, min: number, max: number) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : Number.NaN;
}

function promisedAtInThreeBusinessDays() {
  const promisedAt = new Date();
  let days = 0;
  while (days < 3) {
    promisedAt.setDate(promisedAt.getDate() + 1);
    if (![0, 6].includes(promisedAt.getDay())) days += 1;
  }
  return promisedAt;
}

export async function processCatalogCheckout(
  input: CatalogCheckoutInput,
  context: CheckoutContext,
): Promise<CatalogCheckoutResult> {
  if (!getBogCheckoutAvailability().available) {
    return failure(
      input,
      "payment_unavailable",
      "BOG ონლაინ გადახდა დროებით მიუწვდომელია. თანხა არ ჩამოგეჭრება.",
      "BOG online payment is temporarily unavailable. You will not be charged.",
    );
  }
  if (!Array.isArray(input.items) || input.items.length < 1 || input.items.length > 100) {
    return failure(input, "invalid_cart", "კალათა ცარიელია ან ზედმეტად დიდია.", "The cart is empty or too large.");
  }
  if (!input.checkout_key || !uuidPattern.test(input.checkout_key)) {
    return failure(input, "invalid_checkout_key", "გადახდის სესია არასწორია.", "The payment session is invalid.");
  }

  const fullName = cleanString(input.full_name, 160);
  const phone = cleanString(input.guest_phone, 60);
  const city = cleanString(input.city, 120);
  const addressLine1 = cleanString(input.address_line_1, 300);
  if (!fullName || !phone || !city || !addressLine1) {
    return failure(
      input,
      "required_fields_missing",
      "შეავსე აუცილებელი საკონტაქტო და მიწოდების ველები.",
      "Complete the required contact and delivery fields.",
    );
  }
  const latitude = coordinate(input.latitude, -90, 90);
  const longitude = coordinate(input.longitude, -180, 180);
  if (Number.isNaN(latitude) || Number.isNaN(longitude) || (latitude === null) !== (longitude === null)) {
    return failure(input, "invalid_coordinates", "მისამართის კოორდინატები არასწორია.", "The address coordinates are invalid.");
  }

  const recovery = await reconcileCustomerCatalogBogAttempts(context.admin, context.customerId);
  if (recovery.redirectUrl) {
    return {
      ok: true,
      code: "checkout_recovered",
      redirectUrl: recovery.redirectUrl,
      message: localized(input.language, "წინა უსაფრთხო გადახდის სესია აღდგა...", "The previous secure payment session was recovered..."),
    };
  }
  if (recovery.blocked) {
    return failure(
      input,
      "previous_payment_pending",
      "წინა გადახდის საბოლოო სტატუსს ველოდებით. ხელახლა ნუ გადაიხდი.",
      "We are waiting for the previous payment's final status. Do not pay again.",
    );
  }

  const authoritativeItems = await Promise.all(input.items.map(async (item) => {
    const productId = cleanString(item.product_id, 36);
    const variantId = cleanString(item.variant_id, 36);
    const quantity = Number(item.quantity);
    if (
      products.some((preview) => preview.id === productId)
      || !uuidPattern.test(productId)
      || !uuidPattern.test(variantId)
      || !Number.isInteger(quantity)
      || quantity < 1
      || quantity > 20
    ) return null;

    const { data: variant, error } = await context.admin
      .from("product_variants")
      .select("id,product_id,sku,size_label,material,available_colors,is_active,products!inner(hooma_name,status,production_status,catalog_audit_applied_at)")
      .eq("id", variantId)
      .eq("product_id", productId)
      .eq("is_active", true)
      .eq("products.status", "active")
      .eq("products.production_status", "approved")
      .maybeSingle();
    if (error || !variant) return null;
    const joinedProduct = Array.isArray(variant.products) ? variant.products[0] : variant.products;
    if (!joinedProduct?.catalog_audit_applied_at) return null;

    const { data: price, error: priceError } = await context.admin.rpc("resolve_catalog_price", {
      requested_product_id: productId,
      requested_variant_id: variantId,
    });
    const unitPriceMinor = moneyToMinor(price);
    if (priceError || unitPriceMinor === null || unitPriceMinor <= 0) return null;

    const colors = Array.isArray(variant.available_colors) && variant.available_colors.length
      ? variant.available_colors
      : ["სტანდარტული"];
    const materials = variant.material ? [variant.material] : ["სტანდარტული"];
    const requestedMaterial = cleanOptionalString(item.material, 120);
    const requestedColor = cleanOptionalString(item.color, 120);
    return {
      productId,
      variantId,
      description: String(joinedProduct.hooma_name).slice(0, 255),
      quantity,
      unitPriceMinor,
      material: requestedMaterial && materials.includes(requestedMaterial)
        ? requestedMaterial
        : materials[0],
      color: requestedColor && colors.includes(requestedColor)
        ? requestedColor
        : colors[0],
    };
  }));
  if (authoritativeItems.some((item) => item === null)) {
    return failure(input, "invalid_cart_item", "კალათაში ერთი ან მეტი პროდუქტი არასწორია.", "One or more cart items are invalid.");
  }
  const safeItems = authoritativeItems.filter((item): item is NonNullable<typeof item> => item !== null);
  const subtotalMinor = safeItems.reduce((sum, item) => sum + item.unitPriceMinor * item.quantity, 0);
  const unitCount = safeItems.reduce((sum, item) => sum + item.quantity, 0);
  const { data: summaryData, error: summaryError } = await context.admin.rpc(
    "get_hooma_plus_summary_for_customer_v1",
    { requested_customer_id: context.customerId },
  );
  const summary = parseHoomaPlusSummary(summaryData);
  if (summaryError || !summary) {
    return failure(input, "delivery_rules_unavailable", "მიწოდების წესები დროებით მიუწვდომელია.", "Delivery rules are temporarily unavailable.");
  }
  const quote = quoteCatalogDelivery({ subtotalMinor, unitCount, summary });
  if (
    input.expected_total_minor !== null
    && input.expected_total_minor !== undefined
    && input.expected_total_minor !== quote.totalMinor
  ) {
    return failure(input, "cart_changed", "კალათის ფასი შეიცვალა. გადაამოწმე შეკვეთა.", "The cart price changed. Review the order.", true);
  }

  const deliveryAddress = {
    full_name: fullName,
    phone,
    email: context.user.email ?? cleanOptionalString(input.guest_email, 320),
    city,
    address_line_1: addressLine1,
    address_line_2: cleanOptionalString(input.address_line_2, 300),
    postal_code: cleanOptionalString(input.postal_code, 30),
    latitude,
    longitude,
    google_maps_url: latitude !== null && longitude !== null
      ? `https://www.google.com/maps/search/?api=1&query=${latitude.toFixed(7)}%2C${longitude.toFixed(7)}`
      : null,
  };
  const { data: checkoutData, error: checkoutError } = await context.admin.rpc("begin_bog_checkout_v2", {
    requested_customer_id: context.customerId,
    requested_guest_email: context.user.email ?? cleanOptionalString(input.guest_email, 320),
    requested_guest_phone: phone,
    requested_delivery_address: deliveryAddress,
    requested_notes: cleanOptionalString(input.notes, 1000),
    requested_promised_at: promisedAtInThreeBusinessDays().toISOString(),
    requested_idempotency_key: input.checkout_key,
    requested_expected_total: minorToAmount(quote.totalMinor),
    requested_items: safeItems.map((item) => ({
      product_id: item.productId,
      variant_id: item.variantId,
      material: item.material,
      color: item.color,
      quantity: item.quantity,
    })),
  });
  const checkout = checkoutData && typeof checkoutData === "object"
    ? checkoutData as Record<string, unknown>
    : null;
  const orderId = typeof checkout?.order_id === "string" ? checkout.order_id : "";
  const attemptId = typeof checkout?.attempt_id === "string" ? checkout.attempt_id : "";
  const attemptStatus = typeof checkout?.attempt_status === "string" ? checkout.attempt_status : "";
  const totalMinor = moneyToMinor(checkout?.amount);
  const deliveryMinor = moneyToMinor(checkout?.delivery_fee);
  const providerPaymentId = typeof checkout?.provider_payment_id === "string"
    ? checkout.provider_payment_id
    : "";
  if (
    checkoutError
    || !uuidPattern.test(orderId)
    || !uuidPattern.test(attemptId)
    || totalMinor !== quote.totalMinor
    || deliveryMinor !== quote.deliveryMinor
  ) {
    return failure(input, "checkout_preparation_failed", "შეკვეთის უსაფრთხოდ მომზადება ვერ მოხერხდა.", "The order could not be prepared safely.");
  }
  if (["paid", "refunded", "review_required"].includes(attemptStatus)) {
    return failure(input, "payment_already_settled", "ამ შეკვეთის გადახდის სტატუსი უკვე დაფიქსირებულია.", "This order already has a recorded payment status.");
  }
  if (["failed", "cancelled"].includes(attemptStatus)) {
    return failure(input, "payment_session_closed", "წინა გადახდის სესია დასრულებულია. სცადე ახალი სესიით.", "The previous payment session has ended. Start a new session.", true);
  }
  const storedResponse = checkout?.response_payload && typeof checkout.response_payload === "object"
    ? checkout.response_payload as Record<string, unknown>
    : null;
  if (isTrustedBogRedirect(storedResponse?.redirect_url)) {
    return {
      ok: true,
      code: "checkout_reused",
      orderId,
      redirectUrl: storedResponse.redirect_url,
      message: localized(input.language, "გადამისამართება უსაფრთხო გადახდაზე...", "Redirecting to secure payment..."),
    };
  }
  if (providerPaymentId) {
    return failure(input, "payment_confirmation_pending", "გადახდის სესია მოწმდება. ხელახლა ნუ გადაიხდი.", "The payment session is being verified. Do not pay again.");
  }

  const urls = context.channel === "mobile"
    ? getBogMobileReturnUrls(orderId)
    : getBogReturnUrls(orderId);
  const payment = await createBogOrder({
    callbackUrl: urls.callbackUrl,
    externalOrderId: attemptId,
    totalMinor: quote.totalMinor,
    basket: safeItems.map((item) => ({
      productId: item.productId,
      description: item.description,
      quantity: item.quantity,
      unitPriceMinor: item.unitPriceMinor,
    })),
    deliveryMinor: quote.deliveryMinor,
    ttlMinutes: 15,
    successUrl: urls.successUrl,
    failUrl: urls.failUrl,
    paymentMethods: getBogPaymentMethods(),
  }, input.checkout_key, input.language === "en" ? "en" : "ka");
  const { error: bindError } = await context.admin.rpc("bind_bog_payment_attempt_v1", {
    requested_attempt_id: attemptId,
    requested_provider_payment_id: payment.providerOrderId,
    requested_response: payment.safeResponse,
  });
  if (bindError?.message?.includes("BOG_PROVIDER_ID_CONFLICT")) {
    return failure(input, "payment_bind_conflict", "გადახდის დაკავშირება ვერ დასრულდა. ხელახლა ნუ გადაიხდი.", "The payment could not be linked. Do not pay again.");
  }
  return {
    ok: true,
    code: bindError ? "checkout_callback_binding_pending" : "checkout_created",
    orderId,
    redirectUrl: payment.redirectUrl,
    message: localized(input.language, "გადამისამართება უსაფრთხო გადახდაზე...", "Redirecting to secure payment..."),
  };
}
