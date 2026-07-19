import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { Profile } from "@/lib/supabase/types";

export type HrEmployment = {
  profile_id: string;
  employee_number: string;
  job_title: string | null;
  department: string | null;
  manager_profile_id: string | null;
  hire_date: string;
  employment_status: "active" | "on_leave" | "terminated";
  work_week: number[];
  workday_start_local: string;
  standard_workday_minutes: number;
  late_grace_minutes: number;
  annual_paid_leave_days: number | string;
};

type HrEmploymentTerms = {
  profile_id: string;
  effective_from: string;
  employment_status: "active" | "on_leave" | "terminated";
  work_week: number[];
  workday_start_local: string;
  standard_workday_minutes: number;
  late_grace_minutes: number;
};

export type HrAttendance = {
  id: string;
  profile_id: string;
  work_date: string;
  clock_in_at: string | null;
  clock_out_at: string | null;
  break_minutes: number;
  status: string;
  source: string;
  notes: string | null;
};

export type HrLeave = {
  id: string;
  profile_id: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  working_days: number | string;
  reason: string | null;
  status: string;
  reviewed_by: string | null;
  review_notes: string | null;
  created_at: string;
};

type ProductionOperation = {
  idempotency_key: string;
  actor_id: string;
  operation_type: string;
  order_id: string | null;
  print_job_id: string | null;
  printer_id: string | null;
  created_at: string;
  completed_at: string;
};

type PrintJobFact = {
  id: string;
  order_item_id: string;
  assigned_operator_id: string | null;
  status: string;
  attempt_number: number;
  estimated_minutes: number | null;
  actual_minutes: number | null;
  started_at: string | null;
  completed_at: string | null;
};

type UsageFact = {
  print_job_id: string;
  usable_grams: number | string;
  waste_grams: number | string;
  total_grams: number | string;
};

type OrderFact = { id: string; promised_at: string | null; test_mode: boolean };
type ReceiptFact = { id: string; received_by: string | null; quantity_kg: number | string; received_at: string | null };
type CalendarDay = { calendar_date: string; is_working_day: boolean; name_ka: string | null };

export type StaffKpi = {
  profile: Profile;
  employment: HrEmployment | null;
  todayAttendance: HrAttendance | null;
  attendanceState: "working" | "finished" | "leave" | "off_schedule" | "inactive" | "not_started";
  scheduledDays: number;
  presentDays: number;
  workedMinutes: number;
  lateDays: number;
  lateMinutes: number;
  approvedPaidLeaveDays: number;
  paidLeaveBalance: number;
  pendingLeaveCount: number;
  ordersTouched: number;
  completedJobs: number;
  failedJobs: number;
  reprintJobs: number;
  assignedKg: number;
  usableKg: number;
  wasteKg: number;
  wasteRate: number | null;
  usageCoverage: { covered: number; total: number };
  supervisedPrintMinutes: number;
  deadline: { onTime: number; eligible: number };
  assignmentFlow: { proceeded: number; resolved: number };
  receivedStockKg: number;
  testOrdersIncluded: number;
};

export type HrDashboardData = {
  setupMissing: boolean;
  loadWarnings: string[];
  monthKey: string;
  monthLabel: string;
  today: string;
  actor: StaffKpi;
  team: StaffKpi[];
  attendance: HrAttendance[];
  leaves: HrLeave[];
  pendingTeamLeaves: Array<HrLeave & { employee: Profile | null }>;
  approvedTeamLeaves: Array<HrLeave & { employee: Profile | null }>;
  calendar: CalendarDay[];
};

const number = (value: number | string | null | undefined) => Number(value ?? 0);
const terminalSuccess = new Set(["completed", "quality_check", "approved"]);
const terminal = new Set(["completed", "quality_check", "approved", "failed"]);

function georgiaParts(date = new Date()) {
  const values = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tbilisi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => values.find((part) => part.type === type)?.value ?? "";
  return { year: Number(get("year")), month: Number(get("month")), day: Number(get("day")) };
}

