import { NextResponse } from "next/server";
import {
  enqueueMobilePushDeliveries,
  enqueueHoomaPlusExpiryNotifications,
  sendPendingMobilePushDeliveries,
} from "@/lib/notifications/expo-push";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const expiryNotifications = await enqueueHoomaPlusExpiryNotifications();
  const enqueued = await enqueueMobilePushDeliveries();
  const delivery = await sendPendingMobilePushDeliveries();
  return NextResponse.json({ ok: true, expiryNotifications, enqueued, ...delivery });
}
