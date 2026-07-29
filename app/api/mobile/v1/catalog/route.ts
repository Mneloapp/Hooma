import { getStorefrontCatalogPage } from "@/lib/storefront-catalog";
import { cleanString, mobileError, mobileJson } from "@/lib/mobile-api/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const allowedSorts = new Set(["featured", "popular", "price_asc", "price_desc", "newest"]);

export async function GET(request: Request) {
  try {
    const query = new URL(request.url).searchParams;
    const page = Math.min(500, Math.max(1, Number(query.get("page") ?? 1) || 1));
    const pageSize = Math.min(40, Math.max(1, Number(query.get("pageSize") ?? 20) || 20));
    const requestedSort = cleanString(query.get("sort"), 30);
    const result = await getStorefrontCatalogPage({
      category: cleanString(query.get("category"), 80) || undefined,
      subcategory: cleanString(query.get("subcategory"), 80) || undefined,
      material: cleanString(query.get("material"), 80) || undefined,
      query: cleanString(query.get("q"), 120) || undefined,
      sort: allowedSorts.has(requestedSort) ? requestedSort : "featured",
      page,
      pageSize,
    });
    return mobileJson(
      {
        ok: true,
        data: {
          ...result,
          page,
          pageSize,
          hasMore: page * pageSize < result.totalCount,
        },
      },
      200,
      { "Cache-Control": "public, max-age=30, stale-while-revalidate=120" },
    );
  } catch (error) {
    return mobileError(error);
  }
}
