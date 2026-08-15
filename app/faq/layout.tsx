import type { ReactNode } from "react";
import { publicPageMetadata } from "@/lib/seo";

export const metadata = publicPageMetadata({
  title: "ხშირად დასმული კითხვები",
  description: "პასუხები Hooma-ს შეკვეთებზე, წარმოებაზე, მასალებზე, მიწოდებასა და დაბრუნებაზე.",
  path: "/faq",
});

export default function FaqLayout({ children }: { children: ReactNode }) { return children; }
