import { randomUUID } from "node:crypto";
import Link from "next/link";
import {
  ArrowRight,
  BriefcaseBusiness,
  CalendarCheck2,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Factory,
  Gauge,
  LogIn,
  LogOut,
  PackageCheck,
  Scale,
  TimerReset,
  UsersRound,
} from "lucide-react";
import { clockInAction, clockOutAction } from "@/app/admin/hr/actions";
import { roleLabels } from "@/lib/auth/permissions";
import type { HrDashboardData, StaffKpi } from "@/lib/hr/dashboard";

const integer = new Intl.NumberFormat("ka-GE", { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat("ka-GE", { maximumFractionDigits: 2 });
const time = new Intl.DateTimeFormat("ka-GE", { timeStyle: "short", timeZone: "Asia/Tbilisi" });

function percent(part: number, total: number) {
  return total > 0 ? `${integer.format(part / total * 100)}%` : "—";
}

function duration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours ? `${integer.format(hours)}სთ ${integer.format(rest)}წთ` : `${integer.format(rest)}წთ`;
}

function identity(staff: StaffKpi) {
  return staff.profile.full_name || staff.profile.email || "თანამშრომელი";
}

export function HrSetupNotice({ setupMissing }: { setupMissing: boolean }) {
  if (!setupMissing) return null;
  return (
    <div className="rounded-[1.5rem] border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-950">
      <strong className="block">HR მოდული კოდში მზადაა, მაგრამ მონაცემთა ბაზაზე ჯერ არ არის გააქტიურებული.</strong>
      Supabase-ზე გაუშვი <code>20260719000400_hr_attendance_kpi.sql</code>. მანამდე ეკრანზე ოპერაციული KPI გამოჩნდება, დასწრებისა და შვებულების მოქმედებები კი დაბლოკილი იქნება.
    </div>
  );
}

export function HrDataQualityNotice({ warnings, setupMissing }: { warnings: string[]; setupMissing: boolean }) {
  if (setupMissing || !warnings.length) return null;
  return <div className="rounded-[1.5rem] border border-red-200 bg-red-50 p-5 text-sm leading-6 text-red-950"><strong className="block">ზოგი KPI წყარო დროებით მიუწვდომელია.</strong>ნულოვანი მნიშვნელობა საბოლოო შედეგად არ ჩაითვალოს, სანამ მონაცემთა კავშირი არ აღდგება. გვერდის განახლების შემდეგ სისტემა ხელახლა სცდის ყველა წყაროს წაკითხვას.</div>;
}

export function AttendancePanel({ staff, returnTo, disabled = false }: { staff: StaffKpi; returnTo: "/admin" | "/admin/hr"; disabled?: boolean }) {
  const attendance = staff.todayAttendance;
  const state = staff.attendanceState;
  const states = {
    working: { label: "სამუშაო დღე მიმდინარეობს", tone: "bg-emerald-100 text-emerald-900", icon: <Clock3 size={18} /> },
    finished: { label: "სამუშაო დღე დასრულებულია", tone: "bg-blue-100 text-blue-900", icon: <CheckCircle2 size={18} /> },
    leave: { label: "დღე მონიშნულია დასვენებად", tone: "bg-violet-100 text-violet-900", icon: <CalendarCheck2 size={18} /> },
    off_schedule: { label: "დღეს სამუშაო გრაფიკი არ არის", tone: "bg-slate-100 text-slate-800", icon: <CalendarCheck2 size={18} /> },
    inactive: { label: "HR პროფილი არ არის აქტიური", tone: "bg-slate-200 text-slate-900", icon: <CircleAlert size={18} /> },
    not_started: { label: "სამუშაო დღე ჯერ არ დაწყებულა", tone: "bg-amber-100 text-amber-950", icon: <TimerReset size={18} /> },
  } as const;
  const current = states[state];

  return (
    <section className="overflow-hidden rounded-[1.75rem] border border-hooma-text/10 bg-white/85 shadow-sm">
      <div className="border-b border-hooma-text/10 bg-gradient-to-br from-[#fff7ed] via-white to-[#eff6ff] p-5 sm:p-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-hooma-muted">დღევანდელი დასწრება</p>
            <h2 className="mt-3 text-2xl font-semibold">სამუშაო დღის კონტროლი</h2>
          </div>
          <span className={`inline-flex w-fit items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold ${current.tone}`}>{current.icon}{current.label}</span>
        </div>
        {attendance?.clock_in_at ? (
          <div className="mt-5 flex flex-wrap gap-3 text-sm">
            <span className="rounded-full bg-white px-3 py-2 shadow-sm">დაწყება: <strong>{time.format(new Date(attendance.clock_in_at))}</strong></span>
            {attendance.clock_out_at ? <span className="rounded-full bg-white px-3 py-2 shadow-sm">დასრულება: <strong>{time.format(new Date(attendance.clock_out_at))}</strong></span> : null}
            <span className="rounded-full bg-white px-3 py-2 shadow-sm">რეჟიმი: <strong>{attendance.status === "remote" ? "დისტანციური" : "ადგილზე"}</strong></span>
          </div>
        ) : <p className="mt-4 text-sm leading-6 text-hooma-muted">დაწყებისა და დასრულების დრო ინახება სერვერის საათით და ცვლილებები Audit log-ში ფიქსირდება.</p>}
      </div>
      <div className="p-5 sm:p-6">
        {state === "not_started" ? (
          <div className="flex flex-wrap gap-3">
            <form action={clockInAction}>
              <input type="hidden" name="operation_key" value={randomUUID()} /><input type="hidden" name="return_to" value={returnTo} /><input type="hidden" name="mode" value="present" />
              <button disabled={disabled} className="inline-flex min-h-12 items-center gap-2 rounded-full bg-hooma-text px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"><LogIn size={17} />სამუშაო დღის დაწყება</button>
            </form>
            <form action={clockInAction}>
              <input type="hidden" name="operation_key" value={randomUUID()} /><input type="hidden" name="return_to" value={returnTo} /><input type="hidden" name="mode" value="remote" />
              <button disabled={disabled} className="min-h-12 rounded-full border border-hooma-text/15 bg-white px-5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40">დისტანციურად დაწყება</button>
            </form>
          </div>
        ) : null}
        {state === "working" ? (
          <form action={clockOutAction} className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <input type="hidden" name="operation_key" value={randomUUID()} /><input type="hidden" name="return_to" value={returnTo} />
            <label className="text-sm font-semibold">შესვენება (წუთი)<input name="break_minutes" type="number" min="0" max="720" defaultValue="0" className="mt-2 block w-40 rounded-xl border border-hooma-text/10 bg-white px-3 py-2.5 outline-none focus:border-hooma-accent" /></label>
            <button disabled={disabled} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-blue-700 px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"><LogOut size={17} />სამუშაო დღის დასრულება</button>
          </form>
        ) : null}
        {state === "finished" ? <p className="text-sm text-hooma-muted">დღევანდელი დრო შენახულია. სრული ისტორია HR გვერდზეა ხელმისაწვდომი.</p> : null}
        {state === "leave" ? <p className="text-sm text-hooma-muted">დამტკიცებული შვებულების ან Day off-ის გამო ამ დღეს სამუშაო დრო აღარ ფიქსირდება.</p> : null}
        {state === "off_schedule" ? <p className="text-sm text-hooma-muted">დღეს დასვენების დღეა, კალენდარში უქმედაა მონიშნული ან HR პროფილი აქტიურ სამუშაო მდგომარეობაში არ არის.</p> : null}
        {state === "inactive" ? <p className="text-sm text-hooma-muted">თანამშრომლის წვდომა ან სამუშაო სტატუსი არააქტიურია. ისტორიული მონაცემები Owner/Admin-ისთვის შენარჩუნებულია.</p> : null}
      </div>
    </section>
  );
}

export function PersonalKpiGrid({ staff, monthLabel }: { staff: StaffKpi; monthLabel: string }) {
  const cards = [
    { label: "დასწრება", value: `${staff.presentDays}/${staff.scheduledDays}`, note: `${monthLabel} · გასული სამუშაო დღეები`, icon: <CalendarCheck2 size={20} />, tone: "bg-[#fff7ed] text-[#9a3412]" },
    { label: "ნამუშევარი დრო", value: duration(staff.workedMinutes), note: staff.lateDays ? `${staff.lateDays} დაგვიანება · ${duration(staff.lateMinutes)}` : "დაგვიანება არ დაფიქსირდა", icon: <Clock3 size={20} />, tone: "bg-[#eff6ff] text-[#1d4ed8]" },
    { label: "დამუშავებული შეკვეთები", value: integer.format(staff.ordersTouched), note: "ოპერაციებში შეხებული უნიკალური შეკვეთები", icon: <PackageCheck size={20} />, tone: "bg-[#f5f3ff] text-[#6d28d9]" },
    { label: "წარმოებაში გახარჯული", value: `${decimal.format(staff.assignedKg)} კგ`, note: `${decimal.format(staff.usableKg)} კგ პროდუქტი · ${decimal.format(staff.wasteKg)} კგ ნარჩენი${staff.wasteRate === null ? "" : ` (${decimal.format(staff.wasteRate)}%)`} · დაფარვა ${staff.usageCoverage.covered}/${staff.usageCoverage.total}`, icon: <Scale size={20} />, tone: "bg-[#ecfdf5] text-[#047857]" },
    { label: "დაპირებულ ვადამდე მზად", value: percent(staff.deadline.onTime, staff.deadline.eligible), note: `${staff.deadline.onTime}/${staff.deadline.eligible} შესაბამისი შეკვეთა`, icon: <Gauge size={20} />, tone: "bg-[#fef2f2] text-[#b91c1c]" },
    { label: "განაწილებიდან დაწყებამდე", value: percent(staff.assignmentFlow.proceeded, staff.assignmentFlow.resolved), note: `${staff.assignmentFlow.proceeded}/${staff.assignmentFlow.resolved} დასრულებული განაწილების ციკლი`, icon: <Factory size={20} />, tone: "bg-[#f0fdfa] text-[#0f766e]" },
    { label: "ბეჭდვის წარმატება", value: percent(staff.completedJobs, staff.completedJobs + staff.failedJobs), note: `${staff.completedJobs}/${staff.completedJobs + staff.failedJobs} წარმატებული · ${staff.reprintJobs} განმეორებითი ცდა · ${duration(staff.supervisedPrintMinutes)}`, icon: <CircleAlert size={20} />, tone: "bg-[#fff7ed] text-[#c2410c]" },
    { label: "მიღებული მარაგი", value: `${decimal.format(staff.receivedStockKg)} კგ`, note: "ოპერატორის მიერ ERP-ში მიღებული მასალა", icon: <BriefcaseBusiness size={20} />, tone: "bg-[#f8fafc] text-[#334155]" },
  ];
  return (
    <section>
      <div className="mb-4 flex items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-hooma-muted">პერსონალური KPI</p><h2 className="mt-2 text-2xl font-semibold">{monthLabel}</h2></div><Link href="/admin/hr" className="hidden items-center gap-2 text-sm font-semibold text-hooma-accent sm:inline-flex">სრული HR ისტორია <ArrowRight size={16} /></Link></div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => <article key={card.label} className="rounded-[1.5rem] border border-hooma-text/10 bg-white/85 p-5 shadow-sm"><span className={`inline-flex rounded-xl p-2.5 ${card.tone}`}>{card.icon}</span><p className="mt-5 text-sm text-hooma-muted">{card.label}</p><p className="mt-2 text-2xl font-semibold tracking-tight">{card.value}</p><p className="mt-2 text-xs leading-5 text-hooma-muted">{card.note}</p></article>)}
      </div>
      {staff.testOrdersIncluded ? <p className="mt-3 text-xs text-hooma-muted">ამ თვის მაჩვენებლებში შედის {staff.testOrdersIncluded} სატესტო შეკვეთა. თითოეული პროცენტი აჩვენებს მრიცხველსაც და მნიშვნელსაც, რათა მცირე ნიმუში შეცდომაში შემყვანი არ იყოს.</p> : null}
    </section>
  );
}

