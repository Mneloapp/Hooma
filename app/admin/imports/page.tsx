import { AlertTriangle, ArrowRight, Link2, ShieldCheck } from "lucide-react";

export default function ImportInboxPage() {
  return (
    <div className="space-y-6">
      <div><p className="text-xs uppercase tracking-[0.28em] text-hooma-muted">Catalog sources</p><h1 className="mt-3 text-4xl font-medium">Import inbox</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-hooma-muted">Paste a MakerWorld or other source URL to create a review task. V1 does not publish or download files automatically.</p></div>
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <form className="rounded-[2rem] bg-white/75 p-6 shadow-soft">
          <label className="text-sm font-medium">Source URL<div className="mt-2 flex rounded-full border border-hooma-text/10 bg-white p-1 focus-within:border-hooma-accent"><span className="grid h-11 w-11 place-items-center text-hooma-muted"><Link2 size={18} /></span><input type="url" placeholder="https://makerworld.com/..." className="min-w-0 flex-1 bg-transparent px-2 outline-none" /><button type="button" className="rounded-full bg-hooma-text px-5 text-sm font-medium text-white">Create review</button></div></label>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {["Source and creator", "Commercial-use rights", "Media usage rights", "Print profile and plates", "Material and print time", "Hooma category and copy"].map((item, index) => <div key={item} className="flex items-center gap-3 rounded-2xl bg-hooma-panel/70 p-4 text-sm"><span className="grid h-7 w-7 place-items-center rounded-full bg-white text-xs font-semibold">{index + 1}</span>{item}</div>)}
          </div>
        </form>
        <aside className="space-y-4">
          <div className="rounded-[1.5rem] border border-amber-200 bg-amber-50 p-5 text-amber-950"><AlertTriangle size={20} /><h2 className="mt-5 font-semibold">License gate</h2><p className="mt-2 text-sm leading-6 text-amber-900/75">No product can be published until commercial use and media rights are explicitly verified and recorded.</p></div>
          <div className="rounded-[1.5rem] border border-hooma-text/10 bg-white/75 p-5"><ShieldCheck size={20} className="text-hooma-accent" /><h2 className="mt-5 font-semibold">Operator review</h2><p className="mt-2 text-sm leading-6 text-hooma-muted">Automation may prepare a draft, but a person approves source rights, safety, manufacturability, and price.</p></div>
        </aside>
      </div>
      <div className="overflow-hidden rounded-[1.5rem] bg-white/75 shadow-soft"><div className="border-b border-hooma-text/10 px-6 py-5"><h2 className="font-semibold">Import queue</h2></div><div className="flex flex-col items-center px-6 py-16 text-center"><div className="grid h-12 w-12 place-items-center rounded-2xl bg-hooma-panel"><ArrowRight size={19} /></div><p className="mt-5 font-medium">No source reviews yet</p><p className="mt-2 text-sm text-hooma-muted">The first submitted URL will appear here.</p></div></div>
    </div>
  );
}
