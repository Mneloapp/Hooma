"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type AccountSettingsActionState = {
  ok?: boolean;
  message?: string;
  completedAt?: string;
};

const getString = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();
const getRawString = (formData: FormData, key: string) => {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
};
const isGeorgian = (formData: FormData) => getString(formData, "language") === "ka";
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function hasPasswordIdentity(user: {
  app_metadata?: Record<string, unknown>;
  identities?: Array<{ provider?: string }> | null;
}) {
  const providers = Array.isArray(user.app_metadata?.providers)
    ? user.app_metadata.providers.filter((provider): provider is string => typeof provider === "string")
    : [];

  return user.app_metadata?.provider === "email"
    || providers.includes("email")
    || Boolean(user.identities?.some((identity) => identity.provider === "email"));
}

async function siteOrigin() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${protocol}://${host}`;
}

async function authenticatedPasswordUser(formData: FormData) {
  const supabase = await createClient();
  if (!supabase) return { supabase: null, user: null, error: "config" as const };

  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) redirect("/login?next=/account/settings");
  if (!user.email || !hasPasswordIdentity(user)) {
    return { supabase, user, error: "provider" as const };
  }

  const currentPassword = getRawString(formData, "current_password");
  if (!currentPassword) return { supabase, user, error: "password" as const };

  const { error } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });
  if (error) return { supabase, user, error: "password" as const };

  return { supabase, user, error: null };
}

export async function updateAccountEmailAction(
  _state: AccountSettingsActionState,
  formData: FormData,
): Promise<AccountSettingsActionState> {
  const georgian = isGeorgian(formData);
  const nextEmail = getString(formData, "email").toLowerCase();
  if (!emailPattern.test(nextEmail) || nextEmail.length > 254) {
    return {
      ok: false,
      message: georgian ? "შეიყვანე მოქმედი ელფოსტის მისამართი." : "Enter a valid email address.",
    };
  }

  const authentication = await authenticatedPasswordUser(formData);
  if (authentication.error === "config" || !authentication.supabase) {
    return {
      ok: false,
      message: georgian ? "Supabase ჯერ არ არის დაკავშირებული." : "Supabase is not configured yet.",
    };
  }
  if (authentication.error === "provider") {
    return {
      ok: false,
      message: georgian
        ? "ეს ანგარიში გარე ავტორიზაციას იყენებს. ელფოსტა შესაბამის პროვაიდერთან იმართება."
        : "This account uses an external sign-in provider. Manage its email with that provider.",
    };
  }
  if (authentication.error === "password" || !authentication.user) {
    return {
      ok: false,
      message: georgian ? "მიმდინარე პაროლი არასწორია." : "The current password is incorrect.",
    };
  }
  if (authentication.user.email?.toLowerCase() === nextEmail) {
    return {
      ok: false,
      message: georgian ? "ეს უკვე შენი მიმდინარე ელფოსტაა." : "This is already your current email address.",
    };
  }

  const callback = new URL("/auth/email-change/confirm", await siteOrigin());
  const { error } = await authentication.supabase.auth.updateUser(
    { email: nextEmail },
    { emailRedirectTo: callback.toString() },
  );
  if (error) {
    return {
      ok: false,
      message: georgian
        ? "ელფოსტის შეცვლის მოთხოვნა ვერ გაიგზავნა. ცოტა ხანში სცადე თავიდან."
        : "The email change request could not be sent. Try again shortly.",
    };
  }

  return {
    ok: true,
    completedAt: new Date().toISOString(),
    message: georgian
      ? `ელფოსტის შეცვლის დადასტურება გაიგზავნა. უსაფრთხოების პარამეტრების მიხედვით წერილის დადასტურება შეიძლება მიმდინარე და ახალ მისამართზეც დაგჭირდეს. ცვლილებამდე მიმდინარე ელფოსტა ძალაში დარჩება.`
      : "Email-change confirmation was sent. Depending on the security policy, you may need to confirm messages at both your current and new addresses. Your current email remains active until the change is confirmed.",
  };
}

