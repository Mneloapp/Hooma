import Link from "next/link";
import { SignupForm } from "@/components/auth/SignupForm";

export default function SignupPage() {
  return (
    <section className="mx-auto grid min-h-[70vh] max-w-5xl place-items-center px-4 py-16 sm:px-6 lg:px-8">
      <div className="w-full max-w-md">
        <p className="text-xs uppercase tracking-[0.28em] text-hooma-muted">Hooma account</p>
        <h1 className="mt-4 text-4xl font-medium">ანგარიშის შექმნა</h1>
        <p className="mt-3 text-hooma-muted">შექმენი მომხმარებლის ანგარიში Google-ით ან ელფოსტით.</p>
        <div className="mt-8"><SignupForm /></div>
        <p className="mt-6 text-sm text-hooma-muted">უკვე გაქვს ანგარიში? <Link href="/login" className="text-hooma-text underline">შესვლა</Link></p>
      </div>
    </section>
  );
}
