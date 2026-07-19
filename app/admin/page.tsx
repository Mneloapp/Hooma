import Link from "next/link";
import { ArrowUpRight, CalendarDays, ClipboardList, Factory, PackagePlus, Settings2 } from "lucide-react";
import { redirect } from "next/navigation";
import { AttendancePanel, HrDataQualityNotice, HrSetupNotice, PersonalKpiGrid, TeamOverview } from "@/components/admin/HrDashboardPanels";
import { hasPermission, roleLabels } from "@/lib/auth/permissions";
import { loadHrDashboard } from "@/lib/hr/dashboard";
import { requireStaff } from "@/lib/supabase/server";

export default async function AdminDashboard({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const params = await searchParams;
  const profile = await requireStaff();
  if (!profile) redirect("/login?next=/admin");
  const data = await loadHrDashboard(profile);
  const canManageHr = hasPermission(profile.role, "hr.manage");
  const shortcuts = [
    hasPermission(profile.role, "orders.manage") ? { href: "/admin/orders", label: "შეკვეთების კანბანი", note: "გადაანაწილე შეკვეთები ეტაპებს შორის", icon: <ClipboardList size={20} /> } : null,
    hasPermission(profile.role, "production.manage") ? { href: "/admin/production", label: "წარმოების მართვა", note: "პრინტერები, რიგი და ხარისხის კონტროლი", icon: <Factory size={20} /> } : null,
    hasPermission(profile.role, "inventory.manage") ? { href: "/admin/inventory", label: "მარაგის მიღება", note: "დააფიქსირე მიღებული მასალა და ლოკაცია", icon: <PackagePlus size={20} /> } : null,
    hasPermission(profile.role, "catalog.manage") ? { href: "/admin/products", label: "კატალოგის მართვა", note: "პროდუქტები, Draft-ები და რედაქტირება", icon: <Settings2 size={20} /> } : null,
  ].filter((item): item is NonNullable<typeof item> => Boolean(item));

  return (
    <div className="space-y-8">
      <header className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-hooma-muted">Hooma team workspace</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">გამარჯობა, {profile.full_name?.split(" ")[0] || "თანამშრომელო"}</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-hooma-muted">{roleLabels[profile.role]} · {data.actor.employment?.job_title || "HR პროფილი"} · დღევანდელი სამუშაო, პირადი KPI და ოპერაციული ამოცანები ერთ სივრცეში.</p>
        </div>
        <Link href="/admin/hr" className="inline-flex min-h-11 w-fit items-center gap-2 rounded-full border border-hooma-text/15 bg-white px-5 text-sm font-semibold shadow-sm transition hover:-translate-y-0.5 hover:shadow-soft"><CalendarDays size={17} />HR ცენტრი<ArrowUpRight size={15} /></Link>
      </header>

      {params.notice ? <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{params.notice}</p> : null}
      {params.error ? <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{params.error}</p> : null}
      <HrSetupNotice setupMissing={data.setupMissing} />
      <HrDataQualityNotice warnings={data.loadWarnings} setupMissing={data.setupMissing} />

      <div className="grid gap-6 xl:grid-cols-[minmax(360px,.75fr)_minmax(0,1.25fr)]">
        <AttendancePanel staff={data.actor} returnTo="/admin" disabled={data.setupMissing} />
        <section className="rounded-[1.75rem] border border-hooma-text/10 bg-white/75 p-5 shadow-sm sm:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-hooma-muted">სწრაფი მოქმედებები</p>
          <h2 className="mt-3 text-2xl font-semibold">დღევანდელი სამუშაო</h2>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {shortcuts.map((shortcut) => <Link key={shortcut.href} href={shortcut.href} className="group rounded-2xl border border-hooma-text/10 bg-white p-4 transition hover:-translate-y-0.5 hover:border-hooma-accent/40 hover:shadow-soft"><span className="inline-flex rounded-xl bg-[#fff2e8] p-2 text-[#c2410c]">{shortcut.icon}</span><strong className="mt-4 block">{shortcut.label}</strong><span className="mt-1 block text-xs leading-5 text-hooma-muted">{shortcut.note}</span></Link>)}
          </div>
        </section>
      </div>

      <PersonalKpiGrid staff={data.actor} monthLabel={data.monthLabel} />
      {canManageHr ? <TeamOverview data={data} /> : null}

      <section className="rounded-[1.5rem] border border-blue-200 bg-blue-50 p-5 text-sm leading-6 text-blue-950">
        <strong className="block">KPI განმარტება</strong>
        ეს დაფა აჩვენებს ფაქტობრივ ოპერაციულ მონაცემებს და არა დასჯის ავტომატურ ქულას: კილოგრამები მოდის ERP-ის რეალური ხარჯვიდან; „ვადამდე მზად“ ადარებს თანამშრომელზე განაწილებული ბეჭდვის დასრულებას მომხმარებლის დაპირებულ მიწოდების დროს; „განაწილებიდან დაწყებამდე“ არის სამუშაოს start-მდე მისვლის მაჩვენებელი და არა თანამშრომლის ბრალეულობის შეფასება.
      </section>
    </div>
  );
}
