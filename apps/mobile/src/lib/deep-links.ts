const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseHoomaDeepLink(value: string) {
  try {
    const url = new URL(value);
    const customScheme = url.protocol === "hooma:";
    const universalLink = url.protocol === "https:"
      && ["hooma.ge", "www.hooma.ge"].includes(url.hostname);
    if (!customScheme && !universalLink) return null;
    const path = customScheme
      ? `/${[url.hostname, url.pathname.replace(/^\/+/, "")].filter(Boolean).join("/")}`
      : url.pathname;
    if (path === "/auth/callback") return { route: "auth_callback" as const };
    if (path === "/mobile/payment/result") {
      const orderId = url.searchParams.get("order") ?? "";
      return uuidPattern.test(orderId)
        ? { route: "payment_result" as const, orderId }
        : null;
    }
    if (path === "/mobile/hooma-plus/result") {
      const purchaseId = url.searchParams.get("purchase") ?? "";
      return uuidPattern.test(purchaseId)
        ? { route: "hooma_plus_result" as const, purchaseId }
        : null;
    }
    return null;
  } catch {
    return null;
  }
}
