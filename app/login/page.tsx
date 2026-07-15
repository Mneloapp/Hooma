import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/LoginForm";
import { defaultAdminPath, isStaffRole } from "@/lib/auth/permissions";
import { getProfile } from "@/lib/supabase/server";

const errorMessages: Record<string, string> = {
  google: "Google-ით შესვლა ვერ დაიწყო. სცადე ხელახლა.",
  oauth: "Google ავტორიზაცია ვერ დასრულდა. სცადე ხელახლა.",
  disabled: "ეს ანგარიში გათიშულია. დაუკავშირდი Hooma-ს Owner-ს.",
  config: "ავტორიზაციის სერვისი ჯერ არ არის დაკავშირებული.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const params = await searchParams;
  const profile = await getProfile();
  if (profile) redirect(isStaffRole(profile.role) ? defaultAdminPath(profile.role) : "/account");
  return (
    <section className="mx-auto grid min-h-[70vh] max-w-5xl place-items-center px-4 py-16 sm:px-6 lg:px-8">
      <div className="w-full max-w-md">
        <p className="text-xs uppercase tracking-[0.28em] text-hooma-muted">Hooma account</p>
        <h1 className="mt-4 text-4xl font-medium">ანგარიშში შესვლა</h1>
        <p className="mt-3 text-hooma-muted">შეკვეთების, ტრეკინგისა და ინდივიდუალური მოთხოვნების სანახავად გაიარე ავტორიზაცია.</p>
        {params.error && errorMessages[params.error] ? <p className="mt-4 rounded-2xl bg-red-50 p-4 text-sm text-red-800">{errorMessages[params.error]}</p> : null}
        <div className="mt-8"><LoginForm next={params.next ?? "/account"} /></div>
        <p className="mt-6 text-sm text-hooma-muted">ჯერ არ გაქვს ანგარიში? <Link href="/signup" className="text-hooma-text underline">ანგარიშის შექმნა</Link></p>
      </div>
    </section>
  );
}
