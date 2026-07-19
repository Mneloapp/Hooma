"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/supabase/server";
import { uuidPattern, workflowErrorMessage } from "@/lib/production/manual-workflow";

const field = (formData: FormData, name: string) => String(formData.get(name) ?? "").trim();

export type KanbanMoveInput = {
  orderId: string;
  targetStatus: "production_queued" | "ready_for_delivery" | "out_for_delivery" | "delivered";
  operationKey: string;
  courierName?: string;
  courierReference?: string;
};

export type KanbanMoveResult = { ok: boolean; message: string };

function refreshOrderWorkflow() {
  revalidatePath("/admin/orders");
  revalidatePath("/admin/production");
  revalidatePath("/account/orders");
}

export async function moveOrderKanbanAction(input: KanbanMoveInput): Promise<KanbanMoveResult> {
  const profile = await requirePermission("production.manage");
  if (!profile) return { ok: false, message: "ამ მოქმედებისთვის წარმოების ოპერატორის უფლებაა საჭირო." };
  if (!uuidPattern.test(input.orderId) || !uuidPattern.test(input.operationKey)) {
    return { ok: false, message: "შეკვეთის ან ოპერაციის მონაცემები არასწორია." };
  }

  const admin = createAdminClient() as any;
  if (!admin) return { ok: false, message: "Supabase-ის server კავშირი ჯერ არ არის გამართული." };
  const { data: order, error: readError } = await admin
    .from("orders")
    .select("id,fulfillment_status,payment_status,test_mode")
    .eq("id", input.orderId)
    .maybeSingle();
  if (readError || !order) return { ok: false, message: "შეკვეთა ვერ მოიძებნა ან უკვე შეიცვალა." };

  const allowedFrom: Record<KanbanMoveInput["targetStatus"], string[]> = {
    production_queued: ["order_received", "confirmed"],
    ready_for_delivery: ["quality_check"],
    out_for_delivery: ["ready_for_delivery"],
    delivered: ["out_for_delivery"],
  };
  if (!allowedFrom[input.targetStatus].includes(order.fulfillment_status)) {
    return { ok: false, message: "ბარათი ამ ეტაპზე პირდაპირ ვერ გადავა. გვერდი განაახლე და გადაამოწმე წარმოების რეალური მდგომარეობა." };
  }
  if (input.targetStatus === "production_queued" && !order.test_mode && order.payment_status !== "paid") {
    return { ok: false, message: "რეალური შეკვეთა გადახდის დადასტურებამდე წარმოებაში ვერ გადავა." };
  }

  let rpcName = "";
  let rpcArgs: Record<string, unknown> = {
    requested_order_id: input.orderId,
    actor_profile_id: profile.id,
    operation_key: input.operationKey,
  };
  let successMessage = "სტატუსი განახლდა.";
  if (input.targetStatus === "production_queued") {
    rpcName = "confirm_order_for_manual_production";
    successMessage = "შეკვეთა დადასტურდა და წარმოების სამუშაოები შეიქმნა.";
  } else if (input.targetStatus === "ready_for_delivery") {
    rpcName = "approve_manual_order_qc";
    successMessage = "ხარისხის კონტროლი დადასტურდა — შეკვეთა მზადაა საკურიეროსთვის.";
  } else if (input.targetStatus === "out_for_delivery") {
    rpcName = "handoff_order_to_courier";
    rpcArgs = {
      ...rpcArgs,
      requested_courier_name: String(input.courierName ?? "").trim().slice(0, 120),
      requested_courier_reference: String(input.courierReference ?? "").trim().slice(0, 160),
    };
    successMessage = "კურიერზე რეალური გადაცემა დაფიქსირდა.";
  } else {
    rpcName = "mark_manual_order_delivered";
    successMessage = "მიწოდება დადასტურდა და შეკვეთა დასრულდა.";
  }

  const { error } = await admin.rpc(rpcName, rpcArgs);
  if (error) return { ok: false, message: workflowErrorMessage(error) };
  refreshOrderWorkflow();
  return { ok: true, message: successMessage };
}

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

  refreshOrderWorkflow();
  redirect("/admin/production?notice=" + encodeURIComponent("შეკვეთა დადასტურდა — წარმოების სამუშაოები რიგშია."));
}
