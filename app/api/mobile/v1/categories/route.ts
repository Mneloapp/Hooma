import { catalogCategories } from "@/data/catalog";
import { mobileJson } from "@/lib/mobile-api/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET() {
  return mobileJson(
    {
      ok: true,
      data: catalogCategories.map((category) => ({
        slug: category.slug,
        name: category.name,
        nameKa: category.nameKa,
        description: category.description,
        subcategories: category.subcategories,
      })),
    },
    200,
    { "Cache-Control": "public, max-age=300, stale-while-revalidate=1800" },
  );
}
