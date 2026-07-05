import { FAQAccordion } from "@/components/FAQAccordion";
import { SectionTitle } from "@/components/SectionTitle";

export default function FAQ() {
  return (
    <section className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
      <SectionTitle eyebrow="FAQ" title="Everything we can answer before prices launch." />
      <FAQAccordion />
    </section>
  );
}
