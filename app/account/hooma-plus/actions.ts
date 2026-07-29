"use server";

import { revalidatePath } from "next/cache";
import { processHoomaPlusCheckout } from "@/lib/commerce/hooma-plus-checkout-service";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type HoomaPlusCheckoutResult = {
  ok: boolean;
  message: string;
  redirectUrl?: string;
  resetCheckout?: boolean;
};

const field = (formData: FormData, key: string) =>
  String(formData.get(key) ?? "").trim();

export async function createHoomaPlusCheckoutAction(
  formData: FormData,
): Promise<HoomaPlusCheckoutResult> {
  const georgian = field(formData, "language") !== "en";
  const supabase = (await createClient()) as any;
  const admin = createAdminClient() as any;
  if (!supabase || !admin) {
    return {
      ok: false,
      message: georgian
        ? "გადახდის სერვერი ჯერ არ არის დაკავშირებული."
        : "The payment server is not connected yet.",
    };
  }

  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) {
    return {
      ok: false,
      message: georgian
        ? "Hooma+ წევრობისთვის ჯერ ანგარიშში შედი."
        : "Sign in before purchasing Hooma+.",
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
    const checkout = await processHoomaPlusCheckout({
      plan: field(formData, "plan"),
      checkoutKey: field(formData, "checkout_key"),
      language: georgian ? "ka" : "en",
    }, {
      admin,
      customerId: customer.id,
      channel: "web",
    });
    if (checkout.ok) revalidatePath("/account/hooma-plus");
    return {
      ok: checkout.ok,
      message: checkout.message,
      redirectUrl: checkout.redirectUrl,
      resetCheckout: checkout.resetCheckout,
    };
  } catch (error) {
    console.error("HOOMA_PLUS_CHECKOUT_FAILED", {
      customerId: customer.id,
      error: error instanceof Error ? error.message : "unknown",
    });
    return {
      ok: false,
      message: georgian
        ? "Hooma+ გადახდის უსაფრთხოდ მომზადება ვერ მოხერხდა. თანხა არ ჩამოგეჭრება."
        : "The Hooma+ payment could not be prepared safely. You will not be charged.",
    };
  }
}
