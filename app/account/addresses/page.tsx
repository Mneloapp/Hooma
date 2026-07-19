import { AddressForm } from "@/components/account/AddressForm";
import { createClient, getProfile } from "@/lib/supabase/server";

type AddressRow = { full_name: string | null; phone: string | null; city: string | null; address_line_1: string | null; address_line_2: string | null; postal_code: string | null; latitude: number | null; longitude: number | null };

export default async function AccountAddressesPage() {
  const profile = await getProfile(); const supabase = (await createClient()) as any; let address: AddressRow | null = null;
  if (supabase && profile) {
    const { data: customer } = await supabase.from("customers").select("id").eq("profile_id", profile.id).limit(1).maybeSingle();
    if (customer?.id) {
      const { data } = await supabase.from("addresses").select("full_name,phone,city,address_line_1,address_line_2,postal_code,latitude,longitude").eq("customer_id", customer.id).eq("is_default", true).order("created_at", { ascending: false }).limit(1).maybeSingle();
      address = data as AddressRow | null;
    }
  }
  return <AddressForm initialAddress={{ fullName: address?.full_name || profile?.full_name || "", phone: address?.phone || profile?.phone || "", city: address?.city || "", addressLine1: address?.address_line_1 || "", addressLine2: address?.address_line_2 || "", postalCode: address?.postal_code || "", latitude: typeof address?.latitude === "number" ? address.latitude : null, longitude: typeof address?.longitude === "number" ? address.longitude : null }} hasSavedAddress={Boolean(address)} mapsApiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? ""} />;
}
