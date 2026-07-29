"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  processCatalogCheckout,
  type CatalogCheckoutInput,
} from "@/lib/commerce/catalog-checkout-service";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

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

const getString = (formData: FormData, key: string) =>
  String(formData.get(key) ?? "").trim();
const isGeorgian = (value: unknown) => value === "ka";

const safeNextPath = (value: string, fallback = "/account") => {
  const safePath =
    value.startsWith("/")
    && !value.startsWith("//")
    && !value.includes("\\")
      ? value
      : fallback;
  return safePath === "/" ? fallback : safePath;
};

async function siteOrigin() {
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  }
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host")
    ?? requestHeaders.get("host")
    ?? "localhost:3000";
  const protocol =
    requestHeaders.get("x-forwarded-proto")
    ?? (host.startsWith("localhost") ? "http" : "https");
  return `${protocol}://${host}`;
}

export async function loginAction(
  _state: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const georgian = isGeorgian(getString(formData, "language"));
  const supabase = await createClient();
  if (!supabase) {
    return {
      message: georgian
        ? "Supabase ჯერ არ არის დაკავშირებული."
        : "Supabase is not configured yet.",
    };
  }

  const requestedNext = getString(formData, "next");
  const next = safeNextPath(requestedNext);
  const { error } = await supabase.auth.signInWithPassword({
    email: getString(formData, "email"),
    password: getString(formData, "password"),
  });

  if (error) {
    return {
      message: georgian
        ? "ელფოსტა ან პაროლი არასწორია."
        : "The email or password is incorrect.",
    };
  }
  const { data } = await supabase.auth.getUser();
  if (data.user) {
    await (supabase as any)
      .from("profiles")
      .update({ last_login_at: new Date().toISOString() })
      .eq("id", data.user.id);
  }
  revalidatePath("/", "layout");
  redirect(next);
}

export async function googleLoginAction(formData: FormData) {
  const supabase = await createClient();
  const next = safeNextPath(getString(formData, "next"));
  if (!supabase) {
    redirect(`/login?error=config&next=${encodeURIComponent(next)}`);
  }

  const callback = new URL("/auth/callback", await siteOrigin());
  callback.searchParams.set("next", next);
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: callback.toString() },
  });

  if (error || !data.url) {
    redirect(`/login?error=google&next=${encodeURIComponent(next)}`);
  }
  redirect(data.url);
}

export async function signupAction(
  _state: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const georgian = isGeorgian(getString(formData, "language"));
  const supabase = await createClient();
  if (!supabase) {
    return {
      message: georgian
        ? "Supabase ჯერ არ არის დაკავშირებული."
        : "Supabase is not configured yet.",
    };
  }

  const fullName = getString(formData, "full_name");
  const phone = getString(formData, "phone");
  const callback = new URL("/auth/callback", await siteOrigin());
  callback.searchParams.set("next", "/account");
  const { error } = await supabase.auth.signUp({
    email: getString(formData, "email"),
    password: getString(formData, "password"),
    options: {
      data: { full_name: fullName, phone },
      emailRedirectTo: callback.toString(),
    },
  });

  if (error) {
    return {
      message: georgian
        ? "ანგარიშის შექმნა ვერ მოხერხდა. გადაამოწმე მონაცემები და სცადე ხელახლა."
        : "The account could not be created. Check your details and try again.",
    };
  }
  return {
    ok: true,
    message: georgian
      ? "ანგარიში შეიქმნა. თუ ელფოსტის დადასტურება ჩართულია, შეამოწმე შემოსული წერილები."
      : "Your account was created. If email confirmation is enabled, check your inbox.",
  };
}

export async function logoutAction() {
  const supabase = await createClient();
  if (supabase) await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/");
}

