import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getTbilisiDate } from "@/lib/daily-deals";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient() as any;
  if (!admin) return NextResponse.json({ ok: false, message: "Supabase service role is not configured." }, { status: 503 });

  const date = getTbilisiDate();
  const { data, error } = await admin.rpc("activate_daily_deals", { target_date: date });
  if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, date, selected: data ?? 0 });
}
