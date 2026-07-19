"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { AlertCircle, CheckCircle2, GripVertical, MapPin, Package, Printer, Truck, X } from "lucide-react";
import { moveOrderKanbanAction, type KanbanMoveInput } from "@/app/admin/orders/actions";

export type OperationsKanbanCard = {
  id: string;
  label: string;
  fulfillmentStatus: string;
  total: number;
  createdAtLabel: string;
  customerName: string;
  customerContact: string;
  address: string;
  mapUrl: string | null;
  paymentReady: boolean;
  testMode: boolean;
  items: Array<{ id: string; name: string; configuration: string; quantity: number }>;
  jobs: { total: number; queued: number; preparing: number; active: number; completed: number; failed: number };
};

type TargetStatus = KanbanMoveInput["targetStatus"];
type Column = { id: string; title: string; caption: string; statuses: string[]; tone: string; dropTarget?: TargetStatus };

const columns: Column[] = [
  { id: "incoming", title: "შემოსული", caption: "შემოწმება და დადასტურება", statuses: ["order_received", "confirmed"], tone: "border-amber-200 bg-amber-50/70" },
  { id: "queued", title: "წარმოების რიგი", caption: "შექმნილია print job-ები", statuses: ["production_queued"], tone: "border-violet-200 bg-violet-50/70", dropTarget: "production_queued" },
  { id: "printing", title: "წარმოებაში", caption: "ფიზიკური ბეჭდვა დაიწყო", statuses: ["in_production"], tone: "border-blue-200 bg-blue-50/70" },
  { id: "qc", title: "ხარისხის კონტროლი", caption: "ყველა ბეჭდვა დასრულდა", statuses: ["quality_check"], tone: "border-emerald-200 bg-emerald-50/70" },
  { id: "ready", title: "მზადაა", caption: "შეფუთვა და კურიერი", statuses: ["ready_for_delivery"], tone: "border-teal-200 bg-teal-50/70", dropTarget: "ready_for_delivery" },
  { id: "courier", title: "კურიერთან", caption: "გადაცემულია მიწოდებაზე", statuses: ["out_for_delivery"], tone: "border-orange-200 bg-orange-50/70", dropTarget: "out_for_delivery" },
  { id: "delivered", title: "მიწოდებული", caption: "ციკლი დასრულებულია", statuses: ["delivered"], tone: "border-slate-200 bg-slate-50/80", dropTarget: "delivered" },
  { id: "cancelled", title: "გაუქმებული", caption: "დახურული შეკვეთები", statuses: ["cancelled"], tone: "border-red-200 bg-red-50/60" },
];

const expectedTarget: Record<string, TargetStatus | undefined> = {
  order_received: "production_queued",
  confirmed: "production_queued",
  quality_check: "ready_for_delivery",
  ready_for_delivery: "out_for_delivery",
  out_for_delivery: "delivered",
};

const money = new Intl.NumberFormat("ka-GE", { style: "currency", currency: "GEL", maximumFractionDigits: 2 });

function ModalCopy({ target }: { target: TargetStatus }) {
  if (target === "production_queued") return <><h3 className="text-2xl font-semibold">წარმოებაში მიღების დადასტურება</h3><p className="mt-3 text-sm leading-6 text-hooma-muted">გადაამოწმე პროდუქტი, რაოდენობა, ფერი, მასალა და გადახდის მდგომარეობა. დადასტურება შექმნის print job-ებს და აუდიტის ჩანაწერს.</p></>;
  if (target === "ready_for_delivery") return <><h3 className="text-2xl font-semibold">ხარისხის კონტროლის დადასტურება</h3><p className="mt-3 text-sm leading-6 text-hooma-muted">დაადასტურე ზედაპირი, ზომა, ფერი, რაოდენობა და შეფუთვის მზადყოფნა. ყველა ბეჭდვა დასრულებული უნდა იყოს.</p></>;
  if (target === "out_for_delivery") return <><h3 className="text-2xl font-semibold">კურიერზე რეალური გადაცემა</h3><p className="mt-3 text-sm leading-6 text-hooma-muted">შეინახე მხოლოდ მას შემდეგ, რაც შეკვეთა ფიზიკურად ჩაიბარა კურიერმა.</p></>;
  return <><h3 className="text-2xl font-semibold">მიწოდების დადასტურება</h3><p className="mt-3 text-sm leading-6 text-hooma-muted">შეკვეთა მიწოდებულად მოინიშნება და მომხმარებელიც დასრულებულ სტატუსს დაინახავს.</p></>;
}

