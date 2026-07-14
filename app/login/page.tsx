import Link from "next/link";
import { LoginForm } from "@/components/auth/LoginForm";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const params = await searchParams;
  return (
    <section className="mx-auto grid min-h-[70vh] max-w-5xl place-items-center px-4 py-16 sm:px-6 lg:px-8">
      <div className="w-full max-w-md">
        <p className="text-xs uppercase tracking-[0.28em] text-hooma-muted">Hooma account</p>
        <h1 className="mt-4 text-4xl font-medium">ანგარიშში შესვლა</h1>
        <p className="mt-3 text-hooma-muted">შეკვეთების, ტრეკინგისა და ინდივიდუალური მოთხოვნების სანახავად გაიარე ავტორიზაცია.</p>
        <div className="mt-8"><LoginForm next={params.next ?? "/account"} /></div>
        <p className="mt-6 text-sm text-hooma-muted">ჯერ არ გაქვს ანგარიში? <Link href="/signup" className="text-hooma-text underline">ანგარიშის შექმნა</Link></p>
      </div>
    </section>
  );
}
