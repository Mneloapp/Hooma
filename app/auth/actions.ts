"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { products } from "@/data/products";

type AuthState = {
  ok?: boolean;
  message?: string;
};

const getString = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();

export async function loginAction(_state: AuthState, formData: FormData): Promise<AuthState> {
  const supabase = await createClient();
  if (!supabase) return { message: "Supabase is not configured yet." };

  const email = getString(formData, "email");
  const password = getString(formData, "password");
  const next = getString(formData, "next") || "/";
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) return { message: error.message };
  revalidatePath("/", "layout");
  redirect(next);
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
  return { ok: true, message: "Account created. Please check your email if confirmation is enabled." };
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

  const authoritativeItems = payload.items.map((item) => {
    const catalogProduct = products.find((product) => product.id === item.product_id);
    const variant = catalogProduct?.variants.find((candidate) => candidate.id === item.variant_id);
    const quantity = Number(item.quantity);
    if (!catalogProduct || !variant || !Number.isInteger(quantity) || quantity < 1 || quantity > 20) return null;
    const material = variant.availableMaterials.includes(item.material ?? "") ? item.material! : variant.availableMaterials[0];
    const color = variant.availableColors.includes(item.color ?? "") ? item.color! : variant.availableColors[0];
    return { catalogProduct, variant, quantity, material, color };
  });
  if (authoritativeItems.some((item) => item === null)) return { ok: false, message: "One or more cart items are invalid." };

  const safeItems = authoritativeItems.filter((item): item is NonNullable<typeof item> => item !== null);
  const subtotal = safeItems.reduce((sum, item) => sum + (item.variant.price ?? 0) * item.quantity, 0);

  const { data: userData } = supabase ? await supabase.auth.getUser() : { data: { user: null } };
  const user = userData.user;
  let customerId: string | null = null;

  if (user) {
    const { data: customer } = await supabase.from("customers").select("id").eq("profile_id", user.id).maybeSingle();
    customerId = customer?.id ?? null;
  }

  const promisedAt = new Date();
  let businessDays = 0;
  while (businessDays < 3) {
    promisedAt.setDate(promisedAt.getDate() + 1);
    const weekday = promisedAt.getDay();
    if (weekday !== 0 && weekday !== 6) businessDays += 1;
  }

  const orderInsert = {
    customer_id: customerId,
    guest_email: payload.guest_email ?? null,
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

  const items = safeItems.map(({ catalogProduct, variant, quantity, material, color }) => ({
    order_id: order.id,
    product_id: null,
    variant_id: null,
    inventory_id: null,
    product_name: catalogProduct.hoomaName,
    sku: variant.sku,
    size_label: variant.sizeLabel,
    material,
    color,
    quantity,
    unit_price: variant.price,
    total_price: variant.price === null ? null : variant.price * quantity,
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
  return { ok: true, message: `სატესტო შეკვეთა მიღებულია. ტრეკინგის კოდი: ${order.tracking_code}` };
}
