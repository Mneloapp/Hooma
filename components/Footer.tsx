import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-hooma-text/10 bg-hooma-text text-white">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr] lg:px-8">
        <div>
          <p className="text-lg font-semibold tracking-[0.18em]">HOOMA</p>
          <p className="mt-4 max-w-sm text-sm leading-6 text-white/65">Furniture, Reimagined. Premium compressed furniture for modern living in Georgia and beyond.</p>
        </div>
        <div className="grid gap-3 text-sm text-white/65">
          <Link href="/shop">Shop</Link>
          <Link href="/how-it-works">How it works</Link>
          <Link href="/faq">FAQ</Link>
        </div>
        <div className="text-sm text-white/65">
          <p>hooma.ge</p>
          <p>hoomalive.com</p>
          <p className="mt-4">Tbilisi, Georgia</p>
        </div>
      </div>
    </footer>
  );
}