export async function updateAccountPasswordAction(
  _state: AccountSettingsActionState,
  formData: FormData,
): Promise<AccountSettingsActionState> {
  const georgian = isGeorgian(formData);
  const nextPassword = getRawString(formData, "new_password");
  const confirmation = getRawString(formData, "confirm_password");

  if (nextPassword.length < 8 || nextPassword.length > 128) {
    return {
      ok: false,
      message: georgian
        ? "ახალი პაროლი უნდა შეიცავდეს 8-დან 128 სიმბოლომდე."
        : "The new password must contain between 8 and 128 characters.",
    };
  }
  if (nextPassword !== confirmation) {
    return {
      ok: false,
      message: georgian ? "ახალი პაროლები ერთმანეთს არ ემთხვევა." : "The new passwords do not match.",
    };
  }

  const authentication = await authenticatedPasswordUser(formData);
  if (authentication.error === "config" || !authentication.supabase) {
    return {
      ok: false,
      message: georgian ? "Supabase ჯერ არ არის დაკავშირებული." : "Supabase is not configured yet.",
    };
  }
  if (authentication.error === "provider") {
    return {
      ok: false,
      message: georgian
        ? "ამ ანგარიშს Hooma-ს ცალკე პაროლი არ აქვს. შესასვლელად გამოიყენე დაკავშირებული პროვაიდერი."
        : "This account does not have a separate Hooma password. Use its connected sign-in provider.",
    };
  }
  if (authentication.error === "password") {
    return {
      ok: false,
      message: georgian ? "მიმდინარე პაროლი არასწორია." : "The current password is incorrect.",
    };
  }
  if (getRawString(formData, "current_password") === nextPassword) {
    return {
      ok: false,
      message: georgian ? "ახალი პაროლი მიმდინარე პაროლისგან განსხვავებული უნდა იყოს." : "Choose a password different from your current password.",
    };
  }

  const { error } = await authentication.supabase.auth.updateUser({ password: nextPassword });
  if (error) {
    return {
      ok: false,
      message: georgian
        ? "პაროლის შეცვლა ვერ მოხერხდა. სცადე სხვა პაროლი ან გაიმეორე მოგვიანებით."
        : "The password could not be changed. Try another password or try again later.",
    };
  }

  // The current browser remains signed in; any other active sessions are revoked.
  const { error: sessionRevocationError } = await authentication.supabase.auth.signOut({ scope: "others" });
  revalidatePath("/", "layout");
  return {
    ok: true,
    completedAt: new Date().toISOString(),
    message: sessionRevocationError
      ? (georgian
          ? "პაროლი შეიცვალა, მაგრამ სხვა მოწყობილობებზე სესიების დასრულება ვერ დადასტურდა. გამოიყენე ქვემოთ მოცემული სესიების ღილაკი."
          : "Your password was changed, but other-session revocation could not be confirmed. Use the session control below.")
      : (georgian
          ? "პაროლი შეიცვალა და სხვა მოწყობილობებზე აქტიური სესიები დასრულდა."
          : "Your password was changed and active sessions on other devices were signed out."),
  };
}

export async function signOutOtherSessionsAction(
  _state: AccountSettingsActionState,
  formData: FormData,
): Promise<AccountSettingsActionState> {
  const georgian = isGeorgian(formData);
  const supabase = await createClient();
  if (!supabase) {
    return {
      ok: false,
      message: georgian ? "Supabase ჯერ არ არის დაკავშირებული." : "Supabase is not configured yet.",
    };
  }

  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login?next=/account/settings");

  const { error } = await supabase.auth.signOut({ scope: "others" });
  if (error) {
    return {
      ok: false,
      message: georgian
        ? "სხვა სესიების დასრულება ვერ მოხერხდა. სცადე თავიდან."
        : "Other sessions could not be signed out. Try again.",
    };
  }

  return {
    ok: true,
    completedAt: new Date().toISOString(),
    message: georgian
      ? "სხვა მოწყობილობებზე ყველა აქტიური სესია დასრულდა. ეს მოწყობილობა დარჩა ავტორიზებული."
      : "All active sessions on other devices were signed out. This device remains signed in.",
  };
}
