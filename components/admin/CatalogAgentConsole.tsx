"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Bot, CheckCircle2, Clock3, Copy, ExternalLink, KeyRound, ListTodo, OctagonX, Play, TriangleAlert } from "lucide-react";
import {
  cancelCatalogAgentJobAction,
  createCatalogAgentAction,
  createCatalogAgentJobAction,
  toggleCatalogAgentAction,
} from "@/app/admin/catalog-agent/actions";

type Agent = {
  id: string;
  name: string;
  token_prefix: string;
  is_active: boolean;
  last_seen_at: string | null;
  created_at: string;
};

type Category = { id: string; name: string };
type Job = {
  id: string;
  agent_id: string;
  source_platform: string;
  source_url: string;
  category_label: string;
  status: string;
  max_products: number;
  discovered_count: number;
  processed_count: number;
  draft_count: number;
  review_count: number;
  duplicate_count: number;
  failed_count: number;
  worker_name: string | null;
  error_message: string | null;
  created_at: string;
};

type Item = {
  id: string;
  job_id: string;
  source_url: string;
  source_title: string | null;
  status: string;
  product_id: string | null;
  source_import_id: string | null;
  error_message: string | null;
  processed_at: string | null;
};

const inputClass = "mt-2 w-full rounded-2xl border border-hooma-text/10 bg-white px-4 py-3 outline-none transition focus:border-hooma-accent";
const date = (value: string | null) => value
  ? new Intl.DateTimeFormat("ka-GE", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value))
  : "ჯერ არ დაკავშირებულა";

const jobStatusLabel: Record<string, string> = {
  queued: "რიგშია",
  running: "მუშაობს",
  paused: "შეჩერებულია",
  completed: "დასრულდა",
  failed: "შეცდომა",
  cancelled: "გაუქმდა",
};

const itemStatusLabel: Record<string, string> = {
  discovered: "აღმოჩენილია",
  processing: "მუშავდება",
  draft_created: "Draft შეიქმნა",
  needs_review: "შესამოწმებელია",
  duplicate: "დუბლია",
  failed: "შეცდომა",
};

