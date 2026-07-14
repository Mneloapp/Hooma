"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/supabase/server";

export type ImportActionState = { ok?: boolean; message?: string; importId?: string };
export type DraftActionState = { ok?: boolean; message?: string; productId?: string };

const MAX_HTML_BYTES = 2 * 1024 * 1024;
const clean = (value: unknown, max = 500) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);

function validateMakerWorldUrl(value: string) {
  const url = new URL(value);
  const hostname = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || !(hostname === "makerworld.com" || hostname.endsWith(".makerworld.com"))) {
    throw new Error("შეიყვანე MakerWorld-ის სწორი HTTPS ბმული.");
  }
  url.hash = "";
  return url;
}

function makerWorldIdentity(url: URL) {
  const match = url.pathname.match(/\/models\/(\d+)(?:-([^/?#]+))?/i);
  const modelId = match?.[1] ?? url.pathname.match(/model[_/-](\d+)/i)?.[1] ?? null;
  let titleSegment = match?.[2] ?? "";
  try { titleSegment = decodeURIComponent(titleSegment); } catch { titleSegment = match?.[2] ?? ""; }
  const inferredTitle = titleSegment ? clean(titleSegment.replace(/[-_]+/g, " "), 240) : "";
  return { modelId, inferredTitle };
}

async function fetchAllowedHtml(initialUrl: URL) {
  let current = initialUrl;
  for (let redirect = 0; redirect < 4; redirect += 1) {
    const response = await fetch(current, {
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
      headers: { Accept: "text/html,application/xhtml+xml", "User-Agent": "HoomaCatalogImporter/1.0" },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) throw new Error("MakerWorld redirect-ს მისამართი არ აქვს.");
      current = validateMakerWorldUrl(new URL(location, current).toString());
      continue;
    }
    if (!response.ok) throw new Error(`MakerWorld გვერდი არ გაიხსნა (HTTP ${response.status}).`);
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) throw new Error("ბმული HTML პროდუქტის გვერდს არ აბრუნებს.");
    const declaredSize = Number(response.headers.get("content-length") ?? 0);
    if (declaredSize > MAX_HTML_BYTES) throw new Error("გვერდის metadata დასაშვებ ზომას აღემატება.");

    const reader = response.body?.getReader();
    if (!reader) return (await response.text()).slice(0, MAX_HTML_BYTES);
    const chunks: Uint8Array[] = [];
    let received = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > MAX_HTML_BYTES) {
        await reader.cancel();
        throw new Error("გვერდის metadata დასაშვებ ზომას აღემატება.");
      }
      chunks.push(value);
    }
    const combined = new Uint8Array(received);
    let offset = 0;
    chunks.forEach((chunk) => { combined.set(chunk, offset); offset += chunk.byteLength; });
    return new TextDecoder().decode(combined);
  }
  throw new Error("MakerWorld ბმულზე ზედმეტად ბევრი redirect დაფიქსირდა.");
}

function attribute(tag: string, name: string) {
  const match = tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, "i"));
  return match?.[1] ? clean(match[1], 2_000) : "";
}

function extractPublicMetadata(html: string, url: URL) {
  const metadata = new Map<string, string[]>();
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = match[0];
    const key = (attribute(tag, "property") || attribute(tag, "name")).toLowerCase();
    const content = attribute(tag, "content");
    if (key && content) metadata.set(key, [...(metadata.get(key) ?? []), content]);
  }
  const titleTag = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? "";
  const first = (key: string) => metadata.get(key)?.[0] ?? "";
  const rawImages = [...(metadata.get("og:image") ?? []), ...(metadata.get("twitter:image") ?? [])];
  const images = Array.from(new Set(rawImages.map((value) => {
    try { return new URL(value, url).toString(); } catch { return ""; }
  }).filter((value) => value.startsWith("https://")))).slice(0, 12);
  const modelId = makerWorldIdentity(url).modelId;

  return {
    title: clean(first("og:title") || first("twitter:title") || titleTag, 240),
    description: clean(first("og:description") || first("description") || first("twitter:description"), 3_000),
    images,
    canonical_url: first("og:url") || url.toString(),
    model_id: modelId,
    extraction: {
      source: "public_page_metadata",
      technical_profile_status: "requires_operator_or_3mf_profile",
      extracted_at: new Date().toISOString(),
    },
  };
}

