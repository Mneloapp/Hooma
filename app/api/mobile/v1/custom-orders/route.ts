import { enforceMobileRateLimit, requireMobileAuth } from "@/lib/mobile-api/auth";
import {
  asRecord,
  cleanOptionalString,
  cleanString,
  mobileError,
  mobileJson,
  readMobileJson,
  uuidPattern,
} from "@/lib/mobile-api/http";
import { isOwnedUploadPath } from "@/lib/mobile-api/security";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const allowedExtensions = new Set(["3mf", "stl", "step", "stp", "obj", "zip", "pdf", "png", "jpg", "jpeg", "webp"]);

function storedFileMatches(
  extension: string,
  expectedSize: number,
  stored: { metadata?: Record<string, unknown> | null } | undefined,
) {
  const metadata = stored?.metadata;
  const actualSize = Number(metadata?.size ?? metadata?.contentLength);
  const mimeType = typeof metadata?.mimetype === "string"
    ? metadata.mimetype.toLowerCase()
    : "";
  if (!Number.isInteger(actualSize) || actualSize !== expectedSize || !mimeType) {
    return false;
  }
  if (["png", "jpg", "jpeg", "webp"].includes(extension)) {
    return mimeType.startsWith("image/");
  }
  if (extension === "pdf") return mimeType === "application/pdf";
  if (extension === "zip") {
    return ["application/zip", "application/x-zip-compressed"].includes(mimeType);
  }
  return mimeType.startsWith("model/") || [
    "application/octet-stream",
    "application/sla",
    "application/vnd.ms-package.3dmanufacturing-3dmodel+xml",
    "application/step",
  ].includes(mimeType);
}

export async function GET(request: Request) {
  try {
    const auth = await requireMobileAuth(request);
    const { data, error } = await auth.admin
      .from("custom_quote_requests")
      .select("id,title,description,quantity,dimensions,material_preference,color_preference,status,quoted_price,quote_currency,quoted_lead_days,quote_notes,quote_expires_at,order_id,created_at")
      .eq("profile_id", auth.user.id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;
    return mobileJson({ ok: true, data: data ?? [] });
  } catch (error) {
    return mobileError(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireMobileAuth(request);
    await enforceMobileRateLimit(request, "custom-orders:submit", 10, 86400, auth.user.id);
    const input = asRecord(await readMobileJson(request, 32 * 1024));
    const requestId = cleanString(input?.requestId, 36);
    const title = cleanString(input?.title, 120);
    const description = cleanString(input?.description, 3000);
    const quantity = Number(input?.quantity);
    const files = Array.isArray(input?.files) ? input!.files.map(asRecord) : [];
    if (
      !uuidPattern.test(requestId)
      || title.length < 3
      || description.length < 10
      || !Number.isInteger(quantity)
      || quantity < 1
      || quantity > 100
      || files.length < 1
      || files.length > 5
      || files.some((file) => !file)
    ) {
      return mobileJson({ ok: false, code: "invalid_request" }, 400);
    }

    let totalSize = 0;
    const normalizedFiles = files.map((file) => {
      const path = cleanString(file!.path, 500);
      const originalName = cleanString(file!.originalName, 255);
      const mimeType = cleanOptionalString(file!.mimeType, 120);
      const size = Number(file!.size);
      const extension = path.split(".").pop()?.toLowerCase() ?? "";
      if (
        !isOwnedUploadPath(auth.user.id, requestId, path)
        || !allowedExtensions.has(extension)
        || !originalName
        || !Number.isInteger(size)
        || size < 1
        || size > 100 * 1024 * 1024
      ) return null;
      totalSize += size;
      return { path, originalName, mimeType, size };
    });
    if (normalizedFiles.some((file) => !file) || totalSize > 250 * 1024 * 1024) {
      return mobileJson({ ok: false, code: "invalid_files" }, 400);
    }
    const { data: stored, error: storageError } = await auth.admin.storage
      .from("custom-quote-files")
      .list(`${auth.user.id}/${requestId}`, { limit: 10 });
    if (storageError) throw storageError;
    const storedByName = new Map((stored ?? []).map((item) => [item.name, item]));
    if (normalizedFiles.some((file) => {
      const extension = file!.path.split(".").pop()?.toLowerCase() ?? "";
      const storedFile = storedByName.get(file!.path.split("/").pop()!);
      return !storedFileMatches(extension, file!.size, storedFile);
    })) {
      return mobileJson({ ok: false, code: "files_not_verified" }, 400);
    }

    const { error: requestError } = await auth.admin.from("custom_quote_requests").insert({
      id: requestId,
      profile_id: auth.user.id,
      title,
      description,
      quantity,
      dimensions: cleanOptionalString(input?.dimensions, 500),
      material_preference: cleanOptionalString(input?.materialPreference, 120),
      color_preference: cleanOptionalString(input?.colorPreference, 120),
      status: "submitted",
    });
    if (requestError) throw requestError;
    const { error: fileError } = await auth.admin.from("custom_quote_files").insert(
      normalizedFiles.map((file) => ({
        request_id: requestId,
        storage_path: file!.path,
        original_name: file!.originalName,
        mime_type: file!.mimeType,
        size_bytes: file!.size,
      })),
    );
    if (fileError) {
      await auth.admin.from("custom_quote_requests").delete().eq("id", requestId).eq("profile_id", auth.user.id);
      throw fileError;
    }
    return mobileJson({ ok: true, data: { requestId } }, 201);
  } catch (error) {
    return mobileError(error);
  }
}
