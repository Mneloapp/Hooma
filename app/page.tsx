import Image from "next/image";
import { ArrowRight, Check } from "lucide-react";
import { featuredProducts } from "@/data/products";
import { Button } from "@/components/Button";
import { FAQAccordion } from "@/components/FAQAccordion";
import { Hero } from "@/components/Hero";
import { ProductGrid } from "@/components/ProductGrid";
import { Reveal } from "@/components/Reveal";
import { SectionTitle } from "@/components/SectionTitle";

const reasons = ["Fits through doors and elevators", "Easier delivery", "Smart packaging", "Premium comfort", "Modern design"];

export default function Home() {
  return (
    <>
      <Hero />
      <section id="featured" className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <Reveal>
          <SectionTitle eyebrow="Featured" title="Designed for modern rooms, delivered for real buildings." />
        </Reveal>
        <ProductGrid products={featuredProducts.slice(0, 6)} />
      </section>
      <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        <Reveal>
        <div className="relative grid gap-8 overflow-hidden rounded-[2rem] bg-hooma-text p-6 text-white md:grid-cols-[1.2fr_0.8fr] md:p-10">
          <div className="absolute -right-10 -top-10 hidden h-44 w-44 rounded-full border border-white/10 md:block" />
          <div className="relative">
            <p className="text-sm font-medium uppercase tracking-[0.24em] text-white/55">How it works</p>
            <h2 className="mt-4 max-w-2xl text-3xl font-semibold md:text-5xl">Big comfort arrives in a compact box.</h2>
          </div>
          <div className="relative flex flex-col justify-end gap-5">
            <p className="text-sm leading-6 text-white/68">Choose your model, receive it compactly packed, open it, and let it expand into full-size comfort.</p>
            <Button href="/how-it-works" variant="secondary" className="w-fit border-white/20 bg-white/10 text-white hover:border-white/50 hover:text-white">
              See how it works
            </Button>
          </div>
        </div>
        </Reveal>
      </section>
      <section className="bg-hooma-panel py-20">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:px-8">
          <Reveal className="relative min-h-[420px] overflow-hidden rounded-2xl">
            <Image src="/catalog-images/hooma-flow.jpg" alt="Hooma sofa in a living room" fill className="object-cover transition duration-700 hover:scale-[1.03]" sizes="(min-width: 1024px) 50vw, 100vw" />
          </Reveal>
          <Reveal delay={120} className="flex flex-col justify-center">
            <p className="text-sm font-medium uppercase tracking-[0.24em] text-hooma-accent">Why HOOMA</p>
            <h2 className="mt-4 text-4xl font-semibold md:text-5xl">Large furniture, less friction.</h2>
            <div className="mt-8 grid gap-4">
              {reasons.map((reason, index) => (
                <div key={reason} className="flex items-center gap-3 text-hooma-muted" style={{ transitionDelay: `${index * 70}ms` }}>
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-hooma-accent text-white"><Check size={15} /></span>
                  {reason}
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>
      <section className="mx-auto max-w-4xl px-4 py-20 sm:px-6 lg:px-8">
        <Reveal>
          <SectionTitle eyebrow="FAQ" title="Questions before the first sit?" />
          <FAQAccordion />
          <div className="mt-8 text-center">
            <Button href="/faq" variant="secondary">View all FAQ <ArrowRight size={16} className="ml-2" /></Button>
          </div>
        </Reveal>
      </section>
    </>
  );
}