function isoDate(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function monthBounds() {
  const { year, month, day } = georgiaParts();
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  return {
    today: isoDate(year, month, day),
    monthKey: isoDate(year, month, 1).slice(0, 7),
    startDate: isoDate(year, month, 1),
    nextDate: isoDate(nextYear, nextMonth, 1),
    startIso: `${isoDate(year, month, 1)}T00:00:00+04:00`,
    nextIso: `${isoDate(nextYear, nextMonth, 1)}T00:00:00+04:00`,
    yearStart: `${year}-01-01`,
    yearEnd: `${year}-12-31`,
    monthLabel: new Intl.DateTimeFormat("ka-GE", { month: "long", year: "numeric", timeZone: "Asia/Tbilisi" }).format(new Date(`${isoDate(year, month, 1)}T12:00:00+04:00`)),
  };
}

function daysBetween(start: string, end: string) {
  const cursor = new Date(`${start}T12:00:00Z`);
  const limit = new Date(`${end}T12:00:00Z`);
  const result: string[] = [];
  while (cursor <= limit) {
    result.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return result;
}

function isoWeekday(date: string) {
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  return weekday === 0 ? 7 : weekday;
}

function localClockMinutes(iso: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tbilisi",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

function minutesFromTime(value: string | null | undefined) {
  const [hour, minute] = String(value ?? "09:00").split(":").map(Number);
  return (Number.isFinite(hour) ? hour : 9) * 60 + (Number.isFinite(minute) ? minute : 0);
}

function fallbackEmployment(profile: Profile): HrEmployment {
  return {
    profile_id: profile.id,
    employee_number: `HOO-${profile.id.replaceAll("-", "").slice(0, 8).toUpperCase()}`,
    job_title: null,
    department: null,
    manager_profile_id: null,
    hire_date: profile.created_at.slice(0, 10),
    employment_status: profile.is_active ? "active" : "terminated",
    work_week: [1, 2, 3, 4, 5],
    workday_start_local: "09:00:00",
    standard_workday_minutes: 480,
    late_grace_minutes: 15,
    annual_paid_leave_days: 24,
  };
}

type DataResult<T> = { data: T[]; error: { message?: string } | null };

async function fetchAllPages<T>(queryForRange: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message?: string } | null }>, pageSize = 1000): Promise<DataResult<T>> {
  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const result = await queryForRange(from, from + pageSize - 1);
    if (result.error) return { data: rows, error: result.error };
    const page = result.data ?? [];
    rows.push(...page);
    if (page.length < pageSize) return { data: rows, error: null };
  }
}

async function fetchByIdChunks<T>(ids: string[], queryForChunk: (chunk: string[], from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message?: string } | null }>): Promise<DataResult<T>> {
  const rows: T[] = [];
  for (let index = 0; index < ids.length; index += 200) {
    const chunk = ids.slice(index, index + 200);
    const result = await fetchAllPages<T>((from, to) => queryForChunk(chunk, from, to));
    rows.push(...result.data);
    if (result.error) return { data: rows, error: result.error };
  }
  return { data: rows, error: null };
}

