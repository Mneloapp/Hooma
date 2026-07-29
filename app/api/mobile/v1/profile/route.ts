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

export async function PATCH(request: Request) {
  try {
    const auth = await requireMobileAuth(request);
    await enforceMobileRateLimit(request, "profile:write", 20, 3600, auth.user.id);
    const input = asRecord(await readMobileJson(request, 8192));
    if (!input) return mobileJson({ ok: false, code: "invalid_request" }, 400);
    const fullName = cleanString(input.fullName, 160);
    const phone = cleanString(input.phone, 60);
    if (!fullName) return mobileJson({ ok: false, code: "full_name_required" }, 400);
    const updatedAt = new Date().toISOString();
    const [{ error: profileError }, { error: customerError }] = await Promise.all([
      auth.admin
        .from("profiles")
        .update({ full_name: fullName, phone, updated_at: updatedAt })
        .eq("id", auth.user.id),
      auth.admin
        .from("customers")
        .update({ full_name: fullName, phone })
        .eq("id", auth.customerId)
        .eq("profile_id", auth.user.id),
    ]);
    if (profileError || customerError) throw profileError ?? customerError;
    await auth.userClient.auth.updateUser({ data: { full_name: fullName, phone } });
    return mobileJson({ ok: true, data: { fullName, phone, updatedAt } });
  } catch (error) {
    return mobileError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await requireMobileAuth(request);
    await enforceMobileRateLimit(request, "profile:delete", 3, 86400, auth.user.id);
    const input = asRecord(await readMobileJson(request, 4096));
    if (!input || input.confirmation !== "DELETE") {
      return mobileJson({ ok: false, code: "deletion_confirmation_required" }, 400);
    }
    const { data, error } = await auth.userClient.rpc("request_account_deletion_v1");
    if (error) throw error;
    return mobileJson({ ok: true, data }, 202);
  } catch (error) {
    return mobileError(error);
  }
}
