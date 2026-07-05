import Image from "next/image";
import { ArrowRight, Box, Check, PackageOpen, Ruler } from "lucide-react";
import { Button } from "@/components/Button";
import { BrandLogo } from "@/components/BrandLogo";
import { HowItWorksSteps } from "@/components/HowItWorksSteps";
import { SectionTitle } from "@/components/SectionTitle";

const details = [
  {
    title: "Compact by design",
    copy: "HOOMA products are selected around a simple promise: large, comfortable furniture that can arrive in a more manageable package.",
    icon: Box,
  },
  {
    title: "Easier through buildings",
    copy: "Compact packing helps with stairs, doors, elevators, and apartments where traditional furniture delivery is difficult.",
    icon: Ruler,
  },
  {
    title: "Unpack in the room",
    copy: "Open the package where the piece will live, let it expand, then adjust cushions and modules into place.",
    icon: PackageOpen,
  },
];

const checks = ["Fits through doors and elevators", "Reduces delivery friction", "Keeps full-size comfort", "Works for sofas, loungers, ottomans, and pet pieces"];

export default function HowItWorks() {
  return (
    <>
      <section className="relative overflow-hidden bg-hooma-panel">
        <div className="mx-auto grid min-h-[620px] max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
          <div className="relative z-10 flex flex-col justify-center">
            <BrandLogo markOnly className="mb-8 w-24 opacity-80" />
            <p className="text-sm font-medium uppercase tracking-[0.24em] text-hooma-accent">How it works</p>
            <h1 className="mt-5 text-5xl font-semibold leading-none md:text-7xl">From compact box to full-size comfort.</h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-hooma-muted">
              HOOMA makes premium compressed furniture easier to bring home, unpack, and live with.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Button href="/shop">Shop collection</Button>
              <Button href="/contact" variant="secondary">Request consultation</Button>
            </div>
          </div>
          <div className="relative min-h-[420px] overflow-hidden rounded-[2rem] bg-hooma-background">
            <Image src="/catalog-images/hooma-cloud.jpg" alt="Hooma compressed furniture in a living room" fill priority className="object-cover" sizes="(min-width: 1024px) 55vw, 100vw" />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <SectionTitle eyebrow="The process" title="Four simple steps, one calmer delivery." />
        <HowItWorksSteps detailed />
      </section>

      <section className="bg-hooma-text py-20 text-white">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.24em] text-white/55">Why compressed</p>
            <h2 className="mt-4 text-4xl font-semibold md:text-5xl">Made for real homes, not perfect delivery conditions.</h2>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {checks.map((item) => (
              <div key={item} className="flex gap-3 rounded-2xl bg-white/8 p-5 text-sm leading-6 text-white/72">
                <Check className="mt-0.5 shrink-0 text-hooma-secondary" size={18} />
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="grid gap-5 lg:grid-cols-3">
          {details.map((detail) => (
            <div key={detail.title} className="rounded-2xl bg-white p-7">
              <detail.icon className="text-hooma-accent" size={24} />
              <h2 className="mt-8 text-2xl font-semibold">{detail.title}</h2>
              <p className="mt-4 text-sm leading-6 text-hooma-muted">{detail.copy}</p>
            </div>
          ))}
        </div>
        <div className="mt-14 flex flex-col items-start justify-between gap-6 rounded-[2rem] bg-hooma-secondary/45 p-8 md:flex-row md:items-center">
          <div>
            <p className="text-sm font-medium uppercase tracking-[0.24em] text-hooma-accent">Ready</p>
            <h2 className="mt-3 text-3xl font-semibold">Choose a model that works for your room.</h2>
          </div>
          <Button href="/shop" className="shrink-0">
            Explore products <ArrowRight size={16} className="ml-2" />
          </Button>
        </div>
      </section>
    </>
  );
}