export function OrderOperationsKanban({ cards, canMove }: { cards: OperationsKanbanCard[]; canMove: boolean }) {
  const router = useRouter();
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [pendingMove, setPendingMove] = useState<{ card: OperationsKanbanCard; target: TargetStatus } | null>(null);
  const [courierName, setCourierName] = useState("");
  const [courierReference, setCourierReference] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const cardsById = useMemo(() => new Map(cards.map((card) => [card.id, card])), [cards]);

  const requestMove = (card: OperationsKanbanCard, target: TargetStatus) => {
    if (!canMove) return setMessage({ ok: false, text: "სტატუსის შესაცვლელად წარმოების ოპერატორის უფლებაა საჭირო." });
    if (expectedTarget[card.fulfillmentStatus] !== target) {
      const productionLocked = ["production_queued", "in_production"].includes(card.fulfillmentStatus);
      return setMessage({ ok: false, text: productionLocked ? "ეს ეტაპი იცვლება რეალური print job-ის მინიჭების, დაწყებისა და დასრულების მიხედვით. გახსენი წარმოების დეტალები." : "ბარათი მხოლოდ უშუალოდ შემდეგ დასაშვებ ეტაპზე გადაიტანე." });
    }
    setConfirmed(false);
    setCourierName("");
    setCourierReference("");
    setPendingMove({ card, target });
  };

  const onDrop = (column: Column) => {
    if (!draggedId || !column.dropTarget) return;
    const card = cardsById.get(draggedId);
    setDraggedId(null);
    if (card) requestMove(card, column.dropTarget);
  };

  const submitMove = () => {
    if (!pendingMove || !confirmed) return;
    startTransition(async () => {
      const result = await moveOrderKanbanAction({
        orderId: pendingMove.card.id,
        targetStatus: pendingMove.target,
        operationKey: crypto.randomUUID(),
        courierName,
        courierReference,
      });
      setMessage({ ok: result.ok, text: result.message });
      if (result.ok) {
        setPendingMove(null);
        router.refresh();
      }
    });
  };

  return (
    <div className="space-y-4">
      {message ? <div className={`flex items-center justify-between gap-3 rounded-2xl border px-4 py-3 text-sm ${message.ok ? "border-emerald-200 bg-emerald-50 text-emerald-950" : "border-red-200 bg-red-50 text-red-950"}`}><span className="flex items-center gap-2">{message.ok ? <CheckCircle2 size={17} /> : <AlertCircle size={17} />}{message.text}</span><button onClick={() => setMessage(null)} aria-label="დახურვა"><X size={17} /></button></div> : null}

      <div className="overflow-x-auto pb-4">
        <div className="flex min-w-max items-start gap-4">
          {columns.map((column) => {
            const columnCards = cards.filter((card) => column.statuses.includes(card.fulfillmentStatus));
            return (
              <section
                key={column.id}
                onDragOver={(event) => { if (column.dropTarget) event.preventDefault(); }}
                onDrop={() => onDrop(column)}
                className={`w-[330px] shrink-0 rounded-[1.6rem] border p-3 transition ${column.tone} ${draggedId && column.dropTarget ? "ring-2 ring-hooma-accent/20" : ""}`}
              >
                <div className="flex items-start justify-between gap-3 px-2 py-2"><div><h2 className="font-semibold">{column.title}</h2><p className="mt-1 text-xs text-hooma-muted">{column.caption}</p></div><span className="rounded-full bg-white/80 px-2.5 py-1 text-xs font-semibold">{columnCards.length}</span></div>
                <div className="mt-2 min-h-36 space-y-3">
                  {columnCards.map((card) => {
                    const target = expectedTarget[card.fulfillmentStatus];
                    const productionLocked = ["production_queued", "in_production"].includes(card.fulfillmentStatus);
                    return (
                      <article
                        key={card.id}
                        draggable={Boolean(canMove && target)}
                        onDragStart={(event) => { setDraggedId(card.id); event.dataTransfer.effectAllowed = "move"; }}
                        onDragEnd={() => setDraggedId(null)}
                        className={`rounded-2xl border border-white/80 bg-white p-4 shadow-sm ${draggedId === card.id ? "opacity-50" : ""}`}
                      >
                        <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold text-hooma-accent">{card.label}</p><p className="mt-1 text-[11px] text-hooma-muted">{card.createdAtLabel}</p></div>{target ? <GripVertical size={18} className="cursor-grab text-hooma-muted" /> : <Package size={17} className="text-hooma-muted" />}</div>
                        <div className="mt-3 flex items-center justify-between gap-2"><p className="font-semibold">{card.customerName}</p><p className="text-sm font-semibold">{money.format(card.total)}</p></div>
                        <p className="mt-1 text-xs text-hooma-muted">{card.customerContact}</p>
                        <div className="mt-3 space-y-2 border-t border-hooma-text/10 pt-3">{card.items.slice(0, 3).map((item) => <div key={item.id} className="text-xs"><p className="font-semibold">{item.name} ×{item.quantity}</p><p className="mt-0.5 truncate text-hooma-muted">{item.configuration}</p></div>)}{card.items.length > 3 ? <p className="text-xs font-semibold text-hooma-accent">+ კიდევ {card.items.length - 3}</p> : null}</div>
                        <div className="mt-3 rounded-xl bg-hooma-background p-3 text-xs"><p className="flex items-start gap-2"><MapPin size={14} className="mt-0.5 shrink-0 text-hooma-accent" /><span>{card.address}</span></p>{card.mapUrl ? <a href={card.mapUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block font-semibold text-hooma-accent">რუკის გახსნა</a> : null}</div>
                        {card.jobs.total ? <div className="mt-3 rounded-xl border border-hooma-text/10 p-3 text-xs"><p className="flex items-center gap-2 font-semibold"><Printer size={14} />წარმოება: {card.jobs.completed}/{card.jobs.total} დასრულებული</p><p className="mt-2 text-hooma-muted">რიგი {card.jobs.queued} · მზადება {card.jobs.preparing} · აქტიური {card.jobs.active}{card.jobs.failed ? ` · failure ${card.jobs.failed}` : ""}</p></div> : null}
                        <div className="mt-3 flex flex-wrap items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${card.paymentReady ? "bg-emerald-100 text-emerald-900" : "bg-red-100 text-red-900"}`}>{card.testMode ? "TEST" : card.paymentReady ? "გადახდილია" : "გადახდას ელოდება"}</span>{productionLocked || card.fulfillmentStatus === "quality_check" ? <Link href={`/admin/production?order=${card.id}`} className="rounded-full bg-hooma-text px-3 py-1 text-[10px] font-semibold text-white">ამ შეკვეთის წარმოება</Link> : null}</div>
                        {target ? <button onClick={() => requestMove(card, target)} className="mt-3 w-full rounded-xl border border-hooma-text/10 px-3 py-2 text-xs font-semibold transition hover:bg-hooma-text hover:text-white">შემდეგ ეტაპზე გადატანა →</button> : productionLocked ? <p className="mt-3 text-[11px] leading-5 text-hooma-muted">სტატუსი ავტომატურად შეიცვლება print job-ის რეალური მოქმედებით.</p> : null}
                      </article>
                    );
                  })}
                  {!columnCards.length ? <div className="rounded-2xl border border-dashed border-current/15 bg-white/35 px-4 py-10 text-center text-xs text-hooma-muted">ამ ეტაპზე შეკვეთა არ არის</div> : null}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      {pendingMove ? <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4" role="dialog" aria-modal="true"><div className="w-full max-w-lg rounded-[1.75rem] bg-white p-6 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold text-hooma-accent">{pendingMove.card.label}</p><ModalCopy target={pendingMove.target} /></div><button onClick={() => setPendingMove(null)} disabled={isPending} className="rounded-full border border-hooma-text/10 p-2"><X size={18} /></button></div>{pendingMove.target === "out_for_delivery" ? <div className="mt-5 grid gap-4"><label className="text-sm font-semibold">საკურიერო კომპანია<input value={courierName} onChange={(event) => setCourierName(event.target.value)} placeholder="მაგ. Hooma Courier" className="mt-2 w-full rounded-xl border border-hooma-text/10 px-3 py-2.5 font-normal outline-none focus:border-hooma-accent" /></label><label className="text-sm font-semibold">კურიერის კოდი (თუ არის)<input value={courierReference} onChange={(event) => setCourierReference(event.target.value)} className="mt-2 w-full rounded-xl border border-hooma-text/10 px-3 py-2.5 font-normal outline-none focus:border-hooma-accent" /></label></div> : null}<label className="mt-5 flex cursor-pointer items-start gap-3 rounded-2xl border border-hooma-text/10 bg-hooma-background p-4 text-sm leading-6"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="mt-1" /><span>ვადასტურებ, რომ ეს ეტაპი რეალურად შესრულებულია და ცვლილება შეიძლება ჩაიწეროს ოპერატორის მოქმედებად.</span></label><div className="mt-5 flex justify-end gap-2"><button onClick={() => setPendingMove(null)} disabled={isPending} className="rounded-full border border-hooma-text/10 px-5 py-2.5 text-sm font-semibold">გაუქმება</button><button onClick={submitMove} disabled={!confirmed || isPending} className="inline-flex items-center gap-2 rounded-full bg-hooma-text px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-40">{pendingMove.target === "out_for_delivery" ? <Truck size={16} /> : <CheckCircle2 size={16} />}{isPending ? "ინახება..." : "დადასტურება"}</button></div></div></div> : null}
    </div>
  );
}
