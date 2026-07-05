import Image from "next/image";
import { Button } from "./Button";

export function Hero() {
  return (
    <section className="relative min-h-[calc(100svh-4rem)] overflow-hidden bg-hooma-text text-white">
      <Image src="/catalog-images/hooma-cotton.jpg" alt="HOOMA compressed sofa in a warm living room" fill priority className="object-cover opacity-75" sizes="100vw" />
      <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-black/20 to-transparent" />
      <div className="relative mx-auto flex min-h-[calc(100svh-4rem)] max-w-7xl items-center px-4 pb-20 pt-16 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <p className="mb-5 text-sm font-medium uppercase tracking-[0.28em] text-white/75">HOOMA</p>
          <h1 className="text-5xl font-semibold leading-none md:text-7xl">Furniture, Reimagined.</h1>
          <p className="mt-6 max-w-lg text-lg leading-8 text-white/78">Premium compressed furniture for modern living.</p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Button href="/shop">Shop Collection</Button>
            <Button href="/how-it-works" variant="secondary" className="border-white/30 bg-white/10 text-white hover:text-white">How It Works</Button>
          </div>
        </div>
      </div>
    </section>
  );
}
