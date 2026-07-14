"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/supabase/server";
import { uuidPattern, workflowErrorMessage } from "@/lib/production/manual-workflow";

const field = (formData: FormData, name: string, max = 240) => String(formData.get(name) ?? "").trim().slice(0, max);

function productionRedirect(kind: "notice" | "error", message: string): never {
  redirect(`/admin/production?${kind}=${encodeURIComponent(message)}`);
}

async function productionContext() {
  const profile = await requirePermission("production.manage");
  if (!profile) redirect("/login?next=/admin/production");
  const admin = createAdminClient() as any;
  if (!admin) productionRedirect("error", "Supabase-ის server კავშირი ჯერ არ არის გამართული.");
  return { profile, admin };
}

function validOperation(formData: FormData) {
  const operationKey = field(formData, "operation_key", 36);
  return uuidPattern.test(operationKey) ? operationKey : null;
}

function refreshProduction() {
  revalidatePath("/admin/orders");
  revalidatePath("/admin/production");
  revalidatePath("/account/orders");
}

export async function assignPrintJobAction(formData: FormData) {
  const { profile, admin } = await productionContext();
  const jobId = field(formData, "job_id", 36);
  const printerId = field(formData, "printer_id", 36);
  const operationKey = validOperation(formData);
  const lockVersion = Number(field(formData, "lock_version", 12));
  if (!uuidPattern.test(jobId) || !uuidPattern.test(printerId) || !operationKey || !Number.isInteger(lockVersion) || lockVersion < 1) {
    productionRedirect("error", "საბეჭდი სამუშაოს მონაცემები არასწორია.");
  }

  const { error } = await admin.rpc("assign_manual_print_job", {
    requested_job_id: jobId,
    requested_printer_id: printerId,
    expected_lock_version: lockVersion,
    actor_profile_id: profile.id,
    operation_key: operationKey,
  });
  if (error) productionRedirect("error", workflowErrorMessage(error));
  refreshProduction();
  productionRedirect("notice", "პრინტერი უსაფრთხოდ დაიჯავშნა. ახლა გაუშვი ფიზიკური ბეჭდვა Bambu Studio-დან.");
}

export async function startPhysicalPrintAction(formData: FormData) {
  const { profile, admin } = await productionContext();
  const jobId = field(formData, "job_id", 36);
  const operationKey = validOperation(formData);
  const lockVersion = Number(field(formData, "lock_version", 12));
  if (!uuidPattern.test(jobId) || !operationKey || !Number.isInteger(lockVersion) || lockVersion < 1) {
    productionRedirect("error", "საბეჭდი სამუშაოს მონაცემები არასწორია.");
  }

  const { error } = await admin.rpc("start_manual_print_job", {
    requested_job_id: jobId,
    expected_lock_version: lockVersion,
    actor_profile_id: profile.id,
    operation_key: operationKey,
  });
  if (error) productionRedirect("error", workflowErrorMessage(error));
  refreshProduction();
  productionRedirect("notice", "ფიზიკური ბეჭდვის დაწყება დაფიქსირდა.");
}

export async function releasePrintAssignmentAction(formData: FormData) {
  const { profile, admin } = await productionContext();
  const jobId = field(formData, "job_id", 36);
  const operationKey = validOperation(formData);
  const lockVersion = Number(field(formData, "lock_version", 12));
  const reason = field(formData, "release_reason", 500);
  if (!uuidPattern.test(jobId) || !operationKey || !Number.isInteger(lockVersion) || lockVersion < 1 || !reason) {
    productionRedirect("error", "მიუთითე პრინტერის გათავისუფლების მიზეზი.");
  }

  const { error } = await admin.rpc("release_manual_print_assignment", {
    requested_job_id: jobId,
    expected_lock_version: lockVersion,
    requested_reason: reason,
    actor_profile_id: profile.id,
    operation_key: operationKey,
  });
  if (error) productionRedirect("error", workflowErrorMessage(error));
  refreshProduction();
  productionRedirect("notice", "პრინტერის ჯავშანი მოიხსნა და სამუშაო დაბრუნდა რიგში.");
}

export async function completePrintJobAction(formData: FormData) {
  const { profile, admin } = await productionContext();
  const jobId = field(formData, "job_id", 36);
  const operationKey = validOperation(formData);
  const lockVersion = Number(field(formData, "lock_version", 12));
  if (!uuidPattern.test(jobId) || !operationKey || !Number.isInteger(lockVersion) || lockVersion < 1) {
    productionRedirect("error", "საბეჭდი სამუშაოს მონაცემები არასწორია.");
  }

  const { error } = await admin.rpc("complete_manual_print_job", {
    requested_job_id: jobId,
    expected_lock_version: lockVersion,
    actor_profile_id: profile.id,
    operation_key: operationKey,
  });
  if (error) productionRedirect("error", workflowErrorMessage(error));
  refreshProduction();
  productionRedirect("notice", "ბეჭდვის დასრულება დაფიქსირდა.");
}