export async function createMakerWorldImportAction(_state: ImportActionState, formData: FormData): Promise<ImportActionState> {
  const profile = await requirePermission("catalog.manage");
  if (!profile) return { ok: false, message: "ამ მოქმედებისთვის ადმინისტრატორის ანგარიშია საჭირო." };
  const admin = createAdminClient() as any;
  if (!admin) return { ok: false, message: "Supabase service role ჯერ არ არის დაკავშირებული." };

  let url: URL;
  try {
    url = validateMakerWorldUrl(clean(formData.get("source_url"), 2_000));
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "ბმული არასწორია." };
  }

  const identity = makerWorldIdentity(url);

  const baseRow = {
    source_url: url.toString(),
    platform: "makerworld",
    status: "submitted",
    source_model_id: identity.modelId,
    ...(identity.inferredTitle ? { source_title: identity.inferredTitle } : {}),
    submitted_by: profile.id,
    error_message: null,
  };
  const { data: importRow, error: insertError } = await admin
    .from("source_imports")
    .upsert(baseRow, { onConflict: "platform,source_url" })
    .select("id")
    .single();
  if (insertError || !importRow) return { ok: false, message: insertError?.message ?? "Import task ვერ შეიქმნა." };

  try {
    const html = await fetchAllowedHtml(url);
    const extracted = extractPublicMetadata(html, url);
    await admin.from("source_imports").update({
      status: "metadata_ready",
      source_model_id: extracted.model_id,
      source_title: extracted.title || null,
      extracted_metadata: extracted,
      metadata_extracted_at: new Date().toISOString(),
      error_message: null,
    }).eq("id", importRow.id);
    await admin.from("audit_log").insert({ actor_id: profile.id, action: "makerworld_metadata_extracted", entity_type: "source_import", entity_id: importRow.id, metadata: { source_url: url.toString(), image_count: extracted.images.length } });
    revalidatePath("/admin/imports");
    return { ok: true, importId: importRow.id, message: "Metadata მიღებულია. ახლა გადაამოწმე ტექნიკური მონაცემები და ლიცენზია." };
  } catch (error) {
    const message = error instanceof Error ? clean(error.message, 500) : "Metadata ავტომატურად ვერ წამოვიღეთ.";
    await admin.from("source_imports").update({ status: "needs_review", error_message: message }).eq("id", importRow.id);
    await admin.from("audit_log").insert({ actor_id: profile.id, action: "makerworld_metadata_extraction_failed", entity_type: "source_import", entity_id: importRow.id, metadata: { source_url: url.toString(), error: message } });
    revalidatePath("/admin/imports");
    return {
      ok: true,
      importId: importRow.id,
      message: message.includes("HTTP 403")
        ? "MakerWorld-მა ავტომატური წაკითხვა შეზღუდა. ბმული და Model ID შენახულია — შეავსე დარჩენილი მონაცემები გადამოწმების გვერდზე."
        : `ბმული შენახულია, მაგრამ ავტომატური წაკითხვა ვერ დასრულდა: ${message}`,
    };
  }
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const positiveNumber = (formData: FormData, key: string, max: number) => {
  const value = Number(formData.get(key));
  if (!Number.isFinite(value) || value <= 0 || value > max) throw new Error(`${key} არასწორია.`);
  return value;
};

