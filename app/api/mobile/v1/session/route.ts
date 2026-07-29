import { requireMobileAuth } from "@/lib/mobile-api/auth";
import { mobileError, mobileJson } from "@/lib/mobile-api/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const auth = await requireMobileAuth(request);
    return mobileJson({
      ok: true,
      data: {
        user: {
          id: auth.user.id,
          email: auth.user.email ?? auth.profile.email,
          emailConfirmedAt: auth.user.email_confirmed_at ?? null,
        },
        profile: auth.profile,
        customerId: auth.customerId,
      },
    });
  } catch (error) {
    return mobileError(error);
  }
}
