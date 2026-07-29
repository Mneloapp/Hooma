import { enforceMobileRateLimit, requireMobileAuth } from "@/lib/mobile-api/auth";
import {
  asRecord,
  mobileError,
  mobileJson,
  readMobileJson,
  uuidPattern,
} from "@/lib/mobile-api/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const auth = await requireMobileAuth(request);
    const { data, error } = await auth.admin
      .from("notifications")
      .select("id,notification_type,title_ka,title_en,body_ka,body_en,href,metadata,read_at,created_at")
      .eq("recipient_profile_id", auth.user.id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return mobileJson({ ok: true, data: data ?? [] });
  } catch (error) {
    return mobileError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await requireMobileAuth(request);
    await enforceMobileRateLimit(request, "notifications:read", 120, 3600, auth.user.id);
    const input = asRecord(await readMobileJson(request, 4096));
    if (!input) return mobileJson({ ok: false, code: "invalid_request" }, 400);
    const now = new Date().toISOString();
    let mutation = auth.admin
      .from("notifications")
      .update({ read_at: now })
      .eq("recipient_profile_id", auth.user.id);
    if (input.all !== true) {
      const id = typeof input.id === "string" ? input.id : "";
      if (!uuidPattern.test(id)) {
        return mobileJson({ ok: false, code: "invalid_notification_id" }, 400);
      }
      mutation = mutation.eq("id", id);
    } else {
      mutation = mutation.is("read_at", null);
    }
    const { error } = await mutation;
    if (error) throw error;
    return mobileJson({ ok: true });
  } catch (error) {
    return mobileError(error);
  }
}
