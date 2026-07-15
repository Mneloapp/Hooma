export type ProductCategory =
  | "Home & Organization"
  | "Desk & Tech"
  | "Kitchen"
  | "Kids & Learning"
  | "Pets"
  | "Car Accessories"
  | "Gifts & Personalization"
  | "Custom Parts";

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

export type Product = {
  id: string;
  slug: string;
  hoomaName: string;
  nameKa: string;
  category: ProductCategory;
  categorySlug: string;
  subcategory: string;
  subcategorySlug: string;
  shortDescription: string;
  shortDescriptionKa: string;
  longDescription: string;
  heroImage: string;
  galleryImages: string[];
  videoUrl?: string;
  variants: ProductVariant[];
  availableMaterials: string[];
  availableColors: string[];
  tags: string[];
  isFeatured: boolean;
  price: number | null;
  pricePlaceholder: string;
  currency: "GEL";
  deliveryEstimate: string;
  leadTimeDays: number;
  estimatedPrintHours: number | null;
  licenseStatus: "not_required" | "pending" | "verified";
  sourcePlatform: "hooma" | "makerworld" | "external" | "other";
  sourceCreator?: string;
  isOrderable: boolean;
};

const colors = ["Warm white", "Graphite", "Sage", "Sand", "Terracotta"];
const standardMaterials = ["PLA+", "PETG"];
const pricePlaceholder = "ფასი მალე";

const product = ({
  id,
  slug,
  hoomaName,
  nameKa,
  category,
  categorySlug,
  subcategory,
  subcategorySlug,
  shortDescription,
  shortDescriptionKa,
  image,
  tags,
  printHours,
  dimensions,
  materials = standardMaterials,
  featured = false,
}: {
  id: string;
  slug: string;
  hoomaName: string;
  nameKa: string;
  category: ProductCategory;
  categorySlug: string;
  subcategory: string;
  subcategorySlug: string;
  shortDescription: string;
  shortDescriptionKa: string;
  image: string;
  tags: string[];
  printHours: number | null;
  dimensions: string;
  materials?: string[];
  featured?: boolean;
}): Product => ({
  id,
  slug,
  hoomaName,
  nameKa,
  category,
  categorySlug,
  subcategory,
  subcategorySlug,
  shortDescription,
  shortDescriptionKa,
  longDescription: `${hoomaName} is a preview product concept prepared for the new Hooma catalog. Final specifications, source rights, print profile, and price must be approved in the admin panel before launch.`,
  heroImage: image,
  galleryImages: [image],
  variants: [
    {
      id: `${id}-standard`,
      sku: `HOO-${id.toUpperCase()}-STD`,
      sizeLabel: "Standard",
      layoutLabel: "Catalog preview",
      productDimensionsCm: dimensions,
      packingDimensionsCm: "Set after test print",
      grossWeightKg: "Set after test print",
      image,
      price: null,
      pricePlaceholder,
      availableColors: colors,
      availableMaterials: materials,
      colorMode: "customer_choice",
      amsRequired: false,
    },
  ],
  availableMaterials: materials,
  availableColors: colors,
  tags,
  isFeatured: featured,
  price: null,
  pricePlaceholder,
  currency: "GEL",
  deliveryEstimate: "3 სამუშაო დღე შეკვეთიდან მიწოდებამდე",
  leadTimeDays: 3,
  estimatedPrintHours: printHours,
  licenseStatus: "not_required",
  sourcePlatform: "hooma",
  isOrderable: false,
});

