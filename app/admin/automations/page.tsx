import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bot,
  Check,
  Clock3,
  Instagram,
  LockKeyhole,
  Music2,
  RadioTower,
  ReceiptText,
  ShieldCheck,
  UploadCloud,
  X,
} from "lucide-react";
import { requirePermission } from "@/lib/supabase/server";
import {
  loadSocialAutomationDashboard,
  isTerminalAutomationJobState,
  type AppReviewSnapshot,
  type AutomationProvider,
  type ConnectionSnapshot,
  type JobSnapshot,
} from "@/lib/social/automation-dashboard";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type SearchParameters = Promise<Record<string, string | string[] | undefined>>;

const dateTime = new Intl.DateTimeFormat("ka-GE", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Tbilisi",
});
const number = new Intl.NumberFormat("ka-GE");

const providerLabels: Record<AutomationProvider, string> = {
  tiktok: "TikTok",
  instagram: "Instagram",
};

const stateLabels: Record<string, string> = {
  waiting_for_approval: "ელოდება დასტურს",
  approved: "დამტკიცებულია",
  media_staged: "მედია მზადაა",
  claimed: "აღებულია გამომქვეყნებლის მიერ",
  publishing: "იგზავნება პლატფორმაზე",
  published: "გამოქვეყნებულია",
  retry_wait: "უსაფრთხო განმეორებას ელოდება",
  failed: "შეჩერებულია",
  blocked_policy: "პოლიტიკით დაბლოკილია",
  blocked_remote_uncertain: "დისტანციური შედეგი შესამოწმებელია",
  cancelled: "გაუქმებულია",
};
function formatDate(value: string | null) {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : dateTime.format(parsed);
}

function singleValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function reviewForProvider(reviews: AppReviewSnapshot[], provider: AutomationProvider): AppReviewSnapshot {
  return reviews.find((review) => review.provider === provider) ?? {
    provider,
    status: "unknown",
    verifiedAt: null,
    evidence: "unavailable",
  };
}

function reviewDetail(review: AppReviewSnapshot) {
  if (review.status !== "approved") return "სტატუსი უცნობია";
  return review.verifiedAt
    ? `Approved · ${formatDate(review.verifiedAt)}`
    : "Approved · უსაფრთხოების ქვითარი დადასტურებულია";
}

function ProviderMark({ provider }: { provider: AutomationProvider }) {
  return provider === "instagram"
    ? <span className="inline-flex size-10 items-center justify-center rounded-2xl bg-gradient-to-br from-fuchsia-500 via-rose-500 to-amber-400 text-white"><Instagram size={20} /></span>
    : <span className="inline-flex size-10 items-center justify-center rounded-2xl bg-slate-950 text-xs font-black tracking-tight text-white">TT</span>;
}