export async function updateProfileAction(
  _state: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const supabase = (await createClient()) as any;
  const georgian = isGeorgian(getString(formData, "language"));
  if (!supabase) {
    return {
      ok: false,
      message: georgian
        ? "Supabase ჯერ არ არის დაკავშირებული."
        : "Supabase is not configured yet.",
    };
  }

  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login?next=/account");

  const fullName = getString(formData, "full_name");
  const phone = getString(formData, "phone");
  const updatedAt = new Date().toISOString();
  const { error: profileError } = await supabase
    .from("profiles")
    .update({ full_name: fullName, phone, updated_at: updatedAt })
    .eq("id", data.user.id);

  if (profileError) {
    return {
      ok: false,
      message: georgian
        ? "პროფილის შენახვა ვერ მოხერხდა. სცადე თავიდან."
        : "The profile could not be saved. Try again.",
    };
  }

  const admin = createAdminClient() as any;
  if (admin) {
    const { data: customer } = await admin
      .from("customers")
      .select("id")
      .eq("profile_id", data.user.id)
      .limit(1)
      .maybeSingle();
    const customerPayload = {
      email: data.user.email ?? null,
      full_name: fullName,
      phone,
    };
    const { error: customerError } = customer?.id
      ? await admin.from("customers").update(customerPayload).eq("id", customer.id)
      : await admin.from("customers").insert({
        profile_id: data.user.id,
        ...customerPayload,
      });
    if (customerError) {
      return {
        ok: false,
        message: georgian
          ? "პროფილი შეინახა, მაგრამ შეკვეთების პროფილის სინქრონიზაცია ვერ დასრულდა."
          : "The profile was saved, but its order profile could not be synchronized.",
      };
    }
  } else {
    await supabase
      .from("customers")
      .update({ full_name: fullName, phone })
      .eq("profile_id", data.user.id);
  }

  await supabase.auth.updateUser({ data: { full_name: fullName, phone } });
  revalidatePath("/account");
  revalidatePath("/admin/customers");
  return {
    ok: true,
    message: georgian
      ? "მონაცემები წარმატებით შეინახა."
      : "Your profile was saved successfully.",
    savedAt: updatedAt,
  };
}

export async function createOrderAction(
  formData: FormData,
): Promise<CreateOrderResult> {
  let payload: CatalogCheckoutInput;
  try {
    payload = JSON.parse(getString(formData, "payload") || "{}");
  } catch {
    return { ok: false, message: "Invalid order payload." };
  }

  const georgian = isGeorgian(payload.language);
  const supabase = (await createClient()) as any;
  const admin = createAdminClient() as any;
  if (!admin) {
    return {
      ok: false,
      message: georgian
        ? "შეკვეთების საცავი ჯერ არ არის დაკავშირებული."
        : "Order storage is not connected yet.",
    };
  }
  if (!supabase) {
    return {
      ok: false,
      message: georgian
        ? "შეკვეთის გასაფორმებლად ანგარიშში შესვლაა საჭირო."
        : "Sign in to place an order.",
    };
  }

  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) {
    return {
      ok: false,
      message: georgian
        ? "შეკვეთის გასაფორმებლად ჯერ ანგარიშში შედი."
        : "Sign in before placing an order.",
    };
  }
  const { data: customer } = await supabase
    .from("customers")
    .select("id")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!customer?.id) {
    return {
      ok: false,
      message: georgian
        ? "მომხმარებლის პროფილი ვერ მოიძებნა. გამოდი ანგარიშიდან და ხელახლა შედი."
        : "Your customer profile could not be found. Sign out and sign in again.",
    };
  }

  try {
    const checkout = await processCatalogCheckout(payload, {
      admin,
      customerId: customer.id,
      user,
      channel: "web",
    });
    if (checkout.ok) {
      revalidatePath("/admin/orders");
      revalidatePath("/account/orders");
    }
    return {
      ok: checkout.ok,
      message: checkout.message,
      redirectUrl: checkout.redirectUrl,
      resetCheckout: checkout.resetCheckout,
    };
  } catch (error) {
    console.error("CATALOG_CHECKOUT_FAILED", {
      customerId: customer.id,
      error: error instanceof Error ? error.message : "unknown",
    });
    return {
      ok: false,
      message: georgian
        ? "გადახდის უსაფრთხოდ მომზადება ვერ მოხერხდა. თანხა არ ჩამოგეჭრება."
        : "The payment could not be prepared safely. You will not be charged.",
    };
  }
}
