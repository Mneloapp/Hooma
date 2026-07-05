import Image from "next/image";
import { ArrowRight, Check } from "lucide-react";
import { featuredProducts, products } from "@/data/products";
import { Button } from "@/components/Button";
import { FAQAccordion } from "@/components/FAQAccordion";
import { Hero } from "@/components/Hero";
import { HowItWorksSteps } from "@/components/HowItWorksSteps";
import { ProductConfigurator } from "@/components/ProductConfigurator";
import { ProductGrid } from "@/components/ProductGrid";
import { SectionTitle } from "@/components/SectionTitle";

const reasons = ["Fits through doors and elevators", "Easier delivery", "Smart packaging", "Premium comfort", "Modern design"];

export default function Home() {
  const previewProduct = products.find((product) => product.slug === "hooma-cotton") ?? products[0];

  return (
    <>
      <Hero />
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <SectionTitle eyebrow="How it works" title="Full-size comfort starts compact." />
        <HowItWorksSteps />
      </section>
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <SectionTitle eyebrow="Featured" title="Designed for modern rooms, delivered for real buildings." />
        <ProductGrid products={featuredProducts.slice(0, 6)} />
      </section>
      <section className="bg-hooma-panel py-20">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:px-8">
          <div className="relative min-h-[420px] overflow-hidden rounded-2xl">
            <Image src="/catalog-images/hooma-flow.jpg" alt="Hooma sofa in a living room" fill className="object-cover" sizes="(min-width: 1024px) 50vw, 100vw" />
          </div>
          <div className="flex flex-col justify-center">
            <p className="text-sm font-medium uppercase tracking-[0.24em] text-hooma-accent">Why HOOMA</p>
            <h2 className="mt-4 text-4xl font-semibold md:text-5xl">Large furniture, less friction.</h2>
            <div className="mt-8 grid gap-4">
              {reasons.map((reason) => (
                <div key={reason} className="flex items-center gap-3 text-hooma-muted">
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-hooma-accent text-white"><Check size={15} /></span>
                  {reason}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <SectionTitle eyebrow="Configurator" title="Preview your model before you order." copy="Choose size, fabric, color, orientation, and quantity. Prices remain request-only until launch." />
        <div className="grid gap-8 lg:grid-cols-[1fr_0.9fr]">
          <div className="relative min-h-[520px] overflow-hidden rounded-2xl bg-hooma-panel">
            <Image src={previewProduct.heroImage} alt={previewProduct.hoomaName} fill className="object-cover" sizes="(min-width: 1024px) 55vw, 100vw" />
          </div>
          <ProductConfigurator product={previewProduct} compact />
        </div>
      </section>
      <section className="mx-auto max-w-4xl px-4 py-20 sm:px-6 lg:px-8">
        <SectionTitle eyebrow="FAQ" title="Questions before the first sit?" />
        <FAQAccordion />
        <div className="mt-8 text-center">
          <Button href="/faq" variant="secondary">View all FAQ <ArrowRight size={16} className="ml-2" /></Button>
        </div>
      </section>
    </>
  );
}
