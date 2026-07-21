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

export type CatalogProductAuditAnalysis = {
  nameKa: string;
  nameEn: string;
  descriptionKa: string;
  descriptionEn: string;
  dimensionsMm: { x: number; y: number; z: number };
  dimensionConfidence: number;
  colorMode: "customer_choice" | "fixed_multicolor";
  colors: string[];
  colorConfidence: number;
  colorEvidence: string;
  referenceChecked: boolean;
  imageDecisions: Array<{ url: string; keep: boolean; reason: string }>;
  heroImageUrl: string;
  summary: string;
  warnings: string[];
  model: string;
  responseId?: string | null;
  processingMs?: number | null;
};

const auditText = (value: unknown, maximum: number) => typeof value === "string"
  ? value.replace(/\s+/g, " ").trim().slice(0, maximum)
  : "";

function auditNumber(value: unknown, minimum: number, maximum: number) {
  const number = Number(value);
  return Number.isFinite(number) && number >= minimum && number <= maximum ? number : null;
}

export function asCatalogProductAuditAnalysis(value: unknown): CatalogProductAuditAnalysis | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const dimensions = candidate.dimensionsMm;
  if (!dimensions || typeof dimensions !== "object" || Array.isArray(dimensions)) return null;
  const dimensionValues = dimensions as Record<string, unknown>;
  const x = auditNumber(dimensionValues.x, 1, 5_000);
  const y = auditNumber(dimensionValues.y, 1, 5_000);
  const z = auditNumber(dimensionValues.z, 1, 5_000);
  const dimensionConfidence = auditNumber(candidate.dimensionConfidence, 0, 1);
  const colorConfidence = auditNumber(candidate.colorConfidence, 0, 1);
  if (x === null || y === null || z === null || dimensionConfidence === null || colorConfidence === null) return null;

  const nameKa = auditText(candidate.nameKa, 160);
  const nameEn = auditText(candidate.nameEn, 160);
  const descriptionKa = auditText(candidate.descriptionKa, 800);
  const descriptionEn = auditText(candidate.descriptionEn, 800);
  const heroImageUrl = auditText(candidate.heroImageUrl, 2_000);
  const summary = auditText(candidate.summary, 500);
  const model = auditText(candidate.model, 120);
  const colorMode = candidate.colorMode === "fixed_multicolor" ? "fixed_multicolor" : candidate.colorMode === "customer_choice" ? "customer_choice" : null;
  const allowedColors = new Set(["თეთრი", "შავი", "ნაცრისფერი", "ბეჟი", "წითელი", "ლურჯი", "მწვანე", "ყვითელი", "ნარინჯისფერი", "იისფერი", "ვარდისფერი", "ყავისფერი"]);
  const colors = Array.isArray(candidate.colors) ? Array.from(new Set(candidate.colors.map((color) => auditText(color, 60)).filter((color) => allowedColors.has(color)))) : [];
  const colorEvidence = auditText(candidate.colorEvidence, 500);
  const referenceChecked = candidate.referenceChecked === true;
  if (!colorMode || !colorEvidence || colors.length < (colorMode === "fixed_multicolor" ? 2 : 1)) return null;
  if (nameKa.length < 2 || nameEn.length < 2 || descriptionKa.length < 10 || descriptionEn.length < 10 || !heroImageUrl || !summary || !model) return null;

  if (!Array.isArray(candidate.imageDecisions) || candidate.imageDecisions.length < 1 || candidate.imageDecisions.length > 12) return null;
  const imageDecisions = candidate.imageDecisions.flatMap((decision) => {
    if (!decision || typeof decision !== "object" || Array.isArray(decision)) return [];
    const row = decision as Record<string, unknown>;
    const url = auditText(row.url, 2_000);
    const reason = auditText(row.reason, 300);
    return url && typeof row.keep === "boolean" && reason ? [{ url, keep: row.keep, reason }] : [];
  });
  if (imageDecisions.length !== candidate.imageDecisions.length) return null;

  const warnings = Array.isArray(candidate.warnings)
    ? candidate.warnings.map((warning) => auditText(warning, 300)).filter(Boolean).slice(0, 20)
    : [];
  const responseId = auditText(candidate.responseId, 200) || null;
  const processingMs = candidate.processingMs === null || candidate.processingMs === undefined
    ? null
    : auditNumber(candidate.processingMs, 0, 3_600_000);
  if (candidate.processingMs !== null && candidate.processingMs !== undefined && processingMs === null) return null;

  return {
    nameKa,
    nameEn,
    descriptionKa,
    descriptionEn,
    dimensionsMm: { x, y, z },
    dimensionConfidence,
    colorMode,
    colors,
    colorConfidence,
    colorEvidence,
    referenceChecked,
    imageDecisions,
    heroImageUrl,
    summary,
    warnings,
    model,
    responseId,
    processingMs,
  };
}

export function asClipperPayload(value: unknown): CatalogAgentClipperPayload | null {
  if (!value || typeof value !== "object") return null;
  const payload = value as Partial<CatalogAgentClipperPayload>;
  if (payload.schema !== "hooma-catalog-clipper-v1" || !payload.source || !payload.product) return null;
  if (!payload.product.media || !payload.product.technical) return null;
  return payload as CatalogAgentClipperPayload;
}