export function TeamOverview({ data, detailed = false }: { data: HrDashboardData; detailed?: boolean }) {
  const working = data.team.filter((member) => member.attendanceState === "working").length;
  const finished = data.team.filter((member) => member.attendanceState === "finished").length;
  const leave = data.team.filter((member) => member.attendanceState === "leave").length;
  const offSchedule = data.team.filter((member) => member.attendanceState === "off_schedule").length;
  const inactive = data.team.filter((member) => member.attendanceState === "inactive").length;
  const notStarted = data.team.filter((member) => member.attendanceState === "not_started").length;
  const totalKg = data.team.reduce((sum, member) => sum + member.assignedKg, 0);
  const totalOrders = data.team.reduce((sum, member) => sum + member.ordersTouched, 0);
  return (
    <section className="space-y-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-hooma-muted">Owner / Admin ხედვა</p><h2 className="mt-2 text-2xl font-semibold">გუნდის მდგომარეობა</h2></div>{!detailed ? <Link href="/admin/hr" className="inline-flex items-center gap-2 text-sm font-semibold text-hooma-accent">HR ცენტრის გახსნა <ArrowRight size={16} /></Link> : null}</div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {[{ label: "მუშაობს ახლა", value: working, tone: "bg-emerald-50 text-emerald-900" }, { label: "დღე დაასრულა", value: finished, tone: "bg-blue-50 text-blue-900" }, { label: "შვებულება / Day off", value: leave, tone: "bg-violet-50 text-violet-900" }, { label: "გრაფიკით დასვენება", value: offSchedule, tone: "bg-slate-50 text-slate-800" }, { label: "ჯერ არ დაუწყია", value: notStarted, tone: "bg-amber-50 text-amber-950" }, { label: "არააქტიური", value: inactive, tone: "bg-slate-100 text-slate-900" }, { label: "თანამშრომლის შეხებები", value: totalOrders, tone: "bg-white text-hooma-text" }, { label: "თვის მასალა", value: `${decimal.format(totalKg)} კგ`, tone: "bg-white text-hooma-text" }].map((item) => <div key={item.label} className={`rounded-2xl border border-hooma-text/10 p-4 ${item.tone}`}><p className="text-xs opacity-70">{item.label}</p><p className="mt-2 text-xl font-semibold">{item.value}</p></div>)}
      </div>
      <div className="overflow-hidden rounded-[1.5rem] border border-hooma-text/10 bg-white/85 shadow-sm">
        <div className="flex items-center gap-3 border-b border-hooma-text/10 px-5 py-4"><UsersRound size={20} className="text-hooma-accent" /><h3 className="font-semibold">თანამშრომლების თვიური მაჩვენებლები</h3></div>
        <div className="hidden overflow-x-auto lg:block"><table className="w-full min-w-[1050px] text-left text-sm"><thead className="bg-hooma-panel/70 text-xs uppercase tracking-[0.12em] text-hooma-muted"><tr><th className="px-5 py-4">თანამშრომელი</th><th className="px-4 py-4">დასწრება</th><th className="px-4 py-4">შეკვეთა</th><th className="px-4 py-4">კგ</th><th className="px-4 py-4">ბეჭდვა</th><th className="px-4 py-4">ვადამდე</th><th className="px-4 py-4">განაწილება → start</th><th className="px-4 py-4">დღეს</th></tr></thead><tbody className="divide-y divide-hooma-text/10">{data.team.map((member) => <tr key={member.profile.id}><td className="px-5 py-4"><strong>{identity(member)}</strong><span className="mt-1 block text-xs text-hooma-muted">{roleLabels[member.profile.role]}</span></td><td className="px-4 py-4">{member.presentDays}/{member.scheduledDays}</td><td className="px-4 py-4">{member.ordersTouched}</td><td className="px-4 py-4">{decimal.format(member.assignedKg)}</td><td className="px-4 py-4"><span className="text-emerald-700">{member.completedJobs} ✓</span> · <span className="text-red-700">{member.failedJobs} !</span></td><td className="px-4 py-4">{percent(member.deadline.onTime, member.deadline.eligible)}<span className="block text-[11px] text-hooma-muted">{member.deadline.onTime}/{member.deadline.eligible}</span></td><td className="px-4 py-4">{percent(member.assignmentFlow.proceeded, member.assignmentFlow.resolved)}<span className="block text-[11px] text-hooma-muted">{member.assignmentFlow.proceeded}/{member.assignmentFlow.resolved}</span></td><td className="px-4 py-4"><AttendanceBadge state={member.attendanceState} /></td></tr>)}</tbody></table></div>
        <div className="divide-y divide-hooma-text/10 lg:hidden">{data.team.map((member) => <article key={member.profile.id} className="p-5"><div className="flex items-start justify-between gap-3"><div><strong>{identity(member)}</strong><p className="mt-1 text-xs text-hooma-muted">{roleLabels[member.profile.role]}</p></div><AttendanceBadge state={member.attendanceState} /></div><div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs"><span className="rounded-xl bg-hooma-panel p-3">დასწრება<strong className="mt-1 block text-base">{member.presentDays}/{member.scheduledDays}</strong></span><span className="rounded-xl bg-hooma-panel p-3">შეკვეთა<strong className="mt-1 block text-base">{member.ordersTouched}</strong></span><span className="rounded-xl bg-hooma-panel p-3">კგ<strong className="mt-1 block text-base">{decimal.format(member.assignedKg)}</strong></span></div></article>)}</div>
      </div>
    </section>
  );
}

function AttendanceBadge({ state }: { state: StaffKpi["attendanceState"] }) {
  const labels = { working: ["მუშაობს", "bg-emerald-100 text-emerald-900"], finished: ["დაასრულა", "bg-blue-100 text-blue-900"], leave: ["შვებულება", "bg-violet-100 text-violet-900"], off_schedule: ["გრაფიკით დასვენება", "bg-slate-100 text-slate-800"], inactive: ["არააქტიური", "bg-slate-200 text-slate-900"], not_started: ["არ დაუწყია", "bg-amber-100 text-amber-950"] } as const;
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${labels[state][1]}`}>{labels[state][0]}</span>;
}
