"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/supabase/server";
import { uuidPattern } from "@/lib/production/manual-workflow";

const textField = (formData: FormData, name: string, max = 1000) => String(formData.get(name) ?? "").trim().slice(0, max);

function numberField(formData: FormData, name: string, min: number, max: number, fallback?: number) {
  const raw = textField(formData, name, 80);
  if (!raw && fallback !== undefined) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < min || value > max) throw new Error(`HR_INVALID_${name.toUpperCase()}`);
  return value;
}

function dateField(formData: FormData, name: string) {
  const value = textField(formData, name, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(new Date(`${value}T12:00:00Z`).valueOf())) throw new Error("HR_INVALID_DATE");
  return value;
}

function optionalLocalTimestamp(formData: FormData, name: string) {
  const value = textField(formData, name, 16);
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) || Number.isNaN(new Date(`${value}:00+04:00`).valueOf())) throw new Error("HR_INVALID_CLOCK_TIME");
  return `${value}:00+04:00`;
}

function operationKey(formData: FormData) {
  const value = textField(formData, "operation_key", 36);
  if (!uuidPattern.test(value)) throw new Error("HR_OPERATION_KEY_REQUIRED");
  return value;
}

function returnPath(formData: FormData) {
  const value = textField(formData, "return_to", 80);
  return value === "/admin" ? "/admin" : "/admin/hr";
}

function hrError(error: unknown) {
  const message = error instanceof Error ? error.message : String((error as { message?: unknown } | null)?.message ?? error ?? "");
  if (message.includes("HR_ALREADY_CLOCKED_IN")) return "დღევანდელი სამუშაო უკვე დაწყებულია.";
  if (message.includes("HR_ALREADY_CLOCKED_OUT")) return "დღევანდელი სამუშაო უკვე დასრულებულია.";
  if (message.includes("HR_NOT_CLOCKED_IN")) return "ჯერ სამუშაო დღის დაწყება დააფიქსირე.";
  if (message.includes("HR_DAY_ALREADY_CLASSIFIED")) return "დღევანდელი დღე უკვე მონიშნულია შვებულებად ან დასვენებად.";
  if (message.includes("HR_LEAVE_OVERLAP")) return "ამ თარიღებზე უკვე არსებობს მიმდინარე ან დამტკიცებული მოთხოვნა.";
  if (message.includes("HR_NO_WORKING_DAYS")) return "არჩეულ პერიოდში სამუშაო დღე არ არის.";
  if (message.includes("HR_DAY_OFF_SINGLE_DATE")) return "Day off მხოლოდ ერთ დღეზე მოითხოვება.";
  if (message.includes("HR_ATTENDANCE_CONFLICT")) return "არჩეულ შვებულებას უკვე დაფიქსირებულ სამუშაო დღესთან აქვს კონფლიქტი.";
  if (message.includes("HR_BREAK_EXCEEDS_SHIFT")) return "შესვენების დრო სამუშაო დღის გასულ ხანგრძლივობას აჭარბებს.";
  if (message.includes("HR_CLOCK_IN_REQUIRED")) return "სამუშაო/დისტანციური სტატუსისთვის დაწყების დრო აუცილებელია.";
  if (message.includes("HR_CLOCK_DATE_MISMATCH")) return "დაწყების დრო და სამუშაო თარიღი ერთმანეთს არ ემთხვევა.";
  if (message.includes("HR_LEAVE_NOT_PENDING")) return "მოთხოვნა უკვე დამუშავებულია.";
  if (message.includes("HR_LEAVE_NOT_REVIEWABLE")) return "ამ მოთხოვნის არჩეული ცვლილება უკვე აღარ შეიძლება.";
  if (message.includes("HR_LEAVE_NOT_CANCELLABLE")) return "მხოლოდ მოლოდინში მყოფი საკუთარი მოთხოვნის გაუქმებაა შესაძლებელი.";
  if (message.includes("HR_MANAGE_FORBIDDEN") || message.includes("HR_FORBIDDEN")) return "ამ HR მოქმედებისთვის შესაბამისი უფლება არ გაქვს.";
  if (message.includes("HR_SELF_REVIEW_FORBIDDEN")) return "ადმინისტრატორი საკუთარ მოთხოვნას ვერ დაადასტურებს — საჭიროა Owner-ის გადაწყვეტილება.";
  if (message.includes("HR_SELF_MANAGEMENT_FORBIDDEN")) return "Admin საკუთარ დასწრებას ან HR პირობებს ვერ შეცვლის — საჭიროა Owner.";
  if (message.includes("HR_OWNER_PROTECTED")) return "Owner-ის HR პროფილის შეცვლა მხოლოდ Owner-ს შეუძლია.";
  if (message.includes("HR_OWNER_MUST_REMAIN_ACTIVE")) return "Owner-ის HR პროფილი აქტიური უნდა დარჩეს.";
  if (message.includes("duplicate key") && message.includes("employee_number")) return "თანამშრომლის ეს ნომერი უკვე გამოყენებულია.";
  if (message.includes("schema cache") || message.includes("Could not find the function") || message.includes("does not exist")) return "HR migration ჯერ არ არის გაშვებული Supabase-ზე.";
  return "HR ჩანაწერის შენახვა ვერ დასრულდა. შეამოწმე მონაცემები და სცადე თავიდან.";
}

