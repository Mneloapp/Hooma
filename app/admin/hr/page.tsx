import { randomUUID } from "node:crypto";
import { CalendarClock, CalendarRange, ChevronDown, ClipboardCheck, History, Settings2, UserRoundCog } from "lucide-react";
import { redirect } from "next/navigation";
import {
  cancelLeaveAction,
  correctAttendanceAction,
  requestLeaveAction,
  reviewLeaveAction,
  setCalendarDayAction,
  updateEmploymentAction,
} from "./actions";
import { AttendancePanel, HrDataQualityNotice, HrSetupNotice, PersonalKpiGrid, TeamOverview } from "@/components/admin/HrDashboardPanels";
import { hasPermission, roleLabels } from "@/lib/auth/permissions";
import { loadHrDashboard, type HrEmployment, type HrLeave } from "@/lib/hr/dashboard";
import { requirePermission } from "@/lib/supabase/server";

const date = new Intl.DateTimeFormat("ka-GE", { dateStyle: "medium", timeZone: "Asia/Tbilisi" });
const time = new Intl.DateTimeFormat("ka-GE", { timeStyle: "short", timeZone: "Asia/Tbilisi" });
const number = new Intl.NumberFormat("ka-GE", { maximumFractionDigits: 2 });
const fieldClass = "mt-2 w-full rounded-xl border border-hooma-text/10 bg-white px-3 py-2.5 font-normal outline-none focus:border-hooma-accent";

const leaveLabels: Record<string, string> = {
  paid_leave: "ანაზღაურებადი შვებულება",
  unpaid_leave: "არაანაზღაურებადი შვებულება",
  sick_leave: "საავადმყოფო / ჯანმრთელობა",
  day_off: "Day off",
};

const leaveStatus: Record<string, [string, string]> = {
  pending: ["მოლოდინში", "bg-amber-100 text-amber-950"],
  approved: ["დამტკიცებული", "bg-emerald-100 text-emerald-900"],
  rejected: ["უარყოფილი", "bg-red-100 text-red-900"],
  cancelled: ["გაუქმებული", "bg-slate-100 text-slate-700"],
};

function EmploymentFallback({ profileId, createdAt }: { profileId: string; createdAt: string }): HrEmployment {
  return {
    profile_id: profileId,
    employee_number: `HOO-${profileId.replaceAll("-", "").slice(0, 8).toUpperCase()}`,
    job_title: null,
    department: null,
    manager_profile_id: null,
    hire_date: createdAt.slice(0, 10),
    employment_status: "active",
    work_week: [1, 2, 3, 4, 5],
    workday_start_local: "09:00:00",
    standard_workday_minutes: 480,
    late_grace_minutes: 15,
    annual_paid_leave_days: 24,
  };
}