function calculateStaffKpi(input: {
  profile: Profile;
  employment: HrEmployment | null;
  employmentTerms: HrEmploymentTerms[];
  attendance: HrAttendance[];
  leaves: HrLeave[];
  calendar: CalendarDay[];
  operations: ProductionOperation[];
  jobs: PrintJobFact[];
  usages: UsageFact[];
  orders: OrderFact[];
  receipts: ReceiptFact[];
  jobOrderMap: Map<string, string>;
  startDate: string;
  today: string;
  yearStart: string;
  yearEnd: string;
}) {
  const employment = input.employment ?? fallbackEmployment(input.profile);
  const ownAttendance = input.attendance.filter((row) => row.profile_id === input.profile.id);
  const monthAttendance = ownAttendance.filter((row) => row.work_date >= input.startDate && row.work_date <= input.today);
  const ownLeaves = input.leaves.filter((row) => row.profile_id === input.profile.id);
  const calendar = new Map(input.calendar.map((day) => [day.calendar_date, day.is_working_day]));
  const scheduleStart = employment.hire_date > input.startDate ? employment.hire_date : input.startDate;
  const termsHistory = input.employmentTerms.filter((terms) => terms.profile_id === input.profile.id)
    .sort((left, right) => left.effective_from.localeCompare(right.effective_from));
  const currentTerms: HrEmploymentTerms = {
    profile_id: input.profile.id,
    effective_from: employment.hire_date,
    employment_status: employment.employment_status,
    work_week: employment.work_week?.length ? employment.work_week : [1, 2, 3, 4, 5],
    workday_start_local: employment.workday_start_local,
    standard_workday_minutes: employment.standard_workday_minutes,
    late_grace_minutes: employment.late_grace_minutes,
  };
  const termsAt = (targetDate: string) => termsHistory.reduce((selected, terms) => terms.effective_from <= targetDate ? terms : selected, currentTerms);
  const scheduledDates = daysBetween(scheduleStart, input.today).filter((date) => {
    const terms = termsAt(date);
    return terms.employment_status === "active"
      && (calendar.get(date) ?? terms.work_week.includes(isoWeekday(date)));
  });
  const excusedDates = new Set(monthAttendance.filter((row) => ["paid_leave", "unpaid_leave", "sick_leave", "day_off", "excused"].includes(row.status)).map((row) => row.work_date));
  const scheduledDays = scheduledDates.filter((date) => !excusedDates.has(date)).length;
  const present = monthAttendance.filter((row) => ["present", "remote"].includes(row.status) && row.clock_in_at);
  const workedMinutes = present.reduce((sum, row) => {
    if (!row.clock_in_at || !row.clock_out_at) return sum;
    const elapsed = Math.max(0, Math.round((new Date(row.clock_out_at).valueOf() - new Date(row.clock_in_at).valueOf()) / 60_000));
    return sum + Math.max(0, elapsed - number(row.break_minutes));
  }, 0);
  const lateness = present.map((row) => {
    const terms = termsAt(row.work_date);
    return Math.max(0, localClockMinutes(row.clock_in_at!) - minutesFromTime(terms.workday_start_local) - number(terms.late_grace_minutes));
  });

  const jobs = input.jobs.filter((job) => job.assigned_operator_id === input.profile.id && job.completed_at && terminal.has(job.status));
  const successfulJobs = jobs.filter((job) => terminalSuccess.has(job.status));
  const usageByJob = new Map(input.usages.map((usage) => [usage.print_job_id, usage]));
  const ownUsage = jobs.map((job) => usageByJob.get(job.id)).filter((usage): usage is UsageFact => Boolean(usage));
  const totalGrams = ownUsage.reduce((sum, usage) => sum + number(usage.total_grams), 0);
  const usableGrams = ownUsage.reduce((sum, usage) => sum + number(usage.usable_grams), 0);
  const wasteGrams = ownUsage.reduce((sum, usage) => sum + number(usage.waste_grams), 0);
  const operations = input.operations.filter((operation) => operation.actor_id === input.profile.id);
  const resolvedOrderId = (operation: ProductionOperation) => operation.order_id ?? (operation.print_job_id ? input.jobOrderMap.get(operation.print_job_id) ?? null : null);
  const ownJobOrderIds = jobs.map((job) => input.jobOrderMap.get(job.id)).filter((id): id is string => Boolean(id));
  const touchedOrders = new Set([...operations.map(resolvedOrderId).filter((id): id is string => Boolean(id)), ...ownJobOrderIds]);
  const orderMap = new Map(input.orders.map((order) => [order.id, order]));
  const completedByOrder = new Map<string, string>();
  for (const job of successfulJobs) {
    const orderId = input.jobOrderMap.get(job.id);
    if (!orderId || !job.completed_at || !orderMap.get(orderId)?.promised_at) continue;
    const previous = completedByOrder.get(orderId);
    if (!previous || new Date(job.completed_at) > new Date(previous)) completedByOrder.set(orderId, job.completed_at);
  }
  const onTime = [...completedByOrder].filter(([orderId, completedAt]) => new Date(completedAt) <= new Date(orderMap.get(orderId)!.promised_at!)).length;
  const operationOrderIds = operations.map(resolvedOrderId).filter((id): id is string => Boolean(id));
  const testOrdersIncluded = new Set(operationOrderIds.filter((id) => Boolean(orderMap.get(id)?.test_mode))).size;

  const allJobOperations = [...input.operations].sort((a, b) => new Date(a.completed_at).valueOf() - new Date(b.completed_at).valueOf());
  const ownAssignments = allJobOperations.filter((operation) => operation.actor_id === input.profile.id && operation.operation_type === "assign_job" && operation.print_job_id);
  let resolvedAssignments = 0;
  let proceededAssignments = 0;
  for (const assignment of ownAssignments) {
    const next = allJobOperations.find((operation) => operation.print_job_id === assignment.print_job_id
      && new Date(operation.completed_at) > new Date(assignment.completed_at)
      && ["start_job", "release_job"].includes(operation.operation_type));
    if (next) {
      resolvedAssignments += 1;
      if (next.operation_type === "start_job") proceededAssignments += 1;
    }
  }

  const todayAttendance = ownAttendance.find((row) => row.work_date === input.today) ?? null;
  const todayTerms = termsAt(input.today);
  const todayScheduled = todayTerms.employment_status === "active"
    && employment.hire_date <= input.today
    && (calendar.get(input.today) ?? todayTerms.work_week.includes(isoWeekday(input.today)));
  const attendanceState: StaffKpi["attendanceState"] = todayAttendance
    ? todayAttendance.clock_in_at
      ? todayAttendance.clock_out_at ? "finished" : "working"
      : "leave"
    : (!input.profile.is_active || employment.employment_status !== "active") ? "inactive" : todayScheduled ? "not_started" : "off_schedule";
  const approvedPaidLeaveDays = ownAttendance.filter((row) => row.status === "paid_leave"
    && row.work_date >= input.yearStart && row.work_date <= input.yearEnd).length;

  return {
    profile: input.profile,
    employment: input.employment,
    todayAttendance,
    attendanceState,
    scheduledDays,
    presentDays: present.length,
    workedMinutes,
    lateDays: lateness.filter((value) => value > 0).length,
    lateMinutes: lateness.reduce((sum, value) => sum + value, 0),
    approvedPaidLeaveDays,
    paidLeaveBalance: number(employment.annual_paid_leave_days) - approvedPaidLeaveDays,
    pendingLeaveCount: ownLeaves.filter((leave) => leave.status === "pending").length,
    ordersTouched: touchedOrders.size,
    completedJobs: successfulJobs.length,
    failedJobs: jobs.filter((job) => job.status === "failed").length,
    reprintJobs: jobs.filter((job) => number(job.attempt_number) > 1).length,
    assignedKg: totalGrams / 1000,
    usableKg: usableGrams / 1000,
    wasteKg: wasteGrams / 1000,
    wasteRate: totalGrams > 0 ? wasteGrams / totalGrams * 100 : null,
    usageCoverage: { covered: ownUsage.length, total: jobs.length },
    supervisedPrintMinutes: jobs.reduce((sum, job) => {
      if (job.actual_minutes !== null) return sum + number(job.actual_minutes);
      if (job.started_at && job.completed_at) return sum + Math.max(0, Math.round((new Date(job.completed_at).valueOf() - new Date(job.started_at).valueOf()) / 60_000));
      return sum;
    }, 0),
    deadline: { onTime, eligible: completedByOrder.size },
    assignmentFlow: { proceeded: proceededAssignments, resolved: resolvedAssignments },
    receivedStockKg: input.receipts.filter((receipt) => receipt.received_by === input.profile.id).reduce((sum, receipt) => sum + number(receipt.quantity_kg), 0),
    testOrdersIncluded,
  } satisfies StaffKpi;
}

