"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { products } from "@/data/products";
import {
  BogPaymentError,
  createBogOrder,
  getBogCheckoutAvailability,
  getBogPaymentDetails,
  getBogPaymentMethods,
  getBogReturnUrls,
} from "@/lib/payments/bog";
import {
  isTrustedBogRedirect,
  minorToAmount,
  moneyToMinor,
  parseBogPaymentDetails,
  sanitizeBogPaymentDetails,
} from "@/lib/payments/bog-core";
import { reconcileCustomerCatalogBogAttempts } from "@/lib/payments/bog-stale-recovery";

type AuthState = {
  ok?: boolean;
  message?: string;
};

type CreateOrderResult = {
  ok: boolean;
  message: string;
  redirectUrl?: string;
  resetCheckout?: boolean;
};

export type ProfileActionState = AuthState & { savedAt?: string };

const getString = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isGeorgian = (value: unknown) => value === "ka";

const safeNextPath = (value: string, fallback = "/account") => {
  const safePath = value.startsWith("/") && !value.startsWith("//") && !value.includes("\\") ? value : fallback;
  return safePath === "/" ? fallback : safePath;
};

async function siteOrigin() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${protocol}://${host}`;
}

export async function loginAction(_state: AuthState, formData: FormData): Promise<AuthState> {
  const georgian = isGeorgian(getString(formData, "language"));
  const supabase = await createClient();
  if (!supabase) return { message: georgian ? "Supabase ჯერ არ არის დაკავშირებული." : "Supabase is not configured yet." };

  const email = getString(formData, "email");
  const password = getString(formData, "password");
  const requestedNext = getString(formData, "next");
  const next = safeNextPath(requestedNext);
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) return { message: georgian ? "ელფოსტა ან პაროლი არასწორია." : "The email or password is incorrect." };
  const { data } = await supabase.auth.getUser();
  if (data.user) await (supabase as any).from("profiles").update({ last_login_at: new Date().toISOString() }).eq("id", data.user.id);
  revalidatePath("/", "layout");
  redirect(next);
}

export async function googleLoginAction(formData: FormData) {
  const supabase = await createClient();
  const next = safeNextPath(getString(formData, "next"));
  if (!supabase) redirect(`/login?error=config&next=${encodeURIComponent(next)}`);

  const callback = new URL("/auth/callback", await siteOrigin());
  callback.searchParams.set("next", next);
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: callback.toString() },
  });

  if (error || !data.url) redirect(`/login?error=google&next=${encodeURIComponent(next)}`);
  redirect(data.url);
}

export async function signupAction(_state: AuthState, formData: FormData): Promise<AuthState> {
  const georgian = isGeorgian(getString(formData, "language"));
  const supabase = await createClient();
  if (!supabase) return { message: georgian ? "Supabase ჯერ არ არის დაკავშირებული." : "Supabase is not configured yet." };

  const email = getString(formData, "email");
  const password = getString(formData, "password");
  const fullName = getString(formData, "full_name");
  const phone = getString(formData, "phone");
  const callback = new URL("/auth/callback", await siteOrigin());
  callback.searchParams.set("next", "/account");

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName, phone },
      emailRedirectTo: callback.toString(),
    },
  });

  if (error) return { message: georgian ? "ანგარიშის შექმნა ვერ მოხერხდა. გადაამოწმე მონაცემები და სცადე ხელახლა." : "The account could not be created. Check your details and try again." };
  return { ok: true, message: georgian ? "ანგარიში შეიქმნა. თუ ელფოსტის დადასტურება ჩართულია, შეამოწმე შემოსული წერილები." : "Your account was created. If email confirmation is enabled, check your inbox." };
}

export async function logoutAction() {
  const supabase = await createClient();
  if (supabase) await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/");
}