export default async function HrPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const params = await searchParams;
  const profile = await requirePermission("hr.self");
  if (!profile) redirect("/login?next=/admin/hr");
  const data = await loadHrDashboard(profile, { includeInactive: true });
  const canManage = hasPermission(profile.role, "hr.manage");

  return (
    <div className="space-y-8">
      <header className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-hooma-muted">People operations</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">HR · დასწრება და KPI</h1>
          <p className="mt-3 max-w-4xl text-sm leading-6 text-hooma-muted">ყველა თანამშრომელი ხედავს საკუთარ სამუშაო დღეებს, შვებულებასა და ოპერაციულ შედეგებს. Owner/Admin დამატებით მართავს გუნდის გრაფიკს, მოთხოვნებსა და პროფილებს.</p>
        </div>
        <div className="rounded-2xl border border-hooma-text/10 bg-white px-4 py-3 text-sm shadow-sm"><strong>{profile.full_name || profile.email}</strong><span className="mt-1 block text-xs text-hooma-muted">{roleLabels[profile.role]} · {data.monthLabel}</span></div>
      </header>

      {params.notice ? <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{params.notice}</p> : null}
      {params.error ? <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{params.error}</p> : null}
      <HrSetupNotice setupMissing={data.setupMissing} />
      <HrDataQualityNotice warnings={data.loadWarnings} setupMissing={data.setupMissing} />

      <div className="grid gap-6 xl:grid-cols-[minmax(360px,.72fr)_minmax(0,1.28fr)]">
        <AttendancePanel staff={data.actor} returnTo="/admin/hr" disabled={data.setupMissing} />
        <LeaveRequestCard data={data} disabled={data.setupMissing} />
      </div>

      <PersonalKpiGrid staff={data.actor} monthLabel={data.monthLabel} />

      <div className="grid gap-6 xl:grid-cols-2">
        <AttendanceHistory data={data} />
        <LeaveHistory leaves={data.leaves} disabled={data.setupMissing} />
      </div>

      {canManage ? (
        <>
          <TeamOverview data={data} detailed />
          <PendingLeaveReviews data={data} disabled={data.setupMissing} />
          <AttendanceCorrection data={data} disabled={data.setupMissing} />
          <EmploymentManagement data={data} disabled={data.setupMissing} />
          <CalendarManagement data={data} disabled={data.setupMissing} />
        </>
      ) : null}

      <section className="rounded-[1.5rem] border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-950">
        <strong className="block">HR და KPI უსაფრთხოების წესი</strong>
        დასწრება, შვებულება და პროფილის ცვლილებები Audit log-ში ინახება. KPI არის ოპერაციული ანალიზი: პრინტერის, მასალის, მოდელის ან გარე შეფერხება ავტომატურად თანამშრომლის შეცდომად არ ითვლება; სახელფასო და სამართლებრივი გადაწყვეტილებები მიიღება პასუხისმგებელი პირისა და ბუღალტრის გადამოწმების შემდეგ.
      </section>
    </div>
  );
}

function LeaveRequestCard({ data, disabled }: { data: Awaited<ReturnType<typeof loadHrDashboard>>; disabled: boolean }) {
  return (
    <section className="rounded-[1.75rem] border border-hooma-text/10 bg-white/85 p-5 shadow-sm sm:p-6">
      <div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-hooma-muted">Leave self-service</p><h2 className="mt-3 text-2xl font-semibold">შვებულება / Day off</h2></div><span className="rounded-2xl bg-violet-50 px-4 py-3 text-right text-violet-900"><span className="block text-xs">დარჩენილი ანაზღაურებადი</span><strong className="mt-1 block text-xl">{number.format(data.actor.paidLeaveBalance)} დღე</strong></span></div>
      <form action={requestLeaveAction} className="mt-6 grid gap-4 sm:grid-cols-2">
        <input type="hidden" name="operation_key" value={randomUUID()} /><input type="hidden" name="return_to" value="/admin/hr" />
        <label className="text-sm font-semibold sm:col-span-2">მოთხოვნის ტიპი<select name="leave_type" defaultValue="paid_leave" className={fieldClass}><option value="paid_leave">ანაზღაურებადი შვებულება</option><option value="unpaid_leave">არაანაზღაურებადი შვებულება</option><option value="sick_leave">საავადმყოფო / ჯანმრთელობა</option><option value="day_off">Day off — ერთი დღე</option></select></label>
        <label className="text-sm font-semibold">დაწყება<input name="start_date" type="date" required min={data.today} defaultValue={data.today} className={fieldClass} /></label>
        <label className="text-sm font-semibold">დასრულება<input name="end_date" type="date" required min={data.today} defaultValue={data.today} className={fieldClass} /></label>
        <label className="text-sm font-semibold sm:col-span-2">მიზეზი / შენიშვნა<textarea name="reason" rows={3} maxLength={1000} className={fieldClass} placeholder="მოკლე ინფორმაცია დამადასტურებლისთვის" /></label>
        <button disabled={disabled} className="min-h-12 rounded-full bg-violet-700 px-6 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40 sm:col-span-2 sm:w-fit">მოთხოვნის გაგზავნა</button>
      </form>
    </section>
  );
}

