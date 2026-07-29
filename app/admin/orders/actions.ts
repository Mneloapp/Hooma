"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/supabase/server";
import { uuidPattern, workflowErrorMessage } from "@/lib/production/manual-workflow";
import {
  minorToAmount,
  parseBogPaymentDetails,
  sanitizeBogPaymentDetails,
} from "@/lib/payments/bog-core";
import { BogPaymentError, getBogPaymentDetails } from "@/lib/payments/bog";

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

const amountOrNull = (minor: number | null) =>
  minor === null ? null : minorToAmount(minor);

export async function reconcileBogPaymentAction(input: {
  orderId: string;
  operationKey: string;
}): Promise<KanbanMoveResult> {
  const profile = await requirePermission("orders.manage");
  if (!profile) return { ok: false, message: "ამ მოქმედებისთვის შეკვეთების მართვის უფლებაა საჭირო." };
  if (!uuidPattern.test(input.orderId) || !uuidPattern.test(input.operationKey)) {
    return { ok: false, message: "შეკვეთის ან ოპერაციის მონაცემები არასწორია." };
  }

  const admin = createAdminClient() as any;
  if (!admin) return { ok: false, message: "Supabase-ის server კავშირი ჯერ არ არის გამართული." };

  const { data: order } = await admin
    .from("orders")
    .select("id,payment_status,test_mode")
    .eq("id", input.orderId)
    .maybeSingle();
  if (!order || order.test_mode) return { ok: false, message: "რეალური შეკვეთა ვერ მოიძებნა." };
  if (order.payment_status === "refunded") {
    return { ok: true, message: "თანხის დაბრუნების საბოლოო სტატუსი უკვე დაფიქსირებულია." };
  }

  const { data: attempt } = await admin
    .from("payment_attempts")
    .select("id,provider_payment_id")
    .eq("order_id", input.orderId)
    .eq("provider", "bog")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!attempt?.id || !attempt.provider_payment_id) {
    return {
      ok: false,
      message: "BOG payment ID ჯერ არ არის მიღებული. ხელახლა გადახდა არ დაიწყო; დაელოდე callback-ს ან დაუკავშირდი BOG მხარდაჭერას.",
    };
  }

  try {
    const receipt = await getBogPaymentDetails(attempt.provider_payment_id);
    const details = parseBogPaymentDetails(receipt);
    if (
      !details
      || details.orderId !== attempt.provider_payment_id
      || details.externalOrderId !== attempt.id
    ) {
      return { ok: false, message: "BOG receipt-ის იდენტიფიკატორები შეკვეთას არ ემთხვევა. საჭიროა უსაფრთხოების შემოწმება." };
    }

    const { data, error } = await admin.rpc("record_bog_reconciliation_review_v1", {
      actor_profile_id: profile.id,
      operation_key: input.operationKey,
      requested_attempt_id: attempt.id,
      requested_provider_payment_id: details.orderId,
      requested_provider_status: details.status,
      requested_capture: details.capture,
      requested_currency: details.currency,
      requested_request_amount: amountOrNull(details.requestAmountMinor),
      requested_transfer_amount: amountOrNull(details.transferAmountMinor),
      requested_refund_amount: amountOrNull(details.refundAmountMinor),
      requested_payment_method: details.paymentMethod,
      requested_payment_option: details.paymentOption,
      requested_transaction_id: details.transactionId,
      requested_has_split: details.hasSplit,
      requested_safe_payload: sanitizeBogPaymentDetails(details),
    });
    if (error) {
      console.error("BOG_ADMIN_RECONCILIATION_FAILED", { code: error.code ?? null });
      return { ok: false, message: "BOG receipt-ის უსაფრთხო დამუშავება ვერ დასრულდა." };
    }

    refreshOrderWorkflow();
    const result = data && typeof data === "object" ? data as Record<string, unknown> : {};
    if (result.requires_review === true) {
      if (result.hold_active === false) {
        return {
          ok: true,
          message: "ეს receipt შემოწმება უკვე დამუშავებული იყო და შეკვეთის სტატუსი მას შემდეგ შეიცვალა. გვერდი განახლდა — იხელმძღვანელე მიმდინარე სტატუსით.",
        };
      }
      return {
        ok: true,
        message: `BOG სტატუსია „${details.status}“, მაგრამ ხელმოწერილი callback არ მიგვიღია. შეკვეთა შემოწმებაზე შეჩერდა — ხელახლა ნუ გადაახდევინებ და BOG-ს callback-ის გამეორება მოსთხოვე.`,
      };
    }
    return {
      ok: true,
      message: `BOG receipt შემოწმდა: სტატუსია „${details.status}“. გადახდის სტატუსი არ შეცვლილა; ხელმოწერილ callback-ს ველოდებით.`,
    };
  } catch (error) {
    console.error("BOG_ADMIN_RECEIPT_FETCH_FAILED", {
      retryable: error instanceof BogPaymentError ? error.retryable : true,
      status: error instanceof BogPaymentError ? error.status : null,
    });
    return { ok: false, message: "BOG receipt ახლა ვერ წამოვიღეთ. რამდენიმე წუთში ისევ სცადე; ხელახლა გადახდა არ დაიწყო." };
  }
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