export const products: Product[] = [
  product({
    id: "orbit-stand",
    slug: "orbit-phone-stand",
    hoomaName: "Hooma Orbit Stand",
    nameKa: "Hooma Orbit ტელეფონის სადგამი",
    category: "Desk & Tech",
    categorySlug: "desk-tech",
    subcategory: "Phone stands",
    subcategorySlug: "phone-stands",
    shortDescription: "A sculptural phone stand for focused desks and clear video calls.",
    shortDescriptionKa: "სკულპტურული ტელეფონის სადგამი მოწესრიგებული სამუშაო სივრცისა და ვიდეოზარებისთვის.",
    image: "/catalog-placeholders/desk-tech.svg",
    tags: ["phone", "stand", "desk"],
    printHours: 3.5,
    dimensions: "11 × 9 × 14",
    featured: true,
  }),
  product({
    id: "arc-cable-dock",
    slug: "arc-cable-dock",
    hoomaName: "Hooma Arc Cable Dock",
    nameKa: "Hooma Arc კაბელის დამჭერი",
    category: "Desk & Tech",
    categorySlug: "desk-tech",
    subcategory: "Cable management",
    subcategorySlug: "cable-management",
    shortDescription: "A weighted cable dock that keeps daily charging lines within reach.",
    shortDescriptionKa: "კაბელის კომპაქტური დამჭერი, რომელიც დამტენს ყოველთვის ხელმისაწვდომ ადგილზე ინარჩუნებს.",
    image: "/catalog-placeholders/desk-tech.svg",
    tags: ["cable", "dock", "organizer"],
    printHours: 2,
    dimensions: "9 × 5 × 3",
    featured: true,
  }),
  product({
    id: "grid-drawer",
    slug: "grid-drawer-organizer",
    hoomaName: "Hooma Grid Organizer",
    nameKa: "Hooma Grid უჯრის ორგანაიზერი",
    category: "Home & Organization",
    categorySlug: "home-organization",
    subcategory: "Storage & organizers",
    subcategorySlug: "storage-organizers",
    shortDescription: "Modular trays that turn mixed drawers into an adjustable system.",
    shortDescriptionKa: "მოდულური უჯრები, რომლებიც უწესრიგო სივრცეს მოქნილ სისტემად გარდაქმნის.",
    image: "/catalog-placeholders/home.svg",
    tags: ["drawer", "modular", "storage"],
    printHours: 6,
    dimensions: "Modular set",
    featured: true,
  }),
  product({
    id: "pour-station",
    slug: "pour-coffee-station",
    hoomaName: "Hooma Pour Station",
    nameKa: "Hooma Pour ყავის სადგამი",
    category: "Kitchen",
    categorySlug: "kitchen",
    subcategory: "Coffee & bar",
    subcategorySlug: "coffee-bar",
    shortDescription: "A clean station for filters, measuring tools, and a calmer coffee ritual.",
    shortDescriptionKa: "ფილტრებისა და აქსესუარების სადგამი ყოველდღიური ყავის რიტუალისთვის.",
    image: "/catalog-placeholders/kitchen.svg",
    tags: ["coffee", "organizer", "kitchen"],
    printHours: 5,
    dimensions: "18 × 12 × 16",
    featured: true,
  }),
  product({
    id: "builder-puzzle",
    slug: "builder-shape-puzzle",
    hoomaName: "Hooma Builder Puzzle",
    nameKa: "Hooma Builder ფორმების ფაზლი",
    category: "Kids & Learning",
    categorySlug: "kids-learning",
    subcategory: "Puzzles",
    subcategorySlug: "puzzles",
    shortDescription: "A guided shape puzzle prepared for age and safety review before release.",
    shortDescriptionKa: "ფორმების შემეცნებითი ფაზლი, რომელიც გამოშვებამდე ასაკობრივ და უსაფრთხოების შემოწმებას გაივლის.",
    image: "/catalog-placeholders/kids.svg",
    tags: ["puzzle", "learning", "shapes"],
    printHours: 4.5,
    dimensions: "16 × 12 × 1",
    materials: ["PLA+"],
    featured: true,
  }),
  product({
    id: "pet-name-tag",
    slug: "pet-name-tag",
    hoomaName: "Hooma Pet Name Tag",
    nameKa: "Hooma ცხოველის სახელიანი მედალიონი",
    category: "Pets",
    categorySlug: "pets",
    subcategory: "Personalized accessories",
    subcategorySlug: "pet-personalized",
    shortDescription: "A lightweight personalized tag with readable contact details.",
    shortDescriptionKa: "მსუბუქი პერსონალიზებული მედალიონი მკაფიო საკონტაქტო ინფორმაციით.",
    image: "/catalog-placeholders/pets.svg",
    tags: ["pet", "personalized", "tag"],
    printHours: 1.5,
    dimensions: "4 × 3 × 0.4",
    materials: ["PETG"],
    featured: true,
  }),
  product({
    id: "console-tray",
    slug: "car-console-tray",
    hoomaName: "Hooma Console Tray",
    nameKa: "Hooma ავტომობილის კონსოლის უჯრა",
    category: "Car Accessories",
    categorySlug: "car-accessories",
    subcategory: "Console organizers",
    subcategorySlug: "console-organizers",
    shortDescription: "A model-specific organizer concept measured to fit the vehicle precisely.",
    shortDescriptionKa: "კონკრეტული ავტომობილის მოდელზე ზუსტად მორგებული კონსოლის ორგანაიზერი.",
    image: "/catalog-placeholders/car.svg",
    tags: ["car", "console", "organizer"],
    printHours: 7,
    dimensions: "Vehicle specific",
    materials: ["PETG", "ASA"],
    featured: false,
  }),
  product({
    id: "custom-fit",
    slug: "custom-fit-part",
    hoomaName: "Hooma Custom Fit",
    nameKa: "Hooma ინდივიდუალური დეტალი",
    category: "Custom Parts",
    categorySlug: "custom-parts",
    subcategory: "Request a part",
    subcategorySlug: "request-part",
    shortDescription: "A request-based service for replacement parts, adapters, and brackets.",
    shortDescriptionKa: "შემცვლელი დეტალების, ადაპტერებისა და სამაგრების ინდივიდუალური დამზადება.",
    image: "/catalog-placeholders/custom.svg",
    tags: ["custom", "replacement", "engineering"],
    printHours: null,
    dimensions: "Made to request",
    materials: ["PLA+", "PETG", "ASA", "TPU"],
    featured: false,
  }),
];

export const featuredProducts = products.filter((item) => item.isFeatured);

export const getProductBySlug = (slug: string) => products.find((item) => item.slug === slug);

export const getRelatedProducts = (product: Product) =>
  products.filter((item) => item.category === product.category && item.id !== product.id).slice(0, 3);
