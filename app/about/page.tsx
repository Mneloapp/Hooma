import { SectionTitle } from "@/components/SectionTitle";

export default function About() {
  return (
    <section className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
      <SectionTitle eyebrow="About" title="HOOMA is furniture reimagined for Georgian homes." />
      <p className="text-center text-lg leading-8 text-hooma-muted">HOOMA is a Georgian online store for compressed furniture. We pair modern silhouettes with compact delivery so premium comfort can move through doors, elevators, and everyday life more easily.</p>
    </section>
  );
}
