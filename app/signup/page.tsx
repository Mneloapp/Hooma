import Link from "next/link";
import { SignupForm } from "@/components/auth/SignupForm";
import { LocalizedText } from "@/components/LocalizedText";

export default function SignupPage() {
  return (
    <section className="mx-auto grid min-h-[70vh] max-w-5xl place-items-center px-4 py-16 sm:px-6 lg:px-8">
      <div className="w-full max-w-md">
        <p className="text-xs uppercase tracking-[0.28em] text-hooma-muted">Hooma account</p>
        <h1 className="mt-4 text-4xl font-medium"><LocalizedText ka="ანგარიშის შექმნა" en="Create an account" /></h1>
        <p className="mt-3 text-hooma-muted"><LocalizedText ka="შექმენი მომხმარებლის ანგარიში Google-ით ან ელფოსტით." en="Create your account with Google or email." /></p>
        <div className="mt-8"><SignupForm /></div>
        <p className="mt-6 text-sm text-hooma-muted"><LocalizedText ka="უკვე გაქვს ანგარიში? " en="Already have an account? " /><Link href="/login" className="text-hooma-text underline"><LocalizedText ka="შესვლა" en="Sign in" /></Link></p>
      </div>
    </section>
  );
}
