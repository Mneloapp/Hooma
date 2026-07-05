import { HowItWorksSteps } from "@/components/HowItWorksSteps";
import { SectionTitle } from "@/components/SectionTitle";

export default function HowItWorks() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
      <SectionTitle eyebrow="How it works" title="Designed for delivery, made for living." copy="HOOMA focuses on large comfortable furniture delivered in a compact box." />
      <HowItWorksSteps />
    </section>
  );
}
