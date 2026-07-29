import { enforceMobileRateLimit, requireMobileAuth } from "@/lib/mobile-api/auth";
import {
  asRecord,
  cleanOptionalString,
  cleanString,
  mobileError,
  mobileJson,
  readMobileJson,
} from "@/lib/mobile-api/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const auth = await requireMobileAuth(request);
    const { data, error } = await auth.admin
      .from("addresses")
      .select("id,full_name,phone,city,address_line_1,address_line_2,postal_code,latitude,longitude,google_maps_url,is_default,created_at")
      .eq("customer_id", auth.customerId)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) throw error;
    return mobileJson({ ok: true, data: data ?? [] });
  } catch (error) {
    return mobileError(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireMobileAuth(request);
    await enforceMobileRateLimit(request, "addresses:write", 20, 3600, auth.user.id);
    const input = asRecord(await readMobileJson(request, 16 * 1024));
    if (!input) return mobileJson({ ok: false, code: "invalid_request" }, 400);

    const latitude = input.latitude === null || input.latitude === undefined
      ? null
      : Number(input.latitude);
    const longitude = input.longitude === null || input.longitude === undefined
      ? null
      : Number(input.longitude);
    const hasValidCoordinates = latitude !== null
      && longitude !== null
      && Number.isFinite(latitude)
      && Number.isFinite(longitude)
      && latitude >= -90
      && latitude <= 90
      && longitude >= -180
      && longitude <= 180;
    if ((latitude === null) !== (longitude === null) || (latitude !== null && !hasValidCoordinates)) {
      return mobileJson({ ok: false, code: "invalid_coordinates" }, 400);
    }

    const address = {
      full_name: cleanString(input.fullName, 160),
      phone: cleanString(input.phone, 60),
      city: cleanString(input.city, 120),
      address_line_1: cleanString(input.addressLine1, 300),
      address_line_2: cleanOptionalString(input.addressLine2, 300),
      postal_code: cleanOptionalString(input.postalCode, 30),
      latitude: hasValidCoordinates ? latitude : null,
      longitude: hasValidCoordinates ? longitude : null,
      google_maps_url: hasValidCoordinates
        ? `https://www.google.com/maps/search/?api=1&query=${latitude!.toFixed(7)}%2C${longitude!.toFixed(7)}`
        : null,
      is_default: true,
    };
    if (!address.full_name || !address.phone || !address.city || !address.address_line_1) {
      return mobileJson({ ok: false, code: "required_fields_missing" }, 400);
    }

    const { data: current } = await auth.admin
      .from("addresses")
      .select("id")
      .eq("customer_id", auth.customerId)
      .eq("is_default", true)
      .limit(1)
      .maybeSingle();
    const mutation = current?.id
      ? auth.admin.from("addresses").update(address).eq("id", current.id).eq("customer_id", auth.customerId)
      : auth.admin.from("addresses").insert({ customer_id: auth.customerId, ...address });
    const { error } = await mutation;
    if (error) throw error;
    return mobileJson({ ok: true });
  } catch (error) {
    return mobileError(error);
  }
}
