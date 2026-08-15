import type { ReactNode } from "react";
import { publicPageMetadata } from "@/lib/seo";

export const metadata = publicPageMetadata({
  title: "Hooma+",
  description: "Hooma+-ის წევრობა და კატალოგის სტანდარტული მიწოდების პირობები.",
  path: "/hooma-plus",
});

export default function HoomaPlusLayout({ children }: { children: ReactNode }) { return children; }
