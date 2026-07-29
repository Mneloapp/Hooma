import { getStorefrontHomeCards } from "@/lib/storefront-catalog";
import { mobileError, mobileJson } from "@/lib/mobile-api/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const sections = await getStorefrontHomeCards(12);
    return mobileJson(
      { ok: true, data: sections },
      200,
      { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" },
    );
  } catch (error) {
    return mobileError(error);
  }
}
