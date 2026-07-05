import { Button } from "@/components/Button";
import { SectionTitle } from "@/components/SectionTitle";

export default function Contact() {
  return (
    <section className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
      <SectionTitle eyebrow="Contact" title="Request a consultation." copy="Tell us which model, fabric, and room you are planning for." />
      <div className="rounded-2xl bg-white p-6 md:p-8">
        <div className="grid gap-4 md:grid-cols-2">
          <input className="rounded-xl border border-hooma-text/10 bg-hooma-background px-4 py-3" placeholder="Name" />
          <input className="rounded-xl border border-hooma-text/10 bg-hooma-background px-4 py-3" placeholder="Phone or email" />
          <input className="rounded-xl border border-hooma-text/10 bg-hooma-background px-4 py-3 md:col-span-2" placeholder="Preferred model" />
          <textarea className="min-h-36 rounded-xl border border-hooma-text/10 bg-hooma-background px-4 py-3 md:col-span-2" placeholder="Message" />
        </div>
        <Button className="mt-5">Send request</Button>
      </div>
    </section>
  );
}
