import { BadgeCheck, Star } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { moderateProductReviewAction } from "@/app/admin/reviews/actions";

export const dynamic = "force-dynamic";

const dateFormatter = new Intl.DateTimeFormat("ka-GE", { dateStyle: "medium", timeStyle: "short" });
const statusLabel: Record<string, string> = { published: "გამოქვეყნებული", hidden: "დამალული", rejected: "უარყოფილი" };

export default async function AdminReviewsPage() {
  const admin = createAdminClient() as any;
  const { data: rows, error } = admin ? await admin
    .from("product_reviews")
    .select("id,rating,comment,status,verified_purchase,moderation_note,created_at,updated_at,products!product_reviews_product_id_fkey(name_ka,hooma_name),profiles!product_reviews_profile_id_fkey(full_name,email)")
    .order("created_at", { ascending: false })
    .limit(200) : { data: [], error: null };

  return <div className="space-y-6"><div><p className="text-xs uppercase tracking-[0.28em] text-hooma-muted">Catalog trust</p><h1 className="mt-3 text-4xl font-medium">შეფასებების მოდერაცია</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-hooma-muted">ყველა შეფასება რეალურ მიწოდებულ შეკვეთას უკავშირდება. აქ შეგიძლია შეურაცხმყოფელი ან შეუსაბამო კომენტარის დამალვა და საჭიროების შემთხვევაში ხელახლა გამოქვეყნება.</p></div>
    {error ? <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">შეფასებების ცხრილი ჯერ არ არის ხელმისაწვდომი — გაუშვი ბოლო Supabase migration.</div> : null}
    <div className="grid gap-4">{(rows ?? []).map((row: any) => { const product = Array.isArray(row.products) ? row.products[0] : row.products; const author = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles; return <article key={row.id} className="rounded-[1.5rem] border border-hooma-text/10 bg-white/75 p-5 shadow-sm"><div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-3 py-1 text-xs font-semibold ${row.status === "published" ? "bg-emerald-100 text-emerald-800" : row.status === "rejected" ? "bg-red-100 text-red-800" : "bg-slate-100 text-slate-700"}`}>{statusLabel[row.status] ?? row.status}</span>{row.verified_purchase ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700"><BadgeCheck size={13} />დადასტურებული შეძენა</span> : null}</div><h2 className="mt-3 text-lg font-semibold">{product?.name_ka || product?.hooma_name || "პროდუქტი"}</h2><div className="mt-2 flex items-center gap-2"><span className="inline-flex">{[1, 2, 3, 4, 5].map((star) => <Star key={star} size={15} className={star <= Number(row.rating) ? "fill-amber-400 text-amber-400" : "text-hooma-text/20"} />)}</span><span className="text-xs text-hooma-muted">{author?.full_name || author?.email || "მომხმარებელი"} · {dateFormatter.format(new Date(row.created_at))}</span></div><p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-hooma-muted">{row.comment}</p>{row.moderation_note ? <p className="mt-3 rounded-xl bg-hooma-panel p-3 text-xs">მოდერაციის შენიშვნა: {row.moderation_note}</p> : null}</div>
      <form action={moderateProductReviewAction} className="w-full rounded-2xl bg-hooma-panel p-4 lg:w-80"><input type="hidden" name="review_id" value={row.id} /><label className="text-xs font-semibold">შიდა შენიშვნა<textarea name="note" maxLength={1000} rows={3} defaultValue={row.moderation_note ?? ""} className="mt-2 w-full rounded-xl border border-hooma-text/10 bg-white px-3 py-2 text-sm font-normal outline-none" /></label><div className="mt-3 grid grid-cols-3 gap-2"><button name="status" value="published" className="rounded-lg bg-emerald-700 px-2 py-2 text-xs font-semibold text-white">გამოქვეყნება</button><button name="status" value="hidden" className="rounded-lg bg-slate-700 px-2 py-2 text-xs font-semibold text-white">დამალვა</button><button name="status" value="rejected" className="rounded-lg bg-red-700 px-2 py-2 text-xs font-semibold text-white">უარყოფა</button></div></form></div></article>; })}
      {!rows?.length && !error ? <div className="rounded-[1.5rem] border border-dashed border-hooma-text/20 bg-white/45 px-6 py-16 text-center text-sm text-hooma-muted">შეფასებები ჯერ არ არის.</div> : null}</div>
  </div>;
}
