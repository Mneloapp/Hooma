"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/supabase/server";
import { uuidPattern, workflowErrorMessage } from "@/lib/production/manual-workflow";

const field = (formData: FormData, name: string) => String(formData.get(name) ?? "").trim();

export async function confirmOrderForProductionAction(formData: FormData) {
  const profile = await requirePermission("production.manage");
  if (!profile) redirect("/login?next=/admin/orders");

  const orderId = field(formData, "order_id");
  const operationKey = field(formData, "operation_key");
  if (!uuidPattern.test(orderId) || !uuidPattern.test(operationKey)) {
    redirect("/admin/orders?error=" + encodeURIComponent("შეკვეთის მონაცემები არასწორია."));
  }

  const admin = createAdminClient() as any;
  if (!admin) redirect("/admin/orders?error=" + encodeURIComponent("Supabase-ის server კავშირი ჯერ არ არის გამართული."));

  const { error } = await admin.rpc("confirm_order_for_manual_production", {
    requested_order_id: orderId,
    actor_profile_id: profile.id,
    operation_key: operationKey,
  });

  if (error) redirect("/admin/orders?error=" + encodeURIComponent(workflowErrorMessage(error)));

  revalidatePath("/admin/orders");
  revalidatePath("/admin/production");
  revalidatePath("/account/orders");
  redirect("/admin/production?notice=" + encodeURIComponent("შეკვეთა დადასტურდა — წარმოების სამუშაოები რიგშია."));
}