function Gate({ ready, label }: { ready: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${ready ? "bg-emerald-100 text-emerald-900" : "bg-slate-100 text-slate-700"}`}>
      {ready ? <Check size={13} /> : <X size={13} />}{label}
    </span>
  );
}

function Stage({ index, label, detail, ready, current }: {
  index: number;
  label: string;
  detail: string;
  ready: boolean;
  current?: boolean;
}) {
  return (
    <div className={`rounded-2xl border p-3 ${ready ? "border-emerald-200 bg-emerald-50" : current ? "border-amber-200 bg-amber-50" : "border-hooma-text/10 bg-hooma-background"}`}>
      <div className="flex items-center gap-2">
        <span className={`flex size-6 items-center justify-center rounded-full text-[11px] font-bold ${ready ? "bg-emerald-600 text-white" : "bg-white text-hooma-muted"}`}>{ready ? <Check size={13} /> : index}</span>
        <strong className="text-xs">{label}</strong>
      </div>
      <p className="mt-2 text-[11px] leading-4 text-hooma-muted">{detail}</p>
    </div>
  );
}

function ConnectionCard({
  connection,
  review,
  oauthEnabled,
  publishing,
  apiNetwork,
  dataAvailable,
}: {
  connection: ConnectionSnapshot;
  review: AppReviewSnapshot;
  oauthEnabled: boolean;
  publishing: boolean;
  apiNetwork: boolean;
  dataAvailable: boolean;
}) {
  const healthy = dataAvailable && connection.connected && !connection.needsAttention;
  const connectHref = `/api/social/oauth/${connection.provider}/start`;
  return (
    <article className="rounded-[1.75rem] border border-hooma-text/10 bg-white/80 p-5 shadow-sm sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <ProviderMark provider={connection.provider} />
          <div>
            <h2 className="text-xl font-semibold">{providerLabels[connection.provider]}</h2>
            <p className="mt-0.5 text-xs text-hooma-muted">{!dataAvailable ? "კავშირის მონაცემი მიუწვდომელია" : connection.username ?? "@hooma.ge OAuth ჯერ არ დასრულებულა"}</p>
          </div>
        </div>
        <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${healthy ? "bg-emerald-100 text-emerald-900" : dataAvailable ? "bg-amber-100 text-amber-950" : "bg-slate-100 text-slate-700"}`}>
          {!dataAvailable ? "მონაცემი მიუწვდომელია" : healthy ? "დაკავშირებულია" : connection.status === "not_connected" ? "OAuth მოლოდინშია" : "საჭიროა შემოწმება"}
        </span>
      </div>

      <div className="mt-6 grid gap-2 sm:grid-cols-3">
        <Stage index={1} label="აპის დამტკიცება" detail={reviewDetail(review)} ready={review.status === "approved"} />
        <Stage index={2} label="ანგარიშის OAuth" detail={!dataAvailable ? "კავშირის მდგომარეობა დროებით მიუწვდომელია" : connection.connected ? "@hooma.ge უსაფრთხოდ არის მიბმული" : "მფლობელის ერთჯერადი ავტორიზაციაა საჭირო"} ready={dataAvailable && connection.connected} current={dataAvailable && review.status === "approved" && !connection.connected} />
        <Stage index={3} label="გამოქვეყნება" detail={publishing ? "ავტომატური gate ჩართულია" : "kill-switch გამორთულია"} ready={publishing} current={connection.connected && !publishing} />
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl bg-hooma-background p-4">
          <p className="text-xs text-hooma-muted">ავტორიზაციის მდგომარეობა</p>
          <p className="mt-2 font-semibold">{connection.tokenHealth === "healthy" ? "ჯანმრთელია" : connection.tokenHealth === "expiring" ? "მალე განახლდება" : connection.tokenHealth === "expired" ? "ვადა გასულია" : "მონაცემი მიუწვდომელია"}</p>
          <p className="mt-1 text-xs text-hooma-muted">ვადა: {formatDate(connection.accessExpiresAt)}</p>
        </div>
        <div className="rounded-2xl bg-hooma-background p-4">
          <p className="text-xs text-hooma-muted">ბოლო უსაფრთხო შემოწმება</p>
          <p className="mt-2 font-semibold">{formatDate(connection.lastVerifiedAt)}</p>
          <p className="mt-1 text-xs text-hooma-muted">{connection.permissionCount} მინიჭებული უფლება</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Gate ready={connection.identityVerified} label="@hooma.ge" />
        <Gate ready={apiNetwork} label="API ქსელი" />
        <Gate ready={publishing} label="გამოქვეყნება" />
        {connection.provider === "instagram" && dataAvailable && connection.connected && apiNetwork ? (
          <>
            <Link href="/admin/automations/instagram-canary" className="inline-flex min-h-10 w-full items-center justify-center rounded-full border border-emerald-700/20 bg-emerald-50 px-4 text-center text-xs font-semibold text-emerald-900 sm:ml-auto sm:w-auto">Instagram-ის უსაფრთხო შემოწმება</Link>
            <Link href="/admin/automations/instagram-launch" className="inline-flex min-h-10 w-full items-center justify-center rounded-full bg-fuchsia-700 px-4 text-center text-xs font-semibold text-white sm:w-auto">9 ვიდეოს launch</Link>
          </>
        ) : null}
        {connection.provider === "tiktok" && dataAvailable && connection.connected ? (
          <>
            <Link href="/admin/automations/tiktok-canary" className="inline-flex min-h-10 w-full items-center justify-center rounded-full border border-cyan-700/20 bg-cyan-50 px-4 text-center text-xs font-semibold text-cyan-950 sm:ml-auto sm:w-auto">TikTok-ის უსაფრთხო შემოწმება</Link>
            <Link href="/admin/automations/tiktok-launch" className="inline-flex min-h-10 w-full items-center justify-center rounded-full bg-slate-950 px-4 text-center text-xs font-semibold text-white sm:w-auto">9 ვიდეოს TikTok launch</Link>
          </>
        ) : null}
        {dataAvailable && !connection.connected && review.status === "approved" && oauthEnabled ? (
          <a href={connectHref} className="inline-flex min-h-10 w-full items-center justify-center rounded-full bg-hooma-text px-4 text-center text-xs font-semibold text-white sm:ml-auto sm:w-auto">{providerLabels[connection.provider]}-ის დაკავშირება</a>
        ) : null}
        {dataAvailable && !connection.connected && review.status === "approved" && !oauthEnabled ? (
          <span className="inline-flex min-h-10 w-full items-center justify-center rounded-full bg-slate-100 px-4 text-center text-xs font-semibold text-slate-500 sm:ml-auto sm:w-auto" aria-disabled="true">OAuth gate ჯერ გამორთულია</span>
        ) : null}
        {!dataAvailable && review.status === "approved" ? <span className="inline-flex min-h-10 w-full items-center justify-center rounded-full bg-slate-100 px-4 text-center text-xs font-semibold text-slate-500 sm:ml-auto sm:w-auto" aria-disabled="true">OAuth მდგომარეობა ჯერ ვერ მოწმდება</span> : null}
      </div>
    </article>
  );
}

