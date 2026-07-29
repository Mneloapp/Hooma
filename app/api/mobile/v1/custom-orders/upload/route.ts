import { enforceMobileRateLimit, requireMobileAuth } from "@/lib/mobile-api/auth";
import {
  asRecord,
  cleanString,
  mobileError,
  mobileJson,
  readMobileJson,
} from "@/lib/mobile-api/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const allowedExtensions = new Set(["3mf", "stl", "step", "stp", "obj", "zip", "pdf", "png", "jpg", "jpeg", "webp"]);

export async function POST(request: Request) {
  try {
    const auth = await requireMobileAuth(request);
    await enforceMobileRateLimit(request, "custom-orders:upload", 15, 3600, auth.user.id);
    const input = asRecord(await readMobileJson(request, 16 * 1024));
    const files = Array.isArray(input?.files) ? input.files.map(asRecord) : [];
    if (files.length < 1 || files.length > 5 || files.some((item) => !item)) {
      return mobileJson({ ok: false, code: "invalid_files" }, 400);
    }
    let totalSize = 0;
    const normalized = files.map((file) => {
      const name = cleanString(file!.name, 255);
      const extension = name.split(".").pop()?.toLowerCase() ?? "";
      const size = Number(file!.size);
      if (!name || !allowedExtensions.has(extension) || !Number.isInteger(size) || size < 1 || size > 100 * 1024 * 1024) return null;
      totalSize += size;
      return { name, extension, size };
    });
    if (normalized.some((item) => !item) || totalSize > 250 * 1024 * 1024) {
      return mobileJson({ ok: false, code: "invalid_files" }, 400);
    }
    const requestId = crypto.randomUUID();
    const paths = normalized.map((file) => `${auth.user.id}/${requestId}/${crypto.randomUUID()}.${file!.extension}`);
    const signed = await Promise.all(paths.map((path) =>
      auth.admin.storage.from("custom-quote-files").createSignedUploadUrl(path),
    ));
    if (signed.some((result) => result.error || !result.data?.token)) {
      return mobileJson({ ok: false, code: "upload_unavailable" }, 503);
    }
    return mobileJson({
      ok: true,
      data: {
        requestId,
        uploads: signed.map((result, index) => ({
          path: paths[index],
          token: result.data!.token,
        })),
      },
    });
  } catch (error) {
    return mobileError(error);
  }
}
