import { CheckCircle2, CircleAlert, Clock3, Sparkles } from "lucide-react";
import Link from "next/link";
import { HoomaPlusResultAutoRefresh } from "@/components/hooma-plus/HoomaPlusResultAutoRefresh";
import { LocalizedText } from "@/components/LocalizedText";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const moneyKa = new Intl.NumberFormat("ka-GE", { style: "currency", currency: "GEL", currencyDisplay: "narrowSymbol" });
const moneyEn = new Intl.NumberFormat("en-GB", { style: "currency", currency: "GEL", currencyDisplay: "narrowSymbol" });
const dateKa = new Intl.DateTimeFormat("ka-GE", { dateStyle: "long" });
const dateEn = new Intl.DateTimeFormat("en-GB", { dateStyle: "long" });

type ResultParams = {
  purchase?: string;
  return?: string;
};

export default async function HoomaPlusResultPage({
  searchParams,
}: {
  searchParams: Promise<ResultParams>;
}) {
  const query = await searchParams;
  const purchaseId = query.purchase ?? "";
  const supabase = (await createClient()) as any;
  const { data: purchase } = supabase && uuidPattern.test(purchaseId)
    ? await supabase
      .from("hooma_plus_purchases")
      .select("id,plan_code,plan_label_ka,plan_label_en,amount,status,activated_at,expires_at")
      .eq("id", purchaseId)
      .maybeSingle()
    : { data: null };

  if (!purchase) {
    return (
      <section className="mx-auto max-w-2xl px-4 py-20 text-center sm:px-6">
        <CircleAlert className="mx-auto text-amber-600" size={44} />
        <h1 className="mt-5 text-3xl font-semibold">
          <LocalizedText ka="Hooma+ გადახდა ვერ მოიძებნა" en="Hooma+ payment not found" />
        </h1>
        <p className="mt-3 text-hooma-muted">
          <LocalizedText
            ka="შედეგი მხოლოდ შესაბამის ანგარიშში ჩანს. Hooma+ გვერდზე გადაამოწმე ბოლო სტატუსი."
            en="The result is visible only in the corresponding account. Check the latest status on the Hooma+ page."
          />
        </p>
        <Link href="/account/hooma-plus" className="mt-7 inline-flex rounded-full bg-hooma-text px-6 py-3 text-sm font-semibold text-white">
          <LocalizedText ka="Hooma+ გვერდი" en="Hooma+ page" />
        </Link>
      </section>
    );
  }

  const paid = purchase.status === "paid";
  const failed = purchase.status === "failed";
  const refunded = purchase.status === "refunded";
  const reviewRequired = purchase.status === "review_required";
  const settled = paid || failed || refunded || reviewRequired;
  const returnedFromFailure = query.return === "fail";
  const state = paid
    ? {
      icon: <CheckCircle2 className="mx-auto text-emerald-600" size={48} />,
      titleKa: "Hooma+ გააქტიურდა",
      titleEn: "Hooma+ is active",
      bodyKa: purchase.expires_at
        ? `უფასო სტანდარტული მიწოდება მოქმედებს თარიღამდე: ${dateKa.format(new Date(purchase.expires_at))}.`
        : "BOG-მა სრული გადახდა დაადასტურა და წევრობა გააქტიურდა.",
      bodyEn: purchase.expires_at
        ? `Free standard delivery is active until ${dateEn.format(new Date(purchase.expires_at))}.`
        : "BOG confirmed the full payment and activated your membership.",
      panel: "border-emerald-200 bg-emerald-50",
    }
    : reviewRequired
      ? {
        icon: <CircleAlert className="mx-auto text-orange-600" size={48} />,
        titleKa: "გადახდას შემოწმება სჭირდება",
        titleEn: "Payment needs review",
        bodyKa: "ხელახლა ნუ გადაიხდი. წევრობა უსაფრთხოდ შეჩერებულია, სანამ ჩვენი გუნდი BOG-ის ჩანაწერს გადაამოწმებს.",
        bodyEn: "Do not pay again. Membership is safely on hold while our team reviews the BOG record.",
        panel: "border-orange-200 bg-orange-50",
      }
      : failed || refunded
        ? {
          icon: <CircleAlert className={`mx-auto ${refunded ? "text-blue-600" : "text-red-600"}`} size={48} />,
          titleKa: refunded ? "თანხა დაბრუნებულია" : "გადახდა ვერ დასრულდა",
          titleEn: refunded ? "Payment refunded" : "Payment was not completed",
          bodyKa: refunded ? "BOG-ის ჩანაწერით სრული თანხა დაბრუნებულია და ეს წევრობის პერიოდი აღარ მოქმედებს." : "წევრობა არ გააქტიურებულა და განმეორებითი თანხა არ ჩამოგეჭრება.",
          bodyEn: refunded ? "BOG records show a full refund and this membership period is no longer active." : "Membership was not activated and no recurring charge will occur.",
          panel: refunded ? "border-blue-200 bg-blue-50" : "border-red-200 bg-red-50",
        }
        : {
          icon: <Clock3 className="mx-auto text-amber-600" size={48} />,
          titleKa: returnedFromFailure ? "გადახდა ჯერ არ დადასტურებულა" : "გადახდა მოწმდება",
          titleEn: returnedFromFailure ? "Payment is not confirmed yet" : "Verifying payment",
          bodyKa: "ბანკის გვერდიდან დაბრუნება გადახდის დასტური არ არის. წევრობა მხოლოდ BOG-ის დაცული callback-ის შემდეგ გააქტიურდება.",
          bodyEn: "Returning from the bank page is not proof of payment. Membership activates only after BOG's secure callback.",
          panel: "border-amber-200 bg-amber-50",
        };

  return (
    <section className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
      <div className={`rounded-[2rem] border p-7 text-center shadow-soft sm:p-10 ${state.panel}`}>
        {state.icon}
        <div className="mt-5 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-hooma-accent">
          <Sparkles size={15} />Hooma+
        </div>
        <h1 className="mt-3 text-3xl font-semibold">
          <LocalizedText ka={state.titleKa} en={state.titleEn} />
        </h1>
        <p className="mt-4 leading-7 text-hooma-muted">
          <LocalizedText ka={state.bodyKa} en={state.bodyEn} />
        </p>
        <HoomaPlusResultAutoRefresh settled={settled} />
        <p className="mt-5 text-2xl font-semibold">
          <LocalizedText
            ka={moneyKa.format(Number(purchase.amount ?? 0))}
            en={moneyEn.format(Number(purchase.amount ?? 0))}
          />
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Link href="/account/hooma-plus" className="rounded-full bg-hooma-text px-6 py-3 text-sm font-semibold text-white">
            <LocalizedText ka="Hooma+ გვერდი" en="Hooma+ page" />
          </Link>
          <Link href="/shop" className="rounded-full border border-hooma-text/15 bg-white px-6 py-3 text-sm font-semibold">
            <LocalizedText ka="კატალოგში დაბრუნება" en="Back to shop" />
          </Link>
        </div>
      </div>
    </section>
  );
}