function AttendanceHistory({ data }: { data: Awaited<ReturnType<typeof loadHrDashboard>> }) {
  return (
    <section className="rounded-[1.75rem] border border-hooma-text/10 bg-white/85 p-5 shadow-sm">
      <div className="flex items-center gap-3"><History className="text-blue-700" size={21} /><div><h2 className="text-xl font-semibold">დასწრების ისტორია</h2><p className="mt-1 text-xs text-hooma-muted">{data.monthLabel}</p></div></div>
      <div className="mt-5 space-y-2">
        {data.attendance.slice(0, 31).map((row) => <div key={row.id} className="flex flex-col justify-between gap-3 rounded-2xl bg-hooma-background p-4 sm:flex-row sm:items-center"><div><strong>{date.format(new Date(`${row.work_date}T12:00:00+04:00`))}</strong><p className="mt-1 text-xs text-hooma-muted">{attendanceLabel(row.status)}</p></div><div className="text-sm sm:text-right">{row.clock_in_at ? <span>{time.format(new Date(row.clock_in_at))} — {row.clock_out_at ? time.format(new Date(row.clock_out_at)) : "მიმდინარეობს"}</span> : <span className="text-hooma-muted">სამუშაო საათი არ ითვლება</span>}<p className="mt-1 text-xs text-hooma-muted">შესვენება: {row.break_minutes} წთ</p></div></div>)}
        {!data.attendance.length ? <p className="rounded-2xl border border-dashed border-hooma-text/15 p-8 text-center text-sm text-hooma-muted">ამ თვეში დასწრების ჩანაწერი ჯერ არ არის.</p> : null}
      </div>
    </section>
  );
}

