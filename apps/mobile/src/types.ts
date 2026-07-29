export type Language = "ka" | "en";

export type CatalogCategory = {
  slug: string;
  name: string;
  nameKa: string;
  description: string;
  subcategories: {
    slug: string;
    name: string;
    nameKa: string;
  }[];
};

export type CatalogCard = {
  id: string;
  slug: string;
  hoomaName: string;
  nameKa: string;
  category: string;
  categorySlug: string;
  subcategory: string;
  subcategorySlug: string;
  heroImage: string;
  price: number;
  pricePlaceholder: string;
  leadTimeDays: number;
  isOrderable: boolean;
  ratingAverage?: number;
  ratingCount?: number;
};

export type ProductVariant = {
  id: string;
  sku: string;
  sizeLabel: string;
  layoutLabel: string;
  productDimensionsCm: string;
  packingDimensionsCm: string;
  grossWeightKg: string;
  image: string;
  price: number | null;
  pricePlaceholder: string;
  availableColors: string[];
  availableMaterials: string[];
  colorMode: "customer_choice" | "fixed_multicolor";
  amsRequired: boolean;
};

export type Product = CatalogCard & {
  shortDescription: string;
  shortDescriptionKa: string;
  longDescription: string;
  safetyNotes?: string;
  galleryImages: string[];
  variants: ProductVariant[];
  availableMaterials: string[];
  availableColors: string[];
  deliveryEstimate: string;
  currency: "GEL";
  tags: string[];
};

export type OrderSummary = {
  id: string;
  tracking_code: string | null;
  payment_status: string;
  fulfillment_status: string;
  subtotal: number | string;
  delivery_fee: number | string;
  delivery_benefit_code: string;
  total: number | string;
  promised_at: string | null;
  created_at: string;
  order_items?: OrderItem[];
};

export type OrderItem = {
  id: string;
  product_id: string | null;
  product_name: string;
  size_label: string | null;
  material: string | null;
  color: string | null;
  quantity: number;
  unit_price: number | string;
};

export type Address = {
  id?: string;
  full_name: string;
  phone: string;
  city: string;
  address_line_1: string;
  address_line_2: string | null;
  postal_code: string | null;
  latitude: number | null;
  longitude: number | null;
  is_default?: boolean;
};

export type ApiEnvelope<T> = {
  ok: boolean;
  data: T;
  code?: string;
  message?: string;
};
