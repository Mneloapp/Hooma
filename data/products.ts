export type ProductCategory =
  | "Sofas"
  | "Sofa Beds"
  | "Lounge Chairs"
  | "Ottomans"
  | "Pet Collection";

export type ProductVariant = {
  id: string;
  sku: string;
  sizeLabel: string;
  layoutLabel: string;
  productDimensionsCm: string;
  packingDimensionsCm: string;
  grossWeightKg: string;
  image: string;
  pricePlaceholder: string;
  availableColors: string[];
  availableFabrics: string[];
};

export type Product = {
  id: string;
  slug: string;
  originalModelCode: string;
  originalName: string;
  hoomaName: string;
  category: ProductCategory;
  shortDescription: string;
  longDescription: string;
  heroImage: string;
  galleryImages: string[];
  variants: ProductVariant[];
  availableFabrics: string[];
  availableColors: string[];
  tags: string[];
  isFeatured: boolean;
  pricePlaceholder: string;
  deliveryEstimate: string;
};

const colors = ["Ivory", "Stone", "Moss", "Charcoal", "Cocoa"];
const fabrics = ["Boucle", "Soft weave", "Velvet", "Performance fabric"];
const pricePlaceholder = "Request price";
const deliveryEstimate = "Contact us for current delivery timing";

const img = (slug: string) => `/catalog-images/${slug}.jpg`;
const catalog = (slug: string) => `/catalog-images/${slug}-catalog.jpg`;

const variant = (
  productId: string,
  suffix: string,
  sizeLabel: string,
  layoutLabel: string,
  productDimensionsCm: string,
  packingDimensionsCm: string,
  grossWeightKg: string,
  image: string,
): ProductVariant => ({
  id: `${productId}-${suffix}`,
  sku: `${productId.toUpperCase()}-${suffix.toUpperCase()}`,
  sizeLabel,
  layoutLabel,
  productDimensionsCm,
  packingDimensionsCm,
  grossWeightKg,
  image,
  pricePlaceholder,
  availableColors: colors,
  availableFabrics: fabrics,
});

