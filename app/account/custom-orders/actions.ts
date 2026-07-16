"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

type ActionResult = { ok: boolean; message: string };
type UploadedFileDescriptor = {
  path: string;
  originalName: string;
  mimeType: string;
  size: number;
};

const allowedExtensions = new Set(["3mf", "stl", "step", "stp", "obj", "zip", "pdf", "png", "jpg", "jpeg", "webp"]);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const cleanText = (value: unknown, maxLength: number) => String(value ?? "").trim().slice(0, maxLength);

export async function prepareCustomQuoteUploadAction(formData: FormData): Promise<{
  ok: boolean;
  message: string;
  requestId?: string;
  uploads?: Array<{ path: string; token: string }>;
}> {
  const supabase = (await createClient()) as any;
  const admin = createAdminClient() as any;
  if (!supabase || !admin) return { ok: false, message: "Private upload-ისთვის Supabase service role ჯერ არ არის დაკავშირებული." };

  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return { ok: false, message: "ფაილის ასატვირთად ჯერ ანგარიშში შედი." };

  let files: Array<{ name?: string; size?: number }> = [];
  try {
    files = JSON.parse(String(formData.get("files") ?? "[]"));
  } catch {
    return { ok: false, message: "ფაილების მონაცემები არასწორია." };
  }
  if (!Array.isArray(files) || files.length < 1 || files.length > 5) return { ok: false, message: "აირჩიე მინიმუმ 1 და მაქსიმუმ 5 ფაილი." };

  let totalSize = 0;
  for (const file of files) {
    const name = cleanText(file.name, 255);
    const extension = name.split(".").pop()?.toLowerCase() ?? "";
    const size = Number(file.size);
    if (!name || !allowedExtensions.has(extension) || !Number.isInteger(size) || size < 1 || size > 104857600) return { ok: false, message: `ფაილი “${name || "unknown"}” არასწორია ან 100MB-ს აღემატება.` };
    totalSize += size;
  }
  if (totalSize > 262144000) return { ok: false, message: "ფაილების ჯამური ზომა 250MB-ს არ უნდა აღემატებოდეს." };

  const requestId = crypto.randomUUID();
  const paths = files.map((file) => {
    const extension = cleanText(file.name, 255).split(".").pop()!.toLowerCase();
    return `${user.id}/${requestId}/${crypto.randomUUID()}.${extension}`;
  });
  const signed = await Promise.all(paths.map((path) => admin.storage.from("custom-quote-files").createSignedUploadUrl(path)));
  const failed = signed.find((result) => result.error || !result.data?.token);
  if (failed) return { ok: false, message: failed.error?.message ?? "Signed upload URL ვერ შეიქმნა. შეამოწმე migration." };

  return {
    ok: true,
    message: "Upload prepared",
    requestId,
    uploads: signed.map((result, index) => ({ path: paths[index], token: result.data!.token })),
  };
}

