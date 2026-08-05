import type { Metadata } from "next";
import { ContactSupportPage } from "@/components/contact/ContactSupportPage";
import { isContactSupportEnabled } from "@/lib/contact/server";

export const metadata: Metadata = {
  title: "დახმარება და მხარდაჭერა | Hooma",
  description: "დაუკავშირდი Hooma-ს მხარდაჭერას შეკვეთის, გადახდის, მიწოდების, პროდუქტის ან ანგარიშის საკითხზე.",
};

export default function ContactPage() {
  return <ContactSupportPage enabled={isContactSupportEnabled()} />;
}