export const products: Product[] = [
  {
    id: "h18",
    slug: "hooma-cloud",
    originalModelCode: "H-18",
    originalName: "Cloud",
    hoomaName: "Hooma Cloud",
    category: "Sofas",
    shortDescription: "A generous low-profile sofa designed for relaxed, full-size comfort.",
    longDescription:
      "Hooma Cloud brings a soft lounge silhouette into a compressed delivery format, with multiple sofa sizes listed in the source catalog.",
    heroImage: img("hooma-cloud"),
    galleryImages: [img("hooma-cloud"), catalog("hooma-cloud")],
    variants: [
      variant("h18", "footrest", "Footrest", "Modular footrest", "90*90*40", "30*30*100", "18", img("hooma-cloud")),
      variant("h18", "2s-small", "2-seater small", "Sofa", "200*100*60", "35*35*110*2", "40", img("hooma-cloud")),
      variant("h18", "2s-big", "2-seater big", "Sofa", "263*100*60", "40*40*112*2", "46", img("hooma-cloud")),
      variant("h18", "3s-small", "3-seater small", "Sofa", "284*100*60", "35*35*110*2 + 32*32*95", "58", img("hooma-cloud")),
      variant("h18", "3s-big", "3-seater big", "Sofa", "304*100*60", "35*35*110*2 + 35*35*100", "51", img("hooma-cloud")),
    ],
    availableFabrics: fabrics,
    availableColors: colors,
    tags: ["compressed", "modular", "family"],
    isFeatured: true,
    pricePlaceholder,
    deliveryEstimate,
  },
  {
    id: "h12",
    slug: "hooma-cotton",
    originalModelCode: "H-12",
    originalName: "Cotton Candy",
    hoomaName: "Hooma Cotton",
    category: "Sofas",
    shortDescription: "Soft modular comfort with a clean block silhouette.",
    longDescription:
      "Hooma Cotton is based on the H-12 Cotton Candy catalog model, offered across seating and footrest configurations.",
    heroImage: img("hooma-cotton"),
    galleryImages: [img("hooma-cotton"), catalog("hooma-cotton")],
    variants: [
      variant("h12", "footrest-50", "Footrest", "Compact footrest", "50*50*38", "15*55*55", "5.2", img("hooma-cotton")),
      variant("h12", "armchair", "Armchair", "Single seat", "120*90*68", "35*35*130", "25", img("hooma-cotton")),
      variant("h12", "footrest-90", "Footrest", "Large footrest", "90*92*35", "30*30*100", "14", img("hooma-cotton")),
      variant("h12", "2s", "2-seater", "Sofa", "182*100*68", "32*32*105*2", "39", img("hooma-cotton")),
      variant("h12", "3s", "3-seater", "Sofa", "272*100*68", "32*32*105*2 + 30*30*100", "56.5", img("hooma-cotton")),
      variant("h12", "3s-arm", "3-seater with single-sided armrest", "Sofa", "272*100*68", "32*32*105 + 30*30*100*2", "51", img("hooma-cotton")),
      variant("h12", "3s-footrest", "3-seater with footrest", "Sofa with footrest", "272*100*68", "32*32*105*2 + 30*30*100", "70.5", img("hooma-cotton")),
    ],
    availableFabrics: fabrics,
    availableColors: colors,
    tags: ["modular", "soft", "featured"],
    isFeatured: true,
    pricePlaceholder,
    deliveryEstimate,
  },
  {
    id: "h15",
    slug: "hooma-bull",
    originalModelCode: "H-15",
    originalName: "Big Bull",
    hoomaName: "Hooma Bull",
    category: "Sofas",
    shortDescription: "A broad, supportive compressed sofa with confident proportions.",
    longDescription: "Hooma Bull translates the H-15 Big Bull model into a premium sofa collection with three listed sizes.",
    heroImage: img("hooma-bull"),
    galleryImages: [img("hooma-bull"), catalog("hooma-bull")],
    variants: [
      variant("h15", "2s-small", "2-seater small", "Sofa", "220*100*60", "35*35*112*2", "44", img("hooma-bull")),
      variant("h15", "2s-big", "2-seater big", "Sofa", "260*100*60", "38*38*112*2", "53", img("hooma-bull")),
      variant("h15", "3s-small", "3-seater small", "Sofa", "300*100*60", "35*35*112*2 + 30*30*95", "62", img("hooma-bull")),
    ],
    availableFabrics: fabrics,
    availableColors: colors,
    tags: ["sofa", "wide seat"],
    isFeatured: true,
    pricePlaceholder,
    deliveryEstimate,
  },
  {
    id: "h24",
    slug: "hooma-flow",
    originalModelCode: "H-24",
    originalName: "Tofu-D",
    hoomaName: "Hooma Flow",
    category: "Sofas",
    shortDescription: "A curved two-unit sofa with a soft, flowing profile.",
    longDescription: "Hooma Flow uses the H-24 Tofu-D source model: two compressed units that expand into full-scale lounge seating.",
    heroImage: img("hooma-flow"),
    galleryImages: [img("hooma-flow"), catalog("hooma-flow")],
    variants: [variant("h24", "2-unit", "Two units", "Curved sofa", "(110*90*76)*2 units", "(100*35*35)*2 units", "19.2/unit", img("hooma-flow"))],
    availableFabrics: fabrics,
    availableColors: colors,
    tags: ["curved", "two unit", "lounge"],
    isFeatured: true,
    pricePlaceholder,
    deliveryEstimate,
  },
  {
    id: "h31",
    slug: "hooma-line",
    originalModelCode: "H-31",
    originalName: "Mahjong",
    hoomaName: "Hooma Line",
    category: "Sofas",
    shortDescription: "A refined linear sofa for modern living rooms.",
    longDescription: "Hooma Line is mapped from the H-31 Mahjong source model. Some fine table values were not legible in the supplied PDF render.",
    heroImage: img("hooma-line"),
    galleryImages: [img("hooma-line"), catalog("hooma-line")],
    variants: [variant("h31", "standard", "Standard", "Sofa", "TBD", "TBD", "TBD", img("hooma-line"))],
    availableFabrics: fabrics,
    availableColors: colors,
    tags: ["sofa", "linear"],
    isFeatured: false,
    pricePlaceholder,
    deliveryEstimate,
  },
  {
    id: "h32",
    slug: "hooma-brownie",
    originalModelCode: "H-32",
    originalName: "Brownie",
    hoomaName: "Hooma Brownie",
    category: "Sofas",
    shortDescription: "A compact tufted sofa with a tailored, cozy presence.",
    longDescription: "Hooma Brownie is based on H-32 Brownie, a compact sofa shown in the catalog with a compressed packing format.",
    heroImage: img("hooma-brownie"),
    galleryImages: [img("hooma-brownie"), catalog("hooma-brownie")],
    variants: [variant("h32", "standard", "Standard", "Sofa", "TBD", "TBD", "TBD", img("hooma-brownie"))],
    availableFabrics: fabrics,
    availableColors: colors,
    tags: ["compact", "tufted"],
    isFeatured: false,
    pricePlaceholder,
    deliveryEstimate,
  },
  {
    id: "h14",
    slug: "hooma-lemmy",
    originalModelCode: "H-14",
    originalName: "Lemmy",
    hoomaName: "Hooma Lemmy",
    category: "Sofas",
    shortDescription: "A rounded modular sofa collection with lounge-friendly proportions.",
    longDescription: "Hooma Lemmy uses the H-14 Lemmy catalog model with chair, corner, sofa, and expanded layout variants.",
    heroImage: img("hooma-lemmy"),
    galleryImages: [img("hooma-lemmy"), catalog("hooma-lemmy")],
    variants: [
      variant("h14", "footrest", "Footrest", "Footrest", "105*90*38", "30*30*95", "15", img("hooma-lemmy")),
      variant("h14", "accent-chair", "Accent Chair", "Chair", "92*100*64", "30*30*95", "15", img("hooma-lemmy")),
      variant("h14", "accent-arm", "Accent Chair with single-sided armrest", "Chair", "100*100*64", "32*32*110", "16.5", img("hooma-lemmy")),
      variant("h14", "corner", "Corner", "Corner module", "100*100*64", "32*32*115", "19", img("hooma-lemmy")),
      variant("h14", "2s", "2-seater", "Sofa", "200*100*64", "32*32*110*2", "33", img("hooma-lemmy")),
      variant("h14", "3s", "3-seater", "Sofa", "292*100*64", "32*32*110*3", "48", img("hooma-lemmy")),
      variant("h14", "3s-arm", "3-seater with single-sided armrest", "Sofa", "280*100*64", "32*32*110*2 + 30*30*95", "46.5", img("hooma-lemmy")),
      variant("h14", "double-corners", "Double corners with footrest", "Sectional", "292*100*64", "32*32*115 + 32*32*110 + 30*30*95", "50.5", img("hooma-lemmy")),
      variant("h14", "5s-corner", "5-seater + corner", "Sectional", "370*200", "32*32*110*4 + 32*32*115 + 30*30*95", "80.5", img("hooma-lemmy")),
    ],
    availableFabrics: fabrics,
    availableColors: colors,
    tags: ["modular", "sectional"],
    isFeatured: true,
    pricePlaceholder,
    deliveryEstimate,
  },
  {
    id: "h33",
    slug: "hooma-nest",
    originalModelCode: "H-33",
    originalName: "Pug Sofa Bed",
    hoomaName: "Hooma Nest",
    category: "Sofa Beds",
    shortDescription: "A compact sofa bed designed for flexible rooms and overnight comfort.",
    longDescription: "Hooma Nest is mapped from the H-33 Pug Sofa Bed model, designed to shift from compact seating to guest-ready rest.",
    heroImage: img("hooma-nest"),
    galleryImages: [img("hooma-nest"), catalog("hooma-nest")],
    variants: [variant("h33", "standard", "Standard", "Sofa bed", "TBD", "TBD", "TBD", img("hooma-nest"))],
    availableFabrics: fabrics,
    availableColors: colors,
    tags: ["sofa bed", "guest room"],
    isFeatured: false,
    pricePlaceholder,
    deliveryEstimate,
  },
  {
    id: "h16",
    slug: "hooma-cube",
    originalModelCode: "H-16",
    originalName: "Cube Ottoman",
    hoomaName: "Hooma Cube",
    category: "Ottomans",
    shortDescription: "A compact cube ottoman for flexible seating, footrest, or soft table use.",
    longDescription: "Hooma Cube is the H-16 Cube Ottoman source model with exact catalog dimensions and packing size.",
    heroImage: img("hooma-cube"),
    galleryImages: [img("hooma-cube"), catalog("hooma-cube")],
    variants: [variant("h16", "cube", "Cube", "Ottoman", "50*50*38", "23*23*57", "5.2", img("hooma-cube"))],
    availableFabrics: fabrics,
    availableColors: colors,
    tags: ["ottoman", "compact"],
    isFeatured: false,
    pricePlaceholder,
    deliveryEstimate,
  },
  {
    id: "h35",
    slug: "hooma-wave",
    originalModelCode: "H-35",
    originalName: "Wave Lounger",
    hoomaName: "Hooma Wave",
    category: "Lounge Chairs",
    shortDescription: "A sculptural lounger for reading, resting, and quiet corners.",
    longDescription: "Hooma Wave is mapped from H-35 Wave Lounger, a compressed lounge chair shown with a flowing reclined profile.",
    heroImage: img("hooma-wave"),
    galleryImages: [img("hooma-wave"), catalog("hooma-wave")],
    variants: [variant("h35", "lounger", "Lounger", "Lounge chair", "TBD", "TBD", "TBD", img("hooma-wave"))],
    availableFabrics: fabrics,
    availableColors: colors,
    tags: ["lounger", "reading"],
    isFeatured: true,
    pricePlaceholder,
    deliveryEstimate,
  },
  {
    id: "h36",
    slug: "hooma-pet-sofa",
    originalModelCode: "H-36",
    originalName: "Cotton Candy Sofa for Pet",
    hoomaName: "Hooma Pet Sofa",
    category: "Pet Collection",
    shortDescription: "A miniature compressed sofa made for pets and calm corners.",
    longDescription: "Hooma Pet Sofa is based on the H-36 Cotton Candy Sofa for Pet catalog model.",
    heroImage: img("hooma-pet-sofa"),
    galleryImages: [img("hooma-pet-sofa"), catalog("hooma-pet-sofa")],
    variants: [variant("h36", "standard", "Standard", "Pet sofa", "TBD", "TBD", "TBD", img("hooma-pet-sofa"))],
    availableFabrics: fabrics,
    availableColors: colors,
    tags: ["pet", "small space"],
    isFeatured: false,
    pricePlaceholder,
    deliveryEstimate,
  },
  {
    id: "h37",
    slug: "hooma-pet-bed",
    originalModelCode: "H-37",
    originalName: "Pet Bed",
    hoomaName: "Hooma Pet Bed",
    category: "Pet Collection",
    shortDescription: "A low, soft pet bed delivered in compact form.",
    longDescription: "Hooma Pet Bed is mapped from the H-37 Pet Bed catalog model.",
    heroImage: img("hooma-pet-bed"),
    galleryImages: [img("hooma-pet-bed"), catalog("hooma-pet-bed")],
    variants: [variant("h37", "standard", "Standard", "Pet bed", "TBD", "TBD", "TBD", img("hooma-pet-bed"))],
    availableFabrics: fabrics,
    availableColors: colors,
    tags: ["pet", "bed"],
    isFeatured: false,
    pricePlaceholder,
    deliveryEstimate,
  },
];

export const featuredProducts = products.filter((product) => product.isFeatured);
export const getProductBySlug = (slug: string) => products.find((product) => product.slug === slug);
export const getRelatedProducts = (product: Product) =>
  products.filter((item) => item.category === product.category && item.id !== product.id).slice(0, 3);
