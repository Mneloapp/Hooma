import type { ReactNode } from "react";
import { publicPageMetadata } from "@/lib/seo";

export const metadata = publicPageMetadata({
  title: "როგორ მუშაობს Hooma",
  description: "აირჩიე პროდუქტი, დაადასტურე შეკვეთა და მიიღე თბილისში შეკვეთით დამზადებული ნივთი ხარისხის კონტროლის შემდეგ.",
  path: "/how-it-works",
});

export default function HowItWorksLayout({ children }: { children: ReactNode }) { return children; }
