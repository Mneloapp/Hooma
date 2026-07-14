import { Download, FileBox, ShieldCheck, WalletCards } from "lucide-react";
import { requirePermission } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { quoteCustomRequestAction } from "./actions";

type QuoteFile = { id: string; storage_path: string; original_name: string; size_bytes: number; signedUrl?: string };
type QuoteRequest = {
  id: string;
  title: string;
  description: string;
  quantity: number;
  dimensions: string | null;
  material_preference: string | null;
  color_preference: string | null;
  status: string;
  quoted_price: number | null;
  quoted_lead_days: number | null;
  quote_notes: string | null;
  files_verified: boolean;
  created_at: string;
  custom_quote_files?: QuoteFile[];
};

const formatBytes = (bytes: number) => bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;

export default async function AdminCustomOrdersPage() {
  const profile = await requirePermission("quotes.manage");
  if (!profile) redirect("/login?next=/admin/custom-orders");
  const admin = createAdminClient() as any;
  const { data } = admin
    ? await admin.from("custom_quote_requests").select("*, custom_quote_files(*)").order("created_at", { ascending: true })
    : { data: [] };
  const requests = (data ?? []) as QuoteRequest[];

  if (admin) {
    await Promise.all(requests.flatMap((request) => (request.custom_quote_files ?? []).map(async (file) => {
      const { data: signed } = await admin.storage.from("custom-quote-files").createSignedUrl(file.storage_path, 900);
      file.signedUrl = signed?.signedUrl;
    })));
  }

  const pending = requests.filter((request) => ["submitted", "under_review", "needs_information"].includes(request.status));

  return (
    <div className="space-y-6">
      <div><p className="text-xs uppercase tracking-[0.28em] text-hooma-muted">Custom manufacturing</p><h1 className="mt-3 text-4xl font-medium">Custom quote requests</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-hooma-muted">Inspect private customer files, confirm manufacturability, and publish an individual price. Quoting never starts a printer.</p></div>

      <div className="grid gap-4 sm:grid-cols-3">{[["Awaiting review", pending.length], ["Quoted", requests.filter((item) => item.status === "quoted").length], ["Payment / production", requests.filter((item) => ["payment_pending", "paid", "production_queued", "in_production"].includes(item.status)).length]].map(([label, value]) => <div key={String(label)} className="rounded-2xl bg-white/75 p-5 shadow-sm"><p className="text-sm text-hooma-muted">{label}</p><p className="mt-3 text-3xl font-semibold">{value}</p></div>)}</div>

      <div className="grid gap-5">
        {requests.length ? requests.map((request) => (
          <article key={request.id} className="rounded-[1.5rem] border border-hooma-text/10 bg-white/75 p-5 shadow-sm lg:p-6">
            <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start"><div><p className="text-xs text-hooma-muted">#{request.id.slice(0, 8).toUpperCase()} · {new Date(request.created_at).toLocaleString("en-GB")}</p><h2 className="mt-2 text-2xl font-semibold">{request.title}</h2><p className="mt-3 max-w-3xl text-sm leading-6 text-hooma-muted">{request.description}</p></div><span className="w-fit rounded-full bg-hooma-panel px-3 py-1.5 text-xs font-semibold">{request.status}</span></div>

            <div className="mt-5 grid gap-3 rounded-2xl bg-hooma-background p-4 text-sm sm:grid-cols-3"><p><span className="text-hooma-muted">Quantity:</span> {request.quantity}</p><p><span className="text-hooma-muted">Dimensions:</span> {request.dimensions || "Not provided"}</p><p><span className="text-hooma-muted">Preference:</span> {[request.material_preference, request.color_preference].filter(Boolean).join(" / ") || "Not provided"}</p></div>

            <div className="mt-5"><h3 className="text-sm font-semibold">Private files</h3><div className="mt-2 grid gap-2 sm:grid-cols-2">{request.custom_quote_files?.length ? request.custom_quote_files.map((file) => <a key={file.id} href={file.signedUrl || "#"} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-xl border border-hooma-text/10 bg-white px-3 py-3 text-sm transition hover:border-hooma-accent/40"><FileBox size={17} className="shrink-0 text-hooma-accent" /><span className="min-w-0 flex-1 truncate">{file.original_name}</span><span className="text-xs text-hooma-muted">{formatBytes(file.size_bytes)}</span><Download size={15} /></a>) : <p className="text-sm text-hooma-muted">No attached files.</p>}</div></div>

            {["submitted", "under_review", "needs_information"].includes(request.status) ? (
              <form action={quoteCustomRequestAction} className="mt-6 grid gap-4 rounded-2xl border border-hooma-text/10 bg-hooma-panel/55 p-4 sm:grid-cols-2 lg:grid-cols-4">
                <input type="hidden" name="request_id" value={request.id} />
                <label className="text-sm font-medium">Unit price (GEL)<input name="quoted_price" type="number" min="0" step="0.01" required className="mt-2 w-full rounded-xl border border-hooma-text/10 bg-white px-3 py-2.5 outline-none focus:border-hooma-accent" /></label>
                <label className="text-sm font-medium">Lead time, business days<input name="quoted_lead_days" type="number" min="1" max="90" defaultValue="3" required className="mt-2 w-full rounded-xl border border-hooma-text/10 bg-white px-3 py-2.5 outline-none focus:border-hooma-accent" /></label>
                <label className="text-sm font-medium sm:col-span-2">Quote notes<input name="quote_notes" maxLength={2000} className="mt-2 w-full rounded-xl border border-hooma-text/10 bg-white px-3 py-2.5 outline-none focus:border-hooma-accent" /></label>
                <label className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900 sm:col-span-2 lg:col-span-3"><input name="files_verified" type="checkbox" required className="mt-1" /><span><strong className="block">Files and manufacturability verified</strong>I reviewed the file type, geometry, rights/safety context, material, plate plan, and production feasibility.</span></label>
                <button className="flex min-h-11 items-center justify-center gap-2 rounded-full bg-hooma-text px-4 text-sm font-semibold text-white"><WalletCards size={16} />Publish quote</button>
              </form>
            ) : <div className="mt-5 flex items-center gap-2 rounded-xl bg-hooma-panel p-4 text-sm"><ShieldCheck size={17} className="text-hooma-accent" />Quote: {request.quoted_price === null ? "not set" : `₾${request.quoted_price} / unit`} · {request.quoted_lead_days ?? "—"} business days · Files {request.files_verified ? "verified" : "not verified"}</div>}
          </article>
        )) : <div className="rounded-[1.5rem] border border-dashed border-hooma-text/15 bg-white/55 px-6 py-16 text-center"><FileBox className="mx-auto text-hooma-muted" /><p className="mt-4 font-semibold">No custom requests yet</p><p className="mt-2 text-sm text-hooma-muted">Authenticated customer submissions will appear here.</p></div>}
      </div>
    </div>
  );
}
