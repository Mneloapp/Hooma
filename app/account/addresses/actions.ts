"use server";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
export type AddressActionState = { ok?: boolean; message?: string; savedAt?: string };
const getString = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();
function coordinate(value: string, minimum: number, maximum: number) { if (!value) return null; const parsed = Number(value); return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum ? parsed : Number.NaN; }
export async function saveDefaultAddressAction(_state: AddressActionState, formData: FormData): Promise<AddressActionState> {
  const georgian = getString(formData, "language") === "ka"; const supabase = (await createClient()) as any;
  if (!supabase) return { ok: false, message: georgian ? "Supabase ჯერ არ არის დაკავშირებული." : "Supabase is not configured yet." };
  const { data: authData } = await supabase.auth.getUser(); const user = authData.user;
  if (!user) return { ok: false, message: georgian ? "მისამართის შესანახად ანგარიშში შედი." : "Sign in to save an address." };
  const latitude = coordinate(getString(formData, "latitude"), -90, 90); const longitude = coordinate(getString(formData, "longitude"), -180, 180);
  if (Number.isNaN(latitude) || Number.isNaN(longitude) || (latitude === null) !== (longitude === null)) return { ok: false, message: georgian ? "რუკის ლოკაცია არასწორია. მონიშნე წერტილი თავიდან." : "The map location is invalid. Select the point again." };
  const googleMapsUrl = latitude !== null && longitude !== null ? `https://www.google.com/maps/search/?api=1&query=${latitude.toFixed(7)}%2C${longitude.toFixed(7)}` : null;
  const address = { full_name: getString(formData, "full_name").slice(0, 160), phone: getString(formData, "phone").slice(0, 60), city: getString(formData, "city").slice(0, 120), address_line_1: getString(formData, "address_line_1").slice(0, 300), address_line_2: getString(formData, "address_line_2").slice(0, 300) || null, postal_code: getString(formData, "postal_code").slice(0, 30) || null, latitude, longitude, google_maps_url: googleMapsUrl, is_default: true };
  if (!address.full_name || !address.phone || !address.city || !address.address_line_1) return { ok: false, message: georgian ? "შეავსე სახელი, ტელეფონი, ქალაქი და ზუსტი მისამართი." : "Complete the recipient name, phone, city, and street address." };
  const admin = createAdminClient() as any; if (!admin) return { ok: false, message: georgian ? "მისამართის საცავი ჯერ არ არის დაკავშირებული." : "Address storage is not connected yet." };
  let { data: customer } = await admin.from("customers").select("id").eq("profile_id", user.id).limit(1).maybeSingle();
  if (!customer?.id) {
    const { data: profile } = await admin.from("profiles").select("full_name,phone,email").eq("id", user.id).maybeSingle();
    const { data: createdCustomer, error: customerError } = await admin.from("customers").insert({ profile_id: user.id, email: user.email ?? profile?.email ?? null, full_name: profile?.full_name || address.full_name, phone: profile?.phone || address.phone }).select("id").single();
    if (customerError || !createdCustomer) return { ok: false, message: georgian ? "მომხმარებლის მიწოდების პროფილი ვერ შეიქმნა." : "The customer delivery profile could not be created." }; customer = createdCustomer;
  }
  const { data: currentAddress } = await admin.from("addresses").select("id").eq("customer_id", customer.id).eq("is_default", true).order("created_at", { ascending: false }).limit(1).maybeSingle();
  const { error } = currentAddress?.id ? await admin.from("addresses").update(address).eq("id", currentAddress.id).eq("customer_id", customer.id) : await admin.from("addresses").insert({ customer_id: customer.id, ...address });
  if (error) return { ok: false, message: georgian ? "მისამართის შენახვა ვერ მოხერხდა. სცადე თავიდან." : "The address could not be saved. Try again." };
  revalidatePath("/account/addresses"); revalidatePath("/checkout");
  return { ok: true, message: georgian ? "მისამართი შენახულია და შეკვეთისას ავტომატურად შეივსება." : "The address is saved and will be filled in automatically at checkout.", savedAt: new Date().toISOString() };
}