export async function updateProfileAction(_state: ProfileActionState, formData: FormData): Promise<ProfileActionState> {
  const supabase = (await createClient()) as any;
  const georgian = isGeorgian(getString(formData, "language"));
  if (!supabase) return { ok: false, message: georgian ? "Supabase ჯერ არ არის დაკავშირებული." : "Supabase is not configured yet." };

  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login?next=/account");

  const fullName = getString(formData, "full_name");
  const phone = getString(formData, "phone");
  const updatedAt = new Date().toISOString();
  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      full_name: fullName, phone, updated_at: updatedAt,
    })
    .eq("id", data.user.id);

  if (profileError) return { ok: false, message: georgian ? "პროფილის შენახვა ვერ მოხერხდა. სცადე თავიდან." : "The profile could not be saved. Try again." };
  const admin = createAdminClient() as any;
  if (admin) {
    const { data: customer } = await admin.from("customers").select("id").eq("profile_id", data.user.id).limit(1).maybeSingle();
    const customerPayload = { email: data.user.email ?? null, full_name: fullName, phone };
    const { error: customerError } = customer?.id ? await admin.from("customers").update(customerPayload).eq("id", customer.id) : await admin.from("customers").insert({ profile_id: data.user.id, ...customerPayload });
    if (customerError) return { ok: false, message: georgian ? "პროფილი შეინახა, მაგრამ შეკვეთების პროფილის სინქრონიზაცია ვერ დასრულდა." : "The profile was saved, but its order profile could not be synchronized." };
  } else await supabase.from("customers").update({ full_name: fullName, phone }).eq("profile_id", data.user.id);
  await supabase.auth.updateUser({ data: { full_name: fullName, phone } });
  revalidatePath("/account"); revalidatePath("/admin/customers");
  return { ok: true, message: georgian ? "მონაცემები წარმატებით შეინახა." : "Your profile was saved successfully.", savedAt: updatedAt };
}

