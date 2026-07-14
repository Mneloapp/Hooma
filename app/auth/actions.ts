"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { products } from "@/data/products";

type AuthState = {
  ok?: boolean;
  message?: string;
};

const getString = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const safeNextPath = (value: string, fallback = "/account") => value.startsWith("/") && !value.startsWith("//") && !value.includes("\\") ? value : fallback;

async function siteOrigin() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${protocol}://${host}`;
}

export async function loginAction(_state: AuthState, formData: FormData): Promise<AuthState> {
  const supabase = await createClient();
  if (!supabase) return { message: "Supabase is not configured yet." };

  const email = getString(formData, "email");
  const password = getString(formData, "password");
  const requestedNext = getString(formData, "next");
  const next = safeNextPath(requestedNext);
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) return { message: "ელფოსტა ან პაროლი არასწორია." };
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
  const supabase = await createClient();
  if (!supabase) return { message: "Supabase is not configured yet." };

  const email = getString(formData, "email");
  const password = getString(formData, "password");
  const fullName = getString(formData, "full_name");
  const phone = getString(formData, "phone");

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName, phone } },
  });

  if (error) return { message: error.message };
  return { ok: true, message: "ანგარიში შეიქმნა. თუ ელფოსტის დადასტურება ჩართულია, შეამოწმე შემოსული წერილები." };
}

export async function logoutAction() {
  const supabase = await createClient();
  if (supabase) await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/");
}

export async function updateProfileAction(formData: FormData) {
  const supabase = (await createClient()) as any;
  if (!supabase) return;

  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login?next=/account");

  await supabase
    .from("profiles")
    .update({
      full_name: getString(formData, "full_name"),
      phone: getString(formData, "phone"),
      updated_at: new Date().toISOString(),
    })
    .eq("id", data.user.id);

  revalidatePath("/account");
}

export async function createOrderAction(formData: FormData) {
  const supabase = (await createClient()) as any;
  const admin = createAdminClient() as any;
  let payload: {
    guest_email?: string;
    guest_phone?: string;
    full_name?: string;
    city?: string;
    address_line_1?: string;
    notes?: string;
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

  if (!payload.items?.length) return { ok: false, message: "Your cart is empty." };
  if (!payload.guest_phone?.trim() || !payload.full_name?.trim() || !payload.city?.trim() || !payload.address_line_1?.trim()) {
    return { ok: false, message: "Please complete the required contact and delivery fields." };
  }
  if (!admin) return { ok: false, message: "Test order storage is not connected yet. Add the server-only Supabase service role key." };
  if (!supabase) return { ok: false, message: "შეკვეთის გასაფორმებლად ანგარიშში შესვლაა საჭირო." };

  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return { ok: false, message: "შეკვეთის გასაფორმებლად ჯერ ანგარიშში შედი." };
  const { data: customer } = await supabase.from("customers").select("id").eq("profile_id", user.id).maybeSingle();
  if (!customer?.id) return { ok: false, message: "მომხმარებლის პროფილი ვერ მოიძებნა. გამოდი ანგარიშიდან და ხელახლა შედი." };
  const customerId = customer.id;

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
      .select("id, product_id, sku, size_label, material, available_colors, is_active, products!inner(hooma_name, status, production_status)")
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
  if (authoritativeItems.some((item) => item === null)) return { ok: false, message: "One or more cart items are invalid." };

  const safeItems = authoritativeItems.filter((item): item is NonNullable<typeof item> => item !== null);
  const subtotal = safeItems.reduce((sum, item) => sum + (item.unitPrice ?? 0) * item.quantity, 0);

  const promisedAt = new Date();
  let businessDays = 0;
  while (businessDays < 3) {
    promisedAt.setDate(promisedAt.getDate() + 1);
    const weekday = promisedAt.getDay();
    if (weekday !== 0 && weekday !== 6) businessDays += 1;
  }

  const orderInsert = {
    customer_id: customerId,
    guest_email: user.email ?? payload.guest_email ?? null,
    guest_phone: payload.guest_phone ?? null,
    status: "pending",
    payment_status: "unpaid",
    subtotal,
    delivery_fee: 0,
    total: subtotal,
    delivery_address: {
      full_name: payload.full_name,
      city: payload.city,
      address_line_1: payload.address_line_1,
    },
    notes: payload.notes ?? null,
    fulfillment_status: "order_received",
    promised_at: promisedAt.toISOString(),
    test_mode: true,
  };

  const { data: order, error } = await admin.from("orders").insert(orderInsert).select("id, tracking_code").single();
  if (error || !order) return { ok: false, message: error?.message ?? "Could not create order." };

  const items = safeItems.map(({ productId, variantId, productName, variant, unitPrice, quantity, material, color }) => ({
    order_id: order.id,
    product_id: productId,
    variant_id: variantId,
    inventory_id: null,
    product_name: productName,
    sku: variant.sku,
    size_label: variant.sizeLabel,
    material,
    color,
    quantity,
    unit_price: unitPrice,
    total_price: unitPrice === null ? null : unitPrice * quantity,
  }));

  const { error: itemError } = await admin.from("order_items").insert(items);
  if (itemError) {
    await admin.from("orders").delete().eq("id", order.id);
    return { ok: false, message: itemError.message };
  }

  await admin.from("order_events").insert({
    order_id: order.id,
    event_type: "order_received",
    customer_label_en: "Order received",
    customer_label_ka: "შეკვეთა მიღებულია",
    details: { test_mode: true },
    is_customer_visible: true,
  });

  revalidatePath("/admin/orders");
  revalidatePath("/account/orders");
  return { ok: true, message: `სატესტო შეკვეთა მიღებულია. ტრეკინგის კოდი: ${order.tracking_code}` };
}
