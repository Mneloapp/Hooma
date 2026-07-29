import { enforceMobileRateLimit, requireMobileAuth } from "@/lib/mobile-api/auth";
import { mobileError, mobileJson, uuidPattern } from "@/lib/mobile-api/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireMobileAuth(request);
    await enforceMobileRateLimit(request, "custom-orders:accept", 10, 3600, auth.user.id);
    const id = (await context.params).id;
    if (!uuidPattern.test(id)) return mobileJson({ ok: false, code: "invalid_request_id" }, 400);
    const { data: owned } = await auth.admin
      .from("custom_quote_requests")
      .select("id,status")
      .eq("id", id)
      .eq("profile_id", auth.user.id)
      .maybeSingle();
    if (!owned || owned.status !== "quoted") {
      return mobileJson({ ok: false, code: "quote_not_available" }, 409);
    }
    const { error } = await (auth.userClient as any).rpc("accept_custom_quote", {
      custom_request_id: id,
    });
    if (error) throw error;
    return mobileJson({ ok: true });
  } catch (error) {
    return mobileError(error);
  }
}
