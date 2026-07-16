import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/LoginForm";
import { defaultAdminPath, isStaffRole } from "@/lib/auth/permissions";
import { getProfile } from "@/lib/supabase/server";
import { LocalizedText } from "@/components/LocalizedText";

const errorMessages: Record<string, { ka: string; en: string }> = {
  google: { ka: "Google-ით შესვლა ვერ დაიწყო. სცადე ხელახლა.", en: "Google sign-in could not start. Please try again." },
  oauth: { ka: "Google ავტორიზაცია ვერ დასრულდა. სცადე ხელახლა.", en: "Google authorization could not be completed. Please try again." },
  disabled: { ka: "ეს ანგარიში გათიშულია. დაუკავშირდი Hooma-ს Owner-ს.", en: "This account is disabled. Contact the Hooma owner." },
  config: { ka: "ავტორიზაციის სერვისი ჯერ არ არის დაკავშირებული.", en: "The authentication service is not connected yet." },
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const params = await searchParams;
  const profile = await getProfile();
  if (profile) redirect(isStaffRole(profile.role) ? defaultAdminPath(profile.role) : "/account");
  return (
    <section className="mx-auto grid min-h-[70vh] max-w-5xl place-items-center px-4 py-16 sm:px-6 lg:px-8">
      <div className="w-full max-w-md">
        <p className="text-xs uppercase tracking-[0.28em] text-hooma-muted">Hooma account</p>
        <h1 className="mt-4 text-4xl font-medium"><LocalizedText ka="ანგარიშში შესვლა" en="Sign in to your account" /></h1>
        <p className="mt-3 text-hooma-muted"><LocalizedText ka="შეკვეთების, ტრეკინგისა და ინდივიდუალური მოთხოვნების სანახავად გაიარე ავტორიზაცია." en="Sign in to view orders, tracking, and custom requests." /></p>
        {params.error && errorMessages[params.error] ? <p className="mt-4 rounded-2xl bg-red-50 p-4 text-sm text-red-800"><LocalizedText ka={errorMessages[params.error].ka} en={errorMessages[params.error].en} /></p> : null}
        <div className="mt-8"><LoginForm next={params.next ?? "/account"} /></div>
        <p className="mt-6 text-sm text-hooma-muted"><LocalizedText ka="ჯერ არ გაქვს ანგარიში? " en="Don’t have an account yet? " /><Link href="/signup" className="text-hooma-text underline"><LocalizedText ka="ანგარიშის შექმნა" en="Create account" /></Link></p>
      </div>
    </section>
  );
}
