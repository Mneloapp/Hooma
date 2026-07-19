import type { Product } from "@/data/products";

export type ProductCardData = Pick<Product,
  | "id"
  | "slug"
  | "hoomaName"
  | "nameKa"
  | "category"
  | "categorySlug"
  | "subcategory"
  | "subcategorySlug"
  | "shortDescription"
  | "shortDescriptionKa"
  | "heroImage"
  | "price"
  | "pricePlaceholder"
  | "leadTimeDays"
  | "isOrderable"
  | "ratingAverage"
  | "ratingCount"
  | "salesCount"
  | "popularityScore"
> & {
  href?: string;
  originalPrice?: number | null;
  discountPercent?: number | null;
};

export type ProductCardDeal = {
  productId: string;
  dealPrice: number | null;
  originalPrice: number | null;
  discountPercent: number;
};

export function toProductCardData(product: Product): ProductCardData {
  return {
    id: product.id,
    slug: product.slug,
    hoomaName: product.hoomaName,
    nameKa: product.nameKa,
    category: product.category,
    categorySlug: product.categorySlug,
    subcategory: product.subcategory,
    subcategorySlug: product.subcategorySlug,
    shortDescription: product.shortDescription,
    shortDescriptionKa: product.shortDescriptionKa,
    heroImage: product.heroImage,
    price: product.price,
    pricePlaceholder: product.pricePlaceholder,
    leadTimeDays: product.leadTimeDays,
    isOrderable: product.isOrderable,
    ratingAverage: product.ratingAverage,
    ratingCount: product.ratingCount,
    salesCount: product.salesCount,
    popularityScore: product.popularityScore,
  };
}

export function toDiscountedProductCardData(product: Product, deal?: ProductCardDeal): ProductCardData {
  const card = toProductCardData(product);
  if (!deal || deal.productId !== product.id || deal.dealPrice === null || deal.originalPrice === null) return card;

  return {
    ...card,
    price: deal.dealPrice,
    originalPrice: deal.originalPrice,
    discountPercent: deal.discountPercent,
  };
}
