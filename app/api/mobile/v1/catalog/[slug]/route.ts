import { getStorefrontProductBySlug } from "@/lib/storefront-catalog";
import { cleanString, mobileError, mobileJson } from "@/lib/mobile-api/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  try {
    const slug = cleanString((await context.params).slug, 160);
    if (!/^[a-z0-9-]+$/.test(slug)) {
      return mobileJson({ ok: false, code: "invalid_slug" }, 400);
    }
    const product = await getStorefrontProductBySlug(slug);
    if (!product) return mobileJson({ ok: false, code: "product_not_found" }, 404);
    return mobileJson(
      { ok: true, data: product },
      200,
      { "Cache-Control": "public, max-age=30, stale-while-revalidate=120" },
    );
  } catch (error) {
    return mobileError(error);
  }
}
