export const catalogAgentItemStatuses = [
  "discovered",
  "processing",
  "draft_created",
  "needs_review",
  "duplicate",
  "failed",
] as const;

export type CatalogAgentItemStatus = (typeof catalogAgentItemStatuses)[number];
export type CatalogAgentPlatform = "makerworld" | "printables" | "thingiverse" | "other";

const defaultSourceHosts = [
  "makerworld.com",
  "printables.com",
  "thingiverse.com",
  "thangs.com",
  "myminifactory.com",
  "cults3d.com",
];

export function allowedCatalogSourceHosts() {
  const configured = (process.env.HOOMA_IMPORT_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  return Array.from(new Set([...defaultSourceHosts, ...configured]));
}

export function catalogHostAllowed(hostname: string) {
  const normalized = hostname.toLowerCase();
  return allowedCatalogSourceHosts().some((host) => normalized === host || normalized.endsWith(`.${host}`));
}

export function normalizeCatalogUrl(value: unknown, expectedHost?: string) {
  const url = new URL(String(value ?? "").trim());
  const hostname = url.hostname.toLowerCase();
  if (
    url.protocol !== "https:"
    || url.username
    || url.password
    || (url.port && url.port !== "443")
    || !catalogHostAllowed(hostname)
    || (expectedHost && hostname !== expectedHost && !hostname.endsWith(`.${expectedHost}`) && !expectedHost.endsWith(`.${hostname}`))
  ) {
    throw new Error("Unsupported catalog source URL");
  }
  url.hash = "";
  ["from", "ref", "source", "spm_id_from"].forEach((key) => url.searchParams.delete(key));
  Array.from(url.searchParams.keys()).forEach((key) => {
    if (key.toLowerCase().startsWith("utm_")) url.searchParams.delete(key);
  });
  return url;
}

export function catalogPlatform(url: URL): CatalogAgentPlatform {
  const hostname = url.hostname.toLowerCase();
  if (hostname.endsWith("makerworld.com")) return "makerworld";
  if (hostname.endsWith("printables.com")) return "printables";
  if (hostname.endsWith("thingiverse.com")) return "thingiverse";
  return "other";
}

export function sourceModelId(url: URL) {
  return url.pathname.match(/\/models\/(\d+)/i)?.[1]
    ?? url.pathname.match(/\/(?:thing|model|models|3d-model)[_/-](\d+)/i)?.[1]
    ?? null;
}

export function safeAgentSlug(name: string, sourceId: string | null) {
  const base = name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70) || "hooma-product";
  const suffix = (sourceId ?? crypto.randomUUID().replace(/-/g, "").slice(0, 10))
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24) || crypto.randomUUID().replace(/-/g, "").slice(0, 10);
  return `${base}-${suffix}`.slice(0, 100).replace(/-+$/g, "");
}

export type CatalogAgentClipperPayload = {
  schema: "hooma-catalog-clipper-v1";
  source: { url: string; platform?: string; pageTitle?: string | null };
  product: {
    name: string | null;
    description: string | null;
    operatorReference?: string | null;
    categoryHint?: string | null;
    categoryPath?: string[];
    media: { imageUrls: string[]; videoUrl?: string | null };
    technical: {
      material: string | null;
      weightGrams: number | null;
      printTimeMinutes: number | null;
      marginPercent?: number | null;
      colorMode?: "customer_choice" | "fixed_multicolor";
      colors?: string[];
    };
  };
  warnings?: string[];
};

export function asClipperPayload(value: unknown): CatalogAgentClipperPayload | null {
  if (!value || typeof value !== "object") return null;
  const payload = value as Partial<CatalogAgentClipperPayload>;
  if (payload.schema !== "hooma-catalog-clipper-v1" || !payload.source || !payload.product) return null;
  if (!payload.product.media || !payload.product.technical) return null;
  return payload as CatalogAgentClipperPayload;
}

