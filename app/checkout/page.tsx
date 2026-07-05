import { Button } from "@/components/Button";
import { SectionTitle } from "@/components/SectionTitle";

export default function Checkout() {
  return (
    <section className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6 lg:px-8">
      <SectionTitle eyebrow="Checkout" title="Online checkout coming soon." />
      <p className="text-lg text-hooma-muted">Online checkout coming soon. Contact us to order.</p>
      <Button href="/contact" className="mt-8">Contact us to order</Button>
    </section>
  );
}
