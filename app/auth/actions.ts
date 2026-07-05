"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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
  const payload = JSON.parse(getString(formData, "payload") || "{}") as {
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
      product_name: string;
      sku: string;
      size_label: string;
      fabric: string;
      color: string;
      orientation: string;
      quantity: number;
      price?: number | null;
    }>;
  };

  if (!payload.items?.length) return { ok: false, message: "Your cart is empty." };

  if (!supabase) {
    return { ok: true, message: "Your order request has been received. Our team will contact you shortly." };
  }

  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  let customerId: string | null = null;

  if (user) {
    const { data: customer } = await supabase.from("customers").select("id").eq("profile_id", user.id).maybeSingle();
    customerId = customer?.id ?? null;
  }

  const orderInsert = {
    customer_id: customerId,
    guest_email: payload.guest_email ?? null,
    guest_phone: payload.guest_phone ?? null,
    status: "pending",
    payment_status: "unpaid",
    subtotal: 0,
    delivery_fee: 0,
    total: 0,
    delivery_address: {
      full_name: payload.full_name,
      city: payload.city,
      address_line_1: payload.address_line_1,
    },
    notes: payload.notes ?? null,
  };

  const { data: order, error } = await supabase.from("orders").insert(orderInsert).select("id").single();
  if (error || !order) return { ok: false, message: error?.message ?? "Could not create order." };

  const items = payload.items.map((item) => ({
    order_id: order.id,
    product_id: item.product_id,
    variant_id: item.variant_id,
    inventory_id: item.inventory_id ?? null,
    product_name: item.product_name,
    sku: item.sku,
    size_label: item.size_label,
    fabric: item.fabric,
    color: item.color,
    orientation: item.orientation,
    quantity: item.quantity,
    unit_price: item.price ?? null,
    total_price: item.price ? item.price * item.quantity : null,
  }));

  const { error: itemError } = await supabase.from("order_items").insert(items);
  if (itemError) return { ok: false, message: itemError.message };

  for (const item of payload.items) {
    if (item.inventory_id) {
      await supabase.rpc("reserve_inventory", { inventory_row_id: item.inventory_id, reserve_qty: item.quantity });
    }
  }

  revalidatePath("/admin/orders");
  return { ok: true, message: "Your order request has been received. Our team will contact you shortly." };
}
