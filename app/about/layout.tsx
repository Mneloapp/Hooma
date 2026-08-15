import type { ReactNode } from "react";
import { publicPageMetadata } from "@/lib/seo";

export const metadata = publicPageMetadata({
  title: "Hooma-ს შესახებ",
  description: "გაიგე, როგორ ქმნის Hooma თბილისში პრაქტიკულ ნივთებს შეკვეთის შემდეგ და როგორ ამოწმებს მათ ხარისხს.",
  path: "/about",
});

export default function AboutLayout({ children }: { children: ReactNode }) { return children; }