function makerWorldImageUrls(value: unknown) {
  const entries = String(value ?? "")
    .split(/[\n,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (entries.length > 12) throw new Error("ერთ პროდუქტზე მაქსიმუმ 12 ფოტო-ბმულია დაშვებული.");

  return Array.from(new Set(entries.map((entry) => {
    const url = new URL(entry);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || !(host === "makerworld.bblmw.com" || host.endsWith(".bblmw.com"))) {
      throw new Error("ფოტოს ბმული MakerWorld-ის HTTPS მისამართი უნდა იყოს (makerworld.bblmw.com).");
    }
    url.hash = "";
    return url.toString();
  })));
}

export async function createProductDraftFromImportAction(_state: DraftActionState, formData: FormData): Promise<DraftActionState> {
  const profile = await requirePermission("catalog.manage");
  const admin = createAdminClient() as any;
  if (!profile || !admin) return { ok: false, message: "ადმინისტრატორის სესია ან Supabase service role ვერ მოიძებნა." };

  const importId = clean(formData.get("import_id"), 36);
  const categoryId = clean(formData.get("category_id"), 36);
  const materialId = clean(formData.get("material_profile_id"), 36);
  const pricingId = clean(formData.get("pricing_profile_id"), 36);
  if (![importId, categoryId, materialId, pricingId].every((value) => uuidPattern.test(value))) return { ok: false, message: "არჩეული პარამეტრები არასწორია." };

  const nameEn = clean(formData.get("name_en"), 160);
  const nameKa = clean(formData.get("name_ka"), 160);
  const slug = clean(formData.get("slug"), 160).toLowerCase();
  if (nameEn.length < 2 || nameKa.length < 2 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return { ok: false, message: "შეავსე ორივე სახელი და სწორი ინგლისური slug." };

  try {
    const description = clean(formData.get("description"), 3_000);
    const submittedImages = makerWorldImageUrls(formData.get("image_urls"));
    const grams = positiveNumber(formData, "material_grams", 1_000_000);
    const minutes = Math.round(positiveNumber(formData, "print_minutes", 1_000_000));
    const plateCount = Math.round(positiveNumber(formData, "plate_count", 100));
    const margin = Number(formData.get("margin_percent"));
    if (!Number.isFinite(margin) || margin < 0 || margin >= 100) throw new Error("მარჟა უნდა იყოს 0-დან 99.99%-მდე.");
    const dimensions = {
      x: positiveNumber(formData, "dimension_x", 100_000),
      y: positiveNumber(formData, "dimension_y", 100_000),
      z: positiveNumber(formData, "dimension_z", 100_000),
      unit: "mm",
    };
    const { data: importRecord, error: importReadError } = await admin
      .from("source_imports")
      .select("source_url,extracted_metadata")
      .eq("id", importId)
      .single();
    if (importReadError || !importRecord) throw new Error("MakerWorld Import ჩანაწერი ვერ მოიძებნა.");

    const currentMetadata = importRecord.extracted_metadata && typeof importRecord.extracted_metadata === "object"
      ? importRecord.extracted_metadata
      : {};
    const existingImages = Array.isArray(currentMetadata.images)
      ? currentMetadata.images.filter((value: unknown) => typeof value === "string").slice(0, 12)
      : [];
    const reviewedMetadata = {
      ...currentMetadata,
      title: nameEn,
      description,
      images: submittedImages.length ? submittedImages : existingImages,
      canonical_url: importRecord.source_url,
      extraction: {
        ...(currentMetadata.extraction && typeof currentMetadata.extraction === "object" ? currentMetadata.extraction : {}),
        operator_reviewed_at: new Date().toISOString(),
      },
    };
    const { error: metadataUpdateError } = await admin.from("source_imports").update({
      source_title: nameEn,
      extracted_metadata: reviewedMetadata,
      status: "metadata_ready",
      error_message: null,
    }).eq("id", importId);
    if (metadataUpdateError) throw new Error("პროდუქტის აღწერა და ფოტოები ვერ შეინახა.");

    const { data, error } = await admin.rpc("create_product_draft_from_import", {
      import_uuid: importId,
      actor_uuid: profile.id,
      product_name_en: nameEn,
      product_name_ka: nameKa,
      product_slug: slug,
      selected_category_id: categoryId,
      selected_material_profile_id: materialId,
      selected_pricing_profile_id: pricingId,
      selected_material_grams: grams,
      selected_print_minutes: minutes,
      selected_margin_percent: margin,
      selected_plate_count: plateCount,
      selected_dimensions: dimensions,
      selected_license_name: clean(formData.get("license_name"), 200),
      selected_license_url: clean(formData.get("license_url"), 2_000),
      confirmed_commercial_use: formData.get("commercial_use_allowed") === "on",
      confirmed_media_use: formData.get("media_use_allowed") === "on",
    });
    if (error || !data) return { ok: false, message: error?.message ?? "Product Draft ვერ შეიქმნა." };
    revalidatePath("/admin/imports");
    revalidatePath("/admin/products");
    return { ok: true, productId: String(data), message: "პროდუქტის Draft შეიქმნა. გამოქვეყნებამდე საჭიროა სატესტო ბეჭდვა და საბოლოო დამტკიცება." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "ტექნიკური მონაცემები არასწორია." };
  }
}
