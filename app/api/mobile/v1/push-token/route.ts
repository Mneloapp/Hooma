import { enforceMobileRateLimit, requireMobileAuth } from "@/lib/mobile-api/auth";
import {
  asRecord,
  cleanOptionalString,
  cleanString,
  mobileError,
  mobileJson,
  readMobileJson,
} from "@/lib/mobile-api/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const tokenPattern = /^(?:Exponent|Expo)PushToken\[[A-Za-z0-9_-]{8,200}\]$/;

export async function POST(request: Request) {
  try {
    const auth = await requireMobileAuth(request);
    await enforceMobileRateLimit(request, "push-token:write", 30, 3600, auth.user.id);
    const input = asRecord(await readMobileJson(request, 8192));
    if (!input) return mobileJson({ ok: false, code: "invalid_request" }, 400);
    const expoPushToken = cleanString(input.expoPushToken, 256);
    const deviceId = cleanString(input.deviceId, 160);
    const platform = input.platform === "ios" || input.platform === "android"
      ? input.platform
      : null;
    const locale = input.locale === "en" ? "en" : "ka";
    if (!tokenPattern.test(expoPushToken) || !deviceId || !platform) {
      return mobileJson({ ok: false, code: "invalid_push_token" }, 400);
    }
    // An Expo token identifies the app installation, not the account. If the
    // device changed accounts, transfer the token only after the new account
    // has authenticated and proved possession by submitting the exact token.
    const { error: transferError } = await auth.admin
      .from("mobile_push_tokens")
      .delete()
      .eq("expo_push_token", expoPushToken)
      .neq("profile_id", auth.user.id);
    if (transferError) throw transferError;
    const { error } = await auth.admin.from("mobile_push_tokens").upsert({
      profile_id: auth.user.id,
      expo_push_token: expoPushToken,
      device_id: deviceId,
      platform,
      app_version: cleanOptionalString(input.appVersion, 40),
      locale,
      enabled: true,
      last_seen_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: "profile_id,device_id" });
    if (error) throw error;
    return mobileJson({ ok: true });
  } catch (error) {
    return mobileError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await requireMobileAuth(request);
    await enforceMobileRateLimit(request, "push-token:delete", 20, 3600, auth.user.id);
    const deviceId = cleanString(new URL(request.url).searchParams.get("deviceId"), 160);
    if (!deviceId) return mobileJson({ ok: false, code: "invalid_device_id" }, 400);
    const { error } = await auth.admin
      .from("mobile_push_tokens")
      .update({ enabled: false, updated_at: new Date().toISOString() })
      .eq("profile_id", auth.user.id)
      .eq("device_id", deviceId);
    if (error) throw error;
    return mobileJson({ ok: true });
  } catch (error) {
    return mobileError(error);
  }
}