function LeaveHistory({ leaves, disabled }: { leaves: HrLeave[]; disabled: boolean }) {
  return (
    <section className="rounded-[1.75rem] border border-hooma-text/10 bg-white/85 p-5 shadow-sm">
      <div className="flex items-center gap-3"><CalendarRange className="text-violet-700" size={21} /><div><h2 className="text-xl font-semibold">ჩემი მოთხოვნები</h2><p className="mt-1 text-xs text-hooma-muted">მიმდინარე კალენდარული წელი</p></div></div>
      <div className="mt-5 space-y-3">
        {leaves.map((leave) => <article key={leave.id} className="rounded-2xl border border-hooma-text/10 p-4"><div className="flex items-start justify-between gap-3"><div><strong>{leaveLabels[leave.leave_type] || leave.leave_type}</strong><p className="mt-1 text-xs text-hooma-muted">{date.format(new Date(`${leave.start_date}T12:00:00+04:00`))} — {date.format(new Date(`${leave.end_date}T12:00:00+04:00`))} · {number.format(Number(leave.working_days))} სამუშაო დღე</p></div><span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${(leaveStatus[leave.status] ?? leaveStatus.pending)[1]}`}>{(leaveStatus[leave.status] ?? leaveStatus.pending)[0]}</span></div>{leave.reason ? <p className="mt-3 text-sm text-hooma-muted">{leave.reason}</p> : null}{leave.review_notes ? <p className="mt-3 rounded-xl bg-hooma-panel p-3 text-xs">გადამმოწმებლის შენიშვნა: {leave.review_notes}</p> : null}{leave.status === "pending" ? <form action={cancelLeaveAction} className="mt-3"><input type="hidden" name="leave_id" value={leave.id} /><input type="hidden" name="operation_key" value={randomUUID()} /><input type="hidden" name="return_to" value="/admin/hr" /><button disabled={disabled} className="text-xs font-semibold text-red-700 disabled:opacity-40">მოთხოვნის გაუქმება</button></form> : null}</article>)}
        {!leaves.length ? <p className="rounded-2xl border border-dashed border-hooma-text/15 p-8 text-center text-sm text-hooma-muted">შვებულების მოთხოვნა ჯერ არ გაგიგზავნია.</p> : null}
      </div>
    </section>
  );
}

function PendingLeaveReviews({ data, disabled }: { data: Awaited<ReturnType<typeof loadHrDashboard>>; disabled: boolean }) {
  return (
    <section className="rounded-[1.75rem] border border-hooma-text/10 bg-white/85 p-5 shadow-sm sm:p-6">
      <div className="flex items-center gap-3"><ClipboardCheck className="text-emerald-700" /><div><h2 className="text-2xl font-semibold">დასამტკიცებელი მოთხოვნები</h2><p className="mt-1 text-sm text-hooma-muted">Owner/Admin-ის გადაწყვეტილება attendance კალენდარშიც აისახება.</p></div></div>
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {data.pendingTeamLeaves.map((leave) => {
          const selfReviewBlocked = leave.profile_id === data.actor.profile.id && data.actor.profile.role !== "owner";
          return <form key={leave.id} action={reviewLeaveAction} className="rounded-2xl border border-hooma-text/10 bg-hooma-background p-4"><input type="hidden" name="leave_id" value={leave.id} /><input type="hidden" name="operation_key" value={randomUUID()} /><strong>{leave.employee?.full_name || leave.employee?.email || "თანამშრომელი"}</strong><p className="mt-1 text-sm">{leaveLabels[leave.leave_type]} · {number.format(Number(leave.working_days))} დღე</p><p className="mt-1 text-xs text-hooma-muted">{date.format(new Date(`${leave.start_date}T12:00:00+04:00`))} — {date.format(new Date(`${leave.end_date}T12:00:00+04:00`))}</p>{leave.reason ? <p className="mt-3 text-sm text-hooma-muted">{leave.reason}</p> : null}{selfReviewBlocked ? <p className="mt-3 rounded-xl bg-amber-100 p-3 text-xs text-amber-950">საკუთარ მოთხოვნას ადმინისტრატორი ვერ ადასტურებს — საჭიროა Owner.</p> : <><textarea name="review_notes" rows={2} placeholder="გადაწყვეტილების შენიშვნა" className={fieldClass} /><div className="mt-3 flex gap-2"><button name="decision" value="approved" disabled={disabled} className="rounded-full bg-emerald-700 px-4 py-2 text-xs font-semibold text-white disabled:opacity-40">დადასტურება</button><button name="decision" value="rejected" disabled={disabled} className="rounded-full bg-red-100 px-4 py-2 text-xs font-semibold text-red-900 disabled:opacity-40">უარყოფა</button></div></>}</form>;
        })}
        {!data.pendingTeamLeaves.length ? <p className="rounded-2xl border border-dashed border-hooma-text/15 p-8 text-center text-sm text-hooma-muted lg:col-span-2">მოლოდინში მოთხოვნა არ არის.</p> : null}
      </div>
      {data.approvedTeamLeaves.length ? <div className="mt-7 border-t border-hooma-text/10 pt-6"><h3 className="font-semibold">დამტკიცებული მოთხოვნების მართვა</h3><p className="mt-1 text-xs text-hooma-muted">შეცდომით დამტკიცებული მოთხოვნის გაუქმება შვებულების დღეებს attendance-იდანაც მოხსნის.</p><div className="mt-4 grid gap-3 lg:grid-cols-2">{data.approvedTeamLeaves.slice(0, 20).map((leave) => {
        const selfReviewBlocked = leave.profile_id === data.actor.profile.id && data.actor.profile.role !== "owner";
        return <form key={leave.id} action={reviewLeaveAction} className="flex flex-col justify-between gap-3 rounded-2xl border border-hooma-text/10 bg-emerald-50/60 p-4 sm:flex-row sm:items-center"><div><strong>{leave.employee?.full_name || leave.employee?.email || "თანამშრომელი"}</strong><p className="mt-1 text-xs text-hooma-muted">{leaveLabels[leave.leave_type]} · {date.format(new Date(`${leave.start_date}T12:00:00+04:00`))} — {date.format(new Date(`${leave.end_date}T12:00:00+04:00`))}</p></div><input type="hidden" name="leave_id" value={leave.id} /><input type="hidden" name="operation_key" value={randomUUID()} /><input type="hidden" name="review_notes" value="Approved leave revoked by HR manager" />{selfReviewBlocked ? <span className="text-xs text-amber-900">საჭიროა Owner</span> : <button name="decision" value="cancelled" disabled={disabled} className="shrink-0 rounded-full bg-white px-4 py-2 text-xs font-semibold text-red-800 shadow-sm disabled:opacity-40">დამტკიცების გაუქმება</button>}</form>;
      })}</div></div> : null}
    </section>
  );
}

function AttendanceCorrection({ data, disabled }: { data: Awaited<ReturnType<typeof loadHrDashboard>>; disabled: boolean }) {
  return (
    <section className="rounded-[1.75rem] border border-hooma-text/10 bg-white/85 p-5 shadow-sm sm:p-6">
      <div className="flex items-center gap-3"><CalendarClock className="text-blue-700" /><div><h2 className="text-2xl font-semibold">დასწრების შესწორება</h2><p className="mt-1 text-sm text-hooma-muted">დავიწყებული clock-in/out, საპატიო გაცდენა ან არასწორი დრო — ყველა ცვლილება ინახავს მიზეზს და ძველ/ახალ მნიშვნელობას Audit log-ში.</p></div></div>
      <form action={correctAttendanceAction} className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <input type="hidden" name="operation_key" value={randomUUID()} />
        <label className="text-sm font-semibold">თანამშრომელი<select name="profile_id" required className={fieldClass}>{data.team.filter((member) => data.actor.profile.role === "owner" || (member.profile.role !== "owner" && member.profile.id !== data.actor.profile.id)).map((member) => <option key={member.profile.id} value={member.profile.id}>{member.profile.full_name || member.profile.email}</option>)}</select></label>
        <label className="text-sm font-semibold">სამუშაო თარიღი<input name="work_date" type="date" required max={data.today} defaultValue={data.today} className={fieldClass} /></label>
        <label className="text-sm font-semibold">სტატუსი<select name="attendance_status" defaultValue="present" className={fieldClass}><option value="present">ადგილზე</option><option value="remote">დისტანციურად</option><option value="paid_leave">ანაზღაურებადი შვებულება</option><option value="unpaid_leave">არაანაზღაურებადი შვებულება</option><option value="sick_leave">საავადმყოფო</option><option value="day_off">Day off</option><option value="excused">საპატიო გაცდენა</option><option value="absent">გაცდენა</option></select></label>
        <label className="text-sm font-semibold">შესვენება (წუთი)<input name="break_minutes" type="number" min="0" max="720" defaultValue="0" className={fieldClass} /></label>
        <label className="text-sm font-semibold">დაწყების დრო<input name="clock_in_at" type="datetime-local" className={fieldClass} /></label>
        <label className="text-sm font-semibold">დასრულების დრო<input name="clock_out_at" type="datetime-local" className={fieldClass} /></label>
        <label className="text-sm font-semibold sm:col-span-2">შესწორების მიზეზი<input name="notes" required maxLength={1000} className={fieldClass} /></label>
        <p className="text-xs leading-5 text-hooma-muted sm:col-span-2 xl:col-span-4">ადგილზე/დისტანციური სტატუსისთვის დაწყების დრო აუცილებელია. შვებულების, Day off-ის ან გაცდენის შემთხვევაში დროები ავტომატურად ცარიელდება.</p>
        <button disabled={disabled} className="min-h-11 rounded-full bg-blue-700 px-5 text-sm font-semibold text-white disabled:opacity-40 sm:col-span-2 sm:w-fit xl:col-span-4">შესწორების შენახვა</button>
      </form>
    </section>
  );
}

function EmploymentManagement({ data, disabled }: { data: Awaited<ReturnType<typeof loadHrDashboard>>; disabled: boolean }) {
  return (
    <section className="rounded-[1.75rem] border border-hooma-text/10 bg-white/85 p-5 shadow-sm sm:p-6">
      <div className="flex items-center gap-3"><UserRoundCog className="text-[#c2410c]" /><div><h2 className="text-2xl font-semibold">თანამშრომლების HR პროფილები</h2><p className="mt-1 text-sm text-hooma-muted">პოზიცია, განყოფილება, გრაფიკი, დაგვიანების ზღვარი და შვებულების წლიური ლიმიტი.</p></div></div>
      <div className="mt-5 space-y-3">
        {data.team.map((member) => {
          const employment = member.employment ?? EmploymentFallback({ profileId: member.profile.id, createdAt: member.profile.created_at });
          const editingProtected = data.actor.profile.role !== "owner" && (member.profile.role === "owner" || member.profile.id === data.actor.profile.id);
          return <details key={member.profile.id} className="group rounded-2xl border border-hooma-text/10 bg-white"><summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-4"><div><strong>{member.profile.full_name || member.profile.email}</strong><p className="mt-1 text-xs text-hooma-muted">{employment.employee_number} · {employment.job_title || roleLabels[member.profile.role]}</p></div><ChevronDown className="transition group-open:rotate-180" size={18} /></summary>{editingProtected ? <p className="border-t border-hooma-text/10 bg-amber-50 p-4 text-sm text-amber-950">Admin საკუთარ ან Owner-ის HR პროფილს ვერ ცვლის — საჭიროა Owner.</p> : <form action={updateEmploymentAction} className="grid gap-4 border-t border-hooma-text/10 p-4 sm:grid-cols-2 xl:grid-cols-4"><input type="hidden" name="profile_id" value={member.profile.id} /><input type="hidden" name="operation_key" value={randomUUID()} />
            <label className="text-sm font-semibold">თანამშრომლის ნომერი<input name="employee_number" required maxLength={40} defaultValue={employment.employee_number} className={fieldClass} /></label>
            <label className="text-sm font-semibold">პოზიცია<input name="job_title" maxLength={160} defaultValue={employment.job_title ?? ""} className={fieldClass} /></label>
            <label className="text-sm font-semibold">განყოფილება<input name="department" maxLength={160} defaultValue={employment.department ?? ""} className={fieldClass} /></label>
            <label className="text-sm font-semibold">მენეჯერი<select name="manager_profile_id" defaultValue={employment.manager_profile_id ?? ""} className={fieldClass}><option value="">არ არის</option>{data.team.filter((candidate) => candidate.profile.id !== member.profile.id).map((candidate) => <option key={candidate.profile.id} value={candidate.profile.id}>{candidate.profile.full_name || candidate.profile.email}</option>)}</select></label>
            <label className="text-sm font-semibold">დაწყების თარიღი<input name="hire_date" type="date" required defaultValue={employment.hire_date} className={fieldClass} /></label>
            <label className="text-sm font-semibold">სტატუსი<select name="employment_status" defaultValue={employment.employment_status} className={fieldClass}><option value="active">აქტიური</option><option value="on_leave">ხანგრძლივ შვებულებაში</option><option value="terminated">დასრულებული</option></select></label>
            <label className="text-sm font-semibold">სამუშაო დღის დაწყება<input name="workday_start_local" type="time" required defaultValue={employment.workday_start_local.slice(0, 5)} className={fieldClass} /></label>
            <label className="text-sm font-semibold">სამუშაო წუთი / დღე<input name="standard_workday_minutes" type="number" min="1" max="1440" required defaultValue={employment.standard_workday_minutes} className={fieldClass} /></label>
            <label className="text-sm font-semibold">დაგვიანების დასაშვები წუთი<input name="late_grace_minutes" type="number" min="0" max="240" required defaultValue={employment.late_grace_minutes} className={fieldClass} /></label>
            <label className="text-sm font-semibold">ანაზღაურებადი შვებულება / წელი<input name="annual_paid_leave_days" type="number" min="0" max="366" step="0.5" required defaultValue={Number(employment.annual_paid_leave_days)} className={fieldClass} /></label>
            <fieldset className="sm:col-span-2 xl:col-span-4"><legend className="text-sm font-semibold">სამუშაო კვირა</legend><div className="mt-2 flex flex-wrap gap-2">{[[1,"ორშ"],[2,"სამ"],[3,"ოთხ"],[4,"ხუთ"],[5,"პარ"],[6,"შაბ"],[7,"კვ"]].map(([day, label]) => <label key={day} className="inline-flex items-center gap-2 rounded-full border border-hooma-text/10 bg-hooma-background px-3 py-2 text-xs"><input type="checkbox" name="work_week" value={day} defaultChecked={employment.work_week.includes(Number(day))} />{label}</label>)}</div></fieldset>
            <button disabled={disabled} className="min-h-11 rounded-full bg-hooma-text px-5 text-sm font-semibold text-white disabled:opacity-40 sm:col-span-2 sm:w-fit xl:col-span-4">HR პროფილის შენახვა</button>
          </form>}</details>;
        })}
      </div>
    </section>
  );
}

function CalendarManagement({ data, disabled }: { data: Awaited<ReturnType<typeof loadHrDashboard>>; disabled: boolean }) {
  return (
    <section className="grid gap-6 rounded-[1.75rem] border border-hooma-text/10 bg-white/85 p-5 shadow-sm lg:grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)] sm:p-6">
      <div><div className="flex items-center gap-3"><Settings2 className="text-blue-700" /><div><h2 className="text-xl font-semibold">სამუშაო კალენდარი</h2><p className="mt-1 text-xs text-hooma-muted">ოფიციალური უქმე ან კომპანიის სამუშაო გამონაკლისი</p></div></div><form action={setCalendarDayAction} className="mt-5 space-y-4"><input type="hidden" name="operation_key" value={randomUUID()} /><label className="block text-sm font-semibold">თარიღი<input name="calendar_date" type="date" required className={fieldClass} /></label><label className="block text-sm font-semibold">დღის ტიპი<select name="is_working_day" defaultValue="false" className={fieldClass}><option value="false">უქმე / არასამუშაო</option><option value="true">სამუშაო გამონაკლისი</option></select></label><label className="block text-sm font-semibold">დასახელება ქართულად<input name="name_ka" maxLength={160} className={fieldClass} placeholder="მაგ. დამოუკიდებლობის დღე" /></label><label className="block text-sm font-semibold">დასახელება ინგლისურად<input name="name_en" maxLength={160} className={fieldClass} /></label><button disabled={disabled} className="min-h-11 rounded-full bg-blue-700 px-5 text-sm font-semibold text-white disabled:opacity-40">კალენდარში შენახვა</button></form></div>
      <div><h3 className="flex items-center gap-2 font-semibold"><CalendarClock size={18} />{new Date().getFullYear()} წლის გამონაკლისები</h3><div className="mt-4 space-y-2">{data.calendar.map((day) => <div key={day.calendar_date} className="flex items-center justify-between gap-4 rounded-2xl bg-hooma-background p-4"><div><strong>{date.format(new Date(`${day.calendar_date}T12:00:00+04:00`))}</strong><p className="mt-1 text-xs text-hooma-muted">{day.name_ka || "დასახელება არ არის"}</p></div><span className={`rounded-full px-3 py-1 text-xs font-semibold ${day.is_working_day ? "bg-blue-100 text-blue-900" : "bg-amber-100 text-amber-950"}`}>{day.is_working_day ? "სამუშაო" : "უქმე"}</span></div>)}{!data.calendar.length ? <p className="rounded-2xl border border-dashed border-hooma-text/15 p-8 text-center text-sm text-hooma-muted">კალენდრის გამონაკლისი ჯერ არ არის დამატებული; გამოიყენება თანამშრომლის კვირის გრაფიკი.</p> : null}</div></div>
    </section>
  );
}

function attendanceLabel(status: string) {
  return ({ present: "ადგილზე", remote: "დისტანციურად", paid_leave: "ანაზღაურებადი შვებულება", unpaid_leave: "არაანაზღაურებადი შვებულება", sick_leave: "საავადმყოფო", day_off: "Day off", absent: "გაცდენა", excused: "საპატიო გაცდენა" } as Record<string, string>)[status] || status;
}