function finish(path: string, kind: "notice" | "error", message: string): never {
  redirect(`${path}?${kind}=${encodeURIComponent(message)}`);
}

function refreshHr() {
  revalidatePath("/admin");
  revalidatePath("/admin/hr");
  revalidatePath("/admin/team");
}

export async function clockInAction(formData: FormData) {
  const path = returnPath(formData);
  const actor = await requirePermission("hr.self");
  if (!actor) redirect(`/login?next=${encodeURIComponent(path)}`);
  const admin = createAdminClient() as any;
  if (!admin) finish(path, "error", "Supabase-ის server კავშირი ჯერ არ არის გამართული.");
  try {
    const mode = textField(formData, "mode", 20);
    const { error } = await admin.rpc("hr_clock_in", {
      requested_mode: mode,
      actor_profile_id: actor.id,
      operation_key: operationKey(formData),
    });
    if (error) throw error;
  } catch (error) {
    finish(path, "error", hrError(error));
  }
  refreshHr();
  finish(path, "notice", "სამუშაო დღის დაწყება დაფიქსირდა.");
}

export async function clockOutAction(formData: FormData) {
  const path = returnPath(formData);
  const actor = await requirePermission("hr.self");
  if (!actor) redirect(`/login?next=${encodeURIComponent(path)}`);
  const admin = createAdminClient() as any;
  if (!admin) finish(path, "error", "Supabase-ის server კავშირი ჯერ არ არის გამართული.");
  try {
    const { error } = await admin.rpc("hr_clock_out", {
      requested_break_minutes: numberField(formData, "break_minutes", 0, 720, 0),
      actor_profile_id: actor.id,
      operation_key: operationKey(formData),
    });
    if (error) throw error;
  } catch (error) {
    finish(path, "error", hrError(error));
  }
  refreshHr();
  finish(path, "notice", "სამუშაო დღის დასრულება და ნამუშევარი დრო შენახულია.");
}

export async function requestLeaveAction(formData: FormData) {
  const path = returnPath(formData);
  const actor = await requirePermission("hr.self");
  if (!actor) redirect(`/login?next=${encodeURIComponent(path)}`);
  const admin = createAdminClient() as any;
  if (!admin) finish(path, "error", "Supabase-ის server კავშირი ჯერ არ არის გამართული.");
  try {
    const { error } = await admin.rpc("hr_request_leave", {
      requested_type: textField(formData, "leave_type", 30),
      requested_start: dateField(formData, "start_date"),
      requested_end: dateField(formData, "end_date"),
      requested_reason: textField(formData, "reason", 1000),
      actor_profile_id: actor.id,
      operation_key: operationKey(formData),
    });
    if (error) throw error;
  } catch (error) {
    finish(path, "error", hrError(error));
  }
  refreshHr();
  finish(path, "notice", "მოთხოვნა გაიგზავნა Owner/Admin-ის დასადასტურებლად.");
}

export async function correctAttendanceAction(formData: FormData) {
  const actor = await requirePermission("hr.manage");
  if (!actor) redirect("/login?next=/admin/hr");
  const admin = createAdminClient() as any;
  if (!admin) finish("/admin/hr", "error", "Supabase-ის server კავშირი ჯერ არ არის გამართული.");
  try {
    const profileId = textField(formData, "profile_id", 36);
    if (!uuidPattern.test(profileId)) throw new Error("HR_INVALID_PROFILE_ID");
    const { error } = await admin.rpc("hr_correct_attendance", {
      requested_profile_id: profileId,
      requested_work_date: dateField(formData, "work_date"),
      requested_status: textField(formData, "attendance_status", 30),
      requested_clock_in: optionalLocalTimestamp(formData, "clock_in_at"),
      requested_clock_out: optionalLocalTimestamp(formData, "clock_out_at"),
      requested_break_minutes: numberField(formData, "break_minutes", 0, 720, 0),
      requested_notes: textField(formData, "notes", 1000),
      actor_profile_id: actor.id,
      operation_key: operationKey(formData),
    });
    if (error) throw error;
  } catch (error) {
    finish("/admin/hr", "error", hrError(error));
  }
  refreshHr();
  finish("/admin/hr", "notice", "დასწრების შესწორება Audit log-ში დაფიქსირდა.");
}