export async function failPrintJobAction(formData: FormData) {
  const { profile, admin } = await productionContext();
  const jobId = field(formData, "job_id", 36);
  const operationKey = validOperation(formData);
  const lockVersion = Number(field(formData, "lock_version", 12));
  const failureReason = field(formData, "failure_reason", 500);
  if (!uuidPattern.test(jobId) || !operationKey || !Number.isInteger(lockVersion) || lockVersion < 1 || !failureReason) {
    productionRedirect("error", "მიუთითე ბეჭდვის წარუმატებლობის მიზეზი.");
  }

  const { error } = await admin.rpc("fail_manual_print_job", {
    requested_job_id: jobId,
    expected_lock_version: lockVersion,
    requested_failure_reason: failureReason,
    actor_profile_id: profile.id,
    operation_key: operationKey,
  });
  if (error) productionRedirect("error", workflowErrorMessage(error));
  refreshProduction();
  productionRedirect("notice", "წარუმატებელი მცდელობა შენახულია და უსაფრთხო retry სამუშაო შეიქმნა.");
}

export async function approveOrderQcAction(formData: FormData) {
  const { profile, admin } = await productionContext();
  const orderId = field(formData, "order_id", 36);
  const operationKey = validOperation(formData);
  if (!uuidPattern.test(orderId) || !operationKey) productionRedirect("error", "შეკვეთის მონაცემები არასწორია.");

  const { error } = await admin.rpc("approve_manual_order_qc", {
    requested_order_id: orderId,
    actor_profile_id: profile.id,
    operation_key: operationKey,
  });
  if (error) productionRedirect("error", workflowErrorMessage(error));
  refreshProduction();
  productionRedirect("notice", "ხარისხი დადასტურდა — შეკვეთა მზადაა საკურიეროსთვის.");
}

export async function handoffOrderToCourierAction(formData: FormData) {
  const { profile, admin } = await productionContext();
  const orderId = field(formData, "order_id", 36);
  const operationKey = validOperation(formData);
  if (!uuidPattern.test(orderId) || !operationKey) productionRedirect("error", "შეკვეთის მონაცემები არასწორია.");

  const { error } = await admin.rpc("handoff_order_to_courier", {
    requested_order_id: orderId,
    requested_courier_name: field(formData, "courier_name", 120),
    requested_courier_reference: field(formData, "courier_reference", 160),
    actor_profile_id: profile.id,
    operation_key: operationKey,
  });
  if (error) productionRedirect("error", workflowErrorMessage(error));
  refreshProduction();
  productionRedirect("notice", "კურიერზე რეალური გადაცემა დაფიქსირდა.");
}

export async function markOrderDeliveredAction(formData: FormData) {
  const { profile, admin } = await productionContext();
  const orderId = field(formData, "order_id", 36);
  const operationKey = validOperation(formData);
  if (!uuidPattern.test(orderId) || !operationKey) productionRedirect("error", "შეკვეთის მონაცემები არასწორია.");

  const { error } = await admin.rpc("mark_manual_order_delivered", {
    requested_order_id: orderId,
    actor_profile_id: profile.id,
    operation_key: operationKey,
  });
  if (error) productionRedirect("error", workflowErrorMessage(error));
  refreshProduction();
  productionRedirect("notice", "კურიერის მიწოდების დადასტურება დაფიქსირდა.");
}

export async function registerPrinterAction(formData: FormData) {
  const { profile, admin } = await productionContext();
  const operationKey = validOperation(formData);
  if (!operationKey) productionRedirect("error", "პრინტერის ფორმა განაახლე და თავიდან სცადე.");
  const serialTail = field(formData, "serial_tail", 24).replace(/[^a-z0-9]/gi, "").slice(-4).toUpperCase();

  const { error } = await admin.rpc("register_manual_printer", {
    requested_name: field(formData, "name", 80),
    requested_model: field(formData, "model", 80),
    requested_serial_masked: serialTail ? `••••${serialTail}` : "",
    actor_profile_id: profile.id,
    operation_key: operationKey,
  });
  if (error) productionRedirect("error", workflowErrorMessage(error));
  revalidatePath("/admin/production");
  productionRedirect("notice", "პრინტერი დაემატა და ხელით მართვის რეჟიმში მზადაა.");
}

export async function setPrinterStatusAction(formData: FormData) {
  const { profile, admin } = await productionContext();
  const printerId = field(formData, "printer_id", 36);
  const requestedStatus = field(formData, "status", 20);
  const operationKey = validOperation(formData);
  if (!uuidPattern.test(printerId) || !operationKey || !["idle", "offline", "maintenance"].includes(requestedStatus)) {
    productionRedirect("error", "პრინტერის სტატუსის მონაცემები არასწორია.");
  }

  const { error } = await admin.rpc("set_manual_printer_status", {
    requested_printer_id: printerId,
    requested_status: requestedStatus,
    actor_profile_id: profile.id,
    operation_key: operationKey,
  });
  if (error) productionRedirect("error", workflowErrorMessage(error));
  revalidatePath("/admin/production");
  productionRedirect("notice", "პრინტერის ხელით მითითებული სტატუსი განახლდა.");
}
