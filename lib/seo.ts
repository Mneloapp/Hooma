import type { Metadata } from "next";
import type { CatalogCategory } from "@/data/catalog";

export const SITE_URL = "https://hooma.ge";
export const SITE_NAME = "Hooma";
export const DEFAULT_SOCIAL_IMAGE = "/opengraph-image";
export const DEFAULT_DESCRIPTION = "შეკვეთით დამზადებული პრაქტიკული ნივთები ყოველდღიურობისთვის — ადგილობრივი წარმოება და ხარისხის კონტროლი თბილისში.";

export function absoluteUrl(path = "/") {
  return new URL(path, SITE_URL).toString();
}

export function categoryPath(slug: string) {
  return `/shop/${encodeURIComponent(slug)}`;
}

export function compactDescription(value: string, maxLength = 160) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

type PublicMetadataOptions = {
  title: string;
  description: string;
  path: string;
  image?: string;
  index?: boolean;
};

export function publicPageMetadata({
  title,
  description,
  path,
  image = DEFAULT_SOCIAL_IMAGE,
  index = true,
}: PublicMetadataOptions): Metadata {
  const canonical = absoluteUrl(path);
  const normalizedDescription = compactDescription(description);
  const fullTitle = `${title} | ${SITE_NAME}`;

  return {
    title,
    description: normalizedDescription,
    alternates: { canonical },
    robots: {
      index,
      follow: index,
      googleBot: {
        index,
        follow: index,
        "max-image-preview": "large",
        "max-snippet": -1,
        "max-video-preview": -1,
      },
    },
    openGraph: {
      type: "website",
      locale: "ka_GE",
      url: canonical,
      siteName: SITE_NAME,
      title: fullTitle,
      description: normalizedDescription,
      images: [{
        url: image,
        alt: title,
        ...(image === DEFAULT_SOCIAL_IMAGE ? { width: 1200, height: 630 } : {}),
      }],
    },
    twitter: {
      card: "summary_large_image",
      title: fullTitle,
      description: normalizedDescription,
      images: [image],
    },
  };
}

export function categoryMetadata(category: CatalogCategory, index = true): Metadata {
  return publicPageMetadata({
    title: `${category.nameKa} — პრაქტიკული ნივთები`,
    description: `დაათვალიერე Hooma-ს ${category.nameKa} კატეგორიის პრაქტიკული ნივთები. პროდუქტები მზადდება შეკვეთის შემდეგ და გადის ხარისხის კონტროლს.`,
    path: categoryPath(category.slug),
    index,
  });
}

export const privatePageMetadata: Metadata = {
  robots: { index: false, follow: false, noarchive: true, nocache: true },
};