function QueueItem({ job }: { job: JobSnapshot }) {
  const terminal = isTerminalAutomationJobState(job.state);
  const terminalMessage: Record<string, string> = {
    published: "გამოქვეყნება დადასტურებულია",
    failed: "გამოქვეყნება შეჩერებულია",
    cancelled: "ჩანაწერი გაუქმებულია",
    blocked_policy: "პოლიტიკის ბლოკირება აქტიურია",
    blocked_remote_uncertain: "დისტანციური შედეგი ხელით შესამოწმებელია",
  };
  const completionMessage = terminalMessage[job.state] ?? null;
  return (
    <li className="grid gap-4 border-t border-hooma-text/10 py-4 first:border-t-0 first:pt-0 lg:grid-cols-[170px_minmax(180px,.75fr)_minmax(0,1.25fr)]">
      <div className="flex items-center gap-3"><ProviderMark provider={job.provider} /><div><p className="font-semibold">{providerLabels[job.provider]}</p><p className="mt-1 text-xs text-hooma-muted">{formatDate(job.scheduledAt)}</p></div></div>
      <div>
        <span className={`inline-flex rounded-full px-3 py-1.5 text-xs font-semibold ${job.state === "published" ? "bg-emerald-100 text-emerald-900" : job.state.startsWith("blocked_") ? "bg-amber-100 text-amber-950" : terminal ? "bg-slate-100 text-slate-700" : "bg-[#fff2e8] text-[#9a3412]"}`}>{stateLabels[job.state] ?? "მდგომარეობა განახლდა"}</span>
        <p className="mt-2 text-xs text-hooma-muted">მუსიკა: {job.musicMode === "TIKTOK_CML" ? "TikTok Commercial Music" : "ლიცენზირებული master"}</p>
      </div>
      <div>{job.blockers.length ? <div className="flex flex-wrap gap-2">{job.blockers.slice(0, 4).map((blocker) => <span key={blocker} className="rounded-full bg-amber-50 px-3 py-1.5 text-xs text-amber-950">{blocker}</span>)}</div> : completionMessage ? <p className={`inline-flex items-center gap-2 text-sm font-semibold ${job.state === "published" ? "text-emerald-800" : job.state.startsWith("blocked_") ? "text-amber-900" : "text-slate-700"}`}>{job.state === "published" ? <ShieldCheck size={17} /> : <LockKeyhole size={17} />}{completionMessage}</p> : <p className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-800"><ShieldCheck size={17} />აქტიური ბლოკერი არ ჩანს</p>}</div>
    </li>
  );
}

export default async function SocialAutomationsPage({ searchParams }: { searchParams: SearchParameters }) {
  const actor = await requirePermission("team.manage");
  if (!actor || actor.role !== "owner") redirect("/admin");
  const [data, query] = await Promise.all([loadSocialAutomationDashboard(), searchParams]);
  const resultProvider = singleValue(query.social_provider);
  const result = singleValue(query.social_result);
  const validProvider = resultProvider === "instagram" || resultProvider === "tiktok" ? resultProvider : null;
  const validResult = new Set(["connected", "denied", "failed", "state_rejected"]).has(result ?? "") ? result : null;
  const activeJobs = data.availability.jobs ? data.jobs.filter((job) => !isTerminalAutomationJobState(job.state)) : [];
  const waitingApproval = data.availability.jobs ? activeJobs.filter((job) => job.approvalStatus !== "APPROVED_EXACT").length : null;
  const blockedJobs = data.availability.jobs ? activeJobs.filter((job) => job.blockers.length > 0).length : null;
  const publishedJobs = data.availability.jobs ? data.jobs.filter((job) => job.state === "published").length : null;
  const connectionReadyCount = data.availability.connections ? data.connections.filter((connection) => connection.connected).length : null;
  const eventsAvailable = data.availability.receipts && data.availability.audit;
  const systemArmed = data.switches.globalPublishing && Object.values(data.switches.providers).some((provider) => provider.publishing);

  return (
    <div className="mx-auto max-w-[1500px] space-y-7">
      <header className="overflow-hidden rounded-[2rem] bg-slate-950 px-5 py-7 text-white shadow-soft sm:px-8 sm:py-9">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,.65fr)] lg:items-end">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold"><Bot size={14} />Hooma automation control room</span>
              <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${systemArmed ? "bg-emerald-400/20 text-emerald-200" : "bg-amber-300/15 text-amber-200"}`}><span className={`size-2 rounded-full ${systemArmed ? "bg-emerald-300" : "bg-amber-300"}`} />{systemArmed ? "გამომქვეყნებელი შეიარაღებულია" : "გამოქვეყნება უსაფრთხოდ ჩაკეტილია"}</span>
            </div>
            <h1 className="mt-5 text-3xl font-semibold tracking-tight sm:text-4xl lg:text-5xl">სოციალური ავტომატიზაციები</h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-white/65 sm:text-base">TikTok-ისა და Instagram-ის აპის დამტკიცება, OAuth კავშირი და გამოქვეყნების gate ერთმანეთისგან მკაფიოდ არის გამოყოფილი. ამ გვერდიდან არაფერი ქვეყნდება და არაფერი იშლება.</p>
          </div>
          <div className="grid grid-cols-2 gap-3"><div className="rounded-2xl border border-white/10 bg-white/5 p-4"><p className="text-xs text-white/50">ანგარიშები</p><p className="mt-2 text-3xl font-semibold">{connectionReadyCount === null ? "—" : `${connectionReadyCount}/2`}</p><p className="mt-1 text-xs text-white/55">OAuth მზადაა</p></div><div className="rounded-2xl border border-white/10 bg-white/5 p-4"><p className="text-xs text-white/50">აქტიური რიგი</p><p className="mt-2 text-3xl font-semibold">{data.availability.jobs ? activeJobs.length : "—"}</p><p className="mt-1 text-xs text-white/55">ჩანაწერი</p></div></div>
        </div>
      </header>

      {validProvider && validResult ? <section className={`rounded-[1.5rem] border p-5 text-sm ${validResult === "connected" ? "border-emerald-200 bg-emerald-50 text-emerald-950" : "border-amber-200 bg-amber-50 text-amber-950"}`}><strong>{providerLabels[validProvider]}:</strong> {validResult === "connected" ? "OAuth კავშირი წარმატებით დასრულდა." : validResult === "denied" ? "ავტორიზაცია არ დადასტურდა; არაფერი შეცვლილა." : validResult === "state_rejected" ? "ერთჯერადი ავტორიზაციის მდგომარეობა ვერ დადასტურდა; უსაფრთხოების გამო კავშირი შეჩერდა." : "ავტორიზაცია ვერ დასრულდა; გამოქვეყნება გამორთული რჩება."}</section> : null}

      {!data.setupReady || data.warningCodes.length > 0 ? <section className="flex items-start gap-3 rounded-[1.5rem] border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-950"><AlertTriangle className="mt-0.5 shrink-0" size={20} /><div><strong className="block">დაფა ჯერ სრულ მონაცემებს ვერ კითხულობს.</strong>ერთი ან მეტი ოპერაციული ნაწილი დროებით მიუწვდომელია. სისტემა fail-closed მდგომარეობაშია და უცნობი მონაცემი ნულად არ ითვლება.</div></section> : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[["დასტურს ელოდება", waitingApproval, Clock3, "ზუსტი fingerprint-ის დასტური"], ["ბლოკერით", blockedJobs, LockKeyhole, "არცერთი არ გაიგზავნება"], ["გამოქვეყნებულია", publishedJobs, RadioTower, "დადასტურებული შედეგი"], ["აუდიტის ჩანაწერი", eventsAvailable ? data.events.length : null, ReceiptText, "უსაფრთხო ბოლო მოვლენები"]].map(([label, value, Icon, note]) => { const CardIcon = Icon as typeof Clock3; return <article key={String(label)} className="rounded-[1.5rem] border border-hooma-text/10 bg-white/80 p-5 shadow-sm"><CardIcon size={19} className="text-hooma-accent" /><p className="mt-7 text-xs text-hooma-muted">{label as string}</p><p className="mt-1 text-3xl font-semibold">{typeof value === "number" ? number.format(value) : "—"}</p><p className="mt-2 text-xs text-hooma-muted">{note as string}</p></article>; })}
      </section>

      <section className="grid gap-5 xl:grid-cols-2">{data.connections.map((connection) => <ConnectionCard key={connection.provider} connection={connection} review={reviewForProvider(data.appReviews, connection.provider)} oauthEnabled={data.switches.providers[connection.provider].oauthMaintenance} publishing={data.switches.providers[connection.provider].publishing} apiNetwork={data.switches.providers[connection.provider].apiNetwork} dataAvailable={data.availability.connections} />)}</section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,.65fr)]">
        <article className="rounded-[1.75rem] border border-hooma-text/10 bg-white/80 p-5 shadow-sm sm:p-6">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-hooma-muted">Publishing safety</p><h2 className="mt-2 text-2xl font-semibold">ჩამკეტები და მზადყოფნა</h2></div><span className={`w-fit rounded-full px-3 py-1.5 text-xs font-semibold ${data.switches.globalPublishing ? "bg-emerald-100 text-emerald-900" : "bg-slate-100 text-slate-700"}`}>გლობალური switch: {data.switches.globalPublishing ? "ON" : "OFF"}</span></div>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">{[[ShieldCheck, "Owner approval", "მხოლოდ APPROVED_EXACT და უცვლელი fingerprint"], [Music2, "Music gate", "ჩუმი ვიდეო აკრძალულია; საჭიროა CML ან ლიცენზიის ქვითარი"], [UploadCloud, "Media staging", data.switches.stagingConfigured ? "HTTPS staging origin მზადაა" : "უსაფრთხო staging origin ჯერ არ არის მზად"], [LockKeyhole, "Idempotency", "დუბლიკატის შემოწმება და მხოლოდ ერთჯერადი გაგზავნა"]].map(([Icon, label, note]) => { const ItemIcon = Icon as typeof ShieldCheck; return <div key={String(label)} className="rounded-2xl bg-hooma-background p-4"><ItemIcon size={18} className="text-hooma-accent" /><strong className="mt-4 block text-sm">{label as string}</strong><p className="mt-1 text-xs leading-5 text-hooma-muted">{note as string}</p></div>; })}</div>
        </article>
        <article className="rounded-[1.75rem] border border-hooma-text/10 bg-white/80 p-5 shadow-sm sm:p-6"><p className="text-xs font-semibold uppercase tracking-[0.2em] text-hooma-muted">Owner guidance</p><h2 className="mt-2 text-2xl font-semibold">რას აკონტროლებს აგენტი</h2><ol className="mt-6 space-y-4 text-sm leading-6">{["ამზადებს ვიდეოს, caption-ს, cover-სა და მუსიკის უფლებების ქვითარს.", "ამოწმებს ანგარიშს, პროდუქტს, დუბლიკატს, დასტურსა და უსაფრთხო ვადას.", "ზუსტ დროს აგზავნის მხოლოდ ერთხელ და ინახავს უცვლელ აუდიტს.", "აგროვებს შედეგებს; მიუწვდომელს აჩვენებს როგორც უცნობს და არა ნულს."].map((item, index) => <li key={item} className="flex gap-3"><span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-hooma-text text-xs font-semibold text-white">{index + 1}</span><span>{item}</span></li>)}</ol><p className="mt-6 rounded-2xl bg-blue-50 p-4 text-xs leading-5 text-blue-950"><strong className="block">Facebook გათიშულია.</strong>Instagram-ის ავტომატიზაცია Facebook-ზე არაფერს გადააზიარებს, სანამ ცალკე წესით არ დამტკიცდება.</p></article>
      </section>

      <section className="rounded-[1.75rem] border border-hooma-text/10 bg-white/80 p-5 shadow-sm sm:p-6"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-hooma-muted">Canonical queue</p><h2 className="mt-2 text-2xl font-semibold">გამოსაქვეყნებელი რიგი</h2></div><span className="text-xs text-hooma-muted">ნაჩვენებია მხოლოდ უსაფრთხო ოპერაციული სტატუსები</span></div><ul className="mt-6">{!data.availability.jobs ? <li className="rounded-2xl border border-dashed border-amber-300 bg-amber-50 px-5 py-12 text-center text-amber-950"><AlertTriangle className="mx-auto" /><p className="mt-3 font-semibold">რიგის მონაცემები მიუწვდომელია</p><p className="mt-1 text-sm">უცნობი მდგომარეობა ცარიელ რიგად არ ითვლება.</p></li> : data.jobs.length ? data.jobs.slice(0, 10).map((job, index) => <QueueItem key={`${job.provider}-${job.scheduledAt}-${index}`} job={job} />) : <li className="rounded-2xl border border-dashed border-hooma-text/15 px-5 py-12 text-center"><UploadCloud className="mx-auto text-hooma-muted" /><p className="mt-3 font-semibold">რიგში ჩანაწერი არ არის</p><p className="mt-1 text-sm text-hooma-muted">ახალი პაკეტი გამოჩნდება მხოლოდ მომზადებისა და უსაფრთხო შემოწმებების შემდეგ.</p></li>}</ul></section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,.85fr)_minmax(0,1.15fr)]">
        <article className="rounded-[1.75rem] border border-hooma-text/10 bg-white/80 p-5 shadow-sm sm:p-6"><div className="flex items-center gap-3"><BarChart3 className="text-hooma-accent" /><div><p className="text-xs uppercase tracking-[0.2em] text-hooma-muted">Performance</p><h2 className="mt-1 text-2xl font-semibold">ბოლო მეტრიკები</h2></div></div><div className="mt-6 space-y-3">{!data.availability.metrics ? <div className="rounded-2xl border border-dashed border-amber-300 bg-amber-50 px-5 py-10 text-center text-sm text-amber-950">მეტრიკები დროებით მიუწვდომელია — ეს არ ნიშნავს ნულს.</div> : data.metrics.length ? data.metrics.map((metric, index) => <div key={`${metric.capturedAt}-${index}`} className="rounded-2xl bg-hooma-background p-4"><div className="flex items-center justify-between gap-3"><strong>{metric.provider ? providerLabels[metric.provider] : "პლატფორმა"}</strong><span className="text-xs text-hooma-muted">{formatDate(metric.capturedAt)}</span></div><div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs"><div><span className="block text-lg font-semibold">{metric.views === null ? "—" : number.format(metric.views)}</span>ნახვა</div><div><span className="block text-lg font-semibold">{metric.comments === null ? "—" : number.format(metric.comments)}</span>კომენტარი</div><div><span className="block text-lg font-semibold">{metric.clicks === null ? "—" : number.format(metric.clicks)}</span>გადასვლა</div></div></div>) : <div className="rounded-2xl border border-dashed border-hooma-text/15 px-5 py-10 text-center text-sm text-hooma-muted">მეტრიკები ჯერ არ არის ჩაწერილი.</div>}</div></article>
        <article className="rounded-[1.75rem] border border-hooma-text/10 bg-white/80 p-5 shadow-sm sm:p-6"><div className="flex items-center gap-3"><Activity className="text-hooma-accent" /><div><p className="text-xs uppercase tracking-[0.2em] text-hooma-muted">Receipts & audit</p><h2 className="mt-1 text-2xl font-semibold">ბოლო უსაფრთხო მოვლენები</h2></div></div><ol className="mt-6 space-y-1">{!eventsAvailable ? <li className="rounded-2xl border border-dashed border-amber-300 bg-amber-50 px-5 py-10 text-center text-sm text-amber-950">აუდიტისა და ქვითრების მონაცემები დროებით მიუწვდომელია.</li> : data.events.length ? data.events.map((event, index) => <li key={`${event.createdAt}-${index}`} className="flex gap-4 rounded-2xl px-3 py-3 transition hover:bg-hooma-background"><span className={`mt-1 size-2 shrink-0 rounded-full ${event.kind === "receipt" ? "bg-emerald-500" : event.kind === "audit" ? "bg-amber-500" : "bg-blue-500"}`} /><div className="min-w-0 flex-1"><p className="text-sm font-medium">{event.label}</p><p className="mt-1 text-xs text-hooma-muted">{event.provider ? providerLabels[event.provider] : "კავშირის სისტემა"} · {formatDate(event.createdAt)}</p></div></li>) : <li className="rounded-2xl border border-dashed border-hooma-text/15 px-5 py-10 text-center text-sm text-hooma-muted">აუდიტის ჩანაწერები ჯერ არ არის.</li>}</ol></article>
      </section>

      <footer className="flex flex-col justify-between gap-3 rounded-[1.5rem] border border-blue-200 bg-blue-50 p-5 text-sm leading-6 text-blue-950 sm:flex-row sm:items-center"><div><strong className="block">ეს არის მონიტორინგისა და OAuth კავშირის დაფა.</strong>ანგარიშის ID-ები, ტოკენები, hash-ები და ფაილის შიდა მისამართები ამ გვერდზე არასოდეს გამოდის. გამოქვეყნების, წაშლის, boost-ის ან ხარჯვის კონტროლი აქ არ არსებობს.</div><Link href="/admin/settings" className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-full border border-blue-900/15 bg-white px-4 text-xs font-semibold">ფასების პარამეტრები</Link></footer>
    </div>
  );
}
