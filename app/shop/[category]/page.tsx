import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/JsonLd";
import ShopPage from "@/app/shop/page";
import { getCategory } from "@/data/catalog";
import { absoluteUrl, categoryMetadata, categoryPath, privatePageMetadata } from "@/lib/seo";
import { getStorefrontCatalogPage, getStorefrontPublicCategorySlugs } from "@/lib/storefront-catalog";

export const dynamic = "force-dynamic";

type CategoryParams = { category: string };
type CategorySearchParams = { subcategory?: string; q?: string; material?: string; sort?: string; page?: string };

export async function generateMetadata({ params, searchParams }: {
  params: Promise<CategoryParams>;
  searchParams: Promise<CategorySearchParams>;
}): Promise<Metadata> {
  const [{ category: slug }, filters] = await Promise.all([params, searchParams]);
  const category = getCategory(slug);
  if (!category) return privatePageMetadata;

  const [{ totalCount }, activeCategorySlugs] = await Promise.all([
    getStorefrontCatalogPage({ category: slug, page: 1, pageSize: 1 }),
    getStorefrontPublicCategorySlugs(),
  ]);
  const hasFilters = Object.values(filters).some(Boolean);
  return categoryMetadata(category, activeCategorySlugs.includes(slug) && totalCount > 0 && !hasFilters);
}

export default async function CategoryPage({ params, searchParams }: {
  params: Promise<CategoryParams>;
  searchParams: Promise<CategorySearchParams>;
}) {
  const [{ category: slug }, filters] = await Promise.all([params, searchParams]);
  const category = getCategory(slug);
  if (!category) notFound();

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "მთავარი", item: absoluteUrl("/") },
      { "@type": "ListItem", position: 2, name: "კატალოგი", item: absoluteUrl("/shop") },
      { "@type": "ListItem", position: 3, name: category.nameKa, item: absoluteUrl(categoryPath(category.slug)) },
    ],
  };

  return <>
    <JsonLd data={breadcrumbJsonLd} />
    <ShopPage searchParams={Promise.resolve({ ...filters, category: category.slug })} />
  </>;
}
