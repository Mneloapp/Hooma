import { processCatalogCheckout, type CatalogCheckoutInput } from "@/lib/commerce/catalog-checkout-service";
import { enforceMobileRateLimit, requireMobileAuth } from "@/lib/mobile-api/auth";
import { asRecord, mobileError, mobileJson, readMobileJson } from "@/lib/mobile-api/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const auth = await requireMobileAuth(request);
    await enforceMobileRateLimit(request, "checkout:create", 15, 3600, auth.user.id);
    const input = asRecord(await readMobileJson(request, 64 * 1024));
    if (!input) return mobileJson({ ok: false, code: "invalid_request" }, 400);
    const result = await processCatalogCheckout(input as CatalogCheckoutInput, {
      admin: auth.admin,
      customerId: auth.customerId,
      user: auth.user,
      channel: "mobile",
    });
    return mobileJson(
      result,
      result.ok ? 200 : result.code === "cart_changed" ? 409 : 400,
    );
  } catch (error) {
    return mobileError(error);
  }
}
