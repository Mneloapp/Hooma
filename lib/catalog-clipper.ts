export const hoomaClipperSchema = "hooma-catalog-clipper-v1" as const;

export type HoomaClipperColorMode = "customer_choice" | "fixed_multicolor";

export type HoomaClipperDraft = {
  schema: typeof hoomaClipperSchema;
  extractedAt: string;
  source: {
    url: string;
    platform: string | null;
    pageTitle: string | null;
  };
  product: {
    name: string | null;
    description: string | null;
    operatorReference: string;
    categoryHint: string | null;
    media: {
      imageUrls: string[];
      videoUrl: string | null;
    };
    technical: {
      material: string | null;
      weightGrams: number | null;
      printTimeMinutes: number | null;
      dimensionsMm: { x: number | null; y: number | null; z: number | null } | null;
      marginPercent: number | null;
      colorMode: HoomaClipperColorMode;
      colors: string[];
    };
  };
  warnings: string[];
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const cleanText = (value: unknown, maxLength: number, required = false) => {
  if (typeof value !== "string") return required ? "" : null;
  const result = value.replace(/\u0000/g, "").trim().slice(0, maxLength);
  return result || (required ? "" : null);
};

const cleanNumber = (value: unknown, minimum: number, maximum: number) => {
  if (value === null || value === undefined || value === "") return null;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number >= minimum && number <= maximum ? number : null;
};

const cleanUrl = (value: unknown) => {
  if (typeof value !== "string" || value.length > 4_000) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
};

export function parseHoomaClipperDraft(value: unknown): HoomaClipperDraft {
  if (!isRecord(value) || value.schema !== hoomaClipperSchema) {
    throw new Error("ეს ფაილი Hooma Catalog Clipper-ის სწორი ფორმატი არ არის.");
  }

  const source = isRecord(value.source) ? value.source : {};
  const product = isRecord(value.product) ? value.product : {};
  const media = isRecord(product.media) ? product.media : {};
  const technical = isRecord(product.technical) ? product.technical : {};
  const dimensions = isRecord(technical.dimensionsMm) ? technical.dimensionsMm : null;
  const sourceUrl = cleanUrl(source.url);
  if (!sourceUrl) throw new Error("იმპორტის ფაილში წყაროს სწორი ბმული არ არის.");

  const imageUrls = Array.isArray(media.imageUrls)
    ? Array.from(new Set(media.imageUrls.map(cleanUrl).filter((item): item is string => Boolean(item)))).slice(0, 12)
    : [];
  const colorMode: HoomaClipperColorMode = technical.colorMode === "fixed_multicolor"
    ? "fixed_multicolor"
    : "customer_choice";
  const colors = Array.isArray(technical.colors)
    ? Array.from(new Set(technical.colors.map((item) => cleanText(item, 60)).filter((item): item is string => Boolean(item)))).slice(0, 12)
    : [];
  const warnings = Array.isArray(value.warnings)
    ? value.warnings.map((item) => cleanText(item, 300)).filter((item): item is string => Boolean(item)).slice(0, 20)
    : [];

  return {
    schema: hoomaClipperSchema,
    extractedAt: cleanText(value.extractedAt, 80, true) || new Date().toISOString(),
    source: {
      url: sourceUrl,
      platform: cleanText(source.platform, 120),
      pageTitle: cleanText(source.pageTitle, 300),
    },
    product: {
      name: cleanText(product.name, 160),
      description: cleanText(product.description, 3_000),
      operatorReference: cleanText(product.operatorReference, 2_000, true) || sourceUrl,
      categoryHint: cleanText(product.categoryHint, 160),
      media: {
        imageUrls,
        videoUrl: cleanUrl(media.videoUrl),
      },
      technical: {
        material: cleanText(technical.material, 120),
        weightGrams: cleanNumber(technical.weightGrams, 0.01, 1_000_000),
        printTimeMinutes: cleanNumber(technical.printTimeMinutes, 1, 999_999),
        dimensionsMm: dimensions
          ? {
              x: cleanNumber(dimensions.x, 0.01, 1_000_000),
              y: cleanNumber(dimensions.y, 0.01, 1_000_000),
              z: cleanNumber(dimensions.z, 0.01, 1_000_000),
            }
          : null,
        marginPercent: cleanNumber(technical.marginPercent, 0, 99.99),
        colorMode,
        colors,
      },
    },
    warnings,
  };
}