export async function loadHrDashboard(actor: Profile, options: { includeInactive?: boolean } = {}): Promise<HrDashboardData> {
  const bounds = monthBounds();
  const admin = createAdminClient() as any;
  if (!admin) {
    const empty = calculateStaffKpi({ profile: actor, employment: null, employmentTerms: [], attendance: [], leaves: [], calendar: [], operations: [], jobs: [], usages: [], orders: [], receipts: [], jobOrderMap: new Map(), startDate: bounds.startDate, today: bounds.today, yearStart: bounds.yearStart, yearEnd: bounds.yearEnd });
    return { setupMissing: true, loadWarnings: ["Supabase server connection is unavailable."], monthKey: bounds.monthKey, monthLabel: bounds.monthLabel, today: bounds.today, actor: empty, team: [empty], attendance: [], leaves: [], pendingTeamLeaves: [], approvedTeamLeaves: [], calendar: [] };
  }

  const canManage = actor.role === "owner" || actor.role === "admin";
  const staffResult: DataResult<Profile> = canManage
    ? await fetchAllPages<Profile>((from, to) => {
      const query = admin.from("profiles").select("*").neq("role", "customer");
      return (options.includeInactive ? query : query.eq("is_active", true)).order("created_at").order("id").range(from, to);
    })
    : { data: [actor], error: null };
  const staff = (staffResult.data ?? [actor]) as Profile[];
  const staffIds = staff.map((profile) => profile.id);

  const [employmentResult, employmentTermsResult, attendanceResult, leaveResult, calendarResult, operationsResult, jobsResult, receiptsResult] = await Promise.all([
    fetchAllPages<HrEmployment>((from, to) => admin.from("hr_employment_profiles").select("profile_id,employee_number,job_title,department,manager_profile_id,hire_date,employment_status,work_week,workday_start_local,standard_workday_minutes,late_grace_minutes,annual_paid_leave_days").in("profile_id", staffIds).order("profile_id").range(from, to)),
    fetchAllPages<HrEmploymentTerms>((from, to) => admin.from("hr_employment_terms_history").select("profile_id,effective_from,employment_status,work_week,workday_start_local,standard_workday_minutes,late_grace_minutes").in("profile_id", staffIds).lte("effective_from", bounds.today).order("profile_id").order("effective_from").range(from, to)),
    fetchAllPages<HrAttendance>((from, to) => admin.from("hr_attendance_entries").select("id,profile_id,work_date,clock_in_at,clock_out_at,break_minutes,status,source,notes").in("profile_id", staffIds).gte("work_date", bounds.yearStart).lte("work_date", bounds.yearEnd).order("work_date", { ascending: false }).order("id").range(from, to)),
    fetchAllPages<HrLeave>((from, to) => admin.from("hr_leave_requests").select("id,profile_id,leave_type,start_date,end_date,working_days,reason,status,reviewed_by,review_notes,created_at").in("profile_id", staffIds).lte("start_date", bounds.yearEnd).gte("end_date", bounds.yearStart).order("created_at", { ascending: false }).order("id").range(from, to)),
    fetchAllPages<CalendarDay>((from, to) => admin.from("hr_calendar_days").select("calendar_date,is_working_day,name_ka").gte("calendar_date", bounds.yearStart).lte("calendar_date", bounds.yearEnd).order("calendar_date").range(from, to)),
    fetchAllPages<ProductionOperation>((from, to) => admin.from("production_operations").select("idempotency_key,actor_id,operation_type,order_id,print_job_id,printer_id,created_at,completed_at").not("completed_at", "is", null).gte("completed_at", bounds.startIso).lt("completed_at", bounds.nextIso).order("completed_at").order("idempotency_key").range(from, to)),
    fetchAllPages<PrintJobFact>((from, to) => admin.from("print_jobs").select("id,order_item_id,assigned_operator_id,status,attempt_number,estimated_minutes,actual_minutes,started_at,completed_at").in("assigned_operator_id", staffIds).not("completed_at", "is", null).gte("completed_at", bounds.startIso).lt("completed_at", bounds.nextIso).order("completed_at").order("id").range(from, to)),
    fetchAllPages<ReceiptFact>((from, to) => admin.from("erp_material_purchases").select("id,received_by,quantity_kg,received_at").in("received_by", staffIds).not("received_at", "is", null).gte("received_at", bounds.startIso).lt("received_at", bounds.nextIso).order("received_at").order("id").range(from, to)),
  ]);

  const hrResults = [employmentResult, employmentTermsResult, attendanceResult, leaveResult, calendarResult];
  const setupMissing = hrResults.some((result: any) => Boolean(result.error));
  const warnings = [staffResult, employmentResult, employmentTermsResult, attendanceResult, leaveResult, calendarResult, operationsResult, jobsResult, receiptsResult]
    .map((result: any) => result?.error?.message as string | undefined)
    .filter((message): message is string => Boolean(message));
  const jobs = (jobsResult.data ?? []) as PrintJobFact[];
  const jobIds = jobs.map((job) => job.id);
  const usageResult = jobIds.length
    ? await fetchByIdChunks<UsageFact>(jobIds, (chunk, from, to) => admin.from("erp_production_usages").select("print_job_id,usable_grams,waste_grams,total_grams").in("print_job_id", chunk).order("print_job_id").range(from, to))
    : { data: [], error: null };
  const operations = (operationsResult.data ?? []) as ProductionOperation[];
  const itemIds = [...new Set(jobs.map((job) => job.order_item_id).filter(Boolean))];
  const itemResult = itemIds.length
    ? await fetchByIdChunks<{ id: string; order_id: string | null }>(itemIds, (chunk, from, to) => admin.from("order_items").select("id,order_id").in("id", chunk).order("id").range(from, to))
    : { data: [], error: null };
  const itemOrderMap = new Map(((itemResult.data ?? []) as Array<{ id: string; order_id: string | null }>).filter((item) => item.order_id).map((item) => [item.id, item.order_id!]));
  const jobOrderMap = new Map(jobs.map((job) => [job.id, itemOrderMap.get(job.order_item_id)]).filter((entry): entry is [string, string] => Boolean(entry[1])));
  const operationOrderIds = operations.map((operation) => operation.order_id ?? (operation.print_job_id ? jobOrderMap.get(operation.print_job_id) ?? null : null));
  const orderIds = [...new Set([...operationOrderIds.filter((id): id is string => Boolean(id)), ...jobOrderMap.values()])];
  const orderResult = orderIds.length
    ? await fetchByIdChunks<OrderFact>(orderIds, (chunk, from, to) => admin.from("orders").select("id,promised_at,test_mode").in("id", chunk).order("id").range(from, to))
    : { data: [], error: null };
  if (usageResult.error?.message) warnings.push(usageResult.error.message);
  if (itemResult.error?.message) warnings.push(itemResult.error.message);
  if (orderResult.error?.message) warnings.push(orderResult.error.message);

  const employment = (employmentResult.data ?? []) as HrEmployment[];
  const employmentTerms = (employmentTermsResult.data ?? []) as HrEmploymentTerms[];
  const attendance = (attendanceResult.data ?? []) as HrAttendance[];
  const leaves = (leaveResult.data ?? []) as HrLeave[];
  const calendar = (calendarResult.data ?? []) as CalendarDay[];
  const usages = (usageResult.data ?? []) as UsageFact[];
  const orders = (orderResult.data ?? []) as OrderFact[];
  const receipts = (receiptsResult.data ?? []) as ReceiptFact[];
  const team = staff.map((profile) => calculateStaffKpi({
    profile,
    employment: employment.find((row) => row.profile_id === profile.id) ?? null,
    employmentTerms,
    attendance,
    leaves,
    calendar,
    operations,
    jobs,
    usages,
    orders,
    receipts,
    jobOrderMap,
    startDate: bounds.startDate,
    today: bounds.today,
    yearStart: bounds.yearStart,
    yearEnd: bounds.yearEnd,
  }));
  const actorData = team.find((row) => row.profile.id === actor.id)
    ?? calculateStaffKpi({ profile: actor, employment: null, employmentTerms, attendance, leaves, calendar, operations, jobs, usages, orders, receipts, jobOrderMap, startDate: bounds.startDate, today: bounds.today, yearStart: bounds.yearStart, yearEnd: bounds.yearEnd });
  const profileMap = new Map(staff.map((profile) => [profile.id, profile]));
  const pendingTeamLeaves = leaves.filter((leave) => leave.status === "pending").map((leave) => ({ ...leave, employee: profileMap.get(leave.profile_id) ?? null }));
  const approvedTeamLeaves = leaves.filter((leave) => leave.status === "approved").map((leave) => ({ ...leave, employee: profileMap.get(leave.profile_id) ?? null }));

  return {
    setupMissing,
    loadWarnings: [...new Set(warnings)],
    monthKey: bounds.monthKey,
    monthLabel: bounds.monthLabel,
    today: bounds.today,
    actor: actorData,
    team,
    attendance: attendance.filter((row) => row.profile_id === actor.id && row.work_date >= bounds.startDate && row.work_date < bounds.nextDate),
    leaves: leaves.filter((row) => row.profile_id === actor.id),
    pendingTeamLeaves,
    approvedTeamLeaves,
    calendar,
  };
}
