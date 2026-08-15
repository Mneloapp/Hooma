import type { ReactNode } from "react";
import { publicPageMetadata } from "@/lib/seo";

export const metadata = publicPageMetadata({
  title: "კონტაქტი",
  description: "დაუკავშირდი Hooma-ს შეკვეთის, პროდუქტის, მიწოდების ან პერსონალური მონაცემების საკითხზე.",
  path: "/contact",
});

export default function ContactLayout({ children }: { children: ReactNode }) { return children; }