export async function cancelLeaveAction(formData: FormData) {
  const path = returnPath(formData);
  const actor = await requirePermission("hr.self");
  if (!actor) redirect(`/login?next=${encodeURIComponent(path)}`);
  const admin = createAdminClient() as any;
  if (!admin) finish(path, "error", "Supabase-ის server კავშირი ჯერ არ არის გამართული.");
  try {
    const leaveId = textField(formData, "leave_id", 36);
    if (!uuidPattern.test(leaveId)) throw new Error("HR_INVALID_LEAVE_ID");
    const { error } = await admin.rpc("hr_cancel_leave", {
      requested_leave_id: leaveId,
      actor_profile_id: actor.id,
      operation_key: operationKey(formData),
    });
    if (error) throw error;
  } catch (error) {
    finish(path, "error", hrError(error));
  }
  refreshHr();
  finish(path, "notice", "მოთხოვნა გაუქმდა.");
}

export async function reviewLeaveAction(formData: FormData) {
  const actor = await requirePermission("hr.manage");
  if (!actor) redirect("/login?next=/admin/hr");
  const admin = createAdminClient() as any;
  if (!admin) finish("/admin/hr", "error", "Supabase-ის server კავშირი ჯერ არ არის გამართული.");
  try {
    const leaveId = textField(formData, "leave_id", 36);
    if (!uuidPattern.test(leaveId)) throw new Error("HR_INVALID_LEAVE_ID");
    const { error } = await admin.rpc("hr_review_leave", {
      requested_leave_id: leaveId,
      requested_decision: textField(formData, "decision", 20),
      requested_notes: textField(formData, "review_notes", 1000),
      actor_profile_id: actor.id,
      operation_key: operationKey(formData),
    });
    if (error) throw error;
  } catch (error) {
    finish("/admin/hr", "error", hrError(error));
  }
  refreshHr();
  finish("/admin/hr", "notice", "შვებულების მოთხოვნის გადაწყვეტილება შენახულია.");
}

export async function updateEmploymentAction(formData: FormData) {
  const actor = await requirePermission("hr.manage");
  if (!actor) redirect("/login?next=/admin/hr");
  const admin = createAdminClient() as any;
  if (!admin) finish("/admin/hr", "error", "Supabase-ის server კავშირი ჯერ არ არის გამართული.");
  try {
    const profileId = textField(formData, "profile_id", 36);
    const managerId = textField(formData, "manager_profile_id", 36);
    if (!uuidPattern.test(profileId) || (managerId && !uuidPattern.test(managerId))) throw new Error("HR_INVALID_PROFILE_ID");
    const workWeek = [...new Set(formData.getAll("work_week").map(Number).filter((day) => Number.isInteger(day) && day >= 1 && day <= 7))];
    if (!workWeek.length) throw new Error("HR_INVALID_WORK_WEEK");
    const startTime = textField(formData, "workday_start_local", 8);
    if (!/^\d{2}:\d{2}$/.test(startTime)) throw new Error("HR_INVALID_WORKDAY_START");
    const { error } = await admin.rpc("hr_update_employment", {
      requested_profile_id: profileId,
      requested_employee_number: textField(formData, "employee_number", 40),
      requested_job_title: textField(formData, "job_title", 160),
      requested_department: textField(formData, "department", 160),
      requested_manager_id: managerId || null,
      requested_hire_date: dateField(formData, "hire_date"),
      requested_status: textField(formData, "employment_status", 30),
      requested_work_week: workWeek,
      requested_workday_start: startTime,
      requested_standard_minutes: numberField(formData, "standard_workday_minutes", 1, 1440),
      requested_grace_minutes: numberField(formData, "late_grace_minutes", 0, 240),
      requested_leave_days: numberField(formData, "annual_paid_leave_days", 0, 366),
      actor_profile_id: actor.id,
      operation_key: operationKey(formData),
    });
    if (error) throw error;
  } catch (error) {
    finish("/admin/hr", "error", hrError(error));
  }
  refreshHr();
  finish("/admin/hr", "notice", "თანამშრომლის HR პროფილი განახლდა.");
}

export async function setCalendarDayAction(formData: FormData) {
  const actor = await requirePermission("hr.manage");
  if (!actor) redirect("/login?next=/admin/hr");
  const admin = createAdminClient() as any;
  if (!admin) finish("/admin/hr", "error", "Supabase-ის server კავშირი ჯერ არ არის გამართული.");
  try {
    const { error } = await admin.rpc("hr_set_calendar_day", {
      requested_date: dateField(formData, "calendar_date"),
      requested_is_working: textField(formData, "is_working_day", 10) === "true",
      requested_name_ka: textField(formData, "name_ka", 160),
      requested_name_en: textField(formData, "name_en", 160),
      actor_profile_id: actor.id,
      operation_key: operationKey(formData),
    });
    if (error) throw error;
  } catch (error) {
    finish("/admin/hr", "error", hrError(error));
  }
  refreshHr();
  finish("/admin/hr", "notice", "სამუშაო კალენდრის გამონაკლისი შენახულია.");
}