export async function submitCustomQuoteRequestAction(formData: FormData): Promise<ActionResult> {
  const supabase = (await createClient()) as any;
  if (!supabase) return { ok: false, message: "Supabase ჯერ არ არის დაკავშირებული." };

  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return { ok: false, message: "ფაილის გასაგზავნად ჯერ ანგარიშში შედი." };

  let payload: {
    requestId?: string;
    title?: string;
    description?: string;
    quantity?: number;
    dimensions?: string;
    materialPreference?: string;
    colorPreference?: string;
    files?: UploadedFileDescriptor[];
  };

  try {
    payload = JSON.parse(String(formData.get("payload") ?? "{}"));
  } catch {
    return { ok: false, message: "მოთხოვნის მონაცემები არასწორია." };
  }

  const requestId = cleanText(payload.requestId, 36);
  const title = cleanText(payload.title, 120);
  const description = cleanText(payload.description, 3000);
  const dimensions = cleanText(payload.dimensions, 500);
  const materialPreference = cleanText(payload.materialPreference, 120);
  const colorPreference = cleanText(payload.colorPreference, 120);
  const quantity = Number(payload.quantity);
  const files = Array.isArray(payload.files) ? payload.files : [];

  if (!uuidPattern.test(requestId)) return { ok: false, message: "მოთხოვნის ID არასწორია." };
  if (title.length < 3 || description.length < 10) return { ok: false, message: "შეავსე სათაური და დეტალური აღწერა." };
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) return { ok: false, message: "რაოდენობა უნდა იყოს 1-დან 100-მდე." };
  if (files.length < 1 || files.length > 5) return { ok: false, message: "ატვირთე მინიმუმ 1 და მაქსიმუმ 5 ფაილი." };

  let totalSize = 0;
  const expectedPrefix = `${user.id}/${requestId}/`;
  for (const file of files) {
    const extension = file.path.split(".").pop()?.toLowerCase() ?? "";
    const safePath = file.path.startsWith(expectedPrefix) && file.path.split("/").length === 3;
    const safeName = cleanText(file.originalName, 255);
    const size = Number(file.size);
    if (!safePath || !allowedExtensions.has(extension) || !safeName || !Number.isInteger(size) || size < 1 || size > 104857600) {
      return { ok: false, message: "ერთ-ერთი ატვირთული ფაილი არასწორია ან 100MB-ს აღემატება." };
    }
    totalSize += size;
  }
  if (totalSize > 262144000) return { ok: false, message: "ფაილების ჯამური ზომა 250MB-ს არ უნდა აღემატებოდეს." };

  const { data: storedObjects, error: storageError } = await supabase.storage
    .from("custom-quote-files")
    .list(`${user.id}/${requestId}`, { limit: 10 });
  if (storageError) return { ok: false, message: "ფაილების დაცულ საცავში შემოწმება ვერ მოხერხდა. შეამოწმე Supabase migration." };

  const storedByName = new Map<string, number>((storedObjects ?? []).map((item: { name: string; metadata?: { size?: number } }) => [item.name, Number(item.metadata?.size ?? 0)] as [string, number]));
  if (files.some((file) => {
    const storedSize = storedByName.get(file.path.split("/").pop()!);
    return storedSize === undefined || (storedSize > 0 && storedSize !== Number(file.size));
  })) {
    return { ok: false, message: "ყველა ატვირთული ფაილი ვერ დადასტურდა." };
  }

  const { error: requestError } = await supabase.from("custom_quote_requests").insert({
    id: requestId,
    profile_id: user.id,
    title,
    description,
    quantity,
    dimensions: dimensions || null,
    material_preference: materialPreference || null,
    color_preference: colorPreference || null,
    status: "submitted",
  });
  if (requestError) return { ok: false, message: requestError.message };

  const fileRows = files.map((file) => ({
    request_id: requestId,
    storage_path: file.path,
    original_name: cleanText(file.originalName, 255),
    mime_type: cleanText(file.mimeType, 120) || null,
    size_bytes: Number(file.size),
  }));
  const { error: filesError } = await supabase.from("custom_quote_files").insert(fileRows);
  if (filesError) {
    await supabase.from("custom_quote_requests").delete().eq("id", requestId).eq("profile_id", user.id);
    await supabase.storage.from("custom-quote-files").remove(files.map((file) => file.path));
    return { ok: false, message: filesError.message };
  }

  revalidatePath("/account/custom-orders");
  revalidatePath("/admin/custom-orders");
  return { ok: true, message: "მოთხოვნა მიღებულია. ინდივიდუალური ფასი ამ გვერდზე გამოჩნდება ოპერატორის შეფასების შემდეგ." };
}

export async function acceptCustomQuoteAction(formData: FormData) {
  const requestId = cleanText(formData.get("request_id"), 36);
  if (!uuidPattern.test(requestId)) return;

  const supabase = (await createClient()) as any;
  if (!supabase) return;
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return;

  await supabase.rpc("accept_custom_quote", { custom_request_id: requestId });
  revalidatePath("/account/custom-orders");
}
