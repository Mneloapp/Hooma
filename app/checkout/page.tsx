import { CheckoutForm } from "@/components/checkout/CheckoutForm";
import { createClient, getProfile } from "@/lib/supabase/server";

type AddressRow = { full_name: string | null; phone: string | null; city: string | null; address_line_1: string | null; address_line_2: string | null; postal_code: string | null; latitude: number | null; longitude: number | null; google_maps_url: string | null };
export default async function Checkout() {
  const profile = await getProfile(); const supabase = (await createClient()) as any; let address: AddressRow | null = null;
  if (supabase && profile) { const { data: customer } = await supabase.from("customers").select("id").eq("profile_id", profile.id).limit(1).maybeSingle(); if (customer?.id) { const { data } = await supabase.from("addresses").select("full_name,phone,city,address_line_1,address_line_2,postal_code,latitude,longitude,google_maps_url").eq("customer_id", customer.id).eq("is_default", true).order("created_at", { ascending: false }).limit(1).maybeSingle(); address = data as AddressRow | null; } }
  return <CheckoutForm initialValues={{ fullName: address?.full_name || profile?.full_name || "", phone: address?.phone || profile?.phone || "", email: profile?.email || "", city: address?.city || "", addressLine1: address?.address_line_1 || "", addressLine2: address?.address_line_2 || "", postalCode: address?.postal_code || "", latitude: typeof address?.latitude === "number" ? address.latitude : null, longitude: typeof address?.longitude === "number" ? address.longitude : null, googleMapsUrl: address?.google_maps_url || "" }} />;
}
