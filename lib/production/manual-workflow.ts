export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const workflowErrors: Array<[string, string]> = [
  ["PRODUCTION_FORBIDDEN", "ამ მოქმედებისთვის წარმოების ოპერატორის უფლებაა საჭირო."],
  ["PAYMENT_REQUIRED", "რეალური შეკვეთა გადახდის დადასტურებამდე წარმოებაში ვერ გადავა."],
  ["PRODUCT_NOT_PRODUCTION_READY", "პროდუქტის წარმოების სტატუსი ან MakerWorld-ის კომერციული უფლება დასადასტურებელია."],
  ["SOURCE_NOT_VERIFIED", "ამ პროდუქტის დადასტურებული MakerWorld წყარო ვერ მოიძებნა."],
  ["ORDER_HAS_NO_ITEMS", "შეკვეთაში პროდუქტი არ არის."],
  ["ORDER_NOT_FOUND", "შეკვეთა ვერ მოიძებნა."],
  ["PRINT_JOB_NOT_FOUND", "საბეჭდი სამუშაო ვერ მოიძებნა."],
  ["PRINTER_NAME_EXISTS", "ამ სახელით აქტიური პრინტერი უკვე არსებობს."],
  ["PRINTER_FIELDS_REQUIRED", "მიუთითე პრინტერის სახელი და მოდელი."],
  ["PRINTER_HAS_ACTIVE_JOB", "პრინტერს აქტიური ბეჭდვა აქვს და სტატუსი ახლა ვერ შეიცვლება."],
  ["PRINTER_BUSY", "ეს პრინტერი უკვე დაკავებულია. აირჩიე სხვა თავისუფალი პრინტერი."],
  ["PRINTER_NOT_AVAILABLE", "არჩეული პრინტერი ხელმისაწვდომი აღარ არის."],
  ["STALE_PRINT_JOB", "სამუშაო სხვა ოპერატორმა უკვე შეცვალა. გვერდი განახლდა — გადაამოწმე ახალი სტატუსი."],
  ["PRINT_JOB_STATE_CONFLICT", "საბეჭდი სამუშაოს სტატუსი უკვე შეიცვალა."],
  ["ORDER_STATE_CONFLICT", "შეკვეთის სტატუსი უკვე შეიცვალა და ეს მოქმედება აღარ არის ხელმისაწვდომი."],
  ["QC_NOT_READY", "ხარისხის კონტროლი ვერ დადასტურდება, სანამ ყველა ბეჭდვა არ დასრულდება."],
  ["FAILURE_REASON_REQUIRED", "მიუთითე ბეჭდვის წარუმატებლობის მიზეზი."],
  ["RELEASE_REASON_REQUIRED", "მიუთითე პრინტერის გათავისუფლების მიზეზი."],
  ["OPERATION_IN_PROGRESS", "ეს მოქმედება უკვე მუშავდება. რამდენიმე წამში განაახლე გვერდი."],
  ["OPERATION_KEY_CONFLICT", "მოქმედების უსაფრთხოების კოდი უკვე გამოყენებულია. განაახლე გვერდი."],
];

export function workflowErrorMessage(error: unknown) {
  const raw = typeof error === "object" && error && "message" in error
    ? String((error as { message?: unknown }).message ?? "")
    : String(error ?? "");
  return workflowErrors.find(([code]) => raw.includes(code))?.[1]
    ?? "მოქმედება ვერ შესრულდა. განაახლე გვერდი და სცადე ხელახლა.";
}

export function safeMakerWorldUrl(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return url.protocol === "https:" && (host === "makerworld.com" || host.endsWith(".makerworld.com"))
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

export const fulfillmentLabels: Record<string, string> = {
  order_received: "მიღებულია",
  confirmed: "დადასტურებულია",
  production_queued: "წარმოება დაწყებულია",
  in_production: "წარმოებაშია",
  quality_check: "ხარისხის კონტროლი",
  ready_for_delivery: "მზადაა საკურიეროსთვის",
  out_for_delivery: "გადაეცა საკურიეროს",
  delivered: "მიწოდებულია",
  cancelled: "გაუქმებულია",
};

export const printerStatusLabels: Record<string, string> = {
  offline: "ოფლაინ",
  idle: "თავისუფალი",
  busy: "დაკავებული",
  paused: "შეჩერებული",
  maintenance: "მომსახურება",
  error: "შეცდომა",
};
