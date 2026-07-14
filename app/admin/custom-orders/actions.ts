"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const getString = (formData: FormData, key: string, max = 2000) => String(formData.get(key) ?? "").trim().slice(0, max);

export async function quoteCustomRequestAction(formData: FormData) {
  const profile = await requirePermission("quotes.manage");
  if (!profile) return;
  const admin = createAdminClient() as any;
  if (!admin) return;

  const requestId = getString(formData, "request_id", 36);
  const quotedPrice = Number(getString(formData, "quoted_price", 32));
  const quotedLeadDays = Number(getString(formData, "quoted_lead_days", 3));
  const quoteNotes = getString(formData, "quote_notes");
  const filesVerified = formData.get("files_verified") === "on";

  if (!requestId || !Number.isFinite(quotedPrice) || quotedPrice < 0 || !Number.isInteger(quotedLeadDays) || quotedLeadDays < 1 || quotedLeadDays > 90 || !filesVerified) return;

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  const { error } = await admin
    .from("custom_quote_requests")
    .update({
      status: "quoted",
      quoted_price: quotedPrice,
      quote_currency: "GEL",
      quoted_lead_days: quotedLeadDays,
      quote_notes: quoteNotes || null,
      quote_expires_at: expiresAt.toISOString(),
      files_verified: true,
      quoted_by: profile.id,
      quoted_at: new Date().toISOString(),
    })
    .eq("id", requestId)
    .in("status", ["submitted", "under_review", "needs_information"]);

  if (!error) {
    await admin.from("audit_log").insert({
      actor_id: profile.id,
      action: "custom_quote_created",
      entity_type: "custom_quote_request",
      entity_id: requestId,
      metadata: { quoted_price: quotedPrice, currency: "GEL", lead_days: quotedLeadDays },
    });
  }

  revalidatePath("/admin/custom-orders");
  revalidatePath("/account/custom-orders");
}
