import { CheckCircle2, Clock3, Printer, ScanLine } from "lucide-react";

export default function ProductionPage() {
  const stages = [
    ["Awaiting approval", 0, Clock3],
    ["Queued", 0, ScanLine],
    ["Printing", 0, Printer],
    ["Quality check", 0, CheckCircle2],
  ];
  return <div className="space-y-7"><div><p className="text-xs uppercase tracking-[0.28em] text-hooma-muted">Operations</p><h1 className="mt-3 text-4xl font-medium">Production queue</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-hooma-muted">Every print start requires operator approval in V1. Printer credentials and commands stay server-side.</p></div><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{stages.map(([label, value, Icon]) => { const StageIcon = Icon as typeof Clock3; return <div key={String(label)} className="rounded-[1.5rem] bg-white/75 p-5 shadow-soft"><StageIcon size={19} className="text-hooma-accent" /><p className="mt-6 text-sm text-hooma-muted">{String(label)}</p><p className="mt-2 text-3xl font-medium">{String(value)}</p></div>; })}</div><div className="rounded-[1.5rem] bg-white/75 px-6 py-16 text-center shadow-soft"><Printer className="mx-auto text-hooma-muted" /><p className="mt-5 font-medium">Production is ready for the first test order</p><p className="mt-2 text-sm text-hooma-muted">Jobs will appear after an operator confirms an order item.</p></div></div>;
}
