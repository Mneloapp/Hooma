import "server-only";

import { createHash } from "node:crypto";
import { createClient, type User } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  isSupabaseConfigured,
  supabasePublishableKey,
  supabaseUrl,
} from "@/lib/supabase/config";
import { MobileApiError } from "./http";
import { readBearerToken } from "./security";

export type MobileAuthContext = {
  accessToken: string;
  user: User;
  profile: {
    id: string;
    email: string | null;
    full_name: string | null;
    phone: string | null;
    role: string;
    is_active: boolean;
  };
  customerId: string;
  userClient: ReturnType<typeof createClient<any>>;
  admin: NonNullable<ReturnType<typeof createAdminClient>>;
};

export async function requireMobileAuth(request: Request): Promise<MobileAuthContext> {
  if (!isSupabaseConfigured()) throw new MobileApiError("service_unavailable", 503);
  const accessToken = readBearerToken(request);
  if (!accessToken || accessToken.length > 8192) {
    throw new MobileApiError("authentication_required", 401);
  }

  const userClient = createClient(supabaseUrl, supabasePublishableKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
  const { data, error } = await userClient.auth.getUser(accessToken);
  if (error || !data.user) throw new MobileApiError("invalid_access_token", 401);

  const admin = createAdminClient();
  if (!admin) throw new MobileApiError("service_unavailable", 503);
  const [{ data: profile }, { data: customer }] = await Promise.all([
    admin
      .from("profiles")
      .select("id,email,full_name,phone,role,is_active")
      .eq("id", data.user.id)
      .maybeSingle(),
    admin
      .from("customers")
      .select("id,profile_id")
      .eq("profile_id", data.user.id)
      .limit(1)
      .maybeSingle(),
  ]);

  if (!profile?.id || profile.is_active !== true) {
    throw new MobileApiError("account_unavailable", 403);
  }
  if (!customer?.id || customer.profile_id !== data.user.id) {
    throw new MobileApiError("customer_profile_missing", 409);
  }

  return {
    accessToken,
    user: data.user,
    profile,
    customerId: customer.id,
    userClient,
    admin,
  };
}

export function mobileRateLimitSubject(request: Request, userId?: string) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const source = userId || forwarded || request.headers.get("x-real-ip") || "unknown";
  return createHash("sha256").update(`hooma-mobile:${source}`).digest("hex");
}

export async function enforceMobileRateLimit(
  request: Request,
  routeKey: string,
  limit: number,
  windowSeconds: number,
  userId?: string,
) {
  const admin = createAdminClient() as any;
  if (!admin) throw new MobileApiError("service_unavailable", 503);
  const { data, error } = await admin.rpc("consume_mobile_api_rate_limit_v1", {
    requested_subject_hash: mobileRateLimitSubject(request, userId),
    requested_route_key: routeKey,
    requested_limit: limit,
    requested_window_seconds: windowSeconds,
  });
  if (error) {
    // The migration may not yet be deployed. Mutation routes fail closed.
    throw new MobileApiError("rate_limit_unavailable", 503);
  }
  const result = data && typeof data === "object" ? data as Record<string, unknown> : {};
  if (result.allowed !== true) {
    throw new MobileApiError(
      "rate_limited",
      429,
      Math.max(1, Number(result.retry_after_seconds ?? windowSeconds)),
    );
  }
}
