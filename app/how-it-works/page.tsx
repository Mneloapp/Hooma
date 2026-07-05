import Image from "next/image";
import { ArrowRight, Box, Check, PackageOpen, Ruler } from "lucide-react";
import { Button } from "@/components/Button";
import { BrandLogo } from "@/components/BrandLogo";
import { HowItWorksSteps } from "@/components/HowItWorksSteps";
import { Reveal } from "@/components/Reveal";
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

const storySteps = [
  ["01", "The room", "Measure the room, elevator, and doorway like you normally would."],
  ["02", "The box", "The piece arrives compact, easier to move before it becomes furniture."],
  ["03", "The reveal", "Open it where it will live and let the form recover into comfort."],
  ["04", "The living", "Style it, configure it, and use it like a full-size premium piece."],
];

export default function HowItWorks() {
  return (
    <>
      <section className="relative overflow-hidden bg-hooma-panel">
        <div className="mx-auto grid min-h-[620px] max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
          <Reveal className="relative z-10 flex flex-col justify-center">
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
          </Reveal>
          <Reveal delay={120} className="relative min-h-[420px] overflow-hidden rounded-[2rem] bg-hooma-background">
            <Image src="/catalog-images/hooma-cloud.jpg" alt="Hooma compressed furniture in a living room" fill priority className="object-cover" sizes="(min-width: 1024px) 55vw, 100vw" />
          </Reveal>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <Reveal>
          <SectionTitle eyebrow="The process" title="Four simple steps, one calmer delivery." />
        </Reveal>
        <HowItWorksSteps detailed />
      </section>

      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[0.85fr_1.15fr]">
          <div className="lg:sticky lg:top-24 lg:h-fit">
            <Reveal>
              <p className="text-sm font-medium uppercase tracking-[0.24em] text-hooma-accent">Delivery story</p>
              <h2 className="mt-4 text-4xl font-semibold md:text-5xl">A calmer path from checkout to living room.</h2>
              <p className="mt-5 text-sm leading-6 text-hooma-muted">The experience is designed around the hardest part of furniture: getting the piece inside beautifully.</p>
            </Reveal>
          </div>
          <div className="grid gap-4">
            {storySteps.map(([number, title, copy], index) => (
              <Reveal key={number} delay={index * 70}>
                <div className="group grid gap-5 rounded-2xl bg-white p-6 transition duration-300 hover:-translate-y-1 hover:shadow-soft md:grid-cols-[90px_1fr]">
                  <div className="text-4xl font-semibold text-hooma-secondary transition group-hover:text-hooma-accent">{number}</div>
                  <div>
                    <h3 className="text-2xl font-semibold">{title}</h3>
                    <p className="mt-3 text-sm leading-6 text-hooma-muted">{copy}</p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-hooma-text py-20 text-white">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
          <Reveal>
            <p className="text-sm font-medium uppercase tracking-[0.24em] text-white/55">Why compressed</p>
            <h2 className="mt-4 text-4xl font-semibold md:text-5xl">Made for real homes, not perfect delivery conditions.</h2>
          </Reveal>
          <div className="grid gap-4 md:grid-cols-2">
            {checks.map((item, index) => (
              <Reveal key={item} delay={index * 70}>
              <div className="flex gap-3 rounded-2xl bg-white/8 p-5 text-sm leading-6 text-white/72 transition hover:bg-white/12">
                <Check className="mt-0.5 shrink-0 text-hooma-secondary" size={18} />
                {item}
              </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <Reveal>
          <div className="mb-14 grid gap-4 md:grid-cols-2">
            <div className="rounded-[2rem] bg-white p-7">
              <p className="text-sm font-medium uppercase tracking-[0.24em] text-hooma-muted">Traditional delivery</p>
              <h2 className="mt-4 text-3xl font-semibold">Big piece first, problem solving later.</h2>
              <p className="mt-4 text-sm leading-6 text-hooma-muted">Large furniture can become a puzzle at the doorway, stairwell, or elevator.</p>
            </div>
            <div className="rounded-[2rem] bg-hooma-accent p-7 text-white">
              <p className="text-sm font-medium uppercase tracking-[0.24em] text-white/60">HOOMA delivery</p>
              <h2 className="mt-4 text-3xl font-semibold">Compact first, comfort after opening.</h2>
              <p className="mt-4 text-sm leading-6 text-white/72">The package moves more easily, then expands into the piece you wanted.</p>
            </div>
          </div>
        </Reveal>
        <div className="grid gap-5 lg:grid-cols-3">
          {details.map((detail, index) => (
            <Reveal key={detail.title} delay={index * 80}>
            <div className="rounded-2xl bg-white p-7 transition duration-300 hover:-translate-y-1 hover:shadow-soft">
              <detail.icon className="text-hooma-accent" size={24} />
              <h2 className="mt-8 text-2xl font-semibold">{detail.title}</h2>
              <p className="mt-4 text-sm leading-6 text-hooma-muted">{detail.copy}</p>
            </div>
            </Reveal>
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