export async function createOrderAction(formData: FormData): Promise<CreateOrderResult> {
  const supabase = (await createClient()) as any;
  const admin = createAdminClient() as any;
  let payload: {
    guest_email?: string;
    guest_phone?: string;
    full_name?: string;
    city?: string;
    address_line_1?: string;
    address_line_2?: string;
    postal_code?: string;
    latitude?: string;
    longitude?: string;
    notes?: string;
    language?: "ka" | "en";
    checkout_key?: string;
    expected_total_minor?: number | null;
    items?: Array<{
      product_id: string;
      variant_id: string;
      inventory_id?: string | null;
      material?: string;
      color?: string;
      quantity?: number;
    }>;
  };

  try {
    payload = JSON.parse(getString(formData, "payload") || "{}");
  } catch {
    return { ok: false, message: "Invalid order payload." };
  }

  const georgian = isGeorgian(payload.language);
  const deliveryLatitude = payload.latitude?.trim() ? Number(payload.latitude) : null;
  const deliveryLongitude = payload.longitude?.trim() ? Number(payload.longitude) : null;
  const deliveryCoordinates = deliveryLatitude !== null && deliveryLongitude !== null && Number.isFinite(deliveryLatitude) && Number.isFinite(deliveryLongitude) && deliveryLatitude >= -90 && deliveryLatitude <= 90 && deliveryLongitude >= -180 && deliveryLongitude <= 180 ? { latitude: deliveryLatitude, longitude: deliveryLongitude } : null;
  const deliveryMapsUrl = deliveryCoordinates ? `https://www.google.com/maps/search/?api=1&query=${deliveryCoordinates.latitude.toFixed(7)}%2C${deliveryCoordinates.longitude.toFixed(7)}` : null;

  if (!payload.items?.length) return { ok: false, message: georgian ? "კალათა ცარიელია." : "Your cart is empty." };
  if (payload.items.length > 100) return { ok: false, message: georgian ? "ერთ შეკვეთაში ზედმეტად ბევრი პოზიციაა." : "There are too many items in one order." };
  if (!payload.guest_phone?.trim() || !payload.full_name?.trim() || !payload.city?.trim() || !payload.address_line_1?.trim()) {
    return { ok: false, message: georgian ? "შეავსე აუცილებელი საკონტაქტო და მიწოდების ველები." : "Please complete the required contact and delivery fields." };
  }
  if (!payload.checkout_key || !uuidPattern.test(payload.checkout_key)) {
    return { ok: false, message: georgian ? "გადახდის სესია არასწორია. განაახლე გვერდი და სცადე თავიდან." : "The payment session is invalid. Refresh the page and try again." };
  }
  if (!admin) return { ok: false, message: georgian ? "შეკვეთების საცავი ჯერ არ არის დაკავშირებული." : "Order storage is not connected yet." };
  if (!supabase) return { ok: false, message: georgian ? "შეკვეთის გასაფორმებლად ანგარიშში შესვლაა საჭირო." : "Sign in to place an order." };
  if (!getBogCheckoutAvailability().available) {
    return {
      ok: false,
      message: georgian
        ? "BOG ონლაინ გადახდა დროებით მიუწვდომელია. თანხა არ ჩამოგეჭრება."
        : "BOG online payment is temporarily unavailable. You will not be charged.",
    };
  }

  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return { ok: false, message: georgian ? "შეკვეთის გასაფორმებლად ჯერ ანგარიშში შედი." : "Sign in before placing an order." };
  const { data: customer } = await supabase.from("customers").select("id").eq("profile_id", user.id).maybeSingle();
  if (!customer?.id) return { ok: false, message: georgian ? "მომხმარებლის პროფილი ვერ მოიძებნა. გამოდი ანგარიშიდან და ხელახლა შედი." : "Your customer profile could not be found. Sign out and sign in again." };
  const customerId = customer.id;

  try {
    const recovery = await reconcileCustomerCatalogBogAttempts(
      admin,
      customerId,
    );
    if (recovery.redirectUrl) {
      return {
        ok: true,
        redirectUrl: recovery.redirectUrl,
        message: georgian
          ? "წინა უსაფრთხო გადახდის სესია აღდგა..."
          : "Your previous secure payment session was recovered...",
      };
    }
    if (recovery.blocked) {
      return {
        ok: false,
        message: georgian
          ? "წინა გადახდის საბოლოო საბანკო სტატუსს ველოდებით. ხელახლა ნუ გადაიხდი; მოგვიანებით სცადე ან დაგვიკავშირდი."
          : "We are waiting for a previous payment's final bank status. Do not pay again; retry later or contact us.",
      };
    }
  } catch (error) {
    console.error("BOG_CUSTOMER_STALE_RECONCILIATION_FAILED", {
      customerId,
      retryable: error instanceof BogPaymentError ? error.retryable : null,
    });
    return {
      ok: false,
      message: georgian
        ? "წინა გადახდის უსაფრთხოდ შემოწმება ვერ მოხერხდა. ხელახლა ნუ გადაიხდი; მოგვიანებით სცადე ან დაგვიკავშირდი."
        : "A previous payment could not be checked safely. Do not pay again; retry later or contact us.",
    };
  }

  const authoritativeItems = await Promise.all(payload.items.map(async (item) => {
    const catalogProduct = products.find((product) => product.id === item.product_id);
    const quantity = Number(item.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) return null;

    if (catalogProduct) {
      // Local preview cards are never orderable. Every catalog order must retain
      // real product/variant UUIDs so production receives its reviewed source.
      return null;
    }

    if (!uuidPattern.test(item.product_id) || !uuidPattern.test(item.variant_id)) return null;
    const { data: variant, error: variantError } = await admin
      .from("product_variants")
      .select("id, product_id, sku, size_label, material, available_colors, is_active, products!inner(hooma_name, status, production_status, catalog_audit_applied_at)")
      .eq("id", item.variant_id)
      .eq("product_id", item.product_id)
      .eq("is_active", true)
      .eq("products.status", "active")
      .eq("products.production_status", "approved")
      .maybeSingle();
    if (variantError || !variant) return null;

    const { data: resolvedPrice, error: priceError } = await admin.rpc("resolve_catalog_price", {
      requested_product_id: item.product_id,
      requested_variant_id: item.variant_id,
    });
    if (priceError || typeof resolvedPrice !== "number" || resolvedPrice <= 0) return null;

    const joinedProduct = Array.isArray(variant.products) ? variant.products[0] : variant.products;
    if (!joinedProduct?.catalog_audit_applied_at) return null;
    const availableColors = Array.isArray(variant.available_colors) && variant.available_colors.length ? variant.available_colors : ["სტანდარტული"];
    const availableMaterials = variant.material ? [variant.material] : ["სტანდარტული"];
    const material = availableMaterials.includes(item.material ?? "") ? item.material! : availableMaterials[0];
    const color = availableColors.includes(item.color ?? "") ? item.color! : availableColors[0];
    return {
      productId: item.product_id,
      variantId: item.variant_id,
      productName: joinedProduct.hooma_name,
      variant: { sku: variant.sku, sizeLabel: variant.size_label || "Standard" },
      unitPrice: resolvedPrice,
      quantity,
      material,
      color,
    };
  }));
  if (authoritativeItems.some((item) => item === null)) return { ok: false, message: georgian ? "კალათაში ერთი ან მეტი პროდუქტი არასწორია." : "One or more cart items are invalid." };

  const safeItems = authoritativeItems.filter((item): item is NonNullable<typeof item> => item !== null);
  const basket = safeItems.map((item) => {
    const unitPriceMinor = moneyToMinor(item.unitPrice);
    return unitPriceMinor === null ? null : {
      productId: item.productId,
      description: item.productName,
      quantity: item.quantity,
      unitPriceMinor,
    };
  });
  if (basket.some((item) => item === null)) {
    return { ok: false, message: georgian ? "პროდუქტის ფასი არასწორია." : "A product price is invalid." };
  }
  const safeBasket = basket.filter((item): item is NonNullable<typeof item> => item !== null);
  const basketTotalMinor = safeBasket.reduce(
    (sum, item) => sum + item.unitPriceMinor * item.quantity,
    0,
  );
  if (
    !Number.isSafeInteger(payload.expected_total_minor)
    || payload.expected_total_minor! < basketTotalMinor
    || payload.expected_total_minor! > basketTotalMinor + 500
  ) {
    return {
      ok: false,
      message: georgian
        ? "კალათის ფასი შეიცვალა. განაახლე გვერდი და გადაამოწმე შეკვეთა."
        : "A cart price changed. Refresh the page and review the order.",
    };
  }

  const promisedAt = new Date();
  let businessDays = 0;
  while (businessDays < 3) {
    promisedAt.setDate(promisedAt.getDate() + 1);
    const weekday = promisedAt.getDay();
    if (weekday !== 0 && weekday !== 6) businessDays += 1;
  }

  const deliveryAddress = {
    full_name: payload.full_name.trim(),
    phone: payload.guest_phone.trim(),
    email: user.email ?? payload.guest_email?.trim() ?? null,
    city: payload.city.trim(),
    address_line_1: payload.address_line_1.trim(),
    address_line_2: payload.address_line_2?.trim() || null,
    postal_code: payload.postal_code?.trim() || null,
    latitude: deliveryCoordinates?.latitude ?? null,
    longitude: deliveryCoordinates?.longitude ?? null,
    google_maps_url: deliveryMapsUrl,
  };
  const checkoutItems = safeItems.map((item) => ({
    product_id: item.productId,
    variant_id: item.variantId,
    material: item.material,
    color: item.color,
    quantity: item.quantity,
  }));

  const { data: checkoutData, error: checkoutError } = await admin.rpc("begin_bog_checkout_v2", {
    requested_customer_id: customerId,
    requested_guest_email: user.email ?? payload.guest_email ?? null,
    requested_guest_phone: payload.guest_phone,
    requested_delivery_address: deliveryAddress,
    requested_notes: payload.notes ?? null,
    requested_promised_at: promisedAt.toISOString(),
    requested_idempotency_key: payload.checkout_key,
    requested_expected_total: minorToAmount(payload.expected_total_minor!),
    requested_items: checkoutItems,
  });
  const checkout = checkoutData && typeof checkoutData === "object"
    ? checkoutData as Record<string, unknown>
    : null;
  const orderId = typeof checkout?.order_id === "string" ? checkout.order_id : "";
  const attemptId = typeof checkout?.attempt_id === "string" ? checkout.attempt_id : "";
  const trackingCode = typeof checkout?.tracking_code === "string" ? checkout.tracking_code : "";
  const attemptStatus = typeof checkout?.attempt_status === "string" ? checkout.attempt_status : "";
  const providerPaymentId = typeof checkout?.provider_payment_id === "string"
    ? checkout.provider_payment_id
    : "";
  const attemptCreatedAt = typeof checkout?.attempt_created_at === "string"
    ? Date.parse(checkout.attempt_created_at)
    : Number.NaN;
  const reusedCheckout = checkout?.reused === true;
  const totalMinor = moneyToMinor(checkout?.amount);
  const deliveryMinor = moneyToMinor(checkout?.delivery_fee);
  const ttlMinutes = Number(checkout?.payment_ttl_minutes ?? 15);
  if (checkoutError || !uuidPattern.test(orderId) || !uuidPattern.test(attemptId) || !attemptStatus || totalMinor === null || totalMinor <= 0) {
    console.error("BOG_CHECKOUT_PREPARATION_FAILED", { code: checkoutError?.code ?? null });
    const totalChanged = checkoutError?.message?.includes("HOOMA_CHECKOUT_TOTAL_CHANGED");
    return {
      ok: false,
      resetCheckout: totalChanged,
      message: totalChanged
        ? georgian
          ? "კალათის ან მიწოდების ფასი შეიცვალა. გვერდი განაახლე და შეკვეთა ხელახლა გადაამოწმე."
          : "A cart or delivery price changed. Refresh the page and review the order again."
        : georgian
          ? "შეკვეთის უსაფრთხოდ მომზადება ვერ მოხერხდა. თანხა არ ჩამოგეჭრება."
          : "The order could not be prepared safely. You will not be charged.",
    };
  }

  if (
    deliveryMinor === null
    || basketTotalMinor + deliveryMinor !== totalMinor
    || (totalMinor !== payload.expected_total_minor
      && (!reusedCheckout || totalMinor > payload.expected_total_minor!))
    || !Number.isInteger(ttlMinutes)
    || ttlMinutes < 2
    || ttlMinutes > 1_440
  ) {
    return {
      ok: false,
      message: georgian
        ? "კალათის ფასი შეიცვალა. განაახლე გვერდი და გადაამოწმე შეკვეთა."
        : "A cart price changed. Refresh the page and review the order.",
    };
  }

  const storedResponse = checkout?.response_payload && typeof checkout.response_payload === "object"
    ? checkout.response_payload as Record<string, unknown>
    : null;
  if (attemptStatus === "paid" || attemptStatus === "refunded" || attemptStatus === "review_required") {
    return {
      ok: false,
      message: georgian
        ? `ამ შეკვეთის გადახდის სტატუსი უკვე დაფიქსირებულია. გადაამოწმე „ჩემი შეკვეთები“ — კოდი ${trackingCode || orderId.slice(0, 8)}.`
        : `This order already has a recorded payment status. Check My Orders — code ${trackingCode || orderId.slice(0, 8)}.`,
    };
  }
  if (attemptStatus === "failed" || attemptStatus === "cancelled") {
    return {
      ok: false,
      resetCheckout: true,
      message: georgian
        ? "წინა გადახდის სესია დასრულებულია. ხელახლა დააჭირე გადახდის ღილაკს ახალი უსაფრთხო სესიისთვის."
        : "The previous payment session has ended. Press the payment button again to start a new secure session.",
    };
  }
  if (
    ["created", "pending"].includes(attemptStatus)
    && (
      !Number.isFinite(attemptCreatedAt)
      || Date.now() - attemptCreatedAt > 20 * 60 * 1000
    )
  ) {
    try {
      let recoveredProviderId = providerPaymentId;
      let recoveredRedirect = "";
      if (!recoveredProviderId) {
        // BOG idempotency returns the original order when the first response
        // was lost. This recovers its provider ID before any reservation can
        // be released.
        const urls = getBogReturnUrls(orderId);
        const recoveredPayment = await createBogOrder({
          callbackUrl: urls.callbackUrl,
          externalOrderId: attemptId,
          totalMinor,
          basket: safeBasket,
          deliveryMinor,
          ttlMinutes,
          successUrl: urls.successUrl,
          failUrl: urls.failUrl,
          paymentMethods: getBogPaymentMethods(),
        }, payload.checkout_key, georgian ? "ka" : "en");
        recoveredProviderId = recoveredPayment.providerOrderId;
        recoveredRedirect = recoveredPayment.redirectUrl;
        const { error: recoveredBindError } = await admin.rpc(
          "bind_bog_payment_attempt_v1",
          {
            requested_attempt_id: attemptId,
            requested_provider_payment_id: recoveredProviderId,
            requested_response: recoveredPayment.safeResponse,
          },
        );
        if (recoveredBindError?.message?.includes("BOG_PROVIDER_ID_CONFLICT")) {
          throw new Error("BOG_PROVIDER_ID_CONFLICT");
        }
      }

      const receipt = parseBogPaymentDetails(
        await getBogPaymentDetails(recoveredProviderId),
      );
      if (
        !receipt
        || receipt.orderId !== recoveredProviderId
        || receipt.externalOrderId !== attemptId
      ) {
        throw new Error("BOG_STALE_RECEIPT_MISMATCH");
      }

      if (receipt.status === "rejected") {
        const { error: releaseError } = await admin.rpc(
          "release_rejected_bog_delivery_reservation_v1",
          {
            requested_attempt_id: attemptId,
            requested_provider_payment_id: receipt.orderId,
            requested_external_order_id: receipt.externalOrderId,
            requested_provider_status: receipt.status,
            requested_capture: receipt.capture,
            requested_currency: receipt.currency,
            requested_request_amount: receipt.requestAmountMinor === null
              ? null
              : minorToAmount(receipt.requestAmountMinor),
            requested_has_split: receipt.hasSplit,
            requested_safe_payload: sanitizeBogPaymentDetails(receipt),
          },
        );
        if (releaseError) throw releaseError;
        return {
          ok: false,
          resetCheckout: true,
          message: georgian
            ? "წინა გადახდის სესია ბანკმა დახურა. დაჯავშნილი უფასო ერთეულები აღდგა; ახალი სესიისთვის ხელახლა დააჭირე."
            : "The bank closed the previous payment session. Reserved free units were restored; press again to start a new session.",
        };
      }

      if (
        recoveredRedirect
        && ["created", "processing"].includes(receipt.status)
      ) {
        return {
          ok: true,
          redirectUrl: recoveredRedirect,
          message: georgian
            ? "უსაფრთხო გადახდის სესია აღდგა..."
            : "Secure payment session recovered...",
        };
      }

      return {
        ok: false,
        message: receipt.status === "completed"
          ? georgian
            ? `ბანკში გადახდა ჩანს, მაგრამ დაცულ callback-ს ველოდებით. ხელახლა ნუ გადაიხდი; თუ სტატუსი არ განახლდა, დაგვიკავშირდი კოდით ${trackingCode || orderId.slice(0, 8)}.`
            : `The bank shows a payment, but we are waiting for the secure callback. Do not pay again; if the status does not update, contact us with code ${trackingCode || orderId.slice(0, 8)}.`
          : georgian
            ? `წინა სესიის საბოლოო საბანკო სტატუსს ველოდებით. ხელახლა ნუ გადაიხდი; მოგვიანებით სცადე ან დაგვიკავშირდი კოდით ${trackingCode || orderId.slice(0, 8)}.`
            : `We are waiting for the previous session's final bank status. Do not pay again; retry later or contact us with code ${trackingCode || orderId.slice(0, 8)}.`,
      };
    } catch (error) {
      console.error("BOG_STALE_CHECKOUT_RECONCILIATION_FAILED", {
        attemptId,
        retryable: error instanceof BogPaymentError ? error.retryable : null,
      });
    }
    return {
      ok: false,
      message: georgian
        ? `წინა გადახდის სესიის უსაფრთხოდ დახურვა ვერ მოხერხდა. ხელახლა ნუ გადაიხდი; მოგვიანებით სცადე ან დაგვიკავშირდი კოდით ${trackingCode || orderId.slice(0, 8)}.`
        : `The previous payment session could not be closed safely. Do not pay again; retry later or contact us with code ${trackingCode || orderId.slice(0, 8)}.`,
    };
  }
  if (["created", "pending"].includes(attemptStatus) && isTrustedBogRedirect(storedResponse?.redirect_url)) {
    return {
      ok: true,
      redirectUrl: storedResponse.redirect_url,
      message: georgian ? "გადამისამართება უსაფრთხო გადახდაზე..." : "Redirecting to secure payment...",
    };
  }

  try {
    const urls = getBogReturnUrls(orderId);
    const payment = await createBogOrder({
      callbackUrl: urls.callbackUrl,
      externalOrderId: attemptId,
      totalMinor,
      basket: safeBasket,
      deliveryMinor,
      ttlMinutes,
      successUrl: urls.successUrl,
      failUrl: urls.failUrl,
      paymentMethods: getBogPaymentMethods(),
    }, payload.checkout_key, georgian ? "ka" : "en");

    const { error: bindError } = await admin.rpc("bind_bog_payment_attempt_v1", {
      requested_attempt_id: attemptId,
      requested_provider_payment_id: payment.providerOrderId,
      requested_response: payment.safeResponse,
    });
    if (bindError) {
      console.error("BOG_CHECKOUT_BIND_FAILED", {
        attemptId,
        providerOrderId: payment.providerOrderId,
        code: bindError.code ?? null,
      });
      if (!bindError.message?.includes("BOG_PROVIDER_ID_CONFLICT")) {
        // The signed callback can bind this provider order by the pre-created
        // external attempt ID even if this response write was interrupted.
        return {
          ok: true,
          redirectUrl: payment.redirectUrl,
          message: georgian ? "გადამისამართება უსაფრთხო გადახდაზე..." : "Redirecting to secure payment...",
        };
      }
      return {
        ok: false,
        message: georgian
          ? `გადახდის სესია შეიქმნა, მაგრამ დადასტურება ვერ დასრულდა. დაგვიკავშირდი კოდით ${trackingCode || orderId.slice(0, 8)}; ხელახლა ნუ გადაიხდი.`
          : `The payment session was created but could not be confirmed. Contact us with code ${trackingCode || orderId.slice(0, 8)}; do not pay again.`,
      };
    }

    revalidatePath("/admin/orders");
    revalidatePath("/account/orders");
    return {
      ok: true,
      redirectUrl: payment.redirectUrl,
      message: georgian ? "გადამისამართება უსაფრთხო გადახდაზე..." : "Redirecting to secure payment...",
    };
  } catch (error) {
    const retryable = error instanceof BogPaymentError && error.retryable;
    console.error("BOG_CHECKOUT_INITIALIZATION_FAILED", {
      attemptId,
      retryable,
      status: error instanceof BogPaymentError ? error.status : null,
    });
    return {
      ok: false,
      message: georgian
        ? retryable
          ? "BOG დროებით მიუწვდომელია. თანხა არ ჩამოგეჭრება; რამდენიმე წუთში იგივე გვერდიდან სცადე."
          : "BOG გადახდის შექმნა ვერ მოხერხდა. თანხა არ ჩამოგეჭრება."
        : retryable
          ? "BOG is temporarily unavailable. You will not be charged; retry from this page in a few minutes."
          : "BOG could not create the payment. You will not be charged.",
    };
  }
}
