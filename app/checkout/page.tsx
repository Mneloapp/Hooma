import { CheckoutForm } from "@/components/checkout/CheckoutForm";
import {
  DELIVERY_POLICY,
  parseHoomaPlusSummary,
  type HoomaPlusSummary,
} from "@/lib/commerce/hooma-plus";
import { getBogCheckoutAvailability } from "@/lib/payments/bog";
import { createClient, getProfile } from "@/lib/supabase/server";
import { privatePageMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";
export const metadata = privatePageMetadata;

type AddressRow = { full_name: string | null; phone: string | null; city: string | null; address_line_1: string | null; address_line_2: string | null; postal_code: string | null; latitude: number | null; longitude: number | null; google_maps_url: string | null };

const unavailableSummary: HoomaPlusSummary = {
  active: false,
  activeUntil: null,
  welcomeUnitsTotal: DELIVERY_POLICY.welcomeUnits,
  welcomeUnitsConsumed: 0,
  welcomeUnitsReserved: 0,
  welcomeUnitsRemaining: 0,
};

export default async function Checkout() {
  const payment = getBogCheckoutAvailability();
  const profile = await getProfile();
  const supabase = (await createClient()) as any;
  let address: AddressRow | null = null;
  let deliverySummary = unavailableSummary;
  let deliveryRulesReady = false;

  if (supabase && profile) {
    const [{ data: customer }, { data: summaryData, error: summaryError }] = await Promise.all([
      supabase
        .from("customers")
        .select("id")
        .eq("profile_id", profile.id)
        .limit(1)
        .maybeSingle(),
      supabase.rpc("get_my_hooma_plus_summary_v1"),
    ]);
    const parsedSummary = parseHoomaPlusSummary(summaryData);
    if (!summaryError && parsedSummary) {
      deliverySummary = parsedSummary;
      deliveryRulesReady = true;
    }
    if (customer?.id) {
      const { data } = await supabase
        .from("addresses")
        .select("full_name,phone,city,address_line_1,address_line_2,postal_code,latitude,longitude,google_maps_url")
        .eq("customer_id", customer.id)
        .eq("is_default", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      address = data as AddressRow | null;
    }
  }

  return (
    <CheckoutForm
      paymentAvailable={payment.available}
      paymentMethods={payment.methods}
      deliveryRulesReady={deliveryRulesReady}
      deliverySummary={deliverySummary}
      initialValues={{
        fullName: address?.full_name || profile?.full_name || "",
        phone: address?.phone || profile?.phone || "",
        email: profile?.email || "",
        city: address?.city || "",
        addressLine1: address?.address_line_1 || "",
        addressLine2: address?.address_line_2 || "",
        postalCode: address?.postal_code || "",
        latitude: typeof address?.latitude === "number" ? address.latitude : null,
        longitude: typeof address?.longitude === "number" ? address.longitude : null,
        googleMapsUrl: address?.google_maps_url || "",
      }}
    />
  );
}
