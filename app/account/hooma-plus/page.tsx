import { HoomaPlusPurchasePanel } from "@/components/hooma-plus/HoomaPlusPurchasePanel";
import { LocalizedText } from "@/components/LocalizedText";
import {
  DELIVERY_POLICY,
  parseHoomaPlusSummary,
  type HoomaPlusSummary,
} from "@/lib/commerce/hooma-plus";
import { getHoomaPlusCheckoutAvailability } from "@/lib/payments/bog";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type PurchaseRow = {
  id: string;
  plan_code: string;
  amount: number | string;
  status: string;
  created_at: string;
  expires_at: string | null;
};

const unavailableSummary: HoomaPlusSummary = {
  active: false,
  activeUntil: null,
  welcomeUnitsTotal: DELIVERY_POLICY.welcomeUnits,
  welcomeUnitsConsumed: 0,
  welcomeUnitsReserved: 0,
  welcomeUnitsRemaining: 0,
};

export default async function AccountHoomaPlusPage() {
  const supabase = (await createClient()) as any;
  const [{ data: summaryData, error: summaryError }, { data: purchaseRows }] = supabase
    ? await Promise.all([
      supabase.rpc("get_my_hooma_plus_summary_v1"),
      supabase
        .from("hooma_plus_purchases")
        .select("id,plan_code,amount,status,created_at,expires_at")
        .order("created_at", { ascending: false })
        .limit(20),
    ])
    : [{ data: null, error: new Error("Supabase unavailable") }, { data: [] }];
  const summary = parseHoomaPlusSummary(summaryData) ?? unavailableSummary;
  const rulesReady = !summaryError && Boolean(parseHoomaPlusSummary(summaryData));
  const payment = getHoomaPlusCheckoutAvailability();
  const purchases = ((purchaseRows ?? []) as PurchaseRow[]).map((item) => ({
    id: item.id,
    planCode: item.plan_code,
    amount: Number(item.amount),
    status: item.status,
    createdAt: item.created_at,
    expiresAt: item.expires_at,
  }));

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.28em] text-hooma-muted">Hooma+</p>
        <h1 className="mt-3 text-4xl font-medium">
          <LocalizedText ka="უფასო მიწოდების წევრობა" en="Free-delivery membership" />
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-hooma-muted">
          <LocalizedText
            ka="წინასწარ გადახდილი Hooma+ მოქმედებს კატალოგის სტანდარტულ მიწოდებაზე. წევრობა ავტომატურად არ განახლდება და შენს ბარათს განმეორებით თანხა არ ჩამოეჭრება."
            en="Prepaid Hooma+ applies to standard catalog delivery. Membership does not auto-renew and your card is not charged again automatically."
          />
        </p>
      </div>
      {!rulesReady ? (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <LocalizedText
            ka="Hooma+ მონაცემთა ბაზის განახლება ჯერ არ არის დასრულებული. წევრობის შეძენა უსაფრთხოდ გამორთულია."
            en="The Hooma+ database update is not complete yet. Membership purchasing is safely disabled."
          />
        </p>
      ) : null}
      <HoomaPlusPurchasePanel
        paymentAvailable={payment.available && rulesReady}
        summary={summary}
        purchases={purchases}
      />
    </div>
  );
}
