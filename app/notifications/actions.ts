"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient, getProfile } from "@/lib/supabase/server";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function safeNotificationHref(value: unknown, fallback: string) {
  const href = typeof value === "string" ? value.trim() : "";
  return href.startsWith("/") && !href.startsWith("//") && !href.includes("\\") ? href : fallback;
}

export async function markAllNotificationsReadAction() {
  const profile = await getProfile();
  const supabase = (await createClient()) as any;
  if (!profile || !supabase) redirect("/login?next=/notifications");

  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_profile_id", profile.id)
    .is("read_at", null);

  revalidatePath("/notifications");
}

export async function openNotificationAction(formData: FormData) {
  const profile = await getProfile();
  const supabase = (await createClient()) as any;
  if (!profile || !supabase) redirect("/login?next=/notifications");

  const notificationId = String(formData.get("notification_id") ?? "");
  const fallback = profile.role === "customer" ? "/account/orders" : "/admin/orders";
  if (!uuidPattern.test(notificationId)) redirect(fallback);

  const { data: notification } = await supabase
    .from("notifications")
    .select("id,href")
    .eq("id", notificationId)
    .eq("recipient_profile_id", profile.id)
    .maybeSingle();

  if (!notification?.id) redirect(fallback);

  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", notification.id)
    .eq("recipient_profile_id", profile.id);

  revalidatePath("/notifications");
  redirect(safeNotificationHref(notification.href, fallback));
}