export function CatalogAgentConsole({
  agents,
  categories,
  jobs,
  items,
  canManageAgents,
  migrationReady,
}: {
  agents: Agent[];
  categories: Category[];
  jobs: Job[];
  items: Item[];
  canManageAgents: boolean;
  migrationReady: boolean;
}) {
  const [agentState, createAgent, agentPending] = useActionState(createCatalogAgentAction, {});
  const [jobState, createJob, jobPending] = useActionState(createCatalogAgentJobAction, {});
  const activeAgents = agents.filter((agent) => agent.is_active);
  const agentNames = new Map(agents.map((agent) => [agent.id, agent.name]));
  const jobNames = new Map(jobs.map((job) => [job.id, job.category_label]));

  return (
    <div className="space-y-6">
      {!migrationReady ? <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-950"><strong className="block">Catalog Agent migration ჯერ Supabase-ში არ არის გაშვებული.</strong><span>Hooma-ს ტერმინალში გაუშვი <code className="rounded bg-amber-100 px-1.5 py-0.5">supabase db push --linked</code> და შემდეგ განაახლე გვერდი.</span></div> : null}
      <section className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
        <div className="rounded-[1.75rem] bg-white/75 p-6 shadow-soft">
          <div className="flex items-start gap-3"><span className="rounded-2xl bg-hooma-accent/10 p-3 text-hooma-accent"><Bot size={22} /></span><div><h2 className="text-xl font-semibold">აგენტის რეგისტრაცია</h2><p className="mt-1 text-sm leading-6 text-hooma-muted">Machine identity მხოლოდ დავალებებს იღებს და Draft-ებს ქმნის. გამოქვეყნება და წაშლა აკრძალულია.</p></div></div>
          {canManageAgents ? <form action={createAgent} className="mt-6"><label className="text-sm font-medium">აგენტის სახელი<input name="name" defaultValue="Hooma Catalog Agent · Windows 01" required className={inputClass} /></label><button disabled={agentPending || !migrationReady} className="mt-4 inline-flex items-center gap-2 rounded-full bg-hooma-text px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"><KeyRound size={16} />{agentPending ? "რეგისტრირდება..." : "აგენტის რეგისტრაცია"}</button></form> : <p className="mt-5 rounded-2xl bg-hooma-panel p-4 text-sm text-hooma-muted">ახალი machine identity-ის შექმნა მხოლოდ Owner-ს შეუძლია.</p>}
          {agentState.message ? <div className={`mt-4 rounded-2xl p-4 text-sm ${agentState.ok ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-red-900"}`}><p>{agentState.message}</p>{agentState.token ? <div className="mt-3 rounded-xl bg-hooma-text p-3 text-white"><div className="flex items-center justify-between gap-3"><code className="min-w-0 break-all text-xs">{agentState.token}</code><button type="button" title="ტოკენის კოპირება" onClick={() => navigator.clipboard.writeText(agentState.token!)} className="shrink-0 rounded-full bg-white/10 p-2 hover:bg-white/20"><Copy size={15} /></button></div></div> : null}</div> : null}
        </div>

        <form action={createJob} className="rounded-[1.75rem] bg-white/75 p-6 shadow-soft">
          <div className="flex items-start gap-3"><span className="rounded-2xl bg-hooma-accent/10 p-3 text-hooma-accent"><ListTodo size={22} /></span><div><h2 className="text-xl font-semibold">კატეგორიის ახალი დავალება</h2><p className="mt-1 text-sm leading-6 text-hooma-muted">ჩასვი კატეგორიის გვერდი, მიუთითე Hooma-ს კატეგორია და აგენტი თავად გაივლის პროდუქტებს.</p></div></div>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <label className="text-sm font-medium md:col-span-2">კატეგორიის წყარო<input name="source_url" type="url" required placeholder="https://makerworld.com/en/3d-models/..." className={inputClass} /></label>
            <label className="text-sm font-medium">Catalog Agent<select name="agent_id" required className={inputClass} disabled={!activeAgents.length}><option value="">აირჩიე აგენტი</option>{activeAgents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</select></label>
            <label className="text-sm font-medium">Hooma-ს კატეგორია<select name="category_id" required className={inputClass}><option value="">აირჩიე კატეგორია</option>{categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
            <label className="text-sm font-medium">მაქსიმალური პროდუქტები<input name="max_products" type="number" min="1" max="10000" defaultValue="500" required className={inputClass} /></label>
          </div>
          <button disabled={jobPending || !activeAgents.length || !migrationReady} className="mt-5 inline-flex items-center gap-2 rounded-full bg-hooma-accent px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"><Play size={16} />{jobPending ? "რიგში ემატება..." : "დავალების გაშვება"}</button>
          {!activeAgents.length ? <p className="mt-3 text-sm text-amber-800">ჯერ დაარეგისტრირე და გაააქტიურე Catalog Agent.</p> : null}
          {jobState.message ? <p className={`mt-4 rounded-2xl p-4 text-sm ${jobState.ok ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-red-900"}`}>{jobState.message}</p> : null}
        </form>
      </section>

      <section className="rounded-[1.75rem] bg-white/75 p-6 shadow-soft">
        <h2 className="text-xl font-semibold">რეგისტრირებული აგენტები</h2>
        <div className="mt-5 grid gap-3 lg:grid-cols-2">{agents.length ? agents.map((agent) => <article key={agent.id} className="rounded-2xl border border-hooma-text/10 bg-white p-4"><div className="flex items-start justify-between gap-4"><div><p className="font-semibold">{agent.name}</p><p className="mt-1 text-xs text-hooma-muted">Token · {agent.token_prefix}•••• · ბოლო კავშირი: {date(agent.last_seen_at)}</p></div><span className={`rounded-full px-3 py-1 text-xs font-semibold ${agent.is_active ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}>{agent.is_active ? "აქტიურია" : "გათიშულია"}</span></div>{canManageAgents ? <form action={toggleCatalogAgentAction} className="mt-4"><input type="hidden" name="agent_id" value={agent.id} /><input type="hidden" name="is_active" value={String(!agent.is_active)} /><button className="text-xs font-semibold underline underline-offset-4">{agent.is_active ? "წვდომის გაუქმება" : "წვდომის აღდგენა"}</button></form> : null}</article>) : <p className="rounded-2xl bg-hooma-panel p-5 text-sm text-hooma-muted">Catalog Agent ჯერ არ არის რეგისტრირებული.</p>}</div>
      </section>

      <section className="overflow-hidden rounded-[1.75rem] bg-white/75 shadow-soft">
        <div className="p-6"><h2 className="text-xl font-semibold">დავალებების პროგრესი</h2><p className="mt-2 text-sm text-hooma-muted">Worker შეწყვეტის შემდეგ იმავე დაუმუშავებელი პროდუქტიდან აგრძელებს.</p></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[1100px] text-left text-sm"><thead className="bg-hooma-panel text-xs uppercase tracking-[0.12em] text-hooma-muted"><tr><th className="px-5 py-4">დავალება</th><th className="px-5 py-4">სტატუსი</th><th className="px-5 py-4">პროგრესი</th><th className="px-5 py-4">შედეგი</th><th className="px-5 py-4">მართვა</th></tr></thead><tbody className="divide-y divide-hooma-text/10">{jobs.length ? jobs.map((job) => <tr key={job.id}><td className="px-5 py-4"><a href={job.source_url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 font-semibold hover:text-hooma-accent">{job.category_label}<ExternalLink size={13} /></a><span className="block text-xs text-hooma-muted">{job.source_platform} · {agentNames.get(job.agent_id) ?? "Agent"} · ლიმიტი {job.max_products}</span>{job.error_message ? <span className="mt-1 block max-w-md text-xs text-red-700">{job.error_message}</span> : null}</td><td className="px-5 py-4"><span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${job.status === "completed" ? "bg-emerald-100 text-emerald-800" : job.status === "running" ? "bg-sky-100 text-sky-800" : job.status === "failed" ? "bg-red-100 text-red-800" : "bg-hooma-panel text-hooma-muted"}`}>{job.status === "running" ? <Clock3 size={13} /> : job.status === "completed" ? <CheckCircle2 size={13} /> : job.status === "failed" ? <TriangleAlert size={13} /> : null}{jobStatusLabel[job.status] ?? job.status}</span>{job.worker_name ? <span className="mt-1 block text-xs text-hooma-muted">{job.worker_name}</span> : null}</td><td className="px-5 py-4"><span className="font-semibold">{job.processed_count}/{job.discovered_count}</span><div className="mt-2 h-1.5 w-40 overflow-hidden rounded-full bg-hooma-panel"><div className="h-full rounded-full bg-hooma-accent" style={{ width: `${job.discovered_count ? Math.min(100, (job.processed_count / job.discovered_count) * 100) : 0}%` }} /></div></td><td className="px-5 py-4 text-xs leading-5"><span className="text-emerald-800">Draft {job.draft_count}</span> · <span className="text-amber-800">Review {job.review_count}</span><br /><span className="text-hooma-muted">დუბლია {job.duplicate_count} · შეცდომა {job.failed_count}</span></td><td className="px-5 py-4">{["queued", "running", "paused"].includes(job.status) ? <form action={cancelCatalogAgentJobAction}><input type="hidden" name="job_id" value={job.id} /><button className="inline-flex items-center gap-1 text-xs font-semibold text-red-700"><OctagonX size={14} />გაუქმება</button></form> : <span className="text-xs text-hooma-muted">—</span>}</td></tr>) : <tr><td colSpan={5} className="px-5 py-10 text-center text-hooma-muted">დავალებები ჯერ არ შექმნილა.</td></tr>}</tbody></table></div>
      </section>

      <section className="overflow-hidden rounded-[1.75rem] bg-white/75 shadow-soft">
        <div className="p-6"><h2 className="text-xl font-semibold">აგენტის ბოლო შედეგები</h2><p className="mt-2 text-sm text-hooma-muted">სრული მონაცემები პირდაპირ პროდუქტების Draft-ში ხვდება; არასრული ჩანაწერები — Import review-ში.</p></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-hooma-panel text-xs uppercase tracking-[0.12em] text-hooma-muted"><tr><th className="px-5 py-4">პროდუქტი</th><th className="px-5 py-4">დავალება</th><th className="px-5 py-4">შედეგი</th><th className="px-5 py-4">გახსნა</th></tr></thead><tbody className="divide-y divide-hooma-text/10">{items.length ? items.map((item) => <tr key={item.id}><td className="px-5 py-4"><a href={item.source_url} target="_blank" rel="noreferrer noopener" className="font-medium hover:text-hooma-accent">{item.source_title || "წყაროს პროდუქტი"}</a>{item.error_message ? <span className="mt-1 block max-w-xl text-xs text-red-700">{item.error_message}</span> : null}</td><td className="px-5 py-4 text-hooma-muted">{jobNames.get(item.job_id) ?? "კატეგორია"}</td><td className="px-5 py-4"><span className={`rounded-full px-3 py-1 text-xs font-semibold ${item.status === "draft_created" ? "bg-emerald-100 text-emerald-800" : item.status === "needs_review" ? "bg-amber-100 text-amber-900" : item.status === "failed" ? "bg-red-100 text-red-800" : "bg-hooma-panel text-hooma-muted"}`}>{itemStatusLabel[item.status] ?? item.status}</span></td><td className="px-5 py-4">{item.product_id ? <Link href={`/admin/products/${item.product_id}`} className="text-xs font-semibold underline underline-offset-4">Product Draft</Link> : item.source_import_id ? <Link href={`/admin/imports/${item.source_import_id}`} className="text-xs font-semibold underline underline-offset-4">Review</Link> : <span className="text-xs text-hooma-muted">—</span>}</td></tr>) : <tr><td colSpan={4} className="px-5 py-10 text-center text-hooma-muted">აგენტის შედეგები აქ გამოჩნდება.</td></tr>}</tbody></table></div>
      </section>
    </div>
  );
}
