import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

const expoPushEndpoint = "https://exp.host/--/api/v2/push/send";

type PushDeliveryRow = {
  id: string;
  notification_id: string;
  attempt_count: number;
  notifications: {
    title_ka: string;
    body_ka: string;
    href: string;
    metadata: Record<string, unknown>;
  } | Array<{
    title_ka: string;
    body_ka: string;
    href: string;
    metadata: Record<string, unknown>;
  }>;
  mobile_push_tokens: {
    id: string;
    expo_push_token: string;
    locale: "ka" | "en";
  } | Array<{
    id: string;
    expo_push_token: string;
    locale: "ka" | "en";
  }>;
};

export async function enqueueHoomaPlusExpiryNotifications() {
  const admin = createAdminClient() as any;
  if (!admin) return 0;
  const now = new Date();
  const warningEnd = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const { data: periods } = await admin
    .from("hooma_plus_periods")
    .select("id,customer_id,ends_at,customers!inner(profile_id)")
    .eq("status", "active")
    .gt("ends_at", now.toISOString())
    .lte("ends_at", warningEnd.toISOString())
    .limit(500);
  const rows = (periods ?? []).map((period: any) => {
    const customer = Array.isArray(period.customers) ? period.customers[0] : period.customers;
    const day = String(period.ends_at).slice(0, 10);
    return {
      recipient_profile_id: customer.profile_id,
      notification_type: "customer_hooma_plus_expiring",
      title_ka: "Hooma+ ვადა იწურება",
      title_en: "Your Hooma+ membership is expiring",
      body_ka: `წევრობა მოქმედებს ${day}-მდე. განახლება ავტომატურად არ მოხდება.`,
      body_en: `Membership is active until ${day}. It will not renew automatically.`,
      href: "/account/hooma-plus",
      metadata: { hooma_plus_period_id: period.id, ends_at: period.ends_at },
      dedupe_key: `customer:hooma_plus_expiring:${period.id}:${day}`,
    };
  });
  if (!rows.length) return 0;
  const { error } = await admin
    .from("notifications")
    .upsert(rows, { onConflict: "dedupe_key", ignoreDuplicates: true });
  return error ? 0 : rows.length;
}

export async function enqueueMobilePushDeliveries() {
  const admin = createAdminClient() as any;
  if (!admin) return 0;
  const { data: notifications } = await admin
    .from("notifications")
    .select("id,recipient_profile_id")
    .gte("created_at", new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString())
    .order("created_at")
    .limit(500);
  if (!notifications?.length) return 0;
  const profileIds = Array.from(new Set(notifications.map((item: any) => item.recipient_profile_id)));
  const { data: tokens } = await admin
    .from("mobile_push_tokens")
    .select("id,profile_id")
    .in("profile_id", profileIds)
    .eq("enabled", true);
  const tokenIdsByProfile = new Map<string, string[]>();
  for (const token of tokens ?? []) {
    tokenIdsByProfile.set(token.profile_id, [...(tokenIdsByProfile.get(token.profile_id) ?? []), token.id]);
  }
  const rows = notifications.flatMap((notification: any) =>
    (tokenIdsByProfile.get(notification.recipient_profile_id) ?? []).map((pushTokenId) => ({
      notification_id: notification.id,
      push_token_id: pushTokenId,
    })),
  );
  if (!rows.length) return 0;
  const { error } = await admin
    .from("mobile_push_deliveries")
    .upsert(rows, { onConflict: "notification_id,push_token_id", ignoreDuplicates: true });
  return error ? 0 : rows.length;
}

export async function sendPendingMobilePushDeliveries() {
  const admin = createAdminClient() as any;
  if (!admin) return { attempted: 0, sent: 0 };
  const { data } = await admin
    .from("mobile_push_deliveries")
    .select("id,notification_id,attempt_count,notifications(title_ka,title_en,body_ka,body_en,href,metadata),mobile_push_tokens(id,expo_push_token,locale)")
    .in("status", ["pending", "retry"])
    .lte("next_attempt_at", new Date().toISOString())
    .order("next_attempt_at")
    .limit(100);
  const rows = (data ?? []) as PushDeliveryRow[];
  if (!rows.length) return { attempted: 0, sent: 0 };

  const messages = rows.map((row) => {
    const notification: any = Array.isArray(row.notifications) ? row.notifications[0] : row.notifications;
    const token: any = Array.isArray(row.mobile_push_tokens) ? row.mobile_push_tokens[0] : row.mobile_push_tokens;
    return {
      to: token.expo_push_token,
      sound: "default",
      title: token.locale === "en" ? notification.title_en : notification.title_ka,
      body: token.locale === "en" ? notification.body_en : notification.body_ka,
      data: { ...(notification.metadata ?? {}), href: notification.href },
      channelId: "orders",
    };
  });
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };
  if (process.env.EXPO_ACCESS_TOKEN?.trim()) {
    headers.Authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN.trim()}`;
  }
  let response: Response;
  try {
    response = await fetch(expoPushEndpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(messages),
      signal: AbortSignal.timeout(12_000),
    });
  } catch {
    const next = new Date(Date.now() + 5 * 60_000).toISOString();
    await admin.from("mobile_push_deliveries").update({
      status: "retry",
      next_attempt_at: next,
      last_attempt_at: new Date().toISOString(),
    }).in("id", rows.map((row) => row.id));
    return { attempted: rows.length, sent: 0 };
  }
  const payload = await response.json().catch(() => null) as { data?: Array<Record<string, any>> } | null;
  let sent = 0;
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]!;
    const ticket = payload?.data?.[index];
    const ok = response.ok && ticket?.status === "ok";
    const errorCode = typeof ticket?.details?.error === "string" ? ticket.details.error : null;
    if (ok) sent += 1;
    await admin.from("mobile_push_deliveries").update({
      status: ok ? "sent" : row.attempt_count >= 4 ? "failed" : "retry",
      attempt_count: row.attempt_count + 1,
      expo_ticket_id: typeof ticket?.id === "string" ? ticket.id : null,
      error_code: errorCode,
      next_attempt_at: new Date(Date.now() + 5 * 60_000).toISOString(),
      last_attempt_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", row.id);
    if (errorCode === "DeviceNotRegistered") {
      const token: any = Array.isArray(row.mobile_push_tokens) ? row.mobile_push_tokens[0] : row.mobile_push_tokens;
      if (token?.id) await admin.from("mobile_push_tokens").update({ enabled: false }).eq("id", token.id);
    }
  }
  return { attempted: rows.length, sent };
}
